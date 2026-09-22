import { PdfDocument } from '../document/PdfDocument.js';
import { PdfPage, pageExtractionHelper } from '../document/PdfPage.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfReference } from '../objects/PdfReference.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfStructureException } from '../errors/PdfStructureException.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Manages high-level page manipulation workflows:
 * rotation, deletion, reordering, extraction, splitting, and merging.
 */
export class PdfPageOperations {
  /**
   * Sets or updates rotation for a specific page.
   * 
   * @param {PdfPage} page
   * @param {number} degrees - 0, 90, 180, 270
   * @param {boolean} [relative=false]
   * @returns {number} - New rotation in degrees
   */
  static rotatePage(page, degrees, relative = false) {
    if (!(page instanceof PdfPage)) {
      throw new PdfInvalidArgumentException('page', page, 'PdfPage');
    }
    const currentRot = page.getRotation();
    let newRot = relative ? (currentRot + degrees) : degrees;
    newRot = ((newRot % 360) + 360) % 360;

    page.dictionary.set('Rotate', PdfNumber.of(newRot));
    if (page.document && page.document.getCatalog) {
      page.document.getCatalog().getPageTree().invalidateCache();
    }
    return newRot;
  }

  /**
   * Rotates all pages in a document.
   * 
   * @param {PdfDocument} document
   * @param {number} degrees
   * @param {boolean} [relative=false]
   */
  static rotateAllPages(document, degrees, relative = false) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }
    const count = document.getPageCount();
    for (let i = 0; i < count; i++) {
      PdfPageOperations.rotatePage(document.getPage(i), degrees, relative);
    }
  }

  /**
   * Deletes a page at the specified 0-based index.
   * 
   * @param {PdfDocument} document
   * @param {number} pageIndex
   * @returns {PdfPage} - The removed page
   */
  static deletePage(document, pageIndex) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }
    return document.getCatalog().getPageTree().removePage(pageIndex);
  }

  /**
   * Deletes multiple pages by indices.
   * 
   * @param {PdfDocument} document
   * @param {Array<number>} pageIndices
   */
  static deletePages(document, pageIndices) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }
    if (!Array.isArray(pageIndices)) {
      throw new PdfInvalidArgumentException('pageIndices', pageIndices, 'Array of page indices');
    }

    // Sort descending to avoid index shifting
    const sorted = [...pageIndices].sort((a, b) => b - a);
    for (const idx of sorted) {
      PdfPageOperations.deletePage(document, idx);
    }
  }

  /**
   * Moves a page within a document.
   * 
   * @param {PdfDocument} document
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  static movePage(document, fromIndex, toIndex) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }
    document.getCatalog().getPageTree().movePage(fromIndex, toIndex);
  }

  /**
   * Reorders all pages according to a new index permutation (e.g. [2, 0, 1]).
   * 
   * @param {PdfDocument} document
   * @param {Array<number>} newOrder
   */
  static reorderPages(document, newOrder) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }
    const totalPages = document.getPageCount();
    if (!Array.isArray(newOrder) || newOrder.length !== totalPages) {
      throw new PdfStructureException(`newOrder length (${newOrder?.length}) must equal document page count (${totalPages})`);
    }

    // Clone all pages in the new order into a temporary document, then copy back
    const tempDoc = PdfPageOperations.extractPages(document, newOrder);
    // Replace pages in document
    const kids = new PdfArray();
    const tree = document.getCatalog().getPageTree();
    const rootDict = tree.rootDictionary;

    for (const p of tempDoc.getCatalog().getPageTree().getAllPages()) {
      p.dictionary.set('Parent', rootDict);
      kids.push(p.dictionary);
    }

    rootDict.set('Kids', kids);
    tree.invalidateCache();
  }

  /**
   * Deep-clones specified pages from sourceDoc into targetDoc.
   * 
   * @param {PdfDocument} sourceDoc
   * @param {Array<number>} pageIndices
   * @param {PdfDocument} targetDoc
   * @param {number} [targetIndex=-1]
   */
  static copyPages(sourceDoc, pageIndices, targetDoc, targetIndex = -1) {
    if (!(sourceDoc instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('sourceDoc', sourceDoc, 'PdfDocument');
    }
    if (!(targetDoc instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('targetDoc', targetDoc, 'PdfDocument');
    }
    if (!Array.isArray(pageIndices)) {
      throw new PdfInvalidArgumentException('pageIndices', pageIndices, 'Array of page indices');
    }

    const refMap = new Map(); // oldKey -> targetRef

    const cloneValue = (val) => {
      if (!val) return val;

      if (val instanceof PdfReference) {
        const oldKey = `${val.objectNumber}:${val.generationNumber}`;
        if (refMap.has(oldKey)) {
          return refMap.get(oldKey);
        }

        const resolved = sourceDoc.resolve(val);
        if (!resolved) return val;

        // Allocate target reference first to prevent cyclic loops
        const targetRef = targetDoc.registerObject(new PdfDictionary());
        refMap.set(oldKey, targetRef);

        const clonedResolved = cloneValue(resolved);
        // Update registered target object
        targetDoc.registerObjectWithRef(targetRef, clonedResolved);
        return targetRef;
      }

      if (val instanceof PdfDictionary) {
        const d = new PdfDictionary();
        for (const [k, v] of val.entries()) {
          // Avoid cloning Parent page tree pointers directly
          if (k === 'Parent') continue;
          d.set(k, cloneValue(v));
        }
        return d;
      }

      if (val instanceof PdfArray) {
        const a = new PdfArray();
        for (let i = 0; i < val.size(); i++) {
          a.push(cloneValue(val.get(i)));
        }
        return a;
      }

      if (val instanceof PdfStream) {
        const clonedDict = cloneValue(val.dictionary);
        return new PdfStream(clonedDict, val.bytes.slice());
      }

      return val;
    };

    let insertPos = targetIndex;
    for (const pageIdx of pageIndices) {
      const page = sourceDoc.getPage(pageIdx);
      const originalDict = page.dictionary;

      // Ensure inherited properties are consolidated into the cloned page
      const clonedPageDict = cloneValue(originalDict);
      clonedPageDict.set('Type', PdfName.of('Page'));

      // Inherited geometry and resources
      const mediaBox = page.getMediaBox();
      clonedPageDict.set('MediaBox', new PdfArray([
        PdfNumber.of(mediaBox[0]), PdfNumber.of(mediaBox[1]),
        PdfNumber.of(mediaBox[2]), PdfNumber.of(mediaBox[3])
      ]));

      const rot = page.getRotation();
      if (rot !== 0) {
        clonedPageDict.set('Rotate', PdfNumber.of(rot));
      }

      // Register the page dictionary in target document
      const pageRef = targetDoc.registerObject(clonedPageDict);
      targetDoc.getCatalog().getPageTree().insertPage(insertPos, clonedPageDict);

      if (insertPos !== -1) {
        insertPos++;
      }
    }
  }

  /**
   * Extracts a subset of pages into a new standalone PdfDocument.
   * 
   * @param {PdfDocument} sourceDoc
   * @param {Array<number>} pageIndices
   * @returns {PdfDocument}
   */
  static extractPages(sourceDoc, pageIndices) {
    const newDoc = PdfDocument.create({ version: sourceDoc.getPdfVersion() });
    PdfPageOperations.copyPages(sourceDoc, pageIndices, newDoc);
    return newDoc;
  }

  /**
   * Splits a document into individual single-page documents.
   * 
   * @param {PdfDocument} sourceDoc
   * @returns {Array<PdfDocument>}
   */
  static split(sourceDoc) {
    if (!(sourceDoc instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('sourceDoc', sourceDoc, 'PdfDocument');
    }
    const count = sourceDoc.getPageCount();
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(PdfPageOperations.extractPages(sourceDoc, [i]));
    }
    return result;
  }

  /**
   * Splits a document at specified page boundary indices.
   * E.g. a 5-page document with splitIndices [2] produces:
   * Document 1 (pages 0, 1) and Document 2 (pages 2, 3, 4).
   * 
   * @param {PdfDocument} sourceDoc
   * @param {Array<number>} splitIndices
   * @returns {Array<PdfDocument>}
   */
  static splitAt(sourceDoc, splitIndices) {
    if (!(sourceDoc instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('sourceDoc', sourceDoc, 'PdfDocument');
    }
    const count = sourceDoc.getPageCount();
    const sorted = [...new Set(splitIndices)].filter(idx => idx > 0 && idx < count).sort((a, b) => a - b);

    const boundaries = [0, ...sorted, count];
    const documents = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      const indices = [];
      for (let p = start; p < end; p++) {
        indices.push(p);
      }
      documents.push(PdfPageOperations.extractPages(sourceDoc, indices));
    }

    return documents;
  }

  /**
   * Merges multiple PDF documents sequentially into a single combined PdfDocument.
   * 
   * @param {Array<PdfDocument>} documents
   * @returns {PdfDocument}
   */
  static merge(documents) {
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new PdfInvalidArgumentException('documents', documents, 'non-empty Array of PdfDocument');
    }

    const mergedDoc = PdfDocument.create();
    for (const doc of documents) {
      if (!(doc instanceof PdfDocument)) {
        throw new PdfInvalidArgumentException('documents item', doc, 'PdfDocument');
      }
      const pageCount = doc.getPageCount();
      const indices = Array.from({ length: pageCount }, (_, i) => i);
      PdfPageOperations.copyPages(doc, indices, mergedDoc);
    }

    return mergedDoc;
  }
}

pageExtractionHelper.PdfPageOperations = PdfPageOperations;
