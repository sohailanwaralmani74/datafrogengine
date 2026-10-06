import { PdfContentParser } from '../content/PdfContentParser.js';
import { PdfObjectWriter } from '../writer/PdfObjectWriter.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfArray } from '../objects/PdfArray.js';
import { FlateEncode } from '../streams/filters/FlateEncode.js';
import { PdfFont } from '../fonts/PdfFont.js';
import { PdfNumber } from '../objects/PdfNumber.js';

export class PdfTextEditor {
  static replaceText(page, searchText, replacementText, options = {}) {
    // Prefer an exact text run selected by the visual editor. This keeps the
    // original page, resources, font, matrix and surrounding content intact.
    if (options.textItems?.length) {
      return PdfTextEditor.replaceTextRow(page, options.textItems, replacementText);
    }
    if (options.textItem) {
      return PdfTextEditor.replaceTextItem(page, options.textItem, replacementText);
    }
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


  static replaceTextRow(page, textItems, replacementText) {
    if (!page || !Array.isArray(textItems) || textItems.length === 0 || typeof replacementText !== 'string') {
      return { changed: false, replacements: 0, unsupported: 0, details: [] };
    }

    // A row may contain several original PDF text runs. The safe operation is
    // to replace the row only when its source runs form one contiguous text
    // showing operation; otherwise use the first selected run as the exact
    // editable slot rather than risking unrelated page content.
    if (textItems.length === 1) {
      return PdfTextEditor.replaceTextItem(page, textItems[0], replacementText);
    }

    const first = textItems[0];
    const original = textItems.map(item => String(item?.text ?? '')).join('');
    if (!original) return { changed: false, replacements: 0, unsupported: 0, details: [] };

    const resources = page.getResources();
    const fontDict = resources.getFont(first.fontResource);
    const font = fontDict ? PdfFont.create(fontDict, page.document) : null;
    if (!font) {
      return { changed: false, replacements: 0, unsupported: 1, details: [{ type: 'missing-font', message: 'The source PDF font could not be resolved.' }] };
    }

    const encoded = font.encodeString(replacementText);
    if (!encoded) {
      return { changed: false, replacements: 0, unsupported: 1, details: [{ type: 'unsupported-encoding', message: 'The replacement cannot be encoded by the original PDF font.' }] };
    }

    // Match the row's runs by their exact original bytes and font resource.
    // Replacing the first run and removing the remaining row runs preserves
    // the source font and coordinates without creating an HTML reflow layer.
    const rawRuns = textItems.map(item => item.rawBytes instanceof Uint8Array
      ? item.rawBytes
      : new Uint8Array(Array.from(String(item.text ?? '')).map(ch => ch.charCodeAt(0) & 0xFF)));

    for (const stream of page.getContents()) {
      let operators;
      try { operators = PdfContentParser.parse(stream); } catch (_) { continue; }

      let inText = false;
      let currentFontName = null;
      let runIndex = 0;
      let changed = false;

      for (const op of operators) {
        if (op.name === 'BT') { inText = true; continue; }
        if (op.name === 'ET') { inText = false; continue; }
        if (!inText) continue;
        if (op.name === 'Tf') { currentFontName = op.getName(0); continue; }
        if (currentFontName !== first.fontResource) continue;

        const argIndex = ['Tj', "'", '"'].includes(op.name) ? (op.name === '"' ? 2 : 0) : -1;
        if (argIndex >= 0) {
          const value = op.getArg(argIndex);
          if (!(value instanceof PdfString) || !PdfTextEditor.#bytesEqual(value.bytes, rawRuns[runIndex])) continue;
          if (runIndex === 0) {
            op.args[argIndex] = PdfString.of(new TextDecoder('latin1').decode(encoded), encoded);
            changed = true;
          } else if (runIndex < rawRuns.length) {
            op.args[argIndex] = PdfString.of('', new Uint8Array());
          }
          runIndex++;
          if (runIndex === rawRuns.length) break;
        }
      }

      if (changed && runIndex === rawRuns.length) {
        const bytes = PdfTextEditor.#serializeOperators(operators);
        stream.setBytes(FlateEncode.encode(bytes));
        stream.dictionary.delete('DecodeParms');
        stream.dictionary.set('Filter', PdfName.of('FlateDecode'));
        return { changed: true, replacements: 1, unsupported: 0, details: [{ type: 'font-preserved', font: font.baseFont, layoutPreserved: true }] };
      }
    }

    // If the row was split across operators that cannot be safely matched,
    // do not make a destructive partial edit.
    return { changed: false, replacements: 0, unsupported: 0, details: [{ type: 'text-row-not-found', message: 'The selected text row was not found as the same source text runs.' }] };
  }

  static replaceTextItem(page, textItem, replacementText) {
    if (!page || !textItem || typeof replacementText !== 'string') {
      return { changed: false, replacements: 0, unsupported: 0, details: [] };
    }

    const targetText = String(textItem.text || '');
    if (!targetText) return { changed: false, replacements: 0, unsupported: 0, details: [] };

    const resources = page.getResources();
    const fontDict = resources.getFont(textItem.fontResource);
    const font = fontDict ? PdfFont.create(fontDict, page.document) : null;
    if (!font) {
      return { changed: false, replacements: 0, unsupported: 1, details: [{ type: 'missing-font', message: 'The source PDF font could not be resolved.' }] };
    }

    const encoded = font.encodeString(replacementText);
    if (!encoded) {
      return { changed: false, replacements: 0, unsupported: 1, details: [{ type: 'unsupported-encoding', message: 'The replacement cannot be encoded by the original PDF font.' }] };
    }

    const targetBytes = textItem.rawBytes instanceof Uint8Array
      ? textItem.rawBytes
      : new Uint8Array(Array.from(targetText).map(c => c.charCodeAt(0) & 0xFF));

    const sameBytes = targetBytes.length === encoded.length && targetBytes.every((v, i) => v === encoded[i]);
    if (sameBytes) return { changed: false, replacements: 0, unsupported: 0, details: [] };

    for (const stream of page.getContents()) {
      let operators;
      try { operators = PdfContentParser.parse(stream); }
      catch (error) { continue; }

      let inText = false;
      let currentFontName = null;
      let changed = false;

      for (const op of operators) {
        if (op.name === 'BT') { inText = true; continue; }
        if (op.name === 'ET') { inText = false; continue; }
        if (!inText) continue;

        if (op.name === 'Tf') {
          currentFontName = op.getName(0);
          continue;
        }

        const index = ['Tj', "'", '"'].includes(op.name) ? (op.name === '"' ? 2 : 0) : -1;
        if (index >= 0) {
          const value = op.getArg(index);
          if (value instanceof PdfString &&
              currentFontName === textItem.fontResource &&
              value.bytes?.length === targetBytes.length &&
              value.bytes.every((v, i) => v === targetBytes[i])) {
            op.args[index] = PdfString.of(new TextDecoder('latin1').decode(encoded), encoded);
            changed = true;
            break;
          }
        }

        if (op.name === 'TJ') {
          const array = op.getArg(0);
          if (!(array instanceof PdfArray) || currentFontName !== textItem.fontResource) continue;
          for (let i = 0; i < array.size(); i++) {
            const value = array.get(i);
            if (!(value instanceof PdfString)) continue;
            if (value.bytes?.length !== targetBytes.length) continue;
            if (!value.bytes.every((v, j) => v === targetBytes[j])) continue;

            const originalWidth = PdfTextEditor.#textWidth(font, targetBytes, textItem.fontSize);
            const newWidth = PdfTextEditor.#textWidth(font, encoded, textItem.fontSize);
            array.set(i, PdfString.of(new TextDecoder('latin1').decode(encoded), encoded));

            // Keep the original visual slot. TJ's negative number moves the
            // following text left; positive values create extra space.
            const adjustment = Math.round((newWidth - originalWidth) * 1000 / Math.max(textItem.fontSize, 0.001));
            if (Math.abs(adjustment) > 0) array.set(i + 1, PdfNumber.of(adjustment));
            changed = true;
            break;
          }
          if (changed) break;
        }
      }

      if (changed) {
        const bytes = PdfTextEditor.#serializeOperators(operators);
        stream.setBytes(FlateEncode.encode(bytes));
        stream.dictionary.delete('DecodeParms');
        stream.dictionary.set('Filter', PdfName.of('FlateDecode'));
        return { changed: true, replacements: 1, unsupported: 0, details: [{ type: 'font-preserved', font: font.baseFont, layoutPreserved: true }] };
      }
    }

    return { changed: false, replacements: 0, unsupported: 0, details: [{ type: 'text-run-not-found', message: 'The selected text run was not found in the page content.' }] };
  }

  static #bytesEqual(a, b) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  static #textWidth(font, bytes, fontSize) {
    let width = 0;
    const twoByte = font.subtype === 'Type0';
    if (twoByte) {
      for (let i = 0; i + 1 < bytes.length; i += 2) width += font.getWidth((bytes[i] << 8) | bytes[i + 1]);
    } else {
      for (const byte of bytes) width += font.getWidth(byte);
    }
    return (width / 1000) * fontSize;
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
