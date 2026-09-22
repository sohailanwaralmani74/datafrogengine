import { PdfDocument } from '../document/PdfDocument.js';
import { PdfPageModifier } from '../modification/PdfPageModifier.js';
import { PdfPageSizes } from './PdfPageSizes.js';
import { PdfParagraph } from './PdfParagraph.js';
import { PdfTable } from './PdfTable.js';
import { PdfSpacer, PdfDivider, PdfImageElement } from './PdfLayoutElements.js';
import { PdfFontMetrics } from './PdfFontMetrics.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';


/**
 * High-level declarative and flowable PDF document generation engine.
 */
export class PdfDocumentBuilder {
  /** @type {[number, number]} */
  #pageSize;

  /** @type {'portrait'|'landscape'} */
  #orientation;

  /** @type {{ top: number, right: number, bottom: number, left: number }} */
  #margins;

  /** @type {string} */
  #defaultFont;

  /** @type {number} */
  #defaultFontSize;

  /** @type {string} */
  #defaultColor;

  /** @type {Array<any>} */
  #elements;

  /** @type {Function|Object|null} */
  #headerConfig;

  /** @type {Function|Object|null} */
  #footerConfig;

  /**
   * @param {Object} [options={}]
   * @param {string|Array<number>} [options.pageSize='A4']
   * @param {'portrait'|'landscape'} [options.orientation='portrait']
   * @param {number|Object} [options.margins=50]
   * @param {string} [options.defaultFont='Helvetica']
   * @param {number} [options.defaultFontSize=12]
   * @param {string} [options.defaultColor='#000000']
   * @param {Function|Object} [options.header=null]
   * @param {Function|Object} [options.footer=null]
   */
  constructor(options = {}) {
    const size = options.pageSize || 'A4';
    const orientation = options.orientation || 'portrait';
    this.#orientation = orientation;
    this.#pageSize = PdfPageSizes.resolveDimensions(size, orientation);

    this.#margins = PdfDocumentBuilder.#normalizeMargins(options.margins !== undefined ? options.margins : 50);
    this.#defaultFont = options.defaultFont || 'Helvetica';
    this.#defaultFontSize = typeof options.defaultFontSize === 'number' ? options.defaultFontSize : 12;
    this.#defaultColor = options.defaultColor || '#000000';

    this.#elements = [];
    this.#headerConfig = options.header || null;
    this.#footerConfig = options.footer || null;
  }

  /**
   * Sets page dimensions and orientation.
   * @param {string|Array<number>} size
   * @param {'portrait'|'landscape'} [orientation='portrait']
   * @returns {PdfDocumentBuilder}
   */
  setPageSize(size, orientation = 'portrait') {
    this.#orientation = orientation;
    this.#pageSize = PdfPageSizes.resolveDimensions(size, orientation);
    return this;
  }

  /**
   * Sets document margins.
   * @param {number|Object} margins
   * @returns {PdfDocumentBuilder}
   */
  setMargins(margins) {
    this.#margins = PdfDocumentBuilder.#normalizeMargins(margins);
    return this;
  }

  /**
   * Sets running header configuration or generator callback.
   * @param {Function|Object} header
   * @returns {PdfDocumentBuilder}
   */
  setHeader(header) {
    this.#headerConfig = header;
    return this;
  }

  /**
   * Sets running footer configuration or generator callback.
   * @param {Function|Object} footer
   * @returns {PdfDocumentBuilder}
   */
  setFooter(footer) {
    this.#footerConfig = footer;
    return this;
  }

