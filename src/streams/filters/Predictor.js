import { PdfStreamException } from '../../errors/PdfStreamException.js';

/**
 * Implements TIFF and PNG predictor algorithms for stream post-processing.
 */
export class Predictor {
  /**
   * Applies predictor post-processing on decompressed stream data.
   * 
   * @param {Uint8Array} data - Raw decompressed bytes
   * @param {Object} [params={}] - /DecodeParms (Predictor, Colors, BitsPerComponent, Columns)
   * @returns {Uint8Array} - Reconstructed image/stream bytes
   */
  static process(data, params = {}) {
    const predictor = params.Predictor !== undefined ? params.Predictor : 1;
    if (predictor <= 1) {
      return data;
    }

    const colors = params.Colors !== undefined ? params.Colors : 1;
    const bitsPerComponent = params.BitsPerComponent !== undefined ? params.BitsPerComponent : 8;
    const columns = params.Columns !== undefined ? params.Columns : 1;

    const bytesPerPixel = Math.max(1, Math.ceil((colors * bitsPerComponent) / 8));
    const bytesPerRow = Math.ceil((columns * colors * bitsPerComponent) / 8);

    if (predictor === 2) {
      // TIFF Predictor 2: horizontal differencing
      return Predictor.#processTiff(data, colors, bitsPerComponent, columns, bytesPerRow, bytesPerPixel);
    }

    if (predictor >= 10 && predictor <= 15) {
      // PNG Predictors
      return Predictor.#processPng(data, bytesPerRow, bytesPerPixel);
    }

    throw new PdfStreamException(`Unsupported predictor value ${predictor}`, 'Predictor');
  }

  /**
   * TIFF Predictor 2 decoding.
   * @private
   */
  static #processTiff(data, colors, bitsPerComponent, columns, bytesPerRow, bytesPerPixel) {
    const output = new Uint8Array(data.length);
    output.set(data);

    if (bitsPerComponent === 8) {
      for (let offset = 0; offset < output.length; offset += bytesPerRow) {
        const rowEnd = Math.min(offset + bytesPerRow, output.length);
        for (let i = offset + bytesPerPixel; i < rowEnd; i++) {
          output[i] = (output[i] + output[i - bytesPerPixel]) & 0xFF;
        }
      }
    } else {
      // For bitsPerComponent != 8, handle general TIFF prediction
      for (let offset = 0; offset < output.length; offset += bytesPerRow) {
        const rowEnd = Math.min(offset + bytesPerRow, output.length);
        for (let i = offset + bytesPerPixel; i < rowEnd; i++) {
          output[i] = (output[i] + output[i - bytesPerPixel]) & 0xFF;
        }
      }
    }

    return output;
  }

  /**
   * PNG Predictor decoding.
   * @private
   */
  static #processPng(data, bytesPerRow, bytesPerPixel) {
    const rowStride = 1 + bytesPerRow; // 1 byte filter type + row bytes
    const rowCount = Math.floor(data.length / rowStride);
    const output = new Uint8Array(rowCount * bytesPerRow);

    let prevRow = new Uint8Array(bytesPerRow);

    for (let row = 0; row < rowCount; row++) {
      const srcOffset = row * rowStride;
      const dstOffset = row * bytesPerRow;
      const filterType = data[srcOffset];
      const currentRow = output.subarray(dstOffset, dstOffset + bytesPerRow);

      for (let col = 0; col < bytesPerRow; col++) {
        const raw = data[srcOffset + 1 + col];
        const left = col >= bytesPerPixel ? currentRow[col - bytesPerPixel] : 0;
        const above = prevRow[col];
        const upperLeft = col >= bytesPerPixel ? prevRow[col - bytesPerPixel] : 0;

        let reconstructed = 0;
        switch (filterType) {
          case 0: // None
            reconstructed = raw;
            break;
          case 1: // Sub (Left)
            reconstructed = (raw + left) & 0xFF;
            break;
          case 2: // Up (Above)
            reconstructed = (raw + above) & 0xFF;
            break;
          case 3: // Average (floor((Left + Above) / 2))
            reconstructed = (raw + Math.floor((left + above) / 2)) & 0xFF;
            break;
          case 4: // Paeth
            reconstructed = (raw + Predictor.#paethPredictor(left, above, upperLeft)) & 0xFF;
            break;
          default:
            throw new PdfStreamException(`Invalid PNG filter tag ${filterType} at row ${row}`, 'Predictor');
        }

        currentRow[col] = reconstructed;
      }

      prevRow.set(currentRow);
    }

    return output;
  }

  /**
   * Standard Paeth predictor function.
   * @private
   */
  static #paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);

    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
}
