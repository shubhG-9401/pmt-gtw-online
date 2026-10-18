/**
 * Universal UPI URL Builder and App-Specific Deep-Linking Engine.
 * Adheres strictly to the NPCI Unified Payments Interface Linking Specifications.
 */

/**
 * Builds a compliant NPCI UPI payment URI.
 * @param {object} params
 * @param {string} params.pa - Payee VPA (UPI ID)
 * @param {string} params.pn - Payee Name
 * @param {number|string} params.am - Transaction Amount in INR
 * @param {string} [params.cu='INR'] - Currency code
 * @param {string} [params.tr] - Transaction reference ID (Order ID)
 * @param {string} [params.tn] - Transaction note / description
 * @param {string} [params.mc] - Merchant Category Code
 * @returns {string} Standard upi://pay URI
 */
export function buildUpiUrl({ pa, pn, am, cu = 'INR', tr = '', tn = '', mc = '' }) {
  if (!pa) throw new Error('Payee VPA (pa) is mandatory for UPI URI');
  if (!pn) throw new Error('Payee Name (pn) is mandatory for UPI URI');
  if (am === undefined || am === null || Number(am) <= 0) {
    throw new Error('Valid transaction amount (am) is mandatory for UPI URI');
  }

  const formattedAmount = Number(am).toFixed(2);
  const searchParams = new URLSearchParams();
  searchParams.set('pa', pa.trim());
  searchParams.set('pn', pn.trim());
  searchParams.set('am', formattedAmount);
  searchParams.set('cu', cu);

  if (tr) searchParams.set('tr', tr.trim());
  if (tn) searchParams.set('tn', tn.trim());
  if (mc) searchParams.set('mc', mc.trim());

  return `upi://pay?${searchParams.toString()}`;
}

/**
 * Generates custom deep-links for popular UPI apps for 1-tap mobile payment.
 * @param {string} standardUpiUrl - Complete upi://pay?... URL
 * @returns {object} Object with deep-links for each major Indian payment app
 */
export function buildIntentUrls(standardUpiUrl) {
  const query = standardUpiUrl.replace(/^upi:\/\/pay\?/, '');

  return {
    raw: standardUpiUrl,
    gpay: `tez://upi/pay?${query}`,
    phonepe: `phonepe://pay?${query}`,
    paytm: `paytmmp://pay?${query}`,
    cred: `credpay://upi/pay?${query}`,
    bhim: `bhim://pay?${query}`,
    amazonpay: `amazonpay://upi/pay?${query}`,
    mobikwik: `mobikwik://pay?${query}`,
    genericIntent: `intent://pay?${query}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`
  };
}

/**
 * Parses a UPI URL and extracts all parameters.
 * @param {string} url
 * @returns {object}
 */
export function parseUpiUrl(url) {
  if (!url || typeof url !== 'string') return {};
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return {};
  const searchParams = new URLSearchParams(url.slice(queryIndex + 1));
  const res = {};
  for (const [key, val] of searchParams.entries()) {
    res[key] = val;
  }
  return res;
}
