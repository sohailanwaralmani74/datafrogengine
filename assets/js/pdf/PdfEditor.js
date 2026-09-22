/**
 * PdfEditor - High-level programmatic PDF page manipulation, reordering,
 * rotation, extraction, splitting, merging, and page annotations.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfPageOperations } from '../operations/PdfPageOperations.js';

export class PdfEditor {
  /**
   * Rotates a page by specified degrees (90, 180, 270)
   * @param {PdfDocument} doc
   * @param {number} pageIndex 0-based
   * @param {number} degrees
   */
  static rotatePage(doc, pageIndex, degrees) {
    const page = doc.getPage(pageIndex);
    return PdfPageOperations.rotatePage(page, degrees);
  }

  /**
   * Rotates all pages in a document
   * @param {PdfDocument} doc
   * @param {number} degrees
   */
  static rotateAll(doc, degrees) {
    return PdfPageOperations.rotateAllPages(doc, degrees);
  }

  /**
   * Deletes a page at index
   * @param {PdfDocument} doc
   * @param {number} pageIndex
   */
  static deletePage(doc, pageIndex) {
    return PdfPageOperations.deletePage(doc, pageIndex);
  }

  /**
   * Deletes multiple pages by indices
   * @param {PdfDocument} doc
   * @param {Array<number>} pageIndices
   */
  static deletePages(doc, pageIndices) {
    return PdfPageOperations.deletePages(doc, pageIndices);
  }

  /**
   * Moves a page within a document
   * @param {PdfDocument} doc
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  static movePage(doc, fromIndex, toIndex) {
    return PdfPageOperations.movePage(doc, fromIndex, toIndex);
  }

  /**
   * Reorders all pages in a document according to a permutation (e.g. [2, 0, 1])
   * @param {PdfDocument} doc
   * @param {Array<number>} newOrder
   */
  static reorderPages(doc, newOrder) {
    return PdfPageOperations.reorderPages(doc, newOrder);
  }

  /**
   * Extracts specified pages into a new PdfDocument
   * @param {PdfDocument} doc
   * @param {Array<number>} pageIndices
   * @returns {PdfDocument}
   */
  static extractPages(doc, pageIndices) {
    return PdfPageOperations.extractPages(doc, pageIndices);
  }

  /**
   * Splits a document into multiple smaller documents
   * @param {PdfDocument} doc
   * @param {number} [pagesPerSplit=1]
   * @returns {Array<PdfDocument>}
   */
  static split(doc, pagesPerSplit = 1) {
    return PdfPageOperations.splitDocument(doc, pagesPerSplit);
  }

  /**
   * Merges multiple PdfDocuments into one unified document
   * @param {Array<PdfDocument|Uint8Array>} docs
   * @returns {PdfDocument}
   */
  static merge(docs) {
    const loadedDocs = docs.map(d => (d instanceof PdfDocument ? d : PdfDocument.load(d)));
    return PdfPageOperations.mergeDocuments(loadedDocs);
  }

  /**
   * Applies a diagonal text watermark to each page of a document
   * @param {PdfDocument} doc
   * @param {string} text
   * @param {object} [options]
   */
  static addWatermark(doc, text, options = {}) {
    const pageCount = doc.pageCount;
    const color = options.color || '#ff0000';
    const fontSize = options.fontSize || 48;
    const opacity = options.opacity || 0.2;

    for (let i = 0; i < pageCount; i++) {
      const page = doc.getPage(i);
      const mod = page.getModifier();
      const size = page.getSize();
      const midX = size[0] / 2;
      const midY = size[1] / 2;

      mod.saveGraphicsState();
      mod.drawText(text, {
        x: midX - (text.length * fontSize * 0.25),
        y: midY,
        size: fontSize,
        font: 'Helvetica-Bold',
        color,
        opacity
      });
      mod.restoreGraphicsState();
      mod.commit();
    }

    return doc;
  }
}
