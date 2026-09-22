import { HELVETICA_WIDTHS, DEFAULT_GLYPH_WIDTHS } from '../fonts/StandardFonts.js';

/**
 * Standard Times-Roman glyph widths table (1/1000 of text space).
 */
export const TIMES_ROMAN_WIDTHS = {
  32: 250, 33: 333, 34: 408, 35: 500, 36: 500, 37: 833, 38: 778, 39: 180,
  40: 333, 41: 333, 42: 500, 43: 564, 44: 250, 45: 333, 46: 250, 47: 278,
  48: 500, 49: 500, 50: 500, 51: 500, 52: 500, 53: 500, 54: 500, 55: 500,
  56: 500, 57: 500, 58: 278, 59: 278, 60: 564, 61: 564, 62: 564, 63: 444,
  64: 921, 65: 722, 66: 667, 67: 667, 68: 722, 69: 611, 70: 556, 71: 722,
  72: 722, 73: 333, 74: 389, 75: 722, 76: 611, 77: 889, 78: 722, 79: 722,
  80: 556, 81: 722, 82: 667, 83: 556, 84: 611, 85: 722, 86: 722, 87: 944,
  88: 722, 89: 722, 90: 611, 91: 333, 92: 278, 93: 333, 94: 469, 95: 500,
  96: 333, 97: 444, 98: 500, 99: 444, 100: 500, 101: 444, 102: 278, 103: 500,
  104: 500, 105: 278, 106: 278, 107: 444, 108: 278, 109: 722, 110: 500, 111: 500,
  112: 500, 113: 500, 114: 333, 115: 389, 116: 278, 117: 500, 118: 500, 119: 722,
  120: 500, 121: 500, 122: 444
};

/**
 * Utility for measuring text widths and breaking text lines for PDF standard fonts.
 */
export class PdfFontMetrics {
  /**
   * Returns the width of a single character code in 1/1000th units of text space.
   * 
   * @param {number} charCode
   * @param {string} [font='Helvetica']
   * @returns {number}
   */
  static getCharacterWidth(charCode, font = 'Helvetica') {
    const fontName = font.toLowerCase();

    // Monospaced Courier
    if (fontName.startsWith('courier')) {
      return 600;
    }

    // Times family
    if (fontName.startsWith('times')) {
      if (TIMES_ROMAN_WIDTHS[charCode] !== undefined) {
        let width = TIMES_ROMAN_WIDTHS[charCode];
        if (fontName.includes('bold')) {
          width *= 1.05;
        }
        return width;
      }
      return fontName.includes('bold') ? 550 : 500;
    }

    // Helvetica / standard sans-serif
    if (HELVETICA_WIDTHS[charCode] !== undefined) {
      let width = HELVETICA_WIDTHS[charCode];
      if (fontName.includes('bold')) {
        width *= 1.06;
      }
      return width;
    }

    // Default fallback
    return DEFAULT_GLYPH_WIDTHS[font] || DEFAULT_GLYPH_WIDTHS.Default || 550;
  }

  /**
   * Measures the width of a text string in PDF points.
   * 
   * @param {string} text
   * @param {string} [font='Helvetica']
   * @param {number} [fontSize=12]
   * @returns {number} Width in points
   */
  static measureTextWidth(text, font = 'Helvetica', fontSize = 12) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    let totalWidthUnits = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      totalWidthUnits += PdfFontMetrics.getCharacterWidth(code, font);
    }

    return (totalWidthUnits / 1000) * fontSize;
  }

  /**
   * Wraps text into lines that fit within a maximum width.
   * Respects explicit line breaks (\n, \r\n) and breaks long words if necessary.
   * 
   * @param {string} text
   * @param {number} maxWidth
   * @param {string} [font='Helvetica']
   * @param {number} [fontSize=12]
   * @returns {Array<{ text: string, width: number }>}
   */
  static wrapText(text, maxWidth, font = 'Helvetica', fontSize = 12) {
    if (text === null || text === undefined) {
      return [];
    }

    const str = String(text);
    if (str.length === 0) {
      return [{ text: '', width: 0 }];
    }

    // Split paragraphs by explicit newline
    const rawParagraphs = str.split(/\r?\n/);
    const result = [];

    const spaceWidth = PdfFontMetrics.measureTextWidth(' ', font, fontSize);

    for (let p = 0; p < rawParagraphs.length; p++) {
      const paragraph = rawParagraphs[p];
      if (paragraph.trim().length === 0) {
        result.push({ text: '', width: 0 });
        continue;
      }

      const words = paragraph.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) {
        result.push({ text: '', width: 0 });
        continue;
      }

      let currentLineWords = [];
      let currentLineWidth = 0;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordWidth = PdfFontMetrics.measureTextWidth(word, font, fontSize);

        // Check if single word exceeds maxWidth on its own
        if (wordWidth > maxWidth) {
          // If we have words already accumulated in current line, push them first
          if (currentLineWords.length > 0) {
            result.push({
              text: currentLineWords.join(' '),
              width: currentLineWidth
            });
            currentLineWords = [];
            currentLineWidth = 0;
          }

          // Break the oversized word character-by-character
          let charAccumulator = '';
          let charAccumulatorWidth = 0;

          for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const charWidth = (PdfFontMetrics.getCharacterWidth(char.charCodeAt(0), font) / 1000) * fontSize;

            if (charAccumulatorWidth + charWidth > maxWidth && charAccumulator.length > 0) {
              result.push({
                text: charAccumulator,
                width: charAccumulatorWidth
              });
              charAccumulator = char;
              charAccumulatorWidth = charWidth;
            } else {
              charAccumulator += char;
              charAccumulatorWidth += charWidth;
            }
          }

          if (charAccumulator.length > 0) {
            currentLineWords.push(charAccumulator);
            currentLineWidth = charAccumulatorWidth;
          }
          continue;
        }

        // Test if adding this word exceeds maxWidth
        const prospectiveWidth = currentLineWords.length === 0
          ? wordWidth
          : currentLineWidth + spaceWidth + wordWidth;

        if (prospectiveWidth <= maxWidth) {
          currentLineWords.push(word);
          currentLineWidth = prospectiveWidth;
        } else {
          // Line full, push current line
          result.push({
            text: currentLineWords.join(' '),
            width: currentLineWidth
          });
          currentLineWords = [word];
          currentLineWidth = wordWidth;
        }
      }

      if (currentLineWords.length > 0) {
        result.push({
          text: currentLineWords.join(' '),
          width: currentLineWidth
        });
      }
    }

    return result;
  }
}
