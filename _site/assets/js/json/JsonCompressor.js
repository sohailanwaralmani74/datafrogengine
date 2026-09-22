/**
 * JsonCompressor - High-speed JSON minifier and size compressor.
 */

import { JsonCleaner } from './JsonCleaner.js';

export class JsonCompressor {
  /**
   * Minifies JSON string or object into compact string representation
   * @param {string|object} input
   * @returns {string}
   */
  static compress(input) {
    return JsonCleaner.minify(input);
  }

  /**
   * Alias for compress()
   */
  static minify(input) {
    return JsonCleaner.minify(input);
  }
}
