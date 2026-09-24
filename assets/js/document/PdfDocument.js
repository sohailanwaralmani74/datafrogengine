import { PdfBinaryReader } from '../core/PdfBinaryReader.js';
import { PdfLexer } from '../core/PdfLexer.js';
import { PdfParser } from '../core/PdfParser.js';
import { PdfXRefTable } from '../xref/PdfXRefTable.js';
import { PdfCatalog } from './PdfCatalog.js';
import { PdfReference } from '../objects/PdfReference.js';
import { PdfIndirectObject } from '../objects/PdfIndirectObject.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfHexString } from '../objects/PdfHexString.js';
import { PdfPage } from './PdfPage.js';
import { PdfWriter } from '../writer/PdfWriter.js';
import { PdfStructureException } from '../errors/PdfStructureException.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * High-level PDF Document representation providing structured access to pages, catalog, and metadata.
 */
export class PdfDocument {
  /** @type {PdfBinaryReader} */
  #reader;

  /** @type {PdfXRefTable} */
  #xrefTable;

  /** @type {PdfCatalog|null} */
  #catalog;

  /** @type {string} */
  #headerVersion;

  /** @type {Map<string, PdfObject>} */
  #objectCache;

  /** @type {Map<number, Map<number, PdfObject>>} */
  #objectStreamCache;

  /** @type {number} */
  #nextObjectNumber;

  /** @type {Object|null} */
  #securityHandler;

  /**
   * @param {PdfBinaryReader} reader
   * @param {PdfXRefTable} xrefTable
   * @param {string} [headerVersion='1.7']
   */
  constructor(reader, xrefTable, headerVersion = '1.7') {
    if (!(reader instanceof PdfBinaryReader)) {
      throw new PdfInvalidArgumentException('reader', reader, 'PdfBinaryReader');
    }
    if (!(xrefTable instanceof PdfXRefTable)) {
      throw new PdfInvalidArgumentException('xrefTable', xrefTable, 'PdfXRefTable');
    }
    this.#reader = reader;
    this.#xrefTable = xrefTable;
    this.#headerVersion = headerVersion;
    this.#catalog = null;
    this.#objectCache = new Map();
    this.#objectStreamCache = new Map();
    this.#nextObjectNumber = 1;
    this.#securityHandler = null;
  }

  static create({ version = '1.7' } = {}) {
    const reader = new PdfBinaryReader(new Uint8Array(0).buffer);
    const xrefTable = new PdfXRefTable();
    const doc = new PdfDocument(reader, xrefTable, version);

    const pagesDict = new PdfDictionary();
    pagesDict.set('Type', PdfName.of('Pages'));
    pagesDict.set('Kids', new PdfArray());
    pagesDict.set('Count', PdfNumber.of(0));
    const pagesRef = doc.registerObject(pagesDict);

    const catalogDict = new PdfDictionary();
    catalogDict.set('Type', PdfName.of('Catalog'));
    catalogDict.set('Pages', pagesRef);
    const catalogRef = doc.registerObject(catalogDict);

    doc.#catalog = new PdfCatalog(catalogDict, doc);
    doc.#nextObjectNumber = Math.max(pagesRef.objectNumber, catalogRef.objectNumber) + 1;
    return doc;
  }

  save() {
    return PdfWriter.write(this);
  }

  saveSync() {
    return this.save();
  }

  addPage(widthOrPage = 612, height = 792) {
    return this.insertPage(-1, widthOrPage, height);
  }
}
