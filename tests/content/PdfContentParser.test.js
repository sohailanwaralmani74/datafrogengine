import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PdfContentParser,
  PdfOperator,
  PdfGraphicsState,
  PdfTextState
} from '../../src/content/index.js';
import { PdfStream } from '../../src/objects/PdfStream.js';
import { PdfDictionary } from '../../src/objects/PdfDictionary.js';
import { PdfName } from '../../src/objects/PdfName.js';

describe('Content Stream Parser (Phase 7)', () => {
  describe('PdfOperator', () => {
    it('should store name, arguments, and categorize operator types', () => {
      const opText = new PdfOperator('Tj', ['Hello World']);
      assert.equal(opText.name, 'Tj');
      assert.equal(opText.argCount, 1);
      assert.equal(opText.getString(0), 'Hello World');
      assert.equal(opText.isText(), true);
      assert.equal(opText.isPath(), false);

      const opPath = new PdfOperator('re', [100, 200, 300, 400]);
      assert.equal(opPath.name, 're');
      assert.equal(opPath.argCount, 4);
      assert.equal(opPath.getNumber(0), 100);
      assert.equal(opPath.getNumber(1), 200);
      assert.equal(opPath.getNumber(2), 300);
      assert.equal(opPath.getNumber(3), 400);
      assert.equal(opPath.isPath(), true);
      assert.equal(opPath.isText(), false);

      const opColor = new PdfOperator('rg', [1, 0, 0]);
      assert.equal(opColor.isColor(), true);

      const opGState = new PdfOperator('q', []);
      assert.equal(opGState.isGraphicsState(), true);

      const opImg = new PdfOperator('Do', ['/Im1']);
      assert.equal(opImg.isImage(), true);
    });
  });

  describe('PdfTextState', () => {
    it('should manage text matrix transformations and line updates', () => {
      const ts = new PdfTextState();
      ts.setFont('F1', 14);
      assert.equal(ts.fontName, 'F1');
      assert.equal(ts.fontSize, 14);

      ts.setTextMatrix(2, 0, 0, 2, 50, 100);
      assert.deepEqual(ts.textMatrix, [2, 0, 0, 2, 50, 100]);

      ts.moveText(10, 20);
      // Tlm newE = 10*2 + 20*0 + 50 = 70; newF = 10*0 + 20*2 + 100 = 140
      assert.deepEqual(ts.textMatrix, [2, 0, 0, 2, 70, 140]);

      ts.leading = 15;
      ts.nextLine();
      // moveText(0, -15) -> newE = 70; newF = -15*2 + 140 = 110
      assert.deepEqual(ts.textMatrix, [2, 0, 0, 2, 70, 110]);

      ts.resetForBT();
      assert.deepEqual(ts.textMatrix, [1, 0, 0, 1, 0, 0]);
    });
  });

  describe('PdfGraphicsState', () => {
    it('should concatenate CTM matrices and clone state', () => {
      const gs = new PdfGraphicsState();
      assert.deepEqual(gs.ctm, [1, 0, 0, 1, 0, 0]);

      // Translate by (100, 200)
      gs.transform(1, 0, 0, 1, 100, 200);
      assert.deepEqual(gs.ctm, [1, 0, 0, 1, 100, 200]);

      // Scale by (2, 2)
      gs.transform(2, 0, 0, 2, 0, 0);
      assert.deepEqual(gs.ctm, [2, 0, 0, 2, 100, 200]);

      gs.lineWidth = 2.5;
      gs.strokeColor = [1, 0, 0];

      const cloned = gs.clone();
      assert.deepEqual(cloned.ctm, [2, 0, 0, 2, 100, 200]);
      assert.equal(cloned.lineWidth, 2.5);
      assert.deepEqual(cloned.strokeColor, [1, 0, 0]);

      // Mutating original does not mutate clone
      gs.lineWidth = 5.0;
      assert.equal(cloned.lineWidth, 2.5);
    });
  });

  describe('PdfContentParser', () => {
    it('should parse text operators (BT, Tf, Tm, Tj, TJ, ET)', () => {
      const streamText = `
        BT
        /F1 12 Tf
        1 0 0 1 100 200 Tm
        (Hello World) Tj
        [ (Hello) 120 (World) ] TJ
        ET
      `;

      const ops = PdfContentParser.parse(streamText);
      assert.equal(ops.length, 6);

      assert.equal(ops[0].name, 'BT');

      assert.equal(ops[1].name, 'Tf');
      assert.equal(ops[1].getString(0), 'F1');
      assert.equal(ops[1].getNumber(1), 12);

      assert.equal(ops[2].name, 'Tm');
      assert.deepEqual(ops[2].args, [1, 0, 0, 1, 100, 200]);

      assert.equal(ops[3].name, 'Tj');
      assert.equal(ops[3].getString(0), 'Hello World');

      assert.equal(ops[4].name, 'TJ');
      assert.equal(ops[4].getArg(0).size(), 3);

      assert.equal(ops[5].name, 'ET');
    });

    it('should parse path and graphics state operators (q, cm, m, l, re, S, f, Q)', () => {
      const streamText = `
        q
        1 0 0 1 50 50 cm
        2 w
        1 0 0 RG
        0 0 100 200 re
        S
        10 10 m
        100 100 l
        h
        f*
        Q
      `;

      const ops = PdfContentParser.parse(streamText);
      assert.equal(ops.length, 11);

      assert.equal(ops[0].name, 'q');
      assert.equal(ops[1].name, 'cm');
      assert.deepEqual(ops[1].args, [1, 0, 0, 1, 50, 50]);

      assert.equal(ops[2].name, 'w');
      assert.equal(ops[2].getNumber(0), 2);

      assert.equal(ops[3].name, 'RG');
      assert.deepEqual(ops[3].args, [1, 0, 0]);

      assert.equal(ops[4].name, 're');
      assert.deepEqual(ops[4].args, [0, 0, 100, 200]);

      assert.equal(ops[5].name, 'S');
      assert.equal(ops[6].name, 'm');
      assert.equal(ops[7].name, 'l');
      assert.equal(ops[8].name, 'h');
      assert.equal(ops[9].name, 'f*');
      assert.equal(ops[10].name, 'Q');
    });

    it('should parse inline images (BI ... ID ... EI)', () => {
      const streamText = 'q\nBI /W 4 /H 2 /CS /DeviceRGB /BPC 8 ID\n\x01\x02\x03\x04\x05\x06\x07\x08\nEI\nQ';

      const ops = PdfContentParser.parse(streamText);
      assert.equal(ops.length, 3);
      assert.equal(ops[0].name, 'q');

      const biOp = ops[1];
      assert.equal(biOp.name, 'BI');
      const imgDict = biOp.args[0];
      const imgBytes = biOp.args[1];

      assert.equal(imgDict.getNumber('W'), 4);
      assert.equal(imgDict.getNumber('H'), 2);
      assert.equal(imgDict.getName('CS'), 'DeviceRGB');
      assert.equal(imgBytes.length, 8);

      assert.equal(ops[2].name, 'Q');
    });

    it('should parse directly from a PdfStream instance', () => {
      const dict = new PdfDictionary();
      dict.set('Filter', PdfName.of('ASCIIHexDecode'));
      const hexData = new TextEncoder().encode('42542028546573742920546A204554>'); // "BT (Test) Tj ET"
      const stream = new PdfStream(dict, hexData);

      const ops = PdfContentParser.parse(stream);
      assert.equal(ops.length, 3);
      assert.equal(ops[0].name, 'BT');
      assert.equal(ops[1].name, 'Tj');
      assert.equal(ops[1].getString(0), 'Test');
      assert.equal(ops[2].name, 'ET');
    });
  });
});
