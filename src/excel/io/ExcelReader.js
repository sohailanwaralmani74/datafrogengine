import { ZipArchive } from '../zip/ZipArchive.js';
import { XmlParser } from '../xml/XmlParser.js';
import { StyleSheet } from '../styles/StyleSheet.js';
import { CellAddress } from '../utils/CellAddress.js';
import { DateUtils } from '../utils/DateUtils.js';

/**
 * OpenXML XLSX Parser / Deserializer.
 * Parses compliant .xlsx files into high-level ExcelWorkbook and ExcelWorksheet structures.
 */
export class ExcelReader {
  /**
   * Parses an XLSX buffer into an ExcelWorkbook.
   * 
   * @param {Uint8Array|Buffer|ArrayBuffer} buffer
   * @param {Function} WorkbookClass ExcelWorkbook constructor
   * @returns {Object} ExcelWorkbook instance
   */
  static read(buffer, WorkbookClass) {
    const zip = ZipArchive.read(buffer);
    const workbook = new WorkbookClass();

    // 1. Parse Shared Strings (xl/sharedStrings.xml)
    const sharedStrings = [];
    const ssXml = zip.getText('xl/sharedStrings.xml');
    if (ssXml) {
      const sstNode = XmlParser.parse(ssXml);
      for (const siNode of sstNode.findChildren('si')) {
        let fullText = '';
        const tNode = siNode.findChild('t');
        if (tNode) {
          fullText = tNode.text;
        } else {
          // Rich text runs <r><t>...</t></r>
          for (const rNode of siNode.findChildren('r')) {
            const rtNode = rNode.findChild('t');
            if (rtNode) fullText += rtNode.text;
          }
        }
        sharedStrings.push(fullText);
      }
    }

    // 2. Parse Stylesheet (xl/styles.xml)
    let styleSheet = new StyleSheet();
    const stylesXml = zip.getText('xl/styles.xml');
    if (stylesXml) {
      styleSheet = StyleSheet.parse(stylesXml);
    }

    // 3. Parse Document Properties
    const coreXml = zip.getText('docProps/core.xml');
    if (coreXml) {
      const coreNode = XmlParser.parse(coreXml);
      const titleNode = coreNode.findChild('title');
      const creatorNode = coreNode.findChild('creator');
      if (titleNode) workbook.properties.title = titleNode.text;
      if (creatorNode) workbook.properties.creator = creatorNode.text;
    }

    // 4. Discover worksheets via xl/workbook.xml & xl/_rels/workbook.xml.rels
    const wbXml = zip.getText('xl/workbook.xml');
    if (!wbXml) {
      throw new Error('Invalid XLSX: missing xl/workbook.xml');
    }

    const relsXml = zip.getText('xl/_rels/workbook.xml.rels');
    const relMap = new Map(); // rId -> targetPath
    if (relsXml) {
      const relsNode = XmlParser.parse(relsXml);
      for (const rel of relsNode.findChildren('Relationship')) {
        const id = rel.getAttr('Id');
        const target = rel.getAttr('Target');
        if (id && target) {
          relMap.set(id, target.startsWith('xl/') ? target : `xl/${target}`);
        }
      }
    }

    const wbNode = XmlParser.parse(wbXml);
    const sheetsNode = wbNode.findChild('sheets');
    if (!sheetsNode) {
      throw new Error('Invalid XLSX: no sheets defined in xl/workbook.xml');
    }

    let sheetIdx = 1;
    for (const sheetEntry of sheetsNode.findChildren('sheet')) {
      const sheetName = sheetEntry.getAttr('name') || `Sheet${sheetIdx}`;
      const rId = sheetEntry.getAttr('r:id') || sheetEntry.getAttr('id');
      const targetPath = relMap.get(rId) || `xl/worksheets/sheet${sheetIdx}.xml`;

      const wsXml = zip.getText(targetPath);
      if (wsXml) {
        const worksheet = workbook.addWorksheet(sheetName);
        ExcelReader.#parseWorksheet(wsXml, worksheet, sharedStrings, styleSheet);
      }

      sheetIdx++;
    }

    return workbook;
  }

  static #parseWorksheet(xml, ws, sharedStrings, styleSheet) {
    const root = XmlParser.parse(xml);

    // Columns
    const colsNode = root.findChild('cols');
    if (colsNode) {
      for (const cNode of colsNode.findChildren('col')) {
        const min = parseInt(cNode.getAttr('min'), 10);
        const max = parseInt(cNode.getAttr('max'), 10);
        const width = parseFloat(cNode.getAttr('width'));
        const hidden = cNode.getAttr('hidden') === '1' || cNode.getAttr('hidden') === 'true';

        for (let col = min; col <= max; col++) {
          const colObj = ws.getColumn(col);
          if (!isNaN(width)) colObj.setWidth(width);
          colObj.hidden = hidden;
        }
      }
    }

    // SheetData (Rows and Cells)
    const dataNode = root.findChild('sheetData');
    if (dataNode) {
      for (const rNode of dataNode.findChildren('row')) {
        const rowNum = parseInt(rNode.getAttr('r'), 10);
        const row = ws.getRow(rowNum);
        const ht = parseFloat(rNode.getAttr('ht'));
        if (!isNaN(ht)) row.height = ht;
        if (rNode.getAttr('hidden') === '1') row.hidden = true;

        for (const cNode of rNode.findChildren('c')) {
          const cellRef = cNode.getAttr('r');
          const cell = ws.getCell(cellRef);
          const cellType = cNode.getAttr('t') || 'n'; // default number
          const styleId = parseInt(cNode.getAttr('s') || '0', 10);

          if (styleId > 0 && styleSheet) {
            cell.setStyle(styleSheet.getStyle(styleId));
          }

          const fNode = cNode.findChild('f');
          const vNode = cNode.findChild('v');
          const formulaText = fNode ? fNode.text : null;
          const rawVal = vNode ? vNode.text : null;

          if (formulaText) {
            cell.setFormula(formulaText, rawVal);
          }

          if (rawVal !== null && rawVal !== undefined) {
            if (cellType === 's') {
              // Shared string index
              const strIdx = parseInt(rawVal, 10);
              cell.setValue(sharedStrings[strIdx] ?? '');
            } else if (cellType === 'b') {
              cell.setValue(rawVal === '1' || rawVal.toLowerCase() === 'true');
            } else if (cellType === 'str' || cellType === 'inlineStr') {
              cell.setValue(rawVal);
            } else if (cellType === 'e') {
              cell.setValue(rawVal); // Error string (e.g. #VALUE!)
            } else {
              // Numeric or Date
              const num = parseFloat(rawVal);
              // Check if style specifies date format
              if (!isNaN(num)) {
                if (cell.style.format && /y|m|d|h|s/i.test(cell.style.format)) {
                  try {
                    cell.setValue(DateUtils.serialToDate(num));
                  } catch {
                    cell.setValue(num);
                  }
                } else {
                  cell.setValue(num);
                }
              } else {
                cell.setValue(rawVal);
              }
            }
          }
        }
      }
    }

    // Merge Cells
    const mergeCellsNode = root.findChild('mergeCells');
    if (mergeCellsNode) {
      for (const mNode of mergeCellsNode.findChildren('mergeCell')) {
        const ref = mNode.getAttr('ref');
        if (ref) ws.mergeCells(ref);
      }
    }

    // AutoFilter
    const afNode = root.findChild('autoFilter');
    if (afNode) {
      ws.autoFilter = afNode.getAttr('ref') || null;
    }
  }
}
