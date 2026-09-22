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
 * Pure JavaScript PDF page vector renderer to scalable SVG XML string.
 * Works seamlessly in Node.js, Web Workers, and browsers with zero DOM dependencies.
 */
export class PdfSvgRenderer {
  /**
   * Renders a PdfPage into a standalone SVG XML string.
   * 
   * @param {PdfPage} page
   * @param {Object} [options={}]
   * @param {number} [options.scale=1.0]
   * @param {number} [options.rotation=null]
   * @param {string} [options.background='#ffffff']
   * @returns {string} - Complete SVG XML document
   */
  static render(page, options = {}) {
    if (!(page instanceof PdfPage)) {
      throw new PdfInvalidArgumentException('page', page, 'PdfPage');
    }

    const { scale = 1.0, rotation = null, background = '#ffffff' } = options;
    const viewport = PdfViewport.fromPage(page, { scale, rotation });

    const width = viewport.width;
    const height = viewport.height;
    const [va, vb, vc, vd, ve, vf] = viewport.transform;

    const svgElements = [];
    const defsElements = [];
    let clipCount = 0;

    // Process content stream
    const contentStreams = page.getContents();
    if (contentStreams && contentStreams.length > 0) {
      const operators = PdfContentParser.parse(contentStreams);
      PdfSvgRenderer.#executeOperators(operators, page, svgElements, defsElements, () => ++clipCount);
    }

    // Assemble final SVG
    const defsSection = defsElements.length > 0 ? `  <defs>\n${defsElements.join('\n')}\n  </defs>\n` : '';
    const bgRect = background ? `  <rect width="100%" height="100%" fill="${background}"/>\n` : '';
    const contentSection = svgElements.join('\n');

    return `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${bgRect}${defsSection}  <g transform="matrix(${va} ${vb} ${vc} ${vd} ${ve} ${vf})">
${contentSection}
  </g>
</svg>`;
  }

  /**
   * @private
   */
  static #executeOperators(operators, page, svgElements, defsElements, nextClipId) {
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
    let currentClipId = null;

