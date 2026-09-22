import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfFieldFlags } from './PdfFieldFlags.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Base class representing an interactive form field in a PDF document.
 */
export class PdfFormField {
  /** @type {PdfDictionary} */
  #dictionary;

  /** @type {Object} Parent PdfDocument */
  #document;

  /** @type {PdfFormField|null} */
  #parent;

  /**
   * @param {PdfDictionary} dictionary
   * @param {Object} document
   * @param {PdfFormField|null} [parent=null]
   */
  constructor(dictionary, document, parent = null) {
    if (!(dictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('dictionary', dictionary, 'PdfDictionary');
    }
    this.#dictionary = dictionary;
    this.#document = document;
    this.#parent = parent;
  }

  get dictionary() {
    return this.#dictionary;
  }

  get document() {
    return this.#document;
  }

  get parent() {
    return this.#parent;
  }

  /**
   * Helper to resolve indirect references.
   * @protected
   */
  resolve(obj) {
    if (this.#document && typeof this.#document.resolve === 'function') {
      return this.#document.resolve(obj);
    }
    return obj;
  }

  /**
   * Returns the partial field name (/T).
   * @returns {string}
   */
  get name() {
    const t = this.resolve(this.#dictionary.get('T'));
    if (!t) return '';
    return t.isString && t.isString() ? t.value : String(t);
  }

  /**
   * Returns the fully-qualified field name (e.g. "personal.address.city").
   * @returns {string}
   */
  get fullyQualifiedName() {
    const parts = [];
    let current = this;
    while (current) {
      const n = current.name;
      if (n) {
        parts.unshift(n);
      }
      current = current.parent;
    }
    return parts.join('.');
  }

  /**
   * Returns the field type (/FT), inherited from parent if not defined directly.
   * @returns {string} 'Tx' | 'Btn' | 'Ch' | 'Sig' | ''
   */
  get fieldType() {
    let current = this;
    while (current) {
      const ft = this.resolve(current.dictionary.get('FT'));
      if (ft && ft.isName && ft.isName()) {
        return ft.name;
      }
      current = current.parent;
    }
    return '';
  }

  /**
   * Returns field flags (/Ff), inherited from parent if not defined.
   * @returns {number}
   */
  get flags() {
    let current = this;
    while (current) {
      const ff = this.resolve(current.dictionary.get('Ff'));
      if (ff && ff.isNumber && ff.isNumber()) {
        return ff.intValue();
      }
      current = current.parent;
    }
    return 0;
  }

  /**
   * Checks if a flag is enabled.
   * @param {number} flag
   * @returns {boolean}
   */
  hasFlag(flag) {
    return (this.flags & flag) !== 0;
  }

  get isReadOnly() {
    return this.hasFlag(PdfFieldFlags.ReadOnly);
  }

  get isRequired() {
    return this.hasFlag(PdfFieldFlags.Required);
  }

  get isNoExport() {
    return this.hasFlag(PdfFieldFlags.NoExport);
  }

  /**
   * Returns the current field value (/V).
   * @returns {any}
   */
  getValue() {
    let current = this;
    while (current) {
      const v = this.resolve(current.dictionary.get('V'));
      if (v !== undefined && v !== null) {
        if (v.isString && v.isString()) return v.value;
        if (v.isName && v.isName()) return v.name;
        if (v.isNumber && v.isNumber()) return v.value;
        if (v.isArray && v.isArray()) return v.elements.map(e => (e.value !== undefined ? e.value : e.name));
        return v;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Returns the default value (/DV).
   * @returns {any}
   */
  getDefaultValue() {
    let current = this;
    while (current) {
      const dv = this.resolve(current.dictionary.get('DV'));
      if (dv !== undefined && dv !== null) {
        if (dv.isString && dv.isString()) return dv.value;
        if (dv.isName && dv.isName()) return dv.name;
        return dv;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Returns all widget annotation dictionaries associated with this field.
   * @returns {Array<PdfDictionary>}
   */
  getWidgets() {
    const subtype = this.resolve(this.#dictionary.get('Subtype'));
    if (subtype && subtype.isName && subtype.isName() && subtype.name === 'Widget') {
      return [this.#dictionary];
    }

    const kids = this.resolve(this.#dictionary.get('Kids'));
    if (kids && kids.isArray && kids.isArray()) {
      const widgets = [];
      for (const kidRef of kids) {
        const kid = this.resolve(kidRef);
        if (kid && kid.isDictionary && kid.isDictionary()) {
          const kSubtype = this.resolve(kid.get('Subtype'));
          if (kSubtype && kSubtype.isName && kSubtype.isName() && kSubtype.name === 'Widget') {
            widgets.push(kid);
          }
        }
      }
      if (widgets.length > 0) {
        return widgets;
      }
    }

    // Default return self if it contains Rect
    if (this.#dictionary.get('Rect')) {
      return [this.#dictionary];
    }

    return [];
  }

  /**
   * Returns bounding box [x1, y1, x2, y2] from the first widget annotation.
   * @returns {Array<number>}
   */
  getRect() {
    const widgets = this.getWidgets();
    if (widgets.length > 0) {
      const r = this.resolve(widgets[0].get('Rect'));
      if (r && r.isArray && r.isArray() && r.size() >= 4) {
        return [r.getNumber(0), r.getNumber(1), r.getNumber(2), r.getNumber(3)];
      }
    }
    return [0, 0, 0, 0];
  }

  /**
   * Returns Default Appearance string (/DA).
   * @returns {string}
   */
  getDefaultAppearance() {
    let current = this;
    while (current) {
      const da = this.resolve(current.dictionary.get('DA'));
      if (da && da.isString && da.isString()) {
        return da.value;
      }
      current = current.parent;
    }
    return '/Helv 12 Tf 0 g';
  }

  /**
   * Sets the field value and regenerates appearances.
   * @param {any} value
   * @returns {PdfFormField}
   */
  setValue(value) {
    if (value === null || value === undefined) {
      this.#dictionary.delete('V');
    } else if (typeof value === 'string') {
      this.#dictionary.set('V', PdfString.of(value));
    } else if (typeof value === 'boolean') {
      this.#dictionary.set('V', PdfName.of(value ? 'Yes' : 'Off'));
    } else if (typeof value === 'number') {
      this.#dictionary.set('V', PdfString.of(String(value)));
    } else {
      this.#dictionary.set('V', value);
    }

    this.generateAppearances();
    return this;
  }

  /**
   * Normalizes and exports the field value for data export.
   * @returns {any}
   */
  exportValue() {
    return this.getValue();
  }

  /**
   * Abstract / base appearance generator hook.
   */
  generateAppearances() {
    // Specialized subclasses override this
  }
}
