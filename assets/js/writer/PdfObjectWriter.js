import { PdfNull } from '../objects/PdfNull.js';
import { PdfBoolean } from '../objects/PdfBoolean.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfHexString } from '../objects/PdfHexString.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfReference } from '../objects/PdfReference.js';
import { PdfIndirectObject } from '../objects/PdfIndirectObject.js';
import { PdfStream } from '../objects/PdfStream.js';

/**
 * Serializes in-memory PDF objects into compliant PDF byte representations.
 */
export class PdfObjectWriter {
  /**
   * Serializes any PdfObject into a byte chunk or string.
   * 
   * @param {Object} obj
   * @param {Object} [context={}]
   * @returns {Uint8Array}
   */
  static serialize(obj, context = {}) {
    if (obj === null || obj === undefined || obj instanceof PdfNull || (obj.isNull && obj.isNull())) {
      return new TextEncoder().encode('null');
    }

    if (typeof obj === 'boolean' || obj instanceof PdfBoolean || (obj.isBoolean && obj.isBoolean())) {
      const val = typeof obj === 'boolean' ? obj : obj.value;
      return new TextEncoder().encode(val ? 'true' : 'false');
    }

    if (typeof obj === 'number' || obj instanceof PdfNumber || (obj.isNumber && obj.isNumber())) {
      const val = typeof obj === 'number' ? obj : obj.value;
      // Format cleanly (no trailing decimals for integers)
      const str = Number.isInteger(val) ? String(val) : String(Math.round(val * 100000) / 100000);
      return new TextEncoder().encode(str);
    }

    if (obj instanceof PdfName || (obj.isName && obj.isName())) {
      return new TextEncoder().encode(`/${PdfObjectWriter.escapeName(obj.value)}`);
    }

    if (obj instanceof PdfReference || (obj.isReference && obj.isReference())) {
      return new TextEncoder().encode(`${obj.objectNumber} ${obj.generationNumber} R`);
    }

    if (obj instanceof PdfHexString || (obj.isHexString && obj.isHexString())) {
      if (context.securityHandler && context.objNum) {
        const encBytes = context.securityHandler.encrypt(obj.bytes, context.objNum, 0);
        return new TextEncoder().encode(`<${PdfHexString.fromBytes(encBytes).hex}>`);
      }
      return new TextEncoder().encode(`<${obj.hex}>`);
    }

    if (typeof obj === 'string' || obj instanceof PdfString || (obj.isString && obj.isString())) {
      const val = typeof obj === 'string' ? obj : obj.value;
      if (context.securityHandler && context.objNum) {
        const valBytes = obj instanceof PdfString ? obj.bytes : new TextEncoder().encode(val);
        const encBytes = context.securityHandler.encrypt(valBytes, context.objNum, 0);
        return new TextEncoder().encode(`<${PdfHexString.fromBytes(encBytes).hex}>`);
      }
      return new TextEncoder().encode(PdfObjectWriter.escapeString(val));
    }

    if (obj instanceof PdfArray || (obj.isArray && obj.isArray()) || Array.isArray(obj)) {
      const items = obj instanceof PdfArray ? obj.getItems() : (Array.isArray(obj) ? obj : obj.toArray());
      const parts = [new TextEncoder().encode('[')];
      for (let i = 0; i < items.length; i++) {
        if (i > 0) parts.push(new TextEncoder().encode(' '));
        parts.push(PdfObjectWriter.serialize(items[i], context));
      }
      parts.push(new TextEncoder().encode(']'));
      return PdfObjectWriter.concatBytes(parts);
    }

    if (obj instanceof PdfDictionary || (obj.isDictionary && obj.isDictionary())) {
      const entries = Array.from(obj.entries());
      const parts = [new TextEncoder().encode('<<')];
      for (let i = 0; i < entries.length; i++) {
        const [key, val] = entries[i];
        if (i > 0) parts.push(new TextEncoder().encode(' '));
        parts.push(new TextEncoder().encode(`/${PdfObjectWriter.escapeName(key)} `));
        parts.push(PdfObjectWriter.serialize(val, context));
      }
      parts.push(new TextEncoder().encode('>>'));
      return PdfObjectWriter.concatBytes(parts);
    }

    if (obj instanceof PdfStream || (obj.isStream && obj.isStream())) {
      const dict = new PdfDictionary();
      if (obj.dictionary && obj.dictionary.entries) {
        for (const [k, v] of obj.dictionary.entries()) {
          dict.set(k, v);
        }
      }
      let rawBytes = obj.bytes || new Uint8Array(0);
      if (context.securityHandler && context.objNum) {
        rawBytes = context.securityHandler.encrypt(rawBytes, context.objNum, 0);
      }
      dict.set('Length', PdfNumber.of(rawBytes.length));

      const dictBytes = PdfObjectWriter.serialize(dict, context);
      const parts = [
        dictBytes,
        new TextEncoder().encode('\nstream\n'),
        rawBytes,
        new TextEncoder().encode('\nendstream')
      ];
      return PdfObjectWriter.concatBytes(parts);
    }


    return new TextEncoder().encode('null');
  }

  /**
   * Escapes literal string characters: '\', '(', ')'.
   * @param {string} str
   * @returns {string}
   */
  static escapeString(str) {
    let res = '(';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '\\' || ch === '(' || ch === ')') {
        res += '\\' + ch;
      } else if (ch === '\r') {
        res += '\\r';
      } else if (ch === '\n') {
        res += '\\n';
      } else {
        res += ch;
      }
    }
    res += ')';
    return res;
  }

  /**
   * Escapes PDF Name characters per ISO 32000 (#XX encoding for delimiters/whitespace).
   * @param {string} name
   * @returns {string}
   */
  static escapeName(name) {
    let res = '';
    for (let i = 0; i < name.length; i++) {
      const code = name.charCodeAt(i);
      // Escape if delimiter, whitespace, or '#'
      if (code <= 0x20 || code >= 0x7F || code === 0x23 || // '#'
          code === 0x25 || code === 0x28 || code === 0x29 || // '%', '(', ')'
          code === 0x2F || code === 0x3C || code === 0x3E || // '/', '<', '>'
          code === 0x5B || code === 0x5D || code === 0x7B || code === 0x7D) { // '[', ']', '{', '}'
        res += '#' + code.toString(16).toUpperCase().padStart(2, '0');
      } else {
        res += name[i];
      }
    }
    return res;
  }

  /**
   * Helper to concatenate multiple Uint8Array chunks.
   * @param {Array<Uint8Array>} chunks
   * @returns {Uint8Array}
   */
  static concatBytes(chunks) {
    let totalLen = 0;
    for (const c of chunks) {
      totalLen += c.length;
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }
}
