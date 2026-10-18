import test from 'node:test';
import assert from 'node:assert/strict';
import { ControlCenterServer } from '../server.js';

test('Control Center Integration Suite', async (t) => {
  const cc = new ControlCenterServer();
  const rawServer = cc.createServer();

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
  });

  await t.test('GET /health returns 200 HEALTHY', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'HEALTHY');
  });

  await t.test('GET / renders dashboard HTML', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('PMT GTW Process Supervisor'));
  });
});
