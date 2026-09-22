/**
 * Represents the PDF text state tracking font, text matrix, leading, and spacing.
 */
export class PdfTextState {
  /** @type {number} Character spacing (Tc) */
  charSpacing = 0;

  /** @type {number} Word spacing (Tw) */
  wordSpacing = 0;

  /** @type {number} Horizontal scaling percentage (Tz) */
  horizontalScaling = 100;

  /** @type {number} Leading (TL) */
  leading = 0;

  /** @type {string|null} Font resource name (Tf) */
  fontName = null;

  /** @type {number} Font size (Tf) */
  fontSize = 0;

  /** @type {number} Text rendering mode (Tr) */
  renderingMode = 0;

  /** @type {number} Text rise (Ts) */
  textRise = 0;

  /** @type {Array<number>} Text Matrix (Tm): [a, b, c, d, e, f] */
  textMatrix = [1, 0, 0, 1, 0, 0];

  /** @type {Array<number>} Text Line Matrix (Tlm): [a, b, c, d, e, f] */
  textLineMatrix = [1, 0, 0, 1, 0, 0];

  /**
   * Resets text matrices upon 'BT' (Begin Text).
   */
  resetForBT() {
    this.textMatrix = [1, 0, 0, 1, 0, 0];
    this.textLineMatrix = [1, 0, 0, 1, 0, 0];
  }

  /**
   * Sets the active font and font size ('Tf').
   * @param {string} fontName
   * @param {number} fontSize
   */
  setFont(fontName, fontSize) {
    this.fontName = fontName;
    this.fontSize = fontSize;
  }

  /**
   * Sets the text matrix ('Tm') and updates the line matrix.
   * @param {number} a
   * @param {number} b
   * @param {number} c
   * @param {number} d
   * @param {number} e
   * @param {number} f
   */
  setTextMatrix(a, b, c, d, e, f) {
    this.textMatrix = [a, b, c, d, e, f];
    this.textLineMatrix = [a, b, c, d, e, f];
  }

  /**
   * Moves to start of next line with offset ('Td', 'TD').
   * Updates Tlm and sets Tm = Tlm.
   * 
   * @param {number} tx
   * @param {number} ty
   */
  moveText(tx, ty) {
    const [a, b, c, d, e, f] = this.textLineMatrix;
    // Translate Tlm by (tx, ty)
    const newE = tx * a + ty * c + e;
    const newF = tx * b + ty * d + f;
    this.textLineMatrix = [a, b, c, d, newE, newF];
    this.textMatrix = [...this.textLineMatrix];
  }

  /**
   * Moves to start of next line using current leading ('T*').
   */
  nextLine() {
    this.moveText(0, -this.leading);
  }

  /**
   * Returns a deep clone of this text state.
   * @returns {PdfTextState}
   */
  clone() {
    const copy = new PdfTextState();
    copy.charSpacing = this.charSpacing;
    copy.wordSpacing = this.wordSpacing;
    copy.horizontalScaling = this.horizontalScaling;
    copy.leading = this.leading;
    copy.fontName = this.fontName;
    copy.fontSize = this.fontSize;
    copy.renderingMode = this.renderingMode;
    copy.textRise = this.textRise;
    copy.textMatrix = [...this.textMatrix];
    copy.textLineMatrix = [...this.textLineMatrix];
    return copy;
  }
}
