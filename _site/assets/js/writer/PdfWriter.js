import { PdfObjectWriter } from './PdfObjectWriter.js';
import { PdfDocument } from '../document/PdfDocument.js';
import { pageExtractionHelper } from '../document/PdfPage.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfReference } from '../objects/PdfReference.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfIndirectObject } from '../objects/PdfIndirectObject.js';
import { PdfHexString } from '../objects/PdfHexString.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';



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
  static write(document) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }

    const version = document.getPdfVersion() || '1.7';
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
    const totalObjects = objectList.length + 1; // including object 0

    const xrefLines = [
      'xref\n',
      `0 ${totalObjects}\n`,
      '0000000000 65535 f \n'
    ];

    for (let num = 1; num < totalObjects; num++) {
      const off = offsets.get(num) || 0;
      const paddedOff = String(off).padStart(10, '0');
      xrefLines.push(`${paddedOff} 00000 n \n`);
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


  /**
   * Traverses and collects all reachable objects from the document catalog.
   * Assigns clean sequential object numbers 1, 2, 3, ...
   * @private
   */
  static #collectObjects(document) {
    const catalog = document.getCatalog();
    const catalogDict = catalog.dictionary;

    const objectList = []; // { num, obj }
    const visitedOldKeys = new Map(); // oldKey -> newObjNum
    const directToRef = new Map(); // Object -> PdfReference
    let nextNum = 1;

    // We will assign object number 1 to Catalog
    const catalogNum = nextNum++;
    const catalogRef = PdfReference.of(catalogNum, 0);
    directToRef.set(catalogDict, catalogRef);

    const queue = [{ num: catalogNum, obj: catalogDict }];

    const getOrAssignDirectRef = (obj) => {
      if (directToRef.has(obj)) {
        return directToRef.get(obj);
      }
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

        const resolved = document.resolve(val);
        if (!resolved) {
          return val;
        }

        const assignedNum = nextNum++;
        const assignedRef = PdfReference.of(assignedNum, 0);
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

pageExtractionHelper.PdfWriter = PdfWriter;
