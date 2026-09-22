import { PdfContentParser } from '../content/PdfContentParser.js';
import { PdfGraphicsState } from '../content/PdfGraphicsState.js';
import { PdfFont } from '../fonts/PdfFont.js';
import { PdfPage, pageExtractionHelper } from '../document/PdfPage.js';
import { PdfDocument } from '../document/PdfDocument.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Extracts structured text and coordinates from PDF pages.
 */
export class PdfTextExtractor {
  /**
   * Extracts detailed text items with bounding box coordinates and font metadata from a page.
   * 
   * @param {PdfPage} page
   * @returns {Array<{
   *   text: string,
   *   page: number,
   *   x: number,
   *   y: number,
   *   width: number,
   *   height: number,
   *   fontName: string,
   *   fontSize: number
   * }>}
   */
  static extractTextItems(page) {
    if (!(page instanceof PdfPage)) {
      throw new PdfInvalidArgumentException('page', page, 'PdfPage');
    }

    const contentStreams = page.getContents();
    if (!contentStreams || contentStreams.length === 0) {
      return [];
    }

    const operators = PdfContentParser.parse(contentStreams);
    const resources = page.getResources();
    const doc = page.document;

    const fontCache = new Map();
    const getFont = (name) => {
      if (fontCache.has(name)) {
        return fontCache.get(name);
      }
      const fontDict = resources.getFont(name);
      const fontInstance = fontDict ? PdfFont.create(fontDict, doc) : null;
      fontCache.set(name, fontInstance);
      return fontInstance;
    };

    let gstate = new PdfGraphicsState();
    const gstateStack = [];
    const textItems = [];

    for (const op of operators) {
      switch (op.name) {
        // Graphics state stack
        case 'q':
          gstateStack.push(gstate.clone());
          break;

        case 'Q':
          if (gstateStack.length > 0) {
            gstate = gstateStack.pop();
          }
          break;

        case 'cm':
          gstate.transform(
            op.getNumber(0), op.getNumber(1),
            op.getNumber(2), op.getNumber(3),
            op.getNumber(4), op.getNumber(5)
          );
          break;

        // Text object delimiters
        case 'BT':
          gstate.textState.resetForBT();
          break;

        case 'ET':
          break;

        // Text state operators
        case 'Tf':
          gstate.textState.setFont(op.getName(0), op.getNumber(1));
          break;

        case 'Tc':
          gstate.textState.charSpacing = op.getNumber(0);
          break;

        case 'Tw':
          gstate.textState.wordSpacing = op.getNumber(0);
          break;

        case 'Tz':
          gstate.textState.horizontalScaling = op.getNumber(0);
          break;

        case 'TL':
          gstate.textState.leading = op.getNumber(0);
          break;

        case 'Tr':
          gstate.textState.renderingMode = op.getNumber(0);
          break;

        case 'Ts':
          gstate.textState.textRise = op.getNumber(0);
          break;

        // Text positioning operators
        case 'Tm':
          gstate.textState.setTextMatrix(
            op.getNumber(0), op.getNumber(1),
            op.getNumber(2), op.getNumber(3),
            op.getNumber(4), op.getNumber(5)
          );
          break;

        case 'Td':
          gstate.textState.moveText(op.getNumber(0), op.getNumber(1));
          break;

        case 'TD':
          gstate.textState.leading = -op.getNumber(1);
          gstate.textState.moveText(op.getNumber(0), op.getNumber(1));
          break;

        case 'T*':
          gstate.textState.nextLine();
          break;

        // Text showing operators
        case 'Tj': {
          const str = op.getArg(0);
          PdfTextExtractor.#processTextString(str, gstate, getFont, page.pageIndex + 1, textItems);
          break;
        }

        case '\'': {
          gstate.textState.nextLine();
          const str = op.getArg(0);
          PdfTextExtractor.#processTextString(str, gstate, getFont, page.pageIndex + 1, textItems);
          break;
        }

        case '"': {
          gstate.textState.wordSpacing = op.getNumber(0);
          gstate.textState.charSpacing = op.getNumber(1);
          gstate.textState.nextLine();
          const str = op.getArg(2);
          PdfTextExtractor.#processTextString(str, gstate, getFont, page.pageIndex + 1, textItems);
          break;
        }

        case 'TJ': {
          const array = op.getArg(0);
          if (array && (array instanceof PdfArray || Array.isArray(array))) {
            const items = array instanceof PdfArray ? array.getItems() : array;
            for (const item of items) {
              if (typeof item === 'number') {
                // Kerning / spacing adjustment
                PdfTextExtractor.#applyKerning(item, gstate);
              } else if (item && item.isNumber && item.isNumber()) {
                PdfTextExtractor.#applyKerning(item.value, gstate);
              } else {
                const str = (item && item.isString && item.isString()) ? item.value : item;
                PdfTextExtractor.#processTextString(str, gstate, getFont, page.pageIndex + 1, textItems);
              }
            }
          }
          break;
        }

        default:
          break;
      }
    }

    return textItems;
  }