  /**
   * Adds a styled heading.
   * 
   * @param {string} text
   * @param {number} [level=1] - 1 to 6
   * @param {Object} [options={}]
   * @returns {PdfDocumentBuilder}
   */
  addHeading(text, level = 1, options = {}) {
    const headingPresets = {
      1: { size: 24, font: 'Helvetica-Bold', before: 14, after: 8 },
      2: { size: 18, font: 'Helvetica-Bold', before: 12, after: 6 },
      3: { size: 14, font: 'Helvetica-Bold', before: 10, after: 5 },
      4: { size: 12, font: 'Helvetica-Bold', before: 8, after: 4 },
      5: { size: 11, font: 'Helvetica-Bold', before: 6, after: 3 },
      6: { size: 10, font: 'Helvetica-Bold', before: 4, after: 2 }
    };

    const preset = headingPresets[level] || headingPresets[1];
    const para = new PdfParagraph(text, {
      font: options.font || preset.font,
      fontSize: options.fontSize || preset.size,
      color: options.color || this.#defaultColor,
      align: options.align || 'left',
      spacingBefore: options.spacingBefore !== undefined ? options.spacingBefore : preset.before,
      spacingAfter: options.spacingAfter !== undefined ? options.spacingAfter : preset.after,
      ...options
    });

    this.#elements.push(para);
    return this;
  }

  /**
   * Adds a paragraph of flowable text.
   * 
   * @param {string} text
   * @param {Object} [options={}]
   * @returns {PdfDocumentBuilder}
   */
  addParagraph(text, options = {}) {
    const para = new PdfParagraph(text, {
      font: options.font || this.#defaultFont,
      fontSize: options.fontSize || this.#defaultFontSize,
      color: options.color || this.#defaultColor,
      ...options
    });
    this.#elements.push(para);
    return this;
  }

  /**
   * Adds a bullet list item.
   * 
   * @param {string} text
   * @param {Object} [options={}]
   * @returns {PdfDocumentBuilder}
   */
  addBullet(text, options = {}) {
    const bulletChar = options.bullet || '•';
    const para = new PdfParagraph(text, {
      font: options.font || this.#defaultFont,
      fontSize: options.fontSize || this.#defaultFontSize,
      color: options.color || this.#defaultColor,
      bullet: bulletChar,
      indent: options.indent !== undefined ? options.indent : 15,
      spacingBefore: options.spacingBefore !== undefined ? options.spacingBefore : 2,
      spacingAfter: options.spacingAfter !== undefined ? options.spacingAfter : 3,
      ...options
    });
    this.#elements.push(para);
    return this;
  }

  /**
   * Adds a numbered list item.
   * 
   * @param {number|string} number
   * @param {string} text
   * @param {Object} [options={}]
   * @returns {PdfDocumentBuilder}
   */
  addNumbered(number, text, options = {}) {
    const prefix = `${number}.`;
    const para = new PdfParagraph(text, {
      font: options.font || this.#defaultFont,
      fontSize: options.fontSize || this.#defaultFontSize,
      color: options.color || this.#defaultColor,
      bullet: prefix,
      indent: options.indent !== undefined ? options.indent : 18,
      spacingBefore: options.spacingBefore !== undefined ? options.spacingBefore : 2,
      spacingAfter: options.spacingAfter !== undefined ? options.spacingAfter : 3,
      ...options
    });
    this.#elements.push(para);
    return this;
  }

  /**
   * Adds a multi-column table.
   * 
   * @param {PdfTable|Object} tableOrOptions
   * @returns {PdfDocumentBuilder}
   */
  addTable(tableOrOptions) {
    let table;
    if (tableOrOptions instanceof PdfTable) {
      table = tableOrOptions;
    } else if (typeof tableOrOptions === 'object' && tableOrOptions !== null) {
      table = new PdfTable(tableOrOptions);
    } else {
      throw new PdfInvalidArgumentException('tableOrOptions', tableOrOptions, 'PdfTable or Object');
    }
    this.#elements.push(table);
    return this;
  }

  /**
   * Adds a scaled flowable image.
   * 
   * @param {PdfImage|Uint8Array} imageInput
   * @param {Object} [options={}]
   * @returns {PdfDocumentBuilder}
   */
  addImage(imageInput, options = {}) {
    const imgEl = new PdfImageElement(imageInput, options);
    this.#elements.push(imgEl);
    return this;
  }

