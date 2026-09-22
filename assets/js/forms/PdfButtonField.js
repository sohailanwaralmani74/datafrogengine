import { PdfFormField } from './PdfFormField.js';
import { PdfFieldFlags } from './PdfFieldFlags.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfContentBuilder } from '../content/PdfContentBuilder.js';

/**
 * Interactive button form field (/FT /Btn) representing Checkboxes, Radio Buttons, and Pushbuttons.
 */
export class PdfButtonField extends PdfFormField {
  get isPushButton() {
    return this.hasFlag(PdfFieldFlags.Pushbutton);
  }

  get isRadio() {
    return this.hasFlag(PdfFieldFlags.Radio);
  }

  get isCheckbox() {
    return !this.isPushButton && !this.isRadio;
  }

  /**
   * Returns export value for the 'on' state (defaults to 'Yes').
   * @returns {string}
   */
  getOnValue() {
    const widgets = this.getWidgets();
    for (const widget of widgets) {
      const ap = this.resolve(widget.get('AP'));
      if (ap && ap.isDictionary && ap.isDictionary()) {
        const n = this.resolve(ap.get('N'));
        if (n && n.isDictionary && n.isDictionary()) {
          for (const key of n.keys()) {
            if (key !== 'Off') {
              return key;
            }
          }
        }
      }
    }
    return 'Yes';
  }

  /**
   * Checks whether checkbox is checked or radio button is active.
   * @returns {boolean}
   */
  isChecked() {
    const val = this.getValue();
    if (!val) return false;
    const strVal = String(val);
    return strVal !== 'Off' && strVal !== 'false' && strVal !== '0' && strVal !== '';
  }

  /**
   * Checks the checkbox.
   * @returns {PdfButtonField}
   */
  check() {
    const onVal = this.getOnValue();
    this.setValue(onVal);
    return this;
  }

  /**
   * Unchecks the checkbox.
   * @returns {PdfButtonField}
   */
  uncheck() {
    this.setValue('Off');
    return this;
  }

  /**
   * Sets value for button/radio/checkbox.
   * @param {string|boolean} value
   * @returns {PdfButtonField}
   */
  setValue(value) {
    let nameVal;
    if (typeof value === 'boolean') {
      nameVal = value ? this.getOnValue() : 'Off';
    } else if (typeof value === 'string') {
      nameVal = value;
    } else {
      nameVal = String(value);
    }

    this.dictionary.set('V', PdfName.of(nameVal));

    // Update appearance state /AS on all widgets
    const widgets = this.getWidgets();
    for (const widget of widgets) {
      widget.set('AS', PdfName.of(nameVal));
    }

    this.generateAppearances();
    return this;
  }

  /**
   * Normalizes value for export.
   * @returns {boolean|string}
   */
  exportValue() {
    if (this.isCheckbox) {
      return this.isChecked();
    }
    return this.getValue();
  }

  /**
   * Generates normal appearance streams for checkboxes and radio buttons.
   */
  generateAppearances() {
    const widgets = this.getWidgets();
    const isChecked = this.isChecked();
    const onValue = this.getOnValue();

    for (const widget of widgets) {
      const rectObj = this.resolve(widget.get('Rect'));
      if (!rectObj || !rectObj.isArray || !rectObj.isArray()) continue;

      const x1 = rectObj.getNumber(0) || 0;
      const y1 = rectObj.getNumber(1) || 0;
      const x2 = rectObj.getNumber(2) || 0;
      const y2 = rectObj.getNumber(3) || 0;
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      // Create stream for ON appearance
      const onStream = this.#buildAppearanceStream(width, height, true, this.isRadio);
      // Create stream for OFF appearance
      const offStream = this.#buildAppearanceStream(width, height, false, this.isRadio);

      let onRef = onStream;
      let offRef = offStream;
      if (this.document && typeof this.document.registerObject === 'function') {
        onRef = this.document.registerObject(onStream);
        offRef = this.document.registerObject(offStream);
      }

      const nDict = new PdfDictionary();
      nDict.set(onValue, onRef);
      nDict.set('Off', offRef);

      const apDict = new PdfDictionary();
      apDict.set('N', nDict);

      widget.set('AP', apDict);
      widget.set('AS', PdfName.of(isChecked ? onValue : 'Off'));
    }
  }

  /**
   * @private
   */
  #buildAppearanceStream(width, height, isOn, isRadio) {
    const builder = new PdfContentBuilder();
    builder.saveGraphicsState();

    if (isRadio) {
      // Radio circle outline
      const radius = Math.min(width, height) / 2 - 1;
      const cx = width / 2;
      const cy = height / 2;

      builder.setFillColorRgb(1, 1, 1);
      builder.setStrokeColorRgb(0.2, 0.2, 0.2);
      builder.setLineWidth(1);
      builder.circle(cx, cy, radius);
      builder.fillAndStroke();

      if (isOn) {
        // Inner dot
        builder.setFillColorRgb(0, 0, 0);
        builder.circle(cx, cy, radius * 0.5);
        builder.fill();
      }
    } else {
      // Checkbox rectangle outline
      builder.setFillColorRgb(1, 1, 1);
      builder.setStrokeColorRgb(0.2, 0.2, 0.2);
      builder.setLineWidth(1);
      builder.rectangle(1, 1, width - 2, height - 2);
      builder.fillAndStroke();

      if (isOn) {
        // Draw cross / checkmark
        builder.setStrokeColorRgb(0, 0, 0);
        builder.setLineWidth(1.5);
        const padX = width * 0.25;
        const padY = height * 0.25;
        builder.moveTo(padX, padY);
        builder.lineTo(width - padX, height - padY);
        builder.moveTo(padX, height - padY);
        builder.lineTo(width - padX, padY);
        builder.stroke();
      }
    }

    builder.restoreGraphicsState();

    const streamDict = new PdfDictionary();
    streamDict.set('Type', PdfName.of('XObject'));
    streamDict.set('Subtype', PdfName.of('Form'));
    streamDict.set('BBox', new PdfArray([
      PdfNumber.of(0), PdfNumber.of(0),
      PdfNumber.of(width), PdfNumber.of(height)
    ]));

    return new PdfStream(streamDict, builder.toBytes());
  }
}
