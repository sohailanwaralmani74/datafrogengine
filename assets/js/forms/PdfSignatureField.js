import { PdfFormField } from './PdfFormField.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfName } from '../objects/PdfName.js';

/**
 * Interactive signature form field (/FT /Sig).
 */
export class PdfSignatureField extends PdfFormField {
  /**
   * Checks if this signature field contains a signature value dictionary.
   * @returns {boolean}
   */
  isSigned() {
    const v = this.resolve(this.dictionary.get('V'));
    return v !== null && v !== undefined && v.isDictionary && v.isDictionary();
  }

  /**
   * Returns the signature dictionary if signed.
   * @returns {PdfDictionary|null}
   */
  getSignatureDictionary() {
    const v = this.resolve(this.dictionary.get('V'));
    return v && v.isDictionary && v.isDictionary() ? v : null;
  }
}
