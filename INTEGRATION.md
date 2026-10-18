# PMT GTW (ONLINE) — Merchant Integration Guide

This guide details how to integrate PMT GTW (Online) into any web application or store in minutes.

---

## Method 1: Drop-In 1-Script Modal (`pmt.js`)

Add the universal checkout script to your HTML page:

```html
<script src="http://localhost:7000/pmt.js"></script>

<!-- Button with data attributes automatically opens checkout -->
<button 
  data-pmt-pay 
  data-checkout-url="http://localhost:7000/checkout/pmt_9f82b71e"
  data-redirect-url="https://yourstore.com/order-success">
  Pay ₹499 with UPI
</button>
```

### Programmatic Modal Invocation

```javascript
window.PmtGateway.open({
  checkoutUrl: 'http://localhost:7000/checkout/pmt_9f82b71e',
  onSuccess: (payment) => {
    console.log('Payment successful:', payment);
    // e.g. update UI, show download link
  },
  onFailure: (err) => {
    console.error('Payment failed or cancelled:', err);
  },
  onDismiss: () => {
    console.log('Customer dismissed payment window');
  }
});
```

---

## Method 2: Node.js Backend Integration

### 1. Install & Initialize Client

```javascript
import { PmtMerchantClient } from '@pmt/merchant-sdk';

const pmt = new PmtMerchantClient({
  apiKey: 'pmt_live_sec_99a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4',
  webhookSecret: 'pmt_whsec_77b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2',
  baseUrl: 'http://localhost:6100'
});
```

### 2. Create Payment Session

```javascript
const session = await pmt.createPayment({
  amount: 799.00,
  orderId: 'ORD_2026_001',
  customerMobile: '9876543210',
  customerName: 'Aarav Mehta'
});

console.log('Payment ID:', session.payment.id);
console.log('Checkout URL:', session.payment.checkoutUrl);
```

### 3. Handle Webhooks Securely

```javascript
import express from 'express';

const app = express();
app.use(express.json());

app.post('/api/webhook', (req, res) => {
  const signature = req.headers['x-pmt-signature'];
  const timestamp = req.headers['x-pmt-timestamp'];

  const isValid = pmt.verifyWebhook(JSON.stringify(req.body), signature, timestamp);
  if (!isValid) {
    return res.status(401).send('Unauthorized webhook signature');
  }

  const { event, data } = req.body;
  if (event === 'payment.success') {
    console.log(`Order ${data.orderId} verified with Bank UTR: ${data.utr}`);
    // Fulfill customer order
  }

  res.json({ received: true });
});
```

---

## Method 3: Direct REST API (cURL / Any Language)

### Create Payment

```bash
curl -X POST http://localhost:6100/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pmt_live_sec_99a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4" \
  -d '{
    "amount": 299.00,
    "orderId": "ORD_3001",
    "customerMobile": "9876543210"
  }'
```

### Response

```json
{
  "success": true,
  "payment": {
    "id": "pmt_4f9a8b1c",
    "orderId": "ORD_3001",
    "amount": 299.00,
    "currency": "INR",
    "status": "ACTIVE",
    "queuePosition": 0,
    "upiUrl": "upi://pay?pa=merchant%40okhdfcbank&pn=PMT+Digital+Store&am=299.00&tr=pmt_4f9a8b1c",
    "checkoutUrl": "http://localhost:7000/checkout/pmt_4f9a8b1c",
    "expiresAt": "2026-10-19T00:45:00.000Z"
  }
}
```

### Query Payment Status

```bash
curl http://localhost:6100/api/v1/payments/pmt_4f9a8b1c
```