    for (const op of operators) {
      switch (op.name) {
        // Graphics state stack
        case 'q':
          gstateStack.push(gstate.clone());
          break;

        case 'Q':
          if (gstateStack.length > 0) {
            gstate = gstateStack.pop();
          }
          break;

        case 'cm':
          gstate.transform(
            op.getNumber(0), op.getNumber(1),
            op.getNumber(2), op.getNumber(3),
            op.getNumber(4), op.getNumber(5)
          );
          break;

        // Line styles
        case 'w':
          gstate.lineWidth = op.getNumber(0);
          break;

        case 'J':
          gstate.lineCap = op.getNumber(0);
          break;

        case 'j':
          gstate.lineJoin = op.getNumber(0);
          break;

        case 'M':
          gstate.miterLimit = op.getNumber(0);
          break;

        case 'd': {
          const dashArr = op.getArg(0);
          const phase = op.getNumber(1);
          const dashes = dashArr && dashArr.isArray ? dashArr.toArray() : (Array.isArray(dashArr) ? dashArr : []);
          gstate.dashPattern = [dashes, phase];
          break;
        }

        // Colors
        case 'g':
          gstate.nonStrokeColor = [op.getNumber(0)];
          break;

        case 'G':
          gstate.strokeColor = [op.getNumber(0)];
          break;

        case 'rg':
          gstate.nonStrokeColor = [op.getNumber(0), op.getNumber(1), op.getNumber(2)];
          break;

        case 'RG':
          gstate.strokeColor = [op.getNumber(0), op.getNumber(1), op.getNumber(2)];
          break;

        case 'k':
          gstate.nonStrokeColor = [op.getNumber(0), op.getNumber(1), op.getNumber(2), op.getNumber(3)];
          break;

        case 'K':
          gstate.strokeColor = [op.getNumber(0), op.getNumber(1), op.getNumber(2), op.getNumber(3)];
          break;

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
          PdfSvgRenderer.#emitPath(path, gstate, false, true, false, currentClipId, svgElements);
          path.reset();
          break;

        case 's':
          path.closePath();
          PdfSvgRenderer.#emitPath(path, gstate, false, true, false, currentClipId, svgElements);
          path.reset();
          break;

        case 'f':
        case 'F':
          PdfSvgRenderer.#emitPath(path, gstate, true, false, false, currentClipId, svgElements);
          path.reset();
          break;

        case 'f*':
          PdfSvgRenderer.#emitPath(path, gstate, true, false, true, currentClipId, svgElements);
          path.reset();
          break;

        case 'B':
          PdfSvgRenderer.#emitPath(path, gstate, true, true, false, currentClipId, svgElements);
          path.reset();
          break;

        case 'b':
          path.closePath();
          PdfSvgRenderer.#emitPath(path, gstate, true, true, false, currentClipId, svgElements);
          path.reset();
          break;

        case 'B*':
          PdfSvgRenderer.#emitPath(path, gstate, true, true, true, currentClipId, svgElements);
          path.reset();
          break;

        case 'b*':
          path.closePath();
          PdfSvgRenderer.#emitPath(path, gstate, true, true, true, currentClipId, svgElements);
          path.reset();
          break;

        case 'n':
          path.reset();
          break;

        // Clipping
        case 'W':
        case 'W*': {
          const cid = `clip_${nextClipId()}`;
          const rule = op.name === 'W*' ? 'clip-rule="evenodd"' : '';
          defsElements.push(`    <clipPath id="${cid}">\n      <path d="${path.toSvgPathData()}" ${rule}/>\n    </clipPath>`);
          currentClipId = cid;
          break;
        }

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
          PdfSvgRenderer.#emitTextString(str, gstate, getFont, currentClipId, svgElements);
          break;
        }

        case '\'': {
          gstate.textState.nextLine();
          const str = op.getArg(0);
          PdfSvgRenderer.#emitTextString(str, gstate, getFont, currentClipId, svgElements);
          break;
        }

        case '"': {
          gstate.textState.wordSpacing = op.getNumber(0);
          gstate.textState.charSpacing = op.getNumber(1);
          gstate.textState.nextLine();
          const str = op.getArg(2);
          PdfSvgRenderer.#emitTextString(str, gstate, getFont, currentClipId, svgElements);
          break;
        }

        case 'TJ': {
          const array = op.getArg(0);
          if (array && (array instanceof PdfArray || Array.isArray(array))) {
            const items = array instanceof PdfArray ? array.getItems() : array;
            for (const item of items) {
              if (typeof item === 'number') {
                PdfSvgRenderer.#applyKerning(item, gstate);
              } else if (item && item.isNumber && item.isNumber()) {
                PdfSvgRenderer.#applyKerning(item.value, gstate);
              } else {
                const str = (item && item.isString && item.isString()) ? item.value : item;
                PdfSvgRenderer.#emitTextString(str, gstate, getFont, currentClipId, svgElements);
              }
            }
          }
          break;
        }

        // Images
        case 'Do': {
          const name = op.getName(0);
          const xobj = resources.getXObject(name);
          if (xobj && xobj.isStream && xobj.isStream() && xobj.dictionary.getName('Subtype') === 'Image') {
            PdfSvgRenderer.#emitImage(xobj, name, doc, gstate, currentClipId, svgElements);
          }
          break;
        }

        default:
          break;
      }
    }
  }

  /**
   * Emits a <path> SVG element.
   * @private
   */
  static #emitPath(path, gstate, fill, stroke, evenodd, clipId, output) {
    if (path.isEmpty) return;
    const d = path.toSvgPathData();
    const [ca, cb, cc, cd, ce, cf] = gstate.ctm;

    let fillAttr = 'none';
    if (fill) {
      fillAttr = PdfSvgRenderer.#colorToHex(gstate.nonStrokeColor);
    }

    let strokeAttr = 'none';
    let strokeExtra = '';
    if (stroke) {
      strokeAttr = PdfSvgRenderer.#colorToHex(gstate.strokeColor);
      strokeExtra += ` stroke-width="${gstate.lineWidth}"`;
      if (gstate.lineCap) strokeExtra += ` stroke-linecap="${['butt', 'round', 'square'][gstate.lineCap] || 'butt'}"`;
      if (gstate.lineJoin) strokeExtra += ` stroke-linejoin="${['miter', 'round', 'bevel'][gstate.lineJoin] || 'miter'}"`;
      if (gstate.dashPattern[0].length > 0) {
        strokeExtra += ` stroke-dasharray="${gstate.dashPattern[0].join(',')}" stroke-dashoffset="${gstate.dashPattern[1]}"`;
      }
    }

    const clipAttr = clipId ? ` clip-path="url(#${clipId})"` : '';
    const ruleAttr = evenodd ? ' fill-rule="evenodd"' : '';
    const transformAttr = (ca !== 1 || cb !== 0 || cc !== 0 || cd !== 1 || ce !== 0 || cf !== 0)
      ? ` transform="matrix(${ca} ${cb} ${cc} ${cd} ${ce} ${cf})"`
      : '';

    output.push(`    <path d="${d}" fill="${fillAttr}" stroke="${strokeAttr}"${strokeExtra}${ruleAttr}${clipAttr}${transformAttr}/>`);
  }

  /**
   * Emits a <text> SVG element.
   * @private
   */
  static #emitTextString(str, gstate, getFont, clipId, output) {
    if (!str || str.length === 0) return;

    const ts = gstate.textState;
    const font = getFont(ts.fontName);
    const decodedText = font ? font.decodeString(str) : (typeof str === 'string' ? str : '');
    if (decodedText.length === 0) return;

    const fontSize = ts.fontSize || 12;
    const hScale = (ts.horizontalScaling || 100) / 100;

    // Multiply CTM with Tm: effective matrix
    const trm = PdfGraphicsState.multiplyMatrices(ts.textMatrix, gstate.ctm);
    // Invert Y in text matrix for SVG top-down orientation
    const [a, b, c, d, e, f] = trm;

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

    const fillColor = PdfSvgRenderer.#colorToHex(gstate.nonStrokeColor);
    const strokeColor = PdfSvgRenderer.#colorToHex(gstate.strokeColor);

    let fillAttr = fillColor;
    let strokeAttr = 'none';
    if (ts.renderingMode === 1) {
      fillAttr = 'none';
      strokeAttr = strokeColor;
    } else if (ts.renderingMode === 2) {
      strokeAttr = strokeColor;
    }

    const fontStyleAttr = `${isItalic ? ' font-style="italic"' : ''}${isBold ? ' font-weight="bold"' : ''}`;
    const clipAttr = clipId ? ` clip-path="url(#${clipId})"` : '';
    const safeText = PdfSvgRenderer.#escapeXml(decodedText);

    // Matrix flips Y for SVG text: scale -1 on Y
    output.push(`    <text transform="matrix(${a * hScale} ${b * hScale} ${-c} ${-d} ${e} ${f})" font-size="${fontSize}" font-family="${fontFamily}" fill="${fillAttr}" stroke="${strokeAttr}"${fontStyleAttr}${clipAttr}>${safeText}</text>`);

    // Advance cursor
    let stringWidth = 0;
    const rawBytes = typeof str === 'string'
      ? Array.from(str).map(ch => ch.charCodeAt(0))
      : (str instanceof Uint8Array ? Array.from(str) : []);

    for (const charCode of rawBytes) {
      const glyphWidth = font ? font.getWidth(charCode) : 600;
      const charW = (glyphWidth / 1000) * fontSize * hScale + ts.charSpacing + (charCode === 32 ? ts.wordSpacing : 0);
      stringWidth += charW;
    }

    const [tma, tmb, tmc, tmd, tme, tmf] = ts.textMatrix;
    ts.textMatrix = [tma, tmb, tmc, tmd, tme + stringWidth * tma, tmf + stringWidth * tmb];
  }

  /**
   * Emits an <image> SVG element.
   * @private
   */
  static #emitImage(xobj, name, doc, gstate, clipId, output) {
    try {
      const img = PdfImageExtractor.extractImages({
        getContents: () => [xobj],
        getResources: () => resources,
        document: doc
      })[0];

      // Alternatively extract image via resource:
      const dict = xobj.dictionary;
      const width = dict.getNumber('Width');
      const height = dict.getNumber('Height');
      if (!width || !height) return;

      // In PDF, image occupies unit square [0, 0, 1, 1]. In SVG:
      // SVG top-down flip: matrix transforms unit square
      const [ca, cb, cc, cd, ce, cf] = gstate.ctm;
      // Invert Y for image origin
      output.push(`    <g transform="matrix(${ca} ${cb} ${cc} ${cd} ${ce} ${cf})">
      <image href="" width="1" height="1" transform="matrix(1 0 0 -1 0 1)" preserveAspectRatio="none"/>
    </g>`);
    } catch {
      // Ignored for non-image objects
    }
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

  /**
   * Converts color array to hex string.
   * @private
   */
  static #colorToHex(colorArr) {
    if (!colorArr || colorArr.length === 0) return '#000000';
    if (colorArr.length === 1) {
      const v = Math.round(colorArr[0] * 255);
      return `#${v.toString(16).padStart(2, '0').repeat(3)}`;
    }
    if (colorArr.length === 3) {
      const r = Math.round(colorArr[0] * 255).toString(16).padStart(2, '0');
      const g = Math.round(colorArr[1] * 255).toString(16).padStart(2, '0');
      const b = Math.round(colorArr[2] * 255).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    if (colorArr.length === 4) {
      const [c, m, y, k] = colorArr;
      const r = Math.round(255 * (1 - c) * (1 - k)).toString(16).padStart(2, '0');
      const g = Math.round(255 * (1 - m) * (1 - k)).toString(16).padStart(2, '0');
      const b = Math.round(255 * (1 - y) * (1 - k)).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return '#000000';
  }

  /**
   * Escapes XML characters for SVG text.
   * @private
   */
  static #escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
