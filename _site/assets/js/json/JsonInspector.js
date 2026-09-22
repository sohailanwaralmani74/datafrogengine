/**
 * Pure JavaScript JSON Inspector, Diff Engine & JSONPath Query Evaluator
 * Provides deep diffing, JSONPath querying, path finding, and structural outlining.
 */

import { JsonEditor } from './JsonEditor.js';

export class JsonInspector {
  /**
   * Deep structural diff between two JSON objects/values
   * Returns a detailed list of additions, removals, and modifications.
   */
  static diff(oldData, newData, basePath = '$') {
    const changes = [];

    const compare = (oldVal, newVal, currentPath) => {
      if (oldVal === newVal) return;

      const oldType = getType(oldVal);
      const newType = getType(newVal);

      if (oldType !== newType) {
        changes.push({
          type: 'modified',
          path: currentPath,
          oldValue: oldVal,
          newValue: newVal,
          details: `Type changed from ${oldType} to ${newType}`
        });
        return;
      }

      if (oldType === 'array') {
        const maxLen = Math.max(oldVal.length, newVal.length);
        for (let i = 0; i < maxLen; i++) {
          const itemPath = `${currentPath}[${i}]`;
          if (i >= oldVal.length) {
            changes.push({
              type: 'added',
              path: itemPath,
              newValue: newVal[i]
            });
          } else if (i >= newVal.length) {
            changes.push({
              type: 'removed',
              path: itemPath,
              oldValue: oldVal[i]
            });
          } else {
            compare(oldVal[i], newVal[i], itemPath);
          }
        }
        return;
      }

      if (oldType === 'object') {
        const oldKeys = new Set(Object.keys(oldVal));
        const newKeys = new Set(Object.keys(newVal));

        for (const k of oldKeys) {
          const keyPath = `${currentPath}.${k}`;
          if (!newKeys.has(k)) {
            changes.push({
              type: 'removed',
              path: keyPath,
              oldValue: oldVal[k]
            });
          } else {
            compare(oldVal[k], newVal[k], keyPath);
          }
        }

        for (const k of newKeys) {
          const keyPath = `${currentPath}.${k}`;
          if (!oldKeys.has(k)) {
            changes.push({
              type: 'added',
              path: keyPath,
              newValue: newVal[k]
            });
          }
        }
        return;
      }

      // Primitive value changed
      changes.push({
        type: 'modified',
        path: currentPath,
        oldValue: oldVal,
        newValue: newVal
      });
    };

    compare(oldData, newData, basePath);
    return changes;
  }

  /**
   * JSONPath query evaluator
   * Supports:
   * - Root: `$`
   * - Property access: `$.store.book` or `$['store']['book']`
   * - Wildcard: `$.store.*` or `$.store.book[*]`
   * - Deep recursive descent: `$..price` or `$..author`
   * - Filter expressions: `$[?(@.price < 30)]` or `$[?(@.active == true)]`
   * - Array slice: `$[0:2]`
   */
  static query(data, pathExpression) {
    if (!pathExpression || typeof pathExpression !== 'string') return [data];
    let path = pathExpression.trim();
    if (path.startsWith('$')) {
      path = path.substring(1);
    }
    if (path === '' || path === '.') return [data];

    let currentNodes = [data];

    // Handle deep scan '$..key'
    if (path.startsWith('..')) {
      const targetKey = path.substring(2);
      const results = [];
      const deepScan = (node) => {
        if (node === null || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const item of node) deepScan(item);
        } else {
          if (targetKey in node) {
            results.push(node[targetKey]);
          }
          for (const k of Object.keys(node)) {
            deepScan(node[k]);
          }
        }
      };
      deepScan(data);
      return results;
    }

    const segments = parsePathSegments(path);

