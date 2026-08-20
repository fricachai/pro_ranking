'use strict';

const assert = require('assert');
const http = require('http');
const { fetchText, fetchJson } = require('../full-professional-stock-screen.js');

let flakyAttempts = 0;
let closeAttempts = 0;
let timeoutAttempts = 0;

const server = http.createServer((request, response) => {
  if (request.url === '/flaky') {
    flakyAttempts += 1;
    if (flakyAttempts < 3) {
      request.socket.destroy();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, attempts: flakyAttempts }));
    return;
  }
  if (request.url === '/always-close') {
    closeAttempts += 1;
    request.socket.destroy();
    return;
  }
  if (request.url === '/slow') {
    timeoutAttempts += 1;
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('slow response');
    }, 100);
    return;
  }
  response.writeHead(404);
  response.end('not found');
});

async function listen() {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function close() {
  if (server.listening) await new Promise(resolve => server.close(resolve));
}

async function main() {
  const port = await listen();
  const base = 'http://127.0.0.1:' + port;
  try {
    const flaky = await fetchJson(base + '/flaky', 5, {
      label: 'local flaky source',
      timeoutMs: 1000,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 5,
      logAttempts: true
    });
    assert.deepStrictEqual(flaky, { ok: true, attempts: 3 });
    assert.strictEqual(flakyAttempts, 3);

    let closeError;
    try {
      await fetchText(base + '/always-close', 2, {
        label: 'local closed source',
        timeoutMs: 1000,
        retryBaseDelayMs: 1,
        retryMaxDelayMs: 5,
        logAttempts: true
      });
    } catch (error) {
      closeError = error;
    }
    assert(closeError);
    assert.match(closeError.message, /after 2\/2/);
    assert.strictEqual(closeError.source, 'local closed source');
    assert.strictEqual(closeAttempts, 2);

    let timeoutError;
    try {
      await fetchText(base + '/slow', 2, {
        label: 'local slow source',
        timeoutMs: 10,
        retryBaseDelayMs: 1,
        retryMaxDelayMs: 5,
        logAttempts: true
      });
    } catch (error) {
      timeoutError = error;
    }
    assert(timeoutError);
    assert.match(timeoutError.message, /TimeoutError|timeout after/);
    assert.strictEqual(timeoutError.source, 'local slow source');
    assert.strictEqual(timeoutAttempts, 2);

    console.log('FETCH_RESILIENCE_TEST=pass');
    console.log('FLAKY_ATTEMPTS=' + flakyAttempts);
    console.log('CLOSED_ATTEMPTS=' + closeAttempts);
    console.log('TIMEOUT_ATTEMPTS=' + timeoutAttempts);
  } finally {
    await close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
