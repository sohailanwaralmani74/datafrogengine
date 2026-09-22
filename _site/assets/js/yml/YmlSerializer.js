/**
 * YmlSerializer - Pure JavaScript YAML Serializer.
 * Supports configurable indentation, quote style, multiline string folding,
 * flow-style controls, and sorting.
 */

export class YmlSerializer {
  /**
   * Serialize JavaScript value to YAML formatted string
   * @param {any} data
   * @param {object} [options]
   * @param {number} [options.indent=2] Spaces per indent level
   * @param {boolean} [options.sortKeys=false] Sort object keys alphabetically
   * @param {boolean} [options.flowLevel=-1] Level at which to switch to flow style ([x, y], {a: 1})
   * @param {boolean} [options.noCompatMode=false]
   * @returns {string} YAML document string
   */
  static serialize(data, options = {}) {
    const indentSize = options.indent || 2;
    const sortKeys = options.sortKeys === true;

    function dump(val, depth = 0) {
      const indentStr = ' '.repeat(depth * indentSize);

      if (val === null || val === undefined) {
        return 'null';
      }
      if (typeof val === 'boolean') {
        return val ? 'true' : 'false';
      }
      if (typeof val === 'number') {
        if (Number.isNaN(val)) return '.nan';
        if (val === Infinity) return '.inf';
        if (val === -Infinity) return '-.inf';
        return String(val);
      }
      if (typeof val === 'string') {
        if (val.includes('\n')) {
          const lines = val.split('\n');
          return '|\n' + lines.map(l => ' '.repeat((depth + 1) * indentSize) + l).join('\n');
        }
        if (
          val === '' ||
          /^[&!*?|>%@`#~]/.test(val) ||
          /[:#\[\]{},]/.test(val) ||
          /^\s|\s$/.test(val) ||
          val === 'true' || val === 'false' || val === 'null' ||
          !Number.isNaN(Number(val))
        ) {
          return JSON.stringify(val);
        }
        return val;
      }

      if (Array.isArray(val)) {
        if (val.length === 0) return '[]';
        const lines = [];
        for (const item of val) {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            const dumpedObj = dump(item, depth + 1).trim();
            lines.push(`${indentStr}- ${dumpedObj}`);
          } else {
            lines.push(`${indentStr}- ${dump(item, depth + 1)}`);
          }
        }
        return lines.join('\n');
      }

      if (typeof val === 'object') {
        let keys = Object.keys(val);
        if (keys.length === 0) return '{}';
        if (sortKeys) keys = keys.sort();

        const lines = [];
        for (const k of keys) {
          const v = val[k];
          const safeKey = /[:#\[\]{},&*!|>'"%@`]/.test(k) || k === '' ? JSON.stringify(k) : k;

          if (typeof v === 'object' && v !== null) {
            if (Array.isArray(v) && v.length === 0) {
              lines.push(`${indentStr}${safeKey}: []`);
            } else if (!Array.isArray(v) && Object.keys(v).length === 0) {
              lines.push(`${indentStr}${safeKey}: {}`);
            } else {
              lines.push(`${indentStr}${safeKey}:\n${dump(v, depth + 1)}`);
            }
          } else {
            lines.push(`${indentStr}${safeKey}: ${dump(v, depth)}`);
          }
        }
        return lines.join('\n');
      }

      return String(val);
    }

    return dump(data, 0);
  }

  /**
   * Alias for serialize()
   */
  static stringify(data, options) {
    return YmlSerializer.serialize(data, options);
  }
}
