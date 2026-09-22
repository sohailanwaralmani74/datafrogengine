import { XmlText } from '../model/XmlText.js';

/**
 * Fast XML string builder for high-throughput XML document generation.
 */
export class XmlWriter {
  #buffer;

  constructor() {
    this.#buffer = [];
  }

  /**
   * Appends XML declaration header.
   * @param {string} [encoding='UTF-8']
   * @param {string} [standalone='yes']
   * @returns {XmlWriter}
   */
  declaration(encoding = 'UTF-8', standalone = 'yes') {
    this.#buffer.push(`<?xml version="1.0" encoding="${encoding}" standalone="${standalone}"?>\n`);
    return this;
  }

  /**
   * Appends an opening tag.
   * @param {string} tag
   * @param {Record<string, string|number|boolean>} [attrs={}]
   * @returns {XmlWriter}
   */
  startElement(tag, attrs = {}) {
    this.#buffer.push(`<${tag}${this.#formatAttrs(attrs)}>`);
    return this;
  }

  /**
   * Appends a closing tag.
   * @param {string} tag
   * @returns {XmlWriter}
   */
  endElement(tag) {
    this.#buffer.push(`</${tag}>`);
    return this;
  }

  /**
   * Appends a self-closing element.
   * @param {string} tag
   * @param {Record<string, string|number|boolean>} [attrs={}]
   * @returns {XmlWriter}
   */
  emptyElement(tag, attrs = {}) {
    this.#buffer.push(`<${tag}${this.#formatAttrs(attrs)}/>`);
    return this;
  }

  /**
   * Appends an element with text content.
   * @param {string} tag
   * @param {string|number|boolean} text
   * @param {Record<string, string|number|boolean>} [attrs={}]
   * @returns {XmlWriter}
   */
  element(tag, text, attrs = {}) {
    if (text === null || text === undefined || text === '') {
      return this.emptyElement(tag, attrs);
    }
    this.#buffer.push(`<${tag}${this.#formatAttrs(attrs)}>${XmlText.escapeXml(String(text))}</${tag}>`);
    return this;
  }

  /**
   * Appends raw unescaped XML string.
   * @param {string} rawXml
   * @returns {XmlWriter}
   */
  raw(rawXml) {
    this.#buffer.push(rawXml);
    return this;
  }

  /**
   * Appends escaped text.
   * @param {string} text
   * @returns {XmlWriter}
   */
  text(text) {
    this.#buffer.push(XmlText.escapeXml(String(text)));
    return this;
  }

  /**
   * Appends a CDATA section.
   * @param {string} data
   * @returns {XmlWriter}
   */
  cdata(data) {
    this.#buffer.push(`<![CDATA[${data}]]>`);
    return this;
  }

  /**
   * Appends a comment.
   * @param {string} comment
   * @returns {XmlWriter}
   */
  comment(comment) {
    this.#buffer.push(`<!--${comment}-->`);
    return this;
  }

  /**
   * Returns complete XML string.
   * @returns {string}
   */
  toString() {
    return this.#buffer.join('');
  }

  #formatAttrs(attrs) {
    if (!attrs || Object.keys(attrs).length === 0) return '';
    const parts = [];
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) {
        parts.push(` ${k}="${XmlText.escapeXml(String(v))}"`);
      }
    }
    return parts.join('');
  }
}
