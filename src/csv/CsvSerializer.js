/**
 * CsvSerializer - RFC 4180 compliant CSV stringifier with intelligent quoting policies,
 * custom formatting, and fluent CsvBuilder.
 */

export class CsvSerializer {
  /**
   * Serialize 2D array or array of objects to CSV string
   * @param {Array<object>|Array<Array<any>>} data
   * @param {object} [options]
   * @returns {string} CSV formatted string
   */
  static serialize(data, options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const delimiter = options.delimiter || ',';
    const lineTerminator = options.lineTerminator || '\r\n';
    const quoteChar = options.quote || '"';
    const escapeChar = options.escape || '"';
    const quotePolicy = options.quotePolicy || 'minimal'; // 'minimal', 'all', 'nonnumeric', 'none'
    const nullValue = options.nullValue !== undefined ? options.nullValue : '';
    const formatters = options.formatters || {};

    const isObjectArray = typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0]);

    let headers = [];
    let rowsToSerialize = [];

    if (isObjectArray) {
      if (Array.isArray(options.columns)) {
        headers = options.columns;
      } else {
        const keySet = new Set();
        for (const item of data) {
          if (item && typeof item === 'object') {
            Object.keys(item).forEach(k => keySet.add(k));
          }
        }
        headers = Array.from(keySet);
      }

      for (const item of data) {
        const row = [];
        for (const h of headers) {
          row.push(item[h]);
        }
        rowsToSerialize.push(row);
      }
    } else {
      // 2D Array
      rowsToSerialize = data;
    }

    const outputLines = [];

    // Header row
    if (options.headers !== false) {
      let headerLabels = headers;
      if (Array.isArray(options.headers)) {
        headerLabels = options.headers;
      } else if (!isObjectArray && options.hasHeader && rowsToSerialize.length > 0) {
        headerLabels = rowsToSerialize[0];
        rowsToSerialize = rowsToSerialize.slice(1);
      }

      if (headerLabels.length > 0) {
        const formattedHeaders = headerLabels.map(h => 
          this._escapeField(h, delimiter, quoteChar, escapeChar, quotePolicy)
        );
        outputLines.push(formattedHeaders.join(delimiter));
      }
    }

    // Data rows
    for (let r = 0; r < rowsToSerialize.length; r++) {
      const row = rowsToSerialize[r];
      const serializedFields = [];

      for (let c = 0; c < row.length; c++) {
        let val = row[c];
        const colName = headers[c];

        if (formatters[colName] && typeof formatters[colName] === 'function') {
          val = formatters[colName](val, row, r);
        } else if (val === null || val === undefined) {
          val = nullValue;
        }

        serializedFields.push(
          this._escapeField(val, delimiter, quoteChar, escapeChar, quotePolicy)
        );
      }

      outputLines.push(serializedFields.join(delimiter));
    }

    return outputLines.join(lineTerminator);
  }

  /**
   * Escape and quote an individual field according to quotePolicy
   * @private
   */
  static _escapeField(val, delimiter, quoteChar, escapeChar, quotePolicy) {
    if (val === null || val === undefined) return '';

    const str = String(val);
    const isNumber = typeof val === 'number' || (!isNaN(Number(str)) && str.trim() !== '');

    if (quotePolicy === 'none') {
      return str;
    }

    if (quotePolicy === 'all') {
      return this._quoteAndEscape(str, quoteChar, escapeChar);
    }

    if (quotePolicy === 'nonnumeric' && !isNumber) {
      return this._quoteAndEscape(str, quoteChar, escapeChar);
    }

    // Default 'minimal': quote if contains delimiter, quote, newline, or carriage return
    const needsQuoting = str.includes(delimiter) || 
                         str.includes(quoteChar) || 
                         str.includes('\n') || 
                         str.includes('\r');

    if (needsQuoting) {
      return this._quoteAndEscape(str, quoteChar, escapeChar);
    }

    return str;
  }

  /**
   * Quote and escape string value
   * @private
   */
  static _quoteAndEscape(str, quoteChar, escapeChar) {
    let escaped = str;
    if (escapeChar === quoteChar) {
      // RFC 4180 standard: double quotes
      escaped = str.split(quoteChar).join(quoteChar + quoteChar);
    } else {
      escaped = str.split(quoteChar).join(escapeChar + quoteChar);
    }
    return `${quoteChar}${escaped}${quoteChar}`;
  }
}

/**
 * Fluent CsvBuilder for programmatically constructing and chaining CSV content
 */
export class CsvBuilder {
  constructor(options = {}) {
    this.options = options;
    this.headers = [];
    this.rows = [];
    this.comments = [];
  }

  setHeader(headers) {
    this.headers = Array.isArray(headers) ? headers : Array.from(arguments);
    return this;
  }

  addRow(row) {
    this.rows.push(Array.isArray(row) ? row : Object.values(row));
    return this;
  }

  addRows(rows) {
    if (Array.isArray(rows)) {
      for (const r of rows) this.addRow(r);
    }
    return this;
  }

  addComment(comment) {
    this.comments.push(`# ${comment}`);
    return this;
  }

  toString(options = {}) {
    const mergedOpts = { ...this.options, ...options };
    const delimiter = mergedOpts.delimiter || ',';
    const lineTerminator = mergedOpts.lineTerminator || '\r\n';

    const lines = [];
    if (this.comments.length > 0) {
      lines.push(...this.comments);
    }

    const serialized = CsvSerializer.serialize(this.rows, {
      ...mergedOpts,
      headers: this.headers.length > 0 ? this.headers : false
    });

    if (serialized) {
      lines.push(serialized);
    }

    return lines.join(lineTerminator);
  }
}
