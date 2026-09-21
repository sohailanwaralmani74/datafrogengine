import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfBinaryReader } from '../../src/core/PdfBinaryReader.js';
import { PdfOutOfBoundsException, PdfInvalidArgumentException } from '../../src/errors/index.js';

describe('PdfBinaryReader', () => {
  describe('Constructor and Initialization', () => {
    it('should construct from an ArrayBuffer', () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;
      const reader = new PdfBinaryReader(buffer);

      assert.equal(reader.length(), 5);
      assert.equal(reader.position(), 0);
      assert.equal(reader.remaining(), 5);
      assert.equal(reader.hasRemaining(), true);
    });

    it('should construct from a Uint8Array view with offset and length', () => {
      const buffer = new Uint8Array([10, 20, 30, 40, 50, 60]).buffer;
      const view = new Uint8Array(buffer, 2, 3); // 30, 40, 50
      const reader = new PdfBinaryReader(view);

      assert.equal(reader.length(), 3);
      assert.equal(reader.readByte(), 30);
      assert.equal(reader.readByte(), 40);
      assert.equal(reader.readByte(), 50);
      assert.equal(reader.hasRemaining(), false);
    });

    it('should construct from DataView', () => {
      const buffer = new Uint8Array([0xAA, 0xBB, 0xCC]).buffer;
      const dataView = new DataView(buffer);
      const reader = new PdfBinaryReader(dataView);

      assert.equal(reader.length(), 3);
      assert.equal(reader.readByte(), 0xAA);
    });

    it('should support static factory PdfBinaryReader.from', () => {
      const reader = PdfBinaryReader.from([65, 66, 67]);
      assert.equal(reader.length(), 3);
      assert.equal(reader.readAscii(3), 'ABC');

      const cloned = PdfBinaryReader.from(reader);
      assert.equal(cloned.length(), 3);
      assert.equal(cloned.readAscii(3), 'ABC');
    });

    it('should throw PdfInvalidArgumentException for invalid source', () => {
      assert.throws(() => new PdfBinaryReader(null), PdfInvalidArgumentException);
      assert.throws(() => new PdfBinaryReader('invalid'), PdfInvalidArgumentException);
      assert.throws(() => new PdfBinaryReader(123), PdfInvalidArgumentException);
    });

    it('should throw PdfOutOfBoundsException when offset/length exceed buffer', () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      assert.throws(() => new PdfBinaryReader(buffer, 5, 2), PdfOutOfBoundsException);
      assert.throws(() => new PdfBinaryReader(buffer, 1, 10), PdfOutOfBoundsException);
    });
  });

  describe('Positioning, Seeking, and Navigation', () => {
    it('should seek to valid positions', () => {
      const reader = PdfBinaryReader.from([10, 20, 30, 40, 50]);
      reader.seek(2);
      assert.equal(reader.position(), 2);
      assert.equal(reader.readByte(), 30);

      reader.seek(0);
      assert.equal(reader.position(), 0);
      assert.equal(reader.readByte(), 10);

      reader.seek(5);
      assert.equal(reader.position(), 5);
      assert.equal(reader.hasRemaining(), false);
    });

    it('should throw on out-of-bounds seek', () => {
      const reader = PdfBinaryReader.from([1, 2, 3]);
      assert.throws(() => reader.seek(-1), PdfOutOfBoundsException);
      assert.throws(() => reader.seek(4), PdfOutOfBoundsException);
      assert.throws(() => reader.seek('two'), PdfInvalidArgumentException);
    });

    it('should skip forward and backward', () => {
      const reader = PdfBinaryReader.from([1, 2, 3, 4, 5]);
      reader.skip(3);
      assert.equal(reader.position(), 3);
      assert.equal(reader.readByte(), 4);

      reader.skip(-2);
      assert.equal(reader.position(), 2);
      assert.equal(reader.readByte(), 3);
    });

    it('should throw on out-of-bounds skip', () => {
      const reader = PdfBinaryReader.from([1, 2, 3]);
      assert.throws(() => reader.skip(4), PdfOutOfBoundsException);
      assert.throws(() => reader.skip(-1), PdfOutOfBoundsException);
      reader.seek(2);
      assert.throws(() => reader.skip(-3), PdfOutOfBoundsException);
    });

    it('should reset position to 0', () => {
      const reader = PdfBinaryReader.from([1, 2, 3]);
      reader.readByte();
      reader.readByte();
      assert.equal(reader.position(), 2);
      reader.reset();
      assert.equal(reader.position(), 0);
      assert.equal(reader.readByte(), 1);
    });
  });

  describe('Byte and Integer Reading', () => {
    it('should read unsigned 8-bit bytes (readByte / readUInt8)', () => {
      const reader = PdfBinaryReader.from([0, 127, 128, 255]);
      assert.equal(reader.readByte(), 0);
      assert.equal(reader.readUInt8(), 127);
      assert.equal(reader.readByte(), 128);
      assert.equal(reader.readUInt8(), 255);
      assert.equal(reader.hasRemaining(), false);
      assert.throws(() => reader.readByte(), PdfOutOfBoundsException);
    });

    it('should read signed 8-bit bytes (readInt8)', () => {
      const reader = PdfBinaryReader.from([0, 127, 128, 255]);
      assert.equal(reader.readInt8(), 0);
      assert.equal(reader.readInt8(), 127);
      assert.equal(reader.readInt8(), -128);
      assert.equal(reader.readInt8(), -1);
    });

    it('should read unsigned and signed 16-bit integers (Big-Endian by default)', () => {
      // 0x1234 = 4660, 0xFF00 = 65280 (or signed -256)
      const reader = PdfBinaryReader.from([0x12, 0x34, 0xFF, 0x00]);
      assert.equal(reader.readUInt16(), 0x1234);
      assert.equal(reader.readInt16(), -256);
    });

    it('should read 16-bit integers with Little-Endian when requested', () => {
      const reader = PdfBinaryReader.from([0x34, 0x12]);
      assert.equal(reader.readUInt16(true), 0x1234);
    });

    it('should read unsigned and signed 32-bit integers (Big-Endian by default)', () => {
      // 0x12345678, 0x80000000 = 2147483648 unsigned, -2147483648 signed
      const reader = PdfBinaryReader.from([
        0x12, 0x34, 0x56, 0x78,
        0x80, 0x00, 0x00, 0x00
      ]);
      assert.equal(reader.readUInt32(), 0x12345678);
      assert.equal(reader.readInt32(), -2147483648);
    });

    it('should read 32-bit integers with Little-Endian when requested', () => {
      const reader = PdfBinaryReader.from([0x78, 0x56, 0x34, 0x12]);
      assert.equal(reader.readUInt32(true), 0x12345678);
    });

    it('should throw when reading integers past the end', () => {
      const reader = PdfBinaryReader.from([1, 2]);
      assert.throws(() => reader.readUInt32(), PdfOutOfBoundsException);
      reader.readUInt16();
      assert.throws(() => reader.readUInt16(), PdfOutOfBoundsException);
    });
  });

  describe('Byte sequence and String Reading', () => {
    it('should read multiple bytes with readBytes()', () => {
      const reader = PdfBinaryReader.from([1, 2, 3, 4, 5, 6]);
      const chunk1 = reader.readBytes(3);
      assert.deepEqual(Array.from(chunk1), [1, 2, 3]);
      assert.equal(reader.position(), 3);

      const emptyChunk = reader.readBytes(0);
      assert.equal(emptyChunk.length, 0);

      const chunk2 = reader.readBytes(3);
      assert.deepEqual(Array.from(chunk2), [4, 5, 6]);

      assert.throws(() => reader.readBytes(1), PdfOutOfBoundsException);
      assert.throws(() => reader.readBytes(-1), PdfInvalidArgumentException);
    });

    it('should read ASCII strings with readAscii()', () => {
      const pdfHeader = '%PDF-1.7\n';
      const bytes = Array.from(pdfHeader).map(c => c.charCodeAt(0));
      const reader = PdfBinaryReader.from(bytes);

      assert.equal(reader.readAscii(8), '%PDF-1.7');
      assert.equal(reader.readAscii(1), '\n');
      assert.equal(reader.readAscii(0), '');
      assert.throws(() => reader.readAscii(1), PdfOutOfBoundsException);
    });

    it('should read UTF-8 decoded strings with readString()', () => {
      const utf8Bytes = new TextEncoder().encode('Hello, PDF Engine! 🚀');
      const reader = new PdfBinaryReader(utf8Bytes.buffer);

      const text = reader.readString(utf8Bytes.length);
      assert.equal(text, 'Hello, PDF Engine! 🚀');
      assert.equal(reader.hasRemaining(), false);
    });
  });

  describe('Peeking Operations', () => {
    it('should peek bytes without advancing cursor', () => {
      const reader = PdfBinaryReader.from([0x10, 0x20, 0x30]);
      assert.equal(reader.peekByte(), 0x10);
      assert.equal(reader.position(), 0);

      assert.equal(reader.peekByte(1), 0x20);
      assert.equal(reader.peekByte(2), 0x30);
      assert.equal(reader.position(), 0);

      const peeked = reader.peekBytes(2);
      assert.deepEqual(Array.from(peeked), [0x10, 0x20]);
      assert.equal(reader.position(), 0);

      assert.throws(() => reader.peekByte(3), PdfOutOfBoundsException);
      assert.throws(() => reader.peekBytes(4), PdfOutOfBoundsException);
    });
  });

  describe('Sub-readers and Slicing', () => {
    it('should create independent subReader slices', () => {
      const reader = PdfBinaryReader.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const sub = reader.subReader(3, 4); // 3, 4, 5, 6

      assert.equal(sub.length(), 4);
      assert.equal(sub.readByte(), 3);
      assert.equal(sub.readByte(), 4);
      assert.equal(sub.readByte(), 5);
      assert.equal(sub.readByte(), 6);
      assert.equal(sub.hasRemaining(), false);

      // Parent reader position was unchanged
      assert.equal(reader.position(), 0);
    });

    it('should throw when creating out of bounds subReader', () => {
      const reader = PdfBinaryReader.from([1, 2, 3]);
      assert.throws(() => reader.subReader(2, 5), PdfOutOfBoundsException);
    });
  });

  describe('Searching (indexOf and lastIndexOf)', () => {
    it('should find patterns with indexOf', () => {
      const ascii = 'header trailer xref trailer %%EOF';
      const bytes = Array.from(ascii).map(c => c.charCodeAt(0));
      const reader = PdfBinaryReader.from(bytes);

      assert.equal(reader.indexOf('trailer'), 7);
      assert.equal(reader.indexOf('trailer', 8), 20);
      assert.equal(reader.indexOf('%%EOF'), 28);
      assert.equal(reader.indexOf('nonexistent'), -1);
    });

    it('should find patterns backward with lastIndexOf', () => {
      const ascii = 'header trailer xref trailer %%EOF';
      const bytes = Array.from(ascii).map(c => c.charCodeAt(0));
      const reader = PdfBinaryReader.from(bytes);

      assert.equal(reader.lastIndexOf('trailer'), 20);
      assert.equal(reader.lastIndexOf('trailer', 19), 7);
      assert.equal(reader.lastIndexOf('header'), 0);
      assert.equal(reader.lastIndexOf('nonexistent'), -1);
    });
  });
});
