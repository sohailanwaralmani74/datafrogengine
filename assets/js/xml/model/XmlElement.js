import { XmlNode } from './XmlNode.js';
import { XmlNodeType } from './XmlNodeType.js';
import { XmlText } from './XmlText.js';

/**
 * Represents an XML element node (<tag attr="value">children</tag>).
 */
export class XmlElement extends XmlNode {
  /**
   * @param {string} tagName
   * @param {Record<string, string|number|boolean>} [attributes={}]
   */
  constructor(tagName, attributes = {}) {
    super(XmlNodeType.ELEMENT, tagName, null);
    this.tagName = tagName;

    // Parse namespace prefix & local name
    const colonIdx = tagName.indexOf(':');
    if (colonIdx !== -1) {
      this.prefix = tagName.slice(0, colonIdx);
      this.localName = tagName.slice(colonIdx + 1);
    } else {
      this.prefix = '';
      this.localName = tagName;
    }

    /** @type {string|null} */
    this.namespaceURI = null;

    /** @type {Map<string, string>} */
    this._attributes = new Map();
    if (attributes && typeof attributes === 'object') {
      for (const [k, v] of Object.entries(attributes)) {
        if (v !== undefined && v !== null) {
          this._attributes.set(k, String(v));
        }
      }
    }
  }

  /**
   * Returns attributes as a plain key-value object (for compatibility).
   * @returns {Record<string, string>}
   */
  get attrs() {
    const obj = {};
    for (const [k, v] of this._attributes.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  /**
   * Alias for tagName for compatibility with existing code.
   * @returns {string}
   */
  get tag() {
    return this.tagName;
  }

  set tag(val) {
    this.tagName = val;
    this.nodeName = val;
    const colonIdx = val.indexOf(':');
    if (colonIdx !== -1) {
      this.prefix = val.slice(0, colonIdx);
      this.localName = val.slice(colonIdx + 1);
    } else {
      this.prefix = '';
      this.localName = val;
    }
  }

  /**
   * Gets child elements only (excluding text, comments, PIs).
   * @returns {XmlElement[]}
   */
  get children() {
    return /** @type {XmlElement[]} */ (
      this.childNodes.filter((c) => c.nodeType === XmlNodeType.ELEMENT)
    );
  }

  get firstElementChild() {
    const ch = this.children;
    return ch.length > 0 ? ch[0] : null;
  }

  get lastElementChild() {
    const ch = this.children;
    return ch.length > 0 ? ch[ch.length - 1] : null;
  }

  get childElementCount() {
    return this.children.length;
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(val) {
    if (val) this.setAttribute('id', val);
    else this.removeAttribute('id');
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set className(val) {
    if (val) this.setAttribute('class', val);
    else this.removeAttribute('class');
  }

  /**
   * Sets an attribute on this element.
   * @param {string} name
   * @param {string|number|boolean} value
   * @returns {this}
   */
  setAttribute(name, value) {
    this._attributes.set(name, String(value));
    return this;
  }

  /**
   * Gets an attribute value.
   * @param {string} name
   * @returns {string|null}
   */
  getAttribute(name) {
    return this._attributes.has(name) ? this._attributes.get(name) : null;
  }

  /**
   * For backwards-compatibility with getAttr.
   * @param {string} name
   * @returns {string|undefined}
   */
  getAttr(name) {
    return this._attributes.get(name);
  }

  /**
   * Checks if attribute exists.
   * @param {string} name
   * @returns {boolean}
   */
  hasAttribute(name) {
    return this._attributes.has(name);
  }

  /**
   * Removes an attribute.
   * @param {string} name
   * @returns {boolean}
   */
  removeAttribute(name) {
    return this._attributes.delete(name);
  }

  /**
   * Gets list of all attribute names.
   * @returns {string[]}
   */
  getAttributeNames() {
    return Array.from(this._attributes.keys());
  }

  /**
   * Compatibility alias for text getter/setter.
   * @returns {string}
   */
  get text() {
    return this.textContent;
  }

  set text(val) {
    this.textContent = val;
  }

  /**
   * Finds the immediate child matching a given tag name or localName.
   * @param {string} targetTag
   * @returns {XmlElement|null}
   */
  findChild(targetTag) {
    const cleanTarget = targetTag.includes(':') ? targetTag.split(':')[1] : targetTag;
    for (const child of this.children) {
      if (child.tagName === targetTag || child.localName === cleanTarget) {
        return child;
      }
    }
    return null;
  }

  /**
   * Finds all immediate children matching a given tag name or localName.
   * @param {string} targetTag
   * @returns {XmlElement[]}
   */
  findChildren(targetTag) {
    const cleanTarget = targetTag.includes(':') ? targetTag.split(':')[1] : targetTag;
    const result = [];
    for (const child of this.children) {
      if (child.tagName === targetTag || child.localName === cleanTarget) {
        result.push(child);
      }
    }
    return result;
  }

  /**
   * Recursive search through all descendant elements matching tag name.
   * @param {string} tagName - Tag name, or '*' for all descendant elements.
   * @returns {XmlElement[]}
   */
  getElementsByTagName(tagName) {
    const result = [];
    const isWildcard = tagName === '*';
    const cleanTarget = tagName.includes(':') ? tagName.split(':')[1] : tagName;

    const traverse = (elem) => {
      for (const child of elem.children) {
        if (isWildcard || child.tagName === tagName || child.localName === cleanTarget) {
          result.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return result;
  }

  /**
   * Finds element by ID within descendants.
   * @param {string} id
   * @returns {XmlElement|null}
   */
  getElementById(id) {
    for (const elem of this.getElementsByTagName('*')) {
      if (elem.id === id) return elem;
    }
    return null;
  }

  /**
   * Clones element node.
   * @param {boolean} [deep=true]
   * @returns {XmlElement}
   */
  cloneNode(deep = true) {
    const clone = new XmlElement(this.tagName);
    for (const [k, v] of this._attributes.entries()) {
      clone.setAttribute(k, v);
    }
    clone.namespaceURI = this.namespaceURI;
    if (deep) {
      for (const child of this.childNodes) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }
}
