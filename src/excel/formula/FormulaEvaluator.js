import { CellAddress } from '../utils/CellAddress.js';

/**
 * Robust Formula Parser & Evaluator for spreadsheet expressions.
 * Pure JavaScript, zero external dependencies.
 */
export class FormulaEvaluator {
  /**
   * Evaluates a formula string (e.g. "=SUM(A1:A5) + 10") in the context of a worksheet.
   * 
   * @param {string} formula Formula starting with "=" (or without)
   * @param {Object} worksheet Context containing `getCell(ref)` or `getCell(row, col)`
   * @returns {*} Evaluated value (number, string, boolean, or error string)
   */
  static evaluate(formula, worksheet) {
    if (typeof formula !== 'string') return formula;
    let expr = formula.trim();
    if (expr.startsWith('=')) {
      expr = expr.substring(1).trim();
    }
    if (expr.length === 0) return '';

    try {
      const tokens = FormulaEvaluator.#tokenize(expr);
      const parser = new ExpressionParser(tokens, worksheet);
      return parser.parse();
    } catch (err) {
      return '#VALUE!';
    }
  }

  static #tokenize(expr) {
    const tokens = [];
    let i = 0;
    const len = expr.length;

    while (i < len) {
      const ch = expr[i];

      // Whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // String literal
      if (ch === '"') {
        let str = '';
        i++;
        while (i < len) {
          if (expr[i] === '"') {
            if (i + 1 < len && expr[i + 1] === '"') {
              str += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            str += expr[i++];
          }
        }
        tokens.push({ type: 'STRING', value: str });
        continue;
      }

      // Number literal
      if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < len && /[0-9]/.test(expr[i + 1]))) {
        let numStr = '';
        while (i < len && /[0-9.]/.test(expr[i])) {
          numStr += expr[i++];
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // Two-character operators
      const twoChar = expr.substring(i, i + 2);
      if (['<=', '>=', '<>'].includes(twoChar)) {
        tokens.push({ type: 'OP', value: twoChar });
        i += 2;
        continue;
      }

      // Single-character operators and symbols
      if (['+', '-', '*', '/', '^', '&', '=', '<', '>', '(', ')', ',', ':'].includes(ch)) {
        tokens.push({ type: ch === '(' || ch === ')' || ch === ',' || ch === ':' ? ch : 'OP', value: ch });
        i++;
        continue;
      }

      // Identifiers (Function names, Sheet references, Cell references)
      if (/[A-Za-z_$]/.test(ch)) {
        let ident = '';
        while (i < len && /[A-Za-z0-9_$!.]/.test(expr[i])) {
          ident += expr[i++];
        }
        const upper = ident.toUpperCase();
        if (upper === 'TRUE') {
          tokens.push({ type: 'BOOLEAN', value: true });
        } else if (upper === 'FALSE') {
          tokens.push({ type: 'BOOLEAN', value: false });
        } else {
          tokens.push({ type: 'IDENT', value: ident });
        }
        continue;
      }

      i++;
    }

    return tokens;
  }
}

class ExpressionParser {
  constructor(tokens, worksheet) {
    this.tokens = tokens;
    this.pos = 0;
    this.worksheet = worksheet;
  }

  peek() {
    return this.tokens[this.pos] || null;
  }

  next() {
    return this.tokens[this.pos++] || null;
  }

  match(type, val = null) {
    const tok = this.peek();
    if (!tok) return false;
    if (tok.type !== type) return false;
    if (val !== null && tok.value !== val) return false;
    this.pos++;
    return true;
  }

  parse() {
    const res = this.parseComparison();
    return res;
  }

  parseComparison() {
    let left = this.parseConcat();
    while (true) {
      const tok = this.peek();
      if (tok && tok.type === 'OP' && ['=', '<>', '<', '>', '<=', '>='].includes(tok.value)) {
        this.next();
        const right = this.parseConcat();
        if (tok.value === '=') left = left == right;
        else if (tok.value === '<>') left = left != right;
        else if (tok.value === '<') left = left < right;
        else if (tok.value === '>') left = left > right;
        else if (tok.value === '<=') left = left <= right;
        else if (tok.value === '>=') left = left >= right;
      } else {
        break;
      }
    }
    return left;
  }

  parseConcat() {
    let left = this.parseAddSub();
    while (this.match('OP', '&')) {
      const right = this.parseAddSub();
      left = String(left ?? '') + String(right ?? '');
    }
    return left;
  }

  parseAddSub() {
    let left = this.parseMulDiv();
    while (true) {
      const tok = this.peek();
      if (tok && tok.type === 'OP' && (tok.value === '+' || tok.value === '-')) {
        this.next();
        const right = this.parseMulDiv();
        const numL = Number(left) || 0;
        const numR = Number(right) || 0;
        left = tok.value === '+' ? numL + numR : numL - numR;
      } else {
        break;
      }
    }
    return left;
  }

