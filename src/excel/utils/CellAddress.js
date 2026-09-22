/**
 * Excel cell address, coordinates, and range calculation utilities.
 * Coordinates are 1-based: A1 has col=1, row=1.
 */
export class CellAddress {
  /**
   * Converts a 1-based column number to Excel column letters (e.g. 1 -> "A", 27 -> "AA").
   * @param {number} colNumber 1-based column number
   * @returns {string}
   */
  static colIndexToName(colNumber) {
    if (typeof colNumber !== 'number' || colNumber < 1) {
      throw new RangeError(`Invalid column number: ${colNumber}. Must be >= 1`);
    }
    let name = '';
    let num = colNumber;
    while (num > 0) {
      const rem = (num - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      num = Math.floor((num - 1) / 26);
    }
    return name;
  }

  /**
   * Converts Excel column letters to 1-based column number (e.g. "A" -> 1, "AA" -> 27).
   * @param {string} colName
   * @returns {number}
   */
  static colNameToIndex(colName) {
    if (typeof colName !== 'string' || !/^[A-Za-z]+$/.test(colName)) {
      throw new TypeError(`Invalid column name: "${colName}"`);
    }
    const upper = colName.toUpperCase();
    let num = 0;
    for (let i = 0; i < upper.length; i++) {
      num = num * 26 + (upper.charCodeAt(i) - 64);
    }
    return num;
  }

  /**
   * Converts (col, row) coordinates into an A1 reference string.
   * @param {number} col 1-based column index
   * @param {number} row 1-based row index
   * @returns {string}
   */
  static toAddress(col, row) {
    return `${CellAddress.colIndexToName(col)}${row}`;
  }

  /**
   * Parses an A1 reference string into `{ col, row, colName, ref }`.
   * Also supports absolute references like `$A$1` or `A$1`.
   * 
   * @param {string} ref
   * @returns {{ col: number, row: number, colName: string, ref: string }}
   */
  static parseAddress(ref) {
    if (typeof ref !== 'string') {
      throw new TypeError(`Cell reference must be a string, got ${typeof ref}`);
    }
    const match = ref.trim().match(/^\$?([A-Za-z]+)\$?([0-9]+)$/);
    if (!match) {
      throw new Error(`Invalid cell reference format: "${ref}"`);
    }
    const colName = match[1].toUpperCase();
    const col = CellAddress.colNameToIndex(colName);
    const row = parseInt(match[2], 10);
    return {
      col,
      row,
      colName,
      ref: `${colName}${row}`
    };
  }

  /**
   * Parses a range string like "A1:C10" or single cell "A1" into bounding coordinates.
   * 
   * @param {string} rangeStr
   * @returns {{ start: { col: number, row: number, colName: string }, end: { col: number, row: number, colName: string }, range: string }}
   */
  static parseRange(rangeStr) {
    if (typeof rangeStr !== 'string') {
      throw new TypeError(`Range must be a string, got ${typeof rangeStr}`);
    }
    const clean = rangeStr.trim();
    if (clean.includes(':')) {
      const [startRef, endRef] = clean.split(':');
      const start = CellAddress.parseAddress(startRef);
      const end = CellAddress.parseAddress(endRef);
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      return {
        start: { col: minCol, row: minRow, colName: CellAddress.colIndexToName(minCol) },
        end: { col: maxCol, row: maxRow, colName: CellAddress.colIndexToName(maxCol) },
        range: `${CellAddress.colIndexToName(minCol)}${minRow}:${CellAddress.colIndexToName(maxCol)}${maxRow}`
      };
    }

    const single = CellAddress.parseAddress(clean);
    return {
      start: single,
      end: single,
      range: `${single.colName}${single.row}`
    };
  }

  /**
   * Constructs an A1:B2 range string from bounds.
   * @param {number} startCol
   * @param {number} startRow
   * @param {number} endCol
   * @param {number} endRow
   * @returns {string}
   */
  static toRange(startCol, startRow, endCol, endRow) {
    return `${CellAddress.colIndexToName(startCol)}${startRow}:${CellAddress.colIndexToName(endCol)}${endRow}`;
  }

  /**
   * Tests if a cell coordinate is within a parsed range.
   * @param {number} col
   * @param {number} row
   * @param {Object} parsedRange
   * @returns {boolean}
   */
  static isInRange(col, row, parsedRange) {
    return col >= parsedRange.start.col &&
           col <= parsedRange.end.col &&
           row >= parsedRange.start.row &&
           row <= parsedRange.end.row;
  }
}
