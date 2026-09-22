/**
 * PdfConverter - Extracts text, structured JSON representations, and XML outlines from PDF documents.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfTextExtractor } from '../extraction/PdfTextExtractor.js';

export class PdfConverter {
  /**
   * Extracts all text from a PDF document or byte buffer
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @param {object} [options]
   * @returns {string} Extracted plain text
   */
  static toText(docOrBytes, options = {}) {
    const doc = docOrBytes instanceof PdfDocument ? docOrBytes : PdfDocument.load(docOrBytes);
    return PdfTextExtractor.extractAllText(doc);
  }

  /**
   * Extracts text grouped by page
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @returns {Array<{ page: number, text: string }>}
   */
  static toPageTextList(docOrBytes) {
    const doc = docOrBytes instanceof PdfDocument ? docOrBytes : PdfDocument.load(docOrBytes);
    const pages = doc.getCatalog().getPageTree().getAllPages();
    return pages.map((p, idx) => ({
      page: idx + 1,
      text: PdfTextExtractor.extractText(p)
    }));
  }

  /**
   * Converts PDF document structure into a comprehensive JSON outline
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @returns {object} JSON document representation
   */
  static toJson(docOrBytes) {
    const doc = docOrBytes instanceof PdfDocument ? docOrBytes : PdfDocument.load(docOrBytes);
    const catalog = doc.getCatalog();
    const pageTree = catalog.getPageTree();
    const pages = pageTree.getAllPages();

    const info = doc.getInfo ? doc.getInfo() : null;

    const pageSummaries = pages.map((page, idx) => {
      const size = page.getSize ? page.getSize() : [0, 0];
      const rotation = page.getRotation ? page.getRotation() : 0;
      const text = PdfTextExtractor.extractText(page);

      return {
        pageNumber: idx + 1,
        width: size[0],
        height: size[1],
        rotation,
        textLength: text.length,
        text
      };
    });

    return {
      version: doc.getPdfVersion ? doc.getPdfVersion() : '1.7',
      pageCount: pages.length,
      metadata: info ? {
        title: info.getTitle ? info.getTitle() : '',
        author: info.getAuthor ? info.getAuthor() : '',
        subject: info.getSubject ? info.getSubject() : '',
        creator: info.getCreator ? info.getCreator() : '',
        producer: info.getProducer ? info.getProducer() : ''
      } : {},
      pages: pageSummaries
    };
  }

  /**
   * Converts PDF document outline to XML
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @returns {string} XML string
   */
  static toXml(docOrBytes) {
    const json = PdfConverter.toJson(docOrBytes);
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<PdfDocument version="${json.version}" pageCount="${json.pageCount}">\n`;
    xml += '  <Metadata>\n';
    for (const [k, v] of Object.entries(json.metadata)) {
      if (v) xml += `    <${k}>${escapeXml(v)}</${k}>\n`;
    }
    xml += '  </Metadata>\n  <Pages>\n';
    for (const p of json.pages) {
      xml += `    <Page number="${p.pageNumber}" width="${p.width}" height="${p.height}" rotation="${p.rotation}">\n`;
      xml += `      <Text>${escapeXml(p.text)}</Text>\n`;
      xml += '    </Page>\n';
    }
    xml += '  </Pages>\n</PdfDocument>';
    return xml;
  }
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
