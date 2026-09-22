import { PdfFontMetrics } from './PdfFontMetrics.js';
import { PdfPageModifier } from '../modification/PdfPageModifier.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * High-level flowable styled text block (paragraphs, headings, lists).
 */
export class PdfParagraph {
  /** @type {string} */
  #text;

  /** @type {string} */
  #font;

  /** @type {number} */
  #fontSize;

  /** @type {string|Array<number>} */
  #color;

  /** @type {number} */
  #lineHeight;

  /** @type {'left'|'center'|'right'|'justify'} */
  #align;

  /** @type {number} */
  #spacingBefore;

  /** @type {number} */
  #spacingAfter;

  /** @type {number} */
  #indent;

  /** @type {string|null} */
  #bullet;

  /**
   * @param {string} text
   * @param {Object} [options={}]
   * @param {string} [options.font='Helvetica']
   * @param {number} [options.fontSize=12]
   * @param {string|Array<number>} [options.color='#000000']
   * @param {number} [options.lineHeight=1.25]
   * @param {'left'|'center'|'right'|'justify'} [options.align='left']
   * @param {number} [options.spacingBefore=0]
   * @param {number} [options.spacingAfter=6]
   * @param {number} [options.indent=0]
   * @param {string} [options.bullet=null]
   */
  constructor(text, options = {}) {
    this.#text = text !== undefined && text !== null ? String(text) : '';
    this.#font = options.font || 'Helvetica';
    this.#fontSize = typeof options.fontSize === 'number' ? options.fontSize : 12;
    this.#color = options.color || '#000000';
    this.#lineHeight = typeof options.lineHeight === 'number' ? options.lineHeight : 1.25;
    this.#align = options.align || 'left';
    this.#spacingBefore = typeof options.spacingBefore === 'number' ? options.spacingBefore : 0;
    this.#spacingAfter = typeof options.spacingAfter === 'number' ? options.spacingAfter : 6;
    this.#indent = typeof options.indent === 'number' ? options.indent : 0;
    this.#bullet = options.bullet || null;
  }

  get text() { return this.#text; }
  get font() { return this.#font; }
  get fontSize() { return this.#fontSize; }
  get color() { return this.#color; }
  get lineHeight() { return this.#lineHeight; }
  get align() { return this.#align; }
  get spacingBefore() { return this.#spacingBefore; }
  get spacingAfter() { return this.#spacingAfter; }
  get indent() { return this.#indent; }
  get bullet() { return this.#bullet; }

  /**
   * Computes the line height in points.
   * @returns {number}
   */
  get lineHeightPoints() {
    return this.#fontSize * this.#lineHeight;
  }

  /**
   * Performs layout and word-wrapping for a given available width.
   * 
   * @param {number} availableWidth
   * @returns {{ lines: Array<{ text: string, width: number }>, height: number, lineHeightPoints: number }}
   */
  layout(availableWidth) {
    let effectiveWidth = availableWidth - this.#indent;
    let fullText = this.#text;

    if (this.#bullet) {
      fullText = `${this.#bullet} ${this.#text}`;
    }

    const lines = PdfFontMetrics.wrapText(fullText, effectiveWidth, this.#font, this.#fontSize);
    const textHeight = lines.length * this.lineHeightPoints;
    const totalHeight = this.#spacingBefore + textHeight + this.#spacingAfter;

    return {
      lines,
      height: totalHeight,
      lineHeightPoints: this.lineHeightPoints
    };
  }

  /**
   * Renders the paragraph onto the page modifier at the specified (x, topY) cursor position.
   * 
   * @param {PdfPageModifier} modifier
   * @param {number} x - Left margin X
   * @param {number} topY - Top cursor Y
   * @param {number} availableWidth
   * @returns {number} The new cursor Y after rendering this paragraph
   */
  render(modifier, x, topY, availableWidth) {
    const layout = this.layout(availableWidth);
    const { lines, lineHeightPoints } = layout;

    let currentBaselineY = topY - this.#spacingBefore - (lineHeightPoints * 0.8);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isFirstLine = i === 0;
      const isLastLine = i === lines.length - 1;

      let drawX = x + (isFirstLine ? this.#indent : 0);

      if (this.#align === 'center') {
        drawX = x + (availableWidth - line.width) / 2;
      } else if (this.#align === 'right') {
        drawX = x + (availableWidth - line.width);
      } else if (this.#align === 'justify' && !isLastLine && line.text.includes(' ')) {
        // Justify: distribute excess space among words
        const words = line.text.split(' ');
        if (words.length > 1) {
          const totalWordsWidth = words.reduce((acc, w) => acc + PdfFontMetrics.measureTextWidth(w, this.#font, this.#fontSize), 0);
          const totalSpaceToFill = availableWidth - (isFirstLine ? this.#indent : 0) - totalWordsWidth;
          const spacePerGap = Math.max(0, totalSpaceToFill / (words.length - 1));

          let curX = drawX;
          for (let w = 0; w < words.length; w++) {
            const word = words[w];
            modifier.drawText(word, {
              x: curX,
              y: currentBaselineY,
              size: this.#fontSize,
              font: this.#font,
              color: this.#color,
              align: 'left'
            });
            curX += PdfFontMetrics.measureTextWidth(word, this.#font, this.#fontSize) + spacePerGap;
          }
          currentBaselineY -= lineHeightPoints;
          continue;
        }
      }

      // Default left, center, right, or non-justified line
      if (line.text.length > 0) {
        modifier.drawText(line.text, {
          x: drawX,
          y: currentBaselineY,
          size: this.#fontSize,
          font: this.#font,
          color: this.#color,
          align: 'left'
        });
      }

      currentBaselineY -= lineHeightPoints;
    }

    return topY - layout.height;
  }
}
