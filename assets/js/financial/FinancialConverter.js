/**
 * FinancialConverter - Converts financial statement files (QIF, OFX, QFX, QBO) to/from
 * CSV, JSON, Excel, XML, and Markdown.
 */

import { FinancialParser } from './FinancialParser.js';
import { FinancialSerializer } from './FinancialSerializer.js';
import { CsvConverter } from '../csv/CsvConverter.js';
import { ExcelWorkbook } from '../excel/index.js';

export class FinancialConverter {
  /**
   * Convert financial statement to flat list of transactions as JSON
   * @param {string|object} input QIF/OFX/QFX/QBO text or parsed model
   * @returns {Array<object>} Flat transaction objects
   */
  static toJson(input) {
    const model = typeof input === 'string' ? FinancialParser.parse(input) : input;
    const flatTxs = [];

    for (const acct of model.accounts || []) {
      const acctId = acct.accountId || acct.name || 'Default';
      const acctType = acct.type || 'Bank';
      const currency = acct.currency || 'USD';

      for (const tx of acct.transactions || []) {
        flatTxs.push({
          accountId: acctId,
          accountType: acctType,
          currency,
          id: tx.id,
          date: tx.date,
          amount: tx.amount,
          type: tx.type,
          payee: tx.payee,
          memo: tx.memo,
          category: tx.category || '',
          checkNumber: tx.checkNumber || ''
        });
      }
    }

    return flatTxs;
  }

  /**
   * Convert JSON transactions to QIF/QFX/QBO
   * @param {Array<object>} jsonTxs
   * @param {string} [format='QIF']
   * @returns {string}
   */
  static fromJson(jsonTxs, format = 'QIF') {
    const txList = Array.isArray(jsonTxs) ? jsonTxs : [jsonTxs];
    const statement = {
      format,
      accounts: [
        {
          accountId: '123456789',
          type: 'Bank',
          currency: 'USD',
          transactions: txList
        }
      ]
    };

    if (format.toUpperCase() === 'QIF') {
      return FinancialSerializer.toQif(statement);
    } else if (format.toUpperCase() === 'QBO') {
      return FinancialSerializer.toQbo(statement);
    } else if (format.toUpperCase() === 'QFX') {
      return FinancialSerializer.toQfx(statement);
    } else {
      return FinancialSerializer.toOfx(statement);
    }
  }

  /**
   * Convert financial statement to standard CSV
   * @param {string|object} input
   * @param {object} [options]
   * @returns {string} CSV representation
   */
  static toCsv(input, options = {}) {
    const txs = FinancialConverter.toJson(input);
    return CsvConverter.jsonToCsv(txs, options);
  }

  /**
   * Convert CSV transactions to QIF, QFX, or QBO
   * @param {string} csvText
   * @param {string} [format='QIF']
   * @returns {string}
   */
  static fromCsv(csvText, format = 'QIF') {
    const txs = CsvConverter.csvToJson(csvText);
    return FinancialConverter.fromJson(txs, format);
  }

  /**
   * Convert financial statement to an Excel workbook
   * @param {string|object} input
   * @returns {ExcelWorkbook}
   */
  static toExcel(input) {
    const txs = FinancialConverter.toJson(input);
    const wb = new ExcelWorkbook();
    const ws = wb.addWorksheet('Transactions');

    if (txs.length === 0) {
      ws.addRow(['No Transactions Found']);
      return wb;
    }

    const headers = Object.keys(txs[0]);
    ws.addRow(headers);

    for (const tx of txs) {
      ws.addRow(headers.map(h => tx[h]));
    }

    return wb;
  }

  /**
   * Convert financial statement transactions to Markdown table
   * @param {string|object} input
   * @returns {string}
   */
  static toMarkdown(input) {
    const txs = FinancialConverter.toJson(input);
    return CsvConverter.jsonToMarkdown(txs);
  }

  /**
   * Convert financial statement to XML
   * @param {string|object} input
   * @returns {string}
   */
  static toXml(input) {
    const model = typeof input === 'string' ? FinancialParser.parse(input) : input;
    return FinancialSerializer.toOfx(model);
  }
}
