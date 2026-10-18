import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '@pmt/db';
import { AdminServer } from '../server.js';

test('Merchant Admin Integration Suite', async (t) => {
  const db = new Database({ inMemory: true });
  const admin = new AdminServer({ db, apiBaseUrl: 'http://localhost:6100' });
  const rawServer = admin.createServer();

  let serverInstance;
  let baseUrl;

  await new Promise((resolve) => {
    serverInstance = rawServer.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${serverInstance.address().port}`;
      resolve();
    });
  });

  t.after(() => {
    serverInstance.close();
    db.close();
  });

  await t.test('GET /health returns 200 HEALTHY', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'HEALTHY');
  });

  await t.test('GET / renders Admin dashboard HTML', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html');
    const html = await res.text();
    assert.ok(html.includes('PMT GTW'));
    assert.ok(html.includes('Overview'));
    assert.ok(html.includes('Ledger'));
  });
});
