#!/bin/sh

set -eu

: "${VOICE_DB_HOST:=postgres}"
: "${VOICE_DB_PORT:=5432}"
: "${VOICE_DB_NAME:=voice}"
: "${VOICE_DB_USER:=getouch}"
: "${VOICE_DB_PASSWORD:=}"
: "${FUSIONPBX_DOMAIN:=pbx.getouch.co}"
: "${FUSIONPBX_EVENT_SOCKET_HOST:=voice-freeswitch}"
: "${FUSIONPBX_EVENT_SOCKET_PORT:=8021}"
: "${FUSIONPBX_EVENT_SOCKET_PASSWORD:=}"
: "${FUSIONPBX_ADMIN_USERNAME:=admin}"
: "${FUSIONPBX_ADMIN_PASSWORD:=}"
: "${FUSIONPBX_XML_CDR_USERNAME:=xmlcdr}"
: "${FUSIONPBX_XML_CDR_PASSWORD:=}"
: "${FUSIONPBX_RTP_START_PORT:=16384}"
: "${FUSIONPBX_RTP_END_PORT:=16415}"
: "${FUSIONPBX_EXTERNAL_SIP_IP:=}"
: "${FUSIONPBX_EXTERNAL_RTP_IP:=}"

if [ -z "$VOICE_DB_PASSWORD" ] || [ -z "$FUSIONPBX_EVENT_SOCKET_PASSWORD" ] || [ -z "$FUSIONPBX_ADMIN_PASSWORD" ] || [ -z "$FUSIONPBX_XML_CDR_PASSWORD" ]; then
  echo "Required FusionPBX voice secrets are missing." >&2
  exit 1
fi

mkdir -p \
  /etc/fusionpbx \
  /etc/freeswitch \
  /run/php \
  /usr/share/freeswitch/scripts \
  /usr/share/freeswitch/sounds \
  /var/cache/fusionpbx \
  /var/lib/freeswitch/db \
  /var/lib/freeswitch/recordings \
  /var/lib/freeswitch/storage \
  /var/run/fusionpbx

if [ ! -f /etc/freeswitch/freeswitch.xml ]; then
  cp -a /var/www/fusionpbx/app/switch/resources/conf/. /etc/freeswitch/
fi

python3 <<'PY'
import html
import os
import re
from pathlib import Path

db_host = os.environ["VOICE_DB_HOST"]
db_port = os.environ["VOICE_DB_PORT"]
db_name = os.environ["VOICE_DB_NAME"]
db_user = os.environ["VOICE_DB_USER"]
db_password = os.environ["VOICE_DB_PASSWORD"]
domain = os.environ["FUSIONPBX_DOMAIN"]
event_socket_host = os.environ["FUSIONPBX_EVENT_SOCKET_HOST"]
event_socket_port = os.environ["FUSIONPBX_EVENT_SOCKET_PORT"]
event_socket_password = os.environ["FUSIONPBX_EVENT_SOCKET_PASSWORD"]
xml_cdr_username = os.environ["FUSIONPBX_XML_CDR_USERNAME"]
xml_cdr_password = os.environ["FUSIONPBX_XML_CDR_PASSWORD"]
rtp_start = os.environ["FUSIONPBX_RTP_START_PORT"]
rtp_end = os.environ["FUSIONPBX_RTP_END_PORT"]
external_sip_ip = os.environ.get("FUSIONPBX_EXTERNAL_SIP_IP", "")
external_rtp_ip = os.environ.get("FUSIONPBX_EXTERNAL_RTP_IP", "")

config = f"""#database system settings
database.0.type = pgsql
database.0.host = {db_host}
database.0.port = {db_port}
database.0.sslmode = prefer
database.0.name = {db_name}
database.0.username = {db_user}
database.0.password = {db_password}

#database switch settings
database.1.type = pgsql
database.1.host = {db_host}
database.1.port = {db_port}
database.1.sslmode = prefer
database.1.name = {db_name}
database.1.username = {db_user}
database.1.password = {db_password}

#general settings
document.root = /var/www/fusionpbx
project.path =
temp.dir = /tmp
php.dir = /usr/bin
php.bin = php

#switch settings
switch.conf.dir = /etc/freeswitch
switch.sounds.dir = /usr/share/freeswitch/sounds
switch.scripts.dir = /usr/share/freeswitch/scripts
switch.database.dir = /var/lib/freeswitch/db
switch.recordings.dir = /var/lib/freeswitch/recordings
switch.storage.dir = /var/lib/freeswitch/storage
switch.voicemail.dir = /var/lib/freeswitch/storage/voicemail
switch.event_socket.host = {event_socket_host}
switch.event_socket.port = {event_socket_port}
switch.event_socket.password = {event_socket_password}
event_socket.ip_address = {event_socket_host}
event_socket.port = {event_socket_port}
event_socket.password = {event_socket_password}
"""
Path("/etc/fusionpbx/config.conf").write_text(config)

