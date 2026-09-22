import { PdfViewport } from './PdfViewport.js';
import { PdfPath } from './PdfPath.js';
import { PdfGraphicsState } from '../content/PdfGraphicsState.js';
import { PdfContentParser } from '../content/PdfContentParser.js';
import { PdfFont } from '../fonts/PdfFont.js';
import { PdfImageExtractor } from '../images/PdfImageExtractor.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfPage } from '../document/PdfPage.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Renders PDF pages onto an HTML5 Canvas 2D context.
 */
export class PdfCanvasRenderer {
  /**
   * Renders a PdfPage onto a canvas element or CanvasRenderingContext2D.
   * 
   * @param {PdfPage} page
   * @param {HTMLCanvasElement|CanvasRenderingContext2D|Object} canvasOrContext
   * @param {Object} [options={}]
   * @param {number} [options.scale=1.0]
   * @param {number} [options.rotation=null]
   * @param {string} [options.background='#ffffff']
   * @returns {PdfViewport}
   */
  static render(page, canvasOrContext, options = {}) {
    if (!(page instanceof PdfPage)) {
      throw new PdfInvalidArgumentException('page', page, 'PdfPage');
    }

    const { scale = 1.0, rotation = null, background = '#ffffff' } = options;
    const viewport = PdfViewport.fromPage(page, { scale, rotation });

    let ctx;
    if (canvasOrContext && typeof canvasOrContext.getContext === 'function') {
      canvasOrContext.width = viewport.width;
      canvasOrContext.height = viewport.height;
      ctx = canvasOrContext.getContext('2d');
    } else {
      ctx = canvasOrContext;
    }

    if (!ctx) {
      throw new PdfInvalidArgumentException('canvasOrContext', canvasOrContext, 'Canvas or CanvasRenderingContext2D');
    }

    // 1. Initial background fill
    ctx.save();
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, viewport.width, viewport.height);
    }

    // 2. Set viewport transform (maps PDF bottom-left user space to top-left canvas space)
    const [a, b, c, d, e, f] = viewport.transform;
    ctx.setTransform(a, b, c, d, e, f);

    // 3. Process content stream operators
    const contentStreams = page.getContents();
    if (contentStreams && contentStreams.length > 0) {
      const operators = PdfContentParser.parse(contentStreams);
      PdfCanvasRenderer.#executeOperators(operators, page, ctx);
    }

    ctx.restore();
    return viewport;
  }

  /**
   * Executes parsed PDF operators on Canvas context.
   * @private
   */
  static #executeOperators(operators, page, ctx) {
    const resources = page.getResources();
    const doc = page.document;

    const fontCache = new Map();
    const getFont = (name) => {
      if (fontCache.has(name)) return fontCache.get(name);
      const fontDict = resources.getFont(name);
      const font = fontDict ? PdfFont.create(fontDict, doc) : null;
      fontCache.set(name, font);
      return font;
    };

    let gstate = new PdfGraphicsState();
    const gstateStack = [];
    const path = new PdfPath();

    for (const op of operators) {
      switch (op.name) {
        // Graphics state stack
        case 'q':
          ctx.save();
          gstateStack.push(gstate.clone());
          break;

        case 'Q':
          ctx.restore();
          if (gstateStack.length > 0) {
            gstate = gstateStack.pop();
          }
          break;

        case 'cm': {
          const ma = op.getNumber(0);
          const mb = op.getNumber(1);
          const mc = op.getNumber(2);
          const md = op.getNumber(3);
          const me = op.getNumber(4);
          const mf = op.getNumber(5);
          ctx.transform(ma, mb, mc, md, me, mf);
          gstate.transform(ma, mb, mc, md, me, mf);
          break;
        }

        // Line styles
        case 'w': {
          const lw = op.getNumber(0);
          ctx.lineWidth = lw;
          gstate.lineWidth = lw;
          break;
        }

        case 'J': {
          const cap = op.getNumber(0);
          ctx.lineCap = ['butt', 'round', 'square'][cap] || 'butt';
          gstate.lineCap = cap;
          break;
        }

        case 'j': {
          const join = op.getNumber(0);
          ctx.lineJoin = ['miter', 'round', 'bevel'][join] || 'miter';
          gstate.lineJoin = join;
          break;
        }

        case 'M': {
          const miter = op.getNumber(0);
          ctx.miterLimit = miter;
          gstate.miterLimit = miter;
          break;
        }

        case 'd': {
          const dashArr = op.getArg(0);
          const phase = op.getNumber(1);
          const dashes = dashArr && dashArr.isArray ? dashArr.toArray() : (Array.isArray(dashArr) ? dashArr : []);
          if (ctx.setLineDash) {
            ctx.setLineDash(dashes);
            ctx.lineDashOffset = phase;
          }
          gstate.dashPattern = [dashes, phase];
          break;
        }

        // Colors
        case 'g': {
          const gray = Math.round(op.getNumber(0) * 255);
          ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
          gstate.nonStrokeColor = [op.getNumber(0)];
          break;
        }

        case 'G': {
          const gray = Math.round(op.getNumber(0) * 255);
          ctx.strokeStyle = `rgb(${gray},${gray},${gray})`;
          gstate.strokeColor = [op.getNumber(0)];
          break;
        }

        case 'rg': {
          const r = Math.round(op.getNumber(0) * 255);
          const g = Math.round(op.getNumber(1) * 255);
          const b = Math.round(op.getNumber(2) * 255);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          gstate.nonStrokeColor = [op.getNumber(0), op.getNumber(1), op.getNumber(2)];
          break;
        }

        case 'RG': {
          const r = Math.round(op.getNumber(0) * 255);
          const g = Math.round(op.getNumber(1) * 255);
          const b = Math.round(op.getNumber(2) * 255);
          ctx.strokeStyle = `rgb(${r},${g},${b})`;
          gstate.strokeColor = [op.getNumber(0), op.getNumber(1), op.getNumber(2)];
          break;
        }

        case 'k': {
          const c = op.getNumber(0);
          const m = op.getNumber(1);
          const y = op.getNumber(2);
          const k = op.getNumber(3);
          const r = Math.round(255 * (1 - c) * (1 - k));
          const g = Math.round(255 * (1 - m) * (1 - k));
          const b = Math.round(255 * (1 - y) * (1 - k));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          gstate.nonStrokeColor = [c, m, y, k];
          break;
        }

        case 'K': {
          const c = op.getNumber(0);
          const m = op.getNumber(1);
          const y = op.getNumber(2);
          const k = op.getNumber(3);
          const r = Math.round(255 * (1 - c) * (1 - k));
          const g = Math.round(255 * (1 - m) * (1 - k));
          const b = Math.round(255 * (1 - y) * (1 - k));
          ctx.strokeStyle = `rgb(${r},${g},${b})`;
          gstate.strokeColor = [c, m, y, k];
          break;
        }

        // Path construction
        case 'm':
          path.moveTo(op.getNumber(0), op.getNumber(1));
          break;

        case 'l':
          path.lineTo(op.getNumber(0), op.getNumber(1));
          break;

        case 'c':
          path.curveTo(
            op.getNumber(0), op.getNumber(1),
            op.getNumber(2), op.getNumber(3),
            op.getNumber(4), op.getNumber(5)
          );
          break;

        case 'v':
          path.curveTo(
            path.currentPoint[0], path.currentPoint[1],
            op.getNumber(0), op.getNumber(1),
            op.getNumber(2), op.getNumber(3)
          );
          break;

        case 'y':
          path.curveTo(
            op.getNumber(0), op.getNumber(1),
            op.getNumber(2), op.getNumber(3),
            op.getNumber(2), op.getNumber(3)
          );
          break;

        case 're':
          path.rect(op.getNumber(0), op.getNumber(1), op.getNumber(2), op.getNumber(3));
          break;

        case 'h':
          path.closePath();
          break;

        // Path painting
        case 'S':
          path.applyToCanvas(ctx);
          ctx.stroke();
          path.reset();
          break;

        case 's':
          path.closePath();
          path.applyToCanvas(ctx);
          ctx.stroke();
          path.reset();
          break;

        case 'f':
        case 'F':
          path.applyToCanvas(ctx);
          ctx.fill('nonzero');
          path.reset();
          break;

        case 'f*':
          path.applyToCanvas(ctx);
          ctx.fill('evenodd');
          path.reset();
          break;

        case 'B':
          path.applyToCanvas(ctx);
          ctx.fill('nonzero');
          ctx.stroke();
          path.reset();
          break;

        case 'b':
          path.closePath();
          path.applyToCanvas(ctx);
          ctx.fill('nonzero');
          ctx.stroke();
          path.reset();
          break;

        case 'B*':
          path.applyToCanvas(ctx);
          ctx.fill('evenodd');
          ctx.stroke();
          path.reset();
          break;

        case 'b*':
          path.closePath();
          path.applyToCanvas(ctx);
          ctx.fill('evenodd');
          ctx.stroke();
          path.reset();
          break;

        case 'n':
          path.reset();
          break;

        // Clipping
        case 'W':
          path.applyToCanvas(ctx);
          ctx.clip('nonzero');
          break;

        case 'W*':
          path.applyToCanvas(ctx);
          ctx.clip('evenodd');
          break;

        // Text operators
        case 'BT':
          gstate.textState.resetForBT();
          break;

        case 'ET':
          break;

        case 'Tf':
          gstate.textState.setFont(op.getName(0), op.getNumber(1));
          break;

        case 'Tm':
          gstate.textState.setTextMatrix(
            op.getNumber(0), op.getNumber(1),
            op.getNumber(2), op.getNumber(3),
            op.getNumber(4), op.getNumber(5)
          );
          break;

        case 'Td':
          gstate.textState.moveText(op.getNumber(0), op.getNumber(1));
          break;

        case 'TD':
          gstate.textState.leading = -op.getNumber(1);
          gstate.textState.moveText(op.getNumber(0), op.getNumber(1));
          break;

        case 'T*':
          gstate.textState.nextLine();
          break;

        case 'Tc':
          gstate.textState.charSpacing = op.getNumber(0);
          break;

        case 'Tw':
          gstate.textState.wordSpacing = op.getNumber(0);
          break;

        case 'Tz':
          gstate.textState.horizontalScaling = op.getNumber(0);
          break;

        case 'TL':
          gstate.textState.leading = op.getNumber(0);
          break;

        case 'Tj': {
          const str = op.getArg(0);
          PdfCanvasRenderer.#renderTextString(str, gstate, getFont, ctx);
          break;
        }

        case '\'': {
          gstate.textState.nextLine();
          const str = op.getArg(0);
          PdfCanvasRenderer.#renderTextString(str, gstate, getFont, ctx);
          break;
        }

        case '"': {
          gstate.textState.wordSpacing = op.getNumber(0);
          gstate.textState.charSpacing = op.getNumber(1);
          gstate.textState.nextLine();
          const str = op.getArg(2);
          PdfCanvasRenderer.#renderTextString(str, gstate, getFont, ctx);
          break;
        }

        case 'TJ': {
          const array = op.getArg(0);
          if (array && (array instanceof PdfArray || Array.isArray(array))) {
            const items = array instanceof PdfArray ? array.getItems() : array;
            for (const item of items) {
              if (typeof item === 'number') {
                PdfCanvasRenderer.#applyKerning(item, gstate);
              } else if (item && item.isNumber && item.isNumber()) {
                PdfCanvasRenderer.#applyKerning(item.value, gstate);
              } else {
                const str = (item && item.isString && item.isString()) ? item.value : item;
                PdfCanvasRenderer.#renderTextString(str, gstate, getFont, ctx);
              }
            }
          }
          break;
        }

        default:
          break;
      }
    }
  }

  /**
   * Renders a text string with font styling and text matrix transformations.
   * @private
   */
  static #renderTextString(str, gstate, getFont, ctx) {
    if (str === undefined || str === null || str.length === 0) return;

    const ts = gstate.textState;
    const font = getFont(ts.fontName);
    const decodedText = font ? font.decodeString(str) : (typeof str === 'string' ? str : '');
    if (decodedText.length === 0) return;

    const fontSize = ts.fontSize || 12;
    const hScale = (ts.horizontalScaling || 100) / 100;

    // Font family mapping
    let fontFamily = 'sans-serif';
    let isBold = false;
    let isItalic = false;

    if (font && font.baseFont) {
      const name = font.baseFont.toLowerCase();
      if (name.includes('times') || name.includes('serif')) fontFamily = 'serif';
      else if (name.includes('courier') || name.includes('mono')) fontFamily = 'monospace';
      if (name.includes('bold')) isBold = true;
      if (name.includes('italic') || name.includes('oblique')) isItalic = true;
    }

    const fontStyle = `${isItalic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
    ctx.font = fontStyle;

    // Calculate effective matrix TRM = Tm
    // Note: in PDF text space, Y is positive upwards. Canvas text origin is baseline.
    const [a, b, c, d, e, f] = ts.textMatrix;

    ctx.save();
    // Transform to text position and invert Y for normal text rendering orientation
    ctx.transform(a * hScale, b * hScale, -c, -d, e, f);

    // Draw text
    if (ts.renderingMode === 1) {
      ctx.strokeText(decodedText, 0, 0);
    } else if (ts.renderingMode === 2) {
      ctx.fillText(decodedText, 0, 0);
      ctx.strokeText(decodedText, 0, 0);
    } else {
      ctx.fillText(decodedText, 0, 0);
    }
    ctx.restore();

    // Advance text cursor
    let stringWidth = 0;
    const rawBytes = typeof str === 'string'
      ? Array.from(str).map(ch => ch.charCodeAt(0))
      : (str instanceof Uint8Array ? Array.from(str) : []);

    for (const charCode of rawBytes) {
      const glyphWidth = font ? font.getWidth(charCode) : 600;
      const charW = (glyphWidth / 1000) * fontSize * hScale + ts.charSpacing + (charCode === 32 ? ts.wordSpacing : 0);
      stringWidth += charW;
    }

    ts.textMatrix = [a, b, c, d, e + stringWidth * a, f + stringWidth * b];
  }

  /**
   * Applies kerning offset to text matrix.
   * @private
   */
  static #applyKerning(kerningNum, gstate) {
    const ts = gstate.textState;
    const fontSize = ts.fontSize;
    const hScale = (ts.horizontalScaling || 100) / 100;
    const dx = -(kerningNum / 1000) * fontSize * hScale;

    const [a, b, c, d, e, f] = ts.textMatrix;
    ts.textMatrix = [a, b, c, d, e + dx * a, f + dx * b];
  }
}
