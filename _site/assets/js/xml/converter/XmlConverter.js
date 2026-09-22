import { XmlParser } from '../parser/XmlParser.js';
import { XmlDocument } from '../model/XmlDocument.js';
import { XmlElement } from '../model/XmlElement.js';
import { XmlText } from '../model/XmlText.js';
import { XmlCData } from '../model/XmlMiscNodes.js';
import { XmlNodeType } from '../model/XmlNodeType.js';
import { XmlSerializer } from '../serializer/XmlSerializer.js';

/**
 * Bidirectional XML <-> JSON converter.
 * Bridges XML document trees and structured JavaScript objects.
 */
export class XmlConverter {
  /**
   * Converts XML string or XmlDocument to a JavaScript object.
   * @param {string|XmlDocument|XmlElement} xml
   * @param {object} [options]
   * @param {string} [options.attributePrefix='@']
   * @param {string} [options.textProperty='#text']
   * @param {boolean} [options.coerceTypes=true]
   * @returns {any}
   */
  static toJson(xml, options = {}) {
    const opts = {
      attributePrefix: '@',
      textProperty: '#text',
      coerceTypes: true,
      ...options
    };

    let rootElement = null;
    if (typeof xml === 'string') {
      const doc = XmlParser.parse(xml);
      rootElement = doc.documentElement;
    } else if (xml instanceof XmlDocument) {
      rootElement = xml.documentElement;
    } else if (xml instanceof XmlElement) {
      rootElement = xml;
    }

    if (!rootElement) return null;

    const result = {};
    result[rootElement.tagName] = XmlConverter.elementToObject(rootElement, opts);
    return result;
  }

  static elementToObject(elem, opts) {
    const obj = {};
    let hasAttributes = false;

    // Attributes
    for (const [name, val] of elem._attributes.entries()) {
      hasAttributes = true;
      const key = `${opts.attributePrefix}${name}`;
      obj[key] = opts.coerceTypes ? XmlConverter.coerce(val) : val;
    }

    const children = elem.children;

    // Leaf element with only text
    if (children.length === 0) {
      const text = elem.textContent.trim();
      if (!hasAttributes) {
        return opts.coerceTypes ? XmlConverter.coerce(text) : text;
      }
      if (text.length > 0) {
        obj[opts.textProperty] = opts.coerceTypes ? XmlConverter.coerce(text) : text;
      }
      return obj;
    }

    // Process child elements
    for (const child of children) {
      const childVal = XmlConverter.elementToObject(child, opts);
      const tag = child.tagName;

      if (obj[tag] === undefined) {
        obj[tag] = childVal;
      } else if (Array.isArray(obj[tag])) {
        obj[tag].push(childVal);
      } else {
        obj[tag] = [obj[tag], childVal];
      }
    }

    return obj;
  }

  static coerce(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    if (/^-?\d+$/.test(val)) {
      const num = parseInt(val, 10);
      if (!Number.isNaN(num)) return num;
    }
    if (/^-?\d+\.\d+$/.test(val)) {
      const num = parseFloat(val);
      if (!Number.isNaN(num)) return num;
    }
    return val;
  }

  /**
   * Converts a JavaScript/JSON object into an XmlDocument or XML string.
   * @param {object} json
   * @param {string} [rootTagName='root']
   * @param {object} [options]
   * @param {string} [options.attributePrefix='@']
   * @param {string} [options.textProperty='#text']
   * @param {number|string} [options.indent=2]
   * @param {boolean} [options.asString=true]
   * @returns {XmlDocument|string}
   */
  static fromJson(json, rootTagName = 'root', options = {}) {
    const opts = {
      attributePrefix: '@',
      textProperty: '#text',
      indent: 2,
      asString: true,
      ...options
    };

    const doc = new XmlDocument();

    // If json has a single key matching root
    let rootKey = rootTagName;
    let rootValue = json;

    if (json && typeof json === 'object' && !Array.isArray(json)) {
      const keys = Object.keys(json);
      if (keys.length === 1 && typeof json[keys[0]] === 'object') {
        rootKey = keys[0];
        rootValue = json[rootKey];
      }
    }

    const rootElem = doc.createElement(rootKey);
    XmlConverter.populateElement(rootElem, rootValue, opts, doc);
    doc.appendChild(rootElem);

    if (opts.asString) {
      return XmlSerializer.serializeToString(doc, { indent: opts.indent });
    }
    return doc;
  }

  static populateElement(elem, value, opts, doc) {
    if (value === null || value === undefined) return;

    if (typeof value !== 'object') {
      elem.appendChild(doc.createTextNode(String(value)));
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        XmlConverter.populateElement(elem, item, opts, doc);
      }
      return;
    }

    for (const [key, val] of Object.entries(value)) {
      // Attribute
      if (key.startsWith(opts.attributePrefix)) {
        const attrName = key.slice(opts.attributePrefix.length);
        elem.setAttribute(attrName, String(val));
      }
      // Text content
      else if (key === opts.textProperty) {
        elem.appendChild(doc.createTextNode(String(val)));
      }
      // CDATA
      else if (key === '#cdata' || key === '_cdata') {
        elem.appendChild(doc.createCData(String(val)));
      }
      // Child elements
      else if (Array.isArray(val)) {
        for (const item of val) {
          const childElem = doc.createElement(key);
          XmlConverter.populateElement(childElem, item, opts, doc);
          elem.appendChild(childElem);
        }
      } else {
        const childElem = doc.createElement(key);
        XmlConverter.populateElement(childElem, val, opts, doc);
        elem.appendChild(childElem);
      }
    }
  }
}

// Bind onto XmlDocument
XmlDocument.prototype.toJson = function (options) {
  return XmlConverter.toJson(this, options);
};
XmlDocument.fromJson = function (json, rootTag, options) {
  return XmlConverter.fromJson(json, rootTag, options);
};
XmlDocument.parse = function (xmlString, options) {
  return XmlParser.parse(xmlString, options);
};
