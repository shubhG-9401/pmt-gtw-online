import { PaymentApiServer } from './server.js';
import { getDatabase } from '@pmt/db';

export function startPaymentApi(port = null, options = {}) {
  const finalPort = port || Number(process.env.PAYMENT_API_PORT || 6100);
  const bindHost = process.env.PMT_BIND_HOST || '127.0.0.1';
  const db = options.db || getDatabase();

  const apiServer = new PaymentApiServer({ db, ...options });
  const server = apiServer.createServer();

  return new Promise((resolve) => {
    const instance = server.listen(finalPort, bindHost, () => {
      console.log(`[Payment API] Core Payment REST & SSE Server listening on http://${bindHost}:${finalPort}`);
      resolve({
        port: finalPort,
        server: instance,
        close: () => new Promise((cb) => instance.close(cb))
      });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startPaymentApi();
}
