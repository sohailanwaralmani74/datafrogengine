/**
 * FinancialFormat - Detected format enum
 */
export const FinancialFormat = {
  QIF: 'QIF',
  OFX: 'OFX',
  QFX: 'QFX',
  QBO: 'QBO',
  UNKNOWN: 'UNKNOWN'
};

/**
 * FinancialParser - Pure JavaScript parser for QIF, QFX, QBO, and OFX 1.x/2.x documents.
 */
export class FinancialParser {
  /**
   * Auto-detect format and parse financial statement data
   * @param {string} text
   * @param {object} [options]
   * @returns {object} Standardized financial statement model
   */
  static parse(text, options = {}) {
    if (!text || typeof text !== 'string') {
      throw new TypeError('FinancialParser.parse requires a string');
    }

    const format = FinancialParser.detectFormat(text);
    switch (format) {
      case FinancialFormat.QIF:
        return FinancialParser.parseQif(text, options);
      case FinancialFormat.OFX:
      case FinancialFormat.QFX:
      case FinancialFormat.QBO:
        return FinancialParser.parseOfx(text, options);
      default:
        // Try OFX/SGML heuristic first, fallback to QIF
        if (text.includes('<OFX>') || text.includes('OFXHEADER') || text.includes('<STMTTRN>')) {
          return FinancialParser.parseOfx(text, options);
        }
        return FinancialParser.parseQif(text, options);
    }
  }

  /**
   * Detects the specific financial file format
   * @param {string} text
   * @returns {string} FinancialFormat
   */
  static detectFormat(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('!Type:') || trimmed.startsWith('!Account') || /^!Option:/m.test(trimmed)) {
      return FinancialFormat.QIF;
    }

    // Inspect OFX headers
    const headerMatch = text.match(/<INTU\.BID>|INTU\.BID:(\d+)/i);
    const isQbo = /<APPID>QBO|APPID:QBO|<INTU\.BID>/i.test(text);
    const isQfx = /<APPID>QFX|APPID:QFX|<INTU\.USERID>/i.test(text);

    if (isQbo) return FinancialFormat.QBO;
    if (isQfx) return FinancialFormat.QFX;
    if (text.includes('<OFX>') || text.includes('OFXHEADER:')) {
      return FinancialFormat.OFX;
    }

