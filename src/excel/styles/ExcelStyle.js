/**
 * Comprehensive cell styling model supporting Fonts, Fills, Borders, Alignments, and Number Formats.
 */
export class ExcelStyle {
  /**
   * @param {Object} [options={}]
   * @param {Object} [options.font]
   * @param {string} [options.font.name='Calibri']
   * @param {number} [options.font.size=11]
   * @param {boolean} [options.font.bold=false]
   * @param {boolean} [options.font.italic=false]
   * @param {boolean} [options.font.underline=false]
   * @param {string} [options.font.color] ARGB or RGB hex (e.g. "FF0000" or "#FF0000")
   * @param {Object} [options.fill]
   * @param {string} [options.fill.pattern='none'] 'solid' | 'none'
   * @param {string} [options.fill.fgColor] Hex color string
   * @param {Object} [options.border]
   * @param {Object} [options.border.top] { style: 'thin'|'medium'|'thick'|'double', color?: string }
   * @param {Object} [options.border.bottom]
   * @param {Object} [options.border.left]
   * @param {Object} [options.border.right]
   * @param {Object} [options.alignment]
   * @param {string} [options.alignment.horizontal] 'left' | 'center' | 'right' | 'justify'
   * @param {string} [options.alignment.vertical] 'top' | 'center' | 'bottom'
   * @param {boolean} [options.alignment.wrapText=false]
   * @param {string} [options.format] Number format pattern (e.g. "$#,##0.00", "0.0%")
   */
  constructor(options = {}) {
    this.font = {
      name: options.font?.name || 'Calibri',
      size: options.font?.size || 11,
      bold: Boolean(options.font?.bold),
      italic: Boolean(options.font?.italic),
      underline: Boolean(options.font?.underline),
      color: ExcelStyle.normalizeColor(options.font?.color)
    };

    this.fill = {
      pattern: options.fill?.pattern || (options.fill?.fgColor ? 'solid' : 'none'),
      fgColor: ExcelStyle.normalizeColor(options.fill?.fgColor)
    };

    this.border = {
      top: options.border?.top ? { style: options.border.top.style || 'thin', color: ExcelStyle.normalizeColor(options.border.top.color) } : null,
      bottom: options.border?.bottom ? { style: options.border.bottom.style || 'thin', color: ExcelStyle.normalizeColor(options.border.bottom.color) } : null,
      left: options.border?.left ? { style: options.border.left.style || 'thin', color: ExcelStyle.normalizeColor(options.border.left.color) } : null,
      right: options.border?.right ? { style: options.border.right.style || 'thin', color: ExcelStyle.normalizeColor(options.border.right.color) } : null
    };

    this.alignment = {
      horizontal: options.alignment?.horizontal || null,
      vertical: options.alignment?.vertical || null,
      wrapText: Boolean(options.alignment?.wrapText)
    };

    this.format = options.format || null;
  }

  /**
   * Normalizes color string into standard 8-character ARGB hex (e.g. "FFFF0000").
   * @param {string} [color]
   * @returns {string|null}
   */
  static normalizeColor(color) {
    if (!color) return null;
    let clean = String(color).replace(/^#/, '').toUpperCase().trim();
    if (clean.length === 6) {
      return 'FF' + clean;
    }
    if (clean.length === 8) {
      return clean;
    }
    if (clean.length === 3) {
      return 'FF' + clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    }
    return clean;
  }

  /**
   * Creates a clone of this style.
   * @returns {ExcelStyle}
   */
  clone() {
    return new ExcelStyle({
      font: { ...this.font },
      fill: { ...this.fill },
      border: {
        top: this.border.top ? { ...this.border.top } : null,
        bottom: this.border.bottom ? { ...this.border.bottom } : null,
        left: this.border.left ? { ...this.border.left } : null,
        right: this.border.right ? { ...this.border.right } : null
      },
      alignment: { ...this.alignment },
      format: this.format
    });
  }

  /**
   * Returns unique hash key representing this style combination.
   * @returns {string}
   */
  getKey() {
    return JSON.stringify({
      f: this.font,
      fl: this.fill,
      b: this.border,
      a: this.alignment,
      fmt: this.format
    });
  }
}
