import { PdfFont, fontClasses } from './PdfFont.js';

/**
 * Represents a standard or embedded TrueType font.
 */
export class TrueTypeFont extends PdfFont {
  constructor(dictionary, document = null) {
    super(dictionary, document);
  }
}

fontClasses.TrueTypeFont = TrueTypeFont;
