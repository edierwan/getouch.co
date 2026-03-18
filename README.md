# getouch.co

Production landing app for getouch.co.

## Stack

- Next.js 16
- React 19
- Docker multi-stage build

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Container

```bash
docker build -t getouch-co .
docker run --rm -p 3000:80 getouch-co
```

### VPS Access
ssh deploy@100.84.14.93 / Turun@2020