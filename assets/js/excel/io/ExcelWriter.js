import { ZipArchive } from '../zip/ZipArchive.js';
import { XmlWriter } from '../xml/XmlWriter.js';
import { StyleSheet } from '../styles/StyleSheet.js';
import { DateUtils } from '../utils/DateUtils.js';

/**
 * OpenXML XLSX Serializer. Generates compliant, standard Microsoft Excel (.xlsx) files.
 * Zero external dependencies.
 */
export class ExcelWriter {
  /**
   * Serializes an ExcelWorkbook to a complete XLSX binary buffer.
   * 
   * @param {Object} workbook ExcelWorkbook instance
   * @returns {Uint8Array}
   */
  static write(workbook) {
    const zip = new ZipArchive();
    const styleSheet = new StyleSheet();
    const sharedStrings = [];
    const sharedStringMap = new Map(); // string -> id

    const getOrAddSharedString = (str) => {
      const s = String(str);
      if (sharedStringMap.has(s)) {
        return sharedStringMap.get(s);
      }
      const id = sharedStrings.length;
      sharedStrings.push(s);
      sharedStringMap.set(s, id);
      return id;
    };

    // 1. [Content_Types].xml
    const ctWriter = new XmlWriter();
    ctWriter.declaration();
    ctWriter.startElement('Types', {
      xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types'
    });
    ctWriter.emptyElement('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' });
    ctWriter.emptyElement('Default', { Extension: 'xml', ContentType: 'application/xml' });
    ctWriter.emptyElement('Override', { PartName: '/xl/workbook.xml', ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' });
    ctWriter.emptyElement('Override', { PartName: '/xl/styles.xml', ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml' });
    ctWriter.emptyElement('Override', { PartName: '/xl/sharedStrings.xml', ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml' });
    ctWriter.emptyElement('Override', { PartName: '/docProps/core.xml', ContentType: 'application/vnd.openxmlformats-package.core-properties+xml' });
    ctWriter.emptyElement('Override', { PartName: '/docProps/app.xml', ContentType: 'application/vnd.openxmlformats-officedocument.extended-properties+xml' });

    for (let i = 0; i < workbook.worksheets.length; i++) {
      ctWriter.emptyElement('Override', {
        PartName: `/xl/worksheets/sheet${i + 1}.xml`,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
      });
    }
    ctWriter.endElement('Types');
    zip.addFile('[Content_Types].xml', ctWriter.toString());

    // 2. _rels/.rels
    const rootRelsWriter = new XmlWriter();
    rootRelsWriter.declaration();
    rootRelsWriter.startElement('Relationships', {
      xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships'
    });
    rootRelsWriter.emptyElement('Relationship', {
      Id: 'rId1',
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
      Target: 'xl/workbook.xml'
    });
    rootRelsWriter.emptyElement('Relationship', {
      Id: 'rId2',
      Type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
      Target: 'docProps/core.xml'
    });
    rootRelsWriter.emptyElement('Relationship', {
      Id: 'rId3',
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
      Target: 'docProps/app.xml'
    });
    rootRelsWriter.endElement('Relationships');
    zip.addFile('_rels/.rels', rootRelsWriter.toString());

    // 3. docProps/core.xml & docProps/app.xml
    const nowIso = new Date().toISOString();
    const coreWriter = new XmlWriter();
    coreWriter.declaration();
    coreWriter.startElement('cp:coreProperties', {
      'xmlns:cp': 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
      'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
      'xmlns:dcterms': 'http://purl.org/dc/terms/',
      'xmlns:dcmitype': 'http://purl.org/dc/dcmitype/',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
    });
    coreWriter.element('dc:title', workbook.properties.title || 'Spreadsheet');
    coreWriter.element('dc:creator', workbook.properties.creator || 'PDF & Excel Engine');
    coreWriter.element('cp:lastModifiedBy', workbook.properties.creator || 'PDF & Excel Engine');
    coreWriter.startElement('dcterms:created', { 'xsi:type': 'dcterms:W3CDTF' }).text(nowIso).endElement('dcterms:created');
    coreWriter.startElement('dcterms:modified', { 'xsi:type': 'dcterms:W3CDTF' }).text(nowIso).endElement('dcterms:modified');
    coreWriter.endElement('cp:coreProperties');
    zip.addFile('docProps/core.xml', coreWriter.toString());

    const appWriter = new XmlWriter();
    appWriter.declaration();
    appWriter.startElement('Properties', {
      xmlns: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
      'xmlns:vt': 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes'
    });
    appWriter.element('Application', 'Excel Engine');
    appWriter.endElement('Properties');
    zip.addFile('docProps/app.xml', appWriter.toString());

    // 4. Serialize Worksheets
    for (let sheetIdx = 0; sheetIdx < workbook.worksheets.length; sheetIdx++) {
      const ws = workbook.worksheets[sheetIdx];
      const sheetXml = ExcelWriter.#serializeWorksheet(ws, styleSheet, getOrAddSharedString);
      zip.addFile(`xl/worksheets/sheet${sheetIdx + 1}.xml`, sheetXml);
    }

    // 5. xl/sharedStrings.xml
    const ssWriter = new XmlWriter();
    ssWriter.declaration();
    ssWriter.startElement('sst', {
      xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      count: sharedStrings.length,
      uniqueCount: sharedStrings.length
    });
    for (const str of sharedStrings) {
      ssWriter.startElement('si');
      ssWriter.element('t', str);
      ssWriter.endElement('si');
    }
    ssWriter.endElement('sst');
    zip.addFile('xl/sharedStrings.xml', ssWriter.toString());

    // 6. xl/styles.xml
    zip.addFile('xl/styles.xml', styleSheet.toXml());

    // 7. xl/workbook.xml
    const wbWriter = new XmlWriter();
    wbWriter.declaration();
    wbWriter.startElement('workbook', {
      xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    });
    wbWriter.startElement('sheets');
    for (let i = 0; i < workbook.worksheets.length; i++) {
      const ws = workbook.worksheets[i];
      wbWriter.emptyElement('sheet', {
        name: ws.name || `Sheet${i + 1}`,
        sheetId: i + 1,
        'r:id': `rId${i + 1}`
      });
    }
    wbWriter.endElement('sheets');
    wbWriter.endElement('workbook');
    zip.addFile('xl/workbook.xml', wbWriter.toString());

    // 8. xl/_rels/workbook.xml.rels
    const wbRelsWriter = new XmlWriter();
    wbRelsWriter.declaration();
    wbRelsWriter.startElement('Relationships', {
      xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships'
    });

    let relId = 1;
    for (let i = 0; i < workbook.worksheets.length; i++) {
      wbRelsWriter.emptyElement('Relationship', {
        Id: `rId${relId++}`,
        Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
        Target: `worksheets/sheet${i + 1}.xml`
      });
    }
    wbRelsWriter.emptyElement('Relationship', {
      Id: `rId${relId++}`,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
      Target: 'styles.xml'
    });
    wbRelsWriter.emptyElement('Relationship', {
      Id: `rId${relId++}`,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings',
      Target: 'sharedStrings.xml'
    });

    wbRelsWriter.endElement('Relationships');
    zip.addFile('xl/_rels/workbook.xml.rels', wbRelsWriter.toString());

    return zip.toBuffer();
  }

  static #serializeWorksheet(ws, styleSheet, getOrAddSharedString) {
    const w = new XmlWriter();
    w.declaration();
    w.startElement('worksheet', {
      xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    });

    w.emptyElement('dimension', { ref: ws.getDimensions() });

    // SheetViews (frozen panes, gridlines)
    w.startElement('sheetViews');
    w.startElement('sheetView', { workbookViewId: 0, showGridLines: ws.showGridLines ? '1' : '0' });
    if (ws.freezePanes) {
      w.emptyElement('pane', {
        xSplit: ws.freezePanes.col || 0,
        ySplit: ws.freezePanes.row || 0,
        topLeftCell: `${String.fromCharCode(65 + (ws.freezePanes.col || 0))}${(ws.freezePanes.row || 0) + 1}`,
        activePane: 'bottomRight',
        state: 'frozen'
      });
    }
    w.endElement('sheetView');
    w.endElement('sheetViews');

    // Columns
    if (ws.columns.size > 0) {
      w.startElement('cols');
      const sortedCols = Array.from(ws.columns.keys()).sort((a, b) => a - b);
      for (const colNum of sortedCols) {
        const col = ws.columns.get(colNum);
        const colAttrs = {
          min: colNum,
          max: colNum,
          width: col.width || 12,
          customWidth: '1'
        };
        if (col.hidden) colAttrs.hidden = '1';
        w.emptyElement('col', colAttrs);
      }
      w.endElement('cols');
    }

    // SheetData
    w.startElement('sheetData');
    const sortedRowNums = Array.from(ws.rows.keys()).sort((a, b) => a - b);

    for (const rowNum of sortedRowNums) {
      const row = ws.rows.get(rowNum);
      const rowAttrs = { r: rowNum };
      if (row.height) {
        rowAttrs.ht = row.height;
        rowAttrs.customHeight = '1';
      }
      if (row.hidden) rowAttrs.hidden = '1';

      w.startElement('row', rowAttrs);

      const sortedCols = Array.from(row.cells.keys()).sort((a, b) => a - b);
      for (const colNum of sortedCols) {
        const cell = row.cells.get(colNum);
        const val = cell.value;
        const styleId = styleSheet.registerStyle(cell.style);

        const cellAttrs = { r: cell.ref };
        if (styleId > 0) cellAttrs.s = styleId;

        if (cell.formula) {
          // Formula cell
          const rawFormula = cell.formula.startsWith('=') ? cell.formula.substring(1) : cell.formula;
          w.startElement('c', cellAttrs);
          w.element('f', rawFormula);
          if (val !== null && val !== undefined) {
            w.element('v', String(val));
          }
          w.endElement('c');
        } else if (val === null || val === undefined) {
          w.emptyElement('c', cellAttrs);
        } else if (typeof val === 'boolean') {
          cellAttrs.t = 'b';
          w.startElement('c', cellAttrs);
          w.element('v', val ? '1' : '0');
          w.endElement('c');
        } else if (typeof val === 'number') {
          w.startElement('c', cellAttrs);
          w.element('v', String(val));
          w.endElement('c');
        } else if (DateUtils.isDate(val)) {
          // Date serial
          const serial = DateUtils.dateToSerial(val);
          w.startElement('c', cellAttrs);
          w.element('v', String(serial));
          w.endElement('c');
        } else {
          // Shared string
          const sId = getOrAddSharedString(String(val));
          cellAttrs.t = 's';
          w.startElement('c', cellAttrs);
          w.element('v', String(sId));
          w.endElement('c');
        }
      }

      w.endElement('row');
    }
    w.endElement('sheetData');

    // AutoFilter
    if (ws.autoFilter) {
      w.emptyElement('autoFilter', { ref: ws.autoFilter });
    }

    // MergeCells
    if (ws.merges.size > 0) {
      w.startElement('mergeCells', { count: ws.merges.size });
      for (const mergeRef of ws.merges) {
        w.emptyElement('mergeCell', { ref: mergeRef });
      }
      w.endElement('mergeCells');
    }

    w.endElement('worksheet');
    return w.toString();
  }
}