  /**
   * Adds a horizontal divider line.
   * 
   * @param {Object} [options={}]
   * @returns {PdfDocumentBuilder}
   */
  addDivider(options = {}) {
    this.#elements.push(new PdfDivider(options));
    return this;
  }

  /**
   * Adds vertical blank space.
   * 
   * @param {number} [height=10]
   * @returns {PdfDocumentBuilder}
   */
  addSpacer(height = 10) {
    this.#elements.push(new PdfSpacer(height));
    return this;
  }

  /**
   * Inserts an explicit page break.
   * 
   * @returns {PdfDocumentBuilder}
   */
  addPageBreak() {
    this.#elements.push({ type: 'pageBreak' });
    return this;
  }

  /**
   * Builds and returns a fully composed PdfDocument.
   * 
   * @returns {PdfDocument}
   */
  build() {
    const doc = PdfDocument.create();
    const [pageWidth, pageHeight] = this.#pageSize;
    const margins = this.#margins;

    const availableWidth = pageWidth - margins.left - margins.right;
    const minY = margins.bottom;
    const startY = pageHeight - margins.top;

    let currentPage = doc.addPage([pageWidth, pageHeight]);
    let modifier = currentPage.getModifier();
    let cursorY = startY;

    const advanceToNewPage = () => {
      modifier.commit();
      currentPage = doc.addPage([pageWidth, pageHeight]);
      modifier = currentPage.getModifier();
      cursorY = startY;
    };

    for (let elIndex = 0; elIndex < this.#elements.length; elIndex++) {
      const el = this.#elements[elIndex];

      if (el.type === 'pageBreak') {
        advanceToNewPage();
        continue;
      }

      if (el instanceof PdfTable) {
        // Table layout with row-by-row pagination
        const table = el;
        const colWidths = table.resolveColumnWidths(availableWidth);
        const headerLayout = table.headers.length > 0 ? table.computeRowLayout(table.headers, colWidths, true) : null;
        const rowLayouts = table.rows.map(row => table.computeRowLayout(row, colWidths, false));

        cursorY -= table.spacingBefore;

        // Render header if first page
        if (headerLayout) {
          if (cursorY - headerLayout.height < minY && cursorY < startY) {
            advanceToNewPage();
          }
          cursorY = table.renderRow(modifier, headerLayout, margins.left, cursorY, colWidths);
        }

        // Render data rows
        for (let r = 0; r < rowLayouts.length; r++) {
          const rowLayout = rowLayouts[r];
          const neededHeight = rowLayout.height;

          if (cursorY - neededHeight < minY && cursorY < startY) {
            advanceToNewPage();
            // Repeat header on new page if configured
            if (table.repeatHeaderOnNewPage && headerLayout) {
              cursorY = table.renderRow(modifier, headerLayout, margins.left, cursorY, colWidths);
            }
          }

          const defaultRowFill = (table.alternateRowColor && r % 2 === 1) ? table.alternateRowColor : null;
          cursorY = table.renderRow(modifier, rowLayout, margins.left, cursorY, colWidths, defaultRowFill);
        }

        cursorY -= table.spacingAfter;
        continue;
      }

      // Paragraph / Spacer / Divider / ImageElement
      const layout = el.layout(availableWidth);
      const elementHeight = layout.totalHeight || layout.height;

      if (cursorY - elementHeight < minY && cursorY < startY) {
        advanceToNewPage();
      }

      cursorY = el.render(modifier, margins.left, cursorY, availableWidth);
    }

    modifier.commit();

    // Deferred pass: Headers and Footers
    const totalPages = doc.pageCount;
    for (let p = 0; p < totalPages; p++) {
      const pageNum = p + 1;
      const page = doc.getPage(p);
      const pageMod = page.getModifier();

      this.#applyHeader(pageMod, pageNum, totalPages, pageWidth, pageHeight, margins);
      this.#applyFooter(pageMod, pageNum, totalPages, pageWidth, pageHeight, margins);

      pageMod.commit();
    }

    return doc;
  }

