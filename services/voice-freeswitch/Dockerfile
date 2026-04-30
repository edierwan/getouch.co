FROM safarov/freeswitch:latest

RUN mkdir -p /opt/getouch-defaults \
  && cp -a /usr/share/freeswitch/conf/vanilla /opt/getouch-defaults/vanilla \
  && cp -a /usr/share/freeswitch/sounds /opt/getouch-defaults/sounds

COPY entrypoint.sh /usr/local/bin/getouch-freeswitch-entrypoint.sh

RUN chmod +x /usr/local/bin/getouch-freeswitch-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/getouch-freeswitch-entrypoint.sh"]