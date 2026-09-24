import { PdfObjectWriter } from './PdfObjectWriter.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfReference } from '../objects/PdfReference.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfIndirectObject } from '../objects/PdfIndirectObject.js';
import { PdfHexString } from '../objects/PdfHexString.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';
import { FlateEncode } from '../streams/filters/FlateEncode.js';



/**
 * Pure JavaScript PDF Serializer / File Generator.
 * Serializes PdfDocument object graphs into compliant PDF 1.0-1.7 binary files.
 */
export class PdfWriter {
  /**
   * Serializes a PdfDocument to a complete PDF file buffer.
   * 
   * @param {PdfDocument} document
   * @returns {Uint8Array}
   */
  static write(document, options = {}) {
    if (!document || typeof document.getCatalog !== 'function' || typeof document.getXRefTable !== 'function') {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument instance');
    }

    const version = document.getPdfVersion() || '1.7';

    if (options.compact === true && !document.securityHandler && PdfWriter.#versionAtLeast(version, '1.5')) {
      return PdfWriter.#writeCompact(document, version);
    }

    const chunks = [];

    // 1. File Header
    const headAscii = new TextEncoder().encode(`%PDF-${version}\n%`);
    const headerBytes = new Uint8Array(headAscii.length + 5);
    headerBytes.set(headAscii, 0);
    headerBytes[headAscii.length] = 0xFF;
    headerBytes[headAscii.length + 1] = 0xFF;
    headerBytes[headAscii.length + 2] = 0xFF;
    headerBytes[headAscii.length + 3] = 0xFF;
    headerBytes[headAscii.length + 4] = 0x0A; // '\n'
    chunks.push(headerBytes);

    // 2. Collect and renumber all reachable indirect objects starting from Catalog
    const { objectList, catalogRef, infoRef } = PdfWriter.#collectObjects(document);

    const secHandler = document.securityHandler;
    let encryptRef = null;
    let encryptObjNum = null;

    if (secHandler) {
      const encryptDict = secHandler.toDictionary();
      encryptObjNum = objectList.length + 1;
      encryptRef = new PdfReference(encryptObjNum, 0);
      objectList.push({ num: encryptObjNum, obj: encryptDict });
    }

    // 3. Write each indirect object and record its byte offset
    const offsets = new Map(); // objNum -> byte offset
    let currentOffset = headerBytes.length;

    for (const item of objectList) {
      const objNum = item.num;
      const objVal = item.obj;

      offsets.set(objNum, currentOffset);

      const head = new TextEncoder().encode(`${objNum} 0 obj\n`);
      const isEncryptDict = objNum === encryptObjNum;
      const body = PdfObjectWriter.serialize(objVal, {
        securityHandler: isEncryptDict ? null : secHandler,
        objNum
      });
      const tail = new TextEncoder().encode('\nendobj\n');

      chunks.push(head, body, tail);
      currentOffset += head.length + body.length + tail.length;
    }

    // 4. Cross-Reference Table (xref)
    const startXRefOffset = currentOffset;
    const totalObjects = Math.max(1, ...objectList.map(item => item.num)) + 1;

    const xrefLines = [
      'xref\n',
      `0 ${totalObjects}\n`,
      '0000000000 65535 f \n'
    ];

    for (let num = 1; num < totalObjects; num++) {
      const off = offsets.get(num);
      if (off === undefined) {
        xrefLines.push('0000000000 65535 f \\n');
      } else {
        const paddedOff = String(off).padStart(10, '0');
        xrefLines.push(paddedOff + ' 00000 n \\n');
      }
    }

    const xrefChunk = new TextEncoder().encode(xrefLines.join(''));
    chunks.push(xrefChunk);
    currentOffset += xrefChunk.length;

    // 5. Trailer Dictionary
    const trailerDict = new PdfDictionary();
    trailerDict.set('Size', PdfNumber.of(totalObjects));
    trailerDict.set('Root', catalogRef);
    if (infoRef) {
      trailerDict.set('Info', infoRef);
    }

    if (encryptRef && secHandler) {
      trailerDict.set('Encrypt', encryptRef);
      trailerDict.set('ID', new PdfArray([
        PdfHexString.of(secHandler.fileId),
        PdfHexString.of(secHandler.fileId)
      ]));
    }

    const trailerHeader = new TextEncoder().encode('trailer\n');
    const trailerBody = PdfObjectWriter.serialize(trailerDict);
    const trailerTail = new TextEncoder().encode(`\nstartxref\n${startXRefOffset}\n%%EOF\n`);

    chunks.push(trailerHeader, trailerBody, trailerTail);

    return PdfObjectWriter.concatBytes(chunks);
  }


