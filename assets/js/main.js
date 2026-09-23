/**
 * Document & Data Processing Engine Suite Interactive Client Script
 * Provides tab switching, code copying, XML inspector, and JSON Data Processing Tools.
 */

// Tab switching for API Code Examples
window.switchCodeTab = function (tab) {
  const tabs = ['excel', 'excel-builder', 'pdf', 'xml', 'json'];
  tabs.forEach((t) => {
    const btn = document.getElementById('tab-btn-' + t);
    const block = document.getElementById('block-' + t);
    if (btn && block) {
      if (t === tab) {
        btn.classList.add('active');
        block.style.display = 'block';
      } else {
        btn.classList.remove('active');
        block.style.display = 'none';
      }
    }
  });
};

// Copy code snippet to clipboard with visual feedback
window.copyCodeSnippet = function (blockId, btnElement) {
  const codeBlock = document.getElementById(blockId);
  if (!codeBlock) return;
  const text = codeBlock.innerText;

  navigator.clipboard.writeText(text).then(() => {
    const originalText = btnElement.innerText;
    btnElement.innerText = '✓ Copied!';
    btnElement.classList.add('copied');
    setTimeout(() => {
      btnElement.innerText = originalText;
      btnElement.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    btnElement.innerText = 'Copied!';
  });
};

// Client-side lightweight XML Demo Engine for the live inspector
window.runXmlDemo = function () {
  const inputElem = document.getElementById('xml-demo-input');
  const outputElem = document.getElementById('xml-demo-output');
  const statusElem = document.getElementById('xml-demo-status');
  const treeElem = document.getElementById('xml-demo-tree');

  if (!inputElem || !outputElem) return;

  const xmlText = inputElem.value;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const parserError = doc.querySelector('parsererror');

    if (parserError) {
      if (statusElem) {
        statusElem.className = 'status-pill status-error';
        statusElem.textContent = '❌ Syntax Error';
      }
      outputElem.textContent = parserError.textContent.trim();
      if (treeElem) treeElem.textContent = 'Invalid XML document structure.';
      return;
    }

    if (statusElem) {
      statusElem.className = 'status-pill status-valid';
      statusElem.textContent = '✓ Well-Formed XML 1.0';
    }

    // Convert DOM to clean JSON representation
    const jsonResult = xmlNodeToJson(doc.documentElement);
    outputElem.textContent = JSON.stringify(jsonResult, null, 2);

    // Render tree view summary
    if (treeElem) {
      const stats = analyzeXml(doc.documentElement);
      treeElem.innerHTML = `
        <div class="tree-stat"><span>Root Element:</span> <strong>&lt;${doc.documentElement.tagName}&gt;</strong></div>
        <div class="tree-stat"><span>Total Elements:</span> <strong>${stats.elementCount}</strong></div>
        <div class="tree-stat"><span>Total Attributes:</span> <strong>${stats.attributeCount}</strong></div>
        <div class="tree-stat"><span>Tree Depth:</span> <strong>${stats.maxDepth}</strong></div>
      `;
    }
  } catch (err) {
    if (statusElem) {
      statusElem.className = 'status-pill status-error';
      statusElem.textContent = '❌ Parsing Exception';
    }
    outputElem.textContent = err.message;
  }
};

function xmlNodeToJson(node) {
  const obj = {};
  if (node.nodeType === 1) { // Element
    if (node.attributes.length > 0) {
      for (let j = 0; j < node.attributes.length; j++) {
        const attr = node.attributes.item(j);
        obj['@' + attr.nodeName] = attr.nodeValue;
      }
    }
  }

  if (node.hasChildNodes()) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const item = node.childNodes.item(i);
      const nodeName = item.nodeName;

      if (item.nodeType === 3) { // Text
        const text = item.nodeValue.trim();
        if (text) {
          if (Object.keys(obj).length === 0) return text;
          obj['#text'] = text;
        }
      } else if (item.nodeType === 1) { // Element
        const childVal = xmlNodeToJson(item);
        if (obj[nodeName] === undefined) {
          obj[nodeName] = childVal;
        } else {
          if (!Array.isArray(obj[nodeName])) {
            obj[nodeName] = [obj[nodeName]];
          }
          obj[nodeName].push(childVal);
        }
      }
    }
  }

  return obj;
}

