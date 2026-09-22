/**
 * FinancialSerializer - Pure JavaScript Serializer for QIF, OFX, QFX, and QBO formats.
 */

import { FinancialFormat } from './FinancialParser.js';

export class FinancialSerializer {
  /**
   * Serializes a standardized financial model to QIF format
   * @param {object} statement
   * @returns {string} QIF formatted text
   */
  static toQif(statement) {
    const lines = [];
    const accounts = statement.accounts || [statement];

    for (const acct of accounts) {
      lines.push(`!Type:${acct.type || 'Bank'}`);
      const txs = acct.transactions || [];

      for (const tx of txs) {
        if (tx.date) {
          // Format date as MM/DD/YYYY or YYYY-MM-DD
          lines.push(`D${formatQifDate(tx.date)}`);
        }
        if (tx.amount !== undefined) {
          lines.push(`T${Number(tx.amount).toFixed(2)}`);
        }
        if (tx.clearedStatus) {
          lines.push(`C${tx.clearedStatus}`);
        }
        if (tx.checkNumber) {
          lines.push(`N${tx.checkNumber}`);
        }
        if (tx.payee) {
          lines.push(`P${tx.payee}`);
        }
        if (tx.memo) {
          lines.push(`M${tx.memo}`);
        }
        if (tx.category) {
          lines.push(`L${tx.category}`);
        }
        if (Array.isArray(tx.splits)) {
          for (const s of tx.splits) {
            if (s.category) lines.push(`S${s.category}`);
            if (s.memo) lines.push(`E${s.memo}`);
            if (s.amount !== undefined) lines.push(`$${Number(s.amount).toFixed(2)}`);
          }
        }
        lines.push('^');
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Serializes a standardized financial model to OFX, QFX, or QBO XML format
   * @param {object} statement
   * @param {object} [options]
   * @returns {string} OFX/QFX/QBO formatted document
   */
  static toOfx(statement, options = {}) {
    const format = options.format || statement.format || FinancialFormat.OFX;
    const appId = format === FinancialFormat.QBO ? 'QBO' : format === FinancialFormat.QFX ? 'QFX' : 'OFX';
    const intuBid = options.bid || (format === FinancialFormat.QBO ? '3000' : '2000');

    let out = '';
    // OFX 1.02 Header
    out += 'OFXHEADER:100\n';
    out += 'DATA:OFXSGML\n';
    out += 'VERSION:102\n';
    out += 'SECURITY:NONE\n';
    out += 'ENCODING:USASCII\n';
    out += 'CHARSET:1252\n';
    out += 'COMPRESSION:NONE\n';
    out += 'OLDFILEUID:NONE\n';
    out += 'NEWFILEUID:NONE\n\n';

    out += '<OFX>\n';
    out += '  <SIGNONMSGSRSV1>\n';
    out += '    <SONRS>\n';
    out += '      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>\n';
    out += `      <DTSERVER>${getOfxNow()}</DTSERVER>\n`;
    out += '      <LANGUAGE>ENG</LANGUAGE>\n';
    if (format === FinancialFormat.QBO || format === FinancialFormat.QFX) {
      out += `      <INTU.BID>${intuBid}</INTU.BID>\n`;
      out += `      <INTU.USERID>USER</INTU.USERID>\n`;
    }
    out += '    </SONRS>\n';
    out += '  </SIGNONMSGSRSV1>\n';

    const accounts = statement.accounts || [statement];
    out += '  <BANKMSGSRSV1>\n';

    for (const acct of accounts) {
      const isCreditCard = String(acct.type).toUpperCase().includes('CREDIT') || String(acct.type).toUpperCase() === 'CCARD';
      const rootTag = isCreditCard ? 'CCSTMTRS' : 'STMTRS';
      const acctTag = isCreditCard ? 'CCACCTFROM' : 'BANKACCTFROM';

      out += '    <STMTTRNRS>\n';
      out += '      <TRNUID>1</TRNUID>\n';
      out += '      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>\n';
      out += `      <${rootTag}>\n`;
      out += `        <CURDEF>${acct.currency || 'USD'}</CURDEF>\n`;
      out += `        <${acctTag}>\n`;
      if (!isCreditCard && acct.bankId) {
        out += `          <BANKID>${acct.bankId}</BANKID>\n`;
      }
      out += `          <ACCTID>${acct.accountId || '123456789'}</ACCTID>\n`;
      if (!isCreditCard) {
        out += `          <ACCTTYPE>${acct.type || 'CHECKING'}</ACCTTYPE>\n`;
      }
      out += `        </${acctTag}>\n`;

      const txs = acct.transactions || [];
      const startDate = txs.length > 0 ? toOfxDate(txs[0].date) : getOfxNow();
      const endDate = txs.length > 0 ? toOfxDate(txs[txs.length - 1].date) : getOfxNow();

      out += '        <BANKTRANLIST>\n';
      out += `          <DTSTART>${startDate}</DTSTART>\n`;
      out += `          <DTEND>${endDate}</DTEND>\n`;

      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        const trnType = tx.type || (tx.amount < 0 ? 'DEBIT' : 'CREDIT');
        out += '          <STMTTRN>\n';
        out += `            <TRNTYPE>${trnType}</TRNTYPE>\n`;
        out += `            <DTPOSTED>${toOfxDate(tx.date)}</DTPOSTED>\n`;
        out += `            <TRNAMT>${Number(tx.amount).toFixed(2)}</TRNAMT>\n`;
        out += `            <FITID>${tx.id || `TX-${i + 1}`}</FITID>\n`;
        if (tx.checkNumber) {
          out += `            <CHECKNUM>${tx.checkNumber}</CHECKNUM>\n`;
        }
        if (tx.payee) {
          out += `            <NAME>${escapeXml(tx.payee)}</NAME>\n`;
        }
        if (tx.memo) {
          out += `            <MEMO>${escapeXml(tx.memo)}</MEMO>\n`;
        }
        out += '          </STMTTRN>\n';
      }

      out += '        </BANKTRANLIST>\n';
      out += '        <LEDGERBAL>\n';
      out += `          <BALAMT>${Number(acct.balance || 0).toFixed(2)}</BALAMT>\n`;
      out += `          <DTASOF>${getOfxNow()}</DTASOF>\n`;
      out += '        </LEDGERBAL>\n';
      out += `      </${rootTag}>\n`;
      out += '    </STMTTRNRS>\n';
    }

    out += '  </BANKMSGSRSV1>\n';
    out += '</OFX>\n';

    return out;
  }

  static toQfx(statement, options = {}) {
    return FinancialSerializer.toOfx(statement, { ...options, format: FinancialFormat.QFX });
  }

  static toQbo(statement, options = {}) {
    return FinancialSerializer.toOfx(statement, { ...options, format: FinancialFormat.QBO });
  }
}

function formatQifDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  return dateStr;
}

function toOfxDate(dateStr) {
  if (!dateStr) return getOfxNow();
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}120000`;
  }
  return dateStr.replace(/[-:\s]/g, '').padEnd(14, '0');
}

function getOfxNow() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
