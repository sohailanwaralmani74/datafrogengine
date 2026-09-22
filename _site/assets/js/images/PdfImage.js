import { PdfColorSpace } from './PdfColorSpace.js';
import { PdfPngEncoder } from './PdfPngEncoder.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents an extracted PDF image (XObject image or inline image) with metadata,
 * color space conversions, and image export capabilities.
 */
export class PdfImage {
  /** @type {string} */
  #name;

  /** @type {number} */
  #width;

  /** @type {number} */
  #height;

  /** @type {{ family: string, components: number, details: Object }} */
  #colorSpace;

  /** @type {number} */
  #bitsPerComponent;

  /** @type {Uint8Array} */
  #bytes;

  /** @type {string} 'jpeg' | 'raw' | 'png' */
  #format;

  /** @type {Array<number>|null} */
  #decode;

  /** @type {PdfImage|null} */
  #smask;

  /** @type {boolean} */
  #isInline;

  /** @type {{ x: number, y: number, width: number, height: number, matrix: Array<number> }|null} */
  #position;

  /** @type {Uint8Array|null} */
  #rgbaCache = null;

  /** @type {Uint8Array|null} */
  #pngCache = null;

  /**
   * @param {Object} options
   * @param {string} options.name
   * @param {number} options.width
   * @param {number} options.height
   * @param {Object} options.colorSpace
   * @param {number} [options.bitsPerComponent=8]
   * @param {Uint8Array} options.bytes
   * @param {string} [options.format='raw']
   * @param {Array<number>} [options.decode=null]
   * @param {PdfImage} [options.smask=null]
   * @param {boolean} [options.isInline=false]
   * @param {Object} [options.position=null]
   */
  constructor({
    name,
    width,
    height,
    colorSpace,
    bitsPerComponent = 8,
    bytes,
    format = 'raw',
    decode = null,
    smask = null,
    isInline = false,
    position = null
  }) {
    if (typeof width !== 'number' || width <= 0) {
      throw new PdfInvalidArgumentException('width', width, 'positive integer');
    }
    if (typeof height !== 'number' || height <= 0) {
      throw new PdfInvalidArgumentException('height', height, 'positive integer');
    }
    if (!(bytes instanceof Uint8Array)) {
      throw new PdfInvalidArgumentException('bytes', bytes, 'Uint8Array');
    }

    this.#name = name || 'image';
    this.#width = width;
    this.#height = height;
    this.#colorSpace = colorSpace || { family: 'DeviceRGB', components: 3, details: {} };
    this.#bitsPerComponent = bitsPerComponent;
    this.#bytes = bytes;
    this.#format = format;
    this.#decode = decode;
    this.#smask = smask;
    this.#isInline = isInline;
    this.#position = position;
  }

  get name() {
    return this.#name;
  }

  get width() {
    return this.#width;
  }

  get height() {
    return this.#height;
  }

  get colorSpace() {
    return this.#colorSpace;
  }

  get bitsPerComponent() {
    return this.#bitsPerComponent;
  }

  get bytes() {
    return this.#bytes;
  }

  get format() {
    return this.#format;
  }

  get decode() {
    return this.#decode;
  }

  get smask() {
    return this.#smask;
  }

  get isInline() {
    return this.#isInline;
  }

  get position() {
    return this.#position;
  }

  /**
   * Returns decoded 32-bit RGBA pixel buffer of length (width * height * 4).
   * 
   * @returns {Uint8Array}
   */
  toRgba() {
    if (this.#rgbaCache) {
      return this.#rgbaCache;
    }

    const smaskRgba = this.#smask ? this.#smask.toRgba() : null;
    this.#rgbaCache = PdfColorSpace.toRgba(
      this.#bytes,
      this.#width,
      this.#height,
      this.#colorSpace,
      this.#bitsPerComponent,
      this.#decode,
      smaskRgba
    );

    return this.#rgbaCache;
  }

  /**
   * Encodes and returns the image as a standard PNG file byte buffer.
   * 
   * @returns {Uint8Array}
   */
  toPng() {
    if (this.#pngCache) {
      return this.#pngCache;
    }
    const rgba = this.toRgba();
    this.#pngCache = PdfPngEncoder.encode(rgba, this.#width, this.#height);
    return this.#pngCache;
  }

  /**
   * Alias for toPng().
   * @returns {Uint8Array}
   */
  toPngBytes() {
    return this.toPng();
  }

  /**
   * Returns raw JPEG bytes if image format is JPEG.
   * 
   * @returns {Uint8Array}
   */
  toJpegBytes() {
    if (this.#format === 'jpeg') {
      return this.#bytes;
    }
    throw new Error(`Image '${this.#name}' is not in JPEG format (actual format: ${this.#format})`);
  }

  /**
   * Generates a Base64 data URL for display in browser <img> tags or HTML canvas.
   * 
   * @returns {string}
   */
  toDataUrl() {
    if (this.#format === 'jpeg') {
      const b64 = PdfImage.#bytesToBase64(this.#bytes);
      return `data:image/jpeg;base64,${b64}`;
    }
    const pngBytes = this.toPng();
    const b64 = PdfImage.#bytesToBase64(pngBytes);
    return `data:image/png;base64,${b64}`;
  }

  /**
   * Base64 encoding compatible across browser and Node.js.
   * @private
   */
  static #bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
