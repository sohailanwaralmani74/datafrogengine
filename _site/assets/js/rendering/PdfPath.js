/**
 * Represents vector path geometry for PDF graphics path construction and painting.
 */
export class PdfPath {
  /** @type {Array<{ type: string, args: Array<number> }>} */
  #segments;

  /** @type {[number, number]} */
  #currentPoint;

  constructor() {
    this.#segments = [];
    this.#currentPoint = [0, 0];
  }

  get segments() {
    return this.#segments;
  }

  get currentPoint() {
    return this.#currentPoint;
  }

  get isEmpty() {
    return this.#segments.length === 0;
  }

  /**
   * Resets and clears the current path.
   */
  reset() {
    this.#segments = [];
    this.#currentPoint = [0, 0];
  }

  /**
   * Starts a new subpath at (x, y) ('m').
   * @param {number} x
   * @param {number} y
   */
  moveTo(x, y) {
    this.#segments.push({ type: 'moveTo', args: [x, y] });
    this.#currentPoint = [x, y];
  }

  /**
   * Connects current point to (x, y) with a straight line ('l').
   * @param {number} x
   * @param {number} y
   */
  lineTo(x, y) {
    this.#segments.push({ type: 'lineTo', args: [x, y] });
    this.#currentPoint = [x, y];
  }

  /**
   * Appends a cubic Bézier curve to (x3, y3) using (x1, y1) and (x2, y2) as control points ('c').
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {number} x3
   * @param {number} y3
   */
  curveTo(x1, y1, x2, y2, x3, y3) {
    this.#segments.push({ type: 'bezierCurveTo', args: [x1, y1, x2, y2, x3, y3] });
    this.#currentPoint = [x3, y3];
  }

  /**
   * Appends a complete rectangle subpath ('re').
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  rect(x, y, w, h) {
    this.#segments.push({ type: 'rect', args: [x, y, w, h] });
    this.#currentPoint = [x, y];
  }

  /**
   * Closes the current subpath ('h').
   */
  closePath() {
    this.#segments.push({ type: 'closePath', args: [] });
  }

  /**
   * Applies this path to an HTML5 Canvas 2D rendering context.
   * 
   * @param {CanvasRenderingContext2D} ctx
   */
  applyToCanvas(ctx) {
    ctx.beginPath();
    for (const seg of this.#segments) {
      switch (seg.type) {
        case 'moveTo':
          ctx.moveTo(seg.args[0], seg.args[1]);
          break;
        case 'lineTo':
          ctx.lineTo(seg.args[0], seg.args[1]);
          break;
        case 'bezierCurveTo':
          ctx.bezierCurveTo(
            seg.args[0], seg.args[1],
            seg.args[2], seg.args[3],
            seg.args[4], seg.args[5]
          );
          break;
        case 'rect':
          ctx.rect(seg.args[0], seg.args[1], seg.args[2], seg.args[3]);
          break;
        case 'closePath':
          ctx.closePath();
          break;
      }
    }
  }

  /**
   * Converts the path segments to standard SVG path data string ('d' attribute).
   * 
   * @returns {string}
   */
  toSvgPathData() {
    const parts = [];
    for (const seg of this.#segments) {
      switch (seg.type) {
        case 'moveTo':
          parts.push(`M ${seg.args[0]} ${seg.args[1]}`);
          break;
        case 'lineTo':
          parts.push(`L ${seg.args[0]} ${seg.args[1]}`);
          break;
        case 'bezierCurveTo':
          parts.push(`C ${seg.args[0]} ${seg.args[1]} ${seg.args[2]} ${seg.args[3]} ${seg.args[4]} ${seg.args[5]}`);
          break;
        case 'rect': {
          const [x, y, w, h] = seg.args;
          parts.push(`M ${x} ${y} h ${w} v ${h} h ${-w} Z`);
          break;
        }
        case 'closePath':
          parts.push('Z');
          break;
      }
    }
    return parts.join(' ');
  }
}
