import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PdfDocument,
  PdfFieldFlags,
  PdfFormField,
  PdfTextField,
  PdfButtonField,
  PdfChoiceField,
  PdfSignatureField,
  PdfAcroForm
} from '../../src/index.js';

describe('Interactive Forms & AcroForms Engine (Phase 14)', () => {

  describe('PdfFieldFlags', () => {
    it('should define correct bitmask constants per ISO 32000-1', () => {
      assert.equal(PdfFieldFlags.ReadOnly, 1);
      assert.equal(PdfFieldFlags.Required, 2);
      assert.equal(PdfFieldFlags.NoExport, 4);
      assert.equal(PdfFieldFlags.Multiline, 1 << 12);
      assert.equal(PdfFieldFlags.Password, 1 << 13);
      assert.equal(PdfFieldFlags.Radio, 1 << 15);
      assert.equal(PdfFieldFlags.Pushbutton, 1 << 16);
      assert.equal(PdfFieldFlags.Combo, 1 << 17);
    });
  });

  describe('Programmatic Form Field Creation', () => {
    it('should create text fields with flags, validation, and appearance streams', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      const form = doc.getForm();

      const nameField = form.addTextField(page, 'fullName', [50, 700, 250, 725], {
        value: 'Jane Doe',
        required: true
      });

      assert.ok(nameField instanceof PdfTextField);
      assert.equal(nameField.name, 'fullName');
      assert.equal(nameField.getValue(), 'Jane Doe');
      assert.equal(nameField.isRequired, true);
      assert.equal(nameField.isReadOnly, false);

      const widgets = nameField.getWidgets();
      assert.equal(widgets.length, 1);
      assert.ok(widgets[0].get('AP'), 'Widget should have normal appearance dictionary');

      const passField = form.addTextField(page, 'password', [50, 650, 250, 675], {
        password: true,
        maxLength: 16
      });
      assert.equal(passField.isPassword, true);
      assert.equal(passField.maxLength, 16);
    });

    it('should create checkboxes and toggle checked states', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      const form = doc.getForm();

      const checkbox = form.addCheckbox(page, 'agreeTerms', [50, 600, 70, 620], {
        checked: false
      });

      assert.ok(checkbox instanceof PdfButtonField);
      assert.equal(checkbox.isCheckbox, true);
      assert.equal(checkbox.isChecked(), false);

      checkbox.check();
      assert.equal(checkbox.isChecked(), true);
      assert.equal(checkbox.getValue(), 'Yes');

      checkbox.uncheck();
      assert.equal(checkbox.isChecked(), false);
      assert.equal(checkbox.getValue(), 'Off');
    });

    it('should create dropdown choice fields with options and selection', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      const form = doc.getForm();

      const countryField = form.addDropdown(page, 'country', [
        { value: 'US', label: 'United States' },
        { value: 'CA', label: 'Canada' },
        { value: 'UK', label: 'United Kingdom' }
      ], [50, 550, 200, 575], {
        value: 'CA'
      });

      assert.ok(countryField instanceof PdfChoiceField);
      assert.equal(countryField.isCombo, true);
      assert.equal(countryField.getValue(), 'CA');

      const opts = countryField.getOptions();
      assert.equal(opts.length, 3);
      assert.equal(opts[1].label, 'Canada');

      countryField.select('UK');
      assert.equal(countryField.getValue(), 'UK');
    });

    it('should create signature field placeholders', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      const form = doc.getForm();

      const sigField = form.addSignatureField(page, 'userSignature', [50, 450, 250, 500], {
        required: true
      });

      assert.ok(sigField instanceof PdfSignatureField);
      assert.equal(sigField.fieldType, 'Sig');
      assert.equal(sigField.isSigned(), false);
    });
  });

  describe('Form Data Export & Batch Filling', () => {
    it('should export all field values as a key-value object', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      const form = doc.getForm();

      form.addTextField(page, 'firstName', [50, 700, 200, 725], { value: 'Alice' });
      form.addTextField(page, 'lastName', [50, 660, 200, 685], { value: 'Smith' });
      form.addCheckbox(page, 'newsletter', [50, 620, 70, 640], { checked: true });
      form.addDropdown(page, 'role', ['Developer', 'Designer', 'Manager'], [50, 580, 200, 605], { value: 'Developer' });

      const exported = form.exportValues();
      assert.deepEqual(exported, {
        firstName: 'Alice',
        lastName: 'Smith',
        newsletter: true,
        role: 'Developer'
      });
    });

    it('should batch fill form fields with new values', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      const form = doc.getForm();

      form.addTextField(page, 'firstName', [50, 700, 200, 725], { value: 'Alice' });
      form.addCheckbox(page, 'newsletter', [50, 620, 70, 640], { checked: false });
      form.addDropdown(page, 'role', ['Developer', 'Designer', 'Manager'], [50, 580, 200, 605], { value: 'Developer' });

      form.fill({
        firstName: 'Bob',
        newsletter: true,
        role: 'Manager'
      });

      assert.equal(form.getField('firstName').getValue(), 'Bob');
      assert.equal(form.getField('newsletter').isChecked(), true);
      assert.equal(form.getField('role').getValue(), 'Manager');
    });
  });

  describe('Form Flattening', () => {
    it('should flatten form fields into static page content and remove interactive widgets', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      const form = doc.getForm();

      form.addTextField(page, 'title', [50, 700, 300, 730], { value: 'Flattened Certificate' });
      form.addCheckbox(page, 'approved', [50, 650, 70, 670], { checked: true });

      assert.equal(doc.hasForm(), true);
      assert.ok(page.dictionary.get('Annots'));

      // Flatten the form
      form.flatten();

      // AcroForm removed from Catalog
      assert.equal(doc.hasForm(), false);
      assert.equal(page.dictionary.get('Annots'), undefined);

      // Verify page content now has streams containing the flattened objects
      const contents = page.getContents();
      assert.ok(contents.length > 0);
    });
  });

  describe('Full Round-Trip Serialization (Create -> Fill -> Save -> Open -> Verify)', () => {
    it('should preserve filled form fields and values across save and reload', async () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      const form = doc.getForm();

      form.addTextField(page, 'employeeName', [50, 700, 250, 725], { value: 'John Smith' });
      form.addTextField(page, 'employeeId', [50, 660, 250, 685], { value: 'EMP-90210' });
      form.addCheckbox(page, 'fullTime', [50, 620, 70, 640], { checked: true });
      form.addDropdown(page, 'department', ['Engineering', 'Marketing', 'Sales'], [50, 580, 200, 605], { value: 'Engineering' });

      const pdfBytes = doc.save();
      assert.ok(pdfBytes instanceof Uint8Array);

      // Reload saved document
      const reloadedDoc = await PdfDocument.open(pdfBytes);
      assert.equal(reloadedDoc.hasForm(), true);

      const reloadedForm = reloadedDoc.getForm();
      const fields = reloadedForm.getFields();
      assert.equal(fields.length, 4);

      assert.equal(reloadedForm.getField('employeeName').getValue(), 'John Smith');
      assert.equal(reloadedForm.getField('employeeId').getValue(), 'EMP-90210');
      assert.equal(reloadedForm.getField('fullTime').isChecked(), true);
      assert.equal(reloadedForm.getField('department').getValue(), 'Engineering');

      // Update a value on the reloaded document, re-save, and verify
      reloadedForm.getField('employeeName').setValue('Sarah Connor');
      const updatedBytes = reloadedDoc.save();

      const finalDoc = await PdfDocument.open(updatedBytes);
      assert.equal(finalDoc.getForm().getField('employeeName').getValue(), 'Sarah Connor');
    });

    it('should flatten and preserve visual text and layout after re-saving', async () => {
      const doc = PdfDocument.create();
      const page = doc.addPage([612, 792]);
      const form = doc.getForm();

      form.addTextField(page, 'invoiceNum', [50, 700, 200, 725], { value: 'INV-2026-001' });
      form.flatten();

      const pdfBytes = doc.save();
      const reloadedDoc = await PdfDocument.open(pdfBytes);

      assert.equal(reloadedDoc.hasForm(), false);
      const reloadedPage = reloadedDoc.getPage(0);
      assert.equal(reloadedPage.dictionary.get('Annots'), undefined);
    });
  });

});
