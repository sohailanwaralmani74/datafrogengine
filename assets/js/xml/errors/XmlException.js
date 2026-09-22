/**
 * Base exception for XML processing engine errors.
 */
export class XmlException extends Error {
  /**
   * @param {string} message
   * @param {number} [line=1]
   * @param {number} [column=1]
   * @param {string} [snippet='']
   */
  constructor(message, line = 1, column = 1, snippet = '') {
    const loc = `[Line ${line}, Col ${column}]`;
    super(`${loc} ${message}${snippet ? `:\n${snippet}` : ''}`);
    this.name = 'XmlException';
    this.line = line;
    this.column = column;
    this.snippet = snippet;
  }
}

export class XmlParseException extends XmlException {
  constructor(message, line = 1, column = 1, snippet = '') {
    super(message, line, column, snippet);
    this.name = 'XmlParseException';
  }
}

export class XmlValidationException extends XmlException {
  constructor(message, line = 1, column = 1, snippet = '') {
    super(message, line, column, snippet);
    this.name = 'XmlValidationException';
  }
}
