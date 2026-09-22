/**
 * XmlEngine - Master facade for the XML Processing Engine.
 * Unifies parsing, serialization, fluent building, querying/XPath, validation,
 * bidirectional JSON conversion, editing, reordering, diffing/comparing,
 * structural profiling, cleaning, and compression.
 */

import { XmlParser } from './parser/XmlParser.js';
import { XmlSaxParser } from './parser/XmlSaxParser.js';
import { XmlSerializer } from './serializer/XmlSerializer.js';
import { XmlBuilder } from './builder/XmlBuilder.js';
import { XmlQuery } from './query/XmlQuery.js';
import { XmlValidator } from './validator/XmlValidator.js';
import { XmlConverter } from './converter/XmlConverter.js';
import { XmlEditor } from './editor/XmlEditor.js';
import { XmlComparator } from './comparator/XmlComparator.js';
import { XmlAnalyzer } from './analyzer/XmlAnalyzer.js';
import { XmlCleaner } from './cleaner/XmlCleaner.js';
import { XmlCompressor } from './compressor/XmlCompressor.js';

export class XmlEngine {
  // Parsing & Serialization
  static parse(xmlString, options) {
    return XmlParser.parse(xmlString, options);
  }

  static stringify(documentOrNode, options) {
    return XmlSerializer.serialize(documentOrNode, options);
  }

  static serialize(documentOrNode, options) {
    return XmlSerializer.serialize(documentOrNode, options);
  }

  static builder() {
    return new XmlBuilder();
  }

  static saxParser(callbacks) {
    return new XmlSaxParser(callbacks);
  }

  // Querying & XPath
  static query(root, selector) {
    return XmlQuery.query(root, selector);
  }

  static queryAll(root, selector) {
    return XmlQuery.queryAll(root, selector);
  }

  static xpath(root, expression) {
    return XmlQuery.evaluateXPath(root, expression);
  }

  // Validation
  static validate(xmlString, options) {
    return XmlValidator.validate(xmlString, options);
  }

  // Bidirectional JSON Conversion
  static toJson(xml, options) {
    return XmlConverter.toJson(xml, options);
  }

  static fromJson(jsonObj, rootTag, options) {
    return XmlConverter.fromJson(jsonObj, rootTag, options);
  }

  // Programmatic Editing & Reordering
  static setText(target, selector, text) {
    return XmlEditor.setText(target, selector, text);
  }

  static setAttribute(target, selector, name, value) {
    return XmlEditor.setAttribute(target, selector, name, value);
  }

  static removeAttribute(target, selector, name) {
    return XmlEditor.removeAttribute(target, selector, name);
  }

  static renameTag(target, selector, newTagName) {
    return XmlEditor.renameTag(target, selector, newTagName);
  }

  static remove(target, selector) {
    return XmlEditor.remove(target, selector);
  }

  static reorderChildren(target, parentSelector, orderOrCompare) {
    return XmlEditor.reorderChildren(target, parentSelector, orderOrCompare);
  }

  // Diffing & Comparing
  static compare(xmlA, xmlB, options) {
    return XmlComparator.compare(xmlA, xmlB, options);
  }

  static diff(xmlA, xmlB, options) {
    return XmlComparator.compare(xmlA, xmlB, options);
  }

  // Structural Analysis & Profiling
  static analyze(xml) {
    return XmlAnalyzer.analyze(xml);
  }

  // Cleaning & Normalization
  static clean(xml, options) {
    return XmlCleaner.clean(xml, options);
  }

  static stripComments(xml) {
    return XmlCleaner.stripComments(xml);
  }

  static stripEmptyElements(xml) {
    return XmlCleaner.stripEmptyElements(xml);
  }

  // Compression & Minification
  static compress(xmlText, options) {
    return XmlCompressor.compress(xmlText, options);
  }

  static minify(xmlText, options) {
    return XmlCompressor.minify(xmlText, options);
  }
}