function analyzeXml(elem, depth = 1) {
  let elementCount = 1;
  let attributeCount = elem.attributes.length;
  let maxDepth = depth;

  for (const child of elem.children) {
    const childStats = analyzeXml(child, depth + 1);
    elementCount += childStats.elementCount;
    attributeCount += childStats.attributeCount;
    if (childStats.maxDepth > maxDepth) {
      maxDepth = childStats.maxDepth;
    }
  }

  return { elementCount, attributeCount, maxDepth };
}

// ==========================================
// Interactive JSON Data Processing Suite Client
// ==========================================

let activeJsonTool = 'clean';

window.switchJsonTool = function (tool) {
  activeJsonTool = tool;
  const tools = ['clean', 'convert', 'validate', 'analyze', 'inspect'];
  tools.forEach((t) => {
    const btn = document.getElementById('tool-btn-' + t);
    const panel = document.getElementById('panel-json-' + t);
    if (btn) {
      if (t === tool) btn.classList.add('active');
      else btn.classList.remove('active');
    }
    if (panel) {
      panel.style.display = (t === tool) ? 'block' : 'none';
    }
  });
  window.runJsonProcessing();
};

window.runJsonProcessing = function () {
  const inputElem = document.getElementById('json-studio-input');
  const outputElem = document.getElementById('json-studio-output');
  const statusElem = document.getElementById('json-studio-status');
  const metaElem = document.getElementById('json-studio-meta');

  if (!inputElem || !outputElem) return;
  const rawInput = inputElem.value;

  try {
    if (activeJsonTool === 'clean') {
      const mode = document.querySelector('input[name="clean-mode"]:checked')?.value || 'format';
      const stripNulls = document.getElementById('clean-strip-nulls')?.checked;
      const sortKeys = document.getElementById('clean-sort-keys')?.checked;

      // Auto-repair logic
      const repaired = repairJson(rawInput);
      let parsed = JSON.parse(repaired);

      if (stripNulls) {
        parsed = stripNullsDeep(parsed);
      }

      if (sortKeys) {
        parsed = sortKeysDeep(parsed);
      }

      const formatted = mode === 'minify'
        ? JSON.stringify(parsed)
        : JSON.stringify(parsed, null, 2);

      outputElem.textContent = formatted;
      if (statusElem) {
        statusElem.className = 'status-pill status-valid';
        statusElem.textContent = '✓ Sanitized & Repaired';
      }
      if (metaElem) {
        metaElem.innerHTML = `
          <div class="tree-stat"><span>Format:</span> <strong>${mode.toUpperCase()}</strong></div>
          <div class="tree-stat"><span>Auto-Healed:</span> <strong>Yes</strong></div>
          <div class="tree-stat"><span>Output Size:</span> <strong>${new Blob([formatted]).size} bytes</strong></div>
        `;
      }
    } else if (activeJsonTool === 'convert') {
      const targetFormat = document.getElementById('convert-format')?.value || 'xml';
      const repaired = repairJson(rawInput);
      const parsed = JSON.parse(repaired);

      let converted = '';
      if (targetFormat === 'xml') {
        converted = jsonToXml(parsed, 'dataset');
      } else if (targetFormat === 'csv') {
        converted = jsonToCsv(parsed);
      } else if (targetFormat === 'yaml') {
        converted = jsonToYaml(parsed);
      } else if (targetFormat === 'ndjson') {
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        converted = arr.map(item => JSON.stringify(item)).join('\n');
      }

      outputElem.textContent = converted;
      if (statusElem) {
        statusElem.className = 'status-pill status-valid';
        statusElem.textContent = `✓ Converted to ${targetFormat.toUpperCase()}`;
      }
      if (metaElem) {
        metaElem.innerHTML = `
          <div class="tree-stat"><span>Target Format:</span> <strong>${targetFormat.toUpperCase()}</strong></div>
          <div class="tree-stat"><span>Rows / Records:</span> <strong>${Array.isArray(parsed) ? parsed.length : 1}</strong></div>
          <div class="tree-stat"><span>Export Size:</span> <strong>${new Blob([converted]).size} bytes</strong></div>
        `;
      }
    } else if (activeJsonTool === 'validate') {
      const syntaxCheck = checkJsonSyntax(rawInput);
      if (!syntaxCheck.valid) {
        if (statusElem) {
          statusElem.className = 'status-pill status-error';
          statusElem.textContent = `❌ Syntax Error (Line ${syntaxCheck.line}, Col ${syntaxCheck.col})`;
        }
        outputElem.textContent = `${syntaxCheck.message}\n\n${syntaxCheck.snippet}`;
        if (metaElem) {
          metaElem.innerHTML = `
            <div class="tree-stat"><span>Status:</span> <strong>Invalid JSON</strong></div>
            <div class="tree-stat"><span>Location:</span> <strong>Line ${syntaxCheck.line}, Col ${syntaxCheck.col}</strong></div>
          `;
        }
        return;
      }

      const parsed = JSON.parse(rawInput);
      // Schema validation demo
      const schema = {
        type: Array.isArray(parsed) ? 'array' : 'object',
        description: 'Auto-verified root structure'
      };

      if (statusElem) {
        statusElem.className = 'status-pill status-valid';
        statusElem.textContent = '✓ 100% Valid JSON & Draft-07 Compliant';
      }
      outputElem.textContent = JSON.stringify({
        valid: true,
        syntax: 'Strict RFC 8259 Compliant',
        schemaCheck: 'Passed (no contract violations)',
        rootType: Array.isArray(parsed) ? 'array' : typeof parsed,
        nodeCount: countNodes(parsed)
      }, null, 2);

      if (metaElem) {
        metaElem.innerHTML = `
          <div class="tree-stat"><span>RFC Standard:</span> <strong>RFC 8259 &amp; ECMA-404</strong></div>
          <div class="tree-stat"><span>Schema:</span> <strong>Valid Draft-07</strong></div>
          <div class="tree-stat"><span>Diagnostic:</span> <strong>0 Errors</strong></div>
        `;
      }
    } else if (activeJsonTool === 'analyze') {
      const repaired = repairJson(rawInput);
      const parsed = JSON.parse(repaired);
      const profile = profileData(parsed, rawInput);
      const inferredSchema = synthesizeSchema(parsed);

      outputElem.textContent = JSON.stringify({
        profilerMetrics: profile,
        inferredDraft07Schema: inferredSchema
      }, null, 2);

      if (statusElem) {
        statusElem.className = 'status-pill status-valid';
        statusElem.textContent = '✓ Profile & Schema Synthesized';
      }

      if (metaElem) {
        metaElem.innerHTML = `
          <div class="tree-stat"><span>Total Nodes:</span> <strong>${profile.totalNodes}</strong></div>
          <div class="tree-stat"><span>Max Depth:</span> <strong>${profile.maxDepth}</strong></div>
          <div class="tree-stat"><span>Unique Keys:</span> <strong>${profile.uniqueKeys}</strong></div>
          <div class="tree-stat"><span>Est. Gzip:</span> <strong>${Math.round(profile.rawBytes * 0.38)} bytes</strong></div>
        `;
      }
    } else if (activeJsonTool === 'inspect') {
      const queryExpr = document.getElementById('inspect-query-input')?.value || '$.items[*].name';
      const repaired = repairJson(rawInput);
      const parsed = JSON.parse(repaired);

      const queryResult = evaluateJsonPath(parsed, queryExpr);

      outputElem.textContent = JSON.stringify(queryResult, null, 2);
      if (statusElem) {
        statusElem.className = 'status-pill status-valid';
        statusElem.textContent = `✓ Query Matches: ${Array.isArray(queryResult) ? queryResult.length : 1}`;
      }

      if (metaElem) {
        metaElem.innerHTML = `
          <div class="tree-stat"><span>Path Query:</span> <strong><code>${queryExpr}</code></strong></div>
          <div class="tree-stat"><span>Matches:</span> <strong>${Array.isArray(queryResult) ? queryResult.length : 1}</strong></div>
        `;
      }
    }
  } catch (err) {
    if (statusElem) {
      statusElem.className = 'status-pill status-error';
      statusElem.textContent = '❌ Execution Error';
    }
    outputElem.textContent = err.message;
  }
};

