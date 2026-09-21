import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PdfViewport,
  PdfPath,
  PdfCanvasRenderer,
  PdfSvgRenderer,
  PdfRenderer
} from '../../src/rendering/index.js';
import { PdfDictionary } from '../../src/objects/PdfDictionary.js';
import { PdfArray } from '../../src/objects/PdfArray.js';
import { PdfName } from '../../src/objects/PdfName.js';
import { PdfNumber } from '../../src/objects/PdfNumber.js';
import { PdfStream } from '../../src/objects/PdfStream.js';
import { PdfPage } from '../../src/document/PdfPage.js';

describe('Vector Graphics & Rendering Engine (Phase 10)', () => {
  describe('PdfViewport', () => {
    it('should calculate scaled dimensions from CropBox', () => {
      const vp1 = new PdfViewport({ viewBox: [0, 0, 612, 792], scale: 1.0 });
      assert.equal(vp1.width, 612);
      assert.equal(vp1.height, 792);

      const vp2 = new PdfViewport({ viewBox: [0, 0, 612, 792], scale: 2.0 });
      assert.equal(vp2.width, 1224);
      assert.equal(vp2.height, 1584);
    });

    it('should swap width and height when rotated 90 or 270 degrees', () => {
      const vp90 = new PdfViewport({ viewBox: [0, 0, 612, 792], scale: 1.0, rotation: 90 });
      assert.equal(vp90.width, 792);
      assert.equal(vp90.height, 612);

      const vp270 = new PdfViewport({ viewBox: [0, 0, 612, 792], scale: 1.0, rotation: 270 });
      assert.equal(vp270.width, 792);
      assert.equal(vp270.height, 612);
    });

    it('should transform PDF points (bottom-left) to viewport coordinates (top-left)', () => {
      const vp = new PdfViewport({ viewBox: [0, 0, 100, 200], scale: 1.0, rotation: 0 });
      // PDF bottom-left (0, 0) -> Viewport top-left y=200
      const [x0, y0] = vp.transformPoint(0, 0);
      assert.equal(x0, 0);
      assert.equal(y0, 200);

      // PDF top-right (100, 200) -> Viewport (100, 0)
      const [x1, y1] = vp.transformPoint(100, 200);
      assert.equal(x1, 100);
      assert.equal(y1, 0);
    });
  });

  describe('PdfPath', () => {
    it('should record path segments and output SVG path data', () => {
      const path = new PdfPath();
      path.moveTo(10, 20);
      path.lineTo(30, 40);
      path.curveTo(35, 45, 50, 60, 70, 80);
      path.rect(0, 0, 100, 50);
      path.closePath();

      assert.equal(path.isEmpty, false);
      const svgData = path.toSvgPathData();
      assert.ok(svgData.includes('M 10 20'));
      assert.ok(svgData.includes('L 30 40'));
      assert.ok(svgData.includes('C 35 45 50 60 70 80'));
      assert.ok(svgData.includes('M 0 0 h 100 v 50 h -100 Z'));
      assert.ok(svgData.endsWith('Z'));

      path.reset();
      assert.equal(path.isEmpty, true);
    });
  });

  describe('PdfCanvasRenderer', () => {
    function createMockContext() {
      const calls = [];
      return {
        calls,
        save: () => calls.push({ method: 'save' }),
        restore: () => calls.push({ method: 'restore' }),
        setTransform: (...args) => calls.push({ method: 'setTransform', args }),
        transform: (...args) => calls.push({ method: 'transform', args }),
        fillRect: (...args) => calls.push({ method: 'fillRect', args }),
        beginPath: () => calls.push({ method: 'beginPath' }),
        moveTo: (...args) => calls.push({ method: 'moveTo', args }),
        lineTo: (...args) => calls.push({ method: 'lineTo', args }),
        bezierCurveTo: (...args) => calls.push({ method: 'bezierCurveTo', args }),
        rect: (...args) => calls.push({ method: 'rect', args }),
        closePath: () => calls.push({ method: 'closePath' }),
        stroke: () => calls.push({ method: 'stroke' }),
        fill: (...args) => calls.push({ method: 'fill', args }),
        clip: (...args) => calls.push({ method: 'clip', args }),
        fillText: (...args) => calls.push({ method: 'fillText', args }),
        strokeText: (...args) => calls.push({ method: 'strokeText', args }),
        setLineDash: (...args) => calls.push({ method: 'setLineDash', args }),
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        miterLimit: 10,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        font: '10px sans-serif'
      };
    }

    function buildMockPage(contentString) {
      const fontDict = new PdfDictionary();
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Helvetica'));

      const fontsDict = new PdfDictionary();
      fontsDict.set('F1', fontDict);

      const resDict = new PdfDictionary();
      resDict.set('Font', fontsDict);

      const contentBytes = new TextEncoder().encode(contentString);
      const pageDict = new PdfDictionary();
      pageDict.set('Type', PdfName.of('Page'));
      pageDict.set('MediaBox', new PdfArray([
        PdfNumber.of(0), PdfNumber.of(0), PdfNumber.of(200), PdfNumber.of(300)
      ]));
      pageDict.set('Resources', resDict);
      pageDict.set('Contents', new PdfStream(new PdfDictionary(), contentBytes));

      const mockDoc = { resolve: (o) => o };
      return new PdfPage(pageDict, 0, mockDoc);
    }

    it('should render paths and color changes onto canvas context', () => {
      const content = `
        1 0 0 RG
        2 w
        10 10 m
        100 100 l
        S
        0 1 0 rg
        0 0 50 50 re
        f
      `;

      const page = buildMockPage(content);
      const ctx = createMockContext();

      const vp = PdfCanvasRenderer.render(page, ctx);
      assert.equal(vp.width, 200);
      assert.equal(vp.height, 300);

      // Verify stroke color was set to red
      assert.equal(ctx.strokeStyle, 'rgb(255,0,0)');
      assert.equal(ctx.lineWidth, 2);

      // Verify fill color was set to green
      assert.equal(ctx.fillStyle, 'rgb(0,255,0)');

      // Verify stroke and fill calls occurred
      assert.ok(ctx.calls.some(c => c.method === 'stroke'));
      assert.ok(ctx.calls.some(c => c.method === 'fill'));
    });

    it('should render text onto canvas context', () => {
      const content = `
        BT
        /F1 14 Tf
        1 0 0 1 20 50 Tm
        (Hello Canvas) Tj
        ET
      `;

      const page = buildMockPage(content);
      const ctx = createMockContext();

      PdfCanvasRenderer.render(page, ctx);

      const fillTextCall = ctx.calls.find(c => c.method === 'fillText' && c.args[0] === 'Hello Canvas');
      assert.ok(fillTextCall, 'fillText should be called with "Hello Canvas"');
    });
  });

  describe('PdfSvgRenderer', () => {
    function buildMockPage(contentString) {
      const fontDict = new PdfDictionary();
      fontDict.set('Subtype', PdfName.of('Type1'));
      fontDict.set('BaseFont', PdfName.of('Times-Bold'));

      const fontsDict = new PdfDictionary();
      fontsDict.set('F1', fontDict);

      const resDict = new PdfDictionary();
      resDict.set('Font', fontsDict);

      const contentBytes = new TextEncoder().encode(contentString);
      const pageDict = new PdfDictionary();
      pageDict.set('Type', PdfName.of('Page'));
      pageDict.set('MediaBox', new PdfArray([
        PdfNumber.of(0), PdfNumber.of(0), PdfNumber.of(400), PdfNumber.of(500)
      ]));
      pageDict.set('Resources', resDict);
      pageDict.set('Contents', new PdfStream(new PdfDictionary(), contentBytes));

      const mockDoc = { resolve: (o) => o };
      return new PdfPage(pageDict, 0, mockDoc);
    }

    it('should generate valid scalable SVG XML string with paths and text', () => {
      const content = `
        0.5 g
        10 10 100 80 re
        f
        1 0 0 RG
        2 w
        50 50 m
        150 150 l
        S
        BT
        /F1 16 Tf
        1 0 0 1 60 120 Tm
        (SVG Vector Text) Tj
        ET
      `;

      const page = buildMockPage(content);
      const svg = PdfSvgRenderer.render(page, { scale: 1.5, background: '#fafafa' });

      // Verify SVG XML structure
      assert.ok(svg.startsWith('<svg'));
      assert.ok(svg.endsWith('</svg>'));
      assert.ok(svg.includes('width="600"')); // 400 * 1.5
      assert.ok(svg.includes('height="750"')); // 500 * 1.5
      assert.ok(svg.includes('fill="#fafafa"')); // Background rect

      // Verify path elements
      assert.ok(svg.includes('<path d="M 10 10 h 100 v 80 h -100 Z"'));
      assert.ok(svg.includes('fill="#808080"')); // 0.5 gray fill
      assert.ok(svg.includes('stroke="#ff0000"')); // Red stroke
      assert.ok(svg.includes('stroke-width="2"'));

      // Verify text elements
      assert.ok(svg.includes('<text'));
      assert.ok(svg.includes('font-size="16"'));
      assert.ok(svg.includes('font-family="serif"'));
      assert.ok(svg.includes('font-weight="bold"'));
      assert.ok(svg.includes('>SVG Vector Text</text>'));
    });

    it('should generate clipPath elements for clipping operators', () => {
      const content = `
        0 0 100 100 re
        W
        n
        1 0 0 rg
        0 0 200 200 re
        f
      `;

      const page = buildMockPage(content);
      const svg = PdfSvgRenderer.render(page);

      assert.ok(svg.includes('<defs>'));
      assert.ok(svg.includes('<clipPath id="clip_1">'));
      assert.ok(svg.includes('clip-path="url(#clip_1)"'));
    });
  });

  describe('PdfRenderer and Page/Document Integration', () => {
    function buildSimplePage() {
      const pageDict = new PdfDictionary();
      pageDict.set('Type', PdfName.of('Page'));
      pageDict.set('MediaBox', new PdfArray([
        PdfNumber.of(0), PdfNumber.of(0), PdfNumber.of(300), PdfNumber.of(400)
      ]));
      pageDict.set('Resources', new PdfDictionary());
      pageDict.set('Contents', new PdfStream(new PdfDictionary(), new Uint8Array(0)));
      return new PdfPage(pageDict, 0, { resolve: (o) => o });
    }

    it('should render via page.renderToSvg() and getViewport()', () => {
      const page = buildSimplePage();
      const svg = page.renderToSvg({ scale: 1.0 });
      assert.ok(svg.includes('width="300"'));
      assert.ok(svg.includes('height="400"'));

      const vp = page.getViewport({ scale: 2.0 });
      assert.equal(vp.width, 600);
      assert.equal(vp.height, 800);
    });

    it('should render via PdfRenderer facade', () => {
      const page = buildSimplePage();
      const svg = PdfRenderer.renderToSvg(page);
      assert.ok(svg.startsWith('<svg'));
    });
  });
});
