/**
 * FinancialEditor - Programmatic modifications: filtering, categorizing, sorting,
 * reordering, and updating financial statement records.
 */

import { FinancialParser } from './FinancialParser.js';
import { FinancialSerializer } from './FinancialSerializer.js';

export class FinancialEditor {
  /**
   * Filter transactions across accounts
   * @param {string|object} statement
   * @param {Function} predicate (tx) => boolean
   * @returns {string|object}
   */
  static filter(statement, predicate) {
    const isStr = typeof statement === 'string';
    const model = isStr ? FinancialParser.parse(statement) : JSON.parse(JSON.stringify(statement));

    for (const acct of model.accounts || []) {
      acct.transactions = (acct.transactions || []).filter(predicate);
    }

    return isStr ? FinancialSerializer.toQif(model) : model;
  }

  /**
   * Sort transactions by date or amount
   * @param {string|object} statement
   * @param {string} [field='date']
   * @param {boolean} [ascending=true]
   * @returns {string|object}
   */
  static sort(statement, field = 'date', ascending = true) {
    const isStr = typeof statement === 'string';
    const model = isStr ? FinancialParser.parse(statement) : JSON.parse(JSON.stringify(statement));

    const direction = ascending ? 1 : -1;
    for (const acct of model.accounts || []) {
      (acct.transactions || []).sort((a, b) => {
        if (field === 'amount') {
          return (Number(a.amount) - Number(b.amount)) * direction;
        }
        return String(a[field] || '').localeCompare(String(b[field] || '')) * direction;
      });
    }

    return isStr ? FinancialSerializer.toQif(model) : model;
  }

  /**
   * Auto-assign categories based on rule matches against Payee or Memo
   * @param {string|object} statement
   * @param {Array<{ pattern: RegExp|string, category: string }>} rules
   * @returns {string|object}
   */
  static autoCategorize(statement, rules) {
    const isStr = typeof statement === 'string';
    const model = isStr ? FinancialParser.parse(statement) : JSON.parse(JSON.stringify(statement));

    for (const acct of model.accounts || []) {
      for (const tx of acct.transactions || []) {
        const text = `${tx.payee || ''} ${tx.memo || ''}`;
        for (const r of rules) {
          const matched = typeof r.pattern === 'string'
            ? text.toLowerCase().includes(r.pattern.toLowerCase())
            : r.pattern.test(text);
          if (matched) {
            tx.category = r.category;
            break;
          }
        }
      }
    }

    return isStr ? FinancialSerializer.toQif(model) : model;
  }

  /**
   * Update transaction properties matching an ID or predicate
   * @param {string|object} statement
   * @param {string|Function} matchIdOrPredicate
   * @param {object} updates
   * @returns {string|object}
   */
  static updateTransaction(statement, matchIdOrPredicate, updates) {
    const isStr = typeof statement === 'string';
    const model = isStr ? FinancialParser.parse(statement) : JSON.parse(JSON.stringify(statement));

    const predicate = typeof matchIdOrPredicate === 'function'
      ? matchIdOrPredicate
      : (tx) => tx.id === matchIdOrPredicate;

    for (const acct of model.accounts || []) {
      for (const tx of acct.transactions || []) {
        if (predicate(tx)) {
          Object.assign(tx, updates);
        }
      }
    }

    return isStr ? FinancialSerializer.toQif(model) : model;
  }
}
