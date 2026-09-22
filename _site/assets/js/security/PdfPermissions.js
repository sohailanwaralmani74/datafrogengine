/**
 * PDF Document Access Permissions (/P) bitmask flags per ISO 32000-1, Table 22.
 */
export const PdfPermissionFlags = Object.freeze({
  Print: 1 << 2,                 // Bit 3: Print document (low-res in R3+)
  Modify: 1 << 3,                // Bit 4: Modify contents of document
  Copy: 1 << 4,                  // Bit 5: Copy or extract text & graphics
  Annotate: 1 << 5,              // Bit 6: Add or modify text annotations
  FillForms: 1 << 8,             // Bit 9: Fill in interactive form fields
  ExtractAccessibility: 1 << 9,  // Bit 10: Extract text/graphics for accessibility
  Assemble: 1 << 10,             // Bit 11: Assemble document (insert, rotate, delete pages)
  PrintHighQuality: 1 << 11      // Bit 12: High-resolution printing
});

export class PdfPermissions {
  /**
   * Computes the 32-bit signed integer for /P entry from permission options.
   * 
   * @param {Object} [options={}]
   * @param {boolean} [options.print=true]
   * @param {boolean} [options.printHighQuality=true]
   * @param {boolean} [options.modify=false]
   * @param {boolean} [options.copy=true]
   * @param {boolean} [options.annotate=true]
   * @param {boolean} [options.fillForms=true]
   * @param {boolean} [options.extractAccessibility=true]
   * @param {boolean} [options.assemble=false]
   * @returns {number} Signed 32-bit integer
   */
  static createPermissions(options = {}) {
    // Bits 7, 8, and 13-32 MUST be set to 1 in standard PDF permissions
    let flags = 0xfffff0c0 | 0; // Base with reserved 1-bits set

    const {
      print = true,
      printHighQuality = true,
      modify = false,
      copy = true,
      annotate = true,
      fillForms = true,
      extractAccessibility = true,
      assemble = false
    } = options;

    if (print) flags |= PdfPermissionFlags.Print;
    if (printHighQuality) flags |= PdfPermissionFlags.PrintHighQuality;
    if (modify) flags |= PdfPermissionFlags.Modify;
    if (copy) flags |= PdfPermissionFlags.Copy;
    if (annotate) flags |= PdfPermissionFlags.Annotate;
    if (fillForms) flags |= PdfPermissionFlags.FillForms;
    if (extractAccessibility) flags |= PdfPermissionFlags.ExtractAccessibility;
    if (assemble) flags |= PdfPermissionFlags.Assemble;

    return flags | 0; // Force 32-bit signed integer
  }

  /**
   * Inspects a /P permissions bitmask and returns a human-readable permissions object.
   * 
   * @param {number} pValue
   * @returns {Record<string, boolean>}
   */
  static parsePermissions(pValue) {
    const flags = pValue | 0;
    return {
      print: (flags & PdfPermissionFlags.Print) !== 0,
      printHighQuality: (flags & PdfPermissionFlags.PrintHighQuality) !== 0,
      modify: (flags & PdfPermissionFlags.Modify) !== 0,
      copy: (flags & PdfPermissionFlags.Copy) !== 0,
      annotate: (flags & PdfPermissionFlags.Annotate) !== 0,
      fillForms: (flags & PdfPermissionFlags.FillForms) !== 0,
      extractAccessibility: (flags & PdfPermissionFlags.ExtractAccessibility) !== 0,
      assemble: (flags & PdfPermissionFlags.Assemble) !== 0
    };
  }
}
