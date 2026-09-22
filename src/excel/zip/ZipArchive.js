import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { Crc32 } from './Crc32.js';

/**
 * Standard ZIP Archive Reader & Writer for Open Packaging Conventions (OPC) XLSX files.
 * Zero external dependencies, supports Deflate and Stored compression.
 */
export class ZipArchive {
  /** @type {Map<string, { data: Uint8Array, date?: Date }>} */
  #files;

  constructor() {
    this.#files = new Map();
  }

  /**
   * Adds or replaces a file in the ZIP archive.
   * 
   * @param {string} name Relative path in the zip (e.g. "xl/workbook.xml")
   * @param {string|Uint8Array|Buffer} content
   * @param {Object} [options={}]
   * @param {Date} [options.date]
   * @returns {ZipArchive}
   */
  addFile(name, content, options = {}) {
    // Normalize path (forward slashes, no leading slash)
    const normalizedName = name.replace(/\\/g, '/').replace(/^\/+/, '');
    let bytes;
    if (typeof content === 'string') {
      bytes = new TextEncoder().encode(content);
    } else if (content instanceof Uint8Array) {
      bytes = content;
    } else if (ArrayBuffer.isView(content)) {
      bytes = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    } else {
      throw new TypeError(`File content for "${name}" must be string or Uint8Array`);
    }

    this.#files.set(normalizedName, {
      data: bytes,
      date: options.date || new Date()
    });

    return this;
  }

  /**
   * Returns list of all file paths in the archive.
   * @returns {string[]}
   */
  listFiles() {
    return Array.from(this.#files.keys());
  }

  /**
   * Checks if a file exists in the archive.
   * @param {string} name
   * @returns {boolean}
   */
  hasFile(name) {
    const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
    return this.#files.has(normalized);
  }

  /**
   * Retrieves raw file bytes by name.
   * @param {string} name
   * @returns {Uint8Array|null}
   */
  getFile(name) {
    const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
    const entry = this.#files.get(normalized);
    return entry ? entry.data : null;
  }

  /**
   * Retrieves file content as UTF-8 string.
   * @param {string} name
   * @returns {string|null}
   */
  getText(name) {
    const bytes = this.getFile(name);
    if (!bytes) return null;
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * Removes a file from the archive.
   * @param {string} name
   * @returns {boolean}
   */
  removeFile(name) {
    const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
    return this.#files.delete(normalized);
  }

  /**
   * Serializes the archive into a complete ZIP binary buffer.
   * @returns {Uint8Array}
   */
  toBuffer() {
    const localRecords = [];
    const centralRecords = [];
    let currentOffset = 0;

    for (const [name, entry] of this.#files.entries()) {
      const nameBytes = new TextEncoder().encode(name);
      const rawData = entry.data;
      const uncompressedSize = rawData.length;
      const crc = Crc32.calculate(rawData);

      // Deflate compression
      let compressedData = rawData;
      let compressionMethod = 0; // 0 = Store, 8 = Deflate

      try {
        const deflated = deflateRawSync(rawData, { level: 6 });
        // Only use compressed if it actually saves space
        if (deflated.length < rawData.length) {
          compressedData = deflated;
          compressionMethod = 8;
        }
      } catch (err) {
        compressedData = rawData;
        compressionMethod = 0;
      }

      const compressedSize = compressedData.length;
      const { dosTime, dosDate } = ZipArchive.#toDosDateTime(entry.date || new Date());

      // 1. Local File Header (30 bytes + name length + data length)
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);

      localView.setUint32(0, 0x04034b50, true); // Local file header signature
      localView.setUint16(4, 20, true);         // Version needed to extract (2.0)
      localView.setUint16(6, 0x0800, true);     // General purpose bit flag (UTF-8 filename)
      localView.setUint16(8, compressionMethod, true); // Compression method
      localView.setUint16(10, dosTime, true);   // Last mod file time
      localView.setUint16(12, dosDate, true);   // Last mod file date
      localView.setUint32(14, crc, true);       // CRC-32
      localView.setUint32(18, compressedSize, true);   // Compressed size
      localView.setUint32(22, uncompressedSize, true); // Uncompressed size
      localView.setUint16(26, nameBytes.length, true); // File name length
      localView.setUint16(28, 0, true);         // Extra field length
      localHeader.set(nameBytes, 30);

      const localOffset = currentOffset;
      localRecords.push(localHeader, compressedData);
      currentOffset += localHeader.length + compressedData.length;

      // 2. Central Directory Header (46 bytes + name length)
      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);

      centralView.setUint32(0, 0x02014b50, true); // Central file header signature
      centralView.setUint16(4, 20, true);          // Version made by
      centralView.setUint16(6, 20, true);          // Version needed to extract
      centralView.setUint16(8, 0x0800, true);      // General purpose bit flag (UTF-8)
      centralView.setUint16(10, compressionMethod, true);
      centralView.setUint16(12, dosTime, true);
      centralView.setUint16(14, dosDate, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, compressedSize, true);
      centralView.setUint32(24, uncompressedSize, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);          // Extra field length
      centralView.setUint16(32, 0, true);          // File comment length
      centralView.setUint16(34, 0, true);          // Disk number start
      centralView.setUint16(36, 0, true);          // Internal file attributes
      centralView.setUint32(38, 0, true);          // External file attributes
      centralView.setUint32(42, localOffset, true);// Relative offset of local header
      centralHeader.set(nameBytes, 46);

      centralRecords.push(centralHeader);
    }

    // 3. Central Directory Records concatenation
    const centralDirStart = currentOffset;
    let centralDirSize = 0;
    for (const chunk of centralRecords) {
      centralDirSize += chunk.length;
    }

    // 4. End of Central Directory (EOCD) Record (22 bytes)
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    const fileCount = this.#files.size;

    eocdView.setUint32(0, 0x06054b50, true);  // EOCD signature
    eocdView.setUint16(4, 0, true);           // Number of this disk
    eocdView.setUint16(6, 0, true);           // Disk with central directory
    eocdView.setUint16(8, fileCount, true);   // Total entries on this disk
    eocdView.setUint16(10, fileCount, true);  // Total entries in central directory
    eocdView.setUint32(12, centralDirSize, true); // Size of central directory
    eocdView.setUint32(16, centralDirStart, true);// Offset of start of central directory
    eocdView.setUint16(20, 0, true);          // ZIP file comment length

    // Assemble final buffer
    const totalLength = centralDirStart + centralDirSize + 22;
    const finalBuffer = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of localRecords) {
      finalBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    for (const chunk of centralRecords) {
      finalBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    finalBuffer.set(eocd, offset);

    return finalBuffer;
  }

  /**
   * Parses an existing ZIP binary buffer.
   * 
   * @param {Uint8Array|Buffer|ArrayBuffer} buffer
   * @returns {ZipArchive}
   */
  static read(buffer) {
    let bytes;
    if (buffer instanceof Uint8Array) {
      bytes = buffer;
    } else if (buffer instanceof ArrayBuffer) {
      bytes = new Uint8Array(buffer);
    } else if (ArrayBuffer.isView(buffer)) {
      bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      throw new TypeError('Buffer must be Uint8Array or ArrayBuffer');
    }

    const archive = new ZipArchive();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const totalLen = bytes.length;

    // Locate EOCD signature (0x06054b50) searching backwards from end
    let eocdOffset = -1;
    for (let i = totalLen - 22; i >= Math.max(0, totalLen - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('Invalid ZIP archive: End of Central Directory signature not found');
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);

    let cdPtr = centralDirOffset;
    for (let entryIdx = 0; entryIdx < totalEntries; entryIdx++) {
      if (cdPtr + 46 > totalLen) break;
      const cdSig = view.getUint32(cdPtr, true);
      if (cdSig !== 0x02014b50) break; // Central Directory File Header

      const compressionMethod = view.getUint16(cdPtr + 10, true);
      const uncompressedSize = view.getUint32(cdPtr + 24, true);
      const nameLen = view.getUint16(cdPtr + 28, true);
      const extraLen = view.getUint16(cdPtr + 30, true);
      const commentLen = view.getUint16(cdPtr + 32, true);
      const localHeaderOffset = view.getUint32(cdPtr + 42, true);

      const filenameBytes = bytes.subarray(cdPtr + 46, cdPtr + 46 + nameLen);
      const filename = new TextDecoder('utf-8').decode(filenameBytes);

      // Advance central directory pointer
      cdPtr += 46 + nameLen + extraLen + commentLen;

      // Skip directory entries (ending with '/')
      if (filename.endsWith('/')) {
        continue;
      }

      // Read local file header to find exact data offset
      if (localHeaderOffset + 30 > totalLen) continue;
      const localSig = view.getUint32(localHeaderOffset, true);
      if (localSig !== 0x04034b50) continue;

      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

      const compressedSize = view.getUint32(localHeaderOffset + 18, true) || uncompressedSize;
      const rawData = bytes.subarray(dataOffset, dataOffset + compressedSize);

      let decompressedData;
      if (compressionMethod === 0) {
        // Stored
        decompressedData = rawData.slice();
      } else if (compressionMethod === 8) {
        // Deflated
        decompressedData = inflateRawSync(rawData);
      } else {
        throw new Error(`Unsupported ZIP compression method: ${compressionMethod} for file ${filename}`);
      }

      archive.addFile(filename, decompressedData);
    }

    return archive;
  }

  /**
   * Helper to convert JS Date to DOS Date/Time format.
   * @private
   */
  static #toDosDateTime(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    const dosTime = (hours << 11) | (minutes << 5) | (seconds >> 1);

    return { dosDate, dosTime };
  }
}
