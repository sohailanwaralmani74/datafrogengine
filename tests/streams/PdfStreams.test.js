import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PdfStreamDecoder,
  ASCIIHexDecode,
  ASCII85Decode,
  RunLengthDecode,
  LZWDecode,
  FlateDecode,
  Predictor
} from '../../src/streams/index.js';
import { PdfStream } from '../../src/objects/PdfStream.js';
import { PdfDictionary } from '../../src/objects/PdfDictionary.js';
import { PdfName } from '../../src/objects/PdfName.js';
import { PdfNumber } from '../../src/objects/PdfNumber.js';
import { PdfArray } from '../../src/objects/PdfArray.js';
import { PdfStreamException } from '../../src/errors/index.js';

describe('Stream and Filter Engine (Phase 6)', () => {
  describe('ASCIIHexDecode', () => {
    it('should decode hexadecimal byte stream', () => {
      const input = new TextEncoder().encode('48656C6C6F20576F726C64>');
      const output = ASCIIHexDecode.decode(input);
      assert.equal(new TextDecoder().decode(output), 'Hello World');
    });

    it('should ignore whitespace and handle odd trailing digits', () => {
      const input = new TextEncoder().encode('48 65 6c 6c 6f 20 57 6f 72 6c 64 >');
      const output = ASCIIHexDecode.decode(input);
      assert.equal(new TextDecoder().decode(output), 'Hello World');
    });

    it('should throw PdfStreamException on invalid hex characters', () => {
      const input = new TextEncoder().encode('4865ZZ>');
      assert.throws(() => ASCIIHexDecode.decode(input), PdfStreamException);
    });
  });

  describe('ASCII85Decode', () => {
    it('should decode standard ASCII85 streams', () => {
      // "Hello world!" in ASCII85 is '87cURD]j7BEbo80~>'
      const input = new TextEncoder().encode('87cURD]j7BEbo80~>');
      const output = ASCII85Decode.decode(input);
      assert.equal(new TextDecoder().decode(output), 'Hello world!');
    });

    it('should handle "z" shorthand for four zero bytes', () => {
      // 'z' followed by 'FCfN8~>' ("test") -> 4 zeros + "test"
      const input = new TextEncoder().encode('zFCfN8~>');
      const output = ASCII85Decode.decode(input);
      assert.equal(output.length, 8);
      assert.deepEqual(Array.from(output.subarray(0, 4)), [0, 0, 0, 0]);
      assert.equal(new TextDecoder().decode(output.subarray(4)), 'test');
    });
  });

  describe('RunLengthDecode', () => {
    it('should decode literal runs and repeated byte runs', () => {
      // [0, 65, 255, 66, 128]
      // 0 -> 1 literal byte: 'A' (65)
      // 255 -> 257 - 255 = 2 repeats of 'B' (66)
      // 128 -> EOD
      const input = new Uint8Array([0, 65, 255, 66, 128]);
      const output = RunLengthDecode.decode(input);
      assert.equal(new TextDecoder().decode(output), 'ABB');
    });
  });

  describe('LZWDecode', () => {
    it('should decode basic LZW encoded stream', () => {
      // Encodes: ClearTable (256: 9 bits) + 'A' (65: 9 bits) + 'B' (66: 9 bits) + 'A' (65: 9 bits) + EOD (257: 9 bits)
      const input = new Uint8Array([
        0x80, 0x10, 0x48, 0x44, 0x18, 0x08
      ]);

      const output = LZWDecode.decode(input, { EarlyChange: 1 });
      assert.equal(new TextDecoder().decode(output), 'ABA');
    });
  });

  describe('FlateDecode', () => {
    it('should decompress zlib/flate compressed streams', () => {
      // Compressed uncompressed block of "Hello, PDF Stream Engine!"
      // Type 0 uncompressed block: 0x78 0x9c (header) + 0x01 (final, type 0) + len(25) + nlen(~25) + data + adler32
      const str = 'Hello, PDF Stream Engine!';
      const strBytes = new TextEncoder().encode(str);
      const len = strBytes.length;
      const nlen = len ^ 0xFFFF;

      const zlibData = new Uint8Array(2 + 1 + 4 + len + 4);
      zlibData[0] = 0x78;
      zlibData[1] = 0x9C;
      zlibData[2] = 0x01; // final block, uncompressed
      zlibData[3] = len & 0xFF;
      zlibData[4] = (len >> 8) & 0xFF;
      zlibData[5] = nlen & 0xFF;
      zlibData[6] = (nlen >> 8) & 0xFF;
      zlibData.set(strBytes, 7);

      const output = FlateDecode.decode(zlibData);
      assert.equal(new TextDecoder().decode(output), 'Hello, PDF Stream Engine!');
    });
  });

  describe('Predictor Algorithms', () => {
    it('should invert TIFF Predictor 2 (horizontal differencing)', () => {
      // Row 1: [10, 2, 3] -> original [10, 12, 15]
      // Row 2: [20, 5, 1] -> original [20, 25, 26]
      const input = new Uint8Array([10, 2, 3, 20, 5, 1]);
      const params = {
        Predictor: 2,
        Columns: 3,
        Colors: 1,
        BitsPerComponent: 8
      };

      const reconstructed = Predictor.process(input, params);
      assert.deepEqual(Array.from(reconstructed), [10, 12, 15, 20, 25, 26]);
    });

    it('should invert PNG Predictor 1 (Sub / Left)', () => {
      // 2 rows, 3 cols, 1 bpp
      // Row 1: tag 1 (Sub), differences [10, 2, 3] -> [10, 12, 15]
      // Row 2: tag 1 (Sub), differences [20, 5, 1] -> [20, 25, 26]
      const input = new Uint8Array([
        1, 10, 2, 3,
        1, 20, 5, 1
      ]);
      const params = {
        Predictor: 15,
        Columns: 3,
        Colors: 1,
        BitsPerComponent: 8
      };

      const reconstructed = Predictor.process(input, params);
      assert.deepEqual(Array.from(reconstructed), [10, 12, 15, 20, 25, 26]);
    });

    it('should invert PNG Predictor 2 (Up / Above)', () => {
      // Row 1: tag 0 (None): [10, 20, 30]
      // Row 2: tag 2 (Up):   [5,  10, 15] -> [15, 30, 45]
      const input = new Uint8Array([
        0, 10, 20, 30,
        2, 5,  10, 15
      ]);
      const params = {
        Predictor: 15,
        Columns: 3,
        Colors: 1,
        BitsPerComponent: 8
      };

      const reconstructed = Predictor.process(input, params);
      assert.deepEqual(Array.from(reconstructed), [10, 20, 30, 15, 30, 45]);
    });
  });

  describe('PdfStreamDecoder Pipeline', () => {
    it('should decode a stream with single filter and decodeText', () => {
      const dict = new PdfDictionary();
      dict.set('Filter', PdfName.of('ASCIIHexDecode'));

      const rawHex = new TextEncoder().encode('48656C6C6F20576F726C64>');
      const stream = new PdfStream(dict, rawHex);

      const text = PdfStreamDecoder.decodeText(stream);
      assert.equal(text, 'Hello World');
    });

    it('should decode a chained filter pipeline ([ /ASCIIHexDecode /RunLengthDecode ])', () => {
      // 1. Literal "ABB" encoded with RunLengthDecode -> [0, 65, 255, 66, 128]
      // 2. [0, 65, 255, 66, 128] encoded with ASCIIHexDecode -> "0041FF4280>"
      const dict = new PdfDictionary();
      dict.set('Filter', new PdfArray([
        PdfName.of('ASCIIHexDecode'),
        PdfName.of('RunLengthDecode')
      ]));

      const rawHex = new TextEncoder().encode('0041FF4280>');
      const stream = new PdfStream(dict, rawHex);

      const output = PdfStreamDecoder.decode(stream);
      assert.equal(new TextDecoder().decode(output), 'ABB');
    });

    it('should recognize standard filter abbreviations (e.g. /AHx, /RL, /Fl)', () => {
      const dict = new PdfDictionary();
      dict.set('Filter', PdfName.of('AHx'));

      const rawHex = new TextEncoder().encode('504446>');
      const stream = new PdfStream(dict, rawHex);

      const text = PdfStreamDecoder.decodeText(stream);
      assert.equal(text, 'PDF');
    });
  });
});
