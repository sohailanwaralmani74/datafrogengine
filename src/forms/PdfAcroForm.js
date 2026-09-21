import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfBoolean } from '../objects/PdfBoolean.js';
import { PdfFormField } from './PdfFormField.js';
import { PdfTextField } from './PdfTextField.js';
import { PdfButtonField } from './PdfButtonField.js';
import { PdfChoiceField } from './PdfChoiceField.js';
import { PdfSignatureField } from './PdfSignatureField.js';
import { PdfFieldFlags } from './PdfFieldFlags.js';
import { pageExtractionHelper } from '../document/PdfPage.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';


/**
 * High-level manager for interactive PDF AcroForms.
 */
export class PdfAcroForm {
  /** @type {PdfDictionary} */
  #dictionary;

  /** @type {Object} Parent PdfDocument */
  #document;

  /**
   * @param {PdfDictionary} dictionary
   * @param {Object} document
   */
  constructor(dictionary, document) {
    if (!(dictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('dictionary', dictionary, 'PdfDictionary');
    }
    this.#dictionary = dictionary;
    this.#document = document;
  }

  get dictionary() {
    return this.#dictionary;
  }

  get document() {
    return this.#document;
  }

  /**
   * Helper to resolve indirect objects.
   * @private
   */
  #resolve(obj) {
    if (this.#document && typeof this.#document.resolve === 'function') {
      return this.#document.resolve(obj);
    }
    return obj;
  }

