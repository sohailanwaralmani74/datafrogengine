import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfPageTree } from './PdfPageTree.js';
import { PdfStructureException } from '../errors/PdfStructureException.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Encapsulates the PDF Document Catalog root dictionary (`/Type /Catalog`).
 */
export class PdfCatalog {
  /** @type {PdfDictionary} */
  #dictionary;

  /** @type {Object} */
  #document;

  /** @type {PdfPageTree|null} */
  #pageTree;

  /**
   * @param {PdfDictionary} dictionary
   * @param {Object} document
   */
  constructor(dictionary, document) {
    if (!(dictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('dictionary', dictionary, 'PdfDictionary');
    }
    this.#dictionary = dictionary;
    this.#document = document;
    this.#pageTree = null;
  }

  get dictionary() {
    return this.#dictionary;
  }

  /**
   * Helper to resolve indirect references.
   * @private
   */
  #resolve(obj) {
    if (this.#document && typeof this.#document.resolve === 'function') {
      return this.#document.resolve(obj);
    }
    return obj;
  }

  /**
   * Returns the document page tree.
   * @returns {PdfPageTree}
   */
  getPageTree() {
    if (this.#pageTree === null) {
      const pagesObj = this.#resolve(this.#dictionary.get('Pages'));
      if (!pagesObj || !pagesObj.isDictionary()) {
        throw new PdfStructureException('Document Catalog has missing or invalid /Pages entry');
      }
      this.#pageTree = new PdfPageTree(pagesObj, this.#document);
    }
    return this.#pageTree;
  }

  /**
   * Total number of pages in document.
   * @returns {number}
   */
  getPageCount() {
    return this.getPageTree().getPageCount();
  }

  /**
   * Returns a page by 0-indexed position.
   * @param {number} index
   * @returns {PdfPage}
   */
  getPage(index) {
    return this.getPageTree().getPage(index);
  }

  /**
   * Returns /Metadata stream or dictionary if present.
   * @returns {PdfObject|null}
   */
  getMetadata() {
    const meta = this.#dictionary.get('Metadata');
    return this.#resolve(meta) || null;
  }

  /**
   * Returns /Outlines dictionary if present.
   * @returns {PdfDictionary|null}
   */
  getOutlines() {
    const outlines = this.#resolve(this.#dictionary.get('Outlines'));
    return outlines && outlines.isDictionary() ? outlines : null;
  }

  /**
   * Returns /AcroForm interactive form dictionary if present.
   * @returns {PdfDictionary|null}
   */
  getAcroForm() {
    const form = this.#resolve(this.#dictionary.get('AcroForm'));
    return form && form.isDictionary() ? form : null;
  }

  /**
   * Returns /Version string if explicitly specified in catalog (overrides header version).
   * @returns {string|null}
   */
  getVersion() {
    const ver = this.#dictionary.getName('Version');
    return ver || null;
  }

  /**
   * Returns /Names dictionary.
   * @returns {PdfDictionary|null}
   */
  getNames() {
    const names = this.#resolve(this.#dictionary.get('Names'));
    return names && names.isDictionary() ? names : null;
  }
}
