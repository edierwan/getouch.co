import http from 'node:http';

const port = Number(process.env.PORT || 3001);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Getouch WA Service</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #0f172a; color: #e2e8f0; }
      main { max-width: 48rem; margin: 0 auto; }
      h1 { margin-bottom: 0.5rem; }
      p { color: #cbd5e1; line-height: 1.6; }
      code { background: #111827; padding: 0.2rem 0.4rem; border-radius: 0.35rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Getouch WhatsApp service baseline</h1>
      <p>This hostname is reserved for the WhatsApp and Baileys layer. The container is live, routable, and ready for the production service implementation.</p>
      <p>Health endpoint: <code>/healthz</code></p>
    </main>
  </body>
</html>`;

const server = http.createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'getouch-wa-baseline' }));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`WA baseline listening on ${port}`);
});