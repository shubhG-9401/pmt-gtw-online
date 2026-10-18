import { CheckoutServer } from './server.js';
import { getDatabase } from '@pmt/db';

export function startCheckoutPortal(port = null, options = {}) {
  const finalPort = port || Number(process.env.CHECKOUT_PORTAL_PORT || 7000);
  const bindHost = process.env.PMT_BIND_HOST || '127.0.0.1';
  const db = options.db || getDatabase();

  const checkoutServer = new CheckoutServer({ db, ...options });
  const server = checkoutServer.createServer();

  return new Promise((resolve) => {
    const instance = server.listen(finalPort, bindHost, () => {
      console.log(`[Checkout Portal] Customer Checkout Portal listening on http://${bindHost}:${finalPort}`);
      resolve({
        port: finalPort,
        server: instance,
        close: () => new Promise((cb) => instance.close(cb))
      });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startCheckoutPortal();
}
