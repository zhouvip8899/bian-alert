/**
 * bian-alert 本地开发服务器
 * - 静态文件服务（GET）
 * - POST /save-auth-config  自动写入 auth-config.js
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 8766;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer(function(req, res) {
  // 跨域头（本地用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ---- POST /save-auth-config → 写入 auth-config.js ----
  if (req.method === 'POST' && req.url === '/save-auth-config') {
    var body = '';
    req.on('data', function(chunk){ body += chunk.toString(); });
    req.on('end', function() {
      try {
        var data = JSON.parse(body);
        if (typeof data.content !== 'string') throw new Error('content 字段缺失');
        var dest = path.join(ROOT, 'auth-config.js');
        fs.writeFileSync(dest, data.content, 'utf8');
        console.log('[server] auth-config.js 已写入，' + data.content.length + ' 字节');
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true, msg:'auth-config.js 写入成功'}));
      } catch(e) {
        console.error('[server] 写入失败:', e.message);
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:false, msg:e.message}));
      }
    });
    return;
  }

  // ---- GET 静态文件 ----
  var urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  var filePath = path.join(ROOT, urlPath);

  // 防止路径穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found'); return;
  }

  var ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, function() {
  console.log('✅ bian-alert 服务器已启动: http://' + HOST + ':' + PORT);
  console.log('   支持 POST /save-auth-config 写入授权码配置');
});
