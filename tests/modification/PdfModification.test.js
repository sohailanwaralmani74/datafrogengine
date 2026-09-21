import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PdfDocument,
  PdfContentBuilder,
  PdfAnnotation,
  PdfPageModifier,
  PdfDocumentModifier,
  PdfImage
} from '../../src/index.js';

describe('PDF Modification & Content Stream Generation (Phase 12)', () => {
  describe('PdfContentBuilder', () => {
    it('should build a valid PDF content stream with vector and text operators', () => {
      const builder = new PdfContentBuilder();
      builder
        .saveGraphicsState()
        .setFillColorRgb(255, 0, 0)
        .setStrokeColorRgb(0, 0, 255)
        .setLineWidth(2)
        .rectangle(10, 20, 100, 50)
        .fillAndStroke()
        .beginText()
        .setFont('F1', 14)
        .setTextMatrix(1, 0, 0, 1, 15, 25)
        .showText('Hello Builder')
        .endText()
        .restoreGraphicsState();

      const output = builder.toString();
      assert.ok(output.includes('q'));
      assert.ok(output.includes('1 0 0 rg'));
      assert.ok(output.includes('0 0 1 RG'));
      assert.ok(output.includes('2 w'));
      assert.ok(output.includes('10 20 100 50 re'));
      assert.ok(output.includes('B'));
      assert.ok(output.includes('BT'));
      assert.ok(output.includes('/F1 14 Tf'));
      assert.ok(output.includes('(Hello Builder) Tj'));
      assert.ok(output.includes('ET'));
      assert.ok(output.includes('Q'));

      const stream = builder.toStream();
      assert.ok(stream.isStream());
      assert.equal(stream.bytes.length, builder.toBytes().length);
    });

    it('should approximate circles and ellipses with Bézier curves', () => {
      const builder = new PdfContentBuilder();
      builder.circle(100, 100, 50).fill();

      const output = builder.toString();
      assert.ok(output.includes('50 100 m'));
      assert.ok(output.includes('c')); // Cubic curves
      assert.ok(output.includes('h')); // Close path
      assert.ok(output.includes('f'));
    });
  });

  describe('PdfAnnotation', () => {
    it('should create link, text note, and highlight annotations', () => {
      const link = PdfAnnotation.createLink([50, 50, 150, 70], 'https://example.com');
      assert.equal(link.subtype, 'Link');
      assert.deepEqual(link.rect, [50, 50, 150, 70]);
      assert.equal(link.dictionary.get('A').get('URI').value, 'https://example.com');

      const note = PdfAnnotation.createTextNote([100, 100, 120, 120], 'Review this section', { author: 'Editor' });
      assert.equal(note.subtype, 'Text');
      assert.equal(note.dictionary.get('Contents').value, 'Review this section');
      assert.equal(note.dictionary.get('T').value, 'Editor');

      const highlight = PdfAnnotation.createHighlight([10, 20, 100, 40]);
      assert.equal(highlight.subtype, 'Highlight');
      assert.ok(highlight.dictionary.get('QuadPoints').isArray());
    });
  });

  describe('PdfPageModifier & Drawing APIs', () => {
    it('should draw text and automatically register font resources on page', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage(612, 792);

      page.drawText('Welcome to PDF Engine', {
        x: 50,
        y: 700,
        size: 18,
        font: 'Helvetica-Bold',
        color: '#ff0000'
      });

      // Verify font registered in page resources
      const font = page.getResources().getFont('F1');
      assert.ok(font);
      assert.equal(font.get('BaseFont').value, 'Helvetica-Bold');

      // Verify text extraction finds the drawn text
      const text = page.extractText();
      assert.ok(text.includes('Welcome to PDF Engine'));
    });

    it('should draw rectangles, lines, and circles on page', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage(400, 400);

      page
        .drawRectangle({ x: 10, y: 10, width: 80, height: 50, fillColor: '#00ff00', borderColor: '#000000' })
        .drawLine({ start: { x: 0, y: 0 }, end: { x: 100, y: 100 }, color: '#0000ff', thickness: 3 })
        .drawCircle({ x: 200, y: 200, radius: 40, fillColor: '#ffff00' });

      // Render to SVG to verify elements exist
      const svg = page.renderToSvg();
      assert.ok(svg.includes('fill="#00ff00"'));
      assert.ok(svg.includes('stroke="#0000ff"'));
      assert.ok(svg.includes('stroke-width="3"'));
      assert.ok(svg.includes('fill="#ffff00"'));
    });

    it('should draw images and auto-register Image XObjects', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage(600, 600);

      const rawRgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]);
      const img = new PdfImage({
        name: 'MyImage',
        width: 2,
        height: 2,
        colorSpace: { family: 'DeviceRGB', components: 3, details: {} },
        bytes: rawRgb
      });

      page.drawImage(img, { x: 50, y: 50, width: 200, height: 150 });

      // Verify image registered in page resources
      const xobj = page.getResources().getXObject('Im1');
      assert.ok(xobj);
      assert.equal(xobj.dictionary.getName('Subtype'), 'Image');

      // Verify image extractor finds the drawn image
      const extractedImages = page.extractImages();
      assert.equal(extractedImages.length, 1);
      assert.equal(extractedImages[0].position.x, 50);
      assert.equal(extractedImages[0].position.y, 50);
      assert.equal(extractedImages[0].position.width, 200);
      assert.equal(extractedImages[0].position.height, 150);
    });

    it('should add watermarks and link annotations to page', () => {
      const doc = PdfDocument.create();
      const page = doc.addPage(600, 800);

      page.addWatermark('DRAFT COPY', { size: 36, color: '#999999' });
      page.addLink([50, 100, 200, 120], 'https://antigravity.google');

      // Verify watermark text
      assert.ok(page.extractText().includes('DRAFT COPY'));

      // Verify annotation in /Annots array
      const annots = page.dictionary.get('Annots');
      assert.ok(annots);
      const resolvedAnnots = doc.resolve(annots);
      assert.equal(resolvedAnnots.size(), 1);
      const linkAnnot = doc.resolve(resolvedAnnots.get(0));
      assert.equal(linkAnnot.getName('Subtype'), 'Link');
    });
  });

  describe('PdfDocumentModifier (Document-Wide Operations)', () => {
    it('should add watermarks and page numbers across all document pages', () => {
      const doc = PdfDocument.create();
      doc.addPage(600, 800);
      doc.addPage(600, 800);
      doc.addPage(600, 800);

      doc.addWatermark('CONFIDENTIAL', { size: 40 });
      doc.addPageNumbers({ format: 'Page {page} of {total}', position: 'bottom-center' });

      // Page 1 check
      const textP1 = doc.extractText(0);
      assert.ok(textP1.includes('CONFIDENTIAL'));
      assert.ok(textP1.includes('Page 1 of 3'));

      // Page 2 check
      const textP2 = doc.extractText(1);
      assert.ok(textP2.includes('CONFIDENTIAL'));
      assert.ok(textP2.includes('Page 2 of 3'));

      // Page 3 check
      const textP3 = doc.extractText(2);
      assert.ok(textP3.includes('CONFIDENTIAL'));
      assert.ok(textP3.includes('Page 3 of 3'));
    });
  });

  describe('Full Round-Trip Modification (create -> modify -> save -> open)', () => {
    it('should preserve all drawn shapes, text, watermark, and annotations across save and reload', async () => {
      const doc = PdfDocument.create({ version: '1.7' });

      // Create Page 1 with text and shapes
      const p1 = doc.addPage(612, 792);
      p1.drawText('Invoice #1024', { x: 50, y: 720, size: 20, font: 'Helvetica-Bold' });
      p1.drawRectangle({ x: 50, y: 650, width: 512, height: 50, fillColor: '#eeeeee' });
      p1.drawText('Item Description: Pure JS Engine', { x: 60, y: 668, size: 12 });
      p1.addWatermark('PAID', { size: 50, color: '#00aa00' });
      p1.addLink([50, 720, 200, 740], 'https://invoice.example.com');

      // Add Page 2
      const p2 = doc.addPage(612, 792);
      p2.drawText('Terms & Conditions', { x: 50, y: 720, size: 16 });

      doc.addPageNumbers({ format: 'Page {page} of {total}' });

      // Save to binary PDF
      const pdfBytes = doc.save();
      assert.ok(pdfBytes instanceof Uint8Array);

      // Reopen in a new document instance
      const reloaded = await PdfDocument.open(pdfBytes);
      assert.equal(reloaded.getPageCount(), 2);

      // Verify text extraction on reloaded document
      const reloadedTextP1 = reloaded.extractText(0);
      assert.ok(reloadedTextP1.includes('Invoice #1024'));
      assert.ok(reloadedTextP1.includes('Item Description: Pure JS Engine'));
      assert.ok(reloadedTextP1.includes('PAID'));
      assert.ok(reloadedTextP1.includes('Page 1 of 2'));

      const reloadedTextP2 = reloaded.extractText(1);
      assert.ok(reloadedTextP2.includes('Terms & Conditions'));
      assert.ok(reloadedTextP2.includes('Page 2 of 2'));

      // Verify SVG rendering on reloaded document
      const svg = reloaded.renderToSvg(0);
      assert.ok(svg.includes('Invoice #1024'));
      assert.ok(svg.includes('fill="#eeeeee"'));
    });
  });
});
