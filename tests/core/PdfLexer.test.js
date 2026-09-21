import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfBinaryReader } from '../../src/core/PdfBinaryReader.js';
import { PdfLexer } from '../../src/core/PdfLexer.js';
import { PdfTokenType } from '../../src/core/PdfToken.js';
import { PdfLexerException } from '../../src/errors/index.js';

function createLexer(inputString) {
  const bytes = new TextEncoder().encode(inputString);
  const reader = new PdfBinaryReader(bytes.buffer);
  return new PdfLexer(reader);
}

describe('PdfLexer', () => {
  describe('Numbers', () => {
    it('should tokenize integers', () => {
      const lexer = createLexer('0 42 -17 +999 1000000');
      
      const t1 = lexer.nextToken();
      assert.equal(t1.type, PdfTokenType.INTEGER);
      assert.equal(t1.value, 0);

      const t2 = lexer.nextToken();
      assert.equal(t2.type, PdfTokenType.INTEGER);
      assert.equal(t2.value, 42);

      const t3 = lexer.nextToken();
      assert.equal(t3.type, PdfTokenType.INTEGER);
      assert.equal(t3.value, -17);

      const t4 = lexer.nextToken();
      assert.equal(t4.type, PdfTokenType.INTEGER);
      assert.equal(t4.value, 999);

      const t5 = lexer.nextToken();
      assert.equal(t5.type, PdfTokenType.INTEGER);
      assert.equal(t5.value, 1000000);

      assert.equal(lexer.nextToken(), null);
    });

    it('should tokenize real / floating point numbers', () => {
      const lexer = createLexer('3.14 -0.002 .5 +12.0 -.75');
      
      const t1 = lexer.nextToken();
      assert.equal(t1.type, PdfTokenType.REAL);
      assert.equal(t1.value, 3.14);

      const t2 = lexer.nextToken();
      assert.equal(t2.type, PdfTokenType.REAL);
      assert.equal(t2.value, -0.002);

      const t3 = lexer.nextToken();
      assert.equal(t3.type, PdfTokenType.REAL);
      assert.equal(t3.value, 0.5);

      const t4 = lexer.nextToken();
      assert.equal(t4.type, PdfTokenType.REAL);
      assert.equal(t4.value, 12.0);

      const t5 = lexer.nextToken();
      assert.equal(t5.type, PdfTokenType.REAL);
      assert.equal(t5.value, -0.75);
    });
  });

  describe('Booleans and Null', () => {
    it('should tokenize true, false, and null', () => {
      const lexer = createLexer('true false null');

      const t1 = lexer.nextToken();
      assert.equal(t1.type, PdfTokenType.BOOLEAN);
      assert.equal(t1.value, true);

      const t2 = lexer.nextToken();
      assert.equal(t2.type, PdfTokenType.BOOLEAN);
      assert.equal(t2.value, false);

      const t3 = lexer.nextToken();
      assert.equal(t3.type, PdfTokenType.NULL);
      assert.equal(t3.value, null);
    });
  });

  describe('Names', () => {
    it('should tokenize standard names', () => {
      const lexer = createLexer('/Type /Pages /Font /F1 /MediaBox');
      
      assert.equal(lexer.nextToken().value, 'Type');
      assert.equal(lexer.nextToken().value, 'Pages');
      assert.equal(lexer.nextToken().value, 'Font');
      assert.equal(lexer.nextToken().value, 'F1');
      assert.equal(lexer.nextToken().value, 'MediaBox');
    });

    it('should decode hex-escaped characters in names (#XX)', () => {
      const lexer = createLexer('/Adobe#20Green /PANOSE#231 /Name#2FWithSlash /Empty#23');
      
      assert.equal(lexer.nextToken().value, 'Adobe Green');
      assert.equal(lexer.nextToken().value, 'PANOSE#1');
      assert.equal(lexer.nextToken().value, 'Name/WithSlash');
      assert.equal(lexer.nextToken().value, 'Empty#');
    });
  });

  describe('Literal Strings', () => {
    it('should tokenize simple literal strings', () => {
      const lexer = createLexer('(Hello World) (PDF Engine)');
      
      const t1 = lexer.nextToken();
      assert.equal(t1.type, PdfTokenType.STRING);
      assert.equal(t1.value, 'Hello World');

      const t2 = lexer.nextToken();
      assert.equal(t2.type, PdfTokenType.STRING);
      assert.equal(t2.value, 'PDF Engine');
    });

    it('should handle escape sequences in literal strings', () => {
      const lexer = createLexer('(Hello\\nWorld\\t\\r\\(\\)\\\\)');
      const token = lexer.nextToken();

      assert.equal(token.type, PdfTokenType.STRING);
      assert.equal(token.value, 'Hello\nWorld\t\r()\\');
    });

    it('should handle octal escape codes in strings', () => {
      const lexer = createLexer('(\\101\\102\\103\\040\\061)');
      const token = lexer.nextToken();

      assert.equal(token.type, PdfTokenType.STRING);
      assert.equal(token.value, 'ABC 1');
    });

    it('should handle nested balanced parentheses', () => {
      const lexer = createLexer('(Nested (parentheses (are) supported) properly)');
      const token = lexer.nextToken();

      assert.equal(token.type, PdfTokenType.STRING);
      assert.equal(token.value, 'Nested (parentheses (are) supported) properly');
    });

    it('should handle line continuations in strings', () => {
      const lexer = createLexer('(Line 1 \\\nLine 2)');
      const token = lexer.nextToken();

      assert.equal(token.type, PdfTokenType.STRING);
      assert.equal(token.value, 'Line 1 Line 2');
    });

    it('should throw PdfLexerException for unterminated string', () => {
      const lexer = createLexer('(Unterminated string');
      assert.throws(() => lexer.nextToken(), PdfLexerException);
    });
  });

  describe('Hexadecimal Strings', () => {
    it('should tokenize hex strings', () => {
      const lexer = createLexer('<48656C6C6F>');
      const token = lexer.nextToken();

      assert.equal(token.type, PdfTokenType.HEX_STRING);
      assert.equal(token.value, 'Hello');
      assert.deepEqual(Array.from(token.bytes), [0x48, 0x65, 0x6C, 0x6C, 0x6F]);
    });

    it('should ignore whitespace inside hex strings', () => {
      const lexer = createLexer('< 48 65 6C 6C 6F >');
      const token = lexer.nextToken();

      assert.equal(token.type, PdfTokenType.HEX_STRING);
      assert.equal(token.value, 'Hello');
    });

    it('should pad odd-length hex strings with 0', () => {
      // <48656C6C6> -> padded to <48656C6C60>
      const lexer = createLexer('<48656C6C6>');
      const token = lexer.nextToken();

      assert.equal(token.type, PdfTokenType.HEX_STRING);
      assert.deepEqual(Array.from(token.bytes), [0x48, 0x65, 0x6C, 0x6C, 0x60]);
    });

    it('should throw for invalid hex character', () => {
      const lexer = createLexer('<4865ZZ>');
      assert.throws(() => lexer.nextToken(), PdfLexerException);
    });

    it('should throw for unterminated hex string', () => {
      const lexer = createLexer('<48656C');
      assert.throws(() => lexer.nextToken(), PdfLexerException);
    });
  });

  describe('Delimiters, Arrays, and Dictionaries', () => {
    it('should tokenize array delimiters [ and ]', () => {
      const lexer = createLexer('[ 1 2 3 ]');

      assert.equal(lexer.nextToken().type, PdfTokenType.ARRAY_START);
      assert.equal(lexer.nextToken().value, 1);
      assert.equal(lexer.nextToken().value, 2);
      assert.equal(lexer.nextToken().value, 3);
      assert.equal(lexer.nextToken().type, PdfTokenType.ARRAY_END);
    });

    it('should tokenize dictionary delimiters << and >>', () => {
      const lexer = createLexer('<< /Key (Val) >>');

      assert.equal(lexer.nextToken().type, PdfTokenType.DICT_START);
      assert.equal(lexer.nextToken().value, 'Key');
      assert.equal(lexer.nextToken().value, 'Val');
      assert.equal(lexer.nextToken().type, PdfTokenType.DICT_END);
    });
  });

  describe('Keywords and Structure Markers', () => {
    it('should tokenize standard PDF keywords', () => {
      const text = 'obj endobj stream endstream xref trailer startxref %%EOF R';
      const lexer = createLexer(text);

      assert.equal(lexer.nextToken().type, PdfTokenType.OBJ);
      assert.equal(lexer.nextToken().type, PdfTokenType.ENDOBJ);
      assert.equal(lexer.nextToken().type, PdfTokenType.STREAM);
      assert.equal(lexer.nextToken().type, PdfTokenType.ENDSTREAM);
      assert.equal(lexer.nextToken().type, PdfTokenType.XREF);
      assert.equal(lexer.nextToken().type, PdfTokenType.TRAILER);
      assert.equal(lexer.nextToken().type, PdfTokenType.STARTXREF);
      assert.equal(lexer.nextToken().type, PdfTokenType.EOF);
      
      const rTok = lexer.nextToken();
      assert.equal(rTok.type, PdfTokenType.KEYWORD);
      assert.equal(rTok.value, 'R');
    });
  });

  describe('Comments and Whitespace', () => {
    it('should skip comments and whitespace by default', () => {
      const text = `
        % This is a header comment
        /Type /Catalog % inline comment
        /Pages 1 0 R
      `;
      const lexer = createLexer(text);

      assert.equal(lexer.nextToken().value, 'Type');
      assert.equal(lexer.nextToken().value, 'Catalog');
      assert.equal(lexer.nextToken().value, 'Pages');
      assert.equal(lexer.nextToken().value, 1);
      assert.equal(lexer.nextToken().value, 0);
      assert.equal(lexer.nextToken().value, 'R');
      assert.equal(lexer.nextToken(), null);
    });

    it('should return comments when includeComments is true', () => {
      const text = '% Header comment\n/Type';
      const lexer = createLexer(text);

      const cTok = lexer.nextToken(true);
      assert.equal(cTok.type, PdfTokenType.COMMENT);
      assert.equal(cTok.value, ' Header comment');

      const nTok = lexer.nextToken(true);
      assert.equal(nTok.type, PdfTokenType.NAME);
      assert.equal(nTok.value, 'Type');
    });
  });

  describe('Lookahead and Peeking', () => {
    it('should peek next token without advancing position', () => {
      const lexer = createLexer('123 /Name');

      const peek1 = lexer.peekToken();
      assert.equal(peek1.type, PdfTokenType.INTEGER);
      assert.equal(peek1.value, 123);

      const peek2 = lexer.peekToken();
      assert.equal(peek2.type, PdfTokenType.INTEGER);
      assert.equal(peek2.value, 123);

      const tok1 = lexer.nextToken();
      assert.equal(tok1.value, 123);

      const tok2 = lexer.nextToken();
      assert.equal(tok2.value, 'Name');
    });
  });

  describe('Stream Reading and Endstream Finding', () => {
    it('should read stream bytes following CRLF', () => {
      const content = 'stream\r\nHello Stream Data\r\nendstream';
      const lexer = createLexer(content);

      const streamTok = lexer.nextToken();
      assert.equal(streamTok.type, PdfTokenType.STREAM);

      const streamBytes = lexer.readStreamBytes(17);
      assert.equal(new TextDecoder().decode(streamBytes), 'Hello Stream Data');

      const endStreamTok = lexer.nextToken();
      assert.equal(endStreamTok.type, PdfTokenType.ENDSTREAM);
    });

    it('should read stream bytes following LF', () => {
      const content = 'stream\nBinary\x00\x01\x02\nendstream';
      const lexer = createLexer(content);

      lexer.nextToken(); // stream
      const streamBytes = lexer.readStreamBytes(9);
      assert.equal(streamBytes.length, 9);
    });
  });

  describe('Complete PDF Object Sequence', () => {
    it('should tokenize a full indirect PDF object definition', () => {
      const pdfSnippet = `
        12 0 obj
        <<
          /Type /Page
          /Parent 3 0 R
          /MediaBox [0 0 612.5 792.0]
          /Contents 14 0 R
        >>
        endobj
      `;
      const lexer = createLexer(pdfSnippet);

      assert.equal(lexer.nextToken().value, 12);
      assert.equal(lexer.nextToken().value, 0);
      assert.equal(lexer.nextToken().type, PdfTokenType.OBJ);
      assert.equal(lexer.nextToken().type, PdfTokenType.DICT_START);

      assert.equal(lexer.nextToken().value, 'Type');
      assert.equal(lexer.nextToken().value, 'Page');

      assert.equal(lexer.nextToken().value, 'Parent');
      assert.equal(lexer.nextToken().value, 3);
      assert.equal(lexer.nextToken().value, 0);
      assert.equal(lexer.nextToken().value, 'R');

      assert.equal(lexer.nextToken().value, 'MediaBox');
      assert.equal(lexer.nextToken().type, PdfTokenType.ARRAY_START);
      assert.equal(lexer.nextToken().value, 0);
      assert.equal(lexer.nextToken().value, 0);
      assert.equal(lexer.nextToken().value, 612.5);
      assert.equal(lexer.nextToken().value, 792.0);
      assert.equal(lexer.nextToken().type, PdfTokenType.ARRAY_END);

      assert.equal(lexer.nextToken().value, 'Contents');
      assert.equal(lexer.nextToken().value, 14);
      assert.equal(lexer.nextToken().value, 0);
      assert.equal(lexer.nextToken().value, 'R');

      assert.equal(lexer.nextToken().type, PdfTokenType.DICT_END);
      assert.equal(lexer.nextToken().type, PdfTokenType.ENDOBJ);
      assert.equal(lexer.nextToken(), null);
    });
  });
});