def replace_text(path: str, old: str, new: str):
    file_path = Path(path)
    text = file_path.read_text()
    if old in text:
        file_path.write_text(text.replace(old, new))

def replace_regex(path: str, pattern: str, repl: str, flags: int = 0):
    file_path = Path(path)
    text = file_path.read_text()
    new_text, _count = re.subn(pattern, repl, text, flags=flags)
    file_path.write_text(new_text)

replace_regex(
    "/etc/freeswitch/autoload_configs/event_socket.conf.xml",
    r'(<param name="listen-ip" value=")[^"]*("/>)',
    r'\g<1>0.0.0.0\2',
)
replace_regex(
    "/etc/freeswitch/autoload_configs/event_socket.conf.xml",
    r'(<param name="password" value=")[^"]*("/>)',
    rf'\g<1>{html.escape(event_socket_password, quote=True)}\2',
)

replace_text(
    "/etc/freeswitch/autoload_configs/db.conf.xml",
    '<!--<param name="odbc-dsn" value="$${dsn}"/>-->',
    '<param name="odbc-dsn" value="$${dsn}"/>',
)
replace_text(
    "/etc/freeswitch/autoload_configs/fifo.conf.xml",
    '<!--<param name="odbc-dsn" value="$${dsn}"/>-->',
    '<param name="odbc-dsn" value="$${dsn}"/>',
)
replace_text(
    "/etc/freeswitch/autoload_configs/switch.conf.xml",
    '<!-- <param name="core-db-dsn" value="$${dsn}" /> -->',
    '<param name="core-db-dsn" value="$${dsn}" />',
)
replace_text(
    "/etc/freeswitch/autoload_configs/switch.conf.xml",
    '<!-- <param name="auto-create-schemas" value="true"/> -->',
    '<param name="auto-create-schemas" value="true"/>',
)
replace_text(
    "/etc/freeswitch/autoload_configs/switch.conf.xml",
    '<param name="auto-create-schemas" value="false"/>',
    '<param name="auto-create-schemas" value="true"/>',
)
replace_regex(
    "/etc/freeswitch/autoload_configs/switch.conf.xml",
    r'<!-- <param name="rtp-start-port" value="[^"]*"/> -->',
    f'<param name="rtp-start-port" value="{rtp_start}"/>',
)
replace_regex(
    "/etc/freeswitch/autoload_configs/switch.conf.xml",
    r'<!-- <param name="rtp-end-port" value="[^"]*"/> -->',
    f'<param name="rtp-end-port" value="{rtp_end}"/>',
)

xml_cdr_path = Path("/etc/freeswitch/autoload_configs/xml_cdr.conf.xml")
xml_cdr_text = xml_cdr_path.read_text()
xml_cdr_text = xml_cdr_text.replace('{v_http_protocol}', 'http')
xml_cdr_text = xml_cdr_text.replace('{domain_name}', 'voice-fusionpbx:8080')
xml_cdr_text = xml_cdr_text.replace('{v_project_path}', '')
xml_cdr_text = xml_cdr_text.replace('{v_user}', xml_cdr_username)
xml_cdr_text = xml_cdr_text.replace('{v_pass}', xml_cdr_password)
xml_cdr_path.write_text(xml_cdr_text)

managed_lines = [
    '<!-- GETOUCH VOICE MANAGED START -->',
    f'<X-PRE-PROCESS cmd="set" data="domain={html.escape(domain, quote=True)}" />',
    f'<X-PRE-PROCESS cmd="set" data="event_socket_password={html.escape(event_socket_password, quote=True)}" />',
    f'<X-PRE-PROCESS cmd="set" data="dsn_system=pgsql://host={html.escape(db_host, quote=True)} port={html.escape(db_port, quote=True)} dbname={html.escape(db_name, quote=True)} user={html.escape(db_user, quote=True)} password={html.escape(db_password, quote=True)} options=" />',
    f'<X-PRE-PROCESS cmd="set" data="dsn=pgsql://host={html.escape(db_host, quote=True)} port={html.escape(db_port, quote=True)} dbname={html.escape(db_name, quote=True)} user={html.escape(db_user, quote=True)} password={html.escape(db_password, quote=True)} options=" />',
    f'<X-PRE-PROCESS cmd="set" data="dsn_callcenter=pgsql://host={html.escape(db_host, quote=True)} port={html.escape(db_port, quote=True)} dbname={html.escape(db_name, quote=True)} user={html.escape(db_user, quote=True)} password={html.escape(db_password, quote=True)} options=" />',
]
if external_rtp_ip:
    managed_lines.append(f'<X-PRE-PROCESS cmd="set" data="external_rtp_ip={html.escape(external_rtp_ip, quote=True)}" />')
if external_sip_ip:
    managed_lines.append(f'<X-PRE-PROCESS cmd="set" data="external_sip_ip={html.escape(external_sip_ip, quote=True)}" />')
managed_lines.append('<!-- GETOUCH VOICE MANAGED END -->')
managed_block = "\n".join(managed_lines)

