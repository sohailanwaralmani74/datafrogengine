import { PdfViewport } from './PdfViewport.js';
import { PdfCanvasRenderer } from './PdfCanvasRenderer.js';
import { PdfSvgRenderer } from './PdfSvgRenderer.js';
import { PdfPage, pageExtractionHelper } from '../document/PdfPage.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Top-level rendering manager for converting PDF pages to HTML5 Canvas and SVG vector formats.
 */
export class PdfRenderer {
  /**
   * Renders a PDF page to an HTML5 Canvas element or 2D rendering context.
   * 
   * @param {PdfPage} page
   * @param {HTMLCanvasElement|CanvasRenderingContext2D|Object} canvasOrContext
   * @param {Object} [options={}]
   * @param {number} [options.scale=1.0]
   * @param {number} [options.rotation=null]
   * @param {string} [options.background='#ffffff']
   * @returns {PdfViewport}
   */
  static renderToCanvas(page, canvasOrContext, options = {}) {
    return PdfCanvasRenderer.render(page, canvasOrContext, options);
  }

  /**
   * Renders a PDF page to a standalone scalable SVG XML string.
   * 
   * @param {PdfPage} page
   * @param {Object} [options={}]
   * @param {number} [options.scale=1.0]
   * @param {number} [options.rotation=null]
   * @param {string} [options.background='#ffffff']
   * @returns {string} - SVG XML string
   */
  static renderToSvg(page, options = {}) {
    return PdfSvgRenderer.render(page, options);
  }

  /**
   * Calculates the rendering viewport and dimension metrics for a page.
   * 
   * @param {PdfPage} page
   * @param {Object} [options={}]
   * @returns {PdfViewport}
   */
  static createViewport(page, options = {}) {
    return PdfViewport.fromPage(page, options);
  }
}

pageExtractionHelper.PdfRenderer = PdfRenderer;
