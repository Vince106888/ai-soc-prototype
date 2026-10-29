"""Restore checks must never target or remove an existing application database."""

import hashlib
import json
from types import SimpleNamespace

import pytest

from scripts import backup


def archive(tmp_path):
    path = tmp_path / "test.dump"
    path.write_bytes(b"controlled-test-backup")
    path.with_suffix(".json").write_text(
        json.dumps(
            {
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    )
    return path


def test_corrupt_backup_rejected_before_any_database_command(tmp_path, monkeypatch):
    path = archive(tmp_path)
    path.write_bytes(b"modified")
    monkeypatch.setattr(backup, "compose", lambda: pytest.fail("Database must not be touched"))
    with pytest.raises(RuntimeError, match="checksum"):
        backup.verify(path)


@pytest.mark.parametrize("fail_restore", [True, False])
def test_restore_uses_and_cleans_only_new_database(tmp_path, monkeypatch, fail_restore):
    path = archive(tmp_path)
    commands = []
    monkeypatch.setattr(backup, "compose", lambda: (["compose"], {}))

    def execute(command, env, **kwargs):
        commands.append(command)
        if fail_restore and "pg_restore" in command[6]:
            raise RuntimeError("Synthetic restore failure")
        return SimpleNamespace(stdout=b'{"accounts":1,"signals":5,"incidents":4}')

    monkeypatch.setattr(backup, "execute", execute)
    if fail_restore:
        with pytest.raises(RuntimeError, match="Synthetic"):
            backup.verify(path)
    else:
        assert backup.verify(path)["original_database_untouched"]
    name = commands[0][-1]
    assert name.startswith("restorecheck_")
    assert commands[1][-1] == name
    assert "dropdb" in commands[-1][6]
    assert commands[-1][-1] == name
    assert path.read_bytes() == b"controlled-test-backup"


def test_partial_backup_removed_on_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(backup, "ROOT", tmp_path)
    monkeypatch.setattr(backup, "compose", lambda: (["compose"], {}))

    def execute(command, env, **kwargs):
        kwargs["stdout"].write(b"partial")
        raise RuntimeError("Synthetic backup failure")

    monkeypatch.setattr(backup, "execute", execute)
    with pytest.raises(RuntimeError, match="Synthetic"):
        backup.create()
    assert list((tmp_path / "data/backups").iterdir()) == []
