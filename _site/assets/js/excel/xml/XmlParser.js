/**
 * Lightweight, robust XML Parser for OpenXML / SpreadsheetML files.
 * Zero external dependencies.
 */
export class XmlNode {
  /**
   * @param {string} tag
   * @param {Record<string, string>} [attrs={}]
   * @param {string} [text='']
   */
  constructor(tag, attrs = {}, text = '') {
    this.tag = tag;
    this.attrs = attrs;
    this.text = text;
    /** @type {XmlNode[]} */
    this.children = [];
  }

  /**
   * Finds the first child node matching tag name (ignoring or matching namespace prefix).
   * @param {string} tag
   * @returns {XmlNode|null}
   */
  findChild(tag) {
    const cleanTarget = tag.includes(':') ? tag.split(':')[1] : tag;
    for (const child of this.children) {
      const cleanTag = child.tag.includes(':') ? child.tag.split(':')[1] : child.tag;
      if (cleanTag === cleanTarget || child.tag === tag) {
        return child;
      }
    }
    return null;
  }

  /**
   * Finds all children matching tag name.
   * @param {string} tag
   * @returns {XmlNode[]}
   */
  findChildren(tag) {
    const cleanTarget = tag.includes(':') ? tag.split(':')[1] : tag;
    const result = [];
    for (const child of this.children) {
      const cleanTag = child.tag.includes(':') ? child.tag.split(':')[1] : child.tag;
      if (cleanTag === cleanTarget || child.tag === tag) {
        result.push(child);
      }
    }
    return result;
  }

  /**
   * Gets attribute value.
   * @param {string} attrName
   * @returns {string|undefined}
   */
  getAttr(attrName) {
    if (this.attrs[attrName] !== undefined) {
      return this.attrs[attrName];
    }
    const clean = attrName.includes(':') ? attrName.split(':')[1] : attrName;
    for (const [k, v] of Object.entries(this.attrs)) {
      const cleanK = k.includes(':') ? k.split(':')[1] : k;
      if (cleanK === clean) return v;
    }
    return undefined;
  }
}

export class XmlParser {
  /**
   * Parses an XML string into an XmlNode tree.
   * 
   * @param {string} xmlString
   * @returns {XmlNode} Root node
   */
  static parse(xmlString) {
    if (typeof xmlString !== 'string') {
      throw new TypeError('Expected XML input to be string');
    }

    // Strip XML declaration, comments and doctypes
    let clean = xmlString
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!DOCTYPE[\s\S]*?>/gi, '');

    const root = new XmlNode('__ROOT__');
    const stack = [root];

    // Regex matching XML tags or text tokens
    const tagRegex = /<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
    let match;

    while ((match = tagRegex.exec(clean)) !== null) {
      const isClosing = match[1] === '/';
      const tagName = match[2];
      const rawAttrs = match[3];
      const isSelfClosing = match[4] === '/';
      const textContent = match[5];

      if (textContent) {
        const trimmed = XmlParser.unescape(textContent);
        if (stack.length > 1 && trimmed.length > 0) {
          stack[stack.length - 1].text += trimmed;
        }
        continue;
      }

      if (isClosing) {
        // Pop matching element or pop up to matching tag
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === tagName) {
            stack.splice(i);
            break;
          }
        }
      } else {
        const attrs = XmlParser.#parseAttributes(rawAttrs || '');
        const node = new XmlNode(tagName, attrs);
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.children.push(node);
        }

        if (!isSelfClosing) {
          stack.push(node);
        }
      }
    }

    return root.children[0] || root;
  }

  /**
   * Parses XML attribute string into key-value pairs.
   * @private
   */
  static #parseAttributes(attrString) {
    const attrs = {};
    const attrRegex = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let m;
    while ((m = attrRegex.exec(attrString)) !== null) {
      const key = m[1];
      const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
      attrs[key] = XmlParser.unescape(val);
    }
    return attrs;
  }

  /**
   * Decodes standard XML entity references.
   * @param {string} str
   * @returns {string}
   */
  static unescape(str) {
    if (!str) return '';
    return str
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  /**
   * Escapes standard XML characters.
   * @param {string} str
   * @returns {string}
   */
  static escape(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
