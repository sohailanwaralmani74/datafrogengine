import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PdfDocument,
  PdfDocumentBuilder,
  PdfPageSizes,
  PdfFontMetrics,
  PdfParagraph,
  PdfTable,
  PdfSpacer,
  PdfDivider,
  PdfImageElement
} from '../../src/index.js';

describe('PDF Generation Engine & Document Builder (Phase 13)', () => {

  describe('PdfPageSizes', () => {
    it('should resolve standard page dimensions and orientations', () => {
      const a4Portrait = PdfPageSizes.resolveDimensions('A4', 'portrait');
      assert.deepEqual(a4Portrait, [595.28, 841.89]);

      const a4Landscape = PdfPageSizes.resolveDimensions('A4', 'landscape');
      assert.deepEqual(a4Landscape, [841.89, 595.28]);

      const letter = PdfPageSizes.resolveDimensions('LETTER');
      assert.deepEqual(letter, [612, 792]);

      const custom = PdfPageSizes.resolveDimensions([400, 600], 'landscape');
      assert.deepEqual(custom, [600, 400]);
    });

    it('should throw on invalid page size name', () => {
      assert.throws(() => {
        PdfPageSizes.resolveDimensions('INVALID_SIZE');
      });
    });
  });

  describe('PdfFontMetrics', () => {
    it('should accurately measure string widths for standard fonts', () => {
      const helveticaWidth = PdfFontMetrics.measureTextWidth('Hello World', 'Helvetica', 12);
      assert.ok(helveticaWidth > 0 && helveticaWidth < 100);

      const courierWidth = PdfFontMetrics.measureTextWidth('Hello', 'Courier', 10);
      // Courier is 600 units per char -> 5 * 0.6 * 10 = 30 points
      assert.equal(courierWidth, 30);
    });

    it('should wrap text across lines based on available width', () => {
      const longText = 'The quick brown fox jumps over the lazy dog and runs freely across the green fields.';
      const lines = PdfFontMetrics.wrapText(longText, 150, 'Helvetica', 12);

      assert.ok(lines.length >= 3);
      for (const line of lines) {
        assert.ok(line.width <= 150);
        assert.ok(line.text.length > 0);
      }
    });

    it('should handle explicit newlines and long unbreakable words', () => {
      const multiline = 'First Line\n\nSecond Line\nSupercalifragilisticexpialidocious';
      const lines = PdfFontMetrics.wrapText(multiline, 100, 'Helvetica', 12);

      assert.ok(lines.length >= 4);
      assert.equal(lines[0].text, 'First Line');
      assert.equal(lines[1].text, '');
      assert.equal(lines[2].text, 'Second Line');
    });
  });

  describe('PdfParagraph', () => {
    it('should compute paragraph layout and line count', () => {
      const p = new PdfParagraph('Sample paragraph for layout testing.', {
        fontSize: 14,
        lineHeight: 1.5,
        spacingBefore: 10,
        spacingAfter: 8
      });

      const layout = p.layout(300);
      assert.ok(layout.lines.length >= 1);
      assert.equal(layout.lineHeightPoints, 21);
      assert.equal(layout.height, 10 + (layout.lines.length * 21) + 8);
    });

    it('should support list item formatting with bullet', () => {
      const p = new PdfParagraph('First item in checklist', {
        bullet: '•',
        indent: 15
      });

      const layout = p.layout(200);
      assert.ok(layout.lines[0].text.startsWith('•'));
    });
  });

  describe('PdfTable', () => {
    it('should resolve column widths accurately from percentages and auto', () => {
      const table = new PdfTable({
        columns: [100, '50%', 'auto'],
        headers: ['Col 1', 'Col 2', 'Col 3'],
        rows: [
          ['Data 1', 'Data 2', 'Data 3']
        ]
      });

      const colWidths = table.resolveColumnWidths(400);
      // Total 400: Col 0 = 100, Col 1 = 50% of 400 = 200, Col 2 = auto = 400 - 300 = 100
      assert.equal(colWidths[0], 100);
      assert.equal(colWidths[1], 200);
      assert.equal(colWidths[2], 100);
    });

    it('should compute multiline row heights based on cell contents', () => {
      const table = new PdfTable({
        columns: [100, 100],
        rows: [
          ['Short text', 'This is a significantly longer cell text that will wrap into several lines in the table cell.']
        ]
      });

      const layout = table.layout(200);
      assert.equal(layout.rowLayouts.length, 1);
      assert.ok(layout.rowLayouts[0].height > 30); // Multi-line row height
    });
  });

  describe('PdfDocumentBuilder', () => {
    it('should build a rich single-page document with headings, paragraphs, lists, and dividers', () => {
      const builder = new PdfDocumentBuilder({
        pageSize: 'A4',
        margins: 40
      });

      builder
        .addHeading('Invoice & Project Summary', 1, { color: '#1a365d' })
        .addDivider({ color: '#2b6cb0', thickness: 2 })
        .addParagraph('Thank you for partnering with our development team. Below is the itemized project breakdown.', {
          spacingAfter: 12
        })
        .addHeading('Milestones Completed', 2)
        .addBullet('Phase 1: Binary Parser and Tokenizer')
        .addBullet('Phase 2: PDF Stream Filters & Predictors')
        .addBullet('Phase 3: Cross-Reference & Object Graph Parser')
        .addSpacer(15)
        .addTable({
          columns: ['40%', '30%', '30%'],
          headers: ['Module', 'Status', 'Coverage'],
          rows: [
            ['Core Engine', 'Completed', '100%'],
            ['Stream Pipeline', 'Completed', '100%'],
            ['Vector Graphics', 'Completed', '100%']
          ],
          alternateRowColor: '#f7fafc',
          headerFillColor: '#edf2f7'
        });

      const doc = builder.build();
      assert.equal(doc.pageCount, 1);

      const page = doc.getPage(0);
      const text = page.extractText();
      assert.ok(text.includes('Invoice & Project Summary'));
      assert.ok(text.includes('Milestones Completed'));
      assert.ok(text.includes('Stream Pipeline'));
    });

    it('should automatically paginate when content exceeds page height', () => {
      const builder = new PdfDocumentBuilder({
        pageSize: 'A4',
        margins: 50
      });

      builder.addHeading('Multi-Page Auto-Pagination Report', 1);

      // Add enough paragraphs to fill multiple pages (each A4 page is ~841 points, content area ~741 points)
      for (let i = 1; i <= 35; i++) {
        builder.addParagraph(
          `Section ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`,
          { spacingAfter: 10 }
        );
      }

      const doc = builder.build();
      assert.ok(doc.pageCount >= 2, `Expected at least 2 pages, got ${doc.pageCount}`);

      const page1Text = doc.getPage(0).extractText();
      const lastPageText = doc.getPage(doc.pageCount - 1).extractText();

      assert.ok(page1Text.includes('Section 1'));
      assert.ok(lastPageText.includes('Section 35'));
    });

    it('should split large tables across pages and repeat table headers', () => {
      const builder = new PdfDocumentBuilder({
        pageSize: 'LETTER',
        margins: 50
      });

      const rows = [];
      for (let i = 1; i <= 40; i++) {
        rows.push([`ID #${i}`, `Transaction description for item ${i}`, `$${(i * 12.5).toFixed(2)}`]);
      }

      builder
        .addHeading('Financial Transactions Table', 1)
        .addTable({
          columns: [80, 'auto', 100],
          headers: ['Tx ID', 'Description', 'Amount'],
          rows,
          repeatHeaderOnNewPage: true,
          headerFillColor: '#e2e8f0'
        });

      const doc = builder.build();
      assert.ok(doc.pageCount >= 2, `Expected multi-page table, got ${doc.pageCount} pages`);

      // Both page 1 and page 2 should contain the table headers
      const page1Text = doc.getPage(0).extractText();
      const page2Text = doc.getPage(1).extractText();

      assert.ok(page1Text.includes('Tx ID'));
      assert.ok(page2Text.includes('Tx ID'));
    });

    it('should apply running headers and footers with page numbering across all pages', () => {
      const builder = new PdfDocumentBuilder({
        pageSize: 'A4',
        margins: 40,
        header: {
          text: 'Confidential Internal Report',
          align: 'right',
          divider: true
        },
        footer: {
          text: 'Document Page {page} of {pages}',
          align: 'center',
          divider: true
        }
      });

      builder
        .addHeading('Executive Briefing', 1)
        .addParagraph('Page 1 Content here.')
        .addPageBreak()
        .addHeading('Technical Architecture', 1)
        .addParagraph('Page 2 Content here.')
        .addPageBreak()
        .addHeading('Financial Projections', 1)
        .addParagraph('Page 3 Content here.');

      const doc = builder.build();
      assert.equal(doc.pageCount, 3);

      for (let p = 0; p < 3; p++) {
        const pageText = doc.getPage(p).extractText();
        assert.ok(pageText.includes('Confidential Internal Report'), `Page ${p + 1} missing header`);
        assert.ok(pageText.includes(`Document Page ${p + 1} of 3`), `Page ${p + 1} missing footer`);
      }
    });

    it('should support full round-trip generation (save -> open -> extract & render)', async () => {
      const builder = new PdfDocumentBuilder({
        pageSize: 'A4',
        margins: 50,
        footer: 'Page {page} of {pages}'
      });

      builder
        .addHeading('Full Round-Trip Generation Test', 1)
        .addDivider()
        .addParagraph('This document is built from scratch and serialized into raw PDF bytes.')
        .addNumbered(1, 'Generated via PdfDocumentBuilder')
        .addNumbered(2, 'Serialized to Uint8Array binary via builder.save()')
        .addNumbered(3, 'Reloaded via PdfDocument.open()')
        .addTable({
          headers: ['Feature', 'Status'],
          rows: [
            ['Text Flow', 'Passed'],
            ['Table Generation', 'Passed'],
            ['Serialization', 'Passed']
          ]
        });

      const pdfBytes = builder.save();
      assert.ok(pdfBytes instanceof Uint8Array);
      assert.ok(pdfBytes.length > 500);

      // Re-open saved PDF bytes
      const reloadedDoc = await PdfDocument.open(pdfBytes);
      assert.equal(reloadedDoc.pageCount, 1);


      const reloadedPage = reloadedDoc.getPage(0);
      const extractedText = reloadedPage.extractText();

      assert.ok(extractedText.includes('Full Round-Trip Generation Test'));
      assert.ok(extractedText.includes('Serialized to Uint8Array'));
      assert.ok(extractedText.includes('Page 1 of 1'));

      // Render to SVG
      const svg = reloadedPage.renderToSvg();
      assert.ok(svg.includes('<svg'));
      assert.ok(svg.includes('Full Round-Trip Generation Test'));
    });
  });

});
