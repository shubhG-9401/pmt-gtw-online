import { startPaymentApi } from '../apps/payment-api/src/index.js';
import { startCheckoutPortal } from '../apps/checkout-portal/src/index.js';
import { startMerchantAdmin } from '../apps/merchant-admin/src/index.js';
import { startDemoStore } from '../apps/demo-store/src/index.js';
import { startControlCenter } from '../apps/control-center/src/index.js';

console.log('============================================================');
console.log('🚀 PMT GTW (ONLINE) — LOCAL MESH SUPERVISOR BOOT');
console.log('============================================================');

async function main() {
  try {
    await startPaymentApi(6100);
    await startCheckoutPortal(7000);
    await startMerchantAdmin(6001);
    await startDemoStore(5000);
    await startControlCenter(8090);

    console.log('============================================================');
    console.log('🎉 ALL 5 PMT SERVICES ACTIVE & LISTENING:');
    console.log('  • Control Center Supervisor: http://localhost:8090');
    console.log('  • Merchant Admin Portal:     http://localhost:6001');
    console.log('  • Cloud Showcase Storefront: http://localhost:5000');
    console.log('  • Customer Checkout Portal:  http://localhost:7000');
    console.log('  • Core Payment REST API:     http://localhost:6100');
    console.log('============================================================\n');
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

main();
