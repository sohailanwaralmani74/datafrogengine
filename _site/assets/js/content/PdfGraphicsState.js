import { PdfTextState } from './PdfTextState.js';

/**
 * Tracks the PDF graphics state (CTM, line styles, color spaces, colors, and text state).
 */
export class PdfGraphicsState {
  /** @type {Array<number>} Current Transformation Matrix [a, b, c, d, e, f] */
  ctm = [1, 0, 0, 1, 0, 0];

  /** @type {number} Line width ('w') */
  lineWidth = 1.0;

  /** @type {number} Line cap ('J') */
  lineCap = 0;

  /** @type {number} Line join ('j') */
  lineJoin = 0;

  /** @type {number} Miter limit ('M') */
  miterLimit = 10.0;

  /** @type {[Array<number>, number]} Dash pattern: [dashArray, dashPhase] ('d') */
  dashPattern = [[], 0];

  /** @type {string} Rendering intent ('ri') */
  renderingIntent = 'RelativeColorimetric';

  /** @type {number} Flatness ('i') */
  flatness = 1.0;

  /** @type {string} Stroking color space ('CS') */
  strokeColorSpace = 'DeviceGray';

  /** @type {string} Non-stroking color space ('cs') */
  nonStrokeColorSpace = 'DeviceGray';

  /** @type {Array<number>} Stroking color components ('SC', 'RG', 'G', 'K') */
  strokeColor = [0];

  /** @type {Array<number>} Non-stroking color components ('sc', 'rg', 'g', 'k') */
  nonStrokeColor = [0];

  /** @type {number} Stroking alpha constant ('CA') */
  strokeAlpha = 1.0;

  /** @type {number} Non-stroking alpha constant ('ca') */
  nonStrokeAlpha = 1.0;

  /** @type {PdfTextState} Current text state */
  textState = new PdfTextState();

  /**
   * Multiplies two 2D affine transformation matrices: M1 * M2.
   * [a1, b1, c1, d1, e1, f1] * [a2, b2, c2, d2, e2, f2]
   * 
   * @param {Array<number>} m1
   * @param {Array<number>} m2
   * @returns {Array<number>}
   */
  static multiplyMatrices(m1, m2) {
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

  /**
   * Concatenates transformation matrix [a, b, c, d, e, f] to CTM ('cm').
   * CTM_new = M * CTM_old
   * 
   * @param {number} a
   * @param {number} b
   * @param {number} c
   * @param {number} d
   * @param {number} e
   * @param {number} f
   */
  transform(a, b, c, d, e, f) {
    this.ctm = PdfGraphicsState.multiplyMatrices([a, b, c, d, e, f], this.ctm);
  }

  /**
   * Returns a deep clone of the graphics state (used during 'q' push).
   * @returns {PdfGraphicsState}
   */
  clone() {
    const copy = new PdfGraphicsState();
    copy.ctm = [...this.ctm];
    copy.lineWidth = this.lineWidth;
    copy.lineCap = this.lineCap;
    copy.lineJoin = this.lineJoin;
    copy.miterLimit = this.miterLimit;
    copy.dashPattern = [[...this.dashPattern[0]], this.dashPattern[1]];
    copy.renderingIntent = this.renderingIntent;
    copy.flatness = this.flatness;
    copy.strokeColorSpace = this.strokeColorSpace;
    copy.nonStrokeColorSpace = this.nonStrokeColorSpace;
    copy.strokeColor = [...this.strokeColor];
    copy.nonStrokeColor = [...this.nonStrokeColor];
    copy.strokeAlpha = this.strokeAlpha;
    copy.nonStrokeAlpha = this.nonStrokeAlpha;
    copy.textState = this.textState.clone();
    return copy;
  }
}