  static #versionAtLeast(actual, minimum) {
    const [aMajor, aMinor] = String(actual).split('.').map(Number);
    const [bMajor, bMinor] = String(minimum).split('.').map(Number);
    return aMajor > bMajor || (aMajor === bMajor && aMinor >= bMinor);
  }

  static #writeCompact(document, version) {
    const { objectList, catalogRef, infoRef } = PdfWriter.#collectObjects(document, { expandCompressed: true });

    objectList.sort((a, b) => a.num - b.num);
    const oldToNew = new Map();
    objectList.forEach((item, index) => oldToNew.set(item.num, index + 1));

    const remap = (value) => {
      if (!value) return value;
      if (value instanceof PdfReference) {
        const mapped = oldToNew.get(value.objectNumber);
        return mapped !== undefined ? PdfReference.of(mapped, 0) : value;
      }
      if (value instanceof PdfArray) {
        const arr = new PdfArray();
        for (let i = 0; i < value.size(); i++) arr.push(remap(value.get(i)));
        return arr;
      }
      if (value instanceof PdfDictionary) {
        const dict = new PdfDictionary();
        for (const [k, v] of value.entries()) dict.set(k, remap(v));
        return dict;
      }
      return value;
    };

    const mappedObjects = objectList.map((item, index) => {
      const mapped = item.obj instanceof PdfStream
        ? new PdfStream(remap(item.obj.dictionary), item.obj.bytes)
        : remap(item.obj);
      return { num: index + 1, obj: mapped };
    });

    const mappedCatalogRef = PdfReference.of(oldToNew.get(catalogRef.objectNumber), 0);
    const mappedInfoRef = infoRef && oldToNew.has(infoRef.objectNumber)
      ? PdfReference.of(oldToNew.get(infoRef.objectNumber), 0)
      : null;

    const packed = [];
    const direct = [];
    for (const item of mappedObjects) {
      const type = item.obj instanceof PdfDictionary ? item.obj.getName('Type') : null;
      const keepDirect = item.obj instanceof PdfStream ||
        type === 'Catalog' || type === 'Pages' || type === 'Page';
      if (keepDirect) direct.push(item);
      else packed.push(item);
    }

    let nextObjectNumber = mappedObjects.length + 1;
    const xrefEntries = new Map();
    const chunks = [];
    const header = new TextEncoder().encode('%PDF-' + version + '\n%\xFF\xFF\xFF\xFF\n');
    chunks.push(header);
    let offset = header.length;

    const writeObject = (num, obj) => {
      const head = new TextEncoder().encode(String(num) + ' 0 obj\n');
      const body = PdfObjectWriter.serialize(obj);
      const tail = new TextEncoder().encode('\nendobj\n');
      xrefEntries.set(num, { type: 1, field2: offset, field3: 0 });
      chunks.push(head, body, tail);
      offset += head.length + body.length + tail.length;
    };

    direct.sort((a, b) => a.num - b.num);
    for (const item of direct) writeObject(item.num, item.obj);

    for (let start = 0; start < packed.length; start += 100) {
      const group = packed.slice(start, start + 100);
      const headers = [];
      const bodies = [];
      let bodyOffset = 0;

      for (const item of group) {
        const body = PdfObjectWriter.serialize(item.obj);
        headers.push(String(item.num) + ' ' + String(bodyOffset));
        bodies.push(body);
        bodyOffset += body.length + 1;
      }

      const headerBytes = new TextEncoder().encode(headers.join(' ') + '\n');
      const separator = new Uint8Array([0x20]);
      const parts = [headerBytes];
      for (const body of bodies) parts.push(body, separator);
      const raw = PdfObjectWriter.concatBytes(parts);
      const encoded = FlateEncode.encode(raw);
      const streamNum = nextObjectNumber++;

      const dict = new PdfDictionary();
      dict.set('Type', PdfName.of('ObjStm'));
      dict.set('N', PdfNumber.of(group.length));
      dict.set('First', PdfNumber.of(headerBytes.length));
      dict.set('Filter', PdfName.of('FlateDecode'));

      writeObject(streamNum, new PdfStream(dict, encoded));

      group.forEach((item, index) => {
        xrefEntries.set(item.num, { type: 2, field2: streamNum, field3: index });
      });
    }

    const xrefNum = nextObjectNumber++;
    const size = xrefNum + 1;
    const xrefOffset = offset;
    const entryWidth = 7;
    const xrefRaw = new Uint8Array(size * entryWidth);

    const putBE = (value, width, position) => {
      for (let i = width - 1; i >= 0; i--) {
        xrefRaw[position + (width - 1 - i)] = Math.floor(value / (2 ** (i * 8))) & 0xFF;
      }
    };

    putBE(0, 1, 0);
    putBE(0, 4, 1);
    putBE(0xFFFF, 2, 5);

    for (let num = 1; num < size; num++) {
      const entry = xrefEntries.get(num) || { type: 0, field2: 0, field3: 0 };
      const p = num * entryWidth;
      putBE(entry.type, 1, p);
      putBE(entry.field2, 4, p + 1);
      putBE(entry.field3, 2, p + 5);
    }

    const xrefDict = new PdfDictionary();
    xrefDict.set('Type', PdfName.of('XRef'));
    xrefDict.set('Size', PdfNumber.of(size));
    xrefDict.set('W', new PdfArray([PdfNumber.of(1), PdfNumber.of(4), PdfNumber.of(2)]));
    xrefDict.set('Root', mappedCatalogRef);
    if (mappedInfoRef) xrefDict.set('Info', mappedInfoRef);
    xrefDict.set('Filter', PdfName.of('FlateDecode'));

    writeObject(xrefNum, new PdfStream(xrefDict, FlateEncode.encode(xrefRaw)));
    chunks.push(new TextEncoder().encode('startxref\n' + String(xrefOffset) + '\n%%EOF\n'));

    return PdfObjectWriter.concatBytes(chunks);
  }

  /**
   * Traverses and collects all reachable objects from the document catalog.
   * Assigns clean sequential object numbers 1, 2, 3, ...
   * @private
   */
  static #collectObjects(document, options = {}) {
    const catalog = document.getCatalog();
    const catalogDict = catalog.dictionary;

    const objectList = []; // { num, obj }
    const visitedOldKeys = new Map(); // oldKey -> newObjNum
    const directToRef = new Map(); // Object -> PdfReference
    const xref = document.getXRefTable();
    const reservedNumbers = new Set(xref.getEntries().map(entry => entry.objectNumber));
    let nextNum = Math.max(1, xref.getHighestObjectNumber() + 1);

    // Preserve the original catalog object number so references to compressed
    // objects and existing object streams remain valid after rewriting.
    const rootRef = xref.getTrailer() ? xref.getTrailer().getRoot() : null;
    const catalogNum = rootRef && rootRef.isReference && rootRef.isReference() ? rootRef.objectNumber : nextNum++;
    const catalogRef = PdfReference.of(catalogNum, rootRef && rootRef.isReference && rootRef.isReference() ? rootRef.generationNumber : 0);
    directToRef.set(catalogDict, catalogRef);

    const queue = [{ num: catalogNum, obj: catalogDict }];

    const getOrAssignDirectRef = (obj) => {
      if (directToRef.has(obj)) {
        return directToRef.get(obj);
      }
      while (reservedNumbers.has(nextNum) || [...directToRef.values()].some(ref => ref.objectNumber === nextNum)) nextNum++;
      const num = nextNum++;
      const ref = PdfReference.of(num, 0);
      directToRef.set(obj, ref);
      queue.push({ num, obj });
      return ref;
    };

    // Deep copy / reference collector
    const processValue = (val, currentPath = new Set()) => {
      if (!val) return val;

      if (val instanceof PdfReference) {
        const oldKey = `${val.objectNumber}:${val.generationNumber}`;
        if (visitedOldKeys.has(oldKey)) {
          return PdfReference.of(visitedOldKeys.get(oldKey), 0);
        }

        const entry = xref.getEntry(val.objectNumber);
        if (entry && entry.isCompressed()) {
          if (options.expandCompressed) {
            const resolved = document.resolve(val);
            if (!resolved) return val;
            const assignedRef = getOrAssignDirectRef(resolved);
            visitedOldKeys.set(oldKey, assignedRef.objectNumber);
            return assignedRef;
          }

          const streamRef = PdfReference.of(entry.streamObjectNumber, 0);
          const streamObj = document.resolve(streamRef);
          if (streamObj && !directToRef.has(streamObj)) {
            directToRef.set(streamObj, streamRef);
            queue.push({ num: entry.streamObjectNumber, obj: streamObj });
          }
          visitedOldKeys.set(oldKey, val.objectNumber);
          return PdfReference.of(val.objectNumber, val.generationNumber);
        }

        const resolved = document.resolve(val);
        if (!resolved) {
          return val;
        }

        const assignedNum = val.objectNumber;
        const assignedRef = PdfReference.of(assignedNum, val.generationNumber);
        visitedOldKeys.set(oldKey, assignedNum);
        if (typeof resolved === 'object' && resolved !== null) {
          directToRef.set(resolved, assignedRef);
        }
        queue.push({ num: assignedNum, obj: resolved });
        return assignedRef;
      }

      if (val instanceof PdfStream) {
        return getOrAssignDirectRef(val);
      }

      if (val instanceof PdfDictionary) {
        const type = val.getName ? val.getName('Type') : null;
        if (type === 'Page' || type === 'Pages' || type === 'Catalog' || currentPath.has(val)) {
          return getOrAssignDirectRef(val);
        }

        const newPath = new Set(currentPath);
        newPath.add(val);

        const newDict = new PdfDictionary();
        for (const [k, v] of val.entries()) {
          newDict.set(k, processValue(v, newPath));
        }
        return newDict;
      }

      if (val instanceof PdfArray) {
        if (currentPath.has(val)) {
          return getOrAssignDirectRef(val);
        }
        const newPath = new Set(currentPath);
        newPath.add(val);

        const newArr = new PdfArray();
        for (let i = 0; i < val.size(); i++) {
          newArr.push(processValue(val.get(i), newPath));
        }
        return newArr;
      }

      return val;
    };

    // Check if document has /Info dictionary in trailer
    let infoRef = null;
    const trailer = document.getXRefTable ? document.getXRefTable().getTrailer() : null;
    const existingInfoRef = trailer ? trailer.getInfo() : null;
    if (existingInfoRef) {
      infoRef = processValue(existingInfoRef);
    }

    while (queue.length > 0) {
      const current = queue.shift();
      const num = current.num;
      const rawObj = current.obj;

      if (rawObj instanceof PdfDictionary) {
        const mappedDict = new PdfDictionary();
        for (const [k, v] of rawObj.entries()) {
          mappedDict.set(k, processValue(v));
        }
        objectList.push({ num, obj: mappedDict });
      } else if (rawObj instanceof PdfStream) {
        const mappedDict = new PdfDictionary();
        for (const [k, v] of rawObj.dictionary.entries()) {
          mappedDict.set(k, processValue(v));
        }
        objectList.push({ num, obj: new PdfStream(mappedDict, rawObj.bytes) });
      } else if (rawObj instanceof PdfArray) {
        const mappedArr = new PdfArray();
        for (let i = 0; i < rawObj.size(); i++) {
          mappedArr.push(processValue(rawObj.get(i)));
        }
        objectList.push({ num, obj: mappedArr });
      } else {
        objectList.push({ num, obj: rawObj });
      }
    }

    // Sort objects by assigned number
    objectList.sort((a, b) => a.num - b.num);

    return { objectList, catalogRef, infoRef };
  }
}
