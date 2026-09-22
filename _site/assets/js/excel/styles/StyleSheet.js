import { ExcelStyle } from './ExcelStyle.js';
import { XmlWriter } from '../xml/XmlWriter.js';
import { XmlParser } from '../xml/XmlParser.js';

/**
 * Built-in OpenXML number formats according to ISO/IEC 29500.
 */
const BUILTIN_FORMATS = new Map([
  [0, 'General'],
  [1, '0'],
  [2, '0.00'],
  [3, '#,##0'],
  [4, '#,##0.00'],
  [9, '0%'],
  [10, '0.00%'],
  [11, '0.00E+00'],
  [12, '# ?/?'],
  [13, '# ??/??'],
  [14, 'yyyy-mm-dd'],
  [15, 'd-mmm-yy'],
  [16, 'd-mmm'],
  [17, 'mmm-yy'],
  [18, 'h:mm AM/PM'],
  [19, 'h:mm:ss AM/PM'],
  [20, 'h:mm'],
  [21, 'h:mm:ss'],
  [22, 'yyyy-mm-dd h:mm'],
  [37, '#,##0 ;(#,##0)'],
  [38, '#,##0 ;[Red](#,##0)'],
  [39, '#,##0.00;(#,##0.00)'],
  [40, '#,##0.00;[Red](#,##0.00)'],
  [44, '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)'],
  [49, '@'] // Text
]);

const FORMAT_TO_ID = new Map();
for (const [id, code] of BUILTIN_FORMATS.entries()) {
  FORMAT_TO_ID.set(code.toLowerCase(), id);
}

export class StyleSheet {
  constructor() {
    this.fonts = [];
    this.fills = [];
    this.borders = [];
    this.customNumFormats = new Map(); // code -> id
    this.cellXfs = []; // list of { fontId, fillId, borderId, numFmtId, alignment }
    this.styleCache = new Map(); // styleKey -> xfId

    this.#initDefaults();
  }

  #initDefaults() {
    // Default Font (ID 0)
    this.fonts.push({
      name: 'Calibri',
      size: 11,
      bold: false,
      italic: false,
      underline: false,
      color: null
    });

    // Default Fills (ID 0 = none, ID 1 = gray125)
    this.fills.push({ pattern: 'none', fgColor: null });
    this.fills.push({ pattern: 'gray125', fgColor: null });

    // Default Border (ID 0 = none)
    this.borders.push({ top: null, bottom: null, left: null, right: null });

    // Default CellXf (ID 0 = normal)
    this.cellXfs.push({
      fontId: 0,
      fillId: 0,
      borderId: 0,
      numFmtId: 0,
      alignment: null
    });

