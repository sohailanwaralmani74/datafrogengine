import { PdfBinaryReader } from '../core/PdfBinaryReader.js';
import { PdfLexer } from '../core/PdfLexer.js';
import { PdfTokenType } from '../core/PdfToken.js';
import { PdfParser } from '../core/PdfParser.js';
import { PdfXRefEntry } from './PdfXRefEntry.js';
import { PdfTrailer } from './PdfTrailer.js';
import { PdfIndirectObject } from '../objects/PdfIndirectObject.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfStreamDecoder } from '../streams/PdfStreamDecoder.js';
import { PdfXRefException } from '../errors/PdfXRefException.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Manages the PDF Cross-Reference (XRef) table and trailer resolution.
 */
export class PdfXRefTable {
  /** @type {Map<number, PdfXRefEntry>} */
  #entries;

  /** @type {PdfTrailer|null} */
  #trailer;

  constructor() {
    this.#entries = new Map();
    this.#trailer = null;
  }

  addEntry(entry, override = false) {
    if (!(entry instanceof PdfXRefEntry)) {
      throw new PdfInvalidArgumentException('entry', entry, 'PdfXRefEntry instance');
    }
    if (override || !this.#entries.has(entry.objectNumber)) {
      this.#entries.set(entry.objectNumber, entry);
    }
  }

