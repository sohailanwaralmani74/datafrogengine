import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Standard paper sizes in PDF points (72 points = 1 inch).
 */
export const PdfPageSizes = Object.freeze({
  // North American standards
  LETTER: Object.freeze([612, 792]),
  LEGAL: Object.freeze([612, 1008]),
  TABLOID: Object.freeze([792, 1224]),
  EXECUTIVE: Object.freeze([522, 756]),

  // ISO A series
  A0: Object.freeze([2383.94, 3370.39]),
  A1: Object.freeze([1683.78, 2383.94]),
  A2: Object.freeze([1190.55, 1683.78]),
  A3: Object.freeze([841.89, 1190.55]),
  A4: Object.freeze([595.28, 841.89]),
  A5: Object.freeze([419.53, 595.28]),
  A6: Object.freeze([297.64, 419.53]),

  // ISO B series
  B4: Object.freeze([708.66, 1000.63]),
  B5: Object.freeze([498.90, 708.66]),

  /**
   * Resolves page dimensions based on a predefined size or explicit [width, height]
   * and an optional orientation ('portrait' | 'landscape').
   * 
   * @param {string|Array<number>} size - Name (e.g. 'A4', 'LETTER') or [width, height]
   * @param {'portrait'|'landscape'} [orientation='portrait']
   * @returns {[number, number]} [width, height] in points
   */
  resolveDimensions(size = 'A4', orientation = 'portrait') {
    let width;
    let height;

    if (Array.isArray(size) && size.length === 2 && typeof size[0] === 'number' && typeof size[1] === 'number') {
      [width, height] = size;
    } else if (typeof size === 'string') {
      const key = size.toUpperCase();
      const standard = PdfPageSizes[key];
      if (!standard) {
        throw new PdfInvalidArgumentException('size', size, `One of ${Object.keys(PdfPageSizes).filter(k => typeof PdfPageSizes[k] !== 'function').join(', ')}`);
      }
      [width, height] = standard;
    } else {
      throw new PdfInvalidArgumentException('size', size, 'Standard size name or [width, height]');
    }

    const normOrientation = typeof orientation === 'string' ? orientation.toLowerCase() : 'portrait';
    if (normOrientation === 'landscape') {
      // Landscape: width is the larger dimension
      return [Math.max(width, height), Math.min(width, height)];
    } else {
      // Portrait: height is the larger dimension
      return [Math.min(width, height), Math.max(width, height)];
    }
  }
});
