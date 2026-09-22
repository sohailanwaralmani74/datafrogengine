import { PdfImage } from '../images/PdfImage.js';
import { PdfPageModifier } from '../modification/PdfPageModifier.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Vertical spacer layout element.
 */
export class PdfSpacer {
  /** @type {number} */
  #height;

  /**
   * @param {number} [height=10]
   */
  constructor(height = 10) {
    this.#height = typeof height === 'number' && height >= 0 ? height : 10;
  }

  get height() {
    return this.#height;
  }

  layout() {
    return { height: this.#height };
  }

  render(modifier, x, topY, availableWidth) {
    return topY - this.#height;
  }
}

/**
 * Horizontal divider / rule layout element.
 */
export class PdfDivider {
  /** @type {number} */
  #thickness;

  /** @type {string|Array<number>} */
  #color;

  /** @type {Array<number>|null} */
  #dashArray;

  /** @type {number} */
  #spacingBefore;

  /** @type {number} */
  #spacingAfter;

  /**
   * @param {Object} [options={}]
   * @param {number} [options.thickness=1]
   * @param {string|Array<number>} [options.color='#cccccc']
   * @param {Array<number>|null} [options.dashArray=null]
   * @param {number} [options.spacingBefore=8]
   * @param {number} [options.spacingAfter=8]
   */
  constructor(options = {}) {
    this.#thickness = typeof options.thickness === 'number' ? options.thickness : 1;
    this.#color = options.color || '#cccccc';
    this.#dashArray = Array.isArray(options.dashArray) ? options.dashArray : null;
    this.#spacingBefore = typeof options.spacingBefore === 'number' ? options.spacingBefore : 8;
    this.#spacingAfter = typeof options.spacingAfter === 'number' ? options.spacingAfter : 8;
  }

  get height() {
    return this.#spacingBefore + this.#thickness + this.#spacingAfter;
  }

  layout() {
    return { height: this.height };
  }

  render(modifier, x, topY, availableWidth) {
    const lineY = topY - this.#spacingBefore - (this.#thickness / 2);

    modifier.drawLine({
      start: { x, y: lineY },
      end: { x: x + availableWidth, y: lineY },
      color: this.#color,
      thickness: this.#thickness,
      dashArray: this.#dashArray
    });

    return topY - this.height;
  }
}

/**
 * Flowable image layout element.
 */
export class PdfImageElement {
  /** @type {PdfImage|Uint8Array} */
  #image;

  /** @type {number} */
  #width;

  /** @type {number} */
  #height;

  /** @type {'left'|'center'|'right'} */
  #align;

  /** @type {number} */
  #spacingBefore;

  /** @type {number} */
  #spacingAfter;

  /**
   * @param {PdfImage|Uint8Array} imageInput
   * @param {Object} [options={}]
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {'left'|'center'|'right'} [options.align='left']
   * @param {number} [options.spacingBefore=6]
   * @param {number} [options.spacingAfter=6]
   */
  constructor(imageInput, options = {}) {
    if (!imageInput) {
      throw new PdfInvalidArgumentException('imageInput', imageInput, 'PdfImage or Uint8Array');
    }
    this.#image = imageInput;
    this.#width = typeof options.width === 'number' ? options.width : 150;
    this.#height = typeof options.height === 'number' ? options.height : 100;
    this.#align = options.align || 'left';
    this.#spacingBefore = typeof options.spacingBefore === 'number' ? options.spacingBefore : 6;
    this.#spacingAfter = typeof options.spacingAfter === 'number' ? options.spacingAfter : 6;
  }

  get image() { return this.#image; }
  get width() { return this.#width; }
  get height() { return this.#height; }
  get align() { return this.#align; }
  get spacingBefore() { return this.#spacingBefore; }
  get spacingAfter() { return this.#spacingAfter; }

  layout(availableWidth) {
    let renderWidth = Math.min(this.#width, availableWidth);
    let scaleFactor = renderWidth / this.#width;
    let renderHeight = this.#height * scaleFactor;

    return {
      width: renderWidth,
      height: renderHeight,
      totalHeight: this.#spacingBefore + renderHeight + this.#spacingAfter
    };
  }

  render(modifier, x, topY, availableWidth) {
    const layout = this.layout(availableWidth);
    let drawX = x;

    if (this.#align === 'center') {
      drawX = x + (availableWidth - layout.width) / 2;
    } else if (this.#align === 'right') {
      drawX = x + (availableWidth - layout.width);
    }

    const drawY = topY - this.#spacingBefore - layout.height;

    modifier.drawImage(this.#image, {
      x: drawX,
      y: drawY,
      width: layout.width,
      height: layout.height
    });

    return topY - layout.totalHeight;
  }
}