  getEntry(objectNumber) { return this.#entries.get(objectNumber); }
  hasEntry(objectNumber) { return this.#entries.has(objectNumber); }
  getTrailer() { return this.#trailer; }

  setTrailer(trailer) {
    if (trailer !== null && !(trailer instanceof PdfTrailer)) {
      throw new PdfInvalidArgumentException('trailer', trailer, 'PdfTrailer instance');
    }
    this.#trailer = trailer;
  }

  getEntries() { return Array.from(this.#entries.values()); }

  getInUseEntries() {
    const list = [];
    for (const entry of this.#entries.values()) {
      if (entry.isInUse() || entry.isCompressed()) list.push(entry);
    }
    return list;
  }

  getFreeEntries() {
    const list = [];
    for (const entry of this.#entries.values()) {
      if (entry.isFree()) list.push(entry);
    }
    return list;
  }

  getHighestObjectNumber() {
    let max = 0;
    for (const objNum of this.#entries.keys()) {
      if (objNum > max) max = objNum;
    }
    return max;
  }

  size() { return this.#entries.size; }

  static findStartXRefOffset(reader) {
    if (!(reader instanceof PdfBinaryReader)) {
      throw new PdfInvalidArgumentException('reader', reader, 'PdfBinaryReader');
    }

    const fileLen = reader.length();
    const scanWindow = Math.min(fileLen, 2048);
    const startScanPos = fileLen - scanWindow;
    const startXRefIdx = reader.lastIndexOf('startxref', fileLen - 1);
    if (startXRefIdx === -1 || startXRefIdx < startScanPos) {
      const fullSearchIdx = reader.lastIndexOf('startxref', fileLen - 1);
      if (fullSearchIdx === -1) {
        throw new PdfXRefException('Could not locate startxref keyword in document', fileLen);
      }
      return PdfXRefTable.#readStartXRefValue(reader, fullSearchIdx);
    }
    return PdfXRefTable.#readStartXRefValue(reader, startXRefIdx);
  }

  static #readStartXRefValue(reader, startXRefOffset) {
    reader.seek(startXRefOffset);
    const lexer = new PdfLexer(reader);
    const token = lexer.nextToken();
    if (!token || token.type !== PdfTokenType.STARTXREF) {
      throw new PdfXRefException("Expected 'startxref' keyword", startXRefOffset);
    }
    const offsetToken = lexer.nextToken();
    if (!offsetToken || offsetToken.type !== PdfTokenType.INTEGER) {
      throw new PdfXRefException("Expected integer byte offset following 'startxref'", reader.position());
    }
    return offsetToken.value;
  }

  static parseFrom(reader, startXRefOffset) {
    const xrefTable = new PdfXRefTable();
    const visitedOffsets = new Set();
    let currentOffset = startXRefOffset;

    while (currentOffset !== undefined && currentOffset >= 0) {
      if (visitedOffsets.has(currentOffset)) break;
      visitedOffsets.add(currentOffset);

      reader.seek(currentOffset);
      const lexer = new PdfLexer(reader);
      const firstToken = lexer.nextToken();

      if (!firstToken) {
        throw new PdfXRefException(`Unexpected EOF at xref offset ${currentOffset}`, currentOffset);
      }

      if (firstToken.type === PdfTokenType.XREF) {
        const sectionTrailer = PdfXRefTable.#parseTraditionalXRef(reader, lexer, xrefTable);
        if (!xrefTable.getTrailer()) xrefTable.setTrailer(sectionTrailer);
        else xrefTable.getTrailer().mergeWith(sectionTrailer);
        currentOffset = sectionTrailer.getPrevOffset();
      } else if (firstToken.type === PdfTokenType.INTEGER || firstToken.type === PdfTokenType.DICT_START) {
        lexer.seek(currentOffset);
        const parser = new PdfParser(lexer);
        const parsedObj = parser.parseObject();
        const xrefStream = parsedObj instanceof PdfIndirectObject ? parsedObj.value : parsedObj;

        if (!(xrefStream instanceof PdfStream) || xrefStream.getName('Type') !== 'XRef') {
          throw new PdfXRefException(`Expected /Type /XRef stream at offset ${currentOffset}`, currentOffset);
        }

        const sectionTrailer = PdfXRefTable.#parseXRefStream(xrefStream, xrefTable);
        if (!xrefTable.getTrailer()) xrefTable.setTrailer(sectionTrailer);
        else xrefTable.getTrailer().mergeWith(sectionTrailer);
        currentOffset = sectionTrailer.getPrevOffset();
      } else {
        throw new PdfXRefException(`Unsupported or unexpected xref token '${firstToken.raw}' at offset ${currentOffset}`, currentOffset);
      }
    }

    if (!xrefTable.getTrailer()) {
      throw new PdfXRefException('PDF document contains no valid trailer dictionary', startXRefOffset);
    }

    return xrefTable;
  }

  static #parseXRefStream(xrefStream, xrefTable) {
    const dict = xrefStream.dictionary;
    const size = dict.getNumber('Size') || 0;
    const wArray = dict.getArray('W');
    if (!wArray || wArray.size() < 3) {
      throw new PdfXRefException('Invalid or missing /W array in /XRef stream', 0);
    }

    const w0 = wArray.getNumber(0) || 0;
    const w1 = wArray.getNumber(1) || 0;
    const w2 = wArray.getNumber(2) || 0;
    const indexArray = dict.getArray('Index');
    const ranges = [];

    if (indexArray && indexArray.size() >= 2) {
      for (let i = 0; i + 1 < indexArray.size(); i += 2) {
        ranges.push([indexArray.getNumber(i), indexArray.getNumber(i + 1)]);
      }
    } else {
      ranges.push([0, size]);
    }

    // XRef streams are PDF streams and may themselves be filtered (commonly FlateDecode).
    // Decode the stream before reading the binary xref fields.
    const bytes = PdfStreamDecoder.decode(xrefStream);
    let offset = 0;
    for (const [firstObject, count] of ranges) {
      for (let i = 0; i < count; i++) {
        const objectNumber = firstObject + i;
        const type = PdfXRefTable.#readField(bytes, offset, w0);
        offset += w0;
        const field2 = PdfXRefTable.#readField(bytes, offset, w1);
        offset += w1;
        const field3 = PdfXRefTable.#readField(bytes, offset, w2);
        offset += w2;

        if (type === 0) {
          xrefTable.addEntry(new PdfXRefEntry(objectNumber, field2, field3, 'free'), true);
        } else if (type === 1) {
          xrefTable.addEntry(new PdfXRefEntry(objectNumber, field2, field3, 'in-use'), true);
        } else if (type === 2) {
          xrefTable.addEntry(new PdfXRefEntry(objectNumber, field2, field3, 'compressed'), true);
        }
      }
    }

    const trailer = new PdfTrailer(dict);
    return trailer;
  }

  static #readField(bytes, offset, width) {
    let value = 0;
    for (let i = 0; i < width; i++) {
      value = (value * 256) + (bytes[offset + i] || 0);
    }
    return value;
  }

  static #parseTraditionalXRef(reader, lexer, xrefTable) {
    const entryStartToken = lexer.nextToken();
    const countToken = lexer.nextToken();
    if (!entryStartToken || entryStartToken.type !== PdfTokenType.INTEGER || !countToken || countToken.type !== PdfTokenType.INTEGER) {
      throw new PdfXRefException('Invalid xref subsection header', reader.position());
    }

    const startObject = entryStartToken.value;
    const count = countToken.value;
    for (let i = 0; i < count; i++) {
      const offsetToken = lexer.nextToken();
      const generationToken = lexer.nextToken();
      const flagToken = lexer.nextToken();
      if (!offsetToken || !generationToken || !flagToken ||
          offsetToken.type !== PdfTokenType.INTEGER ||
          generationToken.type !== PdfTokenType.INTEGER) {
        throw new PdfXRefException('Invalid xref entry', reader.position());
      }
      const inUse = flagToken.raw === 'n';
      xrefTable.addEntry(new PdfXRefEntry(
        startObject + i,
        offsetToken.value,
        generationToken.value,
        inUse ? 'in-use' : 'free'
      ), true);
    }

    let token = lexer.nextToken();
    while (token && token.type !== PdfTokenType.DICT_START) token = lexer.nextToken();
    if (!token) throw new PdfXRefException('Missing trailer dictionary', reader.position());

    // Rewind to the dictionary start because the search loop consumed <<.
    lexer.seek(token.offset);
    const parser = new PdfParser(lexer);
    const trailerDict = parser.parseObject();
    return new PdfTrailer(trailerDict);
  }
}
