import { XmlDocument } from '../model/XmlDocument.js';
import { XmlElement } from '../model/XmlElement.js';
import { XmlSerializer } from '../serializer/XmlSerializer.js';

/**
 * Fluent builder for creating XML documents programmatically.
 */
export class XmlBuilder {
  /**
   * @param {string} rootTagName
   * @param {Record<string, any>} [rootAttributes={}]
   * @param {object} [docOptions={}]
   */
  constructor(rootTagName, rootAttributes = {}, docOptions = {}) {
    this.doc = new XmlDocument(docOptions);
    this.current = this.doc.createElement(rootTagName, rootAttributes);
    this.doc.appendChild(this.current);
    this.rootElement = this.current;
  }

  /**
   * Appends a child element and moves context into it (or sets text if provided).
   * @param {string} tagName
   * @param {Record<string, any>|string|number} [attrsOrText]
   * @param {string|number} [text]
   * @returns {this}
   */
  element(tagName, attrsOrText, text) {
    let attrs = {};
    let content = null;

    if (typeof attrsOrText === 'object' && attrsOrText !== null) {
      attrs = attrsOrText;
      content = text;
    } else if (attrsOrText !== undefined) {
      content = attrsOrText;
    }

    const elem = this.doc.createElement(tagName, attrs);
    if (content !== null && content !== undefined) {
      elem.textContent = String(content);
    }

    this.current.appendChild(elem);

    // If text was supplied, do not descend into leaf; otherwise descend for chaining
    if (content === null || content === undefined) {
      this.current = elem;
    }

    return this;
  }

  /**
   * Appends a text node to the current element.
   * @param {string|number} text
   * @returns {this}
   */
  text(text) {
    this.current.appendChild(this.doc.createTextNode(String(text)));
    return this;
  }

  /**
   * Appends a CDATA section to the current element.
   * @param {string} data
   * @returns {this}
   */
  cdata(data) {
    this.current.appendChild(this.doc.createCData(String(data)));
    return this;
  }

  /**
   * Appends a comment to the current element.
   * @param {string} text
   * @returns {this}
   */
  comment(text) {
    this.current.appendChild(this.doc.createComment(String(text)));
    return this;
  }

  /**
   * Sets an attribute on the current element.
   * @param {string} name
   * @param {string|number|boolean} value
   * @returns {this}
   */
  attribute(name, value) {
    this.current.setAttribute(name, value);
    return this;
  }

  /**
   * Moves up to the parent element in the hierarchy.
   * @returns {this}
   */
  up() {
    if (this.current.parentNode && this.current.parentNode instanceof XmlElement) {
      this.current = this.current.parentNode;
    }
    return this;
  }

  /**
   * Resets context back to the root element.
   * @returns {this}
   */
  root() {
    this.current = this.rootElement;
    return this;
  }

  /**
   * Returns the underlying XmlDocument.
   * @returns {XmlDocument}
   */
  getDocument() {
    return this.doc;
  }

  /**
   * Serializes the document to XML string.
   * @param {object} [options]
   * @param {number|string} [options.indent=2]
   * @returns {string}
   */
  toString(options = { indent: 2 }) {
    return XmlSerializer.serializeToString(this.doc, options);
  }

  /**
   * Serializes to Uint8Array UTF-8 bytes.
   * @param {object} [options]
   * @returns {Uint8Array}
   */
  toBuffer(options = {}) {
    const str = this.toString(options);
    return new TextEncoder().encode(str);
  }
}
