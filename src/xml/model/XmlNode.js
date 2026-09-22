import { XmlNodeType } from './XmlNodeType.js';

/**
 * Base class for all nodes in the XML Document Object Model.
 */
export class XmlNode {
  /**
   * @param {number} nodeType
   * @param {string} nodeName
   * @param {string|null} [nodeValue=null]
   */
  constructor(nodeType, nodeName, nodeValue = null) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.nodeValue = nodeValue;
    /** @type {XmlNode|null} */
    this.parentNode = null;
    /** @type {XmlNode[]} */
    this.childNodes = [];
  }

  get firstChild() {
    return this.childNodes.length > 0 ? this.childNodes[0] : null;
  }

  get lastChild() {
    return this.childNodes.length > 0 ? this.childNodes[this.childNodes.length - 1] : null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    return idx > 0 ? siblings[idx - 1] : null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  }

  get hasChildNodes() {
    return this.childNodes.length > 0;
  }

  /**
   * Appends a child node.
   * @param {XmlNode} child
   * @returns {XmlNode}
   */
  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  /**
   * Inserts a child node before refChild.
   * @param {XmlNode} newChild
   * @param {XmlNode|null} refChild
   * @returns {XmlNode}
   */
  insertBefore(newChild, refChild) {
    if (!refChild) {
      return this.appendChild(newChild);
    }
    const idx = this.childNodes.indexOf(refChild);
    if (idx === -1) {
      throw new Error('Reference child not found in parent node.');
    }
    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    newChild.parentNode = this;
    this.childNodes.splice(idx, 0, newChild);
    return newChild;
  }

  /**
   * Removes a child node.
   * @param {XmlNode} child
   * @returns {XmlNode}
   */
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx === -1) {
      throw new Error('Child node not found in parent.');
    }
    this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  /**
   * Replaces an existing child with a new child.
   * @param {XmlNode} newChild
   * @param {XmlNode} oldChild
   * @returns {XmlNode}
   */
  replaceChild(newChild, oldChild) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx === -1) {
      throw new Error('Child to replace not found in parent.');
    }
    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    this.childNodes[idx] = newChild;
    newChild.parentNode = this;
    oldChild.parentNode = null;
    return oldChild;
  }

  /**
   * Detaches this node from its parent.
   */
  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  /**
   * Returns text content of this node and all its descendants.
   * @returns {string}
   */
  get textContent() {
    if (this.nodeType === XmlNodeType.TEXT || this.nodeType === XmlNodeType.CDATA) {
      return this.nodeValue || '';
    }
    let text = '';
    for (const child of this.childNodes) {
      if (child.nodeType === XmlNodeType.ELEMENT || child.nodeType === XmlNodeType.TEXT || child.nodeType === XmlNodeType.CDATA) {
        text += child.textContent;
      }
    }
    return text;
  }

  /**
   * Sets text content, replacing all children with a single text node.
   * @param {string} value
   */
  set textContent(value) {
    while (this.childNodes.length > 0) {
      this.removeChild(this.childNodes[0]);
    }
    if (value !== null && value !== undefined && value !== '') {
      // Dynamic import to avoid circular dependency
      const { XmlText } = XmlNode._types || {};
      if (XmlText) {
        this.appendChild(new XmlText(String(value)));
      } else {
        this.nodeValue = String(value);
      }
    }
  }

  /**
   * Clones this node.
   * @param {boolean} [deep=true]
   * @returns {XmlNode}
   */
  cloneNode(deep = true) {
    throw new Error('cloneNode must be implemented by subclasses.');
  }

  /**
   * Serializes node to XML string.
   * @param {object} [options]
   * @returns {string}
   */
  toString(options = {}) {
    const { XmlSerializer } = XmlNode._serializer || {};
    if (XmlSerializer) {
      return XmlSerializer.serializeToString(this, options);
    }
    return this.nodeValue || '';
  }
}
