/**
 * YmlConverter - Cross-format conversion between YAML, JSON, XML, CSV, and Markdown.
 */

import { YmlParser } from './YmlParser.js';
import { YmlSerializer } from './YmlSerializer.js';
import { JsonConverter } from '../json/JsonConverter.js';
import { XmlConverter } from '../xml/converter/XmlConverter.js';
import { CsvConverter } from '../csv/CsvConverter.js';

export class YmlConverter {
  /**
   * Convert YAML to JSON string or parsed object
   * @param {string} yamlText
   * @param {boolean} [asString=false]
   * @param {number} [space=2]
   * @returns {any}
   */
  static toJson(yamlText, asString = false, space = 2) {
    const data = YmlParser.parse(yamlText);
    return asString ? JSON.stringify(data, null, space) : data;
  }

  /**
   * Convert JSON string or object to YAML
   * @param {string|object} jsonData
   * @param {object} [options]
   * @returns {string}
   */
  static fromJson(jsonData, options = {}) {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    return YmlSerializer.serialize(data, options);
  }

  /**
   * Convert YAML to XML
   * @param {string} yamlText
   * @param {string} [rootTag='root']
   * @param {object} [options]
   * @returns {string}
   */
  static toXml(yamlText, rootTag = 'root', options = {}) {
    const data = YmlParser.parse(yamlText);
    return XmlConverter.fromJson(data, rootTag, options);
  }

  /**
   * Convert XML to YAML
   * @param {string} xmlText
   * @param {object} [options]
   * @returns {string}
   */
  static fromXml(xmlText, options = {}) {
    const data = XmlConverter.toJson(xmlText, options);
    return YmlSerializer.serialize(data, options);
  }

  /**
   * Convert tabular YAML to CSV
   * @param {string} yamlText
   * @param {object} [options]
   * @returns {string}
   */
  static toCsv(yamlText, options = {}) {
    const data = YmlParser.parse(yamlText);
    return CsvConverter.jsonToCsv(data, options);
  }

  /**
   * Convert CSV to YAML
   * @param {string} csvText
   * @param {object} [options]
   * @returns {string}
   */
  static fromCsv(csvText, options = {}) {
    const data = CsvConverter.csvToJson(csvText, options);
    return YmlSerializer.serialize(data, options);
  }

  /**
   * Convert YAML to formatted Markdown code block or table
   * @param {string} yamlText
   * @param {object} [options]
   * @returns {string}
   */
  static toMarkdown(yamlText, options = {}) {
    const data = YmlParser.parse(yamlText);
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      return CsvConverter.jsonToMarkdown(data);
    }
    return `\`\`\`yaml\n${yamlText.trim()}\n\`\`\``;
  }
}
