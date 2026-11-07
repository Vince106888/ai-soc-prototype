#!/bin/sh
set -eu
app_password=$(cat /run/secrets/app_database_password)
case "$app_password" in ''|*[!0-9a-f]*) echo 'Invalid application database secret' >&2; exit 1;; esac
[ "${#app_password}" -eq 64 ] || exit 1
# Values are generated hexadecimal; no secrets enter command arguments or logs.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE lindabiz_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '$app_password';
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO lindabiz_app;
GRANT USAGE, CREATE ON SCHEMA public TO lindabiz_app;
SQL
