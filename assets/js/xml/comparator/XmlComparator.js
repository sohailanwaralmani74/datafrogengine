/**
 * XmlComparator - Deep structural and semantic tree diffing for XML documents.
 * Detects element additions, deletions, attribute mutations, and text content changes.
 */

import { XmlParser } from '../parser/XmlParser.js';
import { XmlDocument } from '../model/XmlDocument.js';
import { XmlNodeType } from '../model/XmlNodeType.js';

export class XmlComparator {
  /**
   * Compares two XML documents or strings
   * @param {string|XmlDocument} xmlA Original XML
   * @param {string|XmlDocument} xmlB Modified XML
   * @param {object} [options]
   * @param {boolean} [options.ignoreWhitespace=true] Ignore leading/trailing whitespace in text
   * @param {boolean} [options.ignoreComments=true] Ignore XML comments during comparison
   * @returns {object} Comparison results
   */
  static compare(xmlA, xmlB, options = {}) {
    const docA = typeof xmlA === 'string' ? XmlParser.parse(xmlA) : xmlA;
    const docB = typeof xmlB === 'string' ? XmlParser.parse(xmlB) : xmlB;

    const ignoreWhitespace = options.ignoreWhitespace !== false;
    const ignoreComments = options.ignoreComments !== false;

    const rootA = docA.documentElement;
    const rootB = docB.documentElement;

    const differences = [];

    if (!rootA && !rootB) {
      return { identical: true, differences: [] };
    }
    if (!rootA || !rootB) {
      return {
        identical: false,
        summary: { rootMismatch: true, differencesCount: 1 },
        differences: [{ path: '/', type: 'ROOT_MISMATCH', message: 'One document is empty' }]
      };
    }

    XmlComparator.#diffElements(rootA, rootB, `/${rootA.tagName}`, differences, {
      ignoreWhitespace,
      ignoreComments
    });

    return {
      identical: differences.length === 0,
      summary: {
        differencesCount: differences.length,
        addedElements: differences.filter(d => d.type === 'ELEMENT_ADDED').length,
        removedElements: differences.filter(d => d.type === 'ELEMENT_REMOVED').length,
        changedText: differences.filter(d => d.type === 'TEXT_CHANGED').length,
        attributeDifferences: differences.filter(d => d.type.startsWith('ATTR_')).length
      },
      differences
    };
  }

  static #diffElements(elemA, elemB, path, diffs, options) {
    if (elemA.tagName !== elemB.tagName) {
      diffs.push({
        path,
        type: 'TAG_NAME_CHANGED',
        oldTag: elemA.tagName,
        newTag: elemB.tagName
      });
      return;
    }

    // Compare Attributes
    const attrsA = elemA.attrs || {};
    const attrsB = elemB.attrs || {};

    const keysA = Object.keys(attrsA);
    const keysB = Object.keys(attrsB);

    for (const k of keysA) {
      if (!(k in attrsB)) {
        diffs.push({ path: `${path}/@${k}`, type: 'ATTR_REMOVED', attribute: k, oldValue: attrsA[k] });
      } else if (attrsA[k] !== attrsB[k]) {
        diffs.push({
          path: `${path}/@${k}`,
          type: 'ATTR_CHANGED',
          attribute: k,
          oldValue: attrsA[k],
          newValue: attrsB[k]
        });
      }
    }

    for (const k of keysB) {
      if (!(k in attrsA)) {
        diffs.push({ path: `${path}/@${k}`, type: 'ATTR_ADDED', attribute: k, newValue: attrsB[k] });
      }
    }

    // Compare direct text content
    const textA = options.ignoreWhitespace ? elemA.textContent.trim() : elemA.textContent;
    const textB = options.ignoreWhitespace ? elemB.textContent.trim() : elemB.textContent;

    if (elemA.children.length === 0 && elemB.children.length === 0) {
      if (textA !== textB) {
        diffs.push({
          path,
          type: 'TEXT_CHANGED',
          oldText: textA,
          newText: textB
        });
      }
      return;
    }

    // Compare child elements
    const childrenA = elemA.children;
    const childrenB = elemB.children;
    const maxChildren = Math.max(childrenA.length, childrenB.length);

    for (let i = 0; i < maxChildren; i++) {
      const childA = childrenA[i];
      const childB = childrenB[i];

      if (childA && !childB) {
        diffs.push({
          path: `${path}/${childA.tagName}[${i + 1}]`,
          type: 'ELEMENT_REMOVED',
          tag: childA.tagName
        });
      } else if (!childA && childB) {
        diffs.push({
          path: `${path}/${childB.tagName}[${i + 1}]`,
          type: 'ELEMENT_ADDED',
          tag: childB.tagName
        });
      } else {
        XmlComparator.#diffElements(childA, childB, `${path}/${childA.tagName}[${i + 1}]`, diffs, options);
      }
    }
  }
}
