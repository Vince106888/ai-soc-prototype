"""Portable local/Compose launcher. Run from any working directory; no secrets printed."""

import argparse
import json
import os
import secrets
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def find_docker() -> str | None:
    found = shutil.which("docker")
    if found:
        return found
    if os.name == "nt":
        for root, suffix in (
            (os.getenv("LOCALAPPDATA"), "Programs/DockerDesktop/resources/bin/docker.exe"),
            (os.getenv("ProgramFiles"), "Docker/Docker/resources/bin/docker.exe"),
        ):
            if root and (candidate := Path(root) / suffix).is_file():
                return str(candidate)
    return None


def doctor(port: int) -> dict:
    docker = find_docker()
    ready = False
    if docker:
        try:
            result = subprocess.run(
                [docker, "version", "--format", "{{.Server.Version}}"],
                capture_output=True,
                timeout=15,
                check=False,
            )
            ready = result.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            pass
    free = shutil.disk_usage(ROOT).free
    return {
        "docker_cli_found": bool(docker),
        "docker_engine_ready": ready,
        "free_disk_gib": round(free / 1024**3, 2),
        "build_disk_headroom": free >= 5 * 1024**3,
        "dashboard_built": (ROOT / "frontend/dist/index.html").is_file(),
        "deployment_env_exists": (ROOT / "data/docker.env").is_file(),
        "dashboard_url": f"http://127.0.0.1:{port}",
    }


def run(*args: str, env: dict[str, str] | None = None) -> None:
    subprocess.run(args, cwd=ROOT, env=env, check=True)


def docker_environment() -> dict[str, str]:
    path = ROOT / "data" / "docker.env"
    path.parent.mkdir(exist_ok=True)
    if not path.exists():
        # Exclusive creation preserves existing credentials and volume compatibility.
        with path.open("x", encoding="utf-8") as stream:
            stream.write(
                f"AI_SOC_API_KEY={secrets.token_hex(32)}\n"
                f"POSTGRES_PASSWORD={secrets.token_hex(32)}\n"
                "AI_SOC_AUTH_MODE=local\nAI_SOC_EXPLAINER=off\n"
                "AI_SOC_GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/api/v1/gmail/callback\n"
                "AI_SOC_GOOGLE_LOGIN_REDIRECT_URI=http://127.0.0.1:8000/api/v1/auth/callback\n"
            )
        path.chmod(0o600)
    return {**os.environ, "AI_SOC_ENV_FILE": str(path)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["local", "docker", "down", "check", "doctor"])
    parser.add_argument("--model", action="store_true", help="Enable optional loopback Ollama")
    parser.add_argument("--demo", action="store_true", help="Seed synthetic tenant demo")
    parser.add_argument("--skip-build", action="store_true", help="Reuse existing dashboard/image")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    if args.command == "doctor":
        print(json.dumps(doctor(args.port), indent=2))
        return
    if args.command == "local":
        if not shutil.which("uv"):
            parser.error("Install uv first, or use Docker Desktop and the docker command.")
        env = dict(os.environ)
        env["AI_SOC_EXPLAINER"] = "ollama" if args.model else "off"
        if args.demo:
            # Never seed the operator's existing database or enable mailbox collection.
            (ROOT / "data").mkdir(exist_ok=True)
            env.update(
                AI_SOC_DATABASE_URL="sqlite:///data/portable-demo.db", AI_SOC_AUTH_MODE="local"
            )
        run("uv", "sync", "--frozen", env=env)
        if not args.skip_build:
            npm = shutil.which("npm")
            if not npm:
                parser.error("Install Node.js/npm, or use --skip-build with an existing build.")
            run(npm, "--prefix", "frontend", "ci", env=env)
            run(npm, "--prefix", "frontend", "run", "build", env=env)
        if not (ROOT / "frontend/dist/index.html").is_file():
            parser.error("Dashboard build missing; rerun without --skip-build.")
        if args.demo:
            run("uv", "run", "python", "-m", "app.demo", "--tenant", "demo", env=env)
        print(f"Open http://127.0.0.1:{args.port}; Ctrl+C stops the server.", flush=True)
        run(
            "uv",
            "run",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(args.port),
            "--no-access-log",
            "--no-proxy-headers",
            env=env,
        )
        return
    docker = find_docker()
    if not docker:
        parser.error("Docker CLI missing. Install and start Docker Desktop first.")
    if (
        args.command == "docker"
        and not args.skip_build
        and shutil.disk_usage(ROOT).free < 5 * 1024**3
    ):
        parser.error(
            "Keep at least 5 GiB free on the checkout drive before starting a Docker build."
        )
    env = docker_environment()
    env["AI_SOC_PORT"] = str(args.port)
    compose = [docker, "compose", "--env-file", env["AI_SOC_ENV_FILE"], "-f", "compose.yaml"]
    if args.model:
        compose += ["-f", "compose.ollama.yaml"]
    local_google = ROOT / "data/compose.google.json"
    if local_google.is_file():
        compose += ["-f", str(local_google)]
    if args.command == "down":
        run(*compose, "down", env=env)  # Named data volumes are deliberately retained.
    elif args.command == "check":
        if local_google.is_file():
            run(
                *compose,
                "exec",
                "-T",
                "api",
                "python",
                "-c",
                "from app import auth, gmail; "
                "assert auth.configuration()['configured']; "
                "assert gmail.configuration_status()['configured']; "
                "print('Google configuration ready; complete consent in the browser.')",
                env=env,
            )
        else:
            run(*compose, "exec", "-T", "api", "python", "scripts/smoke.py", env=env)
    else:
        run(docker, "info", "--format", "Docker engine {{.ServerVersion}}", env=env)
        run(
            *compose,
            "up",
            "--wait",
            "--wait-timeout",
            "180",
            *(["--no-build"] if args.skip_build else ["--build"]),
            env=env,
        )
        if args.model:
            run(*compose, "exec", "-T", "ollama", "ollama", "pull", "qwen2.5:3b", env=env)
        if args.demo:
            run(
                *compose,
                "exec",
                "-T",
                "api",
                "python",
                "-m",
                "app.demo",
                "--tenant",
                "demo",
                env=env,
            )
        if local_google.is_file():
            print(f"Open http://127.0.0.1:{args.port} and sign in with Google.")
            print("The Web OAuth client must register this port's sign-in and Gmail callbacks.")
        else:
            run(*compose, "exec", "-T", "api", "python", "scripts/smoke.py", env=env)
            print(
                f"Open http://127.0.0.1:{args.port}. "
                "Deployment key: data/docker.env (keep private)."
            )
            print("Choose 'Open an existing local workspace'; workspace demo if seeded.")


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, KeyboardInterrupt) as exc:
        raise SystemExit(getattr(exc, "returncode", 130)) from None
