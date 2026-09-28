import { PdfContentParser } from '../content/PdfContentParser.js';
import { PdfObjectWriter } from '../writer/PdfObjectWriter.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfName } from '../objects/PdfName.js';
import { FlateEncode } from '../streams/filters/FlateEncode.js';

export class PdfTextEditor {
  /**
   * Replace text inside real PDF text-showing operators.
   * The editor changes the content stream itself; it does not cover old text
   * with a white rectangle. Unsupported encodings are reported safely.
   */
  static replaceText(page, searchText, replacementText, options = {}) {
    const all = options.all !== false;
    if (!page || typeof searchText !== 'string' || !searchText) {
      return { changed: false, replacements: 0, unsupported: 0, details: [] };
    }

    const replacement = String(replacementText ?? '');
    let replacements = 0;
    let unsupported = 0;
    const details = [];

    for (const stream of page.getContents()) {
      let operators;
      try {
        operators = PdfContentParser.parse(stream);
      } catch (error) {
        details.push({ type: 'parse-error', message: error?.message || 'Could not read this page text.' });
        continue;
      }

      let streamChanged = false;

      for (const op of operators) {
        if (!['Tj', "'", '"'].includes(op.name)) continue;

        const argIndex = op.name === '"' ? 2 : 0;
        const value = op.getArg(argIndex);
        if (!(value instanceof PdfString)) continue;

        const source = value.value;
        if (!source.includes(searchText)) continue;

        const encoded = PdfTextEditor.#encodeLatinByteText(replacement);
        if (!encoded) {
          unsupported++;
          details.push({
            type: 'unsupported-encoding',
            original: source,
            reason: 'The replacement contains characters that cannot be safely represented by this PDF text encoding.'
          });
          continue;
        }

        const next = source.split(searchText).join(replacement);
        op.args[argIndex] = PdfString.of(next, encoded);
        replacements++;
        streamChanged = true;

        if (!all) break;
      }

      if (!streamChanged) continue;

      try {
        const bytes = PdfTextEditor.#serializeOperators(operators);
        stream.setBytes(FlateEncode.encode(bytes));
        stream.dictionary.delete('DecodeParms');
        stream.dictionary.set('Filter', PdfName.of('FlateDecode'));
      } catch (error) {
        details.push({ type: 'write-error', message: error?.message || 'Could not rebuild the edited text stream.' });
      }
    }

    return {
      changed: replacements > 0,
      replacements,
      unsupported,
      details
    };
  }

  static #encodeLatinByteText(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 0xFF) return null;
      bytes[i] = code;
    }
    return bytes;
  }

  static #serializeOperators(operators) {
    const chunks = [];
    const encoder = new TextEncoder();

    for (const op of operators) {
      if (!op || !op.name) continue;
      for (const arg of op.args) {
        chunks.push(PdfObjectWriter.serialize(arg));
        chunks.push(encoder.encode(' '));
      }
      chunks.push(encoder.encode(op.name));
      chunks.push(encoder.encode('\n'));
    }

    const total = chunks.reduce((n, chunk) => n + chunk.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
