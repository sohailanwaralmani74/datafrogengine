/**
 * XmlEditor - Programmatic XML DOM tree editor, node updater, attribute modifier,
 * child node reordering, and element restructuring.
 */

import { XmlParser } from '../parser/XmlParser.js';
import { XmlSerializer } from '../serializer/XmlSerializer.js';
import { XmlQuery } from '../query/XmlQuery.js';
import { XmlDocument } from '../model/XmlDocument.js';
import { XmlElement } from '../model/XmlElement.js';
import { XmlText } from '../model/XmlText.js';

export class XmlEditor {
  static #ensureDoc(xmlOrDoc) {
    if (typeof xmlOrDoc === 'string') {
      return { doc: XmlParser.parse(xmlOrDoc), wasString: true };
    }
    return { doc: xmlOrDoc, wasString: false };
  }

  static #finish(doc, wasString) {
    return wasString ? XmlSerializer.serialize(doc) : doc;
  }

  /**
   * Updates text content of elements matching a selector/XPath
   * @param {string|XmlDocument|XmlElement} target
   * @param {string} selector
   * @param {string} text
   * @returns {string|XmlDocument}
   */
  static setText(target, selector, text) {
    const { doc, wasString } = XmlEditor.#ensureDoc(target);
    const elements = XmlQuery.queryAll(doc, selector);
    for (const el of elements) {
      el.textContent = text;
    }
    return XmlEditor.#finish(doc, wasString);
  }

  /**
   * Sets attribute on elements matching a selector/XPath
   * @param {string|XmlDocument|XmlElement} target
   * @param {string} selector
   * @param {string} name
   * @param {string|number|boolean} value
   * @returns {string|XmlDocument}
   */
  static setAttribute(target, selector, name, value) {
    const { doc, wasString } = XmlEditor.#ensureDoc(target);
    const elements = XmlQuery.queryAll(doc, selector);
    for (const el of elements) {
      el.setAttribute(name, value);
    }
    return XmlEditor.#finish(doc, wasString);
  }

  /**
   * Removes attribute from matching elements
   * @param {string|XmlDocument|XmlElement} target
   * @param {string} selector
   * @param {string} name
   * @returns {string|XmlDocument}
   */
  static removeAttribute(target, selector, name) {
    const { doc, wasString } = XmlEditor.#ensureDoc(target);
    const elements = XmlQuery.queryAll(doc, selector);
    for (const el of elements) {
      el.removeAttribute(name);
    }
    return XmlEditor.#finish(doc, wasString);
  }

  /**
   * Renames element tags
   * @param {string|XmlDocument|XmlElement} target
   * @param {string} selector
   * @param {string} newTagName
   * @returns {string|XmlDocument}
   */
  static renameTag(target, selector, newTagName) {
    const { doc, wasString } = XmlEditor.#ensureDoc(target);
    const elements = XmlQuery.queryAll(doc, selector);
    for (const el of elements) {
      el.tag = newTagName;
    }
    return XmlEditor.#finish(doc, wasString);
  }

  /**
   * Removes elements matching a selector
   * @param {string|XmlDocument|XmlElement} target
   * @param {string} selector
   * @returns {string|XmlDocument}
   */
  static remove(target, selector) {
    const { doc, wasString } = XmlEditor.#ensureDoc(target);
    const elements = XmlQuery.queryAll(doc, selector);
    for (const el of elements) {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
    return XmlEditor.#finish(doc, wasString);
  }

  /**
   * Reorders child elements inside matching parent elements
   * @param {string|XmlDocument|XmlElement} target
   * @param {string} parentSelector
   * @param {Array<string>|Function} orderOrCompare Either array of tag names or comparator function (a, b) => number
   * @returns {string|XmlDocument}
   */
  static reorderChildren(target, parentSelector, orderOrCompare) {
    const { doc, wasString } = XmlEditor.#ensureDoc(target);
    const parents = XmlQuery.queryAll(doc, parentSelector);

    for (const parent of parents) {
      const childElems = [...parent.children];
      if (Array.isArray(orderOrCompare)) {
        const orderMap = new Map(orderOrCompare.map((tag, idx) => [tag.toLowerCase(), idx]));
        childElems.sort((a, b) => {
          const idxA = orderMap.has(a.tagName.toLowerCase()) ? orderMap.get(a.tagName.toLowerCase()) : 9999;
          const idxB = orderMap.has(b.tagName.toLowerCase()) ? orderMap.get(b.tagName.toLowerCase()) : 9999;
          return idxA - idxB;
        });
      } else if (typeof orderOrCompare === 'function') {
        childElems.sort(orderOrCompare);
      }

      // Remove existing children and re-append
      for (const child of childElems) {
        parent.removeChild(child);
      }
      for (const child of childElems) {
        parent.appendChild(child);
      }
    }

    return XmlEditor.#finish(doc, wasString);
  }

  /**
   * Appends a child element to parent matching selector
   * @param {string|XmlDocument|XmlElement} target
   * @param {string} parentSelector
   * @param {XmlElement|string} child
   * @returns {string|XmlDocument}
   */
  static appendChild(target, parentSelector, child) {
    const { doc, wasString } = XmlEditor.#ensureDoc(target);
    const parent = XmlQuery.query(doc, parentSelector);
    if (parent) {
      const nodeToAppend = typeof child === 'string'
        ? XmlParser.parseFragment(child)
        : child;
      parent.appendChild(nodeToAppend);
    }
    return XmlEditor.#finish(doc, wasString);
  }
}
