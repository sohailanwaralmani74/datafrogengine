/**
 * PdfAnalyzer - Deep inspection, security auditing, structural profiling,
 * and typographic metrics for PDF documents.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfTextExtractor } from '../extraction/PdfTextExtractor.js';

export class PdfAnalyzer {
  /**
   * Performs complete audit and profiling of a PDF document
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @returns {object} Full analysis profile
   */
  static analyze(docOrBytes) {
    const doc = docOrBytes instanceof PdfDocument ? docOrBytes : PdfDocument.load(docOrBytes);
    const pages = doc.getCatalog().getPageTree().getAllPages();

    const info = doc.getInfo ? doc.getInfo() : null;

    let totalCharacters = 0;
    let totalWords = 0;

    const pageProfiles = pages.map((page, idx) => {
      const size = page.getSize ? page.getSize() : [0, 0];
      const rotation = page.getRotation ? page.getRotation() : 0;
      const text = PdfTextExtractor.extractText(page);

      const words = text.trim().length > 0 ? text.trim().split(/\s+/).length : 0;
      totalCharacters += text.length;
      totalWords += words;

      const orientation = size[0] > size[1] ? 'landscape' : 'portrait';

      return {
        pageNumber: idx + 1,
        width: size[0],
        height: size[1],
        orientation,
        rotation,
        characterCount: text.length,
        wordCount: words
      };
    });

    return {
      version: doc.getPdfVersion ? doc.getPdfVersion() : '1.7',
      pageCount: pages.length,
      isEncrypted: !!doc.securityHandler,
      metadata: info ? {
        title: info.getTitle ? info.getTitle() : '',
        author: info.getAuthor ? info.getAuthor() : '',
        subject: info.getSubject ? info.getSubject() : '',
        creator: info.getCreator ? info.getCreator() : '',
        producer: info.getProducer ? info.getProducer() : ''
      } : {},
      textStats: {
        totalCharacters,
        totalWords
      },
      pages: pageProfiles
    };
  }
}
