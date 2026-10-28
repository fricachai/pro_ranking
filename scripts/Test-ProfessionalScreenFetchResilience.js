'use strict';

const assert = require('assert');
const http = require('http');
const { fetchText, fetchJson } = require('../full-professional-stock-screen.js');

let flakyAttempts = 0;
let closeAttempts = 0;
let timeoutAttempts = 0;
let htmlThenJsonAttempts = 0;
let htmlOnlyAttempts = 0;

const server = http.createServer((request, response) => {
  // Retries add a `_fetchRetry` cache-buster, so match on the path only.
  const requestPath = String(request.url || '').split('?')[0];
  if (requestPath === '/flaky') {
    flakyAttempts += 1;
    if (flakyAttempts < 3) {
      request.socket.destroy();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, attempts: flakyAttempts }));
    return;
  }
  if (requestPath === '/always-close') {
    closeAttempts += 1;
    request.socket.destroy();
    return;
  }
  if (requestPath === '/html-then-json') {
    htmlThenJsonAttempts += 1;
    if (htmlThenJsonAttempts < 3) {
      // Mirrors the 2026-10-27 TWSE OpenAPI incident: HTTP 200 with a
      // maintenance HTML page instead of the expected JSON payload.
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><head><title>System maintenance</title></head><body>maintenance</body></html>');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, attempts: htmlThenJsonAttempts }));
    return;
  }
  if (requestPath === '/html-only') {
    htmlOnlyAttempts += 1;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><body>temporarily unavailable</body></html>');
    return;
  }
  if (requestPath === '/slow') {
    timeoutAttempts += 1;
    // Intentionally never respond: the client-side timeout must always win,
    // regardless of machine load or event-loop delays. Previously this handler
    // answered after 100 ms with a 10 ms client timeout, so a busy machine could
    // let the response arrive first and make the retry-count assertion flaky.
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
        timeoutMs: 50,
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

    const htmlFlaky = await fetchJson(base + '/html-then-json', 5, {
      label: 'local HTML-then-JSON source',
      timeoutMs: 1000,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 5,
      logAttempts: true
    });
    assert.deepStrictEqual(htmlFlaky, { ok: true, attempts: 3 });
    assert.strictEqual(htmlThenJsonAttempts, 3);

    let htmlOnlyError;
    try {
      await fetchJson(base + '/html-only', 3, {
        label: 'local HTML-only source',
        timeoutMs: 1000,
        retryBaseDelayMs: 1,
        retryMaxDelayMs: 5,
        logAttempts: true
      });
    } catch (error) {
      htmlOnlyError = error;
    }
    assert(htmlOnlyError);
    assert.match(htmlOnlyError.message, /JSON parse failed \[local HTML-only source\] after 3 attempts/);
    assert.match(htmlOnlyError.message, /body starts with "<!doctype html/);
    assert.strictEqual(htmlOnlyAttempts, 3);

    console.log('FETCH_RESILIENCE_TEST=pass');
    console.log('FLAKY_ATTEMPTS=' + flakyAttempts);
    console.log('CLOSED_ATTEMPTS=' + closeAttempts);
    console.log('TIMEOUT_ATTEMPTS=' + timeoutAttempts);
    console.log('HTML_THEN_JSON_ATTEMPTS=' + htmlThenJsonAttempts);
    console.log('HTML_ONLY_ATTEMPTS=' + htmlOnlyAttempts);
  } finally {
    await close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
