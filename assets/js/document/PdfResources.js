import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfObject } from '../objects/PdfObject.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Encapsulates the /Resources dictionary associated with pages or Form XObjects.
 */
export class PdfResources {
  /** @type {PdfDictionary} */
  #dictionary;

  /** @type {Object|null} */
  #document;

  /**
   * @param {PdfDictionary} dictionary
   * @param {Object} [document=null]
   */
  constructor(dictionary, document = null) {
    if (!(dictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('dictionary', dictionary, 'PdfDictionary');
    }
    this.#dictionary = dictionary;
    this.#document = document;
  }

  get dictionary() {
    return this.#dictionary;
  }

  /**
   * Helper to resolve indirect objects if document is provided.
   * @private
   */
  #resolve(obj) {
    if (this.#document && typeof this.#document.resolve === 'function') {
      return this.#document.resolve(obj);
    }
    return obj;
  }

  /**
   * Returns /Font dictionary for named font (e.g. 'F1').
   * @param {string|PdfName} fontName
   * @returns {PdfDictionary|null}
   */
  getFont(fontName) {
    const fontsDict = this.#resolve(this.#dictionary.get('Font'));
    if (fontsDict && fontsDict.isDictionary()) {
      const font = fontsDict.get(fontName);
      const resolved = this.#resolve(font);
      return resolved && resolved.isDictionary() ? resolved : null;
    }
    return null;
  }

  /**
   * Returns /XObject dictionary or stream for named XObject (e.g. 'Im1').
   * @param {string|PdfName} xObjectName
   * @returns {PdfObject|null}
   */
  getXObject(xObjectName) {
    const xobjectsDict = this.#resolve(this.#dictionary.get('XObject'));
    if (xobjectsDict && xobjectsDict.isDictionary()) {
      const xobj = xobjectsDict.get(xObjectName);
      return this.#resolve(xobj);
    }
    return null;
  }

  /**
   * Returns the entire /XObject dictionary.
   * @returns {PdfDictionary|null}
   */
  getXObjects() {
    const xobjectsDict = this.#resolve(this.#dictionary.get('XObject'));
    return xobjectsDict && xobjectsDict.isDictionary() ? xobjectsDict : null;
  }

  /**
   * Returns /ExtGState dictionary for named graphic state (e.g. 'GS1').
   * @param {string|PdfName} stateName
   * @returns {PdfDictionary|null}
   */
  getExtGState(stateName) {
    const gsDict = this.#resolve(this.#dictionary.get('ExtGState'));
    if (gsDict && gsDict.isDictionary()) {
      const gs = gsDict.get(stateName);
      const resolved = this.#resolve(gs);
      return resolved && resolved.isDictionary() ? resolved : null;
    }
    return null;
  }

  /**
   * Returns /ColorSpace for name.
   * @param {string|PdfName} csName
   * @returns {PdfObject|null}
   */
  getColorSpace(csName) {
    const csDict = this.#resolve(this.#dictionary.get('ColorSpace'));
    if (csDict && csDict.isDictionary()) {
      return this.#resolve(csDict.get(csName));
    }
    return null;
  }

  /**
   * Returns /Pattern for name.
   * @param {string|PdfName} patternName
   * @returns {PdfObject|null}
   */
  getPattern(patternName) {
    const pDict = this.#resolve(this.#dictionary.get('Pattern'));
    if (pDict && pDict.isDictionary()) {
      return this.#resolve(pDict.get(patternName));
    }
    return null;
  }

  /**
   * Returns /Shading for name.
   * @param {string|PdfName} shadingName
   * @returns {PdfObject|null}
   */
  getShading(shadingName) {
    const sDict = this.#resolve(this.#dictionary.get('Shading'));
    if (sDict && sDict.isDictionary()) {
      return this.#resolve(sDict.get(shadingName));
    }
    return null;
  }

  /**
   * Returns /ProcSet array.
   * @returns {PdfArray|null}
   */
  getProcSet() {
    const proc = this.#resolve(this.#dictionary.get('ProcSet'));
    return proc && proc.isArray() ? proc : null;
  }
}
