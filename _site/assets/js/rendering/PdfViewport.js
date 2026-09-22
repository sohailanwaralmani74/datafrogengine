import { PdfPage } from '../document/PdfPage.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Manages coordinate system transformations between PDF user space (points, bottom-left origin)
 * and display/device space (pixels, top-left origin) with scaling and rotation.
 */
export class PdfViewport {
  /** @type {number} */
  #width;

  /** @type {number} */
  #height;

  /** @type {number} */
  #scale;

  /** @type {number} */
  #rotation;

  /** @type {Array<number>} [x1, y1, x2, y2] */
  #viewBox;

  /** @type {Array<number>} [a, b, c, d, e, f] */
  #transform;

  /**
   * @param {Object} options
   * @param {Array<number>} options.viewBox - [x1, y1, x2, y2] PDF CropBox / MediaBox
   * @param {number} [options.scale=1.0] - Zoom multiplier
   * @param {number} [options.rotation=0] - Degrees (0, 90, 180, 270)
   */
  constructor({ viewBox, scale = 1.0, rotation = 0 }) {
    if (!Array.isArray(viewBox) || viewBox.length < 4) {
      throw new PdfInvalidArgumentException('viewBox', viewBox, 'Array of 4 numbers [x1, y1, x2, y2]');
    }

    this.#viewBox = [...viewBox];
    this.#scale = scale > 0 ? scale : 1.0;
    this.#rotation = ((rotation % 360) + 360) % 360;

    const [x1, y1, x2, y2] = this.#viewBox;
    const rawWidth = Math.abs(x2 - x1);
    const rawHeight = Math.abs(y2 - y1);

    if (this.#rotation === 90 || this.#rotation === 270) {
      this.#width = Math.round(rawHeight * this.#scale);
      this.#height = Math.round(rawWidth * this.#scale);
    } else {
      this.#width = Math.round(rawWidth * this.#scale);
      this.#height = Math.round(rawHeight * this.#scale);
    }

    this.#transform = this.#computeTransform();
  }

  /**
   * Factory method to create a viewport from a PdfPage.
   * 
   * @param {PdfPage} page
   * @param {Object} [options={}]
   * @param {number} [options.scale=1.0]
   * @param {number} [options.rotation=null] - Overrides page rotation if set
   * @returns {PdfViewport}
   */
  static fromPage(page, { scale = 1.0, rotation = null } = {}) {
    if (!(page instanceof PdfPage)) {
      throw new PdfInvalidArgumentException('page', page, 'PdfPage');
    }
    const viewBox = page.getCropBox();
    const rot = rotation !== null ? rotation : page.getRotation();
    return new PdfViewport({ viewBox, scale, rotation: rot });
  }

  get width() {
    return this.#width;
  }

  get height() {
    return this.#height;
  }

  get scale() {
    return this.#scale;
  }

  get rotation() {
    return this.#rotation;
  }

  get viewBox() {
    return this.#viewBox;
  }

  /**
   * Returns the 6-parameter affine transform matrix [a, b, c, d, e, f]
   * mapping PDF user space to viewport device space.
   * 
   * @returns {Array<number>}
   */
  get transform() {
    return this.#transform;
  }

  /**
   * Transforms a point (x, y) in PDF user space to viewport space (x', y').
   * 
   * @param {number} x
   * @param {number} y
   * @returns {[number, number]}
   */
  transformPoint(x, y) {
    const [a, b, c, d, e, f] = this.#transform;
    return [
      x * a + y * c + e,
      x * b + y * d + f
    ];
  }

  /**
   * Computes the initial 2D affine matrix mapping PDF space to viewport coordinates.
   * @private
   */
  static #multiply(m1, m2) {
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;
    return [
      a1 * a2 + b1 * c2,
      a1 * b2 + b1 * d2,
      c1 * a2 + d1 * c2,
      c1 * b2 + d1 * d2,
      e1 * a2 + f1 * c2 + e2,
      e1 * b2 + f1 * d2 + f2
    ];
  }

  #computeTransform() {
    const [x1, y1, x2, y2] = this.#viewBox;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    // 1. Base flip: scale by (scale, -scale) and translate to top of page
    let m = [
      this.#scale, 0,
      0, -this.#scale,
      -minX * this.#scale,
      maxY * this.#scale
    ];

    // 2. Apply page rotation if any
    if (this.#rotation !== 0) {
      const rad = (this.#rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      let rotM;

      switch (this.#rotation) {
        case 90:
          rotM = [0, 1, -1, 0, this.#width, 0];
          break;
        case 180:
          rotM = [-1, 0, 0, -1, this.#width, this.#height];
          break;
        case 270:
          rotM = [0, -1, 1, 0, 0, this.#height];
          break;
        default:
          rotM = [cos, sin, -sin, cos, 0, 0];
          break;
      }
      m = PdfViewport.#multiply(m, rotM);
    }

    return m;
  }
}
