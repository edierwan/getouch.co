FROM debian:12-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    nginx \
    openssl \
    php8.2 \
    php8.2-cli \
    php8.2-curl \
    php8.2-fpm \
    php8.2-gd \
    php8.2-imap \
    php8.2-mbstring \
    php8.2-odbc \
    php8.2-pgsql \
    php8.2-sqlite3 \
    php8.2-xml \
    php8.2-zip \
    postgresql-client \
    python3 \
    wget \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/fusionpbx /var/cache/fusionpbx /var/run/fusionpbx /var/www /run/php \
  && git clone --depth=1 --branch 5.5 https://github.com/fusionpbx/fusionpbx.git /var/www/fusionpbx \
  && chown -R www-data:www-data /etc/fusionpbx /var/cache/fusionpbx /var/run/fusionpbx /var/www/fusionpbx

COPY nginx.conf /etc/nginx/sites-available/fusionpbx
COPY entrypoint.sh /usr/local/bin/getouch-fusionpbx-entrypoint.sh

RUN rm -f /etc/nginx/sites-enabled/default \
  && ln -s /etc/nginx/sites-available/fusionpbx /etc/nginx/sites-enabled/fusionpbx \
  && chmod +x /usr/local/bin/getouch-fusionpbx-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/getouch-fusionpbx-entrypoint.sh"]