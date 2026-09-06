const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');

describe('Backend Server - Static & API Routing Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after((done) => {
    server.close(done);
  });

  test('GET /api/health returns 200 with status healthy and aiEnabled flag', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.equal(typeof body.aiEnabled, 'boolean');
    assert.ok(body.timestamp);
  });

  test('GET /api/config returns 200 with aiEnabled boolean', async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.aiEnabled, 'boolean');
  });

  test('GET /api/nonexistent returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    assert.equal(res.status, 404);
  });

  test('GET / returns 200 with HTML content when frontend dist is available', async () => {
    const res = await fetch(`${baseUrl}/`);
    // If dist exists, it serves 200 text/html; otherwise default 404
    if (res.status === 200) {
      const text = await res.text();
      assert.ok(text.includes('<!DOCTYPE html>') || text.includes('<html') || text.includes('RedPandaium'));
    } else {
      assert.equal(res.status, 404);
    }
  });
});
