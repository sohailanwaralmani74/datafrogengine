import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfReference } from '../objects/PdfReference.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Encapsulates the PDF Trailer dictionary containing document catalog roots and metadata.
 */
export class PdfTrailer {
  /** @type {PdfDictionary} */
  #dictionary;

  /**
   * @param {PdfDictionary} dictionary
   */
  constructor(dictionary) {
    if (!(dictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('dictionary', dictionary, 'PdfDictionary instance');
    }
    this.#dictionary = dictionary;
  }

  /**
   * Returns underlying dictionary.
   * @returns {PdfDictionary}
   */
  get dictionary() {
    return this.#dictionary;
  }

  /**
   * Returns /Size entry: total number of entries in the xref table.
   * @returns {number|undefined}
   */
  getSize() {
    return this.#dictionary.getNumber('Size');
  }

  /**
   * Returns /Root entry: reference to the Document Catalog dictionary.
   * @returns {PdfReference|null}
   */
  getRoot() {
    return this.#dictionary.getReference('Root');
  }

  /**
   * Alias for getRoot().
   * @returns {PdfReference|null}
   */
  getCatalogReference() {
    return this.getRoot();
  }

  /**
   * Returns /Info entry: reference to the Document Information dictionary.
   * @returns {PdfReference|null}
   */
  getInfo() {
    return this.#dictionary.getReference('Info');
  }

  /**
   * Returns /Info reference.
   * @returns {PdfReference|null}
   */
  getInfoReference() {
    return this.getInfo();
  }

  /**
   * Returns /Prev entry: byte offset of previous xref section in incrementally updated PDFs.
   * @returns {number|undefined}
   */
  getPrevOffset() {
    return this.#dictionary.getNumber('Prev');
  }

  /**
   * Returns /ID entry: array of two file identifiers.
   * @returns {PdfArray|null}
   */
  getId() {
    return this.#dictionary.getArray('ID');
  }

  /**
   * Returns /Encrypt entry: encryption dictionary or reference.
   * @returns {PdfObject|null}
   */
  getEncrypt() {
    return this.#dictionary.get('Encrypt') || null;
  }

  /**
   * Delegates lookup to dictionary.
   * @param {string} key
   * @returns {PdfObject|undefined}
   */
  get(key) {
    return this.#dictionary.get(key);
  }

  /**
   * Merges keys from an earlier trailer (current trailer keys take precedence).
   * @param {PdfTrailer} previousTrailer
   */
  mergeWith(previousTrailer) {
    if (previousTrailer instanceof PdfTrailer) {
      for (const [key, value] of previousTrailer.dictionary.entries()) {
        if (!this.#dictionary.has(key)) {
          this.#dictionary.set(key, value);
        }
      }
    }
  }

  toString() {
    return `trailer\n${this.#dictionary.toString()}`;
  }
}
