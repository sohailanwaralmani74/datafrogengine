/**
 * FinancialAnalyzer - Cashflow analytics, expense breakdown, monthly summaries,
 * balance trends, and anomaly detection for statement files.
 */

import { FinancialParser } from './FinancialParser.js';

export class FinancialAnalyzer {
  /**
   * Generates a comprehensive financial audit and analytics profile
   * @param {string|object} statement
   * @returns {object} Financial analysis
   */
  static analyze(statement) {
    const model = typeof statement === 'string' ? FinancialParser.parse(statement) : statement;

    let totalInflow = 0;
    let totalOutflow = 0;
    let transactionCount = 0;
    const categoryTotals = {};
    const monthlyTotals = {};
    const payeeTotals = {};

    for (const acct of model.accounts || []) {
      for (const tx of acct.transactions || []) {
        transactionCount++;
        const amt = Number(tx.amount) || 0;
        if (amt > 0) {
          totalInflow += amt;
        } else {
          totalOutflow += Math.abs(amt);
        }

        // Category breakdown
        const cat = tx.category || 'Uncategorized';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;

        // Payee breakdown
        const payee = tx.payee || 'Unknown';
        payeeTotals[payee] = (payeeTotals[payee] || 0) + amt;

        // Monthly breakdown
        if (tx.date) {
          const monthKey = tx.date.substring(0, 7); // YYYY-MM
          if (!monthlyTotals[monthKey]) {
            monthlyTotals[monthKey] = { inflow: 0, outflow: 0, net: 0 };
          }
          if (amt > 0) {
            monthlyTotals[monthKey].inflow += amt;
          } else {
            monthlyTotals[monthKey].outflow += Math.abs(amt);
          }
          monthlyTotals[monthKey].net += amt;
        }
      }
    }

    const netCashflow = totalInflow - totalOutflow;

    return {
      format: model.format,
      accountCount: (model.accounts || []).length,
      transactionCount,
      totalInflow: Math.round(totalInflow * 100) / 100,
      totalOutflow: Math.round(totalOutflow * 100) / 100,
      netCashflow: Math.round(netCashflow * 100) / 100,
      categoryBreakdown: categoryTotals,
      payeeBreakdown: payeeTotals,
      monthlyBreakdown: monthlyTotals
    };
  }

  static profile(statement) {
    return FinancialAnalyzer.analyze(statement);
  }
}
