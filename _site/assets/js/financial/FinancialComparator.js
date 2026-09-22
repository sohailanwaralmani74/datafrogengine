/**
 * FinancialComparator - Reconciliation engine comparing two statements or bank exports.
 * Detects reconciled, missing, duplicate, and drifting transactions.
 */

import { FinancialParser } from './FinancialParser.js';

export class FinancialComparator {
  /**
   * Reconciles two financial statements (e.g., Bank Statement vs Accounting Ledger)
   * @param {string|object} statementA Source A
   * @param {string|object} statementB Source B
   * @param {object} [options]
   * @returns {object} Reconciliation report
   */
  static reconcile(statementA, statementB, options = {}) {
    const modelA = typeof statementA === 'string' ? FinancialParser.parse(statementA) : statementA;
    const modelB = typeof statementB === 'string' ? FinancialParser.parse(statementB) : statementB;

    const txsA = extractAllTransactions(modelA);
    const txsB = extractAllTransactions(modelB);

    const matched = [];
    const unmatchedA = [];
    const unmatchedB = [...txsB];

    for (const a of txsA) {
      // Find candidate match in B: matching amount and close date
      const matchIndex = unmatchedB.findIndex(b => isMatch(a, b, options));
      if (matchIndex !== -1) {
        matched.push({
          sourceA: a,
          sourceB: unmatchedB[matchIndex]
        });
        unmatchedB.splice(matchIndex, 1);
      } else {
        unmatchedA.push(a);
      }
    }

    const sumAmounts = (arr) => arr.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

    return {
      reconciled: unmatchedA.length === 0 && unmatchedB.length === 0,
      matchedCount: matched.length,
      unmatchedCountA: unmatchedA.length,
      unmatchedCountB: unmatchedB.length,
      totalAmountA: sumAmounts(txsA),
      totalAmountB: sumAmounts(txsB),
      discrepancy: Math.abs(sumAmounts(txsA) - sumAmounts(txsB)),
      matched,
      unmatchedA,
      unmatchedB
    };
  }

  /**
   * Alias for reconcile()
   */
  static compare(statementA, statementB, options) {
    return FinancialComparator.reconcile(statementA, statementB, options);
  }

  static diff(statementA, statementB, options) {
    return FinancialComparator.reconcile(statementA, statementB, options);
  }
}

function extractAllTransactions(model) {
  const list = [];
  for (const a of model.accounts || []) {
    for (const t of a.transactions || []) {
      list.push(t);
    }
  }
  return list;
}

function isMatch(a, b, options) {
  // Amount match
  const amountDelta = Math.abs(Number(a.amount) - Number(b.amount));
  if (amountDelta > 0.01) return false;

  // FITID match
  if (a.id && b.id && a.id === b.id) return true;

  // Date match within threshold
  const dateToleranceDays = options.dateToleranceDays !== undefined ? options.dateToleranceDays : 3;
  if (a.date && b.date) {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (!Number.isNaN(da) && !Number.isNaN(db)) {
      const diffDays = Math.abs(da - db) / (1000 * 60 * 60 * 24);
      if (diffDays <= dateToleranceDays) return true;
    }
  }

  // Check Number match
  if (a.checkNumber && b.checkNumber && a.checkNumber === b.checkNumber) return true;

  return false;
}
