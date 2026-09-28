import { PdfContentParser } from '../content/PdfContentParser.js';
import { PdfObjectWriter } from '../writer/PdfObjectWriter.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfArray } from '../objects/PdfArray.js';
import { FlateEncode } from '../streams/filters/FlateEncode.js';

export class PdfTextEditor {
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
        if (['Tj', "'", '"'].includes(op.name)) {
          const argIndex = op.name === '"' ? 2 : 0;
          const value = op.getArg(argIndex);
          if (value instanceof PdfString) {
            const result = PdfTextEditor.#replaceString(value, searchText, replacement);
            if (result.unsupported) {
              unsupported++;
              details.push({ type: 'unsupported-encoding', original: value.value, reason: 'The replacement contains characters that cannot be safely represented by this PDF text encoding.' });
            } else if (result.changed) {
              op.args[argIndex] = result.value;
              replacements++;
              streamChanged = true;
            }
          }
        } else if (op.name === 'TJ') {
          const array = op.getArg(0);
          if (!(array instanceof PdfArray)) continue;
          for (let i = 0; i < array.size(); i++) {
            const item = array.get(i);
            if (!(item instanceof PdfString)) continue;
            const result = PdfTextEditor.#replaceString(item, searchText, replacement);
            if (result.unsupported) {
              unsupported++;
              details.push({ type: 'unsupported-encoding', original: item.value, reason: 'The replacement contains characters that cannot be safely represented by this PDF text encoding.' });
            } else if (result.changed) {
              array.set(i, result.value);
              replacements++;
              streamChanged = true;
              if (!all) break;
            }
          }
        }
        if (streamChanged && !all) break;
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

    return { changed: replacements > 0, replacements, unsupported, details };
  }

  static #replaceString(value, searchText, replacement) {
    if (!value.value.includes(searchText)) return { changed: false, value };
    if (!PdfTextEditor.#canEncodeByteText(replacement)) return { unsupported: true, changed: false, value };
    return { changed: true, value: PdfString.of(value.value.split(searchText).join(replacement)) };
  }

  static #canEncodeByteText(text) {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 0xFF) return false;
    }
    return true;
  }

  static #serializeOperators(operators) {
    const chunks = [];
    const encoder = new TextEncoder();

    for (const op of operators) {
      if (!op || !op.name) continue;
      if (op.name === 'BI' && op.args.length >= 2 && op.args[1] instanceof Uint8Array) {
        chunks.push(encoder.encode('BI\n'));
        chunks.push(PdfObjectWriter.serialize(op.args[0]));
        chunks.push(encoder.encode('\nID\n'));
        chunks.push(op.args[1]);
        chunks.push(encoder.encode('\nEI\n'));
        continue;
      }
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
