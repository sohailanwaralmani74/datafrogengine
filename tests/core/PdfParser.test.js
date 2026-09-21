import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfBinaryReader } from '../../src/core/PdfBinaryReader.js';
import { PdfLexer } from '../../src/core/PdfLexer.js';
import { PdfParser } from '../../src/core/PdfParser.js';
import {
  PdfObjectType,
  PdfNull,
  PdfBoolean,
  PdfNumber,
  PdfName,
  PdfString,
  PdfHexString,
  PdfArray,
  PdfDictionary,
  PdfStream,
  PdfReference,
  PdfIndirectObject
} from '../../src/objects/index.js';
import { PdfParseException } from '../../src/errors/index.js';

function createParser(inputString) {
  const bytes = new TextEncoder().encode(inputString);
  const reader = new PdfBinaryReader(bytes.buffer);
  const lexer = new PdfLexer(reader);
  return new PdfParser(lexer);
}

describe('PdfParser', () => {
  describe('Primitive PDF Objects', () => {
    it('should parse booleans and null', () => {
      const parser = createParser('true false null');
      
      const o1 = parser.parseObject();
      assert.equal(o1.type, PdfObjectType.BOOLEAN);
      assert.equal(o1.value, true);

      const o2 = parser.parseObject();
      assert.equal(o2.type, PdfObjectType.BOOLEAN);
      assert.equal(o2.value, false);

      const o3 = parser.parseObject();
      assert.equal(o3.type, PdfObjectType.NULL);
      assert.equal(o3.value, null);
    });

    it('should parse numbers and names', () => {
      const parser = createParser('123 -45.67 /Catalog /F#201');

      const num1 = parser.parseObject();
      assert.equal(num1.type, PdfObjectType.NUMBER);
      assert.equal(num1.value, 123);
      assert.equal(num1.isInteger(), true);

      const num2 = parser.parseObject();
      assert.equal(num2.type, PdfObjectType.NUMBER);
      assert.equal(num2.value, -45.67);
      assert.equal(num2.isReal(), true);

      const name1 = parser.parseObject();
      assert.equal(name1.type, PdfObjectType.NAME);
      assert.equal(name1.value, 'Catalog');

      const name2 = parser.parseObject();
      assert.equal(name2.type, PdfObjectType.NAME);
      assert.equal(name2.value, 'F 1');
    });

    it('should parse literal strings and hex strings', () => {
      const parser = createParser('(Hello \\(World\\)) <48656C6C6F>');

      const str1 = parser.parseObject();
      assert.equal(str1.type, PdfObjectType.STRING);
      assert.equal(str1.value, 'Hello (World)');

      const str2 = parser.parseObject();
      assert.equal(str2.type, PdfObjectType.HEX_STRING);
      assert.equal(str2.value, 'Hello');
    });
  });

  describe('Arrays', () => {
    it('should parse flat and nested arrays', () => {
      const parser = createParser('[ 1 2 [ 3 /Inner ] (Test) ]');
      const arr = parser.parseObject();

      assert.equal(arr.type, PdfObjectType.ARRAY);
      assert.equal(arr.size(), 4);
      assert.equal(arr.getNumber(0), 1);
      assert.equal(arr.getNumber(1), 2);

      const nested = arr.getArray(2);
      assert.equal(nested.size(), 2);
      assert.equal(nested.getNumber(0), 3);
      assert.equal(nested.getName(1), 'Inner');

      assert.equal(arr.getString(3), 'Test');
    });

    it('should throw for unterminated array', () => {
      const parser = createParser('[ 1 2 3');
      assert.throws(() => parser.parseObject(), PdfParseException);
    });
  });

  describe('Dictionaries', () => {
    it('should parse dictionaries with various value types', () => {
      const src = `
        <<
          /Type /Pages
          /Count 2
          /Kids [ 4 0 R 5 0 R ]
          /Parent null
        >>
      `;
      const parser = createParser(src);
      const dict = parser.parseObject();

      assert.equal(dict.type, PdfObjectType.DICTIONARY);
      assert.equal(dict.getName('Type'), 'Pages');
      assert.equal(dict.getNumber('Count'), 2);

      const kids = dict.getArray('Kids');
      assert.equal(kids.size(), 2);
      assert.equal(kids.getReference(0).objectNumber, 4);
      assert.equal(kids.getReference(1).objectNumber, 5);

      assert.equal(dict.get('Parent').isNull(), true);
    });

    it('should throw for missing value or unterminated dictionary', () => {
      const p1 = createParser('<< /Key >>');
      assert.throws(() => p1.parseObject(), PdfParseException);

      const p2 = createParser('<< /Key 123');
      assert.throws(() => p2.parseObject(), PdfParseException);
    });
  });

  describe('References vs Numbers', () => {
    it('should parse indirect references (12 0 R)', () => {
      const parser = createParser('12 0 R');
      const ref = parser.parseObject();

      assert.equal(ref.type, PdfObjectType.REFERENCE);
      assert.equal(ref.objectNumber, 12);
      assert.equal(ref.generationNumber, 0);
    });

    it('should distinguish standalone integers from references', () => {
      const parser = createParser('12 0 42');
      const n1 = parser.parseObject();
      const n2 = parser.parseObject();
      const n3 = parser.parseObject();

      assert.equal(n1.value, 12);
      assert.equal(n2.value, 0);
      assert.equal(n3.value, 42);
    });
  });

  describe('Streams', () => {
    it('should parse dictionary with stream data using /Length', () => {
      const src = '<< /Length 11 /Filter /FlateDecode >>\nstream\nHello World\nendstream';
      const parser = createParser(src);
      const stream = parser.parseObject();

      assert.equal(stream.type, PdfObjectType.STREAM);
      assert.equal(stream.length, 11);
      assert.equal(new TextDecoder().decode(stream.bytes), 'Hello World');
      assert.equal(stream.getFilter().value, 'FlateDecode');
    });

    it('should parse stream by scanning for endstream when Length is not a direct number', () => {
      const src = '<< /Filter /ASCIIHexDecode >>\nstream\n48656C6C6F\nendstream';
      const parser = createParser(src);
      const stream = parser.parseObject();

      assert.equal(stream.type, PdfObjectType.STREAM);
      assert.equal(new TextDecoder().decode(stream.bytes).trim(), '48656C6C6F');
    });
  });

  describe('Indirect Objects', () => {
    it('should parse complete indirect object definition', () => {
      const src = `
        25 0 obj
        <<
          /Type /Catalog
          /Pages 1 0 R
        >>
        endobj
      `;
      const parser = createParser(src);
      const indObj = parser.parseObject();

      assert.equal(indObj.type, PdfObjectType.INDIRECT_OBJECT);
      assert.equal(indObj.objectNumber, 25);
      assert.equal(indObj.generationNumber, 0);
      assert.equal(indObj.isDictionary(), true);
      assert.equal(indObj.value.getName('Type'), 'Catalog');
    });

    it('should parse indirect stream object', () => {
      const src = '10 0 obj\n<< /Length 5 >>\nstream\n12345\nendstream\nendobj';
      const parser = createParser(src);
      const indObj = parser.parseObject();

      assert.equal(indObj.type, PdfObjectType.INDIRECT_OBJECT);
      assert.equal(indObj.objectNumber, 10);
      assert.equal(indObj.isStream(), true);
      assert.equal(indObj.value.length, 5);
      assert.equal(new TextDecoder().decode(indObj.value.bytes), '12345');
    });
  });
});
