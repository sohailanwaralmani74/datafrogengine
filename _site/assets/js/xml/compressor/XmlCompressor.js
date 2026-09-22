/**
 * XmlCompressor - Aggressive size minification and payload optimizer for XML documents.
 * Removes redundant whitespace, comments, and collapses empty tags.
 */

import { XmlCleaner } from '../cleaner/XmlCleaner.js';

export class XmlCompressor {
  /**
   * Compresses XML text into a dense, minified single-line string
   * @param {string} xmlText
   * @param {object} [options]
   * @returns {string} Minified XML
   */
  static compress(xmlText, options = {}) {
    if (typeof xmlText !== 'string') {
      throw new TypeError('Expected XML string');
    }

    // 1. Clean and strip comments
    let minified = XmlCleaner.clean(xmlText, {
      stripComments: true,
      stripEmptyElements: false,
      trimWhitespace: true,
      prettyPrint: false
    });

    // 2. Remove whitespace between tags
    minified = minified.replace(/>\s+</g, '><');

    // 3. Collapse empty element pairs <tag></tag> to <tag/>
    minified = minified.replace(/<([a-zA-Z0-9_:-]+)([^>]*?)>\s*<\/\1>/g, '<$1$2/>');

    return minified.trim();
  }

  /**
   * Alias for compress()
   */
  static minify(xmlText, options) {
    return XmlCompressor.compress(xmlText, options);
  }
}
