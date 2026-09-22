/**
 * XmlCleaner - Sanitization, whitespace normalization, comment stripping,
 * and empty node pruning for XML documents.
 */

import { XmlParser } from '../parser/XmlParser.js';
import { XmlSerializer } from '../serializer/XmlSerializer.js';
import { XmlDocument } from '../model/XmlDocument.js';
import { XmlNodeType } from '../model/XmlNodeType.js';

export class XmlCleaner {
  /**
   * Sanitizes and cleans an XML document or string
   * @param {string|XmlDocument} xml
   * @param {object} [options]
   * @param {boolean} [options.stripComments=true] Remove <!-- comments -->
   * @param {boolean} [options.stripEmptyElements=false] Remove elements with no content
   * @param {boolean} [options.trimWhitespace=true] Trim text nodes
   * @param {boolean} [options.prettyPrint=true] Indent cleanly
   * @returns {string}
   */
  static clean(xml, options = {}) {
    const doc = typeof xml === 'string' ? XmlParser.parse(xml) : xml;
    const stripComments = options.stripComments !== false;
    const stripEmpty = options.stripEmptyElements === true;
    const trimWhitespace = options.trimWhitespace !== false;
    const prettyPrint = options.prettyPrint !== false;

    const cleanNode = (node) => {
      if (!node.childNodes) return;

      const newChildren = [];
      for (const child of node.childNodes) {
        if (stripComments && child.nodeType === XmlNodeType.COMMENT) {
          continue;
        }

        if (child.nodeType === XmlNodeType.TEXT) {
          if (trimWhitespace) {
            child.nodeValue = child.nodeValue.trim();
          }
          if (child.nodeValue.length === 0) {
            continue;
          }
        }

        if (child.nodeType === XmlNodeType.ELEMENT) {
          cleanNode(child);
          if (stripEmpty && child.children.length === 0 && (!child.textContent || child.textContent.trim() === '')) {
            continue;
          }
        }

        newChildren.push(child);
      }

      node.childNodes = newChildren;
    };

    if (doc.documentElement) {
      cleanNode(doc.documentElement);
    }

    return XmlSerializer.serialize(doc, { indent: prettyPrint ? '  ' : '' });
  }

  /**
   * Strips all comments from XML string or document
   * @param {string|XmlDocument} xml
   * @returns {string}
   */
  static stripComments(xml) {
    return XmlCleaner.clean(xml, { stripComments: true, stripEmptyElements: false });
  }

  /**
   * Strips empty elements from XML
   * @param {string|XmlDocument} xml
   * @returns {string}
   */
  static stripEmptyElements(xml) {
    return XmlCleaner.clean(xml, { stripComments: false, stripEmptyElements: true });
  }
}
