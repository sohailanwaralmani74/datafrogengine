import { XmlNode } from './XmlNode.js';
import { XmlNodeType } from './XmlNodeType.js';

/**
 * Represents a CDATA section: <![CDATA[ ... ]]>
 */
export class XmlCData extends XmlNode {
  /**
   * @param {string} [data='']
   */
  constructor(data = '') {
    super(XmlNodeType.CDATA, '#cdata-section', String(data));
  }

  get data() {
    return this.nodeValue || '';
  }

  set data(val) {
    this.nodeValue = String(val);
  }

  cloneNode(deep = true) {
    return new XmlCData(this.nodeValue || '');
  }
}

/**
 * Represents an XML comment: <!-- ... -->
 */
export class XmlComment extends XmlNode {
  /**
   * @param {string} [data='']
   */
  constructor(data = '') {
    super(XmlNodeType.COMMENT, '#comment', String(data));
  }

  get data() {
    return this.nodeValue || '';
  }

  set data(val) {
    this.nodeValue = String(val);
  }

  cloneNode(deep = true) {
    return new XmlComment(this.nodeValue || '');
  }
}

/**
 * Represents a Processing Instruction: <?target data?>
 */
export class XmlProcessingInstruction extends XmlNode {
  /**
   * @param {string} target
   * @param {string} [data='']
   */
  constructor(target, data = '') {
    super(XmlNodeType.PROCESSING_INSTRUCTION, target, String(data));
    this.target = target;
  }

  get data() {
    return this.nodeValue || '';
  }

  set data(val) {
    this.nodeValue = String(val);
  }

  cloneNode(deep = true) {
    return new XmlProcessingInstruction(this.target, this.nodeValue || '');
  }
}

/**
 * Represents an XML Declaration: <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
 */
export class XmlDeclaration extends XmlNode {
  /**
   * @param {object} [options]
   * @param {string} [options.version='1.0']
   * @param {string} [options.encoding='UTF-8']
   * @param {string|boolean|null} [options.standalone=null]
   */
  constructor({ version = '1.0', encoding = 'UTF-8', standalone = null } = {}) {
    super(XmlNodeType.DECLARATION, '#xml-declaration', null);
    this.version = version;
    this.encoding = encoding;
    this.standalone = standalone;
  }

  cloneNode(deep = true) {
    return new XmlDeclaration({
      version: this.version,
      encoding: this.encoding,
      standalone: this.standalone
    });
  }
}

/**
 * Represents a Document Type Declaration: <!DOCTYPE root SYSTEM "..." [ ... ]>
 */
export class XmlDoctype extends XmlNode {
  /**
   * @param {string} name
   * @param {string|null} [publicId=null]
   * @param {string|null} [systemId=null]
   * @param {string|null} [internalSubset=null]
   */
  constructor(name, publicId = null, systemId = null, internalSubset = null) {
    super(XmlNodeType.DOCUMENT_TYPE, name, null);
    this.name = name;
    this.publicId = publicId;
    this.systemId = systemId;
    this.internalSubset = internalSubset;
  }

  cloneNode(deep = true) {
    return new XmlDoctype(this.name, this.publicId, this.systemId, this.internalSubset);
  }
}
