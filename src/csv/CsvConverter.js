/**
 * CsvConverter - Bi-directional multi-format conversions across CSV, JSON, XML,
 * YAML, Markdown, HTML, Excel (.xlsx), and PDF.
 */

import { CsvParser } from './CsvParser.js';
import { CsvSerializer } from './CsvSerializer.js';
import { ExcelWorkbook, ExcelStyle } from '../excel/index.js';
import { PdfDocumentBuilder } from '../builder/index.js';

export class CsvConverter {
  /**
   * Convert CSV text to JSON
   * @param {string} csvText
   * @param {object} [options]
   * @returns {string|Array<object>}
   */
  static csvToJson(csvText, options = {}) {
    const records = CsvParser.parse(csvText, {
      ...options,
      asObjects: options.asObjects !== false
    });

    if (options.stringify !== false) {
      const indent = options.indent !== undefined ? options.indent : 2;
      return JSON.stringify(records, null, indent);
    }
    return records;
  }

  /**
   * Convert JSON data or JSON string to CSV text
   * @param {string|Array<object>|Array<Array<any>>} jsonData
   * @param {object} [options]
   * @returns {string}
   */
  static jsonToCsv(jsonData, options = {}) {
    let data = jsonData;
    if (typeof jsonData === 'string') {
      data = JSON.parse(jsonData);
    }

    if (!Array.isArray(data)) {
      data = [data];
    }

    return CsvSerializer.serialize(data, options);
  }

