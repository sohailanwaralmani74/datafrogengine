import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CMap } from '../../src/fonts/CMap.js';
import { PdfFont } from '../../src/fonts/PdfFont.js';
import { Type1Font } from '../../src/fonts/Type1Font.js';
import { TrueTypeFont } from '../../src/fonts/TrueTypeFont.js';
import { Type0Font } from '../../src/fonts/Type0Font.js';
import { PdfTextExtractor } from '../../src/extraction/PdfTextExtractor.js';
import { PdfDictionary } from '../../src/objects/PdfDictionary.js';
import { PdfArray } from '../../src/objects/PdfArray.js';
import { PdfName } from '../../src/objects/PdfName.js';
import { PdfNumber } from '../../src/objects/PdfNumber.js';
import { PdfString } from '../../src/objects/PdfString.js';
import { PdfStream } from '../../src/objects/PdfStream.js';
import { PdfPage } from '../../src/document/PdfPage.js';
import { PdfResources } from '../../src/document/PdfResources.js';

describe('Fonts & Text Extraction (Phase 8)', () => {
  describe('CMap', () => {
    it('should parse beginbfchar mappings from a CMap string', () => {
      const cmapStr = `
        /CIDInit /ProcSet findresource begin
        12 dict begin begincmap
        /CIDSystemInfo << /Registry (Test) /Ordering (Identity) /Supplement 0 >> def
        /CMapName /TestMap def
        3 beginbfchar
        <0041> <0048>
        <0042> <0065>
        <0043> <006C>
        endbfchar
        endcmap
      `;

      const cmap = CMap.parse(cmapStr);
      assert.equal(cmap.size, 3);
      assert.equal(cmap.mapCode(0x41), 'H');
      assert.equal(cmap.mapCode(0x42), 'e');
      assert.equal(cmap.mapCode(0x43), 'l');
      assert.equal(cmap.mapCode(0x44), null);
    });

    it('should parse beginbfrange mappings from a CMap string', () => {
      const cmapStr = `
        1 beginbfrange
        <0041> <0043> <0061>
        endbfrange
      `;

      const cmap = CMap.parse(cmapStr);
      assert.equal(cmap.size, 3);
      // 0x41 -> 0x61 ('a'), 0x42 -> 0x62 ('b'), 0x43 -> 0x63 ('c')
      assert.equal(cmap.mapCode(0x41), 'a');
      assert.equal(cmap.mapCode(0x42), 'b');
      assert.equal(cmap.mapCode(0x43), 'c');
    });

    it('should decode byte strings using the CMap', () => {
      const cmap = new CMap();
      cmap.addMapping(72, 'H');
      cmap.addMapping(101, 'e');
      cmap.addMapping(108, 'l');
      cmap.addMapping(111, 'o');

      const decoded = cmap.decodeString('Hello', false);
      assert.equal(decoded, 'Hello');
    });
  });

  describe('PdfFont', () => {
    it('should create a Type1Font from a font dictionary', () => {
      const fontDict = new PdfDictionary();
      fontDict.set('Type', PdfName.of('Font'));
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Helvetica'));

      const font = PdfFont.create(fontDict);
      assert.ok(font instanceof Type1Font);
      assert.equal(font.baseFont, 'Helvetica');
      assert.equal(font.subtype, 'Type1');
    });

    it('should decode single-byte characters using WinAnsiEncoding fallback', () => {
      const fontDict = new PdfDictionary();
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Helvetica'));

      const font = new Type1Font(fontDict);
      // Standard ASCII codes decode to themselves
      assert.equal(font.decodeGlyph(65), 'A');
      assert.equal(font.decodeGlyph(97), 'a');
      assert.equal(font.decodeGlyph(32), ' ');
    });

    it('should decode using a /ToUnicode CMap when present', () => {
      const cmapStr = `
        1 beginbfchar
        <01> <0048>
        endbfchar
      `;
      const cmapBytes = new TextEncoder().encode(cmapStr);
      const cmapStream = new PdfStream(new PdfDictionary(), cmapBytes);

      const fontDict = new PdfDictionary();
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('TestFont'));
      fontDict.set('ToUnicode', cmapStream);

      const font = new Type1Font(fontDict);
      assert.equal(font.decodeGlyph(1), 'H');
    });

    it('should return glyph widths from /Widths array', () => {
      const fontDict = new PdfDictionary();
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Helvetica'));
      fontDict.set('FirstChar', PdfNumber.of(65));
      fontDict.set('LastChar', PdfNumber.of(67));
      fontDict.set('Widths', new PdfArray([
        PdfNumber.of(700), PdfNumber.of(800), PdfNumber.of(650)
      ]));

      const font = new Type1Font(fontDict);
      assert.equal(font.getWidth(65), 700);
      assert.equal(font.getWidth(66), 800);
      assert.equal(font.getWidth(67), 650);
      // Fallback for unmapped code
      assert.ok(font.getWidth(90) > 0);
    });

    it('should create TrueTypeFont and Type0Font from factory', () => {
      const ttDict = new PdfDictionary();
      ttDict.set('Subtype', PdfName.of('TrueType'));
      ttDict.set('BaseFont', PdfName.of('ArialMT'));
      const ttFont = PdfFont.create(ttDict);
      assert.ok(ttFont instanceof TrueTypeFont);

      const t0Dict = new PdfDictionary();
      t0Dict.set('Subtype', PdfName.of('Type0'));
      t0Dict.set('BaseFont', PdfName.of('MS-Gothic'));
      t0Dict.set('DescendantFonts', new PdfArray([new PdfDictionary()]));
      const t0Font = PdfFont.create(t0Dict);
      assert.ok(t0Font instanceof Type0Font);
    });
  });

  describe('PdfTextExtractor', () => {
    /**
     * Builds a minimal mock PdfPage with a content stream and font resources.
     */
    function buildMockPage(contentString, fonts = {}) {
      // Build font resource dictionaries
      const fontDictMap = new PdfDictionary();
      for (const [name, fontDict] of Object.entries(fonts)) {
        fontDictMap.set(name, fontDict);
      }

      const resourcesDict = new PdfDictionary();
      resourcesDict.set('Font', fontDictMap);

      const contentBytes = new TextEncoder().encode(contentString);

      const pageDict = new PdfDictionary();
      pageDict.set('Type', PdfName.of('Page'));
      pageDict.set('MediaBox', new PdfArray([
        PdfNumber.of(0), PdfNumber.of(0), PdfNumber.of(612), PdfNumber.of(792)
      ]));
      pageDict.set('Resources', resourcesDict);
      pageDict.set('Contents', new PdfStream(new PdfDictionary(), contentBytes));

      // Minimal document mock
      const mockDoc = {
        resolve: (obj) => obj
      };

      return new PdfPage(pageDict, 0, mockDoc);
    }

    it('should extract text items from a simple content stream', () => {
      const fontDict = new PdfDictionary();
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Helvetica'));

      const content = `
        BT
        /F1 12 Tf
        1 0 0 1 72 720 Tm
        (Hello World) Tj
        ET
      `;

      const page = buildMockPage(content, { F1: fontDict });
      const items = PdfTextExtractor.extractTextItems(page);

      assert.ok(items.length >= 1);
      assert.equal(items[0].text, 'Hello World');
      assert.equal(items[0].x, 72);
      assert.equal(items[0].y, 720);
      assert.equal(items[0].fontSize, 12);
      assert.equal(items[0].fontName, 'Helvetica');
    });

    it('should extract text from multiple Td-positioned lines', () => {
      const fontDict = new PdfDictionary();
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Courier'));

      const content = `
        BT
        /F1 10 Tf
        1 0 0 1 50 700 Tm
        (Line One) Tj
        0 -15 Td
        (Line Two) Tj
        0 -15 Td
        (Line Three) Tj
        ET
      `;

      const page = buildMockPage(content, { F1: fontDict });
      const items = PdfTextExtractor.extractTextItems(page);

      assert.equal(items.length, 3);
      assert.equal(items[0].text, 'Line One');
      assert.equal(items[0].y, 700);
      assert.equal(items[1].text, 'Line Two');
      assert.equal(items[1].y, 685);
      assert.equal(items[2].text, 'Line Three');
      assert.equal(items[2].y, 670);
    });

    it('should extract plain text in reading order via extractText()', () => {
      const fontDict = new PdfDictionary();
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Courier'));

      const content = `
        BT
        /F1 10 Tf
        1 0 0 1 50 700 Tm
        (First Line) Tj
        0 -20 Td
        (Second Line) Tj
        ET
      `;

      const page = buildMockPage(content, { F1: fontDict });
      const text = PdfTextExtractor.extractText(page);

      assert.ok(text.includes('First Line'));
      assert.ok(text.includes('Second Line'));
      // First Line should appear before Second Line in reading order
      assert.ok(text.indexOf('First Line') < text.indexOf('Second Line'));
    });

    it('should handle TJ arrays with kerning adjustments', () => {
      const fontDict = new PdfDictionary();
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Helvetica'));

      const content = `
        BT
        /F1 12 Tf
        1 0 0 1 100 500 Tm
        [ (He) 10 (llo) ] TJ
        ET
      `;

      const page = buildMockPage(content, { F1: fontDict });
      const items = PdfTextExtractor.extractTextItems(page);

      assert.ok(items.length >= 2);
      assert.equal(items[0].text, 'He');
      assert.equal(items[1].text, 'llo');
    });
  });
});
