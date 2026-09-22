import { PdfFormField } from './PdfFormField.js';
import { PdfFieldFlags } from './PdfFieldFlags.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfContentBuilder } from '../content/PdfContentBuilder.js';

/**
 * Interactive text input form field (/FT /Tx).
 */
export class PdfTextField extends PdfFormField {
  get isMultiline() {
    return this.hasFlag(PdfFieldFlags.Multiline);
  }

  get isPassword() {
    return this.hasFlag(PdfFieldFlags.Password);
  }

  get maxLength() {
    const ml = this.resolve(this.dictionary.get('MaxLen'));
    return ml && ml.isNumber && ml.isNumber() ? ml.intValue() : null;
  }

  get alignment() {
    const q = this.resolve(this.dictionary.get('Q'));
    return q && q.isNumber && q.isNumber() ? q.intValue() : 0; // 0 = Left, 1 = Center, 2 = Right
  }

  /**
   * Sets text value and updates appearance.
   * @param {string} text
   * @returns {PdfTextField}
   */
  setText(text) {
    let val = String(text ?? '');
    if (this.maxLength && val.length > this.maxLength) {
      val = val.slice(0, this.maxLength);
    }
    this.setValue(val);
    return this;
  }

  /**
   * Generates normal appearance stream (/AP -> /N) for all attached widgets.
   */
  generateAppearances() {
    const widgets = this.getWidgets();
    const rawVal = this.getValue();
    let textToDisplay = rawVal !== null && rawVal !== undefined ? String(rawVal) : '';

    if (this.isPassword && textToDisplay.length > 0) {
      textToDisplay = '•'.repeat(textToDisplay.length);
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

      // Font and size: parse DA or default
      const da = this.getDefaultAppearance();
      let fontSize = 12;
      const daMatch = da.match(/\/([A-Za-z0-9]+)\s+([0-9.]+)\s+Tf/);
      if (daMatch) {
        fontSize = parseFloat(daMatch[2]) || 12;
      }
      if (fontSize === 0 || fontSize > height - 4) {
        fontSize = Math.max(8, height - 6);
      }

      // Clipping area
      builder.rectangle(0, 0, width, height);
      builder.clip();
      builder.endPath();

      // Text output
      if (textToDisplay.length > 0) {
        builder.beginText();
        builder.setFont('Helv', fontSize);
        builder.setFillColorRgb(0, 0, 0);

        const paddingX = 3;
        const textY = (height - fontSize) / 2 + 1;

        let textX = paddingX;
        if (this.alignment === 1) { // Center
          const approxTextWidth = textToDisplay.length * fontSize * 0.55;
          textX = Math.max(paddingX, (width - approxTextWidth) / 2);
        } else if (this.alignment === 2) { // Right
          const approxTextWidth = textToDisplay.length * fontSize * 0.55;
          textX = Math.max(paddingX, width - approxTextWidth - paddingX);
        }

        builder.setTextMatrix(1, 0, 0, 1, textX, Math.max(2, textY));
        builder.showText(textToDisplay);
        builder.endText();
      }

      builder.restoreGraphicsState();

      // Create stream object
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
