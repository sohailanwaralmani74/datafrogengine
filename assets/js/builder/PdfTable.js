import { PdfFontMetrics } from './PdfFontMetrics.js';
import { PdfPageModifier } from '../modification/PdfPageModifier.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Structured multi-column, multi-row table builder with automatic cell wrapping,
 * borders, backgrounds, zebra-striping, and multi-page splitting.
 */
export class PdfTable {
  /** @type {Array<string|number>} */
  #columnDefinitions;

  /** @type {Array<any>} */
  #headers;

  /** @type {Array<Array<any>>} */
  #rows;

  /** @type {{ top: number, right: number, bottom: number, left: number }} */
  #cellPadding;

  /** @type {string|null} */
  #borderColor;

  /** @type {number} */
  #borderWidth;

  /** @type {string|null} */
  #headerFillColor;

  /** @type {string} */
  #headerTextColor;

  /** @type {string} */
  #headerFont;

  /** @type {number} */
  #headerFontSize;

  /** @type {string} */
  #bodyFont;

  /** @type {number} */
  #bodyFontSize;

  /** @type {string} */
  #bodyTextColor;

  /** @type {string|null} */
  #alternateRowColor;

  /** @type {boolean} */
  #repeatHeaderOnNewPage;

  /** @type {number} */
  #spacingBefore;

  /** @type {number} */
  #spacingAfter;

  /**
   * @param {Object} options
   * @param {Array<string|number>} [options.columns] - e.g. [100, '40%', 'auto']
   * @param {Array<any>} [options.headers=[]]
   * @param {Array<Array<any>>} [options.rows=[]]
   * @param {number|Object} [options.cellPadding=5]
   * @param {string} [options.borderColor='#cccccc']
   * @param {number} [options.borderWidth=0.5]
   * @param {string} [options.headerFillColor='#f0f0f0']
   * @param {string} [options.headerTextColor='#000000']
   * @param {string} [options.headerFont='Helvetica-Bold']
   * @param {number} [options.headerFontSize=10]
   * @param {string} [options.bodyFont='Helvetica']
   * @param {number} [options.bodyFontSize=10]
   * @param {string} [options.bodyTextColor='#000000']
   * @param {string|null} [options.alternateRowColor=null]
   * @param {boolean} [options.repeatHeaderOnNewPage=true]
   * @param {number} [options.spacingBefore=6]
   * @param {number} [options.spacingAfter=6]
   */
  constructor(options = {}) {
    this.#headers = Array.isArray(options.headers) ? options.headers : [];
    this.#rows = Array.isArray(options.rows) ? options.rows : [];
    this.#columnDefinitions = Array.isArray(options.columns) ? options.columns : [];

    const pad = options.cellPadding !== undefined ? options.cellPadding : 5;
    if (typeof pad === 'number') {
      this.#cellPadding = { top: pad, right: pad, bottom: pad, left: pad };
    } else if (typeof pad === 'object' && pad !== null) {
      this.#cellPadding = {
        top: pad.top ?? 5,
        right: pad.right ?? 5,
        bottom: pad.bottom ?? 5,
        left: pad.left ?? 5
      };
    } else {
      this.#cellPadding = { top: 5, right: 5, bottom: 5, left: 5 };
    }