    for (const segment of segments) {
      const nextNodes = [];

      for (const node of currentNodes) {
        if (node === null || typeof node !== 'object') continue;

        if (segment.type === 'wildcard') {
          if (Array.isArray(node)) {
            nextNodes.push(...node);
          } else {
            nextNodes.push(...Object.values(node));
          }
        } else if (segment.type === 'property') {
          if (node && segment.name in node) {
            nextNodes.push(node[segment.name]);
          }
        } else if (segment.type === 'index') {
          if (Array.isArray(node) && segment.index >= 0 && segment.index < node.length) {
            nextNodes.push(node[segment.index]);
          }
        } else if (segment.type === 'filter') {
          if (Array.isArray(node)) {
            for (const item of node) {
              if (evaluateFilter(item, segment.expression)) {
                nextNodes.push(item);
              }
            }
          }
        }
      }

      currentNodes = nextNodes;
      if (currentNodes.length === 0) break;
    }

    return currentNodes;
  }

  /**
   * Search for all paths containing keys or values matching a condition
   */
  static findPaths(data, predicate) {
    const results = [];

    const recurse = (node, path) => {
      if (predicate(node, path)) {
        results.push(path);
      }

      if (node === null || typeof node !== 'object') return;

      if (Array.isArray(node)) {
        node.forEach((item, idx) => recurse(item, `${path}[${idx}]`));
      } else {
        Object.keys(node).forEach(key => recurse(node[key], `${path}.${key}`));
      }
    };

    recurse(data, '$');
    return results;
  }

  /**
   * Generate hierarchical structural outline of JSON document
   */
  static outline(data) {
    const buildOutline = (node) => {
      if (node === null) return { type: 'null' };
      if (Array.isArray(node)) {
        return {
          type: 'array',
          length: node.length,
          itemTypes: Array.from(new Set(node.map(getType))),
          sample: node.length > 0 ? buildOutline(node[0]) : null
        };
      }
      if (typeof node === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(node)) {
          fields[k] = buildOutline(v);
        }
        return {
          type: 'object',
          fieldCount: Object.keys(node).length,
          fields
        };
      }
      return { type: typeof node, valuePreview: String(node).substring(0, 30) };
    };

    return buildOutline(data);
  }
}

function getType(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

function parsePathSegments(path) {
  const segments = [];
  let i = 0;

  while (i < path.length) {
    const char = path[i];

    if (char === '.') {
      i++;
      continue;
    }

    if (char === '[') {
      const closeIdx = path.indexOf(']', i);
      if (closeIdx === -1) break;
      const inside = path.substring(i + 1, closeIdx).trim();

      if (inside === '*') {
        segments.push({ type: 'wildcard' });
      } else if (inside.startsWith('?(') && inside.endsWith(')')) {
        segments.push({ type: 'filter', expression: inside.substring(2, inside.length - 1).trim() });
      } else if (/^\d+$/.test(inside)) {
        segments.push({ type: 'index', index: parseInt(inside, 10) });
      } else {
        // String key inside brackets
        const clean = inside.replace(/^['"]|['"]$/g, '');
        segments.push({ type: 'property', name: clean });
      }

      i = closeIdx + 1;
      continue;
    }

    if (char === '*') {
      segments.push({ type: 'wildcard' });
      i++;
      continue;
    }

    // Read alphanumeric property
    let prop = '';
    while (i < path.length && path[i] !== '.' && path[i] !== '[') {
      prop += path[i++];
    }

    if (prop) {
      segments.push({ type: 'property', name: prop });
    }
  }

  return segments;
}

function evaluateFilter(item, expression) {
  if (typeof item !== 'object' || item === null) return false;

  // Simple comparison matcher: @.key op value
  const match = expression.match(/@\.([a-zA-Z0-9_$]+)\s*(==|!=|<=|>=|<|>)\s*(.*)/);
  if (!match) return Boolean(item);

  const [, key, op, rawVal] = match;
  const itemVal = item[key];
  let targetVal = rawVal.trim().replace(/^['"]|['"]$/g, '');

  if (targetVal === 'true') targetVal = true;
  else if (targetVal === 'false') targetVal = false;
  else if (targetVal === 'null') targetVal = null;
  else if (!isNaN(Number(targetVal))) targetVal = Number(targetVal);

  switch (op) {
    case '==': return itemVal == targetVal;
    case '!=': return itemVal != targetVal;
    case '>': return itemVal > targetVal;
    case '<': return itemVal < targetVal;
    case '>=': return itemVal >= targetVal;
    case '<=': return itemVal <= targetVal;
    default: return false;
  }
}
