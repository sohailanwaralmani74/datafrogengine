/**
 * Pure JavaScript JSON Editor & Patch Engine
 * Supports path-based access, RFC 6902 JSON Patch, flattening/unflattening,
 * deep merge, key renaming, and transformations.
 */

export class JsonEditor {
  /**
   * Parse path into segment array (supports dot-notation 'a.b[0].c' and JSON Pointer '/a/b/0/c')
   */
  static parsePath(path) {
    if (Array.isArray(path)) return path;
    if (typeof path !== 'string' || path === '') return [];

    // JSON Pointer format: starts with '/'
    if (path.startsWith('/')) {
      return path
        .split('/')
        .slice(1)
        .map(seg => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
    }

    // Dot and bracket notation: a.b[0].c or ['a']['b']
    const segments = [];
    let current = '';
    let inBracket = false;

    for (let i = 0; i < path.length; i++) {
      const char = path[i];

      if (char === '[' && !inBracket) {
        if (current) {
          segments.push(current);
          current = '';
        }
        inBracket = true;
      } else if (char === ']' && inBracket) {
        if (current) {
          // Remove potential wrapping quotes
          const unquoted = current.replace(/^['"]|['"]$/g, '');
          segments.push(unquoted);
          current = '';
        }
        inBracket = false;
      } else if (char === '.' && !inBracket) {
        if (current) {
          segments.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      segments.push(current);
    }

    return segments;
  }

  /**
   * Deep clone data
   */
  static clone(data) {
    if (data === null || typeof data !== 'object') return data;
    if (data instanceof Date) return new Date(data.getTime());
    if (Array.isArray(data)) return data.map(item => JsonEditor.clone(item));
    const copy = {};
    for (const key of Object.keys(data)) {
      copy[key] = JsonEditor.clone(data[key]);
    }
    return copy;
  }

  /**
   * Get value at specified path
   */
  static get(obj, path, defaultValue = undefined) {
    const segments = JsonEditor.parsePath(path);
    if (segments.length === 0) return obj !== undefined ? obj : defaultValue;

    let curr = obj;
    for (const seg of segments) {
      if (curr === null || curr === undefined || typeof curr !== 'object') {
        return defaultValue;
      }
      curr = curr[seg];
    }

    return curr !== undefined ? curr : defaultValue;
  }

  /**
   * Check if path exists in object
   */
  static has(obj, path) {
    const segments = JsonEditor.parsePath(path);
    if (segments.length === 0) return true;

    let curr = obj;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (curr === null || curr === undefined || typeof curr !== 'object') {
        return false;
      }
      if (!(seg in curr)) {
        return false;
      }
      curr = curr[seg];
    }
    return true;
  }

  /**
   * Set value at path (creates intermediate objects/arrays as needed)
   */
  static set(obj, path, value, options = { immutable: false }) {
    const target = options.immutable ? JsonEditor.clone(obj) : obj;
    const segments = JsonEditor.parsePath(path);
    if (segments.length === 0) return value;

    let curr = target;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const nextSeg = segments[i + 1];

      if (curr[seg] === undefined || curr[seg] === null || typeof curr[seg] !== 'object') {
        // Infer array or object based on next key
        const isNextIndex = /^\d+$/.test(nextSeg);
        curr[seg] = isNextIndex ? [] : {};
      }
      curr = curr[seg];
    }

    const lastSeg = segments[segments.length - 1];
    if (Array.isArray(curr) && lastSeg === '-') {
      curr.push(value);
    } else {
      curr[lastSeg] = value;
    }

    return target;
  }

  /**
   * Delete value at path
   */
  static delete(obj, path, options = { immutable: false }) {
    const target = options.immutable ? JsonEditor.clone(obj) : obj;
    const segments = JsonEditor.parsePath(path);
    if (segments.length === 0) return target;

    let curr = target;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (curr === null || curr === undefined || typeof curr !== 'object') {
        return target;
      }
      curr = curr[seg];
    }

    const lastSeg = segments[segments.length - 1];
    if (Array.isArray(curr)) {
      const idx = parseInt(lastSeg, 10);
      if (!isNaN(idx) && idx >= 0 && idx < curr.length) {
        curr.splice(idx, 1);
      }
    } else if (curr && typeof curr === 'object') {
      delete curr[lastSeg];
    }

    return target;
  }

  /**
   * Apply RFC 6902 JSON Patch operations to document
   */
  static applyPatch(doc, patch, options = { immutable: true }) {
    let target = options.immutable ? JsonEditor.clone(doc) : doc;
    if (!Array.isArray(patch)) {
      throw new Error('JSON Patch must be an array of operation objects');
    }

    for (const op of patch) {
      const { op: action, path, value, from } = op;

      switch (action) {
        case 'add': {
          target = JsonEditor.set(target, path, value);
          break;
        }
        case 'remove': {
          target = JsonEditor.delete(target, path);
          break;
        }
        case 'replace': {
          if (!JsonEditor.has(target, path)) {
            throw new Error(`JSON Patch replace failed: path '${path}' does not exist`);
          }
          target = JsonEditor.set(target, path, value);
          break;
        }
        case 'move': {
          const val = JsonEditor.get(target, from);
          if (val === undefined) {
            throw new Error(`JSON Patch move failed: from path '${from}' does not exist`);
          }
          target = JsonEditor.delete(target, from);
          target = JsonEditor.set(target, path, val);
          break;
        }
        case 'copy': {
          const val = JsonEditor.get(target, from);
          if (val === undefined) {
            throw new Error(`JSON Patch copy failed: from path '${from}' does not exist`);
          }
          target = JsonEditor.set(target, path, JsonEditor.clone(val));
          break;
        }
        case 'test': {
          const actual = JsonEditor.get(target, path);
          if (JSON.stringify(actual) !== JSON.stringify(value)) {
            throw new Error(`JSON Patch test failed at path '${path}': expected ${JSON.stringify(value)} but found ${JSON.stringify(actual)}`);
          }
          break;
        }
        default:
          throw new Error(`Unsupported JSON Patch operation: '${action}'`);
      }
    }

    return target;
  }

  /**
   * Generate minimal RFC 6902 JSON Patch between two states
   */
  static createPatch(source, target, basePath = '') {
    const patch = [];

    const diff = (src, tgt, currentPath) => {
      if (src === tgt) return;

      if (typeof src !== typeof tgt || src === null || tgt === null || Array.isArray(src) !== Array.isArray(tgt)) {
        patch.push({ op: 'replace', path: currentPath || '/', value: tgt });
        return;
      }

      if (Array.isArray(src) && Array.isArray(tgt)) {
        if (src.length === tgt.length) {
          for (let i = 0; i < src.length; i++) {
            diff(src[i], tgt[i], `${currentPath}/${i}`);
          }
        } else {
          patch.push({ op: 'replace', path: currentPath || '/', value: tgt });
        }
        return;
      }

      if (typeof src === 'object' && typeof tgt === 'object') {
        const srcKeys = new Set(Object.keys(src));
        const tgtKeys = new Set(Object.keys(tgt));

        // Removed keys
        for (const k of srcKeys) {
          if (!tgtKeys.has(k)) {
            patch.push({ op: 'remove', path: `${currentPath}/${k}` });
          }
        }

        // Added or changed keys
        for (const k of tgtKeys) {
          const path = `${currentPath}/${k}`;
          if (!srcKeys.has(k)) {
            patch.push({ op: 'add', path, value: tgt[k] });
          } else {
            diff(src[k], tgt[k], path);
          }
        }
        return;
      }

      // Primitive change
      patch.push({ op: 'replace', path: currentPath || '/', value: tgt });
    };

    diff(source, target, basePath);
    return patch;
  }

  /**
   * Flatten nested JSON object into key-value map with dot or slash paths
   */
  static flatten(obj, delimiter = '.') {
    const result = {};

    const recurse = (curr, prefix) => {
      if (curr === null || typeof curr !== 'object') {
        result[prefix] = curr;
        return;
      }

      if (Array.isArray(curr)) {
        if (curr.length === 0) {
          result[prefix] = [];
          return;
        }
        curr.forEach((item, idx) => {
          const path = prefix ? `${prefix}${delimiter}${idx}` : String(idx);
          recurse(item, path);
        });
        return;
      }

      const keys = Object.keys(curr);
      if (keys.length === 0) {
        result[prefix] = {};
        return;
      }

      keys.forEach(key => {
        const path = prefix ? `${prefix}${delimiter}${key}` : key;
        recurse(curr[key], path);
      });
    };

    recurse(obj, '');
    return result;
  }

  /**
   * Unflatten flat key-value map back into nested object/array
   */
  static unflatten(flatObj, delimiter = '.') {
    const result = {};

    Object.keys(flatObj).forEach(path => {
      const parts = path.split(delimiter);
      let curr = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const nextPart = parts[i + 1];

        if (!curr[part] || typeof curr[part] !== 'object') {
          curr[part] = /^\d+$/.test(nextPart) ? [] : {};
        }
        curr = curr[part];
      }

      const last = parts[parts.length - 1];
      curr[last] = flatObj[path];
    });

    return result;
  }

  /**
   * Rename keys in JSON object
   */
  static renameKey(obj, oldKey, newKey, recursive = true) {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => (recursive ? JsonEditor.renameKey(item, oldKey, newKey, recursive) : item));
    }

    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      const keyToUse = k === oldKey ? newKey : k;
      result[keyToUse] = recursive && typeof v === 'object' && v !== null
        ? JsonEditor.renameKey(v, oldKey, newKey, recursive)
        : v;
    }
    return result;
  }

  /**
   * Deep merge multiple objects
   */
  static deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (target && source && typeof target === 'object' && typeof source === 'object') {
      if (Array.isArray(target) && Array.isArray(source)) {
        target.push(...source);
      } else {
        for (const key of Object.keys(source)) {
          if (source[key] && typeof source[key] === 'object') {
            if (!target[key]) target[key] = Array.isArray(source[key]) ? [] : {};
            JsonEditor.deepMerge(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
      }
    }

    return JsonEditor.deepMerge(target, ...sources);
  }

  /**
   * Reorder object keys according to an array order, optionally recursive
   * @param {object} obj
   * @param {Array<string>} keyOrder
   * @param {boolean} [recursive=true]
   * @returns {object}
   */
  static reorderKeys(obj, keyOrder, recursive = true) {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => (recursive ? JsonEditor.reorderKeys(item, keyOrder, recursive) : item));
    }

    const result = {};
    const existingKeys = Object.keys(obj);
    const keySet = new Set(existingKeys);

    // Add keys in specified order if present
    for (const key of keyOrder) {
      if (keySet.has(key)) {
        result[key] = recursive && typeof obj[key] === 'object' && obj[key] !== null
          ? JsonEditor.reorderKeys(obj[key], keyOrder, recursive)
          : obj[key];
        keySet.delete(key);
      }
    }

    // Add remaining keys
    for (const key of existingKeys) {
      if (keySet.has(key)) {
        result[key] = recursive && typeof obj[key] === 'object' && obj[key] !== null
          ? JsonEditor.reorderKeys(obj[key], keyOrder, recursive)
          : obj[key];
      }
    }

    return result;
  }

  /**
   * Alphabetically or custom sort keys of an object recursively
   * @param {object} obj
   * @param {object} [options]
   * @param {boolean} [options.reverse=false]
   * @param {boolean} [options.recursive=true]
   * @returns {object}
   */
  static sortKeys(obj, options = {}) {
    if (obj === null || typeof obj !== 'object') return obj;

    const reverse = options.reverse === true;
    const recursive = options.recursive !== false;

    if (Array.isArray(obj)) {
      return obj.map(item => (recursive ? JsonEditor.sortKeys(item, options) : item));
    }

    const sortedKeys = Object.keys(obj).sort((a, b) => (reverse ? b.localeCompare(a) : a.localeCompare(b)));
    const result = {};

    for (const key of sortedKeys) {
      result[key] = recursive && typeof obj[key] === 'object' && obj[key] !== null
        ? JsonEditor.sortKeys(obj[key], options)
        : obj[key];
    }

    return result;
  }
}

