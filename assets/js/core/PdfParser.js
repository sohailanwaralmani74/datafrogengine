import { PdfLexer } from './PdfLexer.js';
import { PdfTokenType } from './PdfToken.js';
import {
  PdfObject,
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
} from '../objects/index.js';
import { PdfParseException } from '../errors/PdfParseException.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * PdfParser parses tokens from PdfLexer into strongly-typed PDF Object Model instances.
 */
export class PdfParser {
  /** @type {PdfLexer} */
  #lexer;

  /**
   * @param {PdfLexer} lexer
   */
  constructor(lexer) {
    if (!(lexer instanceof PdfLexer)) {
      throw new PdfInvalidArgumentException('lexer', lexer, 'PdfLexer instance');
    }
    this.#lexer = lexer;
  }

  /**
   * Returns underlying lexer.
   * @returns {PdfLexer}
   */
  get lexer() {
    return this.#lexer;
  }

  /**
   * Current byte position.
   * @returns {number}
   */
  position() {
    return this.#lexer.position();
  }

  /**
   * Seeks to byte position.
   * @param {number} pos
   */
  seek(pos) {
    this.#lexer.seek(pos);
  }

  /**
   * Parses and returns the next PDF object from the token stream.
   * 
   * @returns {PdfObject|null}
   * @throws {PdfParseException}
   */
  parseObject() {
    this.#lexer.skipWhitespaceAndComments();
    const token = this.#lexer.nextToken();
    if (!token) {
      return null;
    }

    return this.#parseObjectFromToken(token);
  }

