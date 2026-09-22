/**
 * Pure JavaScript JSON Analyzer & Schema Inferer
 * Profiles payload metrics, type distributions, detects anomalies,
 * and automatically synthesizes JSON Schema from arbitrary data.
 */

export class JsonAnalyzer {
  /**
   * Run comprehensive structural and statistical analysis on JSON data
   */
  static analyze(data) {
    const rawString = JSON.stringify(data);
    const minifiedString = JSON.stringify(data);
    const formattedString = JSON.stringify(data, null, 2);

    const metrics = {
      size: {
        rawBytes: new TextEncoder().encode(rawString).length,
        minifiedBytes: new TextEncoder().encode(minifiedString).length,
        formattedBytes: new TextEncoder().encode(formattedString).length
      },
      counts: {
        totalNodes: 0,
        objects: 0,
        arrays: 0,
        strings: 0,
        numbers: 0,
        booleans: 0,
        nulls: 0
      },
      keys: {
        total: 0,
        unique: 0,
        names: new Set()
      },
      depth: {
        max: 0
      },
      numbers: {
        count: 0,
        min: Infinity,
        max: -Infinity,
        sum: 0,
        mean: 0
      },
      strings: {
        count: 0,
        totalLength: 0,
        avgLength: 0,
        formats: {
          emails: 0,
          urls: 0,
          dates: 0,
          uuids: 0
        }
      }
    };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const urlRegex = /^[a-zA-Z][a-zA-Z0-9+-.]*:\/\/[^\s/$.?#].[^\s]*$/;
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

    const walk = (node, currentDepth) => {
      metrics.counts.totalNodes++;
      if (currentDepth > metrics.depth.max) {
        metrics.depth.max = currentDepth;
      }

      if (node === null) {
        metrics.counts.nulls++;
        return;
      }

      const type = typeof node;

      if (type === 'boolean') {
        metrics.counts.booleans++;
      } else if (type === 'number') {
        metrics.counts.numbers++;
        metrics.numbers.count++;
        metrics.numbers.sum += node;
        if (node < metrics.numbers.min) metrics.numbers.min = node;
        if (node > metrics.numbers.max) metrics.numbers.max = node;
      } else if (type === 'string') {
        metrics.counts.strings++;
        metrics.strings.count++;
        metrics.strings.totalLength += node.length;

        if (emailRegex.test(node)) metrics.strings.formats.emails++;
        if (urlRegex.test(node)) metrics.strings.formats.urls++;
        if (uuidRegex.test(node)) metrics.strings.formats.uuids++;
        if (!isNaN(Date.parse(node)) && (node.includes('-') || node.includes('/'))) {
          metrics.strings.formats.dates++;
        }
      } else if (Array.isArray(node)) {
        metrics.counts.arrays++;
        for (let i = 0; i < node.length; i++) {
          walk(node[i], currentDepth + 1);
        }
      } else if (type === 'object') {
        metrics.counts.objects++;
        const keys = Object.keys(node);
        metrics.keys.total += keys.length;

        for (const key of keys) {
          metrics.keys.names.add(key);
          walk(node[key], currentDepth + 1);
        }
      }
    };

    walk(data, 1);

    metrics.keys.unique = metrics.keys.names.size;
    metrics.keys.names = Array.from(metrics.keys.names);

    if (metrics.numbers.count > 0) {
      metrics.numbers.mean = metrics.numbers.sum / metrics.numbers.count;
    } else {
      metrics.numbers.min = 0;
      metrics.numbers.max = 0;
    }

    if (metrics.strings.count > 0) {
      metrics.strings.avgLength = metrics.strings.totalLength / metrics.strings.count;
    }

    return metrics;
  }

  /**
   * Infer JSON Schema Draft-07 from arbitrary data
   */
  static inferSchema(data, options = {}) {
    const { title = 'InferredSchema' } = options;

    const buildSchema = (val) => {
      if (val === null) {
        return { type: 'null' };
      }

      const type = typeof val;

      if (type === 'boolean') {
        return { type: 'boolean' };
      }

      if (type === 'number') {
        return Number.isInteger(val) ? { type: 'integer' } : { type: 'number' };
      }

      if (type === 'string') {
        const sch = { type: 'string' };
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) sch.format = 'email';
        else if (/^[a-zA-Z][a-zA-Z0-9+-.]*:\/\/[^\s/$.?#].[^\s]*$/.test(val)) sch.format = 'uri';
        else if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(val)) sch.format = 'uuid';
        else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) sch.format = 'date';
        else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) sch.format = 'date-time';
        return sch;
      }

      if (Array.isArray(val)) {
        if (val.length === 0) {
          return { type: 'array', items: {} };
        }
        // Merge schemas of items
        const itemSchemas = val.slice(0, 50).map(item => buildSchema(item));
        const mergedItems = mergeItemSchemas(itemSchemas);
        return {
          type: 'array',
          items: mergedItems
        };
      }

      if (type === 'object') {
        const properties = {};
        const required = Object.keys(val);

        for (const key of Object.keys(val)) {
          properties[key] = buildSchema(val[key]);
        }

        return {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
          additionalProperties: true
        };
      }

      return {};
    };

