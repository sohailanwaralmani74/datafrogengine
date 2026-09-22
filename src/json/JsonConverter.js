/**
 * Pure JavaScript Universal JSON Data Converter
 * Seamlessly converts JSON to/from XML, CSV, YAML, NDJSON, Excel, and PDF.
 */

import { XmlConverter } from '../xml/index.js';
import { ExcelWorkbook } from '../excel/index.js';
import { PdfDocumentBuilder } from '../builder/PdfDocumentBuilder.js';

export class JsonConverter {
  /**
   * Convert JSON object/array to XML string
   */
  static toXml(data, rootTag = 'root', options = {}) {
    return XmlConverter.fromJson(data, rootTag, options);
  }

  /**
   * Convert XML string to JSON object/array
   */
  static fromXml(xmlString, options = {}) {
    return XmlConverter.toJson(xmlString, options);
  }

  /**
   * Convert JSON array of objects to CSV string
   */
  static toCsv(data, options = {}) {
    const {
      delimiter = ',',
      headers: explicitHeaders = null,
      quoteAll = false,
      lineEnding = '\n'
    } = options;

    if (!Array.isArray(data)) {
      if (typeof data === 'object' && data !== null) {
        data = [data];
      } else {
        throw new Error('Data must be an array of objects or an object to convert to CSV');
      }
    }

    if (data.length === 0) return '';

    // Determine headers
    const headers = explicitHeaders || Array.from(
      data.reduce((acc, row) => {
        if (typeof row === 'object' && row !== null) {
          Object.keys(row).forEach(k => acc.add(k));
        }
        return acc;
      }, new Set())
    );

    const escapeField = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      const needsQuote = quoteAll || str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r');
      if (needsQuote) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = headers.map(escapeField).join(delimiter);
    const rows = data.map(row => {
      return headers.map(h => escapeField(row && row[h] !== undefined ? row[h] : '')).join(delimiter);
    });

    return [headerLine, ...rows].join(lineEnding);
  }

