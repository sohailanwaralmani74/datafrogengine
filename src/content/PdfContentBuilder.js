import { PdfObjectWriter } from '../writer/PdfObjectWriter.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfNumber } from '../objects/PdfNumber.js';

/**
 * Fluent builder for generating valid PDF content streams (operators, graphics, text, paths, colors).
 */
export class PdfContentBuilder {
  /** @type {Array<string>} */
  #operations;

  constructor() {
    this.#operations = [];
  }

  get length() {
    return this.#operations.length;
  }

  /**
   * Clears all recorded operations.
   * @returns {PdfContentBuilder}
   */
  clear() {
    this.#operations = [];
    return this;
  }

  /**
   * Appends raw operator string.
   * @param {string} opStr
   * @returns {PdfContentBuilder}
   */
  raw(opStr) {
    this.#operations.push(opStr);
    return this;
  }

  /**
   * Saves graphics state (`q`).
   * @returns {PdfContentBuilder}
   */
  saveGraphicsState() {
    this.#operations.push('q');
    return this;
  }

  /**
   * Restores graphics state (`Q`).
   * @returns {PdfContentBuilder}
   */
  restoreGraphicsState() {
    this.#operations.push('Q');
    return this;
  }

  /**
   * Concatenates transformation matrix (`cm`).
   * @param {number} a
   * @param {number} b
   * @param {number} c
   * @param {number} d
   * @param {number} e
   * @param {number} f
   * @returns {PdfContentBuilder}
   */
  transform(a, b, c, d, e, f) {
    this.#operations.push(`${PdfContentBuilder.#num(a)} ${PdfContentBuilder.#num(b)} ${PdfContentBuilder.#num(c)} ${PdfContentBuilder.#num(d)} ${PdfContentBuilder.#num(e)} ${PdfContentBuilder.#num(f)} cm`);
    return this;
  }

  /**
   * Translates coordinate system.
   * @param {number} x
   * @param {number} y
   * @returns {PdfContentBuilder}
   */
  translate(x, y) {
    return this.transform(1, 0, 0, 1, x, y);
  }

  /**
   * Scales coordinate system.
   * @param {number} sx
   * @param {number} sy
   * @returns {PdfContentBuilder}
   */
  scale(sx, sy) {
    return this.transform(sx, 0, 0, sy, 0, 0);
  }

  /**
   * Rotates coordinate system by angle in degrees.
   * @param {number} degrees
   * @returns {PdfContentBuilder}
   */
  rotate(degrees) {
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return this.transform(cos, sin, -sin, cos, 0, 0);
  }

  /**
   * Sets line width in points (`w`).
   * @param {number} width
   * @returns {PdfContentBuilder}
   */
  setLineWidth(width) {
    this.#operations.push(`${PdfContentBuilder.#num(width)} w`);
    return this;
  }

  /**
   * Sets line cap style (`J`): 0 = butt, 1 = round, 2 = projecting square.
   * @param {number} cap
   * @returns {PdfContentBuilder}
   */
  setLineCap(cap) {
    this.#operations.push(`${cap} J`);
    return this;
  }

  /**
   * Sets line join style (`j`): 0 = miter, 1 = round, 2 = bevel.
   * @param {number} join
   * @returns {PdfContentBuilder}
   */
  setLineJoin(join) {
    this.#operations.push(`${join} j`);
    return this;
  }

