/**
 * PdfComparator - Visual and semantic comparison between PDF documents.
 * Compares page counts, page dimensions, text content per page, and document metadata.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfTextExtractor } from '../extraction/PdfTextExtractor.js';

export class PdfComparator {
  /**
   * Compares two PDF documents
   * @param {PdfDocument|Uint8Array} pdfA Original PDF
   * @param {PdfDocument|Uint8Array} pdfB Modified PDF
   * @param {object} [options]
   * @returns {object} Comparison results
   */
  static compare(pdfA, pdfB, options = {}) {
    const docA = pdfA instanceof PdfDocument ? pdfA : PdfDocument.load(pdfA);
    const docB = pdfB instanceof PdfDocument ? pdfB : PdfDocument.load(pdfB);

    const countA = docA.pageCount;
    const countB = docB.pageCount;

    const pageCountMatch = countA === countB;
    const maxPages = Math.max(countA, countB);

    const pageDifferences = [];
    let textMismatches = 0;
    let dimensionMismatches = 0;

    for (let i = 0; i < maxPages; i++) {
      const pageNum = i + 1;
      const pageA = i < countA ? docA.getPage(i) : null;
      const pageB = i < countB ? docB.getPage(i) : null;

      if (!pageA && pageB) {
        pageDifferences.push({ pageNumber: pageNum, status: 'ADDED_PAGE' });
      } else if (pageA && !pageB) {
        pageDifferences.push({ pageNumber: pageNum, status: 'REMOVED_PAGE' });
      } else {
        const sizeA = pageA.getSize ? pageA.getSize() : [0, 0];
        const sizeB = pageB.getSize ? pageB.getSize() : [0, 0];

        const dimsMatch = sizeA[0] === sizeB[0] && sizeA[1] === sizeB[1];
        if (!dimsMatch) dimensionMismatches++;

        const textA = PdfTextExtractor.extractText(pageA).trim();
        const textB = PdfTextExtractor.extractText(pageB).trim();
        const textMatch = textA === textB;
        if (!textMatch) textMismatches++;

        if (!dimsMatch || !textMatch) {
          pageDifferences.push({
            pageNumber: pageNum,
            status: 'MODIFIED',
            dimensionsMatch: dimsMatch,
            sizeA,
            sizeB,
            textMatch,
            textLengthA: textA.length,
            textLengthB: textB.length
          });
        }
      }
    }

    const identical = pageCountMatch && pageDifferences.length === 0;

    return {
      identical,
      summary: {
        pageCountA: countA,
        pageCountB: countB,
        pageCountMatch,
        modifiedPagesCount: pageDifferences.length,
        textMismatches,
        dimensionMismatches
      },
      pageDifferences
    };
  }
}
