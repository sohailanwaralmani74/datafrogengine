import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const HOST = '0.0.0.0';

// Build site initially
buildSite();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

const server = http.createServer((req, res) => {
  // Always rebuild on demand for dynamic preview updates
  try {
    buildSite();
  } catch (err) {
    console.error('Error rebuilding Jekyll site:', err);
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname;

  // Enforce Jekyll clean URLs: redirect if URL ends with trailing slash (except root)
  if (pathname.length > 1 && pathname.endsWith('/')) {
    const cleanPath = pathname.slice(0, -1) + url.search;
    res.writeHead(301, { 'Location': cleanPath });
    res.end();
    return;
  }

  // Enforce Jekyll clean URLs: redirect if URL ends with .html (except /index.html if direct access)
  if (pathname.endsWith('.html') && pathname !== '/index.html') {
    const cleanPath = pathname.replace(/\.html$/, '') + url.search;
    res.writeHead(301, { 'Location': cleanPath });
    res.end();
    return;
  }

  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const siteDir = path.join(__dirname, '_site');
  const filePath = path.join(siteDir, pathname);

  // Security check: ensure path is within siteDir
  if (!filePath.startsWith(siteDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 1. Check if clean URL matches a .html file in _site (e.g. /pages/pdf -> /pages/pdf.html)
      const htmlCandidate = filePath + '.html';
      if (fs.existsSync(htmlCandidate) && fs.statSync(htmlCandidate).isFile()) {
        serveFile(htmlCandidate, res);
        return;
      }

      // 2. If folder, try index.html inside
      const fallbackIndex = path.join(filePath, 'index.html');
      if (fs.existsSync(fallbackIndex)) {
        serveFile(fallbackIndex, res);
      } else {
        serve404(siteDir, res);
      }
      return;
    }

    serveFile(filePath, res);
  });
});

function serve404(siteDir, res) {
  const notFoundPage = path.join(siteDir, '404.html');
  if (fs.existsSync(notFoundPage)) {
    serveFile(notFoundPage, res, 404);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
}

function serveFile(file, res, statusCode = 200) {
  const ext = path.extname(file).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }

    res.writeHead(statusCode, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(data);
  });
}

server.listen(PORT, HOST, () => {
  console.log(`Jekyll dev server running at http://${HOST}:${PORT}/`);
});
