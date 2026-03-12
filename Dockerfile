FROM nginx:1.29-alpine
COPY out /usr/share/nginx/html
EXPOSE 80