import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfBinaryReader } from '../../src/core/PdfBinaryReader.js';
import { PdfParser } from '../../src/core/PdfParser.js';
import { PdfLexer } from '../../src/core/PdfLexer.js';
import { PdfXRefTable, PdfXRefEntry, PdfTrailer } from '../../src/xref/index.js';
import { PdfDictionary } from '../../src/objects/PdfDictionary.js';
import { PdfName } from '../../src/objects/PdfName.js';
import { PdfNumber } from '../../src/objects/PdfNumber.js';
import { PdfReference } from '../../src/objects/PdfReference.js';
import { PdfXRefException } from '../../src/errors/index.js';

describe('Cross-Reference Parser (Phase 4)', () => {
  describe('PdfXRefEntry', () => {
    it('should create and inspect in-use entries', () => {
      const entry = PdfXRefEntry.createInUse(1, 1024, 0);
      assert.equal(entry.objectNumber, 1);
      assert.equal(entry.offset, 1024);
      assert.equal(entry.generationNumber, 0);
      assert.equal(entry.isInUse(), true);
      assert.equal(entry.isFree(), false);
      assert.equal(entry.isCompressed(), false);
    });

    it('should create and inspect free entries', () => {
      const entry = PdfXRefEntry.createFree(0, 0, 65535);
      assert.equal(entry.objectNumber, 0);
      assert.equal(entry.isFree(), true);
      assert.equal(entry.isInUse(), false);
      assert.equal(entry.generationNumber, 65535);
    });

    it('should create and inspect compressed entries', () => {
      const entry = PdfXRefEntry.createCompressed(15, 12, 3);
      assert.equal(entry.objectNumber, 15);
      assert.equal(entry.isCompressed(), true);
      assert.equal(entry.streamObjectNumber, 12);
      assert.equal(entry.indexInStream, 3);
    });
  });

  describe('PdfTrailer', () => {
    it('should provide typed getters for trailer keys', () => {
      const dict = new PdfDictionary();
      dict.set('Size', PdfNumber.of(10));
      dict.set('Root', PdfReference.of(1, 0));
      dict.set('Info', PdfReference.of(2, 0));
      dict.set('Prev', PdfNumber.of(500));

      const trailer = new PdfTrailer(dict);
      assert.equal(trailer.getSize(), 10);
      assert.equal(trailer.getRoot().objectNumber, 1);
      assert.equal(trailer.getInfo().objectNumber, 2);
      assert.equal(trailer.getPrevOffset(), 500);
    });

    it('should merge earlier trailer keys preserving current entries', () => {
      const currentDict = new PdfDictionary();
      currentDict.set('Size', PdfNumber.of(12));
      currentDict.set('Prev', PdfNumber.of(200));

      const prevDict = new PdfDictionary();
      prevDict.set('Size', PdfNumber.of(8));
      prevDict.set('Root', PdfReference.of(1, 0));
      prevDict.set('Info', PdfReference.of(2, 0));

      const currentTrailer = new PdfTrailer(currentDict);
      const prevTrailer = new PdfTrailer(prevDict);

      currentTrailer.mergeWith(prevTrailer);

      assert.equal(currentTrailer.getSize(), 12); // kept current
      assert.equal(currentTrailer.getRoot().objectNumber, 1); // inherited from prev
      assert.equal(currentTrailer.getInfo().objectNumber, 2); // inherited from prev
    });
  });

  describe('PdfXRefTable - startxref discovery', () => {
    it('should locate startxref at the end of a document', () => {
      const pdfText = '%PDF-1.4\n%...\nstartxref\n18520\n%%EOF';
      const reader = new PdfBinaryReader(new TextEncoder().encode(pdfText).buffer);

      const offset = PdfXRefTable.findStartXRefOffset(reader);
      assert.equal(offset, 18520);
    });

    it('should throw when startxref is missing', () => {
      const pdfText = '%PDF-1.4\n%...\n%%EOF';
      const reader = new PdfBinaryReader(new TextEncoder().encode(pdfText).buffer);

      assert.throws(() => PdfXRefTable.findStartXRefOffset(reader), PdfXRefException);
    });
  });

  describe('PdfXRefTable - Traditional XRef Parsing', () => {
    it('should parse single section xref table with trailer', () => {
      const pdf = 
`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<<
  /Size 4
  /Root 1 0 R
>>
startxref
160
%%EOF`;

      const reader = new PdfBinaryReader(new TextEncoder().encode(pdf).buffer);
      const startXRef = reader.indexOf('xref');
      const table = PdfXRefTable.parseFrom(reader, startXRef);

      assert.equal(table.size(), 4);
      assert.equal(table.hasEntry(0), true);
      assert.equal(table.getEntry(0).isFree(), true);

      assert.equal(table.hasEntry(1), true);
      assert.equal(table.getEntry(1).offset, 9);
      assert.equal(table.getEntry(1).isInUse(), true);

      assert.equal(table.getEntry(2).offset, 58);
      assert.equal(table.getEntry(3).offset, 115);

      const trailer = table.getTrailer();
      assert.equal(trailer.getSize(), 4);
      assert.equal(trailer.getRoot().objectNumber, 1);
    });

    it('should parse multi-subsection xref table', () => {
      const xrefSnippet = 
`xref
0 2
0000000000 65535 f 
0000000015 00000 n 
5 2
0000000120 00000 n 
0000000185 00000 n 
trailer
<<
  /Size 7
  /Root 1 0 R
>>`;

      const reader = new PdfBinaryReader(new TextEncoder().encode(xrefSnippet).buffer);
      const table = PdfXRefTable.parseFrom(reader, 0);

      assert.equal(table.size(), 4);
      assert.equal(table.hasEntry(0), true);
      assert.equal(table.hasEntry(1), true);
      assert.equal(table.hasEntry(5), true);
      assert.equal(table.hasEntry(6), true);

      assert.equal(table.getEntry(5).offset, 120);
      assert.equal(table.getEntry(6).offset, 185);
      assert.equal(table.getHighestObjectNumber(), 6);
    });

    it('should parse incremental updates and merge xref tables via /Prev', () => {
      // Step 1: initial document
      const initialPart = 
`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
xref
0 2
0000000000 65535 f 
0000000009 00000 n 
trailer
<< /Size 2 /Root 1 0 R >>
startxref
57
%%EOF
`;
      const firstXRefOffset = initialPart.indexOf('xref');

      // Step 2: updated document appending object 2 and new xref with /Prev
      const updateHeader = 
`2 0 obj
<< /Type /Pages /Count 0 >>
endobj
`;
      const secondXRefOffset = initialPart.length + updateHeader.indexOf('xref') + (updateHeader.includes('xref') ? 0 : updateHeader.length);
      const updateBody = 
`xref
2 1
0000000118 00000 n 
trailer
<< /Size 3 /Root 1 0 R /Prev ${firstXRefOffset} >>
startxref
${secondXRefOffset}
%%EOF`;

      const fullPdf = initialPart + updateHeader + updateBody;
      const reader = new PdfBinaryReader(new TextEncoder().encode(fullPdf).buffer);

      const latestStartXRef = PdfXRefTable.findStartXRefOffset(reader);
      assert.equal(latestStartXRef, secondXRefOffset);

      const table = PdfXRefTable.parseFrom(reader, latestStartXRef);

      // Should have entries from both initial (0, 1) and update (2)
      assert.equal(table.hasEntry(0), true);
      assert.equal(table.hasEntry(1), true);
      assert.equal(table.hasEntry(2), true);
      assert.equal(table.getEntry(1).offset, 9);
      assert.equal(table.getEntry(2).offset, 118);
      assert.equal(table.getTrailer().getSize(), 3);
      assert.equal(table.getTrailer().getRoot().objectNumber, 1);
    });
  });

  describe('Direct Object Seeking with XRef Table', () => {
    it('should directly locate and parse objects using xref offsets', () => {
      const pdf = 
`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 5 >>
endobj
xref
0 3
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
trailer
<< /Size 3 /Root 1 0 R >>
startxref
100
%%EOF`;

      const reader = new PdfBinaryReader(new TextEncoder().encode(pdf).buffer);
      const table = PdfXRefTable.parseFrom(reader, reader.indexOf('xref'));

      // Directly seek to object 2 without scanning object 1
      const obj2Entry = table.getEntry(2);
      assert.equal(obj2Entry.offset, 58);

      reader.seek(obj2Entry.offset);
      const parser = new PdfParser(new PdfLexer(reader));
      const obj2 = parser.parseIndirectObject();

      assert.equal(obj2.objectNumber, 2);
      assert.equal(obj2.value.getName('Type'), 'Pages');
      assert.equal(obj2.value.getNumber('Count'), 5);
    });
  });
});
