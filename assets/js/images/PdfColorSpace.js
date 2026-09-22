import { PdfName } from '../objects/PdfName.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfHexString } from '../objects/PdfHexString.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfStreamDecoder } from '../streams/PdfStreamDecoder.js';

/**
 * Handles PDF color spaces and pixel conversions to standard 32-bit RGBA.
 */
export class PdfColorSpace {
  /**
   * Normalizes a color space specification from a dictionary/array/name into standard info.
   * 
   * @param {string|PdfName|PdfArray} colorSpaceObj
   * @param {Object} [document=null]
   * @returns {{ family: string, components: number, details: Object }}
   */
  static parseColorSpace(colorSpaceObj, document = null) {
    if (!colorSpaceObj) {
      return { family: 'DeviceRGB', components: 3, details: {} };
    }

    const resolved = document && typeof document.resolve === 'function'
      ? document.resolve(colorSpaceObj)
      : colorSpaceObj;

    // Single name (e.g. /DeviceRGB or 'DeviceRGB')
    if (resolved instanceof PdfName || typeof resolved === 'string') {
      const name = resolved instanceof PdfName ? resolved.value : resolved.replace(/^\//, '');
      return PdfColorSpace.#resolveNamedColorSpace(name);
    }

    // Array (e.g. [/Indexed /DeviceRGB 255 <lookup>] or [/ICCBased <stream>])
    if (resolved instanceof PdfArray || Array.isArray(resolved)) {
      const items = resolved instanceof PdfArray ? resolved.getItems() : resolved;
      const familyName = items[0] instanceof PdfName ? items[0].value : String(items[0]).replace(/^\//, '');

      if (familyName === 'Indexed' || familyName === 'I') {
        const baseCS = items[1] ? PdfColorSpace.parseColorSpace(items[1], document) : { family: 'DeviceRGB', components: 3, details: {} };
        const hival = items[2] && typeof items[2].intValue === 'function' ? items[2].intValue() : (Number(items[2]) || 255);
        let lookupObj = items[3];
        if (document && typeof document.resolve === 'function') {
          lookupObj = document.resolve(lookupObj);
        }

        let lookupTable = new Uint8Array(0);
        if (lookupObj instanceof PdfStream) {
          lookupTable = PdfStreamDecoder.decode(lookupObj);
        } else if (lookupObj instanceof PdfHexString || lookupObj instanceof PdfString) {
          lookupTable = lookupObj.toUint8Array ? lookupObj.toUint8Array() : new TextEncoder().encode(lookupObj.value);
        } else if (lookupObj instanceof Uint8Array) {
          lookupTable = lookupObj;
        } else if (typeof lookupObj === 'string') {
          lookupTable = new Uint8Array(lookupObj.length);
          for (let i = 0; i < lookupObj.length; i++) {
            lookupTable[i] = lookupObj.charCodeAt(i) & 0xFF;
          }
        }

        return {
          family: 'Indexed',
          components: 1,
          details: {
            base: baseCS,
            hival,
            lookup: lookupTable
          }
        };
      }

      if (familyName === 'ICCBased') {
        let streamObj = items[1];
        if (document && typeof document.resolve === 'function') {
          streamObj = document.resolve(streamObj);
        }
        let numComponents = 3;
        if (streamObj && streamObj.isStream && streamObj.isStream()) {
          const dict = streamObj.dictionary;
          numComponents = dict.getNumber('N') || 3;
        }
        return {
          family: 'ICCBased',
          components: numComponents,
          details: {
            fallback: numComponents === 1 ? 'DeviceGray' : (numComponents === 4 ? 'DeviceCMYK' : 'DeviceRGB')
          }
        };
      }

      return PdfColorSpace.#resolveNamedColorSpace(familyName);
    }

    return { family: 'DeviceRGB', components: 3, details: {} };
  }

  /**
   * Resolves standard named color spaces.
   * @private
   */
  static #resolveNamedColorSpace(name) {
    switch (name) {
      case 'DeviceGray':
      case 'G':
      case 'CalGray':
        return { family: 'DeviceGray', components: 1, details: {} };

      case 'DeviceCMYK':
      case 'CMYK':
        return { family: 'DeviceCMYK', components: 4, details: {} };

      case 'DeviceRGB':
      case 'RGB':
      case 'CalRGB':
      default:
        return { family: 'DeviceRGB', components: 3, details: {} };
    }
  }

  /**
   * Converts raw image component bytes into standard 32-bit RGBA pixels.
   * 
   * @param {Uint8Array} rawBytes
   * @param {number} width
   * @param {number} height
   * @param {{ family: string, components: number, details: Object }} colorSpace
   * @param {number} [bitsPerComponent=8]
   * @param {Array<number>} [decode=null]
   * @param {Uint8Array|null} [smaskRgba=null] - Optional alpha channel from SMask
   * @returns {Uint8Array} - RGBA buffer of length (width * height * 4)
   */
  static toRgba(rawBytes, width, height, colorSpace, bitsPerComponent = 8, decode = null, smaskRgba = null) {
    const totalPixels = width * height;
    const rgba = new Uint8Array(totalPixels * 4);

    const family = colorSpace.family;

    // Handle 1-bit monochrome images
    if (bitsPerComponent === 1) {
      PdfColorSpace.#decode1Bit(rawBytes, width, height, colorSpace, decode, rgba);
    } else if (bitsPerComponent === 8) {
      switch (family) {
        case 'DeviceGray':
          PdfColorSpace.#decode8BitGray(rawBytes, totalPixels, decode, rgba);
          break;

        case 'DeviceRGB':
          PdfColorSpace.#decode8BitRgb(rawBytes, totalPixels, rgba);
          break;

        case 'DeviceCMYK':
          PdfColorSpace.#decode8BitCmyk(rawBytes, totalPixels, rgba);
          break;

        case 'Indexed':
          PdfColorSpace.#decode8BitIndexed(rawBytes, totalPixels, colorSpace.details, rgba);
          break;

        case 'ICCBased': {
          const fallback = colorSpace.details?.fallback || 'DeviceRGB';
          if (fallback === 'DeviceGray') {
            PdfColorSpace.#decode8BitGray(rawBytes, totalPixels, decode, rgba);
          } else if (fallback === 'DeviceCMYK') {
            PdfColorSpace.#decode8BitCmyk(rawBytes, totalPixels, rgba);
          } else {
            PdfColorSpace.#decode8BitRgb(rawBytes, totalPixels, rgba);
          }
          break;
        }

        default:
          PdfColorSpace.#decode8BitRgb(rawBytes, totalPixels, rgba);
          break;
      }
    } else {
      // General fallback
      PdfColorSpace.#decode8BitRgb(rawBytes, totalPixels, rgba);
    }

    // Apply Soft Mask (SMask) alpha channel if provided
    if (smaskRgba && smaskRgba.length >= totalPixels * 4) {
      for (let i = 0; i < totalPixels; i++) {
        // In SMask, the luminance / R component represents alpha
        rgba[i * 4 + 3] = smaskRgba[i * 4];
      }
    }

    return rgba;
  }

  /**
   * Decodes 1-bit binary images (each row padded to byte boundary).
   * @private
   */
  static #decode1Bit(rawBytes, width, height, colorSpace, decode, rgba) {
    const rowStride = Math.ceil(width / 8);
    const invert = Array.isArray(decode) && decode.length >= 2 && decode[0] === 1 && decode[1] === 0;

    let pixelIdx = 0;
    for (let row = 0; row < height; row++) {
      const rowStart = row * rowStride;
      for (let col = 0; col < width; col++) {
        const byteIndex = rowStart + (col >> 3);
        const bitOffset = 7 - (col & 7);
        const byteVal = byteIndex < rawBytes.length ? rawBytes[byteIndex] : 0;
        let bit = (byteVal >> bitOffset) & 1;

        if (invert) {
          bit = 1 - bit;
        }

        // In PDF default monochrome: 0 is black, 1 is white
        const val = bit ? 255 : 0;
        const outOffset = pixelIdx * 4;

        if (colorSpace.family === 'Indexed' && colorSpace.details?.lookup) {
          const lookup = colorSpace.details.lookup;
          const baseComponents = colorSpace.details.base?.components || 3;
          const tableOffset = bit * baseComponents;
          if (baseComponents === 3) {
            rgba[outOffset] = lookup[tableOffset] || 0;
            rgba[outOffset + 1] = lookup[tableOffset + 1] || 0;
            rgba[outOffset + 2] = lookup[tableOffset + 2] || 0;
          } else {
            rgba[outOffset] = lookup[tableOffset] || 0;
            rgba[outOffset + 1] = lookup[tableOffset] || 0;
            rgba[outOffset + 2] = lookup[tableOffset] || 0;
          }
        } else {
          rgba[outOffset] = val;
          rgba[outOffset + 1] = val;
          rgba[outOffset + 2] = val;
        }
        rgba[outOffset + 3] = 255; // fully opaque

        pixelIdx++;
      }
    }
  }

