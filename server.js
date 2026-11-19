'use strict';

// 내 컴퓨터에서 확인할 때 쓰는 로컬 서버. 배포(Vercel)에서는 쓰지 않는다.
// 실행: npm start  (node --env-file=.env server.js)
// public/ 은 화면, /api/* 는 api/ 폴더의 함수로 연결한다.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const MAX_BODY = 200000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, obj) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

// 요청 본문을 읽는다. 너무 크면 끊고 빈 값으로 돌려준다(끝나지 않고 멈추는 일을 막는다).
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    req.on('data', (c) => {
      data += c;
      if (data.length > MAX_BODY) {
        finish({});
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        finish(data ? JSON.parse(data) : {});
      } catch (e) {
        finish({});
      }
    });
    req.on('error', () => finish({}));
    req.on('close', () => finish({}));
  });
}

async function handleApi(req, res, pathname) {
  const name = pathname.slice('/api/'.length).replace(/[^a-z]/gi, '');
  const file = path.join(ROOT, 'api', `${name}.js`);
  if (!name || !fs.existsSync(file)) return sendJson(res, 404, { error: '없는 주소예요.' });
  req.body = req.method === 'POST' ? await readBody(req) : undefined;
  const handler = require(file);
  await handler(req, res);
}

function handleStatic(req, res, pathname) {
  let rel;
  try {
    rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  } catch (e) {
    // 잘못된 주소(%E0%A4%A 같은 깨진 글자)는 서버를 멈추지 않고 400 으로 돌려준다
    res.statusCode = 400;
    return res.end('Bad request');
  }
  const full = path.normalize(path.join(PUBLIC, rel));
  if (full !== PUBLIC && !full.startsWith(PUBLIC + path.sep)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    res.statusCode = 200;
    res.setHeader('content-type', TYPES[path.extname(full)] || 'application/octet-stream');
    // 화면 파일을 고쳤을 때 예전 파일이 남지 않도록 매번 확인하게 한다
    res.setHeader('cache-control', 'no-cache');
    res.end(data);
  });
}

http
  .createServer(async (req, res) => {
    // 어떤 오류가 나도 서버 전체가 멈추지 않게 여기서 받는다
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url.pathname);
      else handleStatic(req, res, url.pathname);
    } catch (e) {
      console.error(e);
      sendJson(res, 500, { error: '서버에서 문제가 생겼어요.' });
    }
  })
  .listen(PORT, () => {
    console.log(`길잡이 로컬 서버: http://localhost:${PORT}`);
  });