  /**
   * Sets line dash pattern (`d`).
   * @param {Array<number>} dashArray
   * @param {number} [phase=0]
   * @returns {PdfContentBuilder}
   */
  setDashPattern(dashArray = [], phase = 0) {
    const dashes = dashArray.map(d => PdfContentBuilder.#num(d)).join(' ');
    this.#operations.push(`[ ${dashes} ] ${PdfContentBuilder.#num(phase)} d`);
    return this;
  }

  /**
   * Sets non-stroking (fill) color in RGB (`rg`).
   * @param {number} r - 0..255 or 0..1
   * @param {number} g
   * @param {number} b
   * @returns {PdfContentBuilder}
   */
  setFillColorRgb(r, g, b) {
    const cr = r > 1 ? r / 255 : r;
    const cg = g > 1 ? g / 255 : g;
    const cb = b > 1 ? b / 255 : b;
    this.#operations.push(`${PdfContentBuilder.#num(cr)} ${PdfContentBuilder.#num(cg)} ${PdfContentBuilder.#num(cb)} rg`);
    return this;
  }

  /**
   * Sets stroking color in RGB (`RG`).
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {PdfContentBuilder}
   */
  setStrokeColorRgb(r, g, b) {
    const cr = r > 1 ? r / 255 : r;
    const cg = g > 1 ? g / 255 : g;
    const cb = b > 1 ? b / 255 : b;
    this.#operations.push(`${PdfContentBuilder.#num(cr)} ${PdfContentBuilder.#num(cg)} ${PdfContentBuilder.#num(cb)} RG`);
    return this;
  }

  /**
   * Sets non-stroking (fill) color in Grayscale (`g`).
   * @param {number} gray - 0..1 or 0..255
   * @returns {PdfContentBuilder}
   */
  setFillColorGray(gray) {
    const g = gray > 1 ? gray / 255 : gray;
    this.#operations.push(`${PdfContentBuilder.#num(g)} g`);
    return this;
  }

  /**
   * Sets stroking color in Grayscale (`G`).
   * @param {number} gray
   * @returns {PdfContentBuilder}
   */
  setStrokeColorGray(gray) {
    const g = gray > 1 ? gray / 255 : gray;
    this.#operations.push(`${PdfContentBuilder.#num(g)} G`);
    return this;
  }

  /**
   * Starts a new subpath at (x, y) (`m`).
   * @param {number} x
   * @param {number} y
   * @returns {PdfContentBuilder}
   */
  moveTo(x, y) {
    this.#operations.push(`${PdfContentBuilder.#num(x)} ${PdfContentBuilder.#num(y)} m`);
    return this;
  }

  /**
   * Appends line to (x, y) (`l`).
   * @param {number} x
   * @param {number} y
   * @returns {PdfContentBuilder}
   */
  lineTo(x, y) {
    this.#operations.push(`${PdfContentBuilder.#num(x)} ${PdfContentBuilder.#num(y)} l`);
    return this;
  }

  /**
   * Appends cubic Bézier curve (`c`).
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {number} x3
   * @param {number} y3
   * @returns {PdfContentBuilder}
   */
  curveTo(x1, y1, x2, y2, x3, y3) {
    this.#operations.push(`${PdfContentBuilder.#num(x1)} ${PdfContentBuilder.#num(y1)} ${PdfContentBuilder.#num(x2)} ${PdfContentBuilder.#num(y2)} ${PdfContentBuilder.#num(x3)} ${PdfContentBuilder.#num(y3)} c`);
    return this;
  }

  /**
   * Appends rectangle (`re`).
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @returns {PdfContentBuilder}
   */
  rectangle(x, y, w, h) {
    this.#operations.push(`${PdfContentBuilder.#num(x)} ${PdfContentBuilder.#num(y)} ${PdfContentBuilder.#num(w)} ${PdfContentBuilder.#num(h)} re`);
    return this;
  }

  /**
   * Appends circle using 4 cubic Bézier curves.
   * @param {number} cx - Center X
   * @param {number} cy - Center Y
   * @param {number} r - Radius
   * @returns {PdfContentBuilder}
   */
  circle(cx, cy, r) {
    return this.ellipse(cx, cy, r, r);
  }

  /**
   * Appends ellipse using 4 cubic Bézier curves.
   * @param {number} cx - Center X
   * @param {number} cy - Center Y
   * @param {number} rx - Radius X
   * @param {number} ry - Radius Y
   * @returns {PdfContentBuilder}
   */
  ellipse(cx, cy, rx, ry) {
    const k = 0.552284749831; // 4/3 * (sqrt(2) - 1)
    const ox = rx * k;
    const oy = ry * k;

    this.moveTo(cx - rx, cy);
    this.curveTo(cx - rx, cy + oy, cx - ox, cy + ry, cx, cy + ry);
    this.curveTo(cx + ox, cy + ry, cx + rx, cy + oy, cx + rx, cy);
    this.curveTo(cx + rx, cy - oy, cx + ox, cy - ry, cx, cy - ry);
    this.curveTo(cx - ox, cy - ry, cx - rx, cy - oy, cx - rx, cy);
    this.closePath();
    return this;
  }

  /**
   * Closes subpath (`h`).
   * @returns {PdfContentBuilder}
   */
  closePath() {
    this.#operations.push('h');
    return this;
  }

  /**
   * Strokes current path (`S`).
   * @returns {PdfContentBuilder}
   */
  stroke() {
    this.#operations.push('S');
    return this;
  }

  /**
   * Closes and strokes current path (`s`).
   * @returns {PdfContentBuilder}
   */
  closeAndStroke() {
    this.#operations.push('s');
    return this;
  }

  /**
   * Fills current path (`f` or `f*`).
   * @param {boolean} [evenOdd=false]
   * @returns {PdfContentBuilder}
   */
  fill(evenOdd = false) {
    this.#operations.push(evenOdd ? 'f*' : 'f');
    return this;
  }

  /**
   * Fills and strokes current path (`B` or `B*`).
   * @param {boolean} [evenOdd=false]
   * @returns {PdfContentBuilder}
   */
  fillAndStroke(evenOdd = false) {
    this.#operations.push(evenOdd ? 'B*' : 'B');
    return this;
  }

  /**
   * Closes, fills, and strokes current path (`b` or `b*`).
   * @param {boolean} [evenOdd=false]
   * @returns {PdfContentBuilder}
   */
  closeFillAndStroke(evenOdd = false) {
    this.#operations.push(evenOdd ? 'b*' : 'b');
    return this;
  }

  /**
   * Sets current clipping path (`W` or `W*`).
   * @param {boolean} [evenOdd=false]
   * @returns {PdfContentBuilder}
   */
  clip(evenOdd = false) {
    this.#operations.push(evenOdd ? 'W*' : 'W');
    return this;
  }

  /**
   * Ends the path without filling or stroking (`n`).
   * @returns {PdfContentBuilder}
   */
  endPath() {
    this.#operations.push('n');
    return this;
  }


  /**
   * Begins text object (`BT`).
   * @returns {PdfContentBuilder}
   */
  beginText() {
    this.#operations.push('BT');
    return this;
  }

  /**
   * Ends text object (`ET`).
   * @returns {PdfContentBuilder}
   */
  endText() {
    this.#operations.push('ET');
    return this;
  }

  /**
   * Sets font and size (`Tf`).
   * @param {string} fontName - Resource name (e.g. 'F1' or '/F1')
   * @param {number} size
   * @returns {PdfContentBuilder}
   */
  setFont(fontName, size) {
    const name = fontName.startsWith('/') ? fontName : `/${fontName}`;
    this.#operations.push(`${name} ${PdfContentBuilder.#num(size)} Tf`);
    return this;
  }

  /**
   * Sets text matrix (`Tm`).
   * @param {number} a
   * @param {number} b
   * @param {number} c
   * @param {number} d
   * @param {number} e
   * @param {number} f
   * @returns {PdfContentBuilder}
   */
  setTextMatrix(a, b, c, d, e, f) {
    this.#operations.push(`${PdfContentBuilder.#num(a)} ${PdfContentBuilder.#num(b)} ${PdfContentBuilder.#num(c)} ${PdfContentBuilder.#num(d)} ${PdfContentBuilder.#num(e)} ${PdfContentBuilder.#num(f)} Tm`);
    return this;
  }

  /**
   * Moves text cursor position (`Td`).
   * @param {number} tx
   * @param {number} ty
   * @returns {PdfContentBuilder}
   */
  moveText(tx, ty) {
    this.#operations.push(`${PdfContentBuilder.#num(tx)} ${PdfContentBuilder.#num(ty)} Td`);
    return this;
  }

  /**
   * Shows a text string (`Tj`).
   * @param {string} text
   * @returns {PdfContentBuilder}
   */
  showText(text) {
    this.#operations.push(`${PdfObjectWriter.escapeString(text)} Tj`);
    return this;
  }

  /**
   * Draws an XObject (image or form) (`Do`).
   * @param {string} name - Resource name (e.g. 'Im1')
   * @returns {PdfContentBuilder}
   */
  drawXObject(name) {
    const xname = name.startsWith('/') ? name : `/${name}`;
    this.#operations.push(`${xname} Do`);
    return this;
  }

  /**
   * Serializes all operations into a single content stream string.
   * @returns {string}
   */
  toString() {
    return this.#operations.join('\n');
  }

  /**
   * Returns complete operations as a Uint8Array byte buffer.
   * @returns {Uint8Array}
   */
  toBytes() {
    return new TextEncoder().encode(this.toString());
  }

  /**
   * Creates a PdfStream containing the generated operators.
   * @returns {PdfStream}
   */
  toStream() {
    const bytes = this.toBytes();
    const dict = new PdfDictionary();
    dict.set('Length', PdfNumber.of(bytes.length));
    return new PdfStream(dict, bytes);
  }

  /**
   * Formats numbers concisely.
   * @private
   */
  static #num(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100000) / 100000);
  }
}
