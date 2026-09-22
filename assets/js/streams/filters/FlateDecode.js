import { PdfStreamException } from '../../errors/PdfStreamException.js';

/**
 * Pure JavaScript FlateDecode / Deflate decompression engine (RFC 1950 / RFC 1951).
 */
export class FlateDecode {
  /**
   * Decompresses ZLIB/Deflate compressed binary data in pure JavaScript.
   * 
   * @param {Uint8Array} data - Compressed ZLIB / Deflate byte stream
   * @returns {Uint8Array} - Decompressed binary bytes
   */
  static decode(data) {
    if (!data || data.length === 0) {
      return new Uint8Array(0);
    }
    return FlateDecode.inflate(data);
  }

  /**
   * Pure JavaScript Inflate decompressor.
   * 
   * @param {Uint8Array} input
   * @returns {Uint8Array}
   */
  static inflate(input) {
    let pos = 0;

    // Check for 2-byte ZLIB header (e.g. 0x78 0x9C, 0x78 0x01, 0x78 0xDA)
    if (input.length >= 2) {
      const cmf = input[0];
      const flg = input[1];
      const cm = cmf & 0x0F;
      if (cm === 8 && ((cmf * 256 + flg) % 31 === 0)) {
        pos = 2; // Skip ZLIB header
        if (flg & 0x20) {
          pos += 4; // Skip preset dictionary ID (FDICT)
        }
      }
    }

    let bitBuf = 0;
    let bitCount = 0;

    const readBits = (n) => {
      while (bitCount < n) {
        if (pos >= input.length) {
          throw new PdfStreamException('Unexpected EOF in Deflate stream', 'FlateDecode');
        }
        bitBuf |= input[pos++] << bitCount;
        bitCount += 8;
      }
      const val = bitBuf & ((1 << n) - 1);
      bitBuf >>>= n;
      bitCount -= n;
      return val;
    };

    const alignBits = () => {
      bitBuf = 0;
      bitCount = 0;
    };

    const output = [];
    let isFinal = 0;

    // Length and Distance base tables per RFC 1951
    const LENGTH_BASE = [
      3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
      35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
    ];
    const LENGTH_EXTRA = [
      0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
      3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
    ];

    const DIST_BASE = [
      1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
      257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
    ];
    const DIST_EXTRA = [
      0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
      7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
    ];

    const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

    // Helper to build prefix Huffman tree
    const buildHuffmanTree = (lengths) => {
      const maxBits = Math.max(...lengths, 0);
      const blCount = new Array(maxBits + 1).fill(0);
      for (const len of lengths) {
        if (len > 0) blCount[len]++;
      }

      const nextCode = new Array(maxBits + 1).fill(0);
      let code = 0;
      for (let bits = 1; bits <= maxBits; bits++) {
        code = (code + blCount[bits - 1]) << 1;
        nextCode[bits] = code;
      }

      const tree = {};
      for (let i = 0; i < lengths.length; i++) {
        const len = lengths[i];
        if (len > 0) {
          const c = nextCode[len]++;
          let node = tree;
          for (let bit = len - 1; bit >= 0; bit--) {
            const b = (c >>> bit) & 1;
            node[b] = node[b] || {};
            node = node[b];
          }
          node.symbol = i;
        }
      }
      return tree;
    };

    const decodeSymbol = (tree) => {
      let node = tree;
      while (node.symbol === undefined) {
        const b = readBits(1);
        node = node[b];
        if (!node) {
          throw new PdfStreamException('Invalid Huffman code in Deflate stream', 'FlateDecode');
        }
      }
      return node.symbol;
    };

    // Fixed Huffman trees
    const fixedLitLengths = new Array(288);
    for (let i = 0; i <= 143; i++) fixedLitLengths[i] = 8;
    for (let i = 144; i <= 255; i++) fixedLitLengths[i] = 9;
    for (let i = 256; i <= 279; i++) fixedLitLengths[i] = 7;
    for (let i = 280; i <= 287; i++) fixedLitLengths[i] = 8;
    const fixedLitTree = buildHuffmanTree(fixedLitLengths);

    const fixedDistLengths = new Array(32).fill(5);
    const fixedDistTree = buildHuffmanTree(fixedDistLengths);

    while (!isFinal) {
      isFinal = readBits(1);
      const blockType = readBits(2);

      if (blockType === 0) {
        // Uncompressed block
        alignBits();
        if (pos + 4 > input.length) {
          throw new PdfStreamException('Unexpected EOF in uncompressed block', 'FlateDecode');
        }
        const len = input[pos++] | (input[pos++] << 8);
        const nlen = input[pos++] | (input[pos++] << 8);
        if ((len ^ 0xFFFF) !== nlen) {
          throw new PdfStreamException('Invalid uncompressed block length check', 'FlateDecode');
        }
        for (let i = 0; i < len; i++) {
          output.push(input[pos++]);
        }
      } else if (blockType === 1 || blockType === 2) {
        let litTree, distTree;

        if (blockType === 1) {
          // Fixed Huffman
          litTree = fixedLitTree;
          distTree = fixedDistTree;
        } else {
          // Dynamic Huffman
          const hlit = readBits(5) + 257;
          const hdist = readBits(5) + 1;
          const hclen = readBits(4) + 4;

          const codeLens = new Array(19).fill(0);
          for (let i = 0; i < hclen; i++) {
            codeLens[CODE_LENGTH_ORDER[i]] = readBits(3);
          }
          const clTree = buildHuffmanTree(codeLens);

          const allLengths = [];
          const totalCodes = hlit + hdist;
          while (allLengths.length < totalCodes) {
            const sym = decodeSymbol(clTree);
            if (sym < 16) {
              allLengths.push(sym);
            } else if (sym === 16) {
              const rep = readBits(2) + 3;
              const last = allLengths[allLengths.length - 1] || 0;
              for (let r = 0; r < rep; r++) allLengths.push(last);
            } else if (sym === 17) {
              const rep = readBits(3) + 3;
              for (let r = 0; r < rep; r++) allLengths.push(0);
            } else if (sym === 18) {
              const rep = readBits(7) + 11;
              for (let r = 0; r < rep; r++) allLengths.push(0);
            }
          }

          litTree = buildHuffmanTree(allLengths.slice(0, hlit));
          distTree = buildHuffmanTree(allLengths.slice(hlit));
        }

        // Decompress block data
        while (true) {
          const sym = decodeSymbol(litTree);
          if (sym < 256) {
            output.push(sym);
          } else if (sym === 256) {
            // End of block
            break;
          } else {
            const lengthIndex = sym - 257;
            const length = LENGTH_BASE[lengthIndex] + (LENGTH_EXTRA[lengthIndex] > 0 ? readBits(LENGTH_EXTRA[lengthIndex]) : 0);

            const distSym = decodeSymbol(distTree);
            const dist = DIST_BASE[distSym] + (DIST_EXTRA[distSym] > 0 ? readBits(DIST_EXTRA[distSym]) : 0);

            const start = output.length - dist;
            for (let k = 0; k < length; k++) {
              output.push(output[start + k]);
            }
          }
        }
      } else {
        throw new PdfStreamException(`Invalid Deflate block type ${blockType}`, 'FlateDecode');
      }
    }

    return new Uint8Array(output);
  }
}