  /**
   * Processes a text string and appends item with exact coordinates.
   * @private
   */
  static #processTextString(str, gstate, getFont, pageNumber, output) {
    if (str === undefined || str === null || str.length === 0) {
      return;
    }

    const ts = gstate.textState;
    const font = getFont(ts.fontName);
    const decodedText = font ? font.decodeString(str) : (typeof str === 'string' ? str : '');
    if (decodedText.length === 0) {
      return;
    }

    // Effective character transformation matrix TRM = Tm * CTM
    const tm = ts.textMatrix;
    const ctm = gstate.ctm;
    const trm = PdfGraphicsState.multiplyMatrices(tm, ctm);

    const x = trm[4];
    const y = trm[5];
    const fontSize = ts.fontSize;
    const hScale = ts.horizontalScaling / 100;

    let stringWidth = 0;
    const rawBytes = typeof str === 'string'
      ? Array.from(str).map(c => c.charCodeAt(0))
      : (str instanceof Uint8Array ? Array.from(str) : []);

    for (let i = 0; i < rawBytes.length; i++) {
      const charCode = rawBytes[i];
      const glyphWidth = font ? font.getWidth(charCode) : 600;
      const charW = (glyphWidth / 1000) * fontSize * hScale + ts.charSpacing + (charCode === 32 ? ts.wordSpacing : 0);
      stringWidth += charW;
    }

    // Advance Text Matrix Tm by stringWidth horizontally
    const [a, b, c, d, e, f] = ts.textMatrix;
    ts.textMatrix = [a, b, c, d, e + stringWidth * a, f + stringWidth * b];

    output.push({
      text: decodedText,
      page: pageNumber,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: Math.round(stringWidth * 100) / 100,
      height: Math.round(fontSize * 100) / 100,
      fontName: font ? font.baseFont : (ts.fontName || 'Default'),
      fontSize: fontSize
    });
  }

  /**
   * Applies kerning offset to text matrix.
   * @private
   */
  static #applyKerning(kerningNum, gstate) {
    const ts = gstate.textState;
    const fontSize = ts.fontSize;
    const hScale = ts.horizontalScaling / 100;
    const dx = -(kerningNum / 1000) * fontSize * hScale;

    const [a, b, c, d, e, f] = ts.textMatrix;
    ts.textMatrix = [a, b, c, d, e + dx * a, f + dx * b];
  }

  /**
   * Extracts clean, structured plain text from a page in reading order.
   * 
   * @param {PdfPage} page
   * @returns {string}
   */
  static extractText(page) {
    const items = PdfTextExtractor.extractTextItems(page);
    if (items.length === 0) {
      return '';
    }

    // Sort items into reading order:
    // Top-to-bottom (Y descending), then Left-to-right (X ascending)
    const sorted = [...items].sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > Math.min(a.height, b.height) * 0.5) {
        return yDiff; // Different lines
      }
      return a.x - b.x; // Same line: left to right
    });

    const lines = [];
    let currentLine = [];
    let currentY = sorted[0].y;
    let currentLineHeight = sorted[0].height;

    for (const item of sorted) {
      if (Math.abs(item.y - currentY) > Math.max(currentLineHeight, item.height) * 0.5) {
        // New line encountered
        lines.push(PdfTextExtractor.#assembleLine(currentLine));
        currentLine = [item];
        currentY = item.y;
        currentLineHeight = item.height;
      } else {
        currentLine.push(item);
      }
    }

    if (currentLine.length > 0) {
      lines.push(PdfTextExtractor.#assembleLine(currentLine));
    }

    return lines.join('\n');
  }

  /**
   * Assembles sorted items in a single line with smart whitespace spacing.
   * @private
   */
  static #assembleLine(lineItems) {
    if (lineItems.length === 0) return '';
    let lineText = '';
    let prevItem = null;

    for (const item of lineItems) {
      if (prevItem !== null) {
        const gap = item.x - (prevItem.x + prevItem.width);
        const avgCharWidth = prevItem.width / Math.max(1, prevItem.text.length);
        if (gap > avgCharWidth * 0.4 && !prevItem.text.endsWith(' ') && !item.text.startsWith(' ')) {
          lineText += ' ';
        }
      }
      lineText += item.text;
      prevItem = item;
    }

    return lineText;
  }

  /**
   * Extracts all text from entire document.
   * 
   * @param {PdfDocument} document
   * @returns {string}
   */
  static extractAllText(document) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }
    const pages = document.getCatalog().getPageTree().getAllPages();
    return pages.map(p => PdfTextExtractor.extractText(p)).join('\n\n');
  }
}

pageExtractionHelper.PdfTextExtractor = PdfTextExtractor;
