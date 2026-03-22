FROM node:20-alpine
RUN apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev vips-dev
WORKDIR /opt/app
COPY package.json ./
RUN npm install
COPY . .
RUN mkdir -p public/uploads
RUN NODE_ENV=production npm run build
EXPOSE 1337
CMD ["npm", "run", "start"]