  /**
   * Convert CSV string to JSON array of objects
   */
  static fromCsv(csvString, options = {}) {
    const {
      delimiter = ',',
      hasHeader = true,
      autoType = true
    } = options;

    if (!csvString || typeof csvString !== 'string') return [];

    const lines = [];
    let currentLine = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < csvString.length; i++) {
      const char = csvString[i];
      const nextChar = csvString[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentLine.push(currentField);
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip \n in \r\n
        }
        currentLine.push(currentField);
        currentField = '';
        if (currentLine.length > 1 || currentLine[0] !== '') {
          lines.push(currentLine);
        }
        currentLine = [];
      } else {
        currentField += char;
      }
    }

    if (currentField !== '' || currentLine.length > 0) {
      currentLine.push(currentField);
      lines.push(currentLine);
    }

    if (lines.length === 0) return [];

    const castValue = (str) => {
      if (!autoType) return str;
      const trimmed = str.trim();
      if (trimmed === '') return '';
      if (trimmed === 'true') return true;
      if (trimmed === 'false') return false;
      if (trimmed === 'null') return null;
      if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
      if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
      return str;
    };

    if (hasHeader) {
      const headers = lines[0].map(h => h.trim());
      const result = [];

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
          const key = headers[j] || `col_${j + 1}`;
          obj[key] = j < row.length ? castValue(row[j]) : null;
        }
        result.push(obj);
      }
      return result;
    } else {
      return lines.map(row => row.map(castValue));
    }
  }

  /**
   * Convert JSON to YAML string (Pure JavaScript)
   */
  static toYaml(data, indentLevel = 0) {
    const indent = '  '.repeat(indentLevel);

    if (data === null || data === undefined) {
      return 'null';
    }
    if (typeof data === 'boolean' || typeof data === 'number') {
      return String(data);
    }
    if (typeof data === 'string') {
      if (data.includes('\n')) {
        return '|\n' + data.split('\n').map(l => indent + '  ' + l).join('\n');
      }
      if (/[:#\[\]{},&*!|>'"%@`]/.test(data) || data === '' || /^\s|\s$/.test(data)) {
        return `"${data.replace(/"/g, '\\"')}"`;
      }
      return data;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';
      const lines = [];
      for (const item of data) {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const itemYaml = JsonConverter.toYaml(item, indentLevel + 1).trim();
          lines.push(`${indent}- ${itemYaml}`);
        } else {
          lines.push(`${indent}- ${JsonConverter.toYaml(item, indentLevel + 1)}`);
        }
      }
      return lines.join('\n');
    }

    if (typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.length === 0) return '{}';
      const lines = [];
      for (const key of keys) {
        const val = data[key];
        const safeKey = /[:#\[\]{},&*!|>'"%@`]/.test(key) ? `"${key}"` : key;
        if (typeof val === 'object' && val !== null && Object.keys(val).length > 0) {
          lines.push(`${indent}${safeKey}:\n${JsonConverter.toYaml(val, indentLevel + 1)}`);
        } else {
          lines.push(`${indent}${safeKey}: ${JsonConverter.toYaml(val, indentLevel)}`);
        }
      }
      return lines.join('\n');
    }

    return String(data);
  }

  /**
   * Parse lightweight YAML string to JSON
   */
  static fromYaml(yamlStr) {
    if (!yamlStr || typeof yamlStr !== 'string') return null;
    const lines = yamlStr.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));

    const parseBlock = (lineIdx, currentIndent) => {
      let result = null;
      let isArr = null;

      while (lineIdx < lines.length) {
        const line = lines[lineIdx];
        const lineIndent = line.search(/\S/);

        if (lineIndent < currentIndent) {
          break; // Indent reduced, back to caller
        }

        const trimmed = line.trim();

        if (trimmed.startsWith('- ')) {
          if (isArr === null) {
            isArr = true;
            result = [];
          }
          const itemContent = trimmed.substring(2).trim();
          if (itemContent.includes(': ')) {
            const [k, ...vParts] = itemContent.split(': ');
            result.push({ [k.trim()]: parseVal(vParts.join(': ').trim()) });
          } else {
            result.push(parseVal(itemContent));
          }
          lineIdx++;
        } else if (trimmed.includes(':')) {
          if (isArr === null) {
            isArr = false;
            result = {};
          }
          const colonPos = trimmed.indexOf(':');
          const key = trimmed.substring(0, colonPos).trim().replace(/^["']|["']$/g, '');
          const rest = trimmed.substring(colonPos + 1).trim();

          if (rest === '') {
            // Nested block
            const [nestedVal, nextIdx] = parseBlock(lineIdx + 1, lineIndent + 1);
            result[key] = nestedVal;
            lineIdx = nextIdx;
          } else {
            result[key] = parseVal(rest);
            lineIdx++;
          }
        } else {
          lineIdx++;
        }
      }

      return [result, lineIdx];
    };

    const parseVal = (s) => {
      if (s === 'true') return true;
      if (s === 'false') return false;
      if (s === 'null' || s === '~') return null;
      if (/^-?\d+$/.test(s)) return parseInt(s, 10);
      if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
      return s.replace(/^["']|["']$/g, '');
    };

    const [parsed] = parseBlock(0, 0);
    return parsed;
  }

  /**
   * Convert JSON array to Newline-Delimited JSON (NDJSON)
   */
  static toNdjson(data) {
    if (!Array.isArray(data)) {
      data = [data];
    }
    return data.map(item => JSON.stringify(item)).join('\n');
  }

  /**
   * Convert Newline-Delimited JSON (NDJSON) string to JSON array
   */
  static fromNdjson(ndjsonStr) {
    if (!ndjsonStr || typeof ndjsonStr !== 'string') return [];
    return ndjsonStr
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line));
  }

  /**
   * Convert JSON tabular data to Excel (.xlsx) Uint8Array
   */
  static toExcel(data, options = {}) {
    const {
      sheetName = 'Data',
      title = 'Exported Dataset',
      headers = null
    } = options;

    const wb = new ExcelWorkbook();
    wb.properties.title = title;
    const ws = wb.addWorksheet(sheetName);

    if (Array.isArray(data) && data.length > 0) {
      const keys = headers || Object.keys(data[0]);

      // Add Header Row
      const headerRow = ws.addRow(keys);
      keys.forEach((k, idx) => {
        ws.setColumnWidth(idx + 1, Math.max(16, String(k).length + 4));
        headerRow.getCell(idx + 1).setStyle({
          font: { bold: true, color: 'FFFFFF' },
          fill: { fgColor: '0055A5' },
          alignment: { horizontal: 'center' }
        });
      });

      // Add Data Rows
      data.forEach(item => {
        const rowVals = keys.map(k => (item && item[k] !== undefined ? item[k] : ''));
        ws.addRow(rowVals);
      });
    }

    return wb.save();
  }

  /**
   * Convert JSON tabular data to PDF document Uint8Array
   */
  static toPdf(data, options = {}) {
    const {
      title = 'Data Report',
      subtitle = 'Generated via JSON Engine Converter',
      headers: customHeaders = null,
      pageSize = 'A4'
    } = options;

    const builder = new PdfDocumentBuilder({ pageSize, margins: 40 });
    builder.addHeading(title, 1);
    if (subtitle) {
      builder.addParagraph(subtitle);
    }

    if (Array.isArray(data) && data.length > 0) {
      const headers = customHeaders || Object.keys(data[0]);
      const rows = data.map(item => headers.map(h => String(item[h] !== undefined ? item[h] : '')));

      builder.addTable({
        headers,
        rows
      });
    }

    return builder.save();
  }
}
