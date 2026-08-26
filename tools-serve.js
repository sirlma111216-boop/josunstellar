/* 개발용 정적 서버 (수업 배포에는 불필요 — GitHub Pages 등에 그대로 올리면 됨) */
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = Number(process.argv[2] || 8123);
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.md':'text/markdown; charset=utf-8' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}).end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, () => console.log('serving ' + root + ' on http://localhost:' + port));