vars_path = Path("/etc/freeswitch/vars.xml")
vars_text = vars_path.read_text()
start = '<!-- GETOUCH VOICE MANAGED START -->'
end = '<!-- GETOUCH VOICE MANAGED END -->'
if start in vars_text and end in vars_text:
    vars_text = re.sub(re.escape(start) + r'.*?' + re.escape(end), managed_block, vars_text, flags=re.S)
else:
    vars_text = vars_text.replace('</include>', managed_block + '\n</include>')
vars_path.write_text(vars_text)
PY

chown -R www-data:www-data /etc/fusionpbx /etc/freeswitch /usr/share/freeswitch/scripts /var/cache/fusionpbx /var/lib/freeswitch /var/run/fusionpbx /var/www/fusionpbx

export PGPASSWORD="$VOICE_DB_PASSWORD"
until psql -h "$VOICE_DB_HOST" -p "$VOICE_DB_PORT" -U "$VOICE_DB_USER" -d "$VOICE_DB_NAME" -c 'select 1' >/dev/null 2>&1; do
  sleep 2
done

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

psql -h "$VOICE_DB_HOST" -p "$VOICE_DB_PORT" -U "$VOICE_DB_USER" -d "$VOICE_DB_NAME" -c 'create extension if not exists pgcrypto;' >/dev/null 2>&1 || true

if [ "$(psql -h "$VOICE_DB_HOST" -p "$VOICE_DB_PORT" -U "$VOICE_DB_USER" -d "$VOICE_DB_NAME" -Atc "select to_regclass('public.v_domains') is not null")" != "t" ]; then
  php /var/www/fusionpbx/core/upgrade/upgrade.php --schema >/dev/null
fi

domain_name_sql="$(sql_escape "$FUSIONPBX_DOMAIN")"
admin_username_sql="$(sql_escape "$FUSIONPBX_ADMIN_USERNAME")"

domain_uuid="$(psql -h "$VOICE_DB_HOST" -p "$VOICE_DB_PORT" -U "$VOICE_DB_USER" -d "$VOICE_DB_NAME" -Atv ON_ERROR_STOP=1 -c "select domain_uuid from v_domains where domain_name = '$domain_name_sql' limit 1;")"
if [ -z "$domain_uuid" ]; then
  domain_uuid="$(php /var/www/fusionpbx/resources/uuid.php)"
  psql -h "$VOICE_DB_HOST" -p "$VOICE_DB_PORT" -U "$VOICE_DB_USER" -d "$VOICE_DB_NAME" -v ON_ERROR_STOP=1 -c "insert into v_domains (domain_uuid, domain_name, domain_enabled) values ('$domain_uuid', '$domain_name_sql', 'true');" >/dev/null
fi

php /var/www/fusionpbx/core/upgrade/upgrade.php --defaults >/dev/null || true

admin_exists="$(psql -h "$VOICE_DB_HOST" -p "$VOICE_DB_PORT" -U "$VOICE_DB_USER" -d "$VOICE_DB_NAME" -Atv ON_ERROR_STOP=1 -c "select count(*) from v_users where username = '$admin_username_sql' and domain_uuid = '$domain_uuid';")"
if [ "$admin_exists" = "0" ]; then
  user_uuid="$(php /var/www/fusionpbx/resources/uuid.php)"
  user_salt="$(php /var/www/fusionpbx/resources/uuid.php)"
  password_hash="$(php -r 'echo md5($argv[1].$argv[2]);' "$user_salt" "$FUSIONPBX_ADMIN_PASSWORD")"
  psql -h "$VOICE_DB_HOST" -p "$VOICE_DB_PORT" -U "$VOICE_DB_USER" -d "$VOICE_DB_NAME" -v ON_ERROR_STOP=1 -c "insert into v_users (user_uuid, domain_uuid, username, password, salt, user_enabled) values ('$user_uuid', '$domain_uuid', '$admin_username_sql', '$password_hash', '$user_salt', 'true');" >/dev/null

  group_uuid="$(psql -h "$VOICE_DB_HOST" -p "$VOICE_DB_PORT" -U "$VOICE_DB_USER" -d "$VOICE_DB_NAME" -Atc "select group_uuid from v_groups where group_name = 'superadmin' limit 1;")"
  if [ -n "$group_uuid" ]; then
    user_group_uuid="$(php /var/www/fusionpbx/resources/uuid.php)"
    psql -h "$VOICE_DB_HOST" -p "$VOICE_DB_PORT" -U "$VOICE_DB_USER" -d "$VOICE_DB_NAME" -v ON_ERROR_STOP=1 -c "insert into v_user_groups (user_group_uuid, domain_uuid, group_name, group_uuid, user_uuid) values ('$user_group_uuid', '$domain_uuid', 'superadmin', '$group_uuid', '$user_uuid');" >/dev/null
  fi
fi

php /var/www/fusionpbx/core/upgrade/upgrade.php --permissions >/dev/null || true
php /var/www/fusionpbx/core/upgrade/upgrade.php --services >/dev/null || true

php-fpm8.2 -D
exec nginx -g 'daemon off;'