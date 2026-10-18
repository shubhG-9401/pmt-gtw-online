import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBankSms, parseBankEmail } from '../index.js';

test('Bank SMS Parser suite', async (t) => {
  await t.test('Parses HDFC credit SMS correctly', () => {
    const sms = 'Dear Customer, Rs 1250.00 credited with a/c **9876 on 19-10-2026. Ref UTR: 123456789012. VPA alex@upi.';
    const result = parseBankSms(sms, 'VM-HDFCBK');
    assert.equal(result.isCredit, true);
    assert.equal(result.amount, 1250.00);
    assert.equal(result.utr, '123456789012');
    assert.equal(result.payerVpa, 'alex@upi');
  });

  await t.test('Parses SBI credit SMS correctly', () => {
    const sms = 'Dear SBI User, your A/C ending 4321 credited by Rs 500.50 on 19Oct26 by transfer from payer@okhdfcbank Ref No 987654321098';
    const result = parseBankSms(sms, 'SBIINB');
    assert.equal(result.isCredit, true);
    assert.equal(result.amount, 500.50);
    assert.equal(result.utr, '987654321098');
    assert.equal(result.payerVpa, 'payer@okhdfcbank');
  });

  await t.test('Parses ICICI credit SMS correctly', () => {
    const sms = 'ICICI Bank Acct XX1122 credited for INR 299.00 on 19-Oct-26. UPI:556677889900-John Doe.';
    const result = parseBankSms(sms, 'ICICIB');
    assert.equal(result.isCredit, true);
    assert.equal(result.amount, 299.00);
    assert.equal(result.utr, '556677889900');
  });

  await t.test('Rejects debit SMS alert', () => {
    const sms = 'Rs 450.00 debited from A/C **1234 on 19-10-26 at Star Cafe. Ref 112233445566.';
    const result = parseBankSms(sms);
    assert.equal(result.isCredit, false);
    assert.equal(result.amount, null);
  });
});

test('Bank Email Parser suite', async (t) => {
  await t.test('Parses HTML email from bank', () => {
    const html = `
      <html>
        <body>
          <h2>Account Credit Alert</h2>
          <p>We are pleased to inform you that <strong>INR 3,499.00</strong> was credited to your Account.</p>
          <p>Transaction Reference (UPI Ref): 998877665544</p>
        </body>
      </html>
    `;
    const result = parseBankEmail(html, 'Credit Alert: INR 3,499.00 deposited', 'alerts@hdfcbank.net');
    assert.equal(result.isCredit, true);
    assert.equal(result.amount, 3499.00);
    assert.equal(result.utr, '998877665544');
  });
});
