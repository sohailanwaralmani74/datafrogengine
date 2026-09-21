import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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

describe('PDF Object Model', () => {
  describe('PdfNull', () => {
    it('should behave as singleton and identify type', () => {
      const n1 = PdfNull.INSTANCE;
      const n2 = new PdfNull();
      assert.equal(n1.type, PdfObjectType.NULL);
      assert.equal(n1.isNull(), true);
      assert.equal(n1.value, null);
      assert.equal(n1.equals(n2), true);
      assert.equal(n1.toString(), 'null');
    });
  });

  describe('PdfBoolean', () => {
    it('should represent booleans with singletons and factories', () => {
      const bTrue = PdfBoolean.TRUE;
      const bFalse = PdfBoolean.FALSE;
      assert.equal(bTrue.type, PdfObjectType.BOOLEAN);
      assert.equal(bTrue.isBoolean(), true);
      assert.equal(bTrue.value, true);
      assert.equal(bFalse.value, false);
      assert.equal(PdfBoolean.of(true), bTrue);
      assert.equal(PdfBoolean.of(false), bFalse);
      assert.equal(bTrue.toString(), 'true');
      assert.equal(bFalse.toString(), 'false');
    });
  });

  describe('PdfNumber', () => {
    it('should distinguish integers and real numbers', () => {
      const intNum = PdfNumber.of(42);
      const realNum = PdfNumber.of(3.14);

      assert.equal(intNum.type, PdfObjectType.NUMBER);
      assert.equal(intNum.isNumber(), true);
      assert.equal(intNum.isInteger(), true);
      assert.equal(intNum.isReal(), false);
      assert.equal(intNum.intValue(), 42);
      assert.equal(intNum.toString(), '42');

      assert.equal(realNum.isInteger(), false);
      assert.equal(realNum.isReal(), true);
      assert.equal(realNum.floatValue(), 3.14);
      assert.equal(realNum.toString(), '3.14');
    });
  });

  describe('PdfName', () => {
    it('should store names without leading slash and pool standard names', () => {
      const typeName = PdfName.of('/Type');
      const pagesName = PdfName.PAGES;

      assert.equal(typeName.type, PdfObjectType.NAME);
      assert.equal(typeName.isName(), true);
      assert.equal(typeName.value, 'Type');
      assert.equal(typeName.name, 'Type');
      assert.equal(pagesName.value, 'Pages');
      assert.equal(typeName.toString(), '/Type');
      assert.equal(typeName.equals('/Type'), true);
      assert.equal(typeName.equals('Type'), true);
      assert.equal(PdfName.of('Type'), typeName); // pooled
    });
  });

  describe('PdfString & PdfHexString', () => {
    it('should represent literal strings and binary payloads', () => {
      const str = PdfString.of('Hello (PDF)');
      assert.equal(str.type, PdfObjectType.STRING);
      assert.equal(str.isString(), true);
      assert.equal(str.value, 'Hello (PDF)');
      assert.equal(str.asUtf8(), 'Hello (PDF)');
      assert.equal(str.bytes.length, 11);
    });

    it('should represent hex strings', () => {
      const hexStr = PdfHexString.fromHex('48656C6C6F');
      assert.equal(hexStr.type, PdfObjectType.HEX_STRING);
      assert.equal(hexStr.isString(), true);
      assert.equal(hexStr.isHexString(), true);
      assert.equal(hexStr.value, 'Hello');
      assert.equal(hexStr.hex, '48656C6C6F');
      assert.equal(hexStr.toString(), '<48656C6C6F>');
    });
  });

  describe('PdfArray', () => {
    it('should support array manipulation and typed getters', () => {
      const arr = new PdfArray([
        PdfNumber.of(100),
        PdfName.of('Page'),
        PdfString.of('Sample')
      ]);

      assert.equal(arr.type, PdfObjectType.ARRAY);
      assert.equal(arr.isArray(), true);
      assert.equal(arr.size(), 3);
      assert.equal(arr.length, 3);
      assert.equal(arr.getNumber(0), 100);
      assert.equal(arr.getName(1), 'Page');
      assert.equal(arr.getString(2), 'Sample');

      arr.add(PdfBoolean.TRUE);
      assert.equal(arr.size(), 4);
      assert.equal(arr.get(3), PdfBoolean.TRUE);

      const items = Array.from(arr);
      assert.equal(items.length, 4);
    });
  });

  describe('PdfDictionary', () => {
    it('should support key normalization and typed getters', () => {
      const dict = new PdfDictionary();
      dict.set('Type', PdfName.of('Page'));
      dict.set('/Count', PdfNumber.of(5));
      dict.set('MediaBox', new PdfArray([PdfNumber.of(0), PdfNumber.of(0), PdfNumber.of(612), PdfNumber.of(792)]));

      assert.equal(dict.type, PdfObjectType.DICTIONARY);
      assert.equal(dict.isDictionary(), true);
      assert.equal(dict.size(), 3);
      assert.equal(dict.has('Type'), true);
      assert.equal(dict.has('/Type'), true);
      assert.equal(dict.getName('Type'), 'Page');
      assert.equal(dict.getNumber('Count'), 5);
      assert.equal(dict.getArray('MediaBox').size(), 4);
    });
  });

  describe('PdfReference & PdfIndirectObject', () => {
    it('should handle references and indirect objects', () => {
      const ref = PdfReference.of(10, 0);
      assert.equal(ref.type, PdfObjectType.REFERENCE);
      assert.equal(ref.isReference(), true);
      assert.equal(ref.objectNumber, 10);
      assert.equal(ref.generationNumber, 0);
      assert.equal(ref.toString(), '10 0 R');

      const dict = new PdfDictionary();
      dict.set('Type', PdfName.PAGE);
      const indObj = new PdfIndirectObject(10, 0, dict);

      assert.equal(indObj.type, PdfObjectType.INDIRECT_OBJECT);
      assert.equal(indObj.isIndirectObject(), true);
      assert.equal(indObj.objectNumber, 10);
      assert.equal(indObj.generationNumber, 0);
      assert.equal(indObj.value, dict);
      assert.equal(indObj.getReference().equals(ref), true);
    });
  });

  describe('PdfStream', () => {
    it('should wrap dictionary and byte payload', () => {
      const dict = new PdfDictionary();
      dict.set('Length', PdfNumber.of(12));
      dict.set('Filter', PdfName.of('FlateDecode'));

      const bytes = new TextEncoder().encode('Stream Bytes');
      const stream = new PdfStream(dict, bytes);

      assert.equal(stream.type, PdfObjectType.STREAM);
      assert.equal(stream.isStream(), true);
      assert.equal(stream.length, 12);
      assert.equal(stream.getFilter().value, 'FlateDecode');
      assert.equal(stream.getNumber('Length'), 12);
    });
  });
});
