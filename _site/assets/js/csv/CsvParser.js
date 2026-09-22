/**
 * CsvParser - High-performance RFC 4180 compliant CSV parser with delimiter autodetection,
 * header mapping, typed coercion, and resilient/lenient recovery.
 */

export class CsvParser {
  /**
   * Auto-detect delimiter from sample CSV text
   * @param {string} text
   * @returns {string} Detected delimiter
   */
  static detectDelimiter(text) {
    if (!text || typeof text !== 'string') return ',';
    const candidates = [',', ';', '\t', '|'];
    const lines = text.split(/\r?\n/).slice(0, 15).filter(line => line.trim().length > 0 && !line.startsWith('#'));
    if (lines.length === 0) return ',';

    const scores = {};
    for (const d of candidates) {
      scores[d] = { total: 0, consistency: true, counts: [] };
      for (const line of lines) {
        // Count delimiters outside quotes
        let inQuotes = false;
        let count = 0;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') inQuotes = !inQuotes;
          else if (ch === d && !inQuotes) count++;
        }
        scores[d].counts.push(count);
        scores[d].total += count;
      }
      // Check count consistency across lines
      const first = scores[d].counts[0] || 0;
      const allSame = first > 0 && scores[d].counts.every(c => c === first);
      scores[d].consistent = allSame;
    }

    // Prefer consistent delimiter with count > 0
    let best = ',';
    let maxScore = -1;
    for (const d of candidates) {
      const s = scores[d];
      if (s.total === 0) continue;
      const score = s.total * (s.consistent ? 2.5 : 1.0);
      if (score > maxScore) {
        maxScore = score;
        best = d;
      }
    }

    return best;
  }

  /**
   * Parse CSV string into 2D array or array of objects
   * @param {string} text
   * @param {object} [options]
   * @returns {Array<object>|Array<Array<string|number|boolean|null>>}
   */
  static parse(text, options = {}) {
    if (typeof text !== 'string') return [];
    
    // Strip UTF-8 BOM if present
    let cleanText = text;
    if (cleanText.charCodeAt(0) === 0xFEFF) {
      cleanText = cleanText.slice(1);
    }

    const delimiter = options.delimiter || (options.autoDetectDelimiter !== false ? this.detectDelimiter(cleanText) : ',');
    const quoteChar = options.quote || '"';
    const escapeChar = options.escape || '"';
    const commentChar = options.comment || '#';
    const skipEmptyLines = options.skipEmptyLines !== false;
    const trim = options.trim || false;
    const dynamicTyping = options.dynamicTyping || false;
    const lenient = options.lenient !== false;
    const asObjects = options.asObjects !== false && (options.hasHeader !== false);

    const rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;
    let i = 0;
    const len = cleanText.length;

    while (i < len) {
      const ch = cleanText[i];
      const nextCh = i + 1 < len ? cleanText[i + 1] : '';

      // Check comments at beginning of row
      if (!insideQuotes && currentRow.length === 0 && currentField === '' && ch === commentChar) {
        // Skip until newline
        while (i < len && cleanText[i] !== '\n' && cleanText[i] !== '\r') {
          i++;
        }
        if (cleanText[i] === '\r' && cleanText[i + 1] === '\n') i++;
        i++;
        continue;
      }

      if (insideQuotes) {
        if (ch === escapeChar && escapeChar !== quoteChar && nextCh === quoteChar) {
          // Escaped quote with different escape char (e.g. \")
          currentField += quoteChar;
          i += 2;
          continue;
        } else if (ch === quoteChar) {
          if (nextCh === quoteChar) {
            // Escaped quote: RFC 4180 standard ("")
            currentField += quoteChar;
            i += 2;
            continue;
          } else {
            // End of quoted field
            insideQuotes = false;
            i++;
            continue;
          }
        } else {
          currentField += ch;
          i++;
          continue;
        }
      } else {
        // Outside quotes
        if (ch === quoteChar) {
          // Start of quoted field or quote inside field
          if (currentField.length === 0 || (trim && currentField.trim().length === 0)) {
            insideQuotes = true;
            currentField = '';
          } else if (lenient) {
            // Resilient handling of misplaced quote
            currentField += ch;
          } else {
            throw new Error(`Unexpected quote at character index ${i}`);
          }
          i++;
          continue;
        }

        if (ch === delimiter) {
          currentRow.push(this._formatField(currentField, trim, dynamicTyping));
          currentField = '';
          i++;
          continue;
        }

        if (ch === '\r' || ch === '\n') {
          if (ch === '\r' && nextCh === '\n') {
            i++;
          }
          currentRow.push(this._formatField(currentField, trim, dynamicTyping));
          currentField = '';

          // Determine if row is empty
          const isEmpty = currentRow.length === 1 && currentRow[0] === '';
          if (!skipEmptyLines || !isEmpty) {
            rows.push(currentRow);
          }
          currentRow = [];
          i++;
          continue;
        }

        currentField += ch;
        i++;
      }
    }

    // Handle last row and field
    if (insideQuotes && !lenient) {
      throw new Error('Unclosed quoted field at end of CSV data');
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(this._formatField(currentField, trim, dynamicTyping));
      const isEmpty = currentRow.length === 1 && currentRow[0] === '';
      if (!skipEmptyLines || !isEmpty) {
        rows.push(currentRow);
      }
    }

    if (rows.length === 0) return [];

    if (!asObjects) {
      return rows;
    }

    // Convert rows to Array of Objects
    let headers = rows[0];
    if (options.transformHeader && typeof options.transformHeader === 'function') {
      headers = headers.map(options.transformHeader);
    } else {
      headers = headers.map(h => String(h).trim());
    }

    // Handle duplicate header names gracefully
    const seenHeaders = {};
    const uniqueHeaders = headers.map(h => {
      const base = h || 'column';
      if (!seenHeaders[base]) {
        seenHeaders[base] = 1;
        return base;
      } else {
        seenHeaders[base]++;
        return `${base}_${seenHeaders[base]}`;
      }
    });

    const resultObjects = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const obj = {};
      for (let c = 0; c < uniqueHeaders.length; c++) {
        const key = uniqueHeaders[c];
        obj[key] = c < row.length ? row[c] : null;
      }
      resultObjects.push(obj);
    }

    return resultObjects;
  }

  /**
   * Internal helper to format and type coerce a field value
   * @private
   */
  static _formatField(val, trim, dynamicTyping) {
    let result = val;
    if (trim === true || trim === 'both') {
      result = result.trim();
    } else if (trim === 'left') {
      result = result.trimStart();
    } else if (trim === 'right') {
      result = result.trimEnd();
    }

    if (!dynamicTyping) {
      return result;
    }

    if (result === '') return '';
    if (result === 'null' || result === 'NULL') return null;
    if (result === 'true' || result === 'TRUE') return true;
    if (result === 'false' || result === 'FALSE') return false;

    // Check if numeric
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(result)) {
      const num = Number(result);
      if (!isNaN(num)) return num;
    }

    return result;
  }
}