    this.#borderColor = options.borderColor !== undefined ? options.borderColor : '#cccccc';
    this.#borderWidth = typeof options.borderWidth === 'number' ? options.borderWidth : 0.5;
    this.#headerFillColor = options.headerFillColor !== undefined ? options.headerFillColor : '#f0f0f0';
    this.#headerTextColor = options.headerTextColor || '#000000';
    this.#headerFont = options.headerFont || 'Helvetica-Bold';
    this.#headerFontSize = typeof options.headerFontSize === 'number' ? options.headerFontSize : 10;
    this.#bodyFont = options.bodyFont || 'Helvetica';
    this.#bodyFontSize = typeof options.bodyFontSize === 'number' ? options.bodyFontSize : 10;
    this.#bodyTextColor = options.bodyTextColor || '#000000';
    this.#alternateRowColor = options.alternateRowColor || null;
    this.#repeatHeaderOnNewPage = options.repeatHeaderOnNewPage !== false;
    this.#spacingBefore = typeof options.spacingBefore === 'number' ? options.spacingBefore : 6;
    this.#spacingAfter = typeof options.spacingAfter === 'number' ? options.spacingAfter : 6;
  }

  get headers() { return this.#headers; }
  get rows() { return this.#rows; }
  get spacingBefore() { return this.#spacingBefore; }
  get spacingAfter() { return this.#spacingAfter; }
  get repeatHeaderOnNewPage() { return this.#repeatHeaderOnNewPage; }

  /**
   * Adds a row of cells to the table.
   * @param {Array<any>} row
   * @returns {PdfTable}
   */
  addRow(row) {
    if (!Array.isArray(row)) {
      throw new PdfInvalidArgumentException('row', row, 'Array');
    }
    this.#rows.push(row);
    return this;
  }

  /**
   * Resolves the number of columns in the table.
   * @returns {number}
   */
  getColumnCount() {
    let count = this.#columnDefinitions.length;
    if (count === 0 && this.#headers.length > 0) {
      count = this.#headers.length;
    }
    for (const row of this.#rows) {
      if (Array.isArray(row) && row.length > count) {
        count = row.length;
      }
    }
    return Math.max(1, count);
  }

  /**
   * Computes column point widths given the total available table width.
   * 
   * @param {number} availableWidth
   * @returns {Array<number>}
   */
  resolveColumnWidths(availableWidth) {
    const colCount = this.getColumnCount();
    const result = new Array(colCount).fill(0);
    let remainingWidth = availableWidth;
    let autoColIndices = [];

    for (let i = 0; i < colCount; i++) {
      const def = this.#columnDefinitions[i];
      if (typeof def === 'number') {
        result[i] = def;
        remainingWidth -= def;
      } else if (typeof def === 'string' && def.endsWith('%')) {
        const pct = parseFloat(def) / 100;
        const width = availableWidth * pct;
        result[i] = width;
        remainingWidth -= width;
      } else {
        autoColIndices.push(i);
      }
    }

    if (autoColIndices.length > 0) {
      const autoWidth = Math.max(0, remainingWidth / autoColIndices.length);
      for (const idx of autoColIndices) {
        result[idx] = autoWidth;
      }
    }

    return result;
  }

  /**
   * Normalizes cell data to a standard cell object.
   * @private
   */
  #normalizeCell(cellData, isHeader = false) {
    if (cellData !== null && typeof cellData === 'object' && !Array.isArray(cellData)) {
      return {
        text: cellData.text !== undefined ? String(cellData.text) : '',
        font: cellData.font || (isHeader ? this.#headerFont : this.#bodyFont),
        fontSize: cellData.fontSize || (isHeader ? this.#headerFontSize : this.#bodyFontSize),
        color: cellData.color || cellData.textColor || (isHeader ? this.#headerTextColor : this.#bodyTextColor),
        fillColor: cellData.fillColor !== undefined ? cellData.fillColor : (isHeader ? this.#headerFillColor : null),
        align: cellData.align || (isHeader ? 'center' : 'left'),
        padding: cellData.padding ? {
          top: cellData.padding.top ?? this.#cellPadding.top,
          right: cellData.padding.right ?? this.#cellPadding.right,
          bottom: cellData.padding.bottom ?? this.#cellPadding.bottom,
          left: cellData.padding.left ?? this.#cellPadding.left
        } : this.#cellPadding
      };
    }

    return {
      text: cellData !== undefined && cellData !== null ? String(cellData) : '',
      font: isHeader ? this.#headerFont : this.#bodyFont,
      fontSize: isHeader ? this.#headerFontSize : this.#bodyFontSize,
      color: isHeader ? this.#headerTextColor : this.#bodyTextColor,
      fillColor: isHeader ? this.#headerFillColor : null,
      align: isHeader ? 'center' : 'left',
      padding: this.#cellPadding
    };
  }

  /**
   * Computes the height of a specific row given column widths.
   * 
   * @param {Array<any>} rowData
   * @param {Array<number>} colWidths
   * @param {boolean} [isHeader=false]
   * @returns {{ height: number, cells: Array<any> }}
   */
  computeRowLayout(rowData, colWidths, isHeader = false) {
    const colCount = colWidths.length;
    const cells = [];
    let maxHeight = 0;

    for (let c = 0; c < colCount; c++) {
      const rawCell = rowData ? rowData[c] : '';
      const cell = this.#normalizeCell(rawCell, isHeader);
      const colWidth = colWidths[c] || 0;
      const innerWidth = Math.max(0, colWidth - cell.padding.left - cell.padding.right);

      const lines = PdfFontMetrics.wrapText(cell.text, innerWidth, cell.font, cell.fontSize);
      const lineHeight = cell.fontSize * 1.2;
      const textHeight = lines.length * lineHeight;
      const totalCellHeight = cell.padding.top + textHeight + cell.padding.bottom;

      if (totalCellHeight > maxHeight) {
        maxHeight = totalCellHeight;
      }

      cells.push({
        ...cell,
        lines,
        lineHeight
      });
    }

    return {
      height: Math.max(16, maxHeight),
      cells
    };
  }

  /**
   * Returns layout heights for header and all rows.
   * 
   * @param {number} availableWidth
   * @returns {{ colWidths: Array<number>, headerLayout: any, rowLayouts: Array<any>, totalHeight: number }}
   */
  layout(availableWidth) {
    const colWidths = this.resolveColumnWidths(availableWidth);
    const headerLayout = this.#headers.length > 0 ? this.computeRowLayout(this.#headers, colWidths, true) : null;
    const rowLayouts = this.#rows.map(row => this.computeRowLayout(row, colWidths, false));

    let totalHeight = this.#spacingBefore + this.#spacingAfter;
    if (headerLayout) {
      totalHeight += headerLayout.height;
    }
    for (const r of rowLayouts) {
      totalHeight += r.height;
    }

    return {
      colWidths,
      headerLayout,
      rowLayouts,
      totalHeight
    };
  }

  /**
   * Renders a single row onto the page modifier.
   * 
   * @param {PdfPageModifier} modifier
   * @param {Object} rowLayout
   * @param {number} x - Left X
   * @param {number} topY - Top Y of this row
   * @param {Array<number>} colWidths
   * @param {string|null} [defaultFillColor=null]
   * @returns {number} New topY after rendering this row
   */
  renderRow(modifier, rowLayout, x, topY, colWidths, defaultFillColor = null) {
    const rowHeight = rowLayout.height;
    const bottomY = topY - rowHeight;
    let curX = x;

    for (let c = 0; c < colWidths.length; c++) {
      const colWidth = colWidths[c];
      const cell = rowLayout.cells[c];
      const cellFillColor = cell.fillColor || defaultFillColor;

      // Draw cell background and border
      modifier.drawRectangle({
        x: curX,
        y: bottomY,
        width: colWidth,
        height: rowHeight,
        fillColor: cellFillColor,
        borderColor: this.#borderColor,
        borderWidth: this.#borderWidth
      });

      // Draw cell text lines
      if (cell.lines && cell.lines.length > 0) {
        let textY = topY - cell.padding.top - (cell.lineHeight * 0.8);
        const innerWidth = colWidth - cell.padding.left - cell.padding.right;

        for (const line of cell.lines) {
          let textX = curX + cell.padding.left;
          if (cell.align === 'center') {
            textX += (innerWidth - line.width) / 2;
          } else if (cell.align === 'right') {
            textX += (innerWidth - line.width);
          }

          if (line.text.length > 0) {
            modifier.drawText(line.text, {
              x: textX,
              y: textY,
              size: cell.fontSize,
              font: cell.font,
              color: cell.color,
              align: 'left'
            });
          }
          textY -= cell.lineHeight;
        }
      }

      curX += colWidth;
    }

    return bottomY;
  }
}
