import fs from 'node:fs';
import { ExcelWorksheet } from './ExcelWorksheet.js';
import { ExcelWriter } from '../io/ExcelWriter.js';
import { ExcelReader } from '../io/ExcelReader.js';

/**
 * Top-level Excel Workbook representing an entire XLSX spreadsheet document.
 */
export class ExcelWorkbook {
  constructor() {
    /** @type {ExcelWorksheet[]} */
    this.worksheets = [];
    this.properties = {
      title: 'Workbook',
      creator: 'Excel Engine',
      created: new Date(),
      modified: new Date()
    };
  }

  /**
   * Adds a new worksheet with the given name.
   * @param {string} [name] Sheet name (defaults to "Sheet1", "Sheet2", etc.)
   * @returns {ExcelWorksheet}
   */
  addWorksheet(name = undefined) {
    const sheetName = name || `Sheet${this.worksheets.length + 1}`;
    // Ensure name uniqueness
    let finalName = sheetName;
    let counter = 1;
    while (this.worksheets.some((ws) => ws.name.toLowerCase() === finalName.toLowerCase())) {
      finalName = `${sheetName} (${counter++})`;
    }

    const ws = new ExcelWorksheet(finalName, this);
    this.worksheets.push(ws);
    return ws;
  }

  /**
   * Retrieves a worksheet by name or 0-based index.
   * @param {string|number} nameOrIndex
   * @returns {ExcelWorksheet|null}
   */
  getWorksheet(nameOrIndex) {
    if (typeof nameOrIndex === 'number') {
      return this.worksheets[nameOrIndex] || null;
    }
    const lower = String(nameOrIndex).toLowerCase();
    return this.worksheets.find((ws) => ws.name.toLowerCase() === lower) || null;
  }

  /**
   * Removes a worksheet by name or index.
   * @param {string|number} nameOrIndex
   * @returns {boolean}
   */
  removeWorksheet(nameOrIndex) {
    const idx = typeof nameOrIndex === 'number'
      ? nameOrIndex
      : this.worksheets.findIndex((ws) => ws.name.toLowerCase() === String(nameOrIndex).toLowerCase());

    if (idx >= 0 && idx < this.worksheets.length) {
      this.worksheets.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * List of all sheet names in this workbook.
   * @returns {string[]}
   */
  get sheetNames() {
    return this.worksheets.map((ws) => ws.name);
  }

  /**
   * Evaluates all formula cells across all sheets in the workbook.
   * @returns {ExcelWorkbook}
   */
  calculateAllFormulas() {
    for (const sheet of this.worksheets) {
      sheet.calculateFormulas();
    }
    return this;
  }

  /**
   * Serializes this workbook into an XLSX binary buffer.
   * @returns {Uint8Array}
   */
  save() {
    if (this.worksheets.length === 0) {
      this.addWorksheet('Sheet1');
    }
    return ExcelWriter.write(this);
  }

  /**
   * Alias for save().
   * @returns {Uint8Array}
   */
  toBuffer() {
    return this.save();
  }

  /**
   * Saves workbook directly to a file on disk (Node.js runtime).
   * @param {string} filePath
   */
  saveToFile(filePath) {
    const buffer = this.save();
    fs.writeFileSync(filePath, buffer);
  }

  /**
   * Parses an XLSX binary buffer or file path into a high-level ExcelWorkbook.
   * 
   * @param {Uint8Array|Buffer|ArrayBuffer|string} bufferOrPath
   * @returns {ExcelWorkbook}
   */
  static open(bufferOrPath) {
    let bytes;
    if (typeof bufferOrPath === 'string') {
      bytes = fs.readFileSync(bufferOrPath);
    } else {
      bytes = bufferOrPath;
    }
    return ExcelReader.read(bytes, ExcelWorkbook);
  }

  /**
   * Creates a workbook populated from CSV text.
   * 
   * @param {string} csvText
   * @param {string} [sheetName='Sheet1']
   * @param {string} [delimiter=',']
   * @returns {ExcelWorkbook}
   */
  static fromCsv(csvText, sheetName = 'Sheet1', delimiter = ',') {
    const wb = new ExcelWorkbook();
    const ws = wb.addWorksheet(sheetName);

    const lines = csvText.split(/\r?\n/);
    for (let r = 0; r < lines.length; r++) {
      const line = lines[r].trim();
      if (!line) continue;

      // Parse CSV line with quote handling
      const tokens = [];
      let inQuotes = false;
      let current = '';

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          tokens.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      tokens.push(current.trim());

      const rowValues = tokens.map((t) => {
        if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
        if (/^true$/i.test(t)) return true;
        if (/^false$/i.test(t)) return false;
        return t;
      });

      ws.addRow(rowValues);
    }

    return wb;
  }

  /**
   * Exports a worksheet as CSV text.
   * 
   * @param {string|number} [sheetNameOrIndex=0]
   * @param {string} [delimiter=',']
   * @returns {string}
   */
  toCsv(sheetNameOrIndex = 0, delimiter = ',') {
    const ws = this.getWorksheet(sheetNameOrIndex);
    if (!ws) {
      throw new Error(`Worksheet not found: ${sheetNameOrIndex}`);
    }
    return ws.toCsv(delimiter);
  }

  /**
   * Exports a worksheet as an array of JSON objects (using row 1 as headers).
   * 
   * @param {string|number} [sheetNameOrIndex=0]
   * @returns {Array<Object>}
   */
  toJson(sheetNameOrIndex = 0) {
    const ws = this.getWorksheet(sheetNameOrIndex);
    if (!ws) {
      throw new Error(`Worksheet not found: ${sheetNameOrIndex}`);
    }
    return ws.toJson();
  }

  /**
   * Creates a new ExcelWorkbook directly from an array of JSON objects.
   * 
   * @param {Array<Object>} jsonData
   * @param {string} [sheetName='Sheet1']
   * @returns {ExcelWorkbook}
   */
  static fromJson(jsonData, sheetName = 'Sheet1') {
    const wb = new ExcelWorkbook();
    const ws = wb.addWorksheet(sheetName);

    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      return wb;
    }

    const headers = Object.keys(jsonData[0]);
    ws.addRow(headers);

    for (const item of jsonData) {
      const row = headers.map(h => (item && item[h] !== undefined ? item[h] : ''));
      ws.addRow(row);
    }

    return wb;
  }
}