  /**
   * Convert CSV to XML 1.0 Document
   * @param {string} csvText
   * @param {object} [options]
   * @returns {string}
   */
  static csvToXml(csvText, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true });
    const rootTag = options.rootTag || 'dataset';
    const rowTag = options.rowTag || 'row';
    const indent = options.indent !== undefined ? options.indent : 2;
    const pad = ' '.repeat(indent);

    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<${rootTag}>`];

    for (const record of records) {
      lines.push(`${pad}<${rowTag}>`);
      for (const [key, val] of Object.entries(record)) {
        // Sanitize tag name
        const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        const strVal = val === null || val === undefined ? '' : String(val);
        const escapedVal = strVal
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
        lines.push(`${pad}${pad}<${cleanKey}>${escapedVal}</${cleanKey}>`);
      }
      lines.push(`${pad}</${rowTag}>`);
    }

    lines.push(`</${rootTag}>`);
    return lines.join('\n');
  }

  /**
   * Convert structured XML string to CSV
   * @param {string} xmlText
   * @param {object} [options]
   * @returns {string}
   */
  static xmlToCsv(xmlText, options = {}) {
    // Lightweight regex-based XML row extractor for zero-dep environments
    const rowRegex = /<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g;
    const tagRegex = /<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g;

    const rows = [];
    const rootMatch = xmlText.match(/<([a-zA-Z0-9_-]+)[\s>]/);
    if (!rootMatch) return '';

    // Match child blocks
    const lines = xmlText.replace(/<\?xml[\s\S]*?\?>/, '').trim();
    let rowMatch;
    const records = [];

    // Find repeating blocks
    const matches = Array.from(lines.matchAll(/<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g));
    for (const m of matches) {
      const innerXml = m[2];
      const fieldMatches = Array.from(innerXml.matchAll(/<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g));
      if (fieldMatches.length > 0) {
        const obj = {};
        for (const fm of fieldMatches) {
          obj[fm[1]] = fm[2].trim()
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
        }
        records.push(obj);
      }
    }

    return CsvSerializer.serialize(records, options);
  }

  /**
   * Convert CSV to YAML format
   * @param {string} csvText
   * @param {object} [options]
   * @returns {string}
   */
  static csvToYaml(csvText, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true });
    const lines = [];

    for (const rec of records) {
      lines.push('- ');
      let first = true;
      for (const [k, v] of Object.entries(rec)) {
        const valStr = v === null || v === undefined ? 'null' : (typeof v === 'string' && (v.includes(':') || v.includes('#')) ? `"${v}"` : String(v));
        if (first) {
          lines[lines.length - 1] = `- ${k}: ${valStr}`;
          first = false;
        } else {
          lines.push(`  ${k}: ${valStr}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Convert CSV to Markdown Table (GitHub Flavored Markdown)
   * @param {string} csvText
   * @param {object} [options]
   * @returns {string}
   */
  static csvToMarkdown(csvText, options = {}) {
    const rawRows = CsvParser.parse(csvText, { ...options, asObjects: false });
    if (rawRows.length === 0) return '';

    const headers = rawRows[0];
    const dataRows = rawRows.slice(1);
    const colAlignments = options.align || []; // 'left', 'center', 'right'

    // Compute column widths
    const colWidths = headers.map((h, i) => {
      let maxLen = String(h).length;
      for (const row of dataRows) {
        if (row[i] !== undefined) {
          maxLen = Math.max(maxLen, String(row[i]).length);
        }
      }
      return Math.max(maxLen, 3);
    });

    const lines = [];

    // Header row
    const headerCells = headers.map((h, i) => String(h).padEnd(colWidths[i]));
    lines.push(`| ${headerCells.join(' | ')} |`);

    // Separator row
    const sepCells = colWidths.map((w, i) => {
      const align = colAlignments[i] || 'left';
      if (align === 'center') return `:${'-'.repeat(w - 2)}:`;
      if (align === 'right') return `${'-'.repeat(w - 1)}:`;
      return `${'-'.repeat(w)}`;
    });
    lines.push(`| ${sepCells.join(' | ')} |`);

    // Data rows
    for (const row of dataRows) {
      const rowCells = headers.map((_, i) => {
        const val = row[i] !== undefined ? String(row[i]) : '';
        const align = colAlignments[i] || 'left';
        if (align === 'right') return val.padStart(colWidths[i]);
        if (align === 'center') {
          const totalPad = colWidths[i] - val.length;
          const leftPad = Math.floor(totalPad / 2);
          const rightPad = totalPad - leftPad;
          return ' '.repeat(leftPad) + val + ' '.repeat(rightPad);
        }
        return val.padEnd(colWidths[i]);
      });
      lines.push(`| ${rowCells.join(' | ')} |`);
    }

    return lines.join('\n');
  }

  /**
   * Convert Markdown Table to CSV
   * @param {string} mdText
   * @param {object} [options]
   * @returns {string}
   */
  static markdownToCsv(mdText, options = {}) {
    const lines = mdText.split(/\r?\n/).filter(line => line.trim().startsWith('|'));
    if (lines.length === 0) return '';

    const rows = [];
    for (const line of lines) {
      // Skip separator row (e.g. |---|---|)
      if (/^\|\s*:?-+:?\s*\|/.test(line.trim())) continue;

      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    return CsvSerializer.serialize(rows, options);
  }

  /**
   * Convert CSV to HTML <table>
   * @param {string} csvText
   * @param {object} [options]
   * @returns {string}
   */
  static csvToHtml(csvText, options = {}) {
    const rawRows = CsvParser.parse(csvText, { ...options, asObjects: false });
    if (rawRows.length === 0) return '<table></table>';

    const tableClass = options.tableClass ? ` class="${options.tableClass}"` : '';
    const headers = rawRows[0];
    const dataRows = rawRows.slice(1);

    const lines = [`<table${tableClass}>`];
    lines.push('  <thead>');
    lines.push('    <tr>');
    for (const h of headers) {
      lines.push(`      <th>${escapeHtml(h)}</th>`);
    }
    lines.push('    </tr>');
    lines.push('  </thead>');

    lines.push('  <tbody>');
    for (const row of dataRows) {
      lines.push('    <tr>');
      for (let i = 0; i < headers.length; i++) {
        const val = row[i] !== undefined ? row[i] : '';
        lines.push(`      <td>${escapeHtml(val)}</td>`);
      }
      lines.push('    </tr>');
    }
    lines.push('  </tbody>');
    lines.push('</table>');

    return lines.join('\n');
  }

  /**
   * Convert CSV to Excel (.xlsx) byte buffer
   * @param {string} csvText
   * @param {object} [options]
   * @returns {Uint8Array}
   */
  static csvToExcel(csvText, options = {}) {
    const rows = CsvParser.parse(csvText, { ...options, asObjects: false, dynamicTyping: true });
    const wb = new ExcelWorkbook();
    const sheetName = options.sheetName || 'Data';
    const ws = wb.addWorksheet(sheetName);

    // Style for headers
    const headerStyle = new ExcelStyle({
      bold: true,
      fillColor: '003366',
      fontColor: 'FFFFFF',
      horizontalAlign: 'center',
      border: { style: 'thin', color: 'CCCCCC' }
    });

    const bodyStyle = new ExcelStyle({
      border: { style: 'thin', color: 'E2E8F0' }
    });

    for (let r = 0; r < rows.length; r++) {
      const rowData = rows[r];
      const isHeader = r === 0;

      for (let c = 0; c < rowData.length; c++) {
        const val = rowData[c];
        const cell = ws.getCell(r + 1, c + 1);
        cell.setValue(val);
        cell.setStyle(isHeader ? headerStyle : bodyStyle);
      }
    }

    return wb.writeToBuffer();
  }

  /**
   * Convert CSV to styled PDF document byte buffer
   * @param {string} csvText
   * @param {object} [options]
   * @returns {Uint8Array}
   */
  static csvToPdf(csvText, options = {}) {
    const rawRows = CsvParser.parse(csvText, { ...options, asObjects: false });
    if (rawRows.length === 0) {
      const builder = new PdfDocumentBuilder();
      builder.addHeading(options.title || 'CSV Data Export', { size: 18 });
      return builder.build();
    }

    const builder = new PdfDocumentBuilder({
      margins: { top: 36, bottom: 36, left: 36, right: 36 }
    });

    builder.addHeading(options.title || 'Tabular Data Report', { size: 20, align: 'center', color: [0, 0.2, 0.4] });
    builder.addSpacer(12);

    const headers = rawRows[0].map(h => String(h));
    const dataRows = rawRows.slice(1).map(row => 
      headers.map((_, i) => (row[i] !== undefined ? String(row[i]) : ''))
    );

    builder.addTable(headers, dataRows, {
      fontSize: 8,
      headerBgColor: [0.08, 0.24, 0.45],
      headerTextColor: [1, 1, 1],
      stripeColor: [0.96, 0.97, 0.99]
    });

    return builder.build();
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
