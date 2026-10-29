"""Private Compose backups and restoration checks in a separate temporary database.

Run from the checkout: python -m scripts.backup create
Then: python -m scripts.backup verify data/backups/<file>.dump
Only restore trusted operator-created backups. Provider encryption keys are separate.
"""

import argparse
import hashlib
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .run import ROOT, docker_environment, find_docker


def compose() -> tuple[list[str], dict[str, str]]:
    docker = find_docker()
    if not docker:
        raise RuntimeError("Install and start Docker Desktop first.")
    env = docker_environment()
    base = [docker, "compose", "--env-file", env["AI_SOC_ENV_FILE"], "-f", "compose.yaml"]
    local_google = ROOT / "data/compose.google.json"
    if local_google.is_file():
        base += ["-f", str(local_google)]
    return base, env


def db_command(base: list[str], command: str, *args: str) -> list[str]:
    return [*base, "exec", "-T", "db", "sh", "-c", command, "backup-tool", *args]


def execute(command, env, **kwargs):
    result = subprocess.run(command, cwd=ROOT, env=env, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        raise RuntimeError("Database operation failed; no provider data or credentials printed.")
    return result


def create(
    *, connection: tuple[list[str], dict[str, str]] | None = None, directory: Path | None = None
) -> Path:
    base, env = connection or compose()
    directory = directory or ROOT / "data/backups"
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    path = directory / f"sentinelsme-{stamp}-{uuid4().hex[:8]}.dump"
    created = False
    try:
        with path.open("xb") as stream:
            created = True
            path.chmod(0o600)
            execute(
                db_command(base, 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'),
                env,
                stdout=stream,
            )
        if not path.stat().st_size:
            raise RuntimeError("Database backup is empty.")
    except BaseException:
        if created:
            path.unlink(missing_ok=True)  # Only this invocation's exclusively-created partial file.
        raise
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    metadata = {
        "created_at": datetime.now(UTC).isoformat(),
        "sha256": digest,
        "bytes": path.stat().st_size,
        "provider_key_included": False,
    }
    path.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return path


def verify(
    path: Path,
    *,
    connection: tuple[list[str], dict[str, str]] | None = None,
    application_role: str | None = None,
) -> dict:
    path = path.resolve(strict=True)
    metadata = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != metadata["sha256"]:
            raise RuntimeError("Backup checksum mismatch; nothing restored.")
    base, env = connection or compose()
    # The caller cannot supply a target database. Never restore over retained evidence.
    name = "restorecheck_" + uuid4().hex
    created = False
    try:
        execute(
            db_command(base, 'createdb -U "$POSTGRES_USER" -O "$2" -- "$1"', name, application_role)
            if application_role
            else db_command(base, 'createdb -U "$POSTGRES_USER" -- "$1"', name),
            env,
            stdout=subprocess.DEVNULL,
        )
        created = True
        with path.open("rb") as stream:
            execute(
                db_command(
                    base,
                    'pg_restore -U "$POSTGRES_USER" --exit-on-error --no-owner '
                    '--no-privileges --dbname "$1"' + (' --role "$2"' if application_role else ""),
                    name,
                    *([application_role] if application_role else []),
                ),
                env,
                stdin=stream,
                stdout=subprocess.DEVNULL,
            )
        sql = (
            "SELECT json_build_object('schema_revision', (SELECT version_num FROM alembic_version),"
            " 'accounts', (SELECT count(*) FROM accounts),"
            " 'signals', (SELECT count(*) FROM signals),"
            " 'incidents', (SELECT count(*) FROM incidents),"
            " 'audit_records', (SELECT count(*) FROM audit_log))"
        )
        result = execute(
            db_command(
                base, 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -Atc "$2"', name, sql
            ),
            env,
            stdout=subprocess.PIPE,
        )
        counts = json.loads(result.stdout)
        return {"result": "passed", "restored": counts, "original_database_untouched": True}
    finally:
        if created:
            # Only the fresh database created above is removed, including on restore failure.
            execute(
                db_command(base, 'dropdb -U "$POSTGRES_USER" -- "$1"', name),
                env,
                stdout=subprocess.DEVNULL,
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["create", "verify"])
    parser.add_argument("path", nargs="?", type=Path)
    args = parser.parse_args()
    if args.command == "create":
        print(f"Private backup created: {create()}")
    elif args.path:
        print(json.dumps(verify(args.path), indent=2))
    else:
        parser.error("verify requires a trusted backup file path")


if __name__ == "__main__":
    main()
