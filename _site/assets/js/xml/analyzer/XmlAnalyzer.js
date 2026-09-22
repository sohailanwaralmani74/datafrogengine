/**
 * XmlAnalyzer - Statistical profiling, structural metrics, tag frequency,
 * depth analysis, and anomaly detection for XML documents.
 */

import { XmlParser } from '../parser/XmlParser.js';
import { XmlDocument } from '../model/XmlDocument.js';
import { XmlNodeType } from '../model/XmlNodeType.js';

export class XmlAnalyzer {
  /**
   * Profiles and analyzes an XML document or string
   * @param {string|XmlDocument} xml
   * @returns {object} Comprehensive analysis report
   */
  static analyze(xml) {
    const doc = typeof xml === 'string' ? XmlParser.parse(xml) : xml;
    const root = doc.documentElement;

    if (!root) {
      return {
        elementCount: 0,
        maxDepth: 0,
        tagFrequencies: {},
        attributeFrequencies: {},
        namespaces: [],
        anomalies: []
      };
    }

    let elementCount = 0;
    let textNodeCount = 0;
    let commentCount = 0;
    let cdataCount = 0;
    let maxDepth = 0;

    const tagFrequencies = {};
    const attributeFrequencies = {};
    const namespaces = new Set();
    const anomalies = [];

    const traverse = (node, depth) => {
      if (depth > maxDepth) maxDepth = depth;

      if (node.nodeType === XmlNodeType.ELEMENT) {
        elementCount++;
        tagFrequencies[node.tagName] = (tagFrequencies[node.tagName] || 0) + 1;

        if (node.prefix) {
          namespaces.add(node.prefix);
        }

        const attrs = node.attrs || {};
        for (const attrName of Object.keys(attrs)) {
          attributeFrequencies[attrName] = (attributeFrequencies[attrName] || 0) + 1;
        }

        // Anomaly checks
        if (node.children.length === 0 && (!node.textContent || node.textContent.trim() === '')) {
          anomalies.push({
            type: 'EMPTY_ELEMENT',
            tag: node.tagName,
            message: `Element <${node.tagName}> is completely empty`
          });
        }

        if (depth > 20) {
          anomalies.push({
            type: 'DEEP_NESTING',
            tag: node.tagName,
            depth,
            message: `Element <${node.tagName}> exceeds nesting depth of 20`
          });
        }
      } else if (node.nodeType === XmlNodeType.TEXT) {
        if (node.nodeValue && node.nodeValue.trim().length > 0) {
          textNodeCount++;
        }
      } else if (node.nodeType === XmlNodeType.COMMENT) {
        commentCount++;
      } else if (node.nodeType === XmlNodeType.CDATA) {
        cdataCount++;
      }

      if (node.childNodes) {
        for (const child of node.childNodes) {
          traverse(child, depth + 1);
        }
      }
    };

    traverse(root, 1);

    return {
      rootTag: root.tagName,
      elementCount,
      textNodeCount,
      commentCount,
      cdataCount,
      maxDepth,
      distinctTagsCount: Object.keys(tagFrequencies).length,
      tagFrequencies,
      distinctAttributesCount: Object.keys(attributeFrequencies).length,
      attributeFrequencies,
      namespaces: Array.from(namespaces),
      anomalies
    };
  }
}
