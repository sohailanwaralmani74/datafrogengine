import { XmlNodeType } from '../model/XmlNodeType.js';
import { XmlText } from '../model/XmlText.js';
import { XmlNode } from '../model/XmlNode.js';

/**
 * Serializes XML Document Object Model trees into formatted XML text.
 */
export class XmlSerializer {
  /**
   * Serializes node tree to XML string.
   * @param {XmlNode} node
   * @param {object} [options]
   * @param {number|string} [options.indent=0] - Number of spaces or indent string
   * @param {boolean} [options.declaration=true] - Include <?xml ...?> if present
   * @param {boolean} [options.selfCloseEmpty=true] - Output <elem/> for empty elements
   * @param {string} [options.newline='\n']
   * @returns {string}
   */
  static serializeToString(node, options = {}) {
    const serializer = new XmlSerializer(options);
    return serializer.serialize(node);
  }

  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    this.options = {
      indent: 0,
      declaration: true,
      selfCloseEmpty: true,
      newline: '\n',
      ...options
    };

    if (typeof this.options.indent === 'number') {
      this.indentStr = ' '.repeat(this.options.indent);
    } else if (typeof this.options.indent === 'string') {
      this.indentStr = this.options.indent;
    } else {
      this.indentStr = '';
    }
    this.isPretty = this.indentStr.length > 0;
  }

  /**
   * @param {XmlNode} node
   * @returns {string}
   */
  serialize(node) {
    if (!node) return '';
    return this.serializeNode(node, 0);
  }

  serializeNode(node, depth) {
    switch (node.nodeType) {
      case XmlNodeType.DOCUMENT:
        return this.serializeDocument(node, depth);

      case XmlNodeType.ELEMENT:
        return this.serializeElement(node, depth);

      case XmlNodeType.TEXT:
        return XmlText.escapeXml(node.nodeValue || '');

      case XmlNodeType.CDATA:
        return `<![CDATA[${node.nodeValue || ''}]]>`;

      case XmlNodeType.COMMENT:
        return `<!--${node.nodeValue || ''}-->`;

      case XmlNodeType.PROCESSING_INSTRUCTION:
        return `<?${node.target}${node.nodeValue ? ' ' + node.nodeValue : ''}?>`;

      case XmlNodeType.DECLARATION:
        return this.serializeDeclaration(node);

      case XmlNodeType.DOCUMENT_TYPE:
        return this.serializeDoctype(node);

      default:
        return '';
    }
  }

  serializeDocument(doc, depth) {
    const parts = [];

    if (this.options.declaration && doc.declaration) {
      parts.push(this.serializeDeclaration(doc.declaration));
    }

    if (doc.doctype) {
      parts.push(this.serializeDoctype(doc.doctype));
    }

    for (const child of doc.childNodes) {
      const serialized = this.serializeNode(child, depth);
      if (serialized) {
        parts.push(serialized);
      }
    }

    return parts.join(this.isPretty ? this.options.newline : '');
  }

  serializeDeclaration(decl) {
    let out = `<?xml version="${decl.version || '1.0'}"`;
    if (decl.encoding) {
      out += ` encoding="${decl.encoding}"`;
    }
    if (decl.standalone !== null && decl.standalone !== undefined) {
      const val = typeof decl.standalone === 'boolean' ? (decl.standalone ? 'yes' : 'no') : decl.standalone;
      out += ` standalone="${val}"`;
    }
    out += '?>';
    return out;
  }

  serializeDoctype(doctype) {
    return `<!DOCTYPE ${doctype.name || doctype.nodeName}>`;
  }

  serializeElement(elem, depth) {
    const pad = this.isPretty ? this.indentStr.repeat(depth) : '';
    const newline = this.isPretty ? this.options.newline : '';

    let out = `${pad}<${elem.tagName}`;

    // Attributes
    for (const [name, val] of elem._attributes.entries()) {
      out += ` ${name}="${XmlText.escapeXml(val)}"`;
    }

    // Children check
    const children = elem.childNodes;
    if (children.length === 0) {
      if (this.options.selfCloseEmpty) {
        return out + '/>';
      }
      return `${out}></${elem.tagName}>`;
    }

    // Single text child optimization
    if (children.length === 1 && children[0].nodeType === XmlNodeType.TEXT) {
      return `${out}>${this.serializeNode(children[0], depth)}</${elem.tagName}>`;
    }

    // Mixed or element children
    out += `>${newline}`;
    for (const child of children) {
      const childStr = this.serializeNode(child, depth + 1);
      if (childStr) {
        out += `${childStr}${newline}`;
      }
    }
    out += `${pad}</${elem.tagName}>`;

    return out;
  }
}

// Attach serializer to base XmlNode
XmlNode._serializer = { XmlSerializer };
