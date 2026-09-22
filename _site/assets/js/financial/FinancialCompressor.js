/**
 * FinancialCompressor - Prunes non-essential fields, collapses duplicates,
 * and strips redundant metadata from financial files.
 */

import { FinancialParser } from './FinancialParser.js';
import { FinancialSerializer } from './FinancialSerializer.js';

export class FinancialCompressor {
  /**
   * Compresses financial statement by stripping verbose headers, comments,
   * and empty fields, serializing to dense QIF or compact OFX.
   * @param {string|object} statement
   * @param {object} [options]
   * @returns {string} Compact text
   */
  static compress(statement, options = {}) {
    const isStr = typeof statement === 'string';
    const model = isStr ? FinancialParser.parse(statement) : JSON.parse(JSON.stringify(statement));

    for (const acct of model.accounts || []) {
      for (const tx of acct.transactions || []) {
        if (!tx.memo) delete tx.memo;
        if (!tx.category) delete tx.category;
        if (!tx.checkNumber) delete tx.checkNumber;
        if (Array.isArray(tx.splits) && tx.splits.length === 0) delete tx.splits;
      }
    }

    const format = options.format || model.format || 'QIF';
    if (format === 'QIF') {
      return FinancialSerializer.toQif(model);
    } else {
      return FinancialSerializer.toOfx(model, options);
    }
  }

  static minify(statement, options) {
    return FinancialCompressor.compress(statement, options);
  }
}
