import { XmlNodeType } from '../model/XmlNodeType.js';
import { XmlElement } from '../model/XmlElement.js';
import { XmlDocument } from '../model/XmlDocument.js';

/**
 * Fast, powerful XPath and CSS-like query selector engine for XML DOM trees.
 */
export class XmlQuery {
  /**
   * Evaluates a CSS selector or XPath query returning all matching elements.
   * @param {XmlNode} root
   * @param {string} selector
   * @returns {XmlElement[]}
   */
  static queryAll(root, selector) {
    if (!root || !selector) return [];
    const trimmed = selector.trim();

    // Check if XPath expression
    if (trimmed.startsWith('/') || trimmed.includes('/')) {
      return XmlQuery.evaluateXPath(root, trimmed);
    }

    return XmlQuery.selectCss(root, trimmed);
  }

  /**
   * Evaluates query returning first matching element or null.
   * @param {XmlNode} root
   * @param {string} selector
   * @returns {XmlElement|null}
   */
  static query(root, selector) {
    const all = XmlQuery.queryAll(root, selector);
    return all.length > 0 ? all[0] : null;
  }

  /**
   * XPath 1.0 subset evaluator.
   * Supports: //tag, /tag, /tag/child, //tag[@attr="val"], //tag[1], etc.
   * @param {XmlNode} root
   * @param {string} xpath
   * @returns {XmlElement[]}
   */
  static evaluateXPath(root, xpath) {
    let currentNodes = [root];

    // Handle starting root or deep search
    let path = xpath.trim();
    if (path.startsWith('//')) {
      const allDescendants = [];
      const collect = (n) => {
        if (n.nodeType === XmlNodeType.ELEMENT) allDescendants.push(n);
        if (n.childNodes) {
          for (const c of n.childNodes) collect(c);
        }
      };
      collect(root);
      currentNodes = allDescendants;
      path = path.slice(2);
    } else if (path.startsWith('/')) {
      path = path.slice(1);
    }

    const segments = path.split('/').filter(Boolean);

    for (const segment of segments) {
      if (segment === '.') continue;
      if (segment === '..') {
        currentNodes = currentNodes
          .map((n) => n.parentNode)
          .filter((n) => n && n.nodeType === XmlNodeType.ELEMENT);
        continue;
      }

      // Parse step: tag[predicate]
      const predMatch = segment.match(/^([^\[]+)(?:\[(.*)\])?$/);
      if (!predMatch) continue;

      const tagName = predMatch[1].trim();
      const predicate = predMatch[2] ? predMatch[2].trim() : null;

      let nextNodes = [];

      for (const node of currentNodes) {
        const candidates =
          node.nodeType === XmlNodeType.DOCUMENT
            ? [node.documentElement].filter(Boolean)
            : node.children || [];

        for (const candidate of candidates) {
          if (XmlQuery.matchesTagName(candidate, tagName)) {
            nextNodes.push(candidate);
          }
        }
      }

      if (predicate) {
        nextNodes = XmlQuery.filterByPredicate(nextNodes, predicate);
      }

      currentNodes = nextNodes;
    }

    return currentNodes;
  }

  /**
   * CSS selector matching.
   * @param {XmlNode} root
   * @param {string} selector
   * @returns {XmlElement[]}
   */
  static selectCss(root, selector) {
    // Comma-separated selectors
    if (selector.includes(',')) {
      const parts = selector.split(',').map((s) => s.trim());
      const set = new Set();
      for (const part of parts) {
        for (const match of XmlQuery.selectCss(root, part)) {
          set.add(match);
        }
      }
      return Array.from(set);
    }

    // Direct descendant '>' vs ancestor ' '
    const tokens = selector.split(/\s*([> ])\s*/).filter(Boolean);
    let currentNodes = [root];

    let op = ' '; // default ancestor
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok === '>') {
        op = '>';
        continue;
      }
      if (tok === ' ') {
        op = ' ';
        continue;
      }

      const nextNodes = [];
      for (const node of currentNodes) {
        if (op === '>') {
          const children =
            node.nodeType === XmlNodeType.DOCUMENT
              ? [node.documentElement].filter(Boolean)
              : node.children || [];
          for (const ch of children) {
            if (XmlQuery.matchesSimpleSelector(ch, tok)) {
              nextNodes.push(ch);
            }
          }
        } else {
          // Descendant search
          const allDesc =
            node.nodeType === XmlNodeType.DOCUMENT
              ? node.getElementsByTagName('*')
              : node.getElementsByTagName('*');
          for (const d of allDesc) {
            if (XmlQuery.matchesSimpleSelector(d, tok)) {
              nextNodes.push(d);
            }
          }
        }
      }
      currentNodes = nextNodes;
      op = ' '; // reset
    }

