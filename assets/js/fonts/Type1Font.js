import { PdfFont, fontClasses } from './PdfFont.js';

/**
 * Represents a standard or embedded PostScript Type 1 font.
 */
export class Type1Font extends PdfFont {
  constructor(dictionary, document = null) {
    super(dictionary, document);
  }
}

fontClasses.Type1Font = Type1Font;