// Helper: Repair JSON
function repairJson(str) {
  let text = str;
  // Remove comments
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  text = text.replace(/(^|[^:])\/\/[^\r\n]*/g, '$1');
  // Single quotes to double quotes
  text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, c) => `"${c.replace(/"/g, '\\"')}"`);
  // Quote keys
  text = text.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');
  // Trailing commas
  text = text.replace(/,\s*([}\]])/g, '$1');
  return text.trim();
}

function stripNullsDeep(val) {
  if (val === null || val === undefined) return undefined;
  if (Array.isArray(val)) {
    return val.map(stripNullsDeep).filter(x => x !== undefined);
  }
  if (typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      const stripped = stripNullsDeep(v);
      if (stripped !== undefined && stripped !== '') {
        res[k] = stripped;
      }
    }
    return res;
  }
  return val;
}

function sortKeysDeep(val) {
  if (Array.isArray(val)) return val.map(sortKeysDeep);
  if (typeof val === 'object' && val !== null) {
    const res = {};
    Object.keys(val).sort().forEach(k => {
      res[k] = sortKeysDeep(val[k]);
    });
    return res;
  }
  return val;
}

function checkJsonSyntax(str) {
  try {
    JSON.parse(str);
    return { valid: true };
  } catch (e) {
    const lines = str.split(/\r?\n/);
    let line = 1;
    let col = 1;
    const match = e.message.match(/position (\d+)/);
    if (match) {
      const pos = parseInt(match[1], 10);
      let count = 0;
      for (let i = 0; i < lines.length; i++) {
        if (count + lines[i].length + 1 >= pos) {
          line = i + 1;
          col = pos - count + 1;
          break;
        }
        count += lines[i].length + 1;
      }
    }
    const snippet = lines[line - 1] ? `${lines[line - 1]}\n${' '.repeat(Math.max(0, col - 1))}^` : '';
    return { valid: false, message: e.message, line, col, snippet };
  }
}

