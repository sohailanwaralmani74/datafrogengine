import { XmlNode } from './XmlNode.js';
import { XmlNodeType } from './XmlNodeType.js';

/**
 * Represents character data / text within an XML document.
 */
export class XmlText extends XmlNode {
  /**
   * @param {string} [data='']
   */
  constructor(data = '') {
    super(XmlNodeType.TEXT, '#text', String(data));
  }

  get data() {
    return this.nodeValue || '';
  }

  set data(val) {
    this.nodeValue = String(val);
  }

  get length() {
    return (this.nodeValue || '').length;
  }

  /**
   * Clones this text node.
   * @param {boolean} [deep=true]
   * @returns {XmlText}
   */
  cloneNode(deep = true) {
    return new XmlText(this.nodeValue || '');
  }

  /**
   * Encodes special XML characters to entities: &, <, >, ", '
   * @param {string} str
   * @returns {string}
   */
  static escapeXml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Decodes XML entities back to raw characters.
   * @param {string} str
   * @returns {string}
   */
  static unescapeXml(str) {
    if (!str) return '';
    return str
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&amp;/g, '&');
  }
}