    return FinancialFormat.UNKNOWN;
  }

  /**
   * Parse Quicken Interchange Format (QIF)
   * Handles Bank, Cash, CCard, Invst, and Split items (^ separator)
   * @param {string} qifText
   * @param {object} [options]
   * @returns {object}
   */
  static parseQif(qifText, options = {}) {
    const lines = qifText.split(/\r?\n/);
    let currentType = 'Bank';
    const accounts = [];
    let currentAccount = {
      name: 'Default',
      type: currentType,
      transactions: []
    };
    accounts.push(currentAccount);

    let currentTx = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const code = line[0];
      const val = line.substring(1).trim();

      if (line.startsWith('!Type:')) {
        currentType = line.substring(6).trim();
        if (currentAccount.transactions.length > 0) {
          currentAccount = {
            name: `Account-${accounts.length + 1}`,
            type: currentType,
            transactions: []
          };
          accounts.push(currentAccount);
        } else {
          currentAccount.type = currentType;
        }
        continue;
      }

      if (line.startsWith('!Account')) {
        // Account header
        continue;
      }

      if (code === '^') {
        // End of transaction item
        if (currentTx) {
          currentAccount.transactions.push(currentTx);
          currentTx = null;
        }
        continue;
      }

      if (!currentTx) {
        currentTx = {
          id: `qif-${currentAccount.transactions.length + 1}`,
          type: 'OTHER',
          date: '',
          amount: 0,
          payee: '',
          memo: '',
          category: '',
          checkNumber: '',
          clearedStatus: '',
          splits: []
        };
      }

      switch (code) {
        case 'D': // Date
          currentTx.date = normalizeDate(val, options.dateFormat);
          break;
        case 'T': // Amount
        case 'U': // Higher precision amount (Quicken 2005+)
          currentTx.amount = parseFloat(val.replace(/,/g, '')) || 0;
          if (currentTx.amount < 0) {
            currentTx.type = 'DEBIT';
          } else if (currentTx.amount > 0) {
            currentTx.type = 'CREDIT';
          }
          break;
        case 'C': // Cleared status (*, c, R, X)
          currentTx.clearedStatus = val;
          break;
        case 'N': // Check number / Action
          currentTx.checkNumber = val;
          break;
        case 'P': // Payee / Description
          currentTx.payee = val;
          break;
        case 'M': // Memo
          currentTx.memo = val;
          break;
        case 'L': // Category or Transfer account
          currentTx.category = val;
          break;
        case 'S': // Split category
          currentTx.splits.push({ category: val, amount: 0, memo: '' });
          break;
        case '$': // Split amount
          if (currentTx.splits.length > 0) {
            currentTx.splits[currentTx.splits.length - 1].amount = parseFloat(val.replace(/,/g, '')) || 0;
          }
          break;
        case 'E': // Split memo
          if (currentTx.splits.length > 0) {
            currentTx.splits[currentTx.splits.length - 1].memo = val;
          }
          break;
      }
    }

    if (currentTx) {
      currentAccount.transactions.push(currentTx);
    }

    return {
      format: FinancialFormat.QIF,
      header: { generator: 'QIF Parser' },
      accounts
    };
  }

  /**
   * Parse OFX, QFX, and QBO (SGML or XML formats)
   * @param {string} ofxText
   * @param {object} [options]
   * @returns {object}
   */
  static parseOfx(ofxText, options = {}) {
    // 1. Separate headers and body
    const bodyStartIdx = ofxText.indexOf('<OFX>');
    const headerPart = bodyStartIdx !== -1 ? ofxText.substring(0, bodyStartIdx) : '';
    const bodyPart = bodyStartIdx !== -1 ? ofxText.substring(bodyStartIdx) : ofxText;

    const headers = {};
    const headerLines = headerPart.split(/\r?\n/);
    for (const hLine of headerLines) {
      const colIdx = hLine.indexOf(':');
      if (colIdx !== -1) {
        const k = hLine.substring(0, colIdx).trim();
        const v = hLine.substring(colIdx + 1).trim();
        if (k) headers[k] = v;
      }
    }

    // 2. Normalize SGML unclosed tags (<TAG>value -> <TAG>value</TAG>)
    const normalizedXml = normalizeOfxSgmlToXml(bodyPart);

    // 3. Extract Accounts and Transactions
    const accounts = [];

    // Bank statements: <STMTRS>
    const stmtRegex = /<STMTRS>([\s\S]*?)<\/STMTRS>/gi;
    let stmtMatch;
    while ((stmtMatch = stmtRegex.exec(normalizedXml)) !== null) {
      accounts.push(parseStatementBlock(stmtMatch[1], 'BANK'));
    }

    // Credit card statements: <CCSTMTRS>
    const ccRegex = /<CCSTMTRS>([\s\S]*?)<\/CCSTMTRS>/gi;
    let ccMatch;
    while ((ccMatch = ccRegex.exec(normalizedXml)) !== null) {
      accounts.push(parseStatementBlock(ccMatch[1], 'CREDITCARD'));
    }

    // Investment statements: <INVSTMTRS>
    const invRegex = /<INVSTMTRS>([\s\S]*?)<\/INVSTMTRS>/gi;
    let invMatch;
    while ((invMatch = invRegex.exec(normalizedXml)) !== null) {
      accounts.push(parseStatementBlock(invMatch[1], 'INVESTMENT'));
    }

    if (accounts.length === 0) {
      // Fallback: search for top-level transaction list
      accounts.push(parseStatementBlock(normalizedXml, 'DEFAULT'));
    }

    // Determine detected format
    let detected = FinancialFormat.OFX;
    if (headers['APPID'] === 'QBO' || ofxText.includes('<INTU.BID>') || ofxText.includes('QBO')) {
      detected = FinancialFormat.QBO;
    } else if (headers['APPID'] === 'QFX' || ofxText.includes('QFX')) {
      detected = FinancialFormat.QFX;
    }

    return {
      format: detected,
      header: headers,
      accounts
    };
  }
}

