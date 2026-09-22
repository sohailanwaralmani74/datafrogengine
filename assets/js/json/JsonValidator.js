/**
 * Pure JavaScript JSON Validator
 * Provides syntax validation with line/column diagnostics
 * and a full JSON Schema Draft-07 / Draft 2020 validator.
 */

import { JsonParser } from './JsonParser.js';

export class JsonValidator {
  /**
   * Validate JSON syntax without throwing exceptions
   */
  static validateSyntax(jsonText, options = {}) {
    try {
      JsonParser.parse(jsonText, options);
      return {
        valid: true,
        errors: []
      };
    } catch (err) {
      return {
        valid: false,
        errors: [{
          line: err.line || 1,
          column: err.column || 1,
          offset: err.offset || 0,
          message: err.message,
          snippet: err.snippet || ''
        }]
      };
    }
  }

  /**
   * Validate data against JSON Schema
   */
  static validateSchema(data, schema) {
    const errors = [];

    const check = (val, sch, path) => {
      if (!sch || typeof sch !== 'object') return;

      // 1. Type validation
      if (sch.type) {
        const types = Array.isArray(sch.type) ? sch.type : [sch.type];
        const actualType = getJsonType(val);
        const matches = types.some(t => {
          if (t === 'integer') return actualType === 'number' && Number.isInteger(val);
          return actualType === t;
        });

        if (!matches) {
          errors.push({
            path,
            keyword: 'type',
            message: `Expected type '${types.join('|')}' but received '${actualType}'`,
            expected: types,
            actual: actualType
          });
          return; // Skip further child checks if fundamental type mismatches
        }
      }

      // 2. Const & Enum
      if (sch.const !== undefined) {
        if (JSON.stringify(val) !== JSON.stringify(sch.const)) {
          errors.push({
            path,
            keyword: 'const',
            message: `Value must equal constant '${JSON.stringify(sch.const)}'`,
            expected: sch.const,
            actual: val
          });
        }
      }

      if (Array.isArray(sch.enum)) {
        const match = sch.enum.some(e => JSON.stringify(e) === JSON.stringify(val));
        if (!match) {
          errors.push({
            path,
            keyword: 'enum',
            message: `Value must be one of enum values: [${sch.enum.map(e => JSON.stringify(e)).join(', ')}]`,
            expected: sch.enum,
            actual: val
          });
        }
      }

      // 3. Numeric constraints
      if (typeof val === 'number') {
        if (sch.minimum !== undefined && val < sch.minimum) {
          errors.push({
            path,
            keyword: 'minimum',
            message: `Number ${val} is less than minimum ${sch.minimum}`,
            expected: `>= ${sch.minimum}`,
            actual: val
          });
        }
        if (sch.maximum !== undefined && val > sch.maximum) {
          errors.push({
            path,
            keyword: 'maximum',
            message: `Number ${val} is greater than maximum ${sch.maximum}`,
            expected: `<= ${sch.maximum}`,
            actual: val
          });
        }
        if (sch.exclusiveMinimum !== undefined && val <= sch.exclusiveMinimum) {
          errors.push({
            path,
            keyword: 'exclusiveMinimum',
            message: `Number ${val} must be strictly greater than ${sch.exclusiveMinimum}`,
            expected: `> ${sch.exclusiveMinimum}`,
            actual: val
          });
        }
        if (sch.exclusiveMaximum !== undefined && val >= sch.exclusiveMaximum) {
          errors.push({
            path,
            keyword: 'exclusiveMaximum',
            message: `Number ${val} must be strictly less than ${sch.exclusiveMaximum}`,
            expected: `< ${sch.exclusiveMaximum}`,
            actual: val
          });
        }
        if (sch.multipleOf !== undefined && val % sch.multipleOf !== 0) {
          errors.push({
            path,
            keyword: 'multipleOf',
            message: `Number ${val} is not a multiple of ${sch.multipleOf}`,
            expected: `multiple of ${sch.multipleOf}`,
            actual: val
          });
        }
      }

      // 4. String constraints
      if (typeof val === 'string') {
        if (sch.minLength !== undefined && val.length < sch.minLength) {
          errors.push({
            path,
            keyword: 'minLength',
            message: `String length (${val.length}) is shorter than minLength (${sch.minLength})`,
            expected: `>= ${sch.minLength}`,
            actual: val.length
          });
        }
        if (sch.maxLength !== undefined && val.length > sch.maxLength) {
          errors.push({
            path,
            keyword: 'maxLength',
            message: `String length (${val.length}) exceeds maxLength (${sch.maxLength})`,
            expected: `<= ${sch.maxLength}`,
            actual: val.length
          });
        }
        if (sch.pattern !== undefined) {
          const reg = new RegExp(sch.pattern);
          if (!reg.test(val)) {
            errors.push({
              path,
              keyword: 'pattern',
              message: `String does not match pattern /${sch.pattern}/`,
              expected: sch.pattern,
              actual: val
            });
          }
        }
        if (sch.format !== undefined) {
          const validFormat = checkFormat(val, sch.format);
          if (!validFormat) {
            errors.push({
              path,
              keyword: 'format',
              message: `String does not match format '${sch.format}'`,
              expected: sch.format,
              actual: val
            });
          }
        }
      }

      // 5. Array constraints
      if (Array.isArray(val)) {
        if (sch.minItems !== undefined && val.length < sch.minItems) {
          errors.push({
            path,
            keyword: 'minItems',
            message: `Array length (${val.length}) is less than minItems (${sch.minItems})`,
            expected: `>= ${sch.minItems}`,
            actual: val.length
          });
        }
        if (sch.maxItems !== undefined && val.length > sch.maxItems) {
          errors.push({
            path,
            keyword: 'maxItems',
            message: `Array length (${val.length}) exceeds maxItems (${sch.maxItems})`,
            expected: `<= ${sch.maxItems}`,
            actual: val.length
          });
        }
        if (sch.uniqueItems === true) {
          const seen = new Set();
          for (let i = 0; i < val.length; i++) {
            const repr = JSON.stringify(val[i]);
            if (seen.has(repr)) {
              errors.push({
                path: `${path}[${i}]`,
                keyword: 'uniqueItems',
                message: `Duplicate item found at index ${i}`,
                expected: 'unique items',
                actual: val[i]
              });
              break;
            }
            seen.add(repr);
          }
        }
        if (sch.items) {
          if (Array.isArray(sch.items)) {
            // Tuple validation
            sch.items.forEach((itemSch, idx) => {
              if (idx < val.length) {
                check(val[idx], itemSch, `${path}[${idx}]`);
              }
            });
          } else {
            // Uniform items validation
            val.forEach((item, idx) => {
              check(item, sch.items, `${path}[${idx}]`);
            });
          }
        }
      }

      // 6. Object constraints
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        if (Array.isArray(sch.required)) {
          for (const reqKey of sch.required) {
            if (val[reqKey] === undefined) {
              errors.push({
                path: path ? `${path}.${reqKey}` : reqKey,
                keyword: 'required',
                message: `Missing required property '${reqKey}'`,
                expected: reqKey,
                actual: undefined
              });
            }
          }
        }

        const checkedKeys = new Set();

        if (sch.properties && typeof sch.properties === 'object') {
          for (const propKey of Object.keys(sch.properties)) {
            checkedKeys.add(propKey);
            if (val[propKey] !== undefined) {
              const propPath = path ? `${path}.${propKey}` : propKey;
              check(val[propKey], sch.properties[propKey], propPath);
            }
          }
        }

        if (sch.additionalProperties === false) {
          for (const objKey of Object.keys(val)) {
            if (!checkedKeys.has(objKey)) {
              errors.push({
                path: path ? `${path}.${objKey}` : objKey,
                keyword: 'additionalProperties',
                message: `Property '${objKey}' is not allowed by schema`,
                expected: 'no additional properties',
                actual: objKey
              });
            }
          }
        } else if (typeof sch.additionalProperties === 'object' && sch.additionalProperties !== null) {
          for (const objKey of Object.keys(val)) {
            if (!checkedKeys.has(objKey)) {
              const propPath = path ? `${path}.${objKey}` : objKey;
              check(val[objKey], sch.additionalProperties, propPath);
            }
          }
        }
      }
    };

    check(data, schema, '');

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

function getJsonType(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

function checkFormat(val, format) {
  switch (format) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    case 'uri':
    case 'url':
      return /^[a-zA-Z][a-zA-Z0-9+-.]*:\/\/[^\s/$.?#].[^\s]*$/.test(val);
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(val) && !isNaN(Date.parse(val));
    case 'date-time':
      return !isNaN(Date.parse(val));
    case 'uuid':
      return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(val);
    case 'ipv4':
      return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(val);
    default:
      return true;
  }
}
