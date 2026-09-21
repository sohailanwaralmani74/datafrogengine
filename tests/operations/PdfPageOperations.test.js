import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PdfDocument,
  PdfPageOperations,
  PdfWriter,
  PdfNumber,
  PdfName,
  PdfDictionary,
  PdfStream
} from '../../src/index.js';

describe('Page Operations & Writer (Phase 11)', () => {
  describe('PdfDocument.create and addPage', () => {
    it('should create an empty PDF document in memory and add blank pages', () => {
      const doc = PdfDocument.create({ version: '1.7' });
      assert.equal(doc.getPageCount(), 0);
      assert.equal(doc.getPdfVersion(), '1.7');

      const p1 = doc.addPage(612, 792);
      assert.equal(doc.getPageCount(), 1);
      assert.deepEqual(p1.getMediaBox(), [0, 0, 612, 792]);

      const p2 = doc.addPage(500, 400);
      assert.equal(doc.getPageCount(), 2);
      assert.deepEqual(p2.getMediaBox(), [0, 0, 500, 400]);
    });
  });

  describe('Page Rotation', () => {
    it('should set absolute and relative page rotations', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage();
      assert.equal(page.getRotation(), 0);

      // Set absolute rotation
      doc.rotatePage(0, 90);
      assert.equal(page.getRotation(), 90);

      // Relative rotation
      doc.rotatePage(0, 90, true);
      assert.equal(page.getRotation(), 180);

      // Relative negative rotation
      doc.rotatePage(0, -90, true);
      assert.equal(page.getRotation(), 90);

      // rotateAllPages
      doc.addPage();
      PdfPageOperations.rotateAllPages(doc, 270);
      assert.equal(doc.getPage(0).getRotation(), 270);
      assert.equal(doc.getPage(1).getRotation(), 270);
    });
  });

  describe('Page Deletion and Movement', () => {
    it('should remove pages and update page count', () => {
      const doc = PdfDocument.create();
      doc.addPage(100, 100); // Page 0
      doc.addPage(200, 200); // Page 1
      doc.addPage(300, 300); // Page 2
      assert.equal(doc.getPageCount(), 3);

      // Remove page 1
      const removed = doc.removePage(1);
      assert.equal(removed.getMediaBox()[2], 200);
      assert.equal(doc.getPageCount(), 2);
      assert.equal(doc.getPage(0).getMediaBox()[2], 100);
      assert.equal(doc.getPage(1).getMediaBox()[2], 300);
    });

    it('should move pages from one index to another', () => {
      const doc = PdfDocument.create();
      doc.addPage(100, 100); // Page 0
      doc.addPage(200, 200); // Page 1
      doc.addPage(300, 300); // Page 2

      // Move page 0 to index 2 (end)
      doc.movePage(0, 2);
      assert.equal(doc.getPage(0).getMediaBox()[2], 200);
      assert.equal(doc.getPage(1).getMediaBox()[2], 300);
      assert.equal(doc.getPage(2).getMediaBox()[2], 100);
    });
  });

  describe('Page Extraction, Split, and Merge', () => {
    it('should extract specific pages into a new document', () => {
      const doc = PdfDocument.create();
      doc.addPage(100, 100); // 0
      doc.addPage(200, 200); // 1
      doc.addPage(300, 300); // 2
      doc.addPage(400, 400); // 3

      const extracted = doc.extractPages([0, 2]);
      assert.equal(extracted.getPageCount(), 2);
      assert.equal(extracted.getPage(0).getMediaBox()[2], 100);
      assert.equal(extracted.getPage(1).getMediaBox()[2], 300);
    });

    it('should split document into individual 1-page documents', () => {
      const doc = PdfDocument.create();
      doc.addPage(100, 100);
      doc.addPage(200, 200);
      doc.addPage(300, 300);

      const parts = doc.split();
      assert.equal(parts.length, 3);
      assert.equal(parts[0].getPageCount(), 1);
      assert.equal(parts[0].getPage(0).getMediaBox()[2], 100);
      assert.equal(parts[1].getPageCount(), 1);
      assert.equal(parts[1].getPage(0).getMediaBox()[2], 200);
      assert.equal(parts[2].getPageCount(), 1);
      assert.equal(parts[2].getPage(0).getMediaBox()[2], 300);
    });

    it('should split document at specific boundary indices', () => {
      const doc = PdfDocument.create();
      for (let i = 0; i < 5; i++) {
        doc.addPage((i + 1) * 100, (i + 1) * 100);
      }

      // Split at index 2: [0, 1] and [2, 3, 4]
      const parts = doc.splitAt([2]);
      assert.equal(parts.length, 2);
      assert.equal(parts[0].getPageCount(), 2);
      assert.equal(parts[1].getPageCount(), 3);
      assert.equal(parts[0].getPage(1).getMediaBox()[2], 200);
      assert.equal(parts[1].getPage(0).getMediaBox()[2], 300);
    });

    it('should merge multiple documents into a single document', () => {
      const doc1 = PdfDocument.create();
      doc1.addPage(100, 100);
      doc1.addPage(200, 200);

      const doc2 = PdfDocument.create();
      doc2.addPage(300, 300);
      doc2.addPage(400, 400);
      doc2.addPage(500, 500);

      const merged = PdfDocument.merge([doc1, doc2]);
      assert.equal(merged.getPageCount(), 5);
      assert.equal(merged.getPage(0).getMediaBox()[2], 100);
      assert.equal(merged.getPage(1).getMediaBox()[2], 200);
      assert.equal(merged.getPage(2).getMediaBox()[2], 300);
      assert.equal(merged.getPage(3).getMediaBox()[2], 400);
      assert.equal(merged.getPage(4).getMediaBox()[2], 500);
    });
  });

  describe('Full Round-Trip Serialization (save -> open)', () => {
    it('should save a created document and re-open it preserving structure and content', async () => {
      const doc = PdfDocument.create({ version: '1.6' });

      // Build Page 1 with a content stream
      const fontDict = new PdfDictionary();
      fontDict.set('Type', PdfName.of('Font'));
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Helvetica'));
      const fontRef = doc.registerObject(fontDict);

      const fontsDict = new PdfDictionary();
      fontsDict.set('F1', fontRef);

      const resDict = new PdfDictionary();
      resDict.set('Font', fontsDict);
      const resRef = doc.registerObject(resDict);

      const content = 'BT /F1 14 Tf 50 700 Td (Round Trip Success!) Tj ET';
      const contentBytes = new TextEncoder().encode(content);
      const streamDict = new PdfDictionary();
      const contentStream = new PdfStream(streamDict, contentBytes);
      const contentRef = doc.registerObject(contentStream);

      const p1 = doc.addPage(612, 792);
      p1.dictionary.set('Resources', resRef);
      p1.dictionary.set('Contents', contentRef);
      doc.rotatePage(0, 90);

      // Add Page 2
      doc.addPage(400, 300);

      // Save to PDF Uint8Array
      const pdfBytes = doc.save();
      assert.ok(pdfBytes instanceof Uint8Array);
      assert.ok(pdfBytes.length > 200);

      // Re-open saved bytes
      const reloadedDoc = await PdfDocument.open(pdfBytes);
      assert.equal(reloadedDoc.getPageCount(), 2);
      assert.equal(reloadedDoc.getPdfVersion(), '1.6');

      // Check Page 1
      const reloadedP1 = reloadedDoc.getPage(0);
      assert.equal(reloadedP1.getRotation(), 90);
      assert.deepEqual(reloadedP1.getMediaBox(), [0, 0, 612, 792]);

      // Verify text extraction from reloaded PDF
      const extractedText = reloadedDoc.extractText(0);
      assert.ok(extractedText.includes('Round Trip Success!'));

      // Check Page 2
      const reloadedP2 = reloadedDoc.getPage(1);
      assert.deepEqual(reloadedP2.getMediaBox(), [0, 0, 400, 300]);
    });
  });
});
