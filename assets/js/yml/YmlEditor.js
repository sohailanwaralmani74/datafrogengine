/**
 * YmlEditor - Programmatic YAML modifier: property path setter/getter/deleter,
 * key reordering, sorting, array manipulation, and comments preservation awareness.
 */

import { YmlParser } from './YmlParser.js';
import { YmlSerializer } from './YmlSerializer.js';
import { JsonEditor } from '../json/JsonEditor.js';

export class YmlEditor {
  /**
   * Set a value at a dot-notated or JSON pointer path in YAML text or object
   * @param {string|object} yaml
   * @param {string} path e.g. "server.port" or "users[0].name"
   * @param {any} value
   * @param {object} [serializeOptions]
   * @returns {string|object}
   */
  static set(yaml, path, value, serializeOptions = {}) {
    const isString = typeof yaml === 'string';
    const data = isString ? YmlParser.parse(yaml) : yaml;

    JsonEditor.set(data, path, value);

    return isString ? YmlSerializer.serialize(data, serializeOptions) : data;
  }

  /**
   * Get value at path from YAML
   * @param {string|object} yaml
   * @param {string} path
   * @param {any} [defaultValue=undefined]
   * @returns {any}
   */
  static get(yaml, path, defaultValue = undefined) {
    const data = typeof yaml === 'string' ? YmlParser.parse(yaml) : yaml;
    return JsonEditor.get(data, path, defaultValue);
  }

  /**
   * Remove a property at path from YAML
   * @param {string|object} yaml
   * @param {string} path
   * @param {object} [serializeOptions]
   * @returns {string|object}
   */
  static remove(yaml, path, serializeOptions = {}) {
    const isString = typeof yaml === 'string';
    const data = isString ? YmlParser.parse(yaml) : yaml;

    JsonEditor.remove(data, path);

    return isString ? YmlSerializer.serialize(data, serializeOptions) : data;
  }

  /**
   * Reorder object keys in YAML text or data according to specified priority array
   * @param {string|object} yaml
   * @param {Array<string>} keyOrder
   * @param {boolean} [recursive=true]
   * @returns {string|object}
   */
  static reorderKeys(yaml, keyOrder, recursive = true) {
    const isString = typeof yaml === 'string';
    const data = isString ? YmlParser.parse(yaml) : yaml;

    const reordered = JsonEditor.reorderKeys(data, keyOrder, recursive);

    return isString ? YmlSerializer.serialize(reordered) : reordered;
  }

  /**
   * Alphabetically or custom sort keys in YAML
   * @param {string|object} yaml
   * @param {object} [options]
   * @returns {string|object}
   */
  static sortKeys(yaml, options = {}) {
    const isString = typeof yaml === 'string';
    const data = isString ? YmlParser.parse(yaml) : yaml;

    const sorted = JsonEditor.sortKeys(data, options);

    return isString ? YmlSerializer.serialize(sorted, options) : sorted;
  }

  /**
   * Merge one or more YAML strings/objects into a base YAML
   * @param {string|object} target
   * @param  {...any} sources
   * @returns {string|object}
   */
  static merge(target, ...sources) {
    const isString = typeof target === 'string';
    const targetObj = isString ? YmlParser.parse(target) : target;
    const parsedSources = sources.map(s => (typeof s === 'string' ? YmlParser.parse(s) : s));

    const merged = JsonEditor.deepMerge(targetObj, ...parsedSources);

    return isString ? YmlSerializer.serialize(merged) : merged;
  }
}
