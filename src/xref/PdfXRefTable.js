import { PdfBinaryReader } from '../core/PdfBinaryReader.js';
import { PdfLexer } from '../core/PdfLexer.js';
import { PdfTokenType } from '../core/PdfToken.js';
import { PdfParser } from '../core/PdfParser.js';
import { PdfXRefEntry } from './PdfXRefEntry.js';
import { PdfTrailer } from './PdfTrailer.js';
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

  /**
   * Adds an entry to the cross-reference table.
   * If an entry for this object number already exists (from a newer update), existing entry is retained unless override=true.
   * 
   * @param {PdfXRefEntry} entry
   * @param {boolean} [override=false]
   */
  addEntry(entry, override = false) {
    if (!(entry instanceof PdfXRefEntry)) {
      throw new PdfInvalidArgumentException('entry', entry, 'PdfXRefEntry instance');
    }
    if (override || !this.#entries.has(entry.objectNumber)) {
      this.#entries.set(entry.objectNumber, entry);
    }
  }

  /**
   * Retrieves cross-reference entry for object number.
   * @param {number} objectNumber
   * @returns {PdfXRefEntry|undefined}
   */
  getEntry(objectNumber) {
    return this.#entries.get(objectNumber);
  }

  /**
   * Checks if xref table contains entry for object number.
   * @param {number} objectNumber
   * @returns {boolean}
   */
  hasEntry(objectNumber) {
    return this.#entries.has(objectNumber);
  }

  /**
   * Returns the document trailer.
   * @returns {PdfTrailer|null}
   */
  getTrailer() {
    return this.#trailer;
  }

  /**
   * Sets the document trailer.
   * @param {PdfTrailer} trailer
   */
  setTrailer(trailer) {
    if (trailer !== null && !(trailer instanceof PdfTrailer)) {
      throw new PdfInvalidArgumentException('trailer', trailer, 'PdfTrailer instance');
    }
    this.#trailer = trailer;
  }

  /**
   * Returns all cross-reference entries.
   * @returns {Array<PdfXRefEntry>}
   */
  getEntries() {
    return Array.from(this.#entries.values());
  }

  /**
   * Returns all in-use cross-reference entries.
   * @returns {Array<PdfXRefEntry>}
   */
  getInUseEntries() {
    const list = [];
    for (const entry of this.#entries.values()) {
      if (entry.isInUse() || entry.isCompressed()) {
        list.push(entry);
      }
    }
    return list;
  }

  /**
   * Returns all free cross-reference entries.
   * @returns {Array<PdfXRefEntry>}
   */
  getFreeEntries() {
    const list = [];
    for (const entry of this.#entries.values()) {
      if (entry.isFree()) {
        list.push(entry);
      }
    }
    return list;
  }

  /**
   * Returns highest object number in the table.
   * @returns {number}
   */
  getHighestObjectNumber() {
    let max = 0;
    for (const objNum of this.#entries.keys()) {
      if (objNum > max) {
        max = objNum;
      }
    }
    return max;
  }

  /**
   * Returns number of entries in the table.
   * @returns {number}
   */
  size() {
    return this.#entries.size;
  }

  /**
   * Scans backwards from the end of the binary reader to locate the `startxref` keyword
   * and parse the starting xref byte offset.
   * 
   * @param {PdfBinaryReader} reader
   * @returns {number} Byte offset of the cross-reference table or stream
   * @throws {PdfXRefException} if startxref is missing or malformed
   */
  static findStartXRefOffset(reader) {
    if (!(reader instanceof PdfBinaryReader)) {
      throw new PdfInvalidArgumentException('reader', reader, 'PdfBinaryReader');
    }

    const fileLen = reader.length();
    // Scan backwards within the last 2048 bytes (or whole file if smaller)
    const scanWindow = Math.min(fileLen, 2048);
    const startScanPos = fileLen - scanWindow;

    const startXRefIdx = reader.lastIndexOf('startxref', fileLen - 1);
    if (startXRefIdx === -1 || startXRefIdx < startScanPos) {
      // Fallback: search whole file if not in last 2048 bytes
      const fullSearchIdx = reader.lastIndexOf('startxref', fileLen - 1);
      if (fullSearchIdx === -1) {
        throw new PdfXRefException('Could not locate startxref keyword in document', fileLen);
      }
      return PdfXRefTable.#readStartXRefValue(reader, fullSearchIdx);
    }

    return PdfXRefTable.#readStartXRefValue(reader, startXRefIdx);
  }

  /**
   * Reads the integer offset following `startxref`.
   * @private
   */
  static #readStartXRefValue(reader, startXRefOffset) {
    reader.seek(startXRefOffset);
    const lexer = new PdfLexer(reader);
    const token = lexer.nextToken(); // consume 'startxref'

    if (!token || token.type !== PdfTokenType.STARTXREF) {
      throw new PdfXRefException("Expected 'startxref' keyword", startXRefOffset);
    }

    const offsetToken = lexer.nextToken();
    if (!offsetToken || offsetToken.type !== PdfTokenType.INTEGER) {
      throw new PdfXRefException("Expected integer byte offset following 'startxref'", reader.position());
    }

    return offsetToken.value;
  }

  /**
   * Parses the complete cross-reference structure (including incremental updates)
   * starting from `startXRefOffset`.
   * 
   * @param {PdfBinaryReader} reader
   * @param {number} startXRefOffset
   * @returns {PdfXRefTable}
   */
  static parseFrom(reader, startXRefOffset) {
    const xrefTable = new PdfXRefTable();
    const visitedOffsets = new Set();
    let currentOffset = startXRefOffset;

    while (currentOffset !== undefined && currentOffset >= 0) {
      if (visitedOffsets.has(currentOffset)) {
        // Cyclic /Prev protection
        break;
      }
      visitedOffsets.add(currentOffset);

      reader.seek(currentOffset);
      const lexer = new PdfLexer(reader);
      const firstToken = lexer.nextToken();

      if (!firstToken) {
        throw new PdfXRefException(`Unexpected EOF at xref offset ${currentOffset}`, currentOffset);
      }

      if (firstToken.type === PdfTokenType.XREF) {
        // Traditional ASCII xref table
        const sectionTrailer = PdfXRefTable.#parseTraditionalXRef(reader, lexer, xrefTable);
        if (!xrefTable.getTrailer()) {
          xrefTable.setTrailer(sectionTrailer);
        } else {
          xrefTable.getTrailer().mergeWith(sectionTrailer);
        }

        currentOffset = sectionTrailer.getPrevOffset();
      } else if (firstToken.type === PdfTokenType.INTEGER || firstToken.type === PdfTokenType.DICT_START) {
        // XRef Stream (PDF 1.5+)
        lexer.seek(currentOffset);
        const parser = new PdfParser(lexer);
        const parsedObj = parser.parseObject();
        const xrefStream = parsedObj instanceof PdfIndirectObject ? parsedObj.value : parsedObj;

        if (!(xrefStream instanceof PdfStream) || xrefStream.getName('Type') !== 'XRef') {
          throw new PdfXRefException(`Expected /Type /XRef stream at offset ${currentOffset}`, currentOffset);
        }

        const sectionTrailer = PdfXRefTable.#parseXRefStream(xrefStream, xrefTable);
        if (!xrefTable.getTrailer()) {
          xrefTable.setTrailer(sectionTrailer);
        } else {
          xrefTable.getTrailer().mergeWith(sectionTrailer);
        }

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

  /**
   * Parses binary /Type /XRef stream.
   * @private
   */
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
    const entryByteLen = w0 + w1 + w2;

    const indexArray = dict.getArray('Index');
    const subsections = [];
    if (indexArray && indexArray.size() >= 2) {
      for (let i = 0; i < indexArray.size(); i += 2) {
        subsections.push({
          start: indexArray.getNumber(i) || 0,
          count: indexArray.getNumber(i + 1) || 0
        });
      }
    } else {
      subsections.push({ start: 0, count: size });
    }

    const bytes = xrefStream.bytes;
    let bytePtr = 0;

    for (const sub of subsections) {
      for (let i = 0; i < sub.count; i++) {
        const objNum = sub.start + i;
        if (bytePtr + entryByteLen > bytes.length) {
          break;
        }

        let f0 = 1; // Default type is 1 if w0 == 0
        if (w0 > 0) {
          f0 = 0;
          for (let b = 0; b < w0; b++) {
            f0 = (f0 << 8) | bytes[bytePtr++];
          }
        }

        let f1 = 0;
        for (let b = 0; b < w1; b++) {
          f1 = (f1 << 8) | bytes[bytePtr++];
        }

        let f2 = 0;
        for (let b = 0; b < w2; b++) {
          f2 = (f2 << 8) | bytes[bytePtr++];
        }

        if (f0 === 0) {
          // Free object
          xrefTable.addEntry(PdfXRefEntry.createFree(objNum, f1, f2));
        } else if (f0 === 1) {
          // In-use uncompressed object
          xrefTable.addEntry(PdfXRefEntry.createInUse(objNum, f1, f2));
        } else if (f0 === 2) {
          // Compressed object in Object Stream
          xrefTable.addEntry(PdfXRefEntry.createCompressed(objNum, f1, f2));
        }
      }
    }

    return new PdfTrailer(dict);
  }

  /**
   * Parses a traditional ASCII `xref` table and its trailer.
   * @private
   */
  static #parseTraditionalXRef(reader, lexer, xrefTable) {
    while (true) {
      lexer.skipWhitespaceAndComments();
      const peek = lexer.peekToken();
      if (!peek) {
        throw new PdfXRefException('Unexpected EOF while parsing xref table', reader.position());
      }

      if (peek.type === PdfTokenType.TRAILER) {
        lexer.nextToken(); // consume 'trailer'
        break;
      }

      // Parse subsection header: <startObjNum> <count>
      const startObjTok = lexer.nextToken();
      if (!startObjTok || startObjTok.type !== PdfTokenType.INTEGER) {
        throw new PdfXRefException(`Expected subsection start object number, found '${startObjTok ? startObjTok.raw : 'EOF'}'`, reader.position());
      }

      const countTok = lexer.nextToken();
      if (!countTok || countTok.type !== PdfTokenType.INTEGER) {
        throw new PdfXRefException(`Expected subsection entry count, found '${countTok ? countTok.raw : 'EOF'}'`, reader.position());
      }

      const startObjNum = startObjTok.value;
      const count = countTok.value;

      // Parse entries
      for (let i = 0; i < count; i++) {
        const offsetTok = lexer.nextToken();
        const genTok = lexer.nextToken();
        const flagTok = lexer.nextToken();

        if (!offsetTok || !genTok || !flagTok) {
          throw new PdfXRefException(`Incomplete xref entry in subsection ${startObjNum} ${count} at index ${i}`, reader.position());
        }

        const objNum = startObjNum + i;
        const offset = offsetTok.value;
        const gen = genTok.value;
        const flag = flagTok.value;

        if (flag === 'n') {
          xrefTable.addEntry(PdfXRefEntry.createInUse(objNum, offset, gen));
        } else if (flag === 'f') {
          xrefTable.addEntry(PdfXRefEntry.createFree(objNum, offset, gen));
        } else {
          throw new PdfXRefException(`Invalid xref entry flag '${flag}' (expected 'n' or 'f')`, flagTok.offset);
        }
      }
    }

    // Parse Trailer Dictionary
    const parser = new PdfParser(lexer);
    const trailerDict = parser.parseDictionary();
    return new PdfTrailer(trailerDict);
  }
}