  /**
   * Decodes 8-bit grayscale pixels.
   * @private
   */
  static #decode8BitGray(rawBytes, totalPixels, decode, rgba) {
    const invert = Array.isArray(decode) && decode.length >= 2 && decode[0] === 1 && decode[1] === 0;
    const len = Math.min(rawBytes.length, totalPixels);

    for (let i = 0; i < len; i++) {
      let val = rawBytes[i];
      if (invert) {
        val = 255 - val;
      }
      const out = i * 4;
      rgba[out] = val;
      rgba[out + 1] = val;
      rgba[out + 2] = val;
      rgba[out + 3] = 255;
    }
  }

  /**
   * Decodes 8-bit RGB pixels (3 bytes per pixel).
   * @private
   */
  static #decode8BitRgb(rawBytes, totalPixels, rgba) {
    const pixelCount = Math.min(Math.floor(rawBytes.length / 3), totalPixels);
    for (let i = 0; i < pixelCount; i++) {
      const src = i * 3;
      const dst = i * 4;
      rgba[dst] = rawBytes[src];
      rgba[dst + 1] = rawBytes[src + 1];
      rgba[dst + 2] = rawBytes[src + 2];
      rgba[dst + 3] = 255;
    }
  }

  /**
   * Decodes 8-bit CMYK pixels (4 bytes per pixel).
   * @private
   */
  static #decode8BitCmyk(rawBytes, totalPixels, rgba) {
    const pixelCount = Math.min(Math.floor(rawBytes.length / 4), totalPixels);
    for (let i = 0; i < pixelCount; i++) {
      const src = i * 4;
      const dst = i * 4;
      const c = rawBytes[src] / 255;
      const m = rawBytes[src + 1] / 255;
      const y = rawBytes[src + 2] / 255;
      const k = rawBytes[src + 3] / 255;

      const r = Math.round(255 * (1 - c) * (1 - k));
      const g = Math.round(255 * (1 - m) * (1 - k));
      const b = Math.round(255 * (1 - y) * (1 - k));

      rgba[dst] = r;
      rgba[dst + 1] = g;
      rgba[dst + 2] = b;
      rgba[dst + 3] = 255;
    }
  }

  /**
   * Decodes 8-bit Indexed pixels (1 index byte per pixel lookup).
   * @private
   */
  static #decode8BitIndexed(rawBytes, totalPixels, details, rgba) {
    const lookup = details?.lookup || new Uint8Array(0);
    const baseComponents = details?.base?.components || 3;
    const baseFamily = details?.base?.family || 'DeviceRGB';
    const pixelCount = Math.min(rawBytes.length, totalPixels);

    for (let i = 0; i < pixelCount; i++) {
      const index = rawBytes[i];
      const tableOffset = index * baseComponents;
      const dst = i * 4;

      if (baseFamily === 'DeviceRGB') {
        rgba[dst] = lookup[tableOffset] || 0;
        rgba[dst + 1] = lookup[tableOffset + 1] || 0;
        rgba[dst + 2] = lookup[tableOffset + 2] || 0;
      } else if (baseFamily === 'DeviceGray') {
        const val = lookup[tableOffset] || 0;
        rgba[dst] = val;
        rgba[dst + 1] = val;
        rgba[dst + 2] = val;
      } else if (baseFamily === 'DeviceCMYK') {
        const c = (lookup[tableOffset] || 0) / 255;
        const m = (lookup[tableOffset + 1] || 0) / 255;
        const y = (lookup[tableOffset + 2] || 0) / 255;
        const k = (lookup[tableOffset + 3] || 0) / 255;
        rgba[dst] = Math.round(255 * (1 - c) * (1 - k));
        rgba[dst + 1] = Math.round(255 * (1 - m) * (1 - k));
        rgba[dst + 2] = Math.round(255 * (1 - y) * (1 - k));
      } else {
        rgba[dst] = lookup[tableOffset] || 0;
        rgba[dst + 1] = lookup[tableOffset + 1] || 0;
        rgba[dst + 2] = lookup[tableOffset + 2] || 0;
      }
      rgba[dst + 3] = 255;
    }
  }
}
