import { parseBankSms } from './bank-sms-parser.js';

/**
 * Strips HTML tags and normalizes whitespace in email bodies.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses bank email alert content.
 * @param {string} body - Plain text or HTML email body
 * @param {string} [subject=''] - Email subject line
 * @param {string} [from=''] - Email sender address
 * @returns {{ isCredit: boolean, amount: number|null, utr: string|null, bank: string|null, payerVpa: string|null }}
 */
export function parseBankEmail(body, subject = '', from = '') {
  const plainText = `${subject} \n ${stripHtml(body)}`;
  return parseBankSms(plainText, from);
}