    const schema = buildSchema(data);
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title,
      ...schema
    };
  }

  /**
   * Detect anomalies in collection datasets (null rates, missing fields, type changes)
   */
  static detectAnomalies(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return { isCollection: false, anomalies: [] };
    }

    const anomalies = [];
    const keyTypes = new Map();
    const keyFrequency = new Map();
    const totalRecords = data.length;

    data.forEach((row, idx) => {
      if (typeof row !== 'object' || row === null) {
        anomalies.push({ row: idx, issue: 'Non-object item in collection' });
        return;
      }

      Object.keys(row).forEach(key => {
        keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);
        const valType = row[key] === null ? 'null' : Array.isArray(row[key]) ? 'array' : typeof row[key];

        if (!keyTypes.has(key)) {
          keyTypes.set(key, new Set([valType]));
        } else {
          keyTypes.get(key).add(valType);
        }
      });
    });

    // Check for inconsistent keys
    for (const [key, freq] of keyFrequency.entries()) {
      if (freq < totalRecords) {
        const missingPct = Math.round(((totalRecords - freq) / totalRecords) * 100);
        anomalies.push({
          key,
          issue: 'Missing Key In Incomplete Records',
          presentCount: freq,
          missingCount: totalRecords - freq,
          missingPercentage: `${missingPct}%`
        });
      }
    }

    // Check for mixed types
    for (const [key, types] of keyTypes.entries()) {
      if (types.size > 1 && !(types.size === 2 && types.has('null'))) {
        anomalies.push({
          key,
          issue: 'Mixed Data Types',
          observedTypes: Array.from(types)
        });
      }
    }

    return {
      isCollection: true,
      totalRecords,
      distinctKeys: keyFrequency.size,
      anomalies
    };
  }

  /**
   * Calculate frequency cardinality for values at a specific path
   */
  static cardinality(data, key) {
    if (!Array.isArray(data)) return {};

    const freq = {};
    for (const item of data) {
      const val = item && item[key] !== undefined ? String(item[key]) : '(undefined)';
      freq[val] = (freq[val] || 0) + 1;
    }

    // Sort by count descending
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .reduce((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, {});

    return sorted;
  }
}

function mergeItemSchemas(schemas) {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];

  const types = Array.from(new Set(schemas.map(s => s.type).filter(Boolean)));
  if (types.length === 1 && types[0] === 'object') {
    const mergedProps = {};
    const keySets = schemas.map(s => new Set(Object.keys(s.properties || {})));
    const allKeys = new Set();
    keySets.forEach(set => set.forEach(k => allKeys.add(k)));

    for (const k of allKeys) {
      const propSchemas = schemas
        .map(s => s.properties && s.properties[k])
        .filter(Boolean);
      mergedProps[k] = mergeItemSchemas(propSchemas);
    }

    return {
      type: 'object',
      properties: mergedProps
    };
  }

  if (types.length === 1) {
    return { type: types[0] };
  }

  return { type: types };
}