  /**
   * Factory method to wrap a field dictionary into the appropriate specialized PdfFormField subclass.
   * 
   * @param {PdfDictionary} fieldDict
   * @param {PdfFormField|null} [parent=null]
   * @returns {PdfFormField}
   */
  wrapField(fieldDict, parent = null) {
    // Determine /FT
    let ftName = '';
    let current = fieldDict;
    while (current) {
      const ft = this.#resolve(current.get('FT'));
      if (ft && ft.isName && ft.isName()) {
        ftName = ft.name;
        break;
      }
      const parentRef = this.#resolve(current.get('Parent'));
      current = parentRef && parentRef.isDictionary && parentRef.isDictionary() ? parentRef : null;
    }

    if (!ftName && parent) {
      ftName = parent.fieldType;
    }

    switch (ftName) {
      case 'Tx':
        return new PdfTextField(fieldDict, this.#document, parent);
      case 'Btn':
        return new PdfButtonField(fieldDict, this.#document, parent);
      case 'Ch':
        return new PdfChoiceField(fieldDict, this.#document, parent);
      case 'Sig':
        return new PdfSignatureField(fieldDict, this.#document, parent);
      default:
        return new PdfFormField(fieldDict, this.#document, parent);
    }
  }

  /**
   * Returns all terminal form fields in the document.
   * 
   * @returns {Array<PdfFormField>}
   */
  getFields() {
    const fieldsArray = this.#resolve(this.#dictionary.get('Fields'));
    if (!fieldsArray || !fieldsArray.isArray || !fieldsArray.isArray()) {
      return [];
    }

    const result = [];
    for (const fieldRef of fieldsArray) {
      const fieldDict = this.#resolve(fieldRef);
      if (fieldDict && fieldDict.isDictionary && fieldDict.isDictionary()) {
        this.#collectTerminalFields(fieldDict, null, result);
      }
    }

    return result;
  }

  /**
   * @private
   */
  #collectTerminalFields(dict, parentField, result) {
    const field = this.wrapField(dict, parentField);
    const kids = this.#resolve(dict.get('Kids'));

    if (!kids || !kids.isArray || !kids.isArray() || kids.size() === 0) {
      result.push(field);
      return;
    }

    // Check if kids are widgets of the same field or sub-fields
    let hasSubFields = false;
    for (const kidRef of kids) {
      const kidDict = this.#resolve(kidRef);
      if (kidDict && kidDict.isDictionary && kidDict.isDictionary()) {
        // If kid has its own /T name or /FT, it's a subfield
        if (kidDict.get('T') || kidDict.get('FT')) {
          hasSubFields = true;
          this.#collectTerminalFields(kidDict, field, result);
        }
      }
    }

    if (!hasSubFields) {
      result.push(field);
    }
  }

  /**
   * Finds a field by its partial name (/T) or fully-qualified name.
   * 
   * @param {string} name
   * @returns {PdfFormField|null}
   */
  getField(name) {
    if (!name || typeof name !== 'string') return null;

    const fields = this.getFields();
    for (const f of fields) {
      if (f.name === name || f.fullyQualifiedName === name) {
        return f;
      }
    }
    return null;
  }

  /**
   * Exports all form field values as a key-value JavaScript object.
   * 
   * @returns {Record<string, any>}
   */
  exportValues() {
    const data = {};
    const fields = this.getFields();
    for (const f of fields) {
      const key = f.fullyQualifiedName || f.name;
      if (key) {
        data[key] = f.exportValue();
      }
    }
    return data;
  }

  /**
   * Batch fills fields from a key-value object.
   * 
   * @param {Record<string, any>} data
   * @returns {PdfAcroForm}
   */
  fill(data) {
    if (!data || typeof data !== 'object') {
      return this;
    }

    for (const [key, value] of Object.entries(data)) {
      const field = this.getField(key);
      if (field) {
        if (field instanceof PdfTextField) {
          field.setText(value);
        } else if (field instanceof PdfChoiceField) {
          field.select(value);
        } else if (field instanceof PdfButtonField) {
          field.setValue(value);
        } else {
          field.setValue(value);
        }
      }
    }

    return this;
  }

  /**
   * Ensures default resources and appearances (/DR, /DA) exist in AcroForm dictionary.
   * @private
   */
  #ensureDefaultResources() {
    if (!this.#dictionary.get('DR')) {
      const drDict = new PdfDictionary();
      const fontDict = new PdfDictionary();
      const helvDict = new PdfDictionary();
      helvDict.set('Type', PdfName.of('Font'));
      helvDict.set('Subtype', PdfName.of('Type1'));
      helvDict.set('BaseFont', PdfName.of('Helvetica'));

      const helvRef = this.#document.registerObject(helvDict);
      fontDict.set('Helv', helvRef);
      drDict.set('Font', fontDict);

      const drRef = this.#document.registerObject(drDict);
      this.#dictionary.set('DR', drRef);
    }

    if (!this.#dictionary.get('DA')) {
      this.#dictionary.set('DA', PdfString.of('/Helv 12 Tf 0 g'));
    }

    if (!this.#dictionary.get('Fields')) {
      const fieldsArr = new PdfArray();
      const fieldsRef = this.#document.registerObject(fieldsArr);
      this.#dictionary.set('Fields', fieldsRef);
    }
  }

  /**
   * Attaches a widget annotation to the specified page's /Annots array.
   * @private
   */
  #attachToPage(page, widgetDictRef) {
    const pageDict = page.dictionary;
    let annots = this.#resolve(pageDict.get('Annots'));

    if (!annots || !annots.isArray || !annots.isArray()) {
      annots = new PdfArray();
      const annotsRef = this.#document.registerObject(annots);
      pageDict.set('Annots', annotsRef);
    }

    annots.push(widgetDictRef);
  }

  /**
   * Adds a text input field to a page.
   * 
   * @param {Object} page - PdfPage
   * @param {string} name
   * @param {Array<number>} rect - [x1, y1, x2, y2]
   * @param {Object} [options={}]
   * @returns {PdfTextField}
   */
  addTextField(page, name, rect, options = {}) {
    this.#ensureDefaultResources();

    const fieldDict = new PdfDictionary();
    fieldDict.set('Type', PdfName.of('Annot'));
    fieldDict.set('Subtype', PdfName.of('Widget'));
    fieldDict.set('FT', PdfName.of('Tx'));
    fieldDict.set('T', PdfString.of(name));
    fieldDict.set('Rect', new PdfArray([
      PdfNumber.of(rect[0]), PdfNumber.of(rect[1]),
      PdfNumber.of(rect[2]), PdfNumber.of(rect[3])
    ]));

    let flags = 0;
    if (options.readOnly) flags |= PdfFieldFlags.ReadOnly;
    if (options.required) flags |= PdfFieldFlags.Required;
    if (options.multiline) flags |= PdfFieldFlags.Multiline;
    if (options.password) flags |= PdfFieldFlags.Password;
    if (flags !== 0) {
      fieldDict.set('Ff', PdfNumber.of(flags));
    }

    if (options.maxLength) {
      fieldDict.set('MaxLen', PdfNumber.of(options.maxLength));
    }

    const fontSize = options.fontSize || 12;
    fieldDict.set('DA', PdfString.of(`/Helv ${fontSize} Tf 0 g`));

    const fieldRef = this.#document.registerObject(fieldDict);

    // Add to AcroForm /Fields
    const fieldsArr = this.#resolve(this.#dictionary.get('Fields'));
    fieldsArr.push(fieldRef);

    // Add to Page /Annots
    this.#attachToPage(page, fieldRef);

    const textField = new PdfTextField(fieldDict, this.#document);
    if (options.defaultValue !== undefined || options.value !== undefined) {
      textField.setText(options.value !== undefined ? options.value : options.defaultValue);
    } else {
      textField.generateAppearances();
    }

    return textField;
  }

  /**
   * Adds a checkbox field to a page.
   * 
   * @param {Object} page - PdfPage
   * @param {string} name
   * @param {Array<number>} rect - [x1, y1, x2, y2]
   * @param {Object} [options={}]
   * @returns {PdfButtonField}
   */
  addCheckbox(page, name, rect, options = {}) {
    this.#ensureDefaultResources();

    const fieldDict = new PdfDictionary();
    fieldDict.set('Type', PdfName.of('Annot'));
    fieldDict.set('Subtype', PdfName.of('Widget'));
    fieldDict.set('FT', PdfName.of('Btn'));
    fieldDict.set('T', PdfString.of(name));
    fieldDict.set('Rect', new PdfArray([
      PdfNumber.of(rect[0]), PdfNumber.of(rect[1]),
      PdfNumber.of(rect[2]), PdfNumber.of(rect[3])
    ]));

    let flags = 0;
    if (options.readOnly) flags |= PdfFieldFlags.ReadOnly;
    if (options.required) flags |= PdfFieldFlags.Required;
    if (flags !== 0) {
      fieldDict.set('Ff', PdfNumber.of(flags));
    }

    const fieldRef = this.#document.registerObject(fieldDict);

    // Add to AcroForm /Fields
    const fieldsArr = this.#resolve(this.#dictionary.get('Fields'));
    fieldsArr.push(fieldRef);

    // Add to Page /Annots
    this.#attachToPage(page, fieldRef);

    const checkboxField = new PdfButtonField(fieldDict, this.#document);
    if (options.checked || options.value === true) {
      checkboxField.check();
    } else {
      checkboxField.uncheck();
    }

    return checkboxField;
  }

  /**
   * Adds a dropdown choice field to a page.
   * 
   * @param {Object} page - PdfPage
   * @param {string} name
   * @param {Array<string|{ value: string, label: string }>} optionsList
   * @param {Array<number>} rect - [x1, y1, x2, y2]
   * @param {Object} [options={}]
   * @returns {PdfChoiceField}
   */
  addDropdown(page, name, optionsList, rect, options = {}) {
    this.#ensureDefaultResources();

    const fieldDict = new PdfDictionary();
    fieldDict.set('Type', PdfName.of('Annot'));
    fieldDict.set('Subtype', PdfName.of('Widget'));
    fieldDict.set('FT', PdfName.of('Ch'));
    fieldDict.set('T', PdfString.of(name));
    fieldDict.set('Rect', new PdfArray([
      PdfNumber.of(rect[0]), PdfNumber.of(rect[1]),
      PdfNumber.of(rect[2]), PdfNumber.of(rect[3])
    ]));

    let flags = PdfFieldFlags.Combo; // Default dropdown
    if (options.editable) flags |= PdfFieldFlags.Edit;
    if (options.readOnly) flags |= PdfFieldFlags.ReadOnly;
    if (options.required) flags |= PdfFieldFlags.Required;
    fieldDict.set('Ff', PdfNumber.of(flags));

    const fieldRef = this.#document.registerObject(fieldDict);

    // Add to AcroForm /Fields
    const fieldsArr = this.#resolve(this.#dictionary.get('Fields'));
    fieldsArr.push(fieldRef);

    // Add to Page /Annots
    this.#attachToPage(page, fieldRef);

    const choiceField = new PdfChoiceField(fieldDict, this.#document);
    choiceField.setOptions(optionsList);

    if (options.value !== undefined) {
      choiceField.select(options.value);
    } else if (optionsList.length > 0) {
      const firstVal = typeof optionsList[0] === 'string' ? optionsList[0] : optionsList[0].value;
      choiceField.select(firstVal);
    }

    return choiceField;
  }

  /**
   * Adds a signature field placeholder to a page.
   * 
   * @param {Object} page - PdfPage
   * @param {string} name
   * @param {Array<number>} rect - [x1, y1, x2, y2]
   * @param {Object} [options={}]
   * @returns {PdfSignatureField}
   */
  addSignatureField(page, name, rect, options = {}) {
    this.#ensureDefaultResources();

    const fieldDict = new PdfDictionary();
    fieldDict.set('Type', PdfName.of('Annot'));
    fieldDict.set('Subtype', PdfName.of('Widget'));
    fieldDict.set('FT', PdfName.of('Sig'));
    fieldDict.set('T', PdfString.of(name));
    fieldDict.set('Rect', new PdfArray([
      PdfNumber.of(rect[0]), PdfNumber.of(rect[1]),
      PdfNumber.of(rect[2]), PdfNumber.of(rect[3])
    ]));

    let flags = 0;
    if (options.readOnly) flags |= PdfFieldFlags.ReadOnly;
    if (options.required) flags |= PdfFieldFlags.Required;
    if (flags !== 0) {
      fieldDict.set('Ff', PdfNumber.of(flags));
    }

    const fieldRef = this.#document.registerObject(fieldDict);

    // Add to AcroForm /Fields
    const fieldsArr = this.#resolve(this.#dictionary.get('Fields'));
    fieldsArr.push(fieldRef);

    // Add to Page /Annots
    this.#attachToPage(page, fieldRef);

    return new PdfSignatureField(fieldDict, this.#document);
  }

  /**
   * Flattens interactive form fields into static page content and strips interactive widgets.
   * 
   * @returns {Object} Parent PdfDocument
   */
  flatten() {
    const pageCount = this.#document.getPageCount();

    for (let p = 0; p < pageCount; p++) {
      const page = this.#document.getPage(p);
      const annots = this.#resolve(page.dictionary.get('Annots'));
      if (!annots || !annots.isArray || !annots.isArray()) {
        continue;
      }

      const nonWidgetAnnots = [];
      const modifier = page.getModifier();

      for (const annotRef of annots) {
        const annot = this.#resolve(annotRef);
        if (!annot || !annot.isDictionary || !annot.isDictionary()) {
          nonWidgetAnnots.push(annotRef);
          continue;
        }

        const subtype = this.#resolve(annot.get('Subtype'));
        if (subtype && subtype.isName && subtype.isName() && subtype.name === 'Widget') {
          // Flatten widget appearance onto page
          const rectObj = this.#resolve(annot.get('Rect'));
          if (rectObj && rectObj.isArray && rectObj.isArray() && rectObj.size() >= 4) {
            const x1 = rectObj.getNumber(0) || 0;
            const y1 = rectObj.getNumber(1) || 0;
            const x2 = rectObj.getNumber(2) || 0;
            const y2 = rectObj.getNumber(3) || 0;
            const width = Math.abs(x2 - x1);
            const height = Math.abs(y2 - y1);

            // Fetch normal appearance stream
            const ap = this.#resolve(annot.get('AP'));
            if (ap && ap.isDictionary && ap.isDictionary()) {
              let n = this.#resolve(ap.get('N'));
              const as = this.#resolve(annot.get('AS'));

              if (n && n.isDictionary && n.isDictionary() && !n.isStream && !n.isStream()) {
                const asKey = as && as.isName ? as.name : 'Off';
                n = this.#resolve(n.get(asKey)) || this.#resolve(n.get('Yes')) || this.#resolve(n.get('Off'));
              }

              if (n && n.isStream && n.isStream()) {
                // Register as XObject in page resources and draw via modifier
                const res = page.dictionary.get('Resources') ? this.#resolve(page.dictionary.get('Resources')) : null;
                let xObjectDict = res ? this.#resolve(res.get('XObject')) : null;
                if (!xObjectDict || !xObjectDict.isDictionary || !xObjectDict.isDictionary()) {
                  xObjectDict = new PdfDictionary();
                  if (res) res.set('XObject', xObjectDict);
                }

                const xObjKey = `FlatForm${Math.floor(Math.random() * 100000)}`;
                const nRef = this.#document.registerObject(n);
                xObjectDict.set(xObjKey, nRef);

                modifier.builder.saveGraphicsState();
                modifier.builder.translate(x1, y1);
                modifier.builder.drawXObject(xObjKey);
                modifier.builder.restoreGraphicsState();
              }
            }
          }
        } else {
          nonWidgetAnnots.push(annotRef);
        }
      }

      modifier.commit();

      if (nonWidgetAnnots.length > 0) {
        page.dictionary.set('Annots', new PdfArray(nonWidgetAnnots));
      } else {
        page.dictionary.delete('Annots');
      }
    }

    // Remove AcroForm from Catalog
    const catalog = this.#document.getCatalog();
    catalog.dictionary.delete('AcroForm');

    return this.#document;
  }
}

pageExtractionHelper.PdfAcroForm = PdfAcroForm;

