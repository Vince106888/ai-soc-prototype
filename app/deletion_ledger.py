"""Durable deletion receipts outside database backups; contains only opaque tenant IDs."""

import hashlib
import os
from pathlib import Path

from sqlalchemy import select

from . import deployment
from .entities import AppUser


def directory() -> Path:
    value = os.getenv("AI_SOC_DELETION_LEDGER_DIR")
    if not value:
        raise deployment.DeploymentError("Production requires a persistent deletion ledger.")
    path = Path(value)
    if not path.is_dir():
        raise deployment.DeploymentError("The persistent deletion ledger is unavailable.")
    return path


def record(tenant: str) -> None:
    if not deployment.production():
        return
    if (
        not tenant
        or len(tenant) > 100
        or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in tenant)
    ):
        raise ValueError("Invalid opaque workspace identifier.")
    root = directory()
    path = root / (hashlib.sha256(tenant.encode()).hexdigest() + ".deleted")
    # Atomic same-directory rename and fsync: a successful deletion response must
    # survive database restoration. Never copy an incomplete temporary receipt.
    temporary = root / (path.name + "." + os.urandom(8).hex() + ".tmp")
    try:
        with temporary.open("x", encoding="ascii") as stream:
            temporary.chmod(0o600)
            stream.write(tenant)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        if os.name != "nt":
            descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


def reconcile(db) -> None:
    if not deployment.production():
        return
    from .retention import purge_workspace

    for path in directory().glob("*.deleted"):
        tenant = path.read_text(encoding="ascii")
        if len(tenant) > 100 or hashlib.sha256(tenant.encode()).hexdigest() != path.stem:
            raise deployment.DeploymentError("A deletion receipt failed integrity validation.")
        user = db.scalar(select(AppUser).where(AppUser.tenant_id == tenant).with_for_update())
        if user:
            user.status = "deleting"
            db.commit()
            purge_workspace(db, tenant)