    const defaultStyle = new ExcelStyle();
    this.styleCache.set(defaultStyle.getKey(), 0);
  }

  /**
   * Registers a style and returns its 0-based style index (`xfId`).
   * @param {ExcelStyle} style
   * @returns {number}
   */
  registerStyle(style) {
    if (!style) return 0;
    const key = style.getKey();
    if (this.styleCache.has(key)) {
      return this.styleCache.get(key);
    }

    // 1. Resolve Font ID
    const fontId = this.#getOrAddFont(style.font);

    // 2. Resolve Fill ID
    const fillId = this.#getOrAddFill(style.fill);

    // 3. Resolve Border ID
    const borderId = this.#getOrAddBorder(style.border);

    // 4. Resolve Number Format ID
    let numFmtId = 0;
    if (style.format) {
      numFmtId = this.#getOrAddNumFormat(style.format);
    }

    const xf = {
      fontId,
      fillId,
      borderId,
      numFmtId,
      alignment: style.alignment.horizontal || style.alignment.vertical || style.alignment.wrapText ? style.alignment : null
    };

    const xfId = this.cellXfs.length;
    this.cellXfs.push(xf);
    this.styleCache.set(key, xfId);
    return xfId;
  }

  /**
   * Resolves an ExcelStyle from a style index.
   * @param {number} xfId
   * @returns {ExcelStyle}
   */
  getStyle(xfId) {
    const xf = this.cellXfs[xfId] || this.cellXfs[0];
    const font = this.fonts[xf.fontId] || this.fonts[0];
    const fill = this.fills[xf.fillId] || this.fills[0];
    const border = this.borders[xf.borderId] || this.borders[0];
    let format = null;
    if (xf.numFmtId > 0) {
      format = BUILTIN_FORMATS.get(xf.numFmtId);
      if (!format) {
        for (const [code, id] of this.customNumFormats.entries()) {
          if (id === xf.numFmtId) {
            format = code;
            break;
          }
        }
      }
    }

    return new ExcelStyle({
      font,
      fill,
      border,
      alignment: xf.alignment,
      format
    });
  }

  #getOrAddFont(font) {
    const key = JSON.stringify(font);
    for (let i = 0; i < this.fonts.length; i++) {
      if (JSON.stringify(this.fonts[i]) === key) return i;
    }
    this.fonts.push(font);
    return this.fonts.length - 1;
  }

  #getOrAddFill(fill) {
    const key = JSON.stringify(fill);
    for (let i = 0; i < this.fills.length; i++) {
      if (JSON.stringify(this.fills[i]) === key) return i;
    }
    this.fills.push(fill);
    return this.fills.length - 1;
  }

  #getOrAddBorder(border) {
    const key = JSON.stringify(border);
    for (let i = 0; i < this.borders.length; i++) {
      if (JSON.stringify(this.borders[i]) === key) return i;
    }
    this.borders.push(border);
    return this.borders.length - 1;
  }

  #getOrAddNumFormat(code) {
    const lower = code.toLowerCase();
    if (FORMAT_TO_ID.has(lower)) {
      return FORMAT_TO_ID.get(lower);
    }
    if (this.customNumFormats.has(code)) {
      return this.customNumFormats.get(code);
    }
    // Custom formats start at ID 164
    const newId = 164 + this.customNumFormats.size;
    this.customNumFormats.set(code, newId);
    return newId;
  }

  /**
   * Generates `xl/styles.xml` XML string.
   * @returns {string}
   */
  toXml() {
    const w = new XmlWriter();
    w.declaration();
    w.startElement('styleSheet', {
      xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    });

    // Custom Number Formats
    if (this.customNumFormats.size > 0) {
      w.startElement('numFmts', { count: this.customNumFormats.size });
      for (const [code, id] of this.customNumFormats.entries()) {
        w.emptyElement('numFmt', { numFmtId: id, formatCode: code });
      }
      w.endElement('numFmts');
    }

    // Fonts
    w.startElement('fonts', { count: this.fonts.length });
    for (const f of this.fonts) {
      w.startElement('font');
      if (f.bold) w.emptyElement('b');
      if (f.italic) w.emptyElement('i');
      if (f.underline) w.emptyElement('u');
      w.emptyElement('sz', { val: f.size || 11 });
      if (f.color) {
        w.emptyElement('color', { rgb: f.color });
      } else {
        w.emptyElement('color', { theme: 1 });
      }
      w.emptyElement('name', { val: f.name || 'Calibri' });
      w.endElement('font');
    }
    w.endElement('fonts');

    // Fills
    w.startElement('fills', { count: this.fills.length });
    for (const fl of this.fills) {
      w.startElement('fill');
      if (fl.fgColor) {
        w.startElement('patternFill', { patternType: fl.pattern || 'solid' });
        w.emptyElement('fgColor', { rgb: fl.fgColor });
        w.endElement('patternFill');
      } else {
        w.emptyElement('patternFill', { patternType: fl.pattern || 'none' });
      }
      w.endElement('fill');
    }
    w.endElement('fills');

    // Borders
    w.startElement('borders', { count: this.borders.length });
    for (const b of this.borders) {
      w.startElement('border');
      this.#writeBorderSide(w, 'left', b.left);
      this.#writeBorderSide(w, 'right', b.right);
      this.#writeBorderSide(w, 'top', b.top);
      this.#writeBorderSide(w, 'bottom', b.bottom);
      w.emptyElement('diagonal');
      w.endElement('border');
    }
    w.endElement('borders');

    // CellStyleXfs (base style)
    w.startElement('cellStyleXfs', { count: 1 });
    w.emptyElement('xf', { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 });
    w.endElement('cellStyleXfs');

    // CellXfs (master formatting list)
    w.startElement('cellXfs', { count: this.cellXfs.length });
    for (const xf of this.cellXfs) {
      const attrs = {
        numFmtId: xf.numFmtId,
        fontId: xf.fontId,
        fillId: xf.fillId,
        borderId: xf.borderId,
        xfId: 0
      };
      if (xf.numFmtId > 0) attrs.applyNumberFormat = '1';
      if (xf.fontId > 0) attrs.applyFont = '1';
      if (xf.fillId > 0) attrs.applyFill = '1';
      if (xf.borderId > 0) attrs.applyBorder = '1';
      if (xf.alignment) attrs.applyAlignment = '1';

      if (xf.alignment) {
        w.startElement('xf', attrs);
        const alignAttrs = {};
        if (xf.alignment.horizontal) alignAttrs.horizontal = xf.alignment.horizontal;
        if (xf.alignment.vertical) alignAttrs.vertical = xf.alignment.vertical;
        if (xf.alignment.wrapText) alignAttrs.wrapText = '1';
        w.emptyElement('alignment', alignAttrs);
        w.endElement('xf');
      } else {
        w.emptyElement('xf', attrs);
      }
    }
    w.endElement('cellXfs');

    w.endElement('styleSheet');
    return w.toString();
  }

  #writeBorderSide(w, tag, side) {
    if (side && side.style) {
      w.startElement(tag, { style: side.style });
      if (side.color) {
        w.emptyElement('color', { rgb: side.color });
      } else {
        w.emptyElement('color', { auto: '1' });
      }
      w.endElement(tag);
    } else {
      w.emptyElement(tag);
    }
  }

  /**
   * Parses an `xl/styles.xml` XML string.
   * @param {string} xmlString
   * @returns {StyleSheet}
   */
  static parse(xmlString) {
    const sheet = new StyleSheet();
    sheet.fonts = [];
    sheet.fills = [];
    sheet.borders = [];
    sheet.cellXfs = [];
    sheet.customNumFormats.clear();
    sheet.styleCache.clear();

    const root = XmlParser.parse(xmlString);

    // Custom NumFmts
    const numFmtsNode = root.findChild('numFmts');
    if (numFmtsNode) {
      for (const numFmt of numFmtsNode.findChildren('numFmt')) {
        const id = parseInt(numFmt.getAttr('numFmtId'), 10);
        const code = numFmt.getAttr('formatCode');
        if (!isNaN(id) && code) {
          sheet.customNumFormats.set(code, id);
        }
      }
    }

    // Fonts
    const fontsNode = root.findChild('fonts');
    if (fontsNode) {
      for (const fNode of fontsNode.findChildren('font')) {
        const nameNode = fNode.findChild('name');
        const szNode = fNode.findChild('sz');
        const colorNode = fNode.findChild('color');
        sheet.fonts.push({
          name: nameNode ? nameNode.getAttr('val') : 'Calibri',
          size: szNode ? parseFloat(szNode.getAttr('val')) : 11,
          bold: Boolean(fNode.findChild('b')),
          italic: Boolean(fNode.findChild('i')),
          underline: Boolean(fNode.findChild('u')),
          color: colorNode ? colorNode.getAttr('rgb') : null
        });
      }
    }
    if (sheet.fonts.length === 0) {
      sheet.fonts.push({ name: 'Calibri', size: 11, bold: false, italic: false, underline: false, color: null });
    }

    // Fills
    const fillsNode = root.findChild('fills');
    if (fillsNode) {
      for (const flNode of fillsNode.findChildren('fill')) {
        const patNode = flNode.findChild('patternFill');
        const fgNode = patNode ? patNode.findChild('fgColor') : null;
        sheet.fills.push({
          pattern: patNode ? patNode.getAttr('patternType') : 'none',
          fgColor: fgNode ? fgNode.getAttr('rgb') : null
        });
      }
    }
    if (sheet.fills.length === 0) {
      sheet.fills.push({ pattern: 'none', fgColor: null });
    }

    // Borders
    const bordersNode = root.findChild('borders');
    if (bordersNode) {
      for (const bNode of bordersNode.findChildren('border')) {
        const parseSide = (tagName) => {
          const s = bNode.findChild(tagName);
          if (!s || !s.getAttr('style')) return null;
          const c = s.findChild('color');
          return { style: s.getAttr('style'), color: c ? c.getAttr('rgb') : null };
        };
        sheet.borders.push({
          left: parseSide('left'),
          right: parseSide('right'),
          top: parseSide('top'),
          bottom: parseSide('bottom')
        });
      }
    }
    if (sheet.borders.length === 0) {
      sheet.borders.push({ top: null, bottom: null, left: null, right: null });
    }

    // CellXfs
    const cellXfsNode = root.findChild('cellXfs');
    if (cellXfsNode) {
      for (const xfNode of cellXfsNode.findChildren('xf')) {
        const alignNode = xfNode.findChild('alignment');
        sheet.cellXfs.push({
          fontId: parseInt(xfNode.getAttr('fontId') || '0', 10),
          fillId: parseInt(xfNode.getAttr('fillId') || '0', 10),
          borderId: parseInt(xfNode.getAttr('borderId') || '0', 10),
          numFmtId: parseInt(xfNode.getAttr('numFmtId') || '0', 10),
          alignment: alignNode ? {
            horizontal: alignNode.getAttr('horizontal'),
            vertical: alignNode.getAttr('vertical'),
            wrapText: alignNode.getAttr('wrapText') === '1'
          } : null
        });
      }
    }
    if (sheet.cellXfs.length === 0) {
      sheet.cellXfs.push({ fontId: 0, fillId: 0, borderId: 0, numFmtId: 0, alignment: null });
    }

    return sheet;
  }
}
