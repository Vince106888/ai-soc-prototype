"""Controlled HTTPS acceptance against the local public deployment, without live Google calls."""

import http.client
import json
import socket
import ssl
import subprocess
from pathlib import Path

from .production import connection


def check(directory: Path) -> dict:
    base, env, values = connection(directory)
    if values.get("AI_SOC_PROJECT") != "sentinelsme-public-acceptance":
        raise ValueError("This acceptance check targets only the controlled local TLS stack.")
    certificate = subprocess.run(
        base + ["exec", "-T", "edge", "cat", "/data/caddy/pki/authorities/local/root.crt"],
        env=env,
        check=True,
        capture_output=True,
    ).stdout.decode("ascii")
    context = ssl.create_default_context(cadata=certificate)
    host = values["AI_SOC_PUBLIC_HOST"]

    def request(path, headers=None, method="GET", payload=None):
        transport = socket.create_connection(("127.0.0.1", 8443), timeout=15)
        channel = context.wrap_socket(transport, server_hostname=host)
        client = http.client.HTTPSConnection(host, 8443, timeout=15, context=context)
        client.sock = channel
        try:
            client.request(
                method,
                path,
                body=json.dumps(payload) if payload is not None else None,
                headers={"Content-Type": "application/json", **(headers or {})},
            )
            response = client.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            client.close()

    status, headers, body = request("/")
    assert status == 200 and b"<html" in body
    assert headers.get("Strict-Transport-Security")
    assert headers.get("Content-Security-Policy")
    assert request("/health/ready")[0] == 200
    status, _, body = request("/api/v1/auth/session")
    session = json.loads(body)
    assert status == 200 and session["mode"] == "google"
    assert session["configured"] and not session["invitation_only"] and not session["user"]
    assert request("/api/v1/accounts", {"X-Tenant-ID": "forged", "X-API-Key": "forged"})[0] == 401
    assert request("/openapi.json")[0] == 404
    redirect = http.client.HTTPConnection("127.0.0.1", 8088, timeout=15)
    try:
        redirect.request("GET", "/", headers={"Host": host})
        result = redirect.getresponse()
        assert result.status in {301, 308}
        assert result.getheader("Location") == values["AI_SOC_PUBLIC_ORIGIN"] + "/"
        result.read()
    finally:
        redirect.close()
    # Create synthetic opaque sessions through operator-only container access.
    # No bypass endpoint or test authentication mode exists in the application.
    fixture = """
import json,secrets
from datetime import timedelta
from app import database,auth,deployment
from app.entities import AppUser,AppSession,new_id,utcnow
assert deployment.public_origin().endswith('.test:8443')
identities=[]
with database.SessionLocal() as db:
    for number in range(2):
        user=AppUser(google_subject='acceptance-'+new_id(),email='acceptance@example.test',tenant_id='user-'+new_id())
        db.add(user); db.flush()
        token,csrf=secrets.token_urlsafe(48),secrets.token_urlsafe(48)
        db.add(AppSession(user_id=user.id,token_digest=auth.digest(token),csrf_digest=auth.digest(csrf),expires_at=utcnow()+timedelta(minutes=30)))
        identities.append({'token':token,'csrf':csrf})
    db.commit()
print(json.dumps(identities))
"""
    result = subprocess.run(
        base + ["exec", "-T", "api", "python", "-"],
        input=fixture,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    identities = json.loads(result.stdout)

    def authenticated(identity, method, path, expected=200, payload=None):
        headers = {
            "Cookie": "sentinelsme_session=" + identity["token"],
            "Origin": values["AI_SOC_PUBLIC_ORIGIN"],
            "X-CSRF-Token": identity["csrf"],
        }
        status, _, content = request(path, headers, method, payload)
        if status != expected:
            raise RuntimeError(f"Controlled public workflow: expected {expected}, got {status}")
        return json.loads(content) if content else None

    try:
        first, second = identities
        account = authenticated(
            first, "POST", "/api/v1/accounts", 201, {"email": "controlled@example.test"}
        )
        source = authenticated(
            first,
            "POST",
            f"/api/v1/accounts/{account['id']}/sources",
            201,
            {
                "name": "Controlled TLS acceptance",
                "external_id": "controlled",
                "capabilities": ["email"],
            },
        )
        path = f"/api/v1/sources/{source['id']}/signals"
        signal = {
            "external_id": "one",
            "signal_type": "email",
            "features": {
                "sender": "sender@example.test",
                "reply_to": "other@different.test",
                "subject": "Controlled example",
                "body": "TLS-PRIVATE-BODY Verify your account immediately.",
            },
        }
        ingested = authenticated(first, "POST", path, 201, {"signals": [signal]})
        assert ingested["imported_count"] == 1
        duplicate = authenticated(first, "POST", path, 201, {"signals": [signal]})
        assert duplicate["duplicate_count"] == 1
        case = "/api/v1/incidents/" + ingested["items"][0]["incident_ids"][0]
        detail = authenticated(first, "GET", case)
        assert detail["findings"] and detail["explanation"]["source"] == "template"
        assert "TLS-PRIVATE-BODY" not in json.dumps(detail)
        authenticated(second, "GET", case, 404)
        changed = authenticated(
            first,
            "PATCH",
            case + "/status",
            payload={"status": "under_review", "note": "Controlled acceptance", "actor": "forged"},
        )
        assert changed["status"] == "under_review"
        assert all(row.get("actor") != "forged" for row in changed["audit"])
        from .backup import create, verify

        archive = create(connection=(base, env), directory=directory / "backups")
        restored = verify(archive, connection=(base, env), application_role="sentinelsme_app")
        assert restored["restored"]["incidents"] >= 1
    finally:
        for identity in identities:
            authenticated(
                identity, "DELETE", "/api/v1/auth/account", 204, {"confirmation": "DELETE"}
            )
            authenticated(identity, "GET", "/api/v1/accounts", 401)
    return {
        "tls": "private CA verified; hostname verified; no OS trust changes",
        "dashboard": "passed",
        "readiness": "passed",
        "https_redirect": "passed",
        "security_headers": "passed",
        "public_signup_configuration": "passed",
        "unauthenticated_and_header_spoofing": "rejected",
        "synthetic_session_https_workflow": "ingestion, duplicates, review and isolation passed",
        "privacy": "message body excluded; actor supplied by server",
        "backup_restore": "non-empty synthetic evidence restored as restricted application role",
        "account_deletion": "both synthetic workspaces removed; sessions rejected",
        "live_google_signin": "requires operator Google client and chosen public domain",
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(check(args.directory), indent=2))