  /**
   * Generates binary PDF bytes for the built document.
   * 
   * @returns {Uint8Array}
   */
  save() {
    const doc = this.build();
    return doc.save();
  }

  /**
   * Applies header to a page.
   * @private
   */
  #applyHeader(modifier, pageNum, totalPages, pageWidth, pageHeight, margins) {
    if (!this.#headerConfig) return;

    if (typeof this.#headerConfig === 'function') {
      this.#headerConfig(modifier, pageNum, totalPages, [pageWidth, pageHeight]);
      return;
    }

    const cfg = this.#headerConfig;
    const text = typeof cfg === 'string'
      ? cfg
      : (cfg.text || '');

    const formattedText = text
      .replace(/\{page\}/g, String(pageNum))
      .replace(/\{pages\}/g, String(totalPages));

    const font = cfg.font || 'Helvetica';
    const fontSize = cfg.fontSize || 9;
    const color = cfg.color || '#777777';
    const align = cfg.align || 'right';
    const headerY = pageHeight - (margins.top / 2);

    let drawX = margins.left;
    if (align === 'center') {
      drawX = pageWidth / 2;
    } else if (align === 'right') {
      drawX = pageWidth - margins.right;
    }

    modifier.drawText(formattedText, {
      x: drawX,
      y: headerY,
      size: fontSize,
      font,
      color,
      align
    });

    if (cfg.divider) {
      const lineY = headerY - 6;
      modifier.drawLine({
        start: { x: margins.left, y: lineY },
        end: { x: pageWidth - margins.right, y: lineY },
        color: cfg.dividerColor || '#dddddd',
        thickness: 0.5
      });
    }
  }

  /**
   * Applies footer to a page.
   * @private
   */
  #applyFooter(modifier, pageNum, totalPages, pageWidth, pageHeight, margins) {
    if (!this.#footerConfig) return;

    if (typeof this.#footerConfig === 'function') {
      this.#footerConfig(modifier, pageNum, totalPages, [pageWidth, pageHeight]);
      return;
    }

    const cfg = this.#footerConfig;
    const text = typeof cfg === 'string'
      ? cfg
      : (cfg.text || 'Page {page} of {pages}');

    const formattedText = text
      .replace(/\{page\}/g, String(pageNum))
      .replace(/\{pages\}/g, String(totalPages));

    const font = cfg.font || 'Helvetica';
    const fontSize = cfg.fontSize || 9;
    const color = cfg.color || '#777777';
    const align = cfg.align || 'center';
    const footerY = margins.bottom / 2;

    let drawX = margins.left;
    if (align === 'center') {
      drawX = pageWidth / 2;
    } else if (align === 'right') {
      drawX = pageWidth - margins.right;
    }

    modifier.drawText(formattedText, {
      x: drawX,
      y: footerY,
      size: fontSize,
      font,
      color,
      align
    });

    if (cfg.divider) {
      const lineY = footerY + 12;
      modifier.drawLine({
        start: { x: margins.left, y: lineY },
        end: { x: pageWidth - margins.right, y: lineY },
        color: cfg.dividerColor || '#dddddd',
        thickness: 0.5
      });
    }
  }

  /**
   * Normalizes margin inputs to { top, right, bottom, left }.
   * @private
   */
  static #normalizeMargins(margins) {
    if (typeof margins === 'number') {
      return { top: margins, right: margins, bottom: margins, left: margins };
    }
    if (typeof margins === 'object' && margins !== null) {
      return {
        top: margins.top ?? 50,
        right: margins.right ?? 50,
        bottom: margins.bottom ?? 50,
        left: margins.left ?? 50
      };
    }
    return { top: 50, right: 50, bottom: 50, left: 50 };
  }
}
