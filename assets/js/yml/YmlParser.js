/**
 * YmlParser - Robust Pure-JavaScript YAML parser.
 * Supports YAML 1.2 core types: mappings, sequences, scalars, comments,
 * multi-line strings (| and >), anchors & aliases (* and &), booleans, nulls,
 * numbers (hex, octal, float), quoted strings, and inline flow styles [a, b] & {a: b}.
 */

export class YmlParser {
  /**
   * Parse YAML string into JavaScript object / array / primitive
   * @param {string} yamlText
   * @param {object} [options]
   * @returns {any}
   */
  static parse(yamlText, options = {}) {
    if (typeof yamlText !== 'string') {
      throw new TypeError('YmlParser.parse requires a string');
    }

    const trimmed = yamlText.trim();
    if (!trimmed) return null;

    // Handle single primitive
    if (!trimmed.includes('\n') && !trimmed.includes(':') && !trimmed.startsWith('-')) {
      return parseScalarValue(trimmed);
    }

    const rawLines = yamlText.split(/\r?\n/);
    const anchors = new Map();

    // Tokenize lines into { indent, content, origLineNum }
    const lines = [];
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      // Check if line is comment or blank
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }
      // Check if document start/end
      if (trimmedLine === '---' || trimmedLine === '...') {
        continue;
      }

      // Determine indentation
      const match = line.match(/^(\s*)(.*)$/);
      const indent = match ? match[1].length : 0;
      const content = match ? match[2] : trimmedLine;

      lines.push({ indent, content, lineNum: i + 1 });
    }

    if (lines.length === 0) return null;

    let index = 0;

    function parseBlock(currentIndent) {
      if (index >= lines.length) return null;

      const currentLine = lines[index];
      if (currentLine.indent < currentIndent) return null;

      // Check if current block is sequence or mapping
      if (currentLine.content.startsWith('- ') || currentLine.content === '-') {
        return parseSequence(currentLine.indent);
      } else {
        return parseMapping(currentLine.indent);
      }
    }

    function parseSequence(indent) {
      const result = [];

      while (index < lines.length) {
        const lineObj = lines[index];
        if (lineObj.indent < indent) break;
        if (lineObj.indent > indent) {
          // Bad indentation or continuation
          break;
        }

        const content = lineObj.content;
        if (!content.startsWith('- ') && content !== '-') {
          break; // No longer a sequence item
        }

        const itemContent = content === '-' ? '' : content.substring(2).trim();
        index++;

        if (!itemContent) {
          // Nested block underneath
          if (index < lines.length && lines[index].indent > indent) {
            const nested = parseBlock(lines[index].indent);
            result.push(nested);
          } else {
            result.push(null);
          }
        } else if (itemContent.includes(': ') || itemContent.endsWith(':')) {
          // Sequence item is an inline mapping e.g. "- name: John"
          const itemLines = [{
            indent: indent + 2,
            content: itemContent,
            lineNum: lineObj.lineNum
          }];

          // Collect following lines that belong to this mapping
          while (index < lines.length && lines[index].indent > indent) {
            itemLines.push(lines[index]);
            index++;
          }

          // Temporarily parse this sub-mapping
          const subParser = new SubBlockParser(itemLines, anchors);
          result.push(subParser.parse());
        } else {
          // Scalar or flow structure
          result.push(resolveValue(itemContent, indent));
        }
      }

      return result;
    }

    function parseMapping(indent) {
      const result = {};

      while (index < lines.length) {
        const lineObj = lines[index];
        if (lineObj.indent < indent) break;
        if (lineObj.indent > indent) break;

        const content = lineObj.content;
        const colonIdx = findKeyValueSeparator(content);

        if (colonIdx === -1) {
          // Scalar or unknown line
          index++;
          continue;
        }

        let key = content.substring(0, colonIdx).trim();
        let valPart = content.substring(colonIdx + 1).trim();

        // Strip quotes from key
        key = stripQuotes(key);

        index++;

        if (valPart === '|' || valPart === '>') {
          // Multiline literal/folded string
          const isFolded = valPart === '>';
          const blockLines = [];
          const blockIndent = index < lines.length ? lines[index].indent : indent + 2;

          while (index < lines.length && lines[index].indent >= blockIndent) {
            const rawLine = rawLines[lines[index].lineNum - 1];
            blockLines.push(rawLine.substring(blockIndent));
            index++;
          }

          result[key] = isFolded ? blockLines.join(' ').trim() : blockLines.join('\n');
        } else if (!valPart) {
          // Next line is nested structure
          if (index < lines.length && lines[index].indent > indent) {
            const nested = parseBlock(lines[index].indent);
            result[key] = nested;
          } else {
            result[key] = null;
          }
        } else {
          result[key] = resolveValue(valPart, indent);
        }
      }

      return result;
    }

    function resolveValue(valStr, currentIndent) {
      // Check for anchor definition &anchorName
      if (valStr.startsWith('&')) {
        const parts = valStr.substring(1).split(/\s+/);
        const anchorName = parts[0];
        const actualVal = parts.slice(1).join(' ').trim();
        const parsed = actualVal ? resolveValue(actualVal, currentIndent) : null;
        anchors.set(anchorName, parsed);
        return parsed;
      }

      // Check for alias reference *anchorName
      if (valStr.startsWith('*')) {
        const aliasName = valStr.substring(1).trim();
        if (anchors.has(aliasName)) {
          return JSON.parse(JSON.stringify(anchors.get(aliasName)));
        }
        return null;
      }

      return parseScalarValue(valStr);
    }

    const parsed = parseBlock(lines[0].indent);
    return parsed;
  }
}

