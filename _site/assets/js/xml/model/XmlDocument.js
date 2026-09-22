import { XmlNode } from './XmlNode.js';
import { XmlNodeType } from './XmlNodeType.js';
import { XmlElement } from './XmlElement.js';
import { XmlText } from './XmlText.js';
import {
  XmlCData,
  XmlComment,
  XmlProcessingInstruction,
  XmlDeclaration,
  XmlDoctype
} from './XmlMiscNodes.js';

// Setup reference on XmlNode for dynamic text creation
XmlNode._types = { XmlText };

/**
 * Top-level XML Document container.
 */
export class XmlDocument extends XmlNode {
  /**
   * @param {object} [options]
   * @param {string} [options.version='1.0']
   * @param {string} [options.encoding='UTF-8']
   * @param {string|boolean|null} [options.standalone=null]
   */
  constructor(options = {}) {
    super(XmlNodeType.DOCUMENT, '#document', null);
    this.declaration = new XmlDeclaration(options);
    /** @type {XmlDoctype|null} */
    this.doctype = null;
  }

  /**
   * Gets the root element of this document.
   * @returns {XmlElement|null}
   */
  get documentElement() {
    for (const child of this.childNodes) {
      if (child.nodeType === XmlNodeType.ELEMENT) {
        return /** @type {XmlElement} */ (child);
      }
    }
    return null;
  }

  /**
   * Sets or replaces the root element.
   * @param {XmlElement} element
   */
  set documentElement(element) {
    const existing = this.documentElement;
    if (existing) {
      this.replaceChild(element, existing);
    } else {
      this.appendChild(element);
    }
  }

  /**
   * Alias for documentElement / root element.
   * @returns {XmlElement|null}
   */
  get root() {
    return this.documentElement;
  }

  set root(element) {
    this.documentElement = element;
  }

  get tag() {
    return this.documentElement ? this.documentElement.tag : '';
  }

  get tagName() {
    return this.documentElement ? this.documentElement.tagName : '';
  }

  get attrs() {
    return this.documentElement ? this.documentElement.attrs : {};
  }

  get text() {
    return this.documentElement ? this.documentElement.text : '';
  }

  getAttr(name) {
    return this.documentElement ? this.documentElement.getAttr(name) : undefined;
  }

  getAttribute(name) {
    return this.documentElement ? this.documentElement.getAttribute(name) : null;
  }

  findChild(tag) {
    return this.documentElement ? this.documentElement.findChild(tag) : null;
  }

  findChildren(tag) {
    return this.documentElement ? this.documentElement.findChildren(tag) : [];
  }

  /**
   * Factory: creates an element.
   * @param {string} tagName
   * @param {Record<string, string|number|boolean>} [attributes={}]
   * @returns {XmlElement}
   */
  createElement(tagName, attributes = {}) {
    return new XmlElement(tagName, attributes);
  }

  /**
   * Factory: creates a text node.
   * @param {string} text
   * @returns {XmlText}
   */
  createTextNode(text) {
    return new XmlText(text);
  }

  /**
   * Factory: creates a CDATA node.
   * @param {string} data
   * @returns {XmlCData}
   */
  createCData(data) {
    return new XmlCData(data);
  }

  /**
   * Factory: creates a comment node.
   * @param {string} data
   * @returns {XmlComment}
   */
  createComment(data) {
    return new XmlComment(data);
  }

  /**
   * Factory: creates a processing instruction.
   * @param {string} target
   * @param {string} [data='']
   * @returns {XmlProcessingInstruction}
   */
  createProcessingInstruction(target, data = '') {
    return new XmlProcessingInstruction(target, data);
  }

  /**
   * Finds element by ID across the document.
   * @param {string} id
   * @returns {XmlElement|null}
   */
  getElementById(id) {
    const root = this.documentElement;
    if (!root) return null;
    if (root.id === id) return root;
    return root.getElementById(id);
  }

  /**
   * Finds all elements matching tagName across the document.
   * @param {string} tagName
   * @returns {XmlElement[]}
   */
  getElementsByTagName(tagName) {
    const root = this.documentElement;
    if (!root) return [];
    const res = [];
    const isWildcard = tagName === '*';
    const cleanTarget = tagName.includes(':') ? tagName.split(':')[1] : tagName;

    if (isWildcard || root.tagName === tagName || root.localName === cleanTarget) {
      res.push(root);
    }
    return res.concat(root.getElementsByTagName(tagName));
  }

  /**
   * Clones the entire document.
   * @param {boolean} [deep=true]
   * @returns {XmlDocument}
   */
  cloneNode(deep = true) {
    const doc = new XmlDocument({
      version: this.declaration.version,
      encoding: this.declaration.encoding,
      standalone: this.declaration.standalone
    });
    if (this.doctype) {
      doc.doctype = this.doctype.cloneNode(true);
    }
    if (deep) {
      for (const child of this.childNodes) {
        doc.appendChild(child.cloneNode(true));
      }
    }
    return doc;
  }
}
