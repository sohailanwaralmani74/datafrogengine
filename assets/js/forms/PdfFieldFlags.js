/**
 * Field Flags (/Ff) bitmask constants per ISO 32000-1 (PDF 1.7), Table 221 - Table 228.
 */
export const PdfFieldFlags = Object.freeze({
  // Common field flags
  ReadOnly: 1 << 0,          // Bit 1: Field cannot be edited by user
  Required: 1 << 1,          // Bit 2: Field must have a value before submitting
  NoExport: 1 << 2,          // Bit 3: Field value shall not be exported

  // Button field flags (/FT /Btn)
  NoToggleToOff: 1 << 14,    // Bit 15: Radio button cannot be unselected
  Radio: 1 << 15,            // Bit 16: Radio button (if 0, Checkbox)
  Pushbutton: 1 << 16,       // Bit 17: Push button
  RadiosInUnison: 1 << 25,   // Bit 26: Multiple radio buttons with same on-state turn on simultaneously

  // Text field flags (/FT /Tx)
  Multiline: 1 << 12,        // Bit 13: Multi-line text field
  Password: 1 << 13,         // Bit 14: Password field (hidden characters)
  FileSelect: 1 << 20,       // Bit 21: Text field represents a file path
  DoNotSpellCheck: 1 << 22,  // Bit 23: Disable spell checking
  DoNotScroll: 1 << 23,      // Bit 24: Field shall not scroll
  Comb: 1 << 24,             // Bit 25: Split field into equidistant comb cells (MaxLen)
  RichText: 1 << 25,         // Bit 26: Contains rich text XML (/RV)

  // Choice field flags (/FT /Ch)
  Combo: 1 << 17,            // Bit 18: Combo box / dropdown (if 0, List box)
  Edit: 1 << 18,             // Bit 19: Combo box includes an editable text box
  Sort: 1 << 19,             // Bit 20: Options should be sorted alphabetically
  MultiSelect: 1 << 21,      // Bit 22: Multiple items may be selected
  CommitOnSelChange: 1 << 26 // Bit 27: Commit selection immediately upon change
});