class SubBlockParser {
  constructor(lines, anchors) {
    this.lines = lines;
    this.anchors = anchors;
    this.index = 0;
  }

  parse() {
    return this.parseMapping(this.lines[0].indent);
  }

  parseMapping(indent) {
    const result = {};
    while (this.index < this.lines.length) {
      const lineObj = this.lines[this.index];
      if (lineObj.indent < indent) break;

      const content = lineObj.content;
      const colonIdx = findKeyValueSeparator(content);
      if (colonIdx === -1) {
        this.index++;
        continue;
      }

      let key = stripQuotes(content.substring(0, colonIdx).trim());
      let valPart = content.substring(colonIdx + 1).trim();
      this.index++;

      if (!valPart) {
        if (this.index < this.lines.length && this.lines[this.index].indent > indent) {
          result[key] = this.parseMapping(this.lines[this.index].indent);
        } else {
          result[key] = null;
        }
      } else {
        result[key] = parseScalarValue(valPart);
      }
    }
    return result;
  }
}

function findKeyValueSeparator(str) {
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === ':' && !inDouble && !inSingle) {
      if (i === str.length - 1 || str[i + 1] === ' ' || str[i + 1] === '\t') {
        return i;
      }
    }
  }
  return -1;
}

function stripQuotes(str) {
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.substring(1, str.length - 1);
  }
  return str;
}

function parseScalarValue(rawStr) {
  let str = rawStr.trim();

  // Strip trailing comments (not inside quotes)
  if (!str.startsWith('"') && !str.startsWith("'") && str.includes('#')) {
    const commentIdx = str.indexOf('#');
    if (commentIdx > 0 && /\s/.test(str[commentIdx - 1])) {
      str = str.substring(0, commentIdx).trim();
    }
  }

  // Quoted string
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.substring(1, str.length - 1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }

  // Flow array [a, b, c]
  if (str.startsWith('[') && str.endsWith(']')) {
    const inner = str.substring(1, str.length - 1).trim();
    if (!inner) return [];
    return splitFlowValues(inner).map(v => parseScalarValue(v));
  }

  // Flow object {a: 1, b: 2}
  if (str.startsWith('{') && str.endsWith('}')) {
    const inner = str.substring(1, str.length - 1).trim();
    if (!inner) return {};
    const obj = {};
    const pairs = splitFlowValues(inner);
    for (const p of pairs) {
      const colIdx = p.indexOf(':');
      if (colIdx !== -1) {
        const k = stripQuotes(p.substring(0, colIdx).trim());
        const v = p.substring(colIdx + 1).trim();
        obj[k] = parseScalarValue(v);
      }
    }
    return obj;
  }

  // Nulls
  if (str === 'null' || str === '~' || str === 'Null' || str === 'NULL' || str === '') {
    return null;
  }

  // Booleans
  if (str === 'true' || str === 'True' || str === 'TRUE' || str === 'yes' || str === 'on') {
    return true;
  }
  if (str === 'false' || str === 'False' || str === 'FALSE' || str === 'no' || str === 'off') {
    return false;
  }

  // Numbers
  if (/^-?0x[0-9a-fA-F]+$/.test(str)) {
    return parseInt(str, 16);
  }
  if (/^-?0o[0-7]+$/.test(str)) {
    return parseInt(str.replace(/0o/, ''), 8);
  }
  if (/^-?\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  if (/^-?\d+\.\d+(?:[eE][+-]?\d+)?$/.test(str)) {
    return parseFloat(str);
  }
  if (str === '.nan' || str === '.NaN') {
    return NaN;
  }
  if (str === '.inf' || str === '+.inf') {
    return Infinity;
  }
  if (str === '-.inf') {
    return -Infinity;
  }

  return str;
}

function splitFlowValues(str) {
  const result = [];
  let curr = '';
  let inDouble = false;
  let inSingle = false;
  let depthSquare = 0;
  let depthCurly = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '[' && !inDouble && !inSingle) depthSquare++;
    else if (ch === ']' && !inDouble && !inSingle) depthSquare--;
    else if (ch === '{' && !inDouble && !inSingle) depthCurly++;
    else if (ch === '}' && !inDouble && !inSingle) depthCurly--;
    else if (ch === ',' && !inDouble && !inSingle && depthSquare === 0 && depthCurly === 0) {
      result.push(curr.trim());
      curr = '';
      continue;
    }
    curr += ch;
  }
  if (curr.trim()) {
    result.push(curr.trim());
  }
  return result;
}
