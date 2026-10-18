/**
 * Advanced Bank SMS Parser Engine for Indian Banking UPI Alerts.
 * Extracts: Credit Amount, 12-digit UTR/RRN, Bank Identifier, Payer VPA / Name, Account Digits.
 */

function cleanAmount(raw) {
  if (!raw) return null;
  const num = parseFloat(raw.replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

/**
 * Universal UPI Credit Regex Patterns for Indian Banks
 */
const BANK_PATTERNS = [
  // HDFC Bank
  {
    bank: 'HDFC',
    regex: /(?:credited\s+(?:with|to)?\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)|(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*credited).*?(?:UPI\s*(?:Ref|txn|rrn|no|id)?[:\s\/-]*(\d{12})|Ref\s*(?:UTR|no\.?)?[:\s\/-]*(\d{12}))/i,
    extract: (m) => ({ amount: cleanAmount(m[1] || m[2]), utr: m[3] || m[4] })
  },
  // SBI
  {
    bank: 'SBI',
    regex: /(?:credited\s+by\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)|(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*credited).*?(?:ref\s*no\.?|rrn|upi\s*ref)?[:\s\/-]*(\d{12})/i,
    extract: (m) => ({ amount: cleanAmount(m[1] || m[2]), utr: m[3] })
  },
  // ICICI Bank
  {
    bank: 'ICICI',
    regex: /(?:credited\s+(?:for|with)\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)|(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*credited).*?UPI[:\s-]*(\d{12})/i,
    extract: (m) => ({ amount: cleanAmount(m[1] || m[2]), utr: m[3] })
  },
  // Axis Bank
  {
    bank: 'AXIS',
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+credited\s+to.*?UPI[\/:\s]+(\d{12})/i,
    extract: (m) => ({ amount: cleanAmount(m[1]), utr: m[2] })
  },
  // Kotak Mahindra Bank
  {
    bank: 'KOTAK',
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+credited.*?UPI\s*Ref[:\s]*(\d{12})/i,
    extract: (m) => ({ amount: cleanAmount(m[1]), utr: m[2] })
  },
  // PNB
  {
    bank: 'PNB',
    regex: /A\/C\s+.*?credited\s+by\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*).*?(?:UPI|Ref)[:\s]*(\d{12})/i,
    extract: (m) => ({ amount: cleanAmount(m[1]), utr: m[2] })
  },
  // Bank of Baroda (BOB)
  {
    bank: 'BOB',
    regex: /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+credited\s+to\s+A\/C.*?(?:UPI|Ref)[:\s\/-]*(\d{12})/i,
    extract: (m) => ({ amount: cleanAmount(m[1]), utr: m[2] })
  },
  // Canara Bank
  {
    bank: 'CANARA',
    regex: /(?:credited\s+for\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)|(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*credited).*?(?:UPI|Ref)[:\s\/-]*(\d{12})/i,
    extract: (m) => ({ amount: cleanAmount(m[1] || m[2]), utr: m[3] })
  },
  // IDFC FIRST Bank
  {
    bank: 'IDFC',
    regex: /(?:credited\s+with\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)|(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*credited).*?UPI\s*Ref[:\s]*(\d{12})/i,
    extract: (m) => ({ amount: cleanAmount(m[1] || m[2]), utr: m[3] })
  },
  // Paytm / PhonePe Merchant SMS
  {
    bank: 'MERCHANT_UPI',
    regex: /(?:received|credited)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+via\s+UPI.*?(?:UTR|Ref|txn)[:\s]*(\d{12})/i,
    extract: (m) => ({ amount: cleanAmount(m[1]), utr: m[2] })
  },
  // Universal Fallback Pattern for any UPI Credit SMS
  {
    bank: 'GENERIC_UPI',
    regex: /(?:credit|credited|received|deposited).*?(?:INR|Rs\.?)\s*([\d,]+\.?\d*).*?(\d{12})/is,
    extract: (m) => ({ amount: cleanAmount(m[1]), utr: m[2] })
  }
];

/**
 * Parses raw bank SMS text and extracts financial attribution fields.
 * @param {string} text - Raw SMS body text
 * @param {string} [sender=''] - Sender SMS header (e.g., "VM-HDFCBK", "AXISBK")
 * @returns {{ isCredit: boolean, amount: number|null, utr: string|null, bank: string|null, payerVpa: string|null }}
 */
export function parseBankSms(text, sender = '') {
  if (!text || typeof text !== 'string') {
    return { isCredit: false, amount: null, utr: null, bank: null, payerVpa: null };
  }

  // Reject debit alerts immediately
  if (/\b(?:debited|withdrawn|spent|charged|sent)\b/i.test(text) && !/\b(?:credited|received|deposited)\b/i.test(text)) {
    return { isCredit: false, amount: null, utr: null, bank: null, payerVpa: null };
  }

  // Extract Payer VPA if mentioned in the message
  let payerVpa = null;
  const vpaMatch = /([a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64})/i.exec(text);
  if (vpaMatch) {
    payerVpa = vpaMatch[1].toLowerCase();
  }

  for (const pattern of BANK_PATTERNS) {
    const match = pattern.regex.exec(text);
    if (match) {
      const extracted = pattern.extract(match);
      if (extracted.amount !== null && extracted.amount > 0 && extracted.utr && extracted.utr.length === 12) {
        return {
          isCredit: true,
          amount: extracted.amount,
          utr: extracted.utr,
          bank: pattern.bank,
          payerVpa
        };
      }
    }
  }

  return { isCredit: false, amount: null, utr: null, bank: null, payerVpa: null };
}
