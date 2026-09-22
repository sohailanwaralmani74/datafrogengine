import { PdfDocument } from '../document/PdfDocument.js';
import { PdfPageModifier } from './PdfPageModifier.js';
import { pageExtractionHelper } from '../document/PdfPage.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * High-level document-wide modification utilities:
 * watermarking, headers/footers, and page numbering across all pages.
 */
export class PdfDocumentModifier {
  /**
   * Adds watermark text to all pages in the document.
   * 
   * @param {PdfDocument} document
   * @param {string} text
   * @param {Object} [options={}]
   */
  static addWatermark(document, text, options = {}) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }
    const pages = document.getCatalog().getPageTree().getAllPages();
    for (const page of pages) {
      const modifier = new PdfPageModifier(page);
      modifier.addWatermark(text, options);
      modifier.commit();
    }
  }

  /**
   * Adds page numbers to all pages in the document.
   * 
   * @param {PdfDocument} document
   * @param {Object} [options={}]
   * @param {string} [options.format='Page {page} of {total}']
   * @param {string} [options.position='bottom-center'] - 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right'
   * @param {number} [options.size=10]
   * @param {string} [options.font='Helvetica']
   * @param {string} [options.color='#555555']
   */
  static addPageNumbers(document, options = {}) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }

    const {
      format = 'Page {page} of {total}',
      position = 'bottom-center',
      size = 10,
      font = 'Helvetica',
      color = '#555555'
    } = options;

    const pages = document.getCatalog().getPageTree().getAllPages();
    const total = pages.length;

    for (let i = 0; i < total; i++) {
      const page = pages[i];
      const pageNum = i + 1;
      const text = format.replace('{page}', String(pageNum)).replace('{total}', String(total));

      const { width, height } = page.getSize();
      let x = width / 2;
      let y = 30;
      let align = 'center';

      switch (position) {
        case 'bottom-right':
          x = width - 50;
          y = 30;
          align = 'right';
          break;
        case 'bottom-left':
          x = 50;
          y = 30;
          align = 'left';
          break;
        case 'top-center':
          x = width / 2;
          y = height - 40;
          align = 'center';
          break;
        case 'top-right':
          x = width - 50;
          y = height - 40;
          align = 'right';
          break;
        case 'bottom-center':
        default:
          x = width / 2;
          y = 30;
          align = 'center';
          break;
      }

      const modifier = new PdfPageModifier(page);
      modifier.drawText(text, { x, y, size, font, color, align });
      modifier.commit();
    }
  }
}

pageExtractionHelper.PdfDocumentModifier = PdfDocumentModifier;
