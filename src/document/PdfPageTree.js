import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfPage } from './PdfPage.js';
import { PdfStructureException } from '../errors/PdfStructureException.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Traverses and flattens the PDF Page Tree hierarchy (`/Type /Pages`).
 */
export class PdfPageTree {
  /** @type {PdfDictionary} */
  #rootDictionary;

  /** @type {Object} */
  #document;

  /** @type {Array<PdfDictionary>|null} */
  #cachedPageNodes;

  /**
   * @param {PdfDictionary} rootDictionary
   * @param {Object} document
   */
  constructor(rootDictionary, document) {
    if (!(rootDictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('rootDictionary', rootDictionary, 'PdfDictionary');
    }
    this.#rootDictionary = rootDictionary;
    this.#document = document;
    this.#cachedPageNodes = null;
  }

  get rootDictionary() {
    return this.#rootDictionary;
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
   * Flattens the /Pages tree into an ordered array of /Type /Page dictionaries.
   * @private
   */
  #flattenPageTree() {
    if (this.#cachedPageNodes !== null) {
      return this.#cachedPageNodes;
    }

    const pages = [];
    const visited = new Set();

    const traverse = (node) => {
      const resolved = this.#resolve(node);
      if (!resolved || !resolved.isDictionary()) {
        return;
      }

      if (visited.has(resolved)) {
        return; // Cyclic protection
      }
      visited.add(resolved);

      const type = resolved.getName('Type');
      if (type === 'Page') {
        pages.push(resolved);
        return;
      }

      // /Type /Pages branch node
      const kids = this.#resolve(resolved.get('Kids'));
      if (kids && kids.isArray()) {
        for (const kid of kids) {
          traverse(kid);
        }
      }
    };

    traverse(this.#rootDictionary);
    this.#cachedPageNodes = pages;
    return pages;
  }

  /**
   * Returns total number of pages in the document.
   * @returns {number}
   */
  getPageCount() {
    const pages = this.#flattenPageTree();
    return pages.length;
  }

  /**
   * Retrieves a page by 0-indexed position.
   * @param {number} index
   * @returns {PdfPage}
   * @throws {PdfStructureException} if index is out of bounds
   */
  getPage(index) {
    if (typeof index !== 'number' || index < 0 || !Number.isInteger(index)) {
      throw new PdfInvalidArgumentException('index', index, 'non-negative integer page index');
    }
    const pages = this.#flattenPageTree();
    if (index >= pages.length) {
      throw new PdfStructureException(`Page index ${index} out of bounds (document has ${pages.length} pages)`);
    }
    return new PdfPage(pages[index], index, this.#document);
  }

  /**
   * Returns all pages as an array of PdfPage.
   * @returns {Array<PdfPage>}
   */
  getAllPages() {
    const pages = this.#flattenPageTree();
    return pages.map((pageDict, idx) => new PdfPage(pageDict, idx, this.#document));
  }

  /**
   * Invalidates cached flattened page nodes.
   */
  invalidateCache() {
    this.#cachedPageNodes = null;
  }

  /**
   * Inserts a page dictionary at the specified index.
   * 
   * @param {number} index - 0-indexed position (-1 to append)
   * @param {PdfDictionary} pageDict - /Type /Page dictionary
   * @returns {PdfPage}
   */
  insertPage(index, pageDict) {
    if (!(pageDict instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('pageDict', pageDict, 'PdfDictionary');
    }

    let kids = this.#resolve(this.#rootDictionary.get('Kids'));
    if (!kids || !kids.isArray()) {
      kids = new PdfArray();
      this.#rootDictionary.set('Kids', kids);
    }

    // Set Parent reference
    pageDict.set('Parent', this.#rootDictionary);

    const pages = this.#flattenPageTree();
    const targetIdx = (index < 0 || index >= pages.length) ? kids.size() : index;

    if (targetIdx >= kids.size()) {
      kids.push(pageDict);
    } else {
      // Rebuild kids array with item inserted
      const newKids = new PdfArray();
      for (let i = 0; i < kids.size(); i++) {
        if (i === targetIdx) {
          newKids.push(pageDict);
        }
        newKids.push(kids.get(i));
      }
      this.#rootDictionary.set('Kids', newKids);
    }

    // Update /Count
    const currentCount = this.getPageCount() + 1;
    this.#rootDictionary.set('Count', PdfNumber.of(currentCount));

    this.invalidateCache();
    return this.getPage(targetIdx >= pages.length ? pages.length : targetIdx);
  }

  /**
   * Removes page at index.
   * 
   * @param {number} index
   * @returns {PdfPage}
   */
  removePage(index) {
    if (typeof index !== 'number' || index < 0) {
      throw new PdfInvalidArgumentException('index', index, 'non-negative integer');
    }

    const pages = this.#flattenPageTree();
    if (index >= pages.length) {
      throw new PdfStructureException(`Cannot remove page index ${index}: document has ${pages.length} pages`);
    }
    if (pages.length <= 1) {
      throw new PdfStructureException('Cannot remove the only page in document');
    }

    const targetPageDict = pages[index];
    const removedPage = new PdfPage(targetPageDict, index, this.#document);

    // Remove from kids in parent
    const kids = this.#resolve(this.#rootDictionary.get('Kids'));
    if (kids && kids.isArray()) {
      const newKids = new PdfArray();
      for (let i = 0; i < kids.size(); i++) {
        const k = this.#resolve(kids.get(i));
        if (k !== targetPageDict) {
          newKids.push(kids.get(i));
        }
      }
      this.#rootDictionary.set('Kids', newKids);
    }

    const newCount = pages.length - 1;
    this.#rootDictionary.set('Count', PdfNumber.of(newCount));

    this.invalidateCache();
    return removedPage;
  }

  /**
   * Moves a page from one index to another.
   * 
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  movePage(fromIndex, toIndex) {
    const pages = this.#flattenPageTree();
    if (fromIndex < 0 || fromIndex >= pages.length || toIndex < 0 || toIndex >= pages.length) {
      throw new PdfStructureException(`Invalid movePage indices (from: ${fromIndex}, to: ${toIndex}, total: ${pages.length})`);
    }

    if (fromIndex === toIndex) return;

    const pageDict = pages[fromIndex];
    const kids = this.#resolve(this.#rootDictionary.get('Kids'));
    if (kids && kids.isArray()) {
      const newKids = new PdfArray();
      const currentList = [];
      for (let i = 0; i < kids.size(); i++) {
        currentList.push(kids.get(i));
      }
      const [moved] = currentList.splice(fromIndex, 1);
      currentList.splice(toIndex, 0, moved);

      for (const item of currentList) {
        newKids.push(item);
      }
      this.#rootDictionary.set('Kids', newKids);
    }

    this.invalidateCache();
  }

  /**
   * Sets or updates rotation for page at index.
   * 
   * @param {number} index
   * @param {number} degrees
   * @param {boolean} [relative=false]
   */
  rotatePage(index, degrees, relative = false) {
    const page = this.getPage(index);
    const currentRot = page.getRotation();
    let newRot = relative ? (currentRot + degrees) : degrees;
    newRot = ((newRot % 360) + 360) % 360;

    page.dictionary.set('Rotate', PdfNumber.of(newRot));

    this.invalidateCache();
    return newRot;
  }
}