    return currentNodes;
  }

  static matchesSimpleSelector(elem, selector) {
    if (elem.nodeType !== XmlNodeType.ELEMENT) return false;

    // Attribute selector [attr=val]
    const attrMatch = selector.match(/^([^\[]*?)\[(.*?)\]$/);
    let base = selector;
    let attrExpr = null;
    if (attrMatch) {
      base = attrMatch[1];
      attrExpr = attrMatch[2];
    }

    // ID selector #id
    if (base.includes('#')) {
      const [tag, id] = base.split('#');
      if (tag && !XmlQuery.matchesTagName(elem, tag)) return false;
      if (elem.id !== id) return false;
    }
    // Class selector .class
    else if (base.includes('.')) {
      const [tag, cls] = base.split('.');
      if (tag && !XmlQuery.matchesTagName(elem, tag)) return false;
      const classes = elem.className.split(/\s+/);
      if (!classes.includes(cls)) return false;
    }
    // Plain tag name
    else if (base && base !== '*') {
      if (!XmlQuery.matchesTagName(elem, base)) return false;
    }

    // Evaluate attribute expression
    if (attrExpr) {
      return XmlQuery.matchesAttributeExpr(elem, attrExpr);
    }

    return true;
  }

  static matchesAttributeExpr(elem, expr) {
    const cleanExpr = expr.startsWith('@') ? expr.slice(1) : expr;

    // [attr=val] or [attr="val"]
    const eqMatch = cleanExpr.match(/^([a-zA-Z0-9_\-.:]+)\s*([~|^$*]?=)\s*["']?([^"']*)["']?$/);
    if (eqMatch) {
      const [, attr, op, expected] = eqMatch;
      const val = elem.getAttribute(attr);
      if (val === null) return false;

      switch (op) {
        case '=':
          return val === expected;
        case '^=':
          return val.startsWith(expected);
        case '$=':
          return val.endsWith(expected);
        case '*=':
          return val.includes(expected);
        default:
          return val === expected;
      }
    }

    // Simple existence [attr]
    return elem.hasAttribute(cleanExpr);
  }

  static matchesTagName(elem, target) {
    if (target === '*') return true;
    const cleanTarget = target.includes(':') ? target.split(':')[1] : target;
    return elem.tagName === target || elem.localName === cleanTarget;
  }

  static filterByPredicate(nodes, pred) {
    // Positional index 1-based [1], [last()]
    if (/^\d+$/.test(pred)) {
      const idx = parseInt(pred, 10) - 1;
      return nodes[idx] ? [nodes[idx]] : [];
    }
    if (pred === 'last()') {
      return nodes.length > 0 ? [nodes[nodes.length - 1]] : [];
    }

    // [@attr="val"] or [@attr]
    if (pred.startsWith('@')) {
      return nodes.filter((n) => XmlQuery.matchesAttributeExpr(n, pred.slice(1)));
    }

    // text()="val"
    const textMatch = pred.match(/^text\(\)\s*=\s*["'](.*)["']$/);
    if (textMatch) {
      const exp = textMatch[1];
      return nodes.filter((n) => n.textContent.trim() === exp);
    }

    return nodes;
  }
}

// Wire querySelector / querySelectorAll onto XmlElement and XmlDocument
XmlElement.prototype.querySelector = function (sel) {
  return XmlQuery.query(this, sel);
};

XmlElement.prototype.querySelectorAll = function (sel) {
  return XmlQuery.queryAll(this, sel);
};

XmlDocument.prototype.querySelector = function (sel) {
  return XmlQuery.query(this, sel);
};

XmlDocument.prototype.querySelectorAll = function (sel) {
  return XmlQuery.queryAll(this, sel);
};
