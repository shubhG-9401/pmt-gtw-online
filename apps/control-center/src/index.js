import { ControlCenterServer } from './server.js';

export function startControlCenter(port = null) {
  const finalPort = port || Number(process.env.CONTROL_CENTER_PORT || 8090);
  const bindHost = process.env.PMT_BIND_HOST || '127.0.0.1';

  const controlServer = new ControlCenterServer();
  const server = controlServer.createServer();

  return new Promise((resolve) => {
    const instance = server.listen(finalPort, bindHost, () => {
      console.log(`[Control Center] Supervisor listening on http://${bindHost}:${finalPort}`);
      resolve({
        port: finalPort,
        server: instance,
        close: () => new Promise((cb) => instance.close(cb))
      });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startControlCenter();
}