  parseMulDiv() {
    let left = this.parsePower();
    while (true) {
      const tok = this.peek();
      if (tok && tok.type === 'OP' && (tok.value === '*' || tok.value === '/')) {
        this.next();
        const right = this.parsePower();
        const numL = Number(left) || 0;
        const numR = Number(right) || 0;
        if (tok.value === '*') {
          left = numL * numR;
        } else {
          if (numR === 0) return '#DIV/0!';
          left = numL / numR;
        }
      } else {
        break;
      }
    }
    return left;
  }

  parsePower() {
    let left = this.parseUnary();
    while (this.match('OP', '^')) {
      const right = this.parseUnary();
      left = Math.pow(Number(left) || 0, Number(right) || 0);
    }
    return left;
  }

  parseUnary() {
    const tok = this.peek();
    if (tok && tok.type === 'OP' && (tok.value === '-' || tok.value === '+')) {
      this.next();
      const operand = this.parseUnary();
      return tok.value === '-' ? -(Number(operand) || 0) : +(Number(operand) || 0);
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const tok = this.peek();
    if (!tok) return null;

    if (tok.type === 'NUMBER' || tok.type === 'STRING' || tok.type === 'BOOLEAN') {
      this.next();
      return tok.value;
    }

    if (this.match('(')) {
      const val = this.parseComparison();
      this.match(')');
      return val;
    }

    if (tok.type === 'IDENT') {
      this.next();
      const ident = tok.value;

      // Check if followed by '(' -> Function call
      if (this.match('(')) {
        const args = [];
        if (!this.match(')')) {
          while (true) {
            args.push(this.parseArgument());
            if (this.match(',')) continue;
            if (this.match(')')) break;
            break;
          }
        }
        return this.callFunction(ident.toUpperCase(), args);
      }

      // Check if followed by ':' -> Range reference (e.g. A1:B10)
      if (this.match(':')) {
        const nextTok = this.next();
        if (nextTok && nextTok.type === 'IDENT') {
          const rangeStr = `${ident}:${nextTok.value}`;
          return this.resolveRangeValues(rangeStr);
        }
      }

      // Single Cell Reference or Range identifier
      if (ident.includes(':')) {
        return this.resolveRangeValues(ident);
      }
      return this.resolveCellValue(ident);
    }

    this.next();
    return null;
  }

  parseArgument() {
    // Allows range like A1:A10 in function argument
    const tok = this.peek();
    if (tok && tok.type === 'IDENT') {
      const nextTok = this.tokens[this.pos + 1];
      if (nextTok && nextTok.type === ':') {
        this.pos += 2;
        const endTok = this.next();
        return this.resolveRangeValues(`${tok.value}:${endTok ? endTok.value : tok.value}`);
      }
    }
    return this.parseComparison();
  }

  resolveCellValue(ref) {
    if (!this.worksheet) return 0;
    try {
      let cleanRef = ref;
      let targetWs = this.worksheet;
      if (ref.includes('!')) {
        const [sheetName, cellPart] = ref.split('!');
        cleanRef = cellPart;
        if (this.worksheet.workbook) {
          const ws = this.worksheet.workbook.getWorksheet(sheetName.replace(/^'|'$/g, ''));
          if (ws) targetWs = ws;
        }
      }
      const cell = targetWs.getCell(cleanRef);
      return cell ? cell.value : null;
    } catch {
      return 0;
    }
  }

  resolveRangeValues(rangeStr) {
    if (!this.worksheet) return [];
    try {
      let cleanRange = rangeStr;
      let targetWs = this.worksheet;
      if (rangeStr.includes('!')) {
        const [sheetName, cellPart] = rangeStr.split('!');
        cleanRange = cellPart;
        if (this.worksheet.workbook) {
          const ws = this.worksheet.workbook.getWorksheet(sheetName.replace(/^'|'$/g, ''));
          if (ws) targetWs = ws;
        }
      }

      const { start, end } = CellAddress.parseRange(cleanRange);
      const values = [];
      for (let r = start.row; r <= end.row; r++) {
        for (let c = start.col; c <= end.col; c++) {
          const cell = targetWs.getCell(r, c);
          values.push(cell ? cell.value : null);
        }
      }
      return values;
    } catch {
      return [];
    }
  }

  callFunction(fnName, args) {
    // Flatten array arguments for aggregate functions
    const flatten = (arr) => {
      const res = [];
      for (const item of arr) {
        if (Array.isArray(item)) res.push(...flatten(item));
        else if (item !== null && item !== undefined && item !== '') res.push(item);
      }
      return res;
    };

    const flatNums = () => flatten(args).map(Number).filter((n) => !isNaN(n));

    switch (fnName) {
      case 'SUM': {
        return flatNums().reduce((a, b) => a + b, 0);
      }
      case 'AVERAGE': {
        const nums = flatNums();
        return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
      }
      case 'MIN': {
        const nums = flatNums();
        return nums.length === 0 ? 0 : Math.min(...nums);
      }
      case 'MAX': {
        const nums = flatNums();
        return nums.length === 0 ? 0 : Math.max(...nums);
      }
      case 'COUNT': {
        return flatNums().length;
      }
      case 'COUNTA': {
        return flatten(args).filter((x) => x !== null && x !== undefined && x !== '').length;
      }
      case 'PRODUCT': {
        const nums = flatNums();
        return nums.length === 0 ? 0 : nums.reduce((a, b) => a * b, 1);
      }
      case 'ROUND': {
        const val = Number(args[0]) || 0;
        const dec = Number(args[1]) || 0;
        const factor = Math.pow(10, dec);
        return Math.round(val * factor) / factor;
      }
      case 'ROUNDUP': {
        const val = Number(args[0]) || 0;
        const dec = Number(args[1]) || 0;
        const factor = Math.pow(10, dec);
        return Math.ceil(val * factor) / factor;
      }
      case 'ROUNDDOWN': {
        const val = Number(args[0]) || 0;
        const dec = Number(args[1]) || 0;
        const factor = Math.pow(10, dec);
        return Math.floor(val * factor) / factor;
      }
      case 'ABS': {
        return Math.abs(Number(args[0]) || 0);
      }
      case 'INT': {
        return Math.floor(Number(args[0]) || 0);
      }
      case 'MOD': {
        const n = Number(args[0]) || 0;
        const d = Number(args[1]) || 1;
        return n % d;
      }
      case 'POWER': {
        return Math.pow(Number(args[0]) || 0, Number(args[1]) || 0);
      }
      case 'SQRT': {
        const val = Number(args[0]) || 0;
        if (val < 0) return '#NUM!';
        return Math.sqrt(val);
      }
      case 'IF': {
        const condition = Boolean(args[0]);
        return condition ? args[1] : (args[2] !== undefined ? args[2] : false);
      }
      case 'IFS': {
        for (let i = 0; i < args.length; i += 2) {
          if (Boolean(args[i])) return args[i + 1];
        }
        return '#N/A';
      }
      case 'AND': {
        const vals = flatten(args);
        return vals.every((v) => Boolean(v));
      }
      case 'OR': {
        const vals = flatten(args);
        return vals.some((v) => Boolean(v));
      }
      case 'NOT': {
        return !Boolean(args[0]);
      }
      case 'CONCATENATE':
      case 'CONCAT': {
        return flatten(args).join('');
      }
      case 'LEN': {
        return String(args[0] ?? '').length;
      }
      case 'LEFT': {
        const str = String(args[0] ?? '');
        const count = Number(args[1]) || 1;
        return str.substring(0, count);
      }
      case 'RIGHT': {
        const str = String(args[0] ?? '');
        const count = Number(args[1]) || 1;
        return str.substring(Math.max(0, str.length - count));
      }
      case 'MID': {
        const str = String(args[0] ?? '');
        const start = (Number(args[1]) || 1) - 1; // 1-based in Excel
        const len = Number(args[2]) || 0;
        return str.substring(start, start + len);
      }
      case 'UPPER': {
        return String(args[0] ?? '').toUpperCase();
      }
      case 'LOWER': {
        return String(args[0] ?? '').toLowerCase();
      }
      case 'TRIM': {
        return String(args[0] ?? '').trim();
      }
      case 'PROPER': {
        return String(args[0] ?? '').replace(/\b\w/g, (c) => c.toUpperCase());
      }
      case 'NOW':
      case 'TODAY': {
        return new Date();
      }
      case 'VLOOKUP': {
        // VLOOKUP(lookup_value, table_array, col_index, [range_lookup])
        const lookupVal = args[0];
        const table = args[1]; // array of cell values
        const colIdx = (Number(args[2]) || 1) - 1; // 0-based
        if (!Array.isArray(table) || table.length === 0) return '#N/A';
        // Check if table is 2D or flat range
        // If flat, we can't deduce width without knowing rows/cols, so expect array of rows if possible
        for (const row of table) {
          if (Array.isArray(row) && row[0] == lookupVal) {
            return row[colIdx] !== undefined ? row[colIdx] : '#REF!';
          }
        }
        return '#N/A';
      }
      default:
        return '#NAME?';
    }
  }
}
