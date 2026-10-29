"""Initialize, validate and operate a standalone public VPS deployment.

Only the explicit --test-local initialization uses a loopback, private-CA TLS
acceptance origin. Normal initialization requires the operator's chosen domain.
"""

import argparse
import base64
import json
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deployment import DeploymentError, public_origin
from scripts.run import ROOT, find_docker


def initialise(directory: Path, origin: str, client_file: Path, contact: str, test_local=False):
    origin = public_origin(origin)
    if test_local and (
        not urlsplit(origin).hostname.endswith(".test") or urlsplit(origin).port != 8443
    ):
        raise ValueError("Local TLS acceptance requires a .test origin on port 8443.")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", contact):
        raise ValueError("An operator support email is required.")
    try:
        client = json.loads(client_file.read_text(encoding="utf-8"))["web"]
        client_id, client_secret = client["client_id"], client["client_secret"]
        if not all(
            isinstance(value, str) and value and "\n" not in value
            for value in (client_id, client_secret)
        ):
            raise ValueError
    except (ValueError, KeyError, TypeError, OSError):
        raise ValueError(
            "Read a Google Web OAuth client JSON file supplied by the operator."
        ) from None
    if origin + "/api/v1/auth/callback" not in client.get("redirect_uris", []):
        raise ValueError(
            "Register the HTTPS sign-in callback and download updated Web client JSON."
        )
    directory = directory.resolve()
    directory.mkdir(parents=True, exist_ok=False, mode=0o700)
    secret_dir = directory / "secrets"
    secret_dir.mkdir(mode=0o700)
    material = {
        "admin-database-password": secrets.token_hex(32),
        "app-database-password": secrets.token_hex(32),
        "token-key": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
        "google-client-secret": client_secret,
    }
    for name, value in material.items():
        path = secret_dir / name
        path.write_text(value, encoding="utf-8")
        # Private parent 0700 protects host access; mounted files are readable by
        # distinct non-root API/PostgreSQL container users (Compose bind secrets).
        path.chmod(0o444)
    values = {
        "AI_SOC_PROJECT": "sentinelsme-public-acceptance"
        if test_local
        else "sentinelsme-production",
        "AI_SOC_PUBLIC_ORIGIN": origin,
        "AI_SOC_PUBLIC_HOST": urlsplit(origin).hostname,
        "AI_SOC_OPERATOR_CONTACT": contact,
        "AI_SOC_GOOGLE_CLIENT_ID": client_id,
        "AI_SOC_SECRETS_DIR": secret_dir.as_posix(),
        "AI_SOC_GMAIL_ENABLED": "false",
        "AI_SOC_EVIDENCE_RETENTION_DAYS": "30",
        "AI_SOC_EXPLAINER": "off",
    }
    if test_local:
        values.update(
            AI_SOC_BIND_ADDRESS="127.0.0.1",
            AI_SOC_HTTP_PORT="8088",
            AI_SOC_HTTPS_PORT="8443",
            AI_SOC_CADDYFILE=(ROOT / "deploy/Caddyfile.test").as_posix(),
            AI_SOC_PROXY_SUBNET="172.31.255.0/24",
        )
    path = directory / "deployment.env"
    path.write_text(
        "".join(f"{name}={value}\n" for name, value in values.items()), encoding="utf-8"
    )
    path.chmod(0o600)
    print("Private deployment configuration created. Existing credentials were not overwritten.")


def connection(directory: Path):
    path = directory.resolve() / "deployment.env"
    values = dict(
        line.split("=", 1)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line and not line.startswith("#") and "=" in line
    )
    public_origin(values.get("AI_SOC_PUBLIC_ORIGIN", ""))
    if not re.fullmatch(r"sentinelsme-[a-z0-9_-]{1,50}", values.get("AI_SOC_PROJECT", "")):
        raise ValueError("Use a dedicated sentinelsme-... production project name.")
    docker = find_docker()
    if not docker:
        raise ValueError("Install and start Docker Engine with the Compose plugin first.")
    base = [
        docker,
        "compose",
        "--project-name",
        values["AI_SOC_PROJECT"],
        "--env-file",
        str(path),
        "-f",
        str(ROOT / "compose.production.yaml"),
    ]
    if values.get("AI_SOC_EXPLAINER") == "ollama":
        base += ["-f", str(ROOT / "compose.production.ollama.yaml")]
    # The private deployment file owns its settings; inherited local demo
    # environment cannot silently change a production origin or database key.
    env = {key: value for key, value in os.environ.items() if not key.startswith("AI_SOC_")}
    return base, env, values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command", choices=["init", "validate", "up", "down", "status", "backup", "verify-backup"]
    )
    parser.add_argument(
        "--directory", type=Path, default=Path.home() / ".config/sentinelsme/production"
    )
    parser.add_argument("--origin")
    parser.add_argument("--google-client-file", type=Path)
    parser.add_argument("--contact")
    parser.add_argument("--test-local", action="store_true")
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--no-build", action="store_true")
    args = parser.parse_args()
    if args.command == "init":
        if not all((args.origin, args.google_client_file, args.contact)):
            parser.error("init requires --origin, --google-client-file and --contact")
        initialise(
            args.directory, args.origin, args.google_client_file, args.contact, args.test_local
        )
        return
    base, env, values = connection(args.directory)

    def run(*arguments):
        subprocess.run([*base, *arguments], cwd=ROOT, env=env, check=True)

    run("config", "--quiet")
    if args.command == "validate":
        print("Compose configuration validated. Live TLS and Google consent need separate checks.")
    elif args.command == "up":
        run("up", "--wait", "--wait-timeout", "240", "--no-build" if args.no_build else "--build")
        if values.get("AI_SOC_EXPLAINER") == "ollama":
            run("exec", "-T", "ollama", "ollama", "pull", "qwen2.5:3b")
        print("Services started. Verify HTTPS and Google sign-in before public launch.")
    elif args.command == "status":
        run("ps")
    elif args.command == "down":
        run("down")  # Never discard retained production volumes.
    else:
        from scripts.backup import create, verify

        if args.command == "backup":
            archive = create(connection=(base, env), directory=args.directory / "backups")
            print(f"Private backup: {archive}")
        elif args.archive:
            print(
                json.dumps(
                    verify(
                        args.archive, connection=(base, env), application_role="sentinelsme_app"
                    ),
                    indent=2,
                )
            )
        else:
            parser.error("verify-backup requires --archive")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, DeploymentError) as exc:
        raise SystemExit(str(exc)) from None
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.returncode) from None
