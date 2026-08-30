/* 개발용 정적 서버 (수업 배포에는 불필요 — GitHub Pages 등에 그대로 올리면 됨) */
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'public'), port = Number(process.argv[2] || 8123);
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.md':'text/markdown; charset=utf-8' };
http.createServer((req, res) => {
  // 개발 편의: 브라우저에서 캘리브레이션 결과를 바로 파일로 저장
  // 개발 편의: 브라우저에서 줄인 이미지를 assets/ 에 저장
  if (req.method === 'POST' && req.url.indexOf('/save-asset') === 0) {
    const name = decodeURIComponent((req.url.split('name=')[1] || '').split('&')[0]);
    if (!/^[\w.-]+\.(jpg|png|webp)$/.test(name)) {
      res.writeHead(400).end('bad name'); return;
    }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const b64 = body.split(',').pop();
        fs.writeFileSync(path.join(root, 'assets', name), Buffer.from(b64, 'base64'));
        res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'}).end('saved');
        console.log('assets/' + name + ' 저장됨');
      } catch (e) { res.writeHead(500).end('fail'); }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/save-config') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        JSON.parse(body);
        fs.writeFileSync(path.join(root, 'config.json'), body);
        res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'}).end('saved');
        console.log('config.json 저장됨 (' + body.length + ' bytes)');
      } catch (e) {
        res.writeHead(400, {'Content-Type':'text/plain; charset=utf-8'}).end('bad json');
      }
    });
    return;
  }
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
