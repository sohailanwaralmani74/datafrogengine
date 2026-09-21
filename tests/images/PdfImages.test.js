import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PdfImage,
  PdfColorSpace,
  PdfPngEncoder,
  PdfImageExtractor
} from '../../src/images/index.js';
import { PdfDictionary } from '../../src/objects/PdfDictionary.js';
import { PdfArray } from '../../src/objects/PdfArray.js';
import { PdfName } from '../../src/objects/PdfName.js';
import { PdfNumber } from '../../src/objects/PdfNumber.js';
import { PdfStream } from '../../src/objects/PdfStream.js';
import { PdfPage } from '../../src/document/PdfPage.js';

describe('Image Extraction (Phase 9)', () => {
  describe('PdfColorSpace', () => {
    it('should parse named color spaces', () => {
      const rgb = PdfColorSpace.parseColorSpace(PdfName.of('DeviceRGB'));
      assert.equal(rgb.family, 'DeviceRGB');
      assert.equal(rgb.components, 3);

      const gray = PdfColorSpace.parseColorSpace(PdfName.of('DeviceGray'));
      assert.equal(gray.family, 'DeviceGray');
      assert.equal(gray.components, 1);

      const cmyk = PdfColorSpace.parseColorSpace(PdfName.of('DeviceCMYK'));
      assert.equal(cmyk.family, 'DeviceCMYK');
      assert.equal(cmyk.components, 4);
    });

    it('should convert 8-bit RGB to RGBA', () => {
      // 2 pixels: Red (255, 0, 0) and Blue (0, 0, 255)
      const raw = new Uint8Array([255, 0, 0, 0, 0, 255]);
      const cs = { family: 'DeviceRGB', components: 3, details: {} };
      const rgba = PdfColorSpace.toRgba(raw, 2, 1, cs, 8);

      assert.equal(rgba.length, 8);
      // Pixel 1: Red
      assert.deepEqual(Array.from(rgba.subarray(0, 4)), [255, 0, 0, 255]);
      // Pixel 2: Blue
      assert.deepEqual(Array.from(rgba.subarray(4, 8)), [0, 0, 255, 255]);
    });

    it('should convert 8-bit Gray to RGBA', () => {
      // 2 pixels: 0 (black), 128 (gray)
      const raw = new Uint8Array([0, 128]);
      const cs = { family: 'DeviceGray', components: 1, details: {} };
      const rgba = PdfColorSpace.toRgba(raw, 2, 1, cs, 8);

      assert.equal(rgba.length, 8);
      assert.deepEqual(Array.from(rgba.subarray(0, 4)), [0, 0, 0, 255]);
      assert.deepEqual(Array.from(rgba.subarray(4, 8)), [128, 128, 128, 255]);
    });

    it('should convert 8-bit CMYK to RGBA', () => {
      // 2 pixels:
      // Pixel 1: Pure White [0, 0, 0, 0] -> [255, 255, 255]
      // Pixel 2: Pure Black [0, 0, 0, 255] -> [0, 0, 0]
      const raw = new Uint8Array([
        0, 0, 0, 0,
        0, 0, 0, 255
      ]);
      const cs = { family: 'DeviceCMYK', components: 4, details: {} };
      const rgba = PdfColorSpace.toRgba(raw, 2, 1, cs, 8);

      assert.equal(rgba.length, 8);
      assert.deepEqual(Array.from(rgba.subarray(0, 4)), [255, 255, 255, 255]);
      assert.deepEqual(Array.from(rgba.subarray(4, 8)), [0, 0, 0, 255]);
    });

    it('should convert 1-bit monochrome image with row padding', () => {
      // 2x2 1-bit image
      // Row 1: 2 pixels (white, black) -> bits 1, 0 -> byte 0b10000000 = 0x80
      // Row 2: 2 pixels (black, white) -> bits 0, 1 -> byte 0b01000000 = 0x40
      const raw = new Uint8Array([0x80, 0x40]);
      const cs = { family: 'DeviceGray', components: 1, details: {} };
      const rgba = PdfColorSpace.toRgba(raw, 2, 2, cs, 1);

      assert.equal(rgba.length, 16);
      // Row 1, Pixel 1 (white)
      assert.deepEqual(Array.from(rgba.subarray(0, 4)), [255, 255, 255, 255]);
      // Row 1, Pixel 2 (black)
      assert.deepEqual(Array.from(rgba.subarray(4, 8)), [0, 0, 0, 255]);
      // Row 2, Pixel 1 (black)
      assert.deepEqual(Array.from(rgba.subarray(8, 12)), [0, 0, 0, 255]);
      // Row 2, Pixel 2 (white)
      assert.deepEqual(Array.from(rgba.subarray(12, 16)), [255, 255, 255, 255]);
    });

    it('should convert Indexed color space using palette table', () => {
      // Palette table with 2 RGB entries:
      // index 0 -> Yellow [255, 255, 0]
      // index 1 -> Cyan [0, 255, 255]
      const palette = new Uint8Array([
        255, 255, 0,
        0, 255, 255
      ]);
      const cs = {
        family: 'Indexed',
        components: 1,
        details: {
          base: { family: 'DeviceRGB', components: 3 },
          hival: 1,
          lookup: palette
        }
      };

      // 2 pixels: index 1, index 0
      const raw = new Uint8Array([1, 0]);
      const rgba = PdfColorSpace.toRgba(raw, 2, 1, cs, 8);

      // Pixel 1: Cyan
      assert.deepEqual(Array.from(rgba.subarray(0, 4)), [0, 255, 255, 255]);
      // Pixel 2: Yellow
      assert.deepEqual(Array.from(rgba.subarray(4, 8)), [255, 255, 0, 255]);
    });

    it('should apply Soft Mask (SMask) as alpha channel', () => {
      // 1 RGB pixel (Red)
      const raw = new Uint8Array([255, 0, 0]);
      const cs = { family: 'DeviceRGB', components: 3, details: {} };
      // SMask RGBA buffer with alpha = 120 (stored in R component of mask)
      const smaskRgba = new Uint8Array([120, 120, 120, 255]);

      const rgba = PdfColorSpace.toRgba(raw, 1, 1, cs, 8, null, smaskRgba);
      assert.deepEqual(Array.from(rgba), [255, 0, 0, 120]);
    });
  });

  describe('PdfPngEncoder', () => {
    it('should encode RGBA buffer to valid PNG file bytes', () => {
      // 2x2 RGBA image
      const rgba = new Uint8Array([
        255, 0, 0, 255,    0, 255, 0, 255,
        0, 0, 255, 255,    255, 255, 255, 128
      ]);

      const png = PdfPngEncoder.encode(rgba, 2, 2);
      assert.ok(png instanceof Uint8Array);
      assert.ok(png.length > 30);

      // Verify standard PNG signature: 89 50 4E 47 0D 0A 1A 0A
      assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);

      // Verify IHDR presence
      const ihdrChunk = new TextDecoder('ascii').decode(png.subarray(12, 16));
      assert.equal(ihdrChunk, 'IHDR');

      // Verify IEND presence at end
      const iendChunk = new TextDecoder('ascii').decode(png.subarray(png.length - 8, png.length - 4));
      assert.equal(iendChunk, 'IEND');
    });
  });

  describe('PdfImage', () => {
    it('should provide getters, RGBA conversion, PNG export, and Data URLs', () => {
      const rawRgb = new Uint8Array([255, 128, 0]);
      const img = new PdfImage({
        name: 'Im1',
        width: 1,
        height: 1,
        colorSpace: { family: 'DeviceRGB', components: 3, details: {} },
        bitsPerComponent: 8,
        bytes: rawRgb,
        format: 'raw',
        position: { x: 50, y: 100, width: 200, height: 150, matrix: [200, 0, 0, 150, 50, 100] }
      });

      assert.equal(img.name, 'Im1');
      assert.equal(img.width, 1);
      assert.equal(img.height, 1);
      assert.deepEqual(img.position, { x: 50, y: 100, width: 200, height: 150, matrix: [200, 0, 0, 150, 50, 100] });

      const rgba = img.toRgba();
      assert.deepEqual(Array.from(rgba), [255, 128, 0, 255]);

      const png = img.toPng();
      assert.ok(png.length > 20);

      const dataUrl = img.toDataUrl();
      assert.ok(dataUrl.startsWith('data:image/png;base64,'));
    });

    it('should support JPEG pass-through and JPEG data URLs', () => {
      const mockJpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
      const img = new PdfImage({
        name: 'JpegImg',
        width: 10,
        height: 10,
        colorSpace: { family: 'DeviceRGB', components: 3, details: {} },
        bytes: mockJpegBytes,
        format: 'jpeg'
      });

      assert.equal(img.format, 'jpeg');
      assert.deepEqual(img.toJpegBytes(), mockJpegBytes);
      assert.ok(img.toDataUrl().startsWith('data:image/jpeg;base64,'));
    });
  });

  describe('PdfImageExtractor', () => {
    function buildMockPage(contentString, xobjects = {}) {
      const xobjDict = new PdfDictionary();
      for (const [name, stream] of Object.entries(xobjects)) {
        xobjDict.set(name, stream);
      }

      const resourcesDict = new PdfDictionary();
      resourcesDict.set('XObject', xobjDict);

      const contentBytes = contentString instanceof Uint8Array
        ? contentString
        : new TextEncoder().encode(contentString);

      const pageDict = new PdfDictionary();
      pageDict.set('Type', PdfName.of('Page'));
      pageDict.set('MediaBox', new PdfArray([
        PdfNumber.of(0), PdfNumber.of(0), PdfNumber.of(612), PdfNumber.of(792)
      ]));
      pageDict.set('Resources', resourcesDict);
      pageDict.set('Contents', new PdfStream(new PdfDictionary(), contentBytes));

      const mockDoc = {
        resolve: (obj) => obj
      };

      return new PdfPage(pageDict, 0, mockDoc);
    }

    it('should extract Image XObject referenced by Do operator with CTM placement', () => {
      const imgDict = new PdfDictionary();
      imgDict.set('Type', PdfName.of('XObject'));
      imgDict.set('Subtype', PdfName.of('Image'));
      imgDict.set('Width', PdfNumber.of(2));
      imgDict.set('Height', PdfNumber.of(2));
      imgDict.set('ColorSpace', PdfName.of('DeviceRGB'));
      imgDict.set('BitsPerComponent', PdfNumber.of(8));

      // 4 pixels RGB (12 bytes)
      const rawPixels = new Uint8Array(12).fill(200);
      const imgStream = new PdfStream(imgDict, rawPixels);

      const content = `
        q
        150 0 0 100 50 200 cm
        /Im1 Do
        Q
      `;

      const page = buildMockPage(content, { Im1: imgStream });
      const images = PdfImageExtractor.extractImages(page);

      assert.equal(images.length, 1);
      const img = images[0];
      assert.equal(img.name, 'Im1');
      assert.equal(img.width, 2);
      assert.equal(img.height, 2);
      assert.equal(img.isInline, false);

      // CTM placement check: [150, 0, 0, 100, 50, 200]
      assert.equal(img.position.x, 50);
      assert.equal(img.position.y, 200);
      assert.equal(img.position.width, 150);
      assert.equal(img.position.height, 100);
    });

    it('should extract inline image (BI ... ID ... EI)', () => {
      // 1x1 RGB pixel [255, 0, 0] inline image with binary bytes
      const prefix = new TextEncoder().encode('q\n100 0 0 80 20 40 cm\nBI /W 1 /H 1 /CS /DeviceRGB /BPC 8 ID\n');
      const pixels = new Uint8Array([255, 0, 0]);
      const suffix = new TextEncoder().encode('\nEI\nQ');
      const content = new Uint8Array(prefix.length + pixels.length + suffix.length);
      content.set(prefix, 0);
      content.set(pixels, prefix.length);
      content.set(suffix, prefix.length + pixels.length);

      const page = buildMockPage(content, {});

      const images = PdfImageExtractor.extractImages(page);
      assert.equal(images.length, 1);
      const img = images[0];
      assert.equal(img.isInline, true);
      assert.equal(img.width, 1);
      assert.equal(img.height, 1);
      assert.equal(img.position.x, 20);
      assert.equal(img.position.y, 40);
      assert.equal(img.position.width, 100);
      assert.equal(img.position.height, 80);

      const rgba = img.toRgba();
      assert.deepEqual(Array.from(rgba), [255, 0, 0, 255]);
    });

    it('should extract resource images directly via extractResourceImages()', () => {
      const imgDict = new PdfDictionary();
      imgDict.set('Type', PdfName.of('XObject'));
      imgDict.set('Subtype', PdfName.of('Image'));
      imgDict.set('Width', PdfNumber.of(4));
      imgDict.set('Height', PdfNumber.of(4));
      imgDict.set('ColorSpace', PdfName.of('DeviceGray'));
      imgDict.set('BitsPerComponent', PdfNumber.of(8));

      const rawPixels = new Uint8Array(16).fill(128);
      const imgStream = new PdfStream(imgDict, rawPixels);

      // Content stream has no 'Do', but image exists in page resources
      const page = buildMockPage('q Q', { Background: imgStream });

      const resourceImages = PdfImageExtractor.extractResourceImages(page);
      assert.equal(resourceImages.length, 1);
      assert.equal(resourceImages[0].name, 'Background');
      assert.equal(resourceImages[0].width, 4);
      assert.equal(resourceImages[0].height, 4);
    });

    it('should extract images via page.extractImages() method', () => {
      const imgDict = new PdfDictionary();
      imgDict.set('Subtype', PdfName.of('Image'));
      imgDict.set('Width', PdfNumber.of(1));
      imgDict.set('Height', PdfNumber.of(1));
      imgDict.set('ColorSpace', PdfName.of('DeviceGray'));

      const imgStream = new PdfStream(imgDict, new Uint8Array([255]));
      const page = buildMockPage('10 0 0 10 0 0 cm /Pic Do', { Pic: imgStream });

      const pageImgs = page.extractImages();
      assert.equal(pageImgs.length, 1);
      assert.equal(pageImgs[0].name, 'Pic');
    });
  });
});
