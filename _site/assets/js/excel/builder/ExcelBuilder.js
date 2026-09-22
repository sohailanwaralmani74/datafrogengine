import { ExcelWorkbook } from '../model/ExcelWorkbook.js';
import { ExcelStyle } from '../styles/ExcelStyle.js';

/**
 * High-level, fluent spreadsheet document builder.
 * Analogous to PdfDocumentBuilder for rapid, declarative report generation.
 */
export class ExcelBuilder {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.title]
   * @param {string} [options.creator]
   * @param {string} [options.themeColor='0055A5'] Primary corporate branding color
   */
  constructor(options = {}) {
    this.workbook = new ExcelWorkbook();
    if (options.title) this.workbook.properties.title = options.title;
    if (options.creator) this.workbook.properties.creator = options.creator;
    this.themeColor = options.themeColor || '0055A5';
    this.currentSheet = null;
  }

  /**
   * Sets the active sheet or creates a new sheet if it does not exist.
   * @param {string} name
   * @returns {ExcelBuilder}
   */
  sheet(name) {
    let ws = this.workbook.getWorksheet(name);
    if (!ws) {
      ws = this.workbook.addWorksheet(name);
    }
    this.currentSheet = ws;
    return this;
  }

  #ensureSheet() {
    if (!this.currentSheet) {
      this.sheet('Sheet1');
    }
    return this.currentSheet;
  }

  /**
   * Adds an executive title and optional subtitle with stylized banner fonts.
   * 
   * @param {string} title
   * @param {Object} [options={}]
   * @param {string} [options.subtitle]
   * @param {number} [options.mergeColumns=6]
   * @returns {ExcelBuilder}
   */
  title(title, options = {}) {
    const ws = this.#ensureSheet();
    const mergeCols = options.mergeColumns || 6;

    // Title Row
    const titleRow = ws.addRow([title]);
    titleRow.height = 36;
    titleRow.getCell(1).setStyle(new ExcelStyle({
      font: { name: 'Calibri', size: 18, bold: true, color: this.themeColor },
      alignment: { vertical: 'center', horizontal: 'left' }
    }));
    ws.mergeCells(`A${titleRow.rowNumber}:${String.fromCharCode(64 + mergeCols)}${titleRow.rowNumber}`);

    // Subtitle Row if provided
    if (options.subtitle) {
      const subRow = ws.addRow([options.subtitle]);
      subRow.height = 20;
      subRow.getCell(1).setStyle(new ExcelStyle({
        font: { name: 'Calibri', size: 11, italic: true, color: '666666' },
        alignment: { vertical: 'center', horizontal: 'left' }
      }));
      ws.mergeCells(`A${subRow.rowNumber}:${String.fromCharCode(64 + mergeCols)}${subRow.rowNumber}`);
    }

    this.blankRow();
    return this;
  }

  /**
   * Adds a styled structured data table with headers, alternating rows, and optional totals row.
   * 
   * @param {Object} config
   * @param {string[]} config.headers
   * @param {Array<Array<*>>} config.rows
   * @param {number[]} [config.columnWidths]
   * @param {boolean} [config.totalRow=false]
   * @param {string[]} [config.totalLabels] e.g. ['Total', '', 'SUM', 'AVERAGE']
   * @returns {ExcelBuilder}
   */
  table(config) {
    const ws = this.#ensureSheet();
    const headers = config.headers || [];
    const rows = config.rows || [];

    // Apply column widths if specified
    if (Array.isArray(config.columnWidths)) {
      for (let i = 0; i < config.columnWidths.length; i++) {
        ws.setColumnWidth(i + 1, config.columnWidths[i]);
      }
    } else {
      // Auto-fit approx widths based on header length
      for (let i = 0; i < headers.length; i++) {
        const currentW = ws.getColumn(i + 1).width || 10;
        ws.setColumnWidth(i + 1, Math.max(currentW, String(headers[i]).length + 6));
      }
    }

    // Header Style
    const headerStyle = new ExcelStyle({
      font: { name: 'Calibri', size: 11, bold: true, color: 'FFFFFF' },
      fill: { pattern: 'solid', fgColor: this.themeColor },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        bottom: { style: 'medium', color: 'FFFFFF' },
        top: { style: 'thin', color: this.themeColor },
        left: { style: 'thin', color: this.themeColor },
        right: { style: 'thin', color: this.themeColor }
      }
    });

    const headerRow = ws.addRow(headers);
    headerRow.height = 26;
    for (let c = 1; c <= headers.length; c++) {
      headerRow.getCell(c).setStyle(headerStyle);
    }

    const firstDataRow = headerRow.rowNumber + 1;

    // Zebra striping data styles
    const regularStyle = new ExcelStyle({
      font: { name: 'Calibri', size: 11 },
      alignment: { vertical: 'center' },
      border: {
        bottom: { style: 'thin', color: 'E0E0E0' },
        left: { style: 'thin', color: 'E0E0E0' },
        right: { style: 'thin', color: 'E0E0E0' }
      }
    });

    const alternateStyle = new ExcelStyle({
      font: { name: 'Calibri', size: 11 },
      fill: { pattern: 'solid', fgColor: 'F7F9FC' },
      alignment: { vertical: 'center' },
      border: {
        bottom: { style: 'thin', color: 'E0E0E0' },
        left: { style: 'thin', color: 'E0E0E0' },
        right: { style: 'thin', color: 'E0E0E0' }
      }
    });

    for (let i = 0; i < rows.length; i++) {
      const rowData = rows[i];
      const dataRow = ws.addRow(rowData);
      dataRow.height = 20;
      const st = i % 2 === 1 ? alternateStyle : regularStyle;
      for (let c = 1; c <= rowData.length; c++) {
        dataRow.getCell(c).setStyle(st);
      }
    }

    const lastDataRow = ws.rowCount;

    // Totals Row
    if (config.totalRow && rows.length > 0) {
      const totalValues = [];
      const totalRowOperations = config.totalLabels || ['Total'];

      for (let c = 0; c < headers.length; c++) {
        const op = totalRowOperations[c] || (c === 0 ? 'Total' : '');
        const colLetter = String.fromCharCode(65 + c);

        if (op.toUpperCase() === 'SUM') {
          totalValues.push(`=SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})`);
        } else if (op.toUpperCase() === 'AVERAGE') {
          totalValues.push(`=AVERAGE(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})`);
        } else if (op.toUpperCase() === 'COUNT') {
          totalValues.push(`=COUNT(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})`);
        } else {
          totalValues.push(op);
        }
      }

      const totRow = ws.addRow(totalValues);
      totRow.height = 24;

      const totalStyle = new ExcelStyle({
        font: { name: 'Calibri', size: 11, bold: true },
        fill: { pattern: 'solid', fgColor: 'EAEEF3' },
        border: {
          top: { style: 'thin', color: '333333' },
          bottom: { style: 'double', color: '333333' }
        },
        alignment: { vertical: 'center' }
      });

      for (let c = 1; c <= headers.length; c++) {
        totRow.getCell(c).setStyle(totalStyle);
      }
    }

    this.blankRow();
    return this;
  }

  /**
   * Adds blank separator rows.
   * @param {number} [count=1]
   * @returns {ExcelBuilder}
   */
  blankRow(count = 1) {
    const ws = this.#ensureSheet();
    for (let i = 0; i < count; i++) {
      ws.addRow([]);
    }
    return this;
  }

  /**
   * Finalizes and returns the complete ExcelWorkbook instance.
   * @returns {ExcelWorkbook}
   */
  build() {
    this.#ensureSheet();
    return this.workbook;
  }

  /**
   * Compiles the workbook into a binary XLSX Uint8Array buffer.
   * @returns {Uint8Array}
   */
  save() {
    return this.build().save();
  }
}
