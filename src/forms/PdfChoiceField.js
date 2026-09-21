import { PdfFormField } from './PdfFormField.js';
import { PdfFieldFlags } from './PdfFieldFlags.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfContentBuilder } from '../content/PdfContentBuilder.js';

/**
 * Interactive choice form field (/FT /Ch) representing Dropdowns (Comboboxes) and Listboxes.
 */
export class PdfChoiceField extends PdfFormField {
  get isCombo() {
    return this.hasFlag(PdfFieldFlags.Combo);
  }

  get isMultiSelect() {
    return this.hasFlag(PdfFieldFlags.MultiSelect);
  }

  get isEditable() {
    return this.hasFlag(PdfFieldFlags.Edit);
  }

  /**
   * Returns list of selectable options with value and display label.
   * @returns {Array<{ value: string, label: string }>}
   */
  getOptions() {
    const optObj = this.resolve(this.dictionary.get('Opt'));
    if (!optObj || !optObj.isArray || !optObj.isArray()) {
      return [];
    }

    const options = [];
    for (const itemRef of optObj) {
      const item = this.resolve(itemRef);
      if (item && item.isArray && item.isArray() && item.size() >= 2) {
        const valObj = this.resolve(item.get(0));
        const lblObj = this.resolve(item.get(1));
        options.push({
          value: valObj ? (valObj.value || valObj.name || String(valObj)) : '',
          label: lblObj ? (lblObj.value || lblObj.name || String(lblObj)) : ''
        });
      } else if (item && item.isString && item.isString()) {
        options.push({ value: item.value, label: item.value });
      } else if (item && item.isName && item.isName()) {
        options.push({ value: item.name, label: item.name });
      } else if (typeof item === 'string') {
        options.push({ value: item, label: item });
      }
    }

    return options;
  }

  /**
   * Sets options array.
   * @param {Array<string|{ value: string, label: string }>} options
   * @returns {PdfChoiceField}
   */
  setOptions(options) {
    const optArray = new PdfArray();
    for (const opt of options) {
      if (typeof opt === 'string') {
        optArray.push(PdfString.of(opt));
      } else if (opt && typeof opt === 'object') {
        const pair = new PdfArray([
          PdfString.of(opt.value || opt.label || ''),
          PdfString.of(opt.label || opt.value || '')
        ]);
        optArray.push(pair);
      }
    }
    this.dictionary.set('Opt', optArray);
    return this;
  }

  /**
   * Selects an option by value.
   * @param {string|Array<string>} value
   * @returns {PdfChoiceField}
   */
  select(value) {
    if (Array.isArray(value)) {
      const arr = new PdfArray(value.map(v => PdfString.of(String(v))));
      this.dictionary.set('V', arr);
    } else {
      this.dictionary.set('V', PdfString.of(String(value)));
    }

    // Update /I (indices) if options match
    const opts = this.getOptions();
    if (opts.length > 0) {
      if (Array.isArray(value)) {
        const indices = [];
        for (let i = 0; i < opts.length; i++) {
          if (value.includes(opts[i].value)) indices.push(PdfNumber.of(i));
        }
        this.dictionary.set('I', new PdfArray(indices));
      } else {
        const idx = opts.findIndex(o => o.value === String(value));
        if (idx !== -1) {
          this.dictionary.set('I', new PdfArray([PdfNumber.of(idx)]));
        }
      }
    }

    this.generateAppearances();
    return this;
  }

  /**
   * Generates normal appearance stream for dropdown choice field.
   */
  generateAppearances() {
    const widgets = this.getWidgets();
    const rawVal = this.getValue();
    let textToDisplay = '';

    if (Array.isArray(rawVal)) {
      textToDisplay = rawVal.join(', ');
    } else if (rawVal !== null && rawVal !== undefined) {
      textToDisplay = String(rawVal);
    }

    for (const widget of widgets) {
      const rectObj = this.resolve(widget.get('Rect'));
      if (!rectObj || !rectObj.isArray || !rectObj.isArray()) continue;

      const x1 = rectObj.getNumber(0) || 0;
      const y1 = rectObj.getNumber(1) || 0;
      const x2 = rectObj.getNumber(2) || 0;
      const y2 = rectObj.getNumber(3) || 0;
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      const builder = new PdfContentBuilder();
      builder.saveGraphicsState();

      // Border and background
      builder.setFillColorRgb(1, 1, 1);
      builder.setStrokeColorRgb(0.7, 0.7, 0.7);
      builder.setLineWidth(0.5);
      builder.rectangle(0.5, 0.5, width - 1, height - 1);
      builder.fillAndStroke();

      // Text output
      if (textToDisplay.length > 0) {
        const fontSize = Math.min(10, Math.max(8, height - 6));
        builder.beginText();
        builder.setFont('Helv', fontSize);
        builder.setFillColorRgb(0, 0, 0);
        builder.setTextMatrix(1, 0, 0, 1, 4, (height - fontSize) / 2 + 1);
        builder.showText(textToDisplay);
        builder.endText();
      }

      builder.restoreGraphicsState();

      const streamDict = new PdfDictionary();
      streamDict.set('Type', PdfName.of('XObject'));
      streamDict.set('Subtype', PdfName.of('Form'));
      streamDict.set('BBox', new PdfArray([
        PdfNumber.of(0), PdfNumber.of(0),
        PdfNumber.of(width), PdfNumber.of(height)
      ]));

      const apStream = new PdfStream(streamDict, builder.toBytes());

      let apObjRef = apStream;
      if (this.document && typeof this.document.registerObject === 'function') {
        apObjRef = this.document.registerObject(apStream);
      }

      let apDict = this.resolve(widget.get('AP'));
      if (!apDict || !apDict.isDictionary || !apDict.isDictionary()) {
        apDict = new PdfDictionary();
        widget.set('AP', apDict);
      }
      apDict.set('N', apObjRef);
    }
  }
}
