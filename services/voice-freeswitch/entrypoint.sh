#!/bin/sh

set -eu

mkdir -p /etc/freeswitch /usr/share/freeswitch/scripts /usr/share/freeswitch/sounds /var/lib/freeswitch

if [ -d /opt/getouch-defaults/sounds ] && [ -z "$(find /usr/share/freeswitch/sounds -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
  cp -a /opt/getouch-defaults/sounds/. /usr/share/freeswitch/sounds/
fi

if [ ! -f /etc/freeswitch/freeswitch.xml ] && [ -d /opt/getouch-defaults/vanilla ]; then
  cp -a /opt/getouch-defaults/vanilla/. /etc/freeswitch/
fi

exec /docker-entrypoint.sh