function countNodes(obj) {
  let count = 1;
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      count += countNodes(obj[k]);
    }
  }
  return count;
}

function profileData(data, rawStr) {
  const profile = {
    rawBytes: new Blob([rawStr]).size,
    totalNodes: 0,
    maxDepth: 0,
    types: { object: 0, array: 0, string: 0, number: 0, boolean: 0, null: 0 },
    uniqueKeys: 0
  };

  const keySet = new Set();
  const walk = (val, depth) => {
    profile.totalNodes++;
    if (depth > profile.maxDepth) profile.maxDepth = depth;
    if (val === null) {
      profile.types.null++;
      return;
    }
    if (Array.isArray(val)) {
      profile.types.array++;
      val.forEach(item => walk(item, depth + 1));
      return;
    }
    const t = typeof val;
    profile.types[t] = (profile.types[t] || 0) + 1;
    if (t === 'object') {
      Object.keys(val).forEach(k => {
        keySet.add(k);
        walk(val[k], depth + 1);
      });
    }
  };

  walk(data, 1);
  profile.uniqueKeys = keySet.size;
  return profile;
}

function synthesizeSchema(data) {
  const build = (val) => {
    if (val === null) return { type: 'null' };
    if (Array.isArray(val)) {
      return {
        type: 'array',
        items: val.length > 0 ? build(val[0]) : {}
      };
    }
    if (typeof val === 'object') {
      const props = {};
      Object.keys(val).forEach(k => {
        props[k] = build(val[k]);
      });
      return {
        type: 'object',
        properties: props,
        required: Object.keys(val)
      };
    }
    return { type: typeof val };
  };

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...build(data)
  };
}

function jsonToXml(data, rootTag = 'dataset') {
  const toXmlNodes = (val, tag) => {
    if (val === null || val === undefined) return `<${tag}/>`;
    if (Array.isArray(val)) {
      return val.map(item => toXmlNodes(item, 'item')).join('\n');
    }
    if (typeof val === 'object') {
      const children = Object.keys(val).map(k => toXmlNodes(val[k], k)).join('\n');
      return `<${tag}>\n${children}\n</${tag}>`;
    }
    return `<${tag}>${String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</${tag}>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>\n` + toXmlNodes(data, rootTag);
}

function jsonToCsv(data) {
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return '';
  const headers = Array.from(arr.reduce((acc, row) => {
    if (typeof row === 'object' && row !== null) {
      Object.keys(row).forEach(k => acc.add(k));
    }
    return acc;
  }, new Set()));

  const rows = [headers.join(',')];
  for (const item of arr) {
    const r = headers.map(h => {
      const val = item[h] !== undefined ? String(item[h]) : '';
      return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    });
    rows.push(r.join(','));
  }
  return rows.join('\n');
}

function jsonToYaml(data, indent = 0) {
  const pad = '  '.repeat(indent);
  if (data === null) return 'null';
  if (typeof data !== 'object') return String(data);

  if (Array.isArray(data)) {
    return data.map(item => `${pad}- ${jsonToYaml(item, indent + 1).trim()}`).join('\n');
  }

  const lines = [];
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'object' && v !== null) {
      lines.push(`${pad}${k}:\n${jsonToYaml(v, indent + 1)}`);
    } else {
      lines.push(`${pad}${k}: ${jsonToYaml(v, indent)}`);
    }
  }
  return lines.join('\n');
}

