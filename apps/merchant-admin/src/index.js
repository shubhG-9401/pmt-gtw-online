import { AdminServer } from './server.js';
import { getDatabase } from '@pmt/db';

export function startMerchantAdmin(port = null, options = {}) {
  const finalPort = port || Number(process.env.MERCHANT_ADMIN_PORT || 6001);
  const bindHost = process.env.PMT_BIND_HOST || '127.0.0.1';
  const db = options.db || getDatabase();

  const adminServer = new AdminServer({ db, ...options });
  const server = adminServer.createServer();

  return new Promise((resolve) => {
    const instance = server.listen(finalPort, bindHost, () => {
      console.log(`[Merchant Admin] Control Hub listening on http://${bindHost}:${finalPort}`);
      resolve({
        port: finalPort,
        server: instance,
        close: () => new Promise((cb) => instance.close(cb))
      });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startMerchantAdmin();
}
