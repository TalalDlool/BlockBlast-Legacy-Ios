var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');

var ROOT = __dirname;
var PORT = 8000;

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg'
};

http.createServer(function (req, res) {
  var urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { res.writeHead(400); res.end(); return; }
  if (urlPath === '/') urlPath = '/index.html';
  var filePath = path.join(ROOT, urlPath);
  if (filePath.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, function (err, data) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    var type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, function () {
  console.log('=======================================');
  console.log(' Server running on port ' + PORT);
  console.log(' On this PC : http://localhost:' + PORT);
  var nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    nets[name].forEach(function (n) {
      if (n.family === 'IPv4' && !n.internal)
        console.log(' On iPhone  : http://' + n.address + ':' + PORT);
    });
  });
  console.log('=======================================');
  console.log(' Keep this window open while playing.');
});