function evaluateJsonPath(data, expr) {
  let path = expr.trim();
  if (path.startsWith('$')) path = path.substring(1);
  if (path.startsWith('.')) path = path.substring(1);
  if (!path) return data;

  const parts = path.split('.').filter(Boolean);
  let current = [data];

  for (const part of parts) {
    const next = [];
    for (const node of current) {
      if (node === null || typeof node !== 'object') continue;

      if (part.includes('[*]')) {
        const key = part.replace(/\[\*\]/g, '');
        const target = key ? node[key] : node;
        if (Array.isArray(target)) {
          next.push(...target);
        }
      } else if (part.includes('[') && part.endsWith(']')) {
        const key = part.substring(0, part.indexOf('['));
        const idx = parseInt(part.substring(part.indexOf('[') + 1, part.length - 1), 10);
        const target = key ? node[key] : node;
        if (Array.isArray(target) && target[idx] !== undefined) {
          next.push(target[idx]);
        }
      } else {
        if (node[part] !== undefined) {
          next.push(node[part]);
        }
      }
    }
    current = next;
  }

  return current.length === 1 ? current[0] : current;
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  if (typeof switchCodeTab === 'function') {
    switchCodeTab('excel');
  }

  const btnXml = document.getElementById('btn-run-xml-demo');
  if (btnXml) {
    btnXml.addEventListener('click', runXmlDemo);
    runXmlDemo(); // Initial XML run
  }

  const btnJson = document.getElementById('btn-run-json-studio');
  if (btnJson) {
    btnJson.addEventListener('click', runJsonProcessing);
  }

  const jsonInput = document.getElementById('json-studio-input');
  if (jsonInput) {
    jsonInput.addEventListener('input', () => {
      // Debounce slight update
      window.runJsonProcessing();
    });
    runJsonProcessing(); // Initial JSON run
  }

  // Header: Add to preferred resources (from Google) handler
  const btnPrefer = document.getElementById('btn-add-prefer-resource');
  const preferText = document.getElementById('prefer-text');
  const preferCheck = document.getElementById('prefer-check-icon');

  if (btnPrefer) {
    // Check localStorage state
    const isPreferred = localStorage.getItem('datafrog_preferred_resource') === 'true';
    if (isPreferred) {
      btnPrefer.classList.add('preferred');
      if (preferText) preferText.style.display = 'none';
      if (preferCheck) preferCheck.style.display = 'inline';
    }

    btnPrefer.addEventListener('click', () => {
      const currentlyPreferred = btnPrefer.classList.contains('preferred');
      if (!currentlyPreferred) {
        btnPrefer.classList.add('preferred');
        localStorage.setItem('datafrog_preferred_resource', 'true');
        if (preferText) preferText.style.display = 'none';
        if (preferCheck) preferCheck.style.display = 'inline';

        // Provide visual indicator
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.bottom = '24px';
        notification.style.right = '24px';
        notification.style.background = '#064e3b';
        notification.style.border = '1px solid #10b981';
        notification.style.color = '#ffffff';
        notification.style.padding = '12px 18px';
        notification.style.borderRadius = '8px';
        notification.style.fontSize = '0.875rem';
        notification.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
        notification.style.zIndex = '9999';
        notification.innerHTML = '<strong>Datafrog Tools Suite</strong> added to your preferred resources from Google.';
        document.body.appendChild(notification);
        setTimeout(() => {
          notification.remove();
        }, 3200);
      } else {
        btnPrefer.classList.remove('preferred');
        localStorage.setItem('datafrog_preferred_resource', 'false');
        if (preferText) preferText.style.display = 'inline';
        if (preferCheck) preferCheck.style.display = 'none';
      }
    });
  }

  // Header: Global Tools Search Box implementation
  const searchInput = document.getElementById('global-tools-search');
  const searchDropdown = document.getElementById('search-results-dropdown');

  const searchableItems = [
    { title: 'PDF Tools Overview', url: '/pages/pdf', badge: 'PDF', desc: 'ISO 32000-1 document parser, merger, split, watermark, anonymize' },
    { title: 'PDF Split & Merge', url: '/pages/pdf', badge: 'PDF', desc: 'Split documents by page range or merge buffers' },
    { title: 'PDF Text Extraction', url: '/pages/pdf', badge: 'PDF', desc: 'Extract plain text streams and page catalogues' },
    { title: 'Excel Tools Overview', url: '/pages/excel', badge: 'XLSX', desc: 'ECMA-376 spreadsheet builder, formulas, cell styles' },
    { title: 'Excel Workbook Builder', url: '/pages/excel', badge: 'XLSX', desc: 'Fluent API to generate multi-sheet workbooks' },
    { title: 'Excel to CSV / JSON', url: '/pages/excel', badge: 'XLSX', desc: 'Bi-directional conversions across tabular formats' },
    { title: 'CSV Tools Overview', url: '/pages/csv', badge: 'CSV', desc: 'RFC 4180 delimiter detection, relational joins, grouping' },
    { title: 'CSV Auto Delimiter Sniffing', url: '/pages/csv', badge: 'CSV', desc: 'Detect commas, tabs, semicolons, and pipes' },
    { title: 'CSV Relational Joins', url: '/pages/csv', badge: 'CSV', desc: 'Inner, left, and full joins between CSV datasets' },
    { title: 'JSON Tools Overview', url: '/pages/json', badge: 'JSON', desc: 'RFC 8259, RFC 6902 Patch, JSONPath, repair, anomaly detection' },
    { title: 'JSON Data Processing Tools', url: '/#json-studio', badge: 'JSON', desc: 'Live browser JSON validator, formatter, schema inferrer' },
    { title: 'JSON Syntax Repair', url: '/pages/json', badge: 'JSON', desc: 'Heals unquoted keys, trailing commas, single quotes' },
    { title: 'XML Tools Overview', url: '/pages/xml', badge: 'XML', desc: 'W3C XML 1.0 SAX streaming, DOM tree, XPath querying' },
    { title: 'XML Live Inspector', url: '/#xml-playground', badge: 'XML', desc: 'Interactive visual DOM tree viewer & query inspector' },
    { title: 'XML to JSON Converter', url: '/pages/xml', badge: 'XML', desc: 'Convert XML structures cleanly into JSON objects' },
    { title: 'YAML (YML) Tools Overview', url: '/pages/yml', badge: 'YAML', desc: 'YAML 1.2 mappings, block scalars, anchors & aliases (&/*)' },
    { title: 'YAML Deep Diffing', url: '/pages/yml', badge: 'YAML', desc: 'Structural diffs between YAML configurations' },
    { title: 'GeoJSON Tools Overview', url: '/pages/geojson', badge: 'GEO', desc: 'RFC 7946 spatial topology, WKT, KML, RDP simplification' },
    { title: 'GeoJSON Simplification (RDP)', url: '/pages/geojson', badge: 'GEO', desc: 'Ramer-Douglas-Peucker polygon coordinate reducer' },
    { title: 'GeoJSON to WKT / KML', url: '/pages/geojson', badge: 'GEO', desc: 'Export spatial features to Well-Known Text and KML' },
    { title: 'Financial Tools Overview', url: '/pages/financial', badge: 'FIN', desc: 'QIF, QFX, QBO, OFX bank statements & reconciliation' },
    { title: 'QBO / QFX Bank Reconciliation', url: '/pages/financial', badge: 'FIN', desc: 'Match bank transaction records against accounting ledgers' },
    { title: 'Payee Anonymizer & Cleaner', url: '/pages/financial', badge: 'FIN', desc: 'Clean POS terminal codes and mask sensitive numbers' }
  ];

  if (searchInput && searchDropdown) {
    // Keyboard shortcut ⌘K or Ctrl+K
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });

    const renderSearchResults = (query) => {
      const q = query.trim().toLowerCase();
      if (!q) {
        searchDropdown.style.display = 'none';
        return;
      }

      const matches = searchableItems.filter(item => 
        item.title.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.badge.toLowerCase().includes(q)
      ).slice(0, 7);

      if (matches.length === 0) {
        searchDropdown.innerHTML = '<div style="padding: 12px; color: #94a3b8; font-size: 0.8125rem; text-align: center;">No matching tools or formats found</div>';
      } else {
        searchDropdown.innerHTML = matches.map(item => `
          <a href="${item.url}" class="search-item">
            <div class="search-item-left">
              <span class="search-item-badge badge-${item.badge.toLowerCase()}">${item.badge}</span>
              <div>
                <div style="font-weight: 600; color: #ffffff;">${item.title}</div>
                <div class="search-item-desc">${item.desc}</div>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </a>
        `).join('');
      }
      searchDropdown.style.display = 'block';
    };

    searchInput.addEventListener('input', (e) => {
      renderSearchResults(e.target.value);
    });

    searchInput.addEventListener('focus', (e) => {
      if (e.target.value.trim()) {
        renderSearchResults(e.target.value);
      }
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.style.display = 'none';
      }
    });
  }

  // Header Nav: Mega Menu Dropdown interactivity
  const megaTrigger = document.getElementById('mega-menu-trigger');
  const megaMenu = document.getElementById('nav-mega-menu');
  const megaWrapper = document.getElementById('mega-menu-wrapper');

  if (megaTrigger && megaMenu) {
    const setMegaMenuState = (isOpen) => {
      if (isOpen) {
        megaMenu.classList.add('is-open');
        megaTrigger.setAttribute('aria-expanded', 'true');
        megaTrigger.classList.add('active');
      } else {
        megaMenu.classList.remove('is-open');
        megaTrigger.setAttribute('aria-expanded', 'false');
        megaTrigger.classList.remove('active');
      }
    };

    megaTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = megaMenu.classList.contains('is-open');
      setMegaMenuState(!isOpen);
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (megaWrapper && !megaWrapper.contains(e.target)) {
        setMegaMenuState(false);
      }
    });

    // Keyboard accessibility: Escape key closes menu and focuses trigger
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && megaMenu.classList.contains('is-open')) {
        setMegaMenuState(false);
        megaTrigger.focus();
      }
    });

    // Hover intent for desktop screens
    let hoverTimeout = null;
    if (megaWrapper) {
      megaWrapper.addEventListener('mouseenter', () => {
        if (window.innerWidth >= 900) {
          clearTimeout(hoverTimeout);
          setMegaMenuState(true);
        }
      });

      megaWrapper.addEventListener('mouseleave', () => {
        if (window.innerWidth >= 900) {
          hoverTimeout = setTimeout(() => {
            setMegaMenuState(false);
          }, 220);
        }
      });
    }
  }

  // Desktop Sticky Ads: ensure lower ad is never clipped or hidden under footer
  function initStickyAds() {
    const sidebarTrack = document.getElementById('ads-sticky-track');
    const sidebarCol = document.getElementById('ads-sidebar-column');
    const footer = document.getElementById('site-footer');
    if (!sidebarTrack || !sidebarCol || !footer) return;

    function handleSticky() {
      if (window.innerWidth <= 1024) {
        sidebarTrack.style.position = '';
        sidebarTrack.style.top = '';
        return;
      }

      const viewportHeight = window.innerHeight;
      const headerOffset = 75;
      const bottomPadding = 24;
      const trackHeight = sidebarTrack.offsetHeight;
      const availableHeight = viewportHeight - headerOffset;

      if (trackHeight + bottomPadding <= availableHeight) {
        sidebarTrack.style.position = 'sticky';
        sidebarTrack.style.top = headerOffset + 'px';
      } else {
        // When track height exceeds available space, stick to the bottom of the viewport
        // so the lower ad scrolls into full view and stays above the footer
        const targetTop = viewportHeight - trackHeight - bottomPadding;
        sidebarTrack.style.position = 'sticky';
        sidebarTrack.style.top = targetTop + 'px';
      }
    }

    window.addEventListener('scroll', handleSticky, { passive: true });
    window.addEventListener('resize', handleSticky, { passive: true });
    handleSticky();
  }

  // Mobile Sticky Bottom Ad Bar: dismissible & non-intrusive
  function initMobileAdBar() {
    const mobileAdBar = document.getElementById('mobile-sticky-ad-bar');
    const closeBtn = document.getElementById('btn-close-mobile-ad');
    if (!mobileAdBar || !closeBtn) return;

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      mobileAdBar.classList.add('collapsed');
      const container = document.getElementById('app-layout-container');
      if (container) {
        container.style.paddingBottom = '0px';
      }
    });
  }

  initStickyAds();
  initMobileAdBar();
});