function parseStatementBlock(blockXml, defaultType) {
  const curDef = extractTagValue(blockXml, 'CURDEF') || 'USD';
  const bankId = extractTagValue(blockXml, 'BANKID') || '';
  const branchId = extractTagValue(blockXml, 'BRANCHID') || '';
  const acctId = extractTagValue(blockXml, 'ACCTID') || 'Default';
  const acctType = extractTagValue(blockXml, 'ACCTTYPE') || defaultType;

  // Ledger balance
  const balAmt = parseFloat(extractTagValue(blockXml, 'BALAMT')) || 0;
  const dtAsOf = extractTagValue(blockXml, 'DTASOF') || '';

  // Extract transactions <STMTTRN>
  const transactions = [];
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let trnMatch;

  while ((trnMatch = trnRegex.exec(blockXml)) !== null) {
    const trnContent = trnMatch[1];
    const trnType = extractTagValue(trnContent, 'TRNTYPE') || 'OTHER';
    const dtPosted = extractTagValue(trnContent, 'DTPOSTED') || '';
    const trnAmt = parseFloat(extractTagValue(trnContent, 'TRNAMT')) || 0;
    const fitId = extractTagValue(trnContent, 'FITID') || `fit-${transactions.length + 1}`;
    const name = extractTagValue(trnContent, 'NAME') || '';
    const memo = extractTagValue(trnContent, 'MEMO') || '';
    const checkNum = extractTagValue(trnContent, 'CHECKNUM') || '';
    const refNum = extractTagValue(trnContent, 'REFNUM') || '';

    transactions.push({
      id: fitId,
      type: trnType,
      date: formatOfxDate(dtPosted),
      rawDate: dtPosted,
      amount: trnAmt,
      payee: name,
      memo: memo || refNum,
      checkNumber: checkNum
    });
  }

  return {
    accountId: acctId,
    bankId,
    branchId,
    type: acctType,
    currency: curDef,
    balance: balAmt,
    balanceDate: formatOfxDate(dtAsOf),
    transactions
  };
}

function extractTagValue(xml, tagName) {
  // First try <TAG>value</TAG>
  const closedRegex = new RegExp(`<${tagName}>([^<]*)<\\/${tagName}>`, 'i');
  const closedMatch = xml.match(closedRegex);
  if (closedMatch) return closedMatch[1].trim();

  // Next try SGML open style: <TAG>value\n or <TAG>value<NEXTTAG>
  const openRegex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, 'i');
  const openMatch = xml.match(openRegex);
  return openMatch ? openMatch[1].trim() : '';
}

function normalizeOfxSgmlToXml(sgml) {
  // If already full valid closed XML, return
  if (sgml.includes('</STMTTRN>') && sgml.includes('</BANKTRANLIST>')) {
    return sgml;
  }

  // Tags that are container blocks vs leaf tags with values
  const leafTags = [
    'TRNTYPE', 'DTPOSTED', 'TRNAMT', 'FITID', 'NAME', 'MEMO', 'CHECKNUM', 'REFNUM',
    'CURDEF', 'BANKID', 'BRANCHID', 'ACCTID', 'ACCTTYPE', 'BALAMT', 'DTASOF',
    'CODE', 'SEVERITY', 'DTSERVER', 'LANGUAGE', 'INTU.BID', 'INTU.USERID',
    'TRNUID', 'DTSTART', 'DTEND'
  ];

  let xml = sgml;
  for (const tag of leafTags) {
    // Replace <TAG>val (where val does not start with < and does not end with </TAG>)
    // Regex matches <TAG>([^<\r\n]+) and replaces with <TAG>$1</TAG>
    const r = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'gi');
    xml = xml.replace(r, (match, val) => {
      const cleanVal = val.trim();
      return `<${tag}>${cleanVal}</${tag}>`;
    });
  }

  return xml;
}

function formatOfxDate(ofxDate) {
  if (!ofxDate) return '';
  // OFX date format: YYYYMMDDHHMMSS or YYYYMMDD
  const m = ofxDate.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return ofxDate;
}

function normalizeDate(qifDate, format = 'auto') {
  if (!qifDate) return '';
  // Can be MM/DD/YYYY, MM/DD'YY, DD/MM/YYYY, etc.
  const parts = qifDate.split(/[/.'-]/);
  if (parts.length >= 3) {
    let year = parts[2].trim();
    if (year.length === 2) {
      const yNum = parseInt(year, 10);
      year = yNum > 50 ? `19${year}` : `20${year}`;
    }
    const m = parts[0].padStart(2, '0');
    const d = parts[1].padStart(2, '0');
    return `${year}-${m}-${d}`;
  }
  return qifDate;
}
