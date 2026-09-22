/**
 * FinancialCleaner - Deduplication, payee name sanitization, account anonymization,
 * and zero-amount transaction elimination.
 */

import { FinancialParser } from './FinancialParser.js';
import { FinancialSerializer } from './FinancialSerializer.js';

export class FinancialCleaner {
  /**
   * Sanitizes and cleans a financial statement
   * @param {string|object} statement
   * @param {object} [options]
   * @returns {string|object}
   */
  static clean(statement, options = {}) {
    const isStr = typeof statement === 'string';
    const model = isStr ? FinancialParser.parse(statement) : JSON.parse(JSON.stringify(statement));

    const removeZeroAmounts = options.removeZeroAmounts !== false;
    const deduplicate = options.deduplicate !== false;
    const normalizePayees = options.normalizePayees !== false;
    const anonymize = options.anonymize === true;

    for (const acct of model.accounts || []) {
      if (anonymize) {
        acct.accountId = maskString(acct.accountId || '123456789');
        acct.bankId = maskString(acct.bankId || '987654321');
      }

      const seenTxs = new Set();
      const cleaned = [];

      for (const tx of acct.transactions || []) {
        if (removeZeroAmounts && Math.abs(Number(tx.amount) || 0) < 1e-4) {
          continue;
        }

        if (normalizePayees && tx.payee) {
          tx.payee = cleanPayeeName(tx.payee);
        }

        if (anonymize && tx.memo) {
          tx.memo = 'Statement item';
        }

        if (deduplicate) {
          const key = `${tx.date}|${tx.amount}|${tx.payee}|${tx.checkNumber || ''}`;
          if (seenTxs.has(key)) {
            continue;
          }
          seenTxs.add(key);
        }

        cleaned.push(tx);
      }

      acct.transactions = cleaned;
    }

    return isStr ? FinancialSerializer.toQif(model) : model;
  }

  /**
   * Anonymizes sensitive account numbers and personal memos
   * @param {string|object} statement
   * @returns {string|object}
   */
  static anonymize(statement) {
    return FinancialCleaner.clean(statement, { anonymize: true });
  }
}

function cleanPayeeName(raw) {
  return raw
    .replace(/^(POS|DEBIT|PURCHASE|CHECKCARD|ACH|PAYPAL)\s*[\*#-]?\s*/i, '')
    .replace(/\s+(LLC|INC|CORP|LTD)\.?$/i, '')
    .replace(/\s+#\d+.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function maskString(str) {
  if (!str || str.length <= 4) return '****';
  return '*'.repeat(str.length - 4) + str.slice(-4);
}
