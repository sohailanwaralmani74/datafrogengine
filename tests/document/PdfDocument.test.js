import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfDocument } from '../../src/document/PdfDocument.js';
import { PdfStructureException } from '../../src/errors/index.js';
import { PdfXRefEntry } from '../../src/xref/PdfXRefEntry.js';

/**
 * Builds a syntactically and mathematically valid PDF with exact byte offsets.
 */
function buildTestPdf(objects, trailerEntries, header = '%PDF-1.7') {
  let body = `${header}\n`;
  const offsets = {};

  for (const [objNumStr, content] of Object.entries(objects)) {
    const objNum = parseInt(objNumStr, 10);
    offsets[objNum] = body.length;
    body += `${objNum} 0 obj\n${content}\nendobj\n`;
  }

  const startXRef = body.length;
  const maxObjNum = Math.max(0, ...Object.keys(objects).map(Number));
  let xref = `xref\n0 ${maxObjNum + 1}\n0000000000 65535 f \n`;

  for (let i = 1; i <= maxObjNum; i++) {
    if (offsets[i] !== undefined) {
      xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    } else {
      xref += '0000000000 00000 f \n';
    }
  }

  body += xref;
  body += `trailer\n<< /Size ${maxObjNum + 1} ${trailerEntries} >>\n`;
  body += `startxref\n${startXRef}\n%%EOF`;

  return new TextEncoder().encode(body).buffer;
}

describe('Modern PDF Document Structure (Phase 5)', () => {
  describe('Basic PDF Document & Page Inspection', () => {
    it('should open document and inspect version, pages, dimensions, and metadata', async () => {
      const pdfBuffer = buildTestPdf({
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Kids [ 3 0 R 4 0 R ] /Count 2 /MediaBox [0 0 612 792] >>',
        3: '<< /Type /Page /Parent 2 0 R /Rotate 90 /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
        4: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] >>',
        5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        6: '<< /Length 15 >>\nstream\nBT /F1 12 Tf ET\nendstream',
        7: '<< /Title (Sample PDF Title) /Author (John Doe) /Creator (PDF Engine Test Suite) >>'
      }, '/Root 1 0 R /Info 7 0 R', '%PDF-1.7');

      const pdf = await PdfDocument.open(pdfBuffer);

      // PDF Version
      assert.equal(pdf.getPdfVersion(), '1.7');

      // Page Count
      assert.equal(pdf.getPageCount(), 2);

      // Page 0 (inherited MediaBox [0, 0, 612, 792], rotated 90 deg -> visual width 792, height 612)
      const page0 = pdf.getPage(0);
      assert.equal(page0.pageIndex, 0);
      assert.deepEqual(page0.getMediaBox(), [0, 0, 612, 792]);
      assert.equal(page0.getRotation(), 90);
      assert.equal(pdf.getPageRotation(0), 90);
      assert.deepEqual(page0.getSize(), { width: 792, height: 612 });
      assert.deepEqual(pdf.getPageSize(0), { width: 792, height: 612 });

      // Page 0 Resources and Contents
      const res0 = page0.getResources();
      const fontF1 = res0.getFont('F1');
      assert.notEqual(fontF1, null);
      assert.equal(fontF1.getName('BaseFont'), 'Helvetica');

      const contents = page0.getContents();
      assert.equal(contents.length, 1);
      assert.equal(contents[0].length, 15);

      // Page 1 (overridden A4 MediaBox [0, 0, 595.28, 841.89], rotation 0)
      const page1 = pdf.getPage(1);
      assert.equal(page1.pageIndex, 1);
      assert.deepEqual(page1.getMediaBox(), [0, 0, 595.28, 841.89]);
      assert.equal(page1.getRotation(), 0);
      assert.deepEqual(page1.getSize(), { width: 595.28, height: 841.89 });

      // Metadata
      const metadata = pdf.getMetadata();
      assert.equal(metadata.title, 'Sample PDF Title');
      assert.equal(metadata.author, 'John Doe');
      assert.equal(metadata.creator, 'PDF Engine Test Suite');
    });
  });

  describe('Hierarchical Page Tree', () => {
    it('should recursively traverse multi-level /Pages branches', async () => {
      // Tree: Root Pages (2 0 R) -> Branch 1 (3 0 R) -> Page 5 0 R
      //                          -> Branch 2 (4 0 R) -> Page 6 0 R, Page 7 0 R
      const pdfBuffer = buildTestPdf({
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Kids [ 3 0 R 4 0 R ] /Count 3 >>',
        3: '<< /Type /Pages /Parent 2 0 R /Kids [ 5 0 R ] /Count 1 >>',
        4: '<< /Type /Pages /Parent 2 0 R /Kids [ 6 0 R 7 0 R ] /Count 2 >>',
        5: '<< /Type /Page /Parent 3 0 R /MediaBox [0 0 100 100] >>',
        6: '<< /Type /Page /Parent 4 0 R /MediaBox [0 0 200 200] >>',
        7: '<< /Type /Page /Parent 4 0 R /MediaBox [0 0 300 300] >>'
      }, '/Root 1 0 R');

      const pdf = await PdfDocument.open(pdfBuffer);
      assert.equal(pdf.getPageCount(), 3);
      assert.deepEqual(pdf.getPage(0).getMediaBox(), [0, 0, 100, 100]);
      assert.deepEqual(pdf.getPage(1).getMediaBox(), [0, 0, 200, 200]);
      assert.deepEqual(pdf.getPage(2).getMediaBox(), [0, 0, 300, 300]);
    });

    it('should throw PdfStructureException on out-of-bounds page access', async () => {
      const pdfBuffer = buildTestPdf({
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>',
        3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'
      }, '/Root 1 0 R');

      const pdf = await PdfDocument.open(pdfBuffer);
      assert.equal(pdf.getPageCount(), 1);
      assert.throws(() => pdf.getPage(5), PdfStructureException);
    });
  });

  describe('Object Streams (/ObjStm) (PDF 1.5+)', () => {
    it('should resolve compressed objects from an Object Stream', async () => {
      // Create objects inside object stream:
      // Obj 3: << /Type /Page /MediaBox [0 0 612 792] >>
      // Obj 4: << /Type /Font /BaseFont /Courier >>
      const obj3Str = '<< /Type /Page /MediaBox [0 0 612 792] >>';
      const obj4Str = '<< /Type /Font /BaseFont /Courier >>';

      const off0 = 0;
      const off1 = obj3Str.length + 1; // 1 for space/newline
      const headerTable = `3 ${off0} 4 ${off1}\n`;
      const firstOffset = headerTable.length;
      const objStmBody = `${headerTable}${obj3Str}\n${obj4Str}`;

      const pdfBuffer = buildTestPdf({
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>',
        10: `<< /Type /ObjStm /N 2 /First ${firstOffset} /Length ${objStmBody.length} >>\nstream\n${objStmBody}\nendstream`
      }, '/Root 1 0 R', '%PDF-1.5');

      const doc = await PdfDocument.open(pdfBuffer);

      // Register compressed objects 3 and 4 located in ObjStm 10
      const table = doc.getXRefTable();
      table.addEntry(PdfXRefEntry.createCompressed(3, 10, 0), true);
      table.addEntry(PdfXRefEntry.createCompressed(4, 10, 1), true);

      assert.equal(doc.getPageCount(), 1);
      const page = doc.getPage(0);
      assert.deepEqual(page.getMediaBox(), [0, 0, 612, 792]);

      const fontObj = doc.resolveObject(4);
      assert.notEqual(fontObj, null);
      assert.equal(fontObj.getName('BaseFont'), 'Courier');
    });
  });
});
