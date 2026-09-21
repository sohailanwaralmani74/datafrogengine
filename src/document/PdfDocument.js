import { PdfBinaryReader } from '../core/PdfBinaryReader.js';
import { PdfLexer } from '../core/PdfLexer.js';
import { PdfParser } from '../core/PdfParser.js';
import { PdfXRefTable } from '../xref/PdfXRefTable.js';
import { PdfCatalog } from './PdfCatalog.js';
import { pageExtractionHelper } from './PdfPage.js';
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


  /**
   * Creates a blank new PDF document in memory.
   * 
   * @param {Object} [options={}]
   * @param {string} [options.version='1.7']
   * @returns {PdfDocument}
   */
  static create({ version = '1.7' } = {}) {
    const reader = new PdfBinaryReader(new Uint8Array(0).buffer);
    const xrefTable = new PdfXRefTable(reader);
    const doc = new PdfDocument(reader, xrefTable, version);

    const pagesDict = new PdfDictionary();
    pagesDict.set('Type', PdfName.of('Pages'));
    pagesDict.set('Kids', new PdfArray());
    pagesDict.set('Count', PdfNumber.of(0));
    const pagesRef = doc.registerObject(pagesDict);

    const catalogDict = new PdfDictionary();
    catalogDict.set('Type', PdfName.of('Catalog'));
    catalogDict.set('Pages', pagesRef);
    doc.registerObject(catalogDict);

    doc.#catalog = new PdfCatalog(catalogDict, doc);
    return doc;
  }

  /**
   * Registers an in-memory indirect object and returns its assigned reference.
   * 
   * @param {Object} obj
   * @returns {PdfReference}
   */
  registerObject(obj) {
    while (this.#objectCache.has(`${this.#nextObjectNumber}:0`) || (this.#xrefTable && this.#xrefTable.hasEntry(this.#nextObjectNumber))) {
      this.#nextObjectNumber++;
    }
    const num = this.#nextObjectNumber++;
    this.#objectCache.set(`${num}:0`, obj);
    return PdfReference.of(num, 0);
  }

  /**
   * Registers or updates an indirect object under a specific PdfReference.
   * 
   * @param {PdfReference} ref
   * @param {Object} obj
   */
  registerObjectWithRef(ref, obj) {
    this.#objectCache.set(`${ref.objectNumber}:${ref.generationNumber}`, obj);
  }

  /**
   * Opens and parses a PDF document from an ArrayBuffer, Uint8Array, or DataView.
   * 
   * @param {ArrayBuffer|Uint8Array|DataView|PdfBinaryReader} source
   * @returns {Promise<PdfDocument>}
   */
  static async open(source) {
    const reader = source instanceof PdfBinaryReader ? source : PdfBinaryReader.from(source);
    
    // Read PDF header version (e.g. %PDF-1.7)
    let headerVersion = '1.7';
    reader.seek(0);
    const headerLine = reader.readAscii(Math.min(reader.length(), 20));
    const versionMatch = headerLine.match(/%PDF-(\d+\.\d+)/);
    if (versionMatch) {
      headerVersion = versionMatch[1];
    }

    // Locate startxref and parse XRef table
    const startXRefOffset = PdfXRefTable.findStartXRefOffset(reader);
    const xrefTable = PdfXRefTable.parseFrom(reader, startXRefOffset);

    return new PdfDocument(reader, xrefTable, headerVersion);
  }

  /**
   * Synchronous open helper for synchronous environments.
   * 
   * @param {ArrayBuffer|Uint8Array|DataView|PdfBinaryReader} source
   * @returns {PdfDocument}
   */
  static openSync(source) {
    const reader = source instanceof PdfBinaryReader ? source : PdfBinaryReader.from(source);
    
    let headerVersion = '1.7';
    reader.seek(0);
    const headerLine = reader.readAscii(Math.min(reader.length(), 20));
    const versionMatch = headerLine.match(/%PDF-(\d+\.\d+)/);
    if (versionMatch) {
      headerVersion = versionMatch[1];
    }

    const startXRefOffset = PdfXRefTable.findStartXRefOffset(reader);
    const xrefTable = PdfXRefTable.parseFrom(reader, startXRefOffset);

    return new PdfDocument(reader, xrefTable, headerVersion);
  }

  /**
   * Returns the PDF specification version (e.g., '1.4', '1.7').
   * If Catalog contains a /Version override, it takes precedence.
   * 
   * @returns {string}
   */
  getPdfVersion() {
    const catalog = this.getCatalog();
    const catalogVer = catalog ? catalog.getVersion() : null;
    return catalogVer || this.#headerVersion;
  }

  /**
   * Returns the Document Catalog.
   * @returns {PdfCatalog}
   */
  getCatalog() {
    if (this.#catalog === null) {
      const trailer = this.#xrefTable.getTrailer();
      if (!trailer) {
        throw new PdfStructureException('PDF document has no trailer');
      }

      const rootRef = trailer.getRoot();
      if (!rootRef) {
        throw new PdfStructureException('Trailer has no /Root catalog reference');
      }

      const catalogDict = this.resolve(rootRef);
      if (!catalogDict || !catalogDict.isDictionary()) {
        throw new PdfStructureException('Resolved /Root catalog object is not a dictionary');
      }

      this.#catalog = new PdfCatalog(catalogDict, this);
    }
    return this.#catalog;
  }

  /**
   * Returns the document Cross-Reference table.
   * @returns {PdfXRefTable}
   */
  getXRefTable() {
    return this.#xrefTable;
  }

  /**
   * Returns the underlying binary reader.
   * @returns {PdfBinaryReader}
   */
  getReader() {
    return this.#reader;
  }

  /**
   * Resolves a reference or direct object to its concrete underlying PdfObject.
   * 
   * @param {PdfObject|*} objectOrRef
   * @returns {PdfObject|*}
   */
  resolve(objectOrRef) {
    if (objectOrRef instanceof PdfReference) {
      return this.resolveObject(objectOrRef.objectNumber, objectOrRef.generationNumber);
    }
    if (objectOrRef instanceof PdfIndirectObject) {
      return objectOrRef.value;
    }
    return objectOrRef;
  }

  /**
   * Loads and resolves an indirect object by objectNumber and generationNumber.
   * 
   * @param {number} objectNumber
   * @param {number} [generationNumber=0]
   * @returns {PdfObject|null}
   */
  resolveObject(objectNumber, generationNumber = 0) {
    const cacheKey = `${objectNumber}:${generationNumber}`;
    if (this.#objectCache.has(cacheKey)) {
      return this.#objectCache.get(cacheKey);
    }

    const entry = this.#xrefTable.getEntry(objectNumber);
    if (!entry || entry.isFree()) {
      return null;
    }

    if (entry.isInUse()) {
      // Direct uncompressed object at file offset
      this.#reader.seek(entry.offset);
      const parser = new PdfParser(new PdfLexer(this.#reader));
      const indObj = parser.parseObject();

      let resolvedValue;
      if (indObj instanceof PdfIndirectObject) {
        resolvedValue = indObj.value;
      } else {
        resolvedValue = indObj;
      }

      // Check if document is encrypted and object should be decrypted
      const trailer = this.#xrefTable ? this.#xrefTable.getTrailer() : null;
      const encryptRef = trailer ? trailer.dictionary.get('Encrypt') : null;
      const isEncryptDict = encryptRef && encryptRef.isReference && encryptRef.isReference() && encryptRef.objectNumber === objectNumber;

      if (!isEncryptDict && this.isEncrypted && this.securityHandler && this.securityHandler.isAuthenticated) {
        resolvedValue = this.#decryptObject(resolvedValue, objectNumber, generationNumber);
      }

      this.#objectCache.set(cacheKey, resolvedValue);
      return resolvedValue;
    }


    if (entry.isCompressed()) {
      // Compressed object inside an Object Stream (/ObjStm)
      return this.#resolveCompressedObject(entry.streamObjectNumber, entry.indexInStream, objectNumber);
    }

    return null;
  }

  /**
   * Resolves an object from an Object Stream (/ObjStm).
   * @private
   */
  #resolveCompressedObject(streamObjNum, indexInStream, targetObjNum) {
    let streamObjs = this.#objectStreamCache.get(streamObjNum);
    if (!streamObjs) {
      streamObjs = this.#loadObjectStream(streamObjNum);
      this.#objectStreamCache.set(streamObjNum, streamObjs);
    }
    return streamObjs.get(targetObjNum) || null;
  }

  /**
   * Loads and unpacks an Object Stream (/ObjStm).
   * @private
   */
  #loadObjectStream(streamObjNum) {
    const streamObj = this.resolveObject(streamObjNum, 0);
    if (!(streamObj instanceof PdfStream)) {
      throw new PdfStructureException(`Expected Object Stream at object ${streamObjNum}`);
    }

    const dict = streamObj.dictionary;
    const n = dict.getNumber('N') || 0;
    const first = dict.getNumber('First') || 0;

    const streamBytes = streamObj.bytes;
    const streamReader = new PdfBinaryReader(streamBytes.buffer, streamBytes.byteOffset, streamBytes.byteLength);
    const lexer = new PdfLexer(streamReader);

    // Read header table: N pairs of (objNum, byteOffsetRelativeToFirst)
    const headers = [];
    for (let i = 0; i < n; i++) {
      const objNumTok = lexer.nextToken();
      const offsetTok = lexer.nextToken();
      if (!objNumTok || !offsetTok) {
        break;
      }
      headers.push({
        objNum: objNumTok.value,
        offset: offsetTok.value
      });
    }

    // Parse each stored object
    const map = new Map();
    for (let i = 0; i < headers.length; i++) {
      const { objNum, offset } = headers[i];
      streamReader.seek(first + offset);
      const parser = new PdfParser(lexer);
      const obj = parser.parseObject();
      if (obj) {
        map.set(objNum, obj);
        this.#objectCache.set(`${objNum}:0`, obj);
      }
    }

    return map;
  }

  /**
   * Returns total number of pages.
   * @returns {number}
   */
  getPageCount() {
    return this.getCatalog().getPageCount();
  }

  /**
   * Getter for total number of pages.
   * @returns {number}
   */
  get pageCount() {
    return this.getPageCount();
  }


  /**
   * Retrieves page at 0-indexed position.
   * @param {number} index
   * @returns {PdfPage}
   */
  getPage(index) {
    return this.getCatalog().getPage(index);
  }

  /**
   * Returns page visual dimensions `{ width, height }` at index.
   * @param {number} index
   * @returns {{ width: number, height: number }}
   */
  getPageSize(index) {
    return this.getPage(index).getSize();
  }

  /**
   * Returns page rotation in degrees (0, 90, 180, 270) at index.
   * @param {number} index
   * @returns {number}
   */
  getPageRotation(index) {
    return this.getPage(index).getRotation();
  }

  /**
   * Extracts standard document metadata from /Info and /Metadata.
   * 
   * @returns {{
   *   title: string|null,
   *   author: string|null,
   *   subject: string|null,
   *   keywords: string|null,
   *   creator: string|null,
   *   producer: string|null,
   *   creationDate: string|null,
   *   modDate: string|null
   * }}
   */
  getMetadata() {
    const meta = {
      title: null,
      author: null,
      subject: null,
      keywords: null,
      creator: null,
      producer: null,
      creationDate: null,
      modDate: null
    };

    const trailer = this.#xrefTable.getTrailer();
    if (!trailer) {
      return meta;
    }

    const infoRef = trailer.getInfo();
    if (infoRef) {
      const infoDict = this.resolve(infoRef);
      if (infoDict && infoDict.isDictionary()) {
        meta.title = infoDict.getString('Title') || null;
        meta.author = infoDict.getString('Author') || null;
        meta.subject = infoDict.getString('Subject') || null;
        meta.keywords = infoDict.getString('Keywords') || null;
        meta.creator = infoDict.getString('Creator') || null;
        meta.producer = infoDict.getString('Producer') || null;
        meta.creationDate = infoDict.getString('CreationDate') || null;
        meta.modDate = infoDict.getString('ModDate') || null;
      }
    }

    return meta;
  }

  /**
   * Extracts clean formatted plain text from the entire document or a specific page.
   * 
   * @param {number} [pageIndex]
   * @returns {string}
   */
  extractText(pageIndex = undefined) {
    if (pageIndex !== undefined) {
      return this.getPage(pageIndex).extractText();
    }
    const { PdfTextExtractor } = pageExtractionHelper;
    return PdfTextExtractor.extractAllText(this);
  }

  /**
   * Extracts detailed text items with coordinates and metadata from a specific page.
   * 
   * @param {number} pageIndex
   * @returns {Array<Object>}
   */
  extractTextItems(pageIndex) {
    return this.getPage(pageIndex).extractTextItems();
  }

  /**
   * Extracts images from the entire document or a specific page.
   * 
   * @param {number} [pageIndex]
   * @returns {Array<Object>}
   */
  extractImages(pageIndex = undefined) {
    if (pageIndex !== undefined) {
      return this.getPage(pageIndex).extractImages();
    }
    const { PdfImageExtractor } = pageExtractionHelper;
    return PdfImageExtractor.extractAllImages(this);
  }

  /**
   * Renders a specific page to an HTML5 Canvas context.
   * 
   * @param {number} pageIndex
   * @param {HTMLCanvasElement|CanvasRenderingContext2D|Object} canvasOrContext
   * @param {Object} [options={}]
   * @returns {Object}
   */
  renderToCanvas(pageIndex, canvasOrContext, options = {}) {
    return this.getPage(pageIndex).renderToCanvas(canvasOrContext, options);
  }

  /**
   * Renders a specific page to a scalable SVG XML string.
   * 
   * @param {number} pageIndex
   * @param {Object} [options={}]
   * @returns {string}
   */
  renderToSvg(pageIndex, options = {}) {
    return this.getPage(pageIndex).renderToSvg(options);
  }

  /**
   * Returns viewport for a specific page.
   * 
   * @param {number} pageIndex
   * @param {Object} [options={}]
   * @returns {Object}
   */
  getViewport(pageIndex, options = {}) {
    return this.getPage(pageIndex).getViewport(options);
  }

  /**
   * Serializes the document into a compliant PDF binary buffer.
   * 
   * @returns {Uint8Array}
   */
  save() {
    const { PdfWriter } = pageExtractionHelper;
    return PdfWriter.write(this);
  }

  /**
   * Synchronous alias for save().
   * @returns {Uint8Array}
   */
  saveSync() {
    return this.save();
  }

  /**
   * Appends a blank page or existing page to the document.
   * 
   * @param {number|PdfPage} [widthOrPage=612]
   * @param {number} [height=792]
   * @returns {PdfPage}
   */
  addPage(widthOrPage = 612, height = 792) {
    return this.insertPage(-1, widthOrPage, height);
  }

  /**
   * Inserts a blank page or existing page at specified index.
   * 
   * @param {number} index
   * @param {number|PdfPage} [widthOrPage=612]
   * @param {number} [height=792]
   * @returns {PdfPage}
   */
  insertPage(index, widthOrPage = 612, height = 792) {
    if (widthOrPage instanceof PdfPage) {
      const { PdfPageOperations } = pageExtractionHelper;
      PdfPageOperations.copyPages(widthOrPage.document, [widthOrPage.pageIndex], this, index);
      const targetIdx = (index < 0 || index >= this.getPageCount()) ? this.getPageCount() - 1 : index;
      return this.getPage(targetIdx);
    }

    const width = typeof widthOrPage === 'number' ? widthOrPage : 612;
    const h = typeof height === 'number' ? height : 792;

    const pageDict = new PdfDictionary();
    pageDict.set('Type', PdfName.of('Page'));
    pageDict.set('MediaBox', new PdfArray([
      PdfNumber.of(0), PdfNumber.of(0), PdfNumber.of(width), PdfNumber.of(h)
    ]));
    pageDict.set('Resources', new PdfDictionary());

    this.registerObject(pageDict);
    return this.getCatalog().getPageTree().insertPage(index, pageDict);
  }

  /**
   * Removes page at index.
   * 
   * @param {number} index
   * @returns {PdfPage}
   */
  removePage(index) {
    return this.getCatalog().getPageTree().removePage(index);
  }

  /**
   * Moves a page from one index to another.
   * 
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  movePage(fromIndex, toIndex) {
    this.getCatalog().getPageTree().movePage(fromIndex, toIndex);
  }

  /**
   * Sets or updates rotation for a page.
   * 
   * @param {number} index
   * @param {number} degrees
   * @param {boolean} [relative=false]
   * @returns {number}
   */
  rotatePage(index, degrees, relative = false) {
    return this.getCatalog().getPageTree().rotatePage(index, degrees, relative);
  }

  /**
   * Extracts a subset of pages into a new standalone PdfDocument.
   * 
   * @param {Array<number>} pageIndices
   * @returns {PdfDocument}
   */
  extractPages(pageIndices) {
    const { PdfPageOperations } = pageExtractionHelper;
    return PdfPageOperations.extractPages(this, pageIndices);
  }

  /**
   * Splits this document into an array of single-page PdfDocuments.
   * 
   * @returns {Array<PdfDocument>}
   */
  split() {
    const { PdfPageOperations } = pageExtractionHelper;
    return PdfPageOperations.split(this);
  }

  /**
   * Splits this document at specified page boundary indices.
   * 
   * @param {Array<number>} splitIndices
   * @returns {Array<PdfDocument>}
   */
  splitAt(splitIndices) {
    const { PdfPageOperations } = pageExtractionHelper;
    return PdfPageOperations.splitAt(this, splitIndices);
  }

  /**
   * Merges multiple PDF documents into a single document.
   * 
   * @param {Array<PdfDocument>} documents
   * @returns {PdfDocument}
   */
  static merge(documents) {
    const { PdfPageOperations } = pageExtractionHelper;
    return PdfPageOperations.merge(documents);
  }

  /**
   * Adds watermark text to all pages in this document.
   * 
   * @param {string} text
   * @param {Object} [options={}]
   * @returns {PdfDocument}
   */
  addWatermark(text, options = {}) {
    const { PdfDocumentModifier } = pageExtractionHelper;
    PdfDocumentModifier.addWatermark(this, text, options);
    return this;
  }

  /**
   * Adds page numbers to all pages in this document.
   * 
   * @param {Object} [options={}]
   * @returns {PdfDocument}
   */
  addPageNumbers(options = {}) {
    const { PdfDocumentModifier } = pageExtractionHelper;
    PdfDocumentModifier.addPageNumbers(this, options);
    return this;
  }

  /**
   * Checks whether this document contains an interactive AcroForm.
   * @returns {boolean}
   */
  hasForm() {
    const catalog = this.getCatalog();
    return Boolean(catalog && catalog.dictionary.get('AcroForm'));
  }

  /**
   * Retrieves or initializes the document interactive AcroForm manager.
   * @returns {Object} PdfAcroForm
   */
  getForm() {
    const { PdfAcroForm } = pageExtractionHelper;
    const catalog = this.getCatalog();
    let acroFormObj = this.resolve(catalog.dictionary.get('AcroForm'));

    if (!acroFormObj || !acroFormObj.isDictionary || !acroFormObj.isDictionary()) {
      acroFormObj = new PdfDictionary();
      const acroRef = this.registerObject(acroFormObj);
      catalog.dictionary.set('AcroForm', acroRef);
    }

    return new PdfAcroForm(acroFormObj, this);
  }

  /**
   * Checks whether this document is encrypted.

   * @returns {boolean}
   */
  get isEncrypted() {
    if (this.#securityHandler) return true;
    const trailer = this.#xrefTable ? this.#xrefTable.getTrailer() : null;
    return Boolean(trailer && trailer.dictionary.get('Encrypt'));
  }

  /**
   * Retrieves or initializes the security handler for this document.
   * @returns {Object|null}
   */
  getSecurityHandler() {
    if (!this.#securityHandler) {
      const trailer = this.#xrefTable ? this.#xrefTable.getTrailer() : null;
      if (trailer && trailer.dictionary.get('Encrypt')) {
        let encDict = trailer.dictionary.get('Encrypt');
        encDict = this.resolve(encDict);
        let fileId = null;
        const idArr = trailer.getId();
        if (idArr && idArr.isArray() && idArr.size() > 0) {
          const firstId = idArr.get(0);
          if (firstId && firstId.isString) {
            fileId = firstId.bytes;
          }
        }
        const { PdfSecurityHandler } = pageExtractionHelper;
        if (PdfSecurityHandler) {
          this.#securityHandler = PdfSecurityHandler.fromDictionary(encDict, fileId);
        }
      }
    }
    return this.#securityHandler;
  }

  get securityHandler() {
    return this.getSecurityHandler();
  }

  /**
   * Authenticates using a user or owner password.
   * 
   * @param {string} password
   * @returns {boolean}
   */
  authenticate(password = '') {
    const handler = this.getSecurityHandler();
    if (!handler) {
      return true;
    }
    const success = handler.authenticate(password);
    if (success) {
      // Clear object caches so objects are re-resolved and decrypted
      this.#objectCache.clear();
      this.#objectStreamCache.clear();
    }
    return success;
  }

  /**
   * Configures document encryption.
   * 
   * @param {Object} options
   * @returns {PdfDocument}
   */
  encrypt(options = {}) {
    const { PdfSecurityHandler } = pageExtractionHelper;
    this.#securityHandler = PdfSecurityHandler.createEncryptionHandler(options);
    return this;
  }

  /**
   * Recursively decrypts objects.
   * @private
   */
  #decryptObject(obj, objNum, genNum) {
    if (!this.#securityHandler || !this.#securityHandler.isAuthenticated) return obj;
    if (obj instanceof PdfStream || (obj && obj.isStream && obj.isStream())) {
      const decryptedBytes = this.#securityHandler.decrypt(obj.bytes, objNum, genNum);
      obj.setBytes(decryptedBytes);
    } else if (obj instanceof PdfHexString || (obj && obj.isHexString && obj.isHexString())) {
      // Encrypted strings are saved as hex strings — decrypt the raw bytes
      const decryptedBytes = this.#securityHandler.decrypt(obj.bytes, objNum, genNum);
      return PdfString.of(new TextDecoder('latin1').decode(decryptedBytes));
    } else if (obj instanceof PdfString || (obj && obj.isString && obj.isString())) {
      const decryptedBytes = this.#securityHandler.decrypt(obj.bytes, objNum, genNum);
      return PdfString.of(new TextDecoder('latin1').decode(decryptedBytes));
    } else if (obj instanceof PdfDictionary || (obj && obj.isDictionary && obj.isDictionary())) {
      for (const [k, v] of obj.entries()) {
        obj.set(k, this.#decryptObject(v, objNum, genNum));
      }
    } else if (obj instanceof PdfArray || (obj && obj.isArray && obj.isArray())) {
      const arr = obj.elements || obj.getItems();
      for (let i = 0; i < arr.length; i++) {
        arr[i] = this.#decryptObject(arr[i], objNum, genNum);
      }
    }
    return obj;
  }
}


