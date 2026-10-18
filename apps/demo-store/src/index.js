import { DemoStoreServer } from './server.js';

export function startDemoStore(port = null, options = {}) {
  const finalPort = port || Number(process.env.DEMO_STORE_PORT || 5000);
  const bindHost = process.env.PMT_BIND_HOST || '127.0.0.1';

  const storeServer = new DemoStoreServer(options);
  const server = storeServer.createServer();

  return new Promise((resolve) => {
    const instance = server.listen(finalPort, bindHost, () => {
      console.log(`[Demo Store] Storefront Showcase listening on http://${bindHost}:${finalPort}`);
      resolve({
        port: finalPort,
        server: instance,
        close: () => new Promise((cb) => instance.close(cb))
      });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startDemoStore();
}