  /**
   * Parses an object given its initial token.
   * @private
   */
  #parseObjectFromToken(token) {
    switch (token.type) {
      case PdfTokenType.NULL:
        return PdfNull.INSTANCE;

      case PdfTokenType.BOOLEAN:
        return PdfBoolean.of(token.value);

      case PdfTokenType.REAL:
        return PdfNumber.of(token.value, false);

      case PdfTokenType.INTEGER:
        return this.#handleIntegerOrReferenceOrIndirect(token);

      case PdfTokenType.NAME:
        return PdfName.of(token.value);

      case PdfTokenType.STRING:
        return new PdfString(token.value, token.bytes);

      case PdfTokenType.HEX_STRING:
        return new PdfHexString(token.value, token.bytes, token.raw.slice(1, -1));

      case PdfTokenType.ARRAY_START:
        return this.#parseArrayBody(token.offset);

      case PdfTokenType.DICT_START:
        return this.#parseDictionaryOrStreamBody(token.offset);

      case PdfTokenType.DICT_END:
        throw new PdfParseException("Unexpected '>>' outside dictionary", token.offset);

      case PdfTokenType.ARRAY_END:
        throw new PdfParseException("Unexpected ']' outside array", token.offset);

      case PdfTokenType.ENDOBJ:
        throw new PdfParseException("Unexpected 'endobj' without preceding 'obj'", token.offset);

      case PdfTokenType.ENDSTREAM:
        throw new PdfParseException("Unexpected 'endstream' without preceding 'stream'", token.offset);

      default:
        throw new PdfParseException(`Unexpected token '${token.raw}' (${token.type})`, token.offset);
    }
  }

  /**
   * Disambiguates an integer from an indirect reference `12 0 R` or indirect object `12 0 obj`.
   * @private
   */
  #handleIntegerOrReferenceOrIndirect(firstToken) {
    const objNum = firstToken.value;
    const initialPos = this.#lexer.position();

    const nextToken = this.#lexer.peekToken();
    if (nextToken && nextToken.type === PdfTokenType.INTEGER) {
      const savedPos = this.#lexer.position();
      this.#lexer.nextToken(); // consume second integer (genNum)
      const thirdToken = this.#lexer.peekToken();

      if (thirdToken) {
        if (thirdToken.isKeyword('R')) {
          this.#lexer.nextToken(); // consume 'R'
          return new PdfReference(objNum, nextToken.value);
        }

        if (thirdToken.type === PdfTokenType.OBJ) {
          this.#lexer.nextToken(); // consume 'obj'
          const innerObject = this.parseObject();
          if (!innerObject) {
            throw new PdfParseException('Expected object inside indirect object declaration', thirdToken.offset);
          }
          this.#consumeEndobj();
          return new PdfIndirectObject(objNum, nextToken.value, innerObject);
        }
      }

      // Neither 'R' nor 'obj' followed the second integer: rewind
      this.#lexer.seek(savedPos);
    }

    // It is just a standalone integer number
    return PdfNumber.of(objNum, true);
  }

  /**
   * Consumes the mandatory 'endobj' keyword after an indirect object definition.
   * @private
   */
  #consumeEndobj() {
    this.#lexer.skipWhitespaceAndComments();
    const token = this.#lexer.nextToken();
    if (!token || token.type !== PdfTokenType.ENDOBJ) {
      // In malformed PDFs endobj might be missing or next token is an integer/obj; handle gracefully
      if (token) {
        // Rewind if it's the start of next object
        this.#lexer.seek(token.offset);
      }
    }
  }

  /**
   * Parses the body of an array after '[' has been consumed.
   * @private
   */
  #parseArrayBody(startOffset) {
    const items = [];

    while (true) {
      this.#lexer.skipWhitespaceAndComments();
      const peek = this.#lexer.peekToken();
      if (!peek) {
        throw new PdfParseException('Unterminated array: reached EOF before finding closing \']\'', startOffset);
      }

      if (peek.type === PdfTokenType.ARRAY_END) {
        this.#lexer.nextToken(); // consume ']'
        break;
      }

      const item = this.parseObject();
      if (item === null) {
        throw new PdfParseException('Unexpected EOF inside array', this.#lexer.position());
      }
      items.push(item);
    }

    return new PdfArray(items);
  }

  /**
   * Parses array object (handles case where '[' has not yet been consumed).
   * @returns {PdfArray}
   */
  parseArray() {
    this.#lexer.skipWhitespaceAndComments();
    const token = this.#lexer.nextToken();
    if (!token || token.type !== PdfTokenType.ARRAY_START) {
      throw new PdfParseException("Expected '[' to start array", token ? token.offset : this.#lexer.position());
    }
    return this.#parseArrayBody(token.offset);
  }

  /**
   * Parses dictionary or stream after '<<' has been consumed.
   * @private
   */
  #parseDictionaryOrStreamBody(startOffset) {
    const dict = new PdfDictionary();

    while (true) {
      this.#lexer.skipWhitespaceAndComments();
      const peek = this.#lexer.peekToken();
      if (!peek) {
        throw new PdfParseException("Unterminated dictionary: reached EOF before finding closing '>>'", startOffset);
      }

      if (peek.type === PdfTokenType.DICT_END) {
        this.#lexer.nextToken(); // consume '>>'
        break;
      }

      const keyToken = this.#lexer.nextToken();
      if (keyToken.type !== PdfTokenType.NAME) {
        throw new PdfParseException(`Expected dictionary key Name, but found '${keyToken.raw}' (${keyToken.type})`, keyToken.offset);
      }

      const valueObj = this.parseObject();
      if (valueObj === null) {
        throw new PdfParseException(`Missing value for dictionary key '/${keyToken.value}'`, keyToken.offset);
      }

      dict.set(keyToken.value, valueObj);
    }

    // Check if a 'stream' keyword follows this dictionary
    this.#lexer.skipWhitespaceAndComments();
    const streamPeek = this.#lexer.peekToken();
    if (streamPeek && streamPeek.type === PdfTokenType.STREAM) {
      this.#lexer.nextToken(); // consume 'stream' keyword
      return this.#parseStreamBody(dict, streamPeek.offset);
    }

    return dict;
  }

  /**
   * Parses dictionary object directly.
   * @returns {PdfDictionary}
   */
  parseDictionary() {
    this.#lexer.skipWhitespaceAndComments();
    const token = this.#lexer.nextToken();
    if (!token || token.type !== PdfTokenType.DICT_START) {
      throw new PdfParseException("Expected '<<' to start dictionary", token ? token.offset : this.#lexer.position());
    }
    const result = this.#parseDictionaryOrStreamBody(token.offset);
    if (result instanceof PdfStream) {
      return result.dictionary;
    }
    return result;
  }

  /**
   * Reads stream bytes and expects 'endstream'.
   * @private
   */
  #parseStreamBody(dictionary, streamKeywordOffset) {
    let streamLength = -1;
    const lengthObj = dictionary.get('Length');

    if (lengthObj && lengthObj.isNumber()) {
      streamLength = lengthObj.value;
    }

    let streamBytes;
    if (streamLength >= 0) {
      streamBytes = this.#lexer.readStreamBytes(streamLength);
    } else {
      // Stream length is an indirect reference or unknown at parse time; scan for 'endstream'
      // Skip the immediate CRLF or LF after 'stream'
      const startOfData = this.#skipStreamNewlineAndGetPosition();
      const endstreamPos = this.#lexer.findEndstream();
      if (endstreamPos === -1) {
        throw new PdfParseException("Missing 'endstream' marker", streamKeywordOffset);
      }

      // Check if there is trailing \r\n or \n before endstream
      let dataEnd = endstreamPos;
      const reader = this.#lexer.reader;
      if (dataEnd > startOfData && reader.peekByte(dataEnd - startOfData - 1) === 0x0A) {
        dataEnd--;
        if (dataEnd > startOfData && reader.peekByte(dataEnd - startOfData - 1) === 0x0D) {
          dataEnd--;
        }
      }

      const byteLength = dataEnd - startOfData;
      reader.seek(startOfData);
      streamBytes = reader.readBytes(byteLength);
      reader.seek(endstreamPos);
    }

    // Consume 'endstream'
    this.#lexer.skipWhitespaceAndComments();
    const endstreamToken = this.#lexer.nextToken();
    if (!endstreamToken || endstreamToken.type !== PdfTokenType.ENDSTREAM) {
      throw new PdfParseException("Expected 'endstream' after stream data", this.#lexer.position());
    }

    return new PdfStream(dictionary, streamBytes);
  }

  /**
   * Helper to skip the single newline following 'stream' keyword and return byte position.
   * @private
   */
  #skipStreamNewlineAndGetPosition() {
    const reader = this.#lexer.reader;
    if (reader.hasRemaining()) {
      const b = reader.peekByte();
      if (b === 0x0D) { // CR
        reader.readByte();
        if (reader.hasRemaining() && reader.peekByte() === 0x0A) { // LF
          reader.readByte();
        }
      } else if (b === 0x0A) { // LF
        reader.readByte();
      }
    }
    return reader.position();
  }

  /**
   * Parses an indirect object starting at the current position.
   * @returns {PdfIndirectObject}
   */
  parseIndirectObject() {
    this.#lexer.skipWhitespaceAndComments();
    const objNumTok = this.#lexer.nextToken();
    if (!objNumTok || objNumTok.type !== PdfTokenType.INTEGER) {
      throw new PdfParseException('Expected object number integer', objNumTok ? objNumTok.offset : this.#lexer.position());
    }

    const genNumTok = this.#lexer.nextToken();
    if (!genNumTok || genNumTok.type !== PdfTokenType.INTEGER) {
      throw new PdfParseException('Expected generation number integer', genNumTok ? genNumTok.offset : this.#lexer.position());
    }

    const objKeywordTok = this.#lexer.nextToken();
    if (!objKeywordTok || objKeywordTok.type !== PdfTokenType.OBJ) {
      throw new PdfParseException("Expected 'obj' keyword", objKeywordTok ? objKeywordTok.offset : this.#lexer.position());
    }

    const value = this.parseObject();
    if (!value) {
      throw new PdfParseException('Expected object body inside indirect object', this.#lexer.position());
    }

    this.#consumeEndobj();
    return new PdfIndirectObject(objNumTok.value, genNumTok.value, value);
  }
}
