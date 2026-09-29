'use strict';
// Serves the built web app (server-ui/) with the headers from vercel.json, for the browser tests.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'server-ui');
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.avif':'image/avif', '.mp4':'video/mp4', '.woff2':'font/woff2', '.md':'text/markdown', '.txt':'text/plain'};
const headers = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'vercel.json'), 'utf8')).headers.flatMap(rule => rule.headers);

function serve(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    for (const h of headers) res.setHeader(h.key, h.value);
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(r => server.close(r))}));
  });
}

module.exports = {serve};
