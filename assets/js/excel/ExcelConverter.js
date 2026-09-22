/**
 * ExcelConverter - Cross-format conversion for Excel Workbooks (.xlsx)
 * Converts to and from JSON, CSV, Markdown, HTML, XML, and PDF.
 */

import { ExcelWorkbook } from './model/ExcelWorkbook.js';
import { PdfDocumentBuilder } from '../builder/index.js';

export class ExcelConverter {
  /**
   * Converts a workbook or specific sheet to JSON array of objects
   * @param {ExcelWorkbook} workbook
   * @param {string|number} [sheet=0]
   * @returns {Array<object>}
   */
  static toJson(workbook, sheet = 0) {
    if (!(workbook instanceof ExcelWorkbook)) {
      throw new TypeError('Expected ExcelWorkbook instance');
    }
    const ws = workbook.getWorksheet(sheet);
    if (!ws) return [];
    return ws.toJson();
  }

  /**
   * Converts all sheets in workbook to a map of { sheetName: Array<object> }
   * @param {ExcelWorkbook} workbook
   * @returns {Record<string, Array<object>>}
   */
  static toMultiSheetJson(workbook) {
    if (!(workbook instanceof ExcelWorkbook)) {
      throw new TypeError('Expected ExcelWorkbook instance');
    }
    const result = {};
    for (const ws of workbook.worksheets) {
      result[ws.name] = ws.toJson();
    }
    return result;
  }

  /**
   * Converts a workbook sheet to CSV text
   * @param {ExcelWorkbook} workbook
   * @param {string|number} [sheet=0]
   * @param {string} [delimiter=',']
   * @returns {string}
   */
  static toCsv(workbook, sheet = 0, delimiter = ',') {
    if (!(workbook instanceof ExcelWorkbook)) {
      throw new TypeError('Expected ExcelWorkbook instance');
    }
    const ws = workbook.getWorksheet(sheet);
    if (!ws) return '';
    return ws.toCsv(delimiter);
  }

  /**
   * Converts a workbook sheet to Markdown table
   * @param {ExcelWorkbook} workbook
   * @param {string|number} [sheet=0]
   * @returns {string}
   */
  static toMarkdown(workbook, sheet = 0) {
    const json = ExcelConverter.toJson(workbook, sheet);
    if (json.length === 0) return '';
    const headers = Object.keys(json[0]);
    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRows = json.map(row => `| ${headers.map(h => (row[h] !== undefined ? String(row[h]) : '')).join(' | ')} |`);
    return [headerRow, separatorRow, ...dataRows].join('\n');
  }

  /**
   * Converts a workbook sheet to an HTML table
   * @param {ExcelWorkbook} workbook
   * @param {string|number} [sheet=0]
   * @param {object} [options]
   * @returns {string}
   */
  static toHtml(workbook, sheet = 0, options = {}) {
    const json = ExcelConverter.toJson(workbook, sheet);
    if (json.length === 0) return '<table></table>';

    const headers = Object.keys(json[0]);
    const className = options.className || 'excel-table';
    let html = `<table class="${className}" border="1" cellpadding="6" cellspacing="0">\n`;
    html += '  <thead>\n    <tr>\n';
    for (const h of headers) {
      html += `      <th>${escapeHtml(h)}</th>\n`;
    }
    html += '    </tr>\n  </thead>\n  <tbody>\n';
    for (const row of json) {
      html += '    <tr>\n';
      for (const h of headers) {
        html += `      <td>${escapeHtml(row[h] !== undefined ? row[h] : '')}</td>\n`;
      }
      html += '    </tr>\n';
    }
    html += '  </tbody>\n</table>';
    return html;
  }

  /**
   * Converts a workbook to structured XML
   * @param {ExcelWorkbook} workbook
   * @param {object} [options]
   * @returns {string}
   */
  static toXml(workbook, options = {}) {
    const rootTag = options.rootTag || 'Workbook';
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n`;
    for (const ws of workbook.worksheets) {
      const records = ws.toJson();
      xml += `  <Worksheet name="${escapeXmlAttr(ws.name)}">\n`;
      for (const rec of records) {
        xml += '    <Row>\n';
        for (const [k, v] of Object.entries(rec)) {
          const safeKey = k.replace(/[^\w-]/g, '_');
          xml += `      <${safeKey}>${escapeXmlText(v !== undefined && v !== null ? String(v) : '')}</${safeKey}>\n`;
        }
        xml += '    </Row>\n';
      }
      xml += '  </Worksheet>\n';
    }
    xml += `</${rootTag}>`;
    return xml;
  }

  /**
   * Converts a workbook sheet to a styled PDF document byte buffer
   * @param {ExcelWorkbook} workbook
   * @param {string|number} [sheet=0]
   * @param {object} [options]
   * @returns {Uint8Array}
   */
  static toPdf(workbook, sheet = 0, options = {}) {
    const ws = workbook.getWorksheet(sheet);
    const builder = new PdfDocumentBuilder({
      margins: { top: 36, bottom: 36, left: 36, right: 36 }
    });

    const sheetName = ws ? ws.name : 'Sheet';
    builder.addHeading(options.title || `Spreadsheet Report - ${sheetName}`, 1, {
      fontSize: 18,
      align: 'center',
      color: '#003366'
    });
    builder.addSpacer(10);

    const json = ws ? ws.toJson() : [];
    if (json.length === 0) {
      return builder.save();
    }

    const headers = Object.keys(json[0]);
    const dataRows = json.map(r => headers.map(h => (r[h] !== undefined ? String(r[h]) : '')));

    builder.addTable({
      headers,
      rows: dataRows,
      headerFontSize: 8,
      bodyFontSize: 8,
      headerFillColor: '#004080',
      headerTextColor: '#ffffff',
      alternateRowColor: '#f7fafc'
    });

    return builder.save();
  }

  /**
   * Create workbook from JSON records
   * @param {Array<object>} data
   * @param {string} [sheetName='Sheet1']
   * @returns {ExcelWorkbook}
   */
  static fromJson(data, sheetName = 'Sheet1') {
    return ExcelWorkbook.fromJson(data, sheetName);
  }

  /**
   * Create workbook from CSV string
   * @param {string} csvText
   * @param {string} [sheetName='Sheet1']
   * @param {string} [delimiter=',']
   * @returns {ExcelWorkbook}
   */
  static fromCsv(csvText, sheetName = 'Sheet1', delimiter = ',') {
    return ExcelWorkbook.fromCsv(csvText, sheetName, delimiter);
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXmlText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
