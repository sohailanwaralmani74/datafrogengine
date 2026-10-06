/**
 * DataFrog structural PDF editor.
 *
 * The editor deliberately does NOT render a PDF page as a background image and
 * does NOT place editable text over fixed coordinates. A PDF is reconstructed
 * into a normal document model: pages -> flow blocks -> paragraphs -> styled
 * inline runs/images. The browser editor is ordinary contenteditable HTML.
 *
 * The PDF engine remains responsible for reading the source PDF and writing
 * the edited PDF. No document data leaves the browser.
 */
import { PdfEngine } from './PdfEngine.js';
import { PdfFontMetrics } from '../builder/PdfFontMetrics.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

class PdfWordDocument {
  constructor() {
    this.pages = [];
    this.fileName = 'edited.pdf';
  }

  static fromPdf(pdf, fileName) {
    const model = new PdfWordDocument();
    model.fileName = fileName.replace(/\.pdf$/i, '') + '-edited.pdf';

    for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex++) {
      model.pages.push(PdfWordDocument.parsePage(pdf, pageIndex));
    }
    return model;
  }

  static parsePage(pdf, pageIndex) {
    const page = pdf.getPage(pageIndex);
    const size = page.getSize();
    const items = (PdfEngine.extractTextItems(pdf, pageIndex) || [])
      .filter(x => String(x?.text || '').trim() !== '')
      .map(x => ({ ...x }));

    const images = (PdfEngine.extractImages(pdf, pageIndex) || [])
      .filter(x => x?.position && x.width > 0 && x.height > 0);

    const lines = PdfWordDocument.makeLines(items);
    const columns = PdfWordDocument.detectColumns(lines, size.width);
    const blocks = [];

    for (const column of columns) {
      const columnLines = lines
        .filter(line => line.x >= column.left - 2 && line.x <= column.right + 2)
        .sort((a, b) => b.y - a.y);

      blocks.push(...PdfWordDocument.makeParagraphs(columnLines, size));
    }

    for (const image of images) {
      const p = image.position;
      blocks.push({
        type: 'image',
        y: p.y + p.height,
        x: p.x,
        width: p.width,
        height: p.height,
        align: PdfWordDocument.imageAlign(p, size.width),
        image
      });
    }

    blocks.sort((a, b) => {
      const ay = Number(a.y || 0);
      const by = Number(b.y || 0);
      if (Math.abs(by - ay) > 1) return by - ay;
      return Number(a.x || 0) - Number(b.x || 0);
    });

    const bounds = PdfWordDocument.contentBounds(blocks, size);
    return {
      width: size.width,
      height: size.height,
      rotation: page.getRotation(),
      margin: bounds.margin,
      blocks,
      sourceHasText: items.length > 0,
      sourceHasImages: images.length > 0
    };
  }

  static makeLines(items) {
    const sorted = [...items].sort((a, b) => {
      const ay = Number(a.y || 0);
      const by = Number(b.y || 0);
      if (Math.abs(by - ay) > 1) return by - ay;
      return Number(a.x || 0) - Number(b.x || 0);
    });

    const lines = [];
    for (const item of sorted) {
      const y = Number(item.y || 0);
      const h = Math.max(1, Number(item.height || item.fontSize || 12));
      let line = null;

      for (const candidate of lines) {
        const tolerance = Math.max(2.2, Math.min(h, candidate.height) * 0.55);
        if (Math.abs(candidate.y - y) <= tolerance) {
          line = candidate;
          break;
        }
      }

      if (!line) {
        line = { y, height: h, x: Number(item.x || 0), items: [] };
        lines.push(line);
      }

      line.items.push(item);
      line.height = Math.max(line.height, h);
      line.x = Math.min(line.x, Number(item.x || 0));
    }

    for (const line of lines) {
      line.items.sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
      line.right = Math.max(...line.items.map(i => Number(i.x || 0) + Number(i.width || 0)));
      line.center = (line.x + line.right) / 2;
    }

    return lines.sort((a, b) => b.y - a.y);
  }

  static detectColumns(lines, pageWidth) {
    if (lines.length < 5) {
      return [{ left: 0, right: pageWidth }];
    }

    const starts = lines.map(l => l.x).sort((a, b) => a - b);
    let largestGap = 0;
    let split = null;

    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1];
      if (gap > largestGap) {
        largestGap = gap;
        split = (starts[i] + starts[i - 1]) / 2;
      }
    }

    // A genuine second column normally has a substantial horizontal gap.
    if (!split || largestGap < Math.max(55, pageWidth * 0.10)) {
      return [{ left: 0, right: pageWidth }];
    }

    const leftCount = lines.filter(l => l.x < split).length;
    const rightCount = lines.length - leftCount;
    if (leftCount < 3 || rightCount < 3) {
      return [{ left: 0, right: pageWidth }];
    }

    const leftMax = Math.max(...lines.filter(l => l.x < split).map(l => l.right));
    const rightMin = Math.min(...lines.filter(l => l.x >= split).map(l => l.x));

    if (rightMin - leftMax < Math.max(18, pageWidth * 0.025)) {
      return [{ left: 0, right: pageWidth }];
    }

    return [
      { left: 0, right: split },
      { left: split, right: pageWidth }
    ];
  }

  static makeParagraphs(lines, size) {
    if (!lines.length) return [];
    const paragraphs = [];
    let current = null;

    for (const line of lines) {
      const first = line.items[0];
      const fontSize = Number(first?.fontSize || 12);
      const avgSize = line.items.reduce((s, x) => s + Number(x.fontSize || fontSize), 0) / line.items.length;
      const gap = current ? Math.abs(current.lastY - line.y) : Infinity;
      const baselineStep = current ? Math.max(current.lastHeight, line.height) * 1.55 : Infinity;
      const leftShift = current ? Math.abs(line.x - current.firstX) : 0;
      const fontShift = current ? Math.abs(avgSize - current.avgSize) : 0;

      const likelyNewParagraph = !current ||
        gap > baselineStep ||
        leftShift > Math.max(12, fontSize * 1.8) ||
        fontShift > Math.max(3, fontSize * 0.28);

      if (likelyNewParagraph) {
        current = {
          type: 'paragraph',
          y: line.y,
          x: line.x,
          firstX: line.x,
          lastY: line.y,
          lastHeight: line.height,
          avgSize,
          lines: [line]
        };
        paragraphs.push(current);
      } else {
        current.lines.push(line);
        current.lastY = line.y;
        current.lastHeight = line.height;
        current.avgSize = (current.avgSize + avgSize) / 2;
      }
    }

    return paragraphs.map(p => PdfWordDocument.paragraphFromLines(p, size));
  }

  static paragraphFromLines(group, size) {
    const firstLine = group.lines[0];
    const firstItem = firstLine.items[0];
    const fontSize = Number(firstItem?.fontSize || 12);

    const runs = [];
    let paragraphText = '';
    let previousLine = null;

    for (const line of group.lines) {
      const lineRuns = PdfWordDocument.lineRuns(line);
      let lineText = '';
      for (const run of lineRuns) {
        lineText += run.text;
      }

      if (previousLine) {
        const prevText = previousLine.text;
        const hyphenated = /[\\-]$/.test(prevText) && /^[A-Za-zÀ-ÖØ-öø-ÿ]/.test(lineText);
        paragraphText += hyphenated ? '' : ' ';
      }
      paragraphText += lineText;

      // Preserve style changes as real inline runs. A single space between
      // lines is represented in the same run as the next text where possible.
      for (const run of lineRuns) {
        const last = runs[runs.length - 1];
        if (last && PdfWordDocument.sameStyle(last.style, run.style)) {
          last.text += (last._lineEnd ? ' ' : '') + run.text;
          delete last._lineEnd;
        } else {
          runs.push({ text: run.text, style: { ...run.style } });
        }
      }
      if (runs.length) runs[runs.length - 1]._lineEnd = true;
      previousLine = { text: lineText };
    }

    const cleanRuns = runs.map(r => {
      const out = { text: r.text, style: r.style };
      delete out._lineEnd;
      return out;
    }).filter(r => r.text.length);

    const left = Math.min(...group.lines.map(l => l.x));
    const right = Math.max(...group.lines.map(l => l.right));
    const center = (left + right) / 2;
    const pageCenter = size.width / 2;
    let align = 'left';

    if (Math.abs(center - pageCenter) < Math.max(12, fontSize * 1.2) && (right - left) < size.width * 0.85) {
      align = 'center';
    } else if (Math.abs(right - size.width) < Math.max(20, fontSize * 1.4) && left > size.width * 0.18) {
      align = 'right';
    }

    const firstSize = Number(firstItem?.fontSize || fontSize);
    const allCaps = paragraphText.length > 3 && paragraphText === paragraphText.toUpperCase();
    const heading = firstSize >= 15 || (allCaps && firstSize >= 12.5);

    return {
      type: 'paragraph',
      y: group.lines[0].y,
      x: left,
      text: paragraphText,
      runs: cleanRuns,
      align,
      heading,
      fontSize,
      spacingAfter: Math.max(4, Math.min(18, (group.lastHeight || fontSize) * 0.35)),
      indent: Math.max(0, left - group.firstX),
      lineCount: group.lines.length
    };
  }

  static lineRuns(line) {
    const runs = [];
    for (const item of line.items) {
      const text = String(item.text || '');
      if (!text) continue;

      const style = {
        font: PdfWordDocument.pdfFontName(item.fontName || item.fontBaseName),
        size: Number(item.fontSize || 12),
        color: Array.isArray(item.color) ? item.color.slice(0, 3) : [0, 0, 0],
        bold: /bold/i.test(item.fontName || item.fontBaseName || ''),
        italic: /italic|oblique/i.test(item.fontName || item.fontBaseName || ''),
        underline: false
      };

      let value = text;
      const previous = runs[runs.length - 1];
      if (previous) {
        const previousItem = previous._item;
        const gap = Number(item.x || 0) -
          (Number(previousItem.x || 0) + Number(previousItem.width || 0));
        const avg = Number(previousItem.width || 0) /
          Math.max(1, String(previousItem.text || '').length);

        if (gap > Math.max(1.2, avg * 0.28) &&
            !previous.text.endsWith(' ') && !value.startsWith(' ')) {
          previous.text += ' ';
        }
      }

      runs.push({ text: value, style, _item: item });
    }

    return runs.map(r => {
      const out = { text: r.text, style: r.style };
      return out;
    });
  }

  static sameStyle(a, b) {
    return a.font === b.font &&
      Math.abs(a.size - b.size) < 0.01 &&
      a.bold === b.bold &&
      a.italic === b.italic &&
      a.color.join(',') === b.color.join(',');
  }

  static pdfFontName(name) {
    const n = String(name || '').replace(/^\+/, '');
    if (/courier/i.test(n)) {
      if (/bold.*italic|italic.*bold/i.test(n)) return 'Courier-BoldOblique';
      if (/bold/i.test(n)) return 'Courier-Bold';
      if (/italic|oblique/i.test(n)) return 'Courier-Oblique';
      return 'Courier';
    }
    if (/times/i.test(n)) {
      if (/bold.*italic|italic.*bold/i.test(n)) return 'Times-BoldItalic';
      if (/bold/i.test(n)) return 'Times-Bold';
      if (/italic|oblique/i.test(n)) return 'Times-Italic';
      return 'Times-Roman';
    }
    if (/symbol/i.test(n)) return 'Symbol';
    if (/zapf/i.test(n)) return 'ZapfDingbats';
    if (/helvetica|arial|sans/i.test(n)) {
      if (/bold.*oblique|oblique.*bold|bold.*italic|italic.*bold/i.test(n)) return 'Helvetica-BoldOblique';
      if (/bold/i.test(n)) return 'Helvetica-Bold';
      if (/italic|oblique/i.test(n)) return 'Helvetica-Oblique';
      return 'Helvetica';
    }
    return 'Helvetica';
  }

  static imageAlign(position, pageWidth) {
    const center = position.x + position.width / 2;
    if (Math.abs(center - pageWidth / 2) < pageWidth * 0.08) return 'center';
    if (position.x > pageWidth * 0.55) return 'right';
    return 'left';
  }

  static contentBounds(blocks, size) {
    const text = blocks.filter(b => b.type === 'paragraph');
    const xs = text.flatMap(b => b.runs.map(r => r.text ? [b.x, b.x + Math.max(10, PdfWordDocument.textWidth(r.text, r.style))] : [])).flat();
    const ys = blocks.filter(b => b.type === 'paragraph').map(b => b.y);
    const left = xs.length ? Math.min(...xs) : 54;
    const right = xs.length ? Math.max(...xs) : size.width - 54;
    const topY = ys.length ? Math.max(...ys) : size.height - 54;
    const bottomY = ys.length ? Math.min(...ys) : 54;

    return {
      margin: {
        left: clamp(left, 20, Math.min(120, size.width * 0.25)),
        right: clamp(size.width - right, 20, Math.min(120, size.width * 0.25)),
        top: clamp(size.height - topY - 8, 20, Math.min(120, size.height * 0.25)),
        bottom: clamp(bottomY - 8, 20, Math.min(120, size.height * 0.25))
      }
    };
  }

  static textWidth(text, style) {
    return PdfFontMetrics.measureTextWidth(text, style.font, style.size);
  }
}

class PdfWordEditor {
  constructor() {
    this.fileInput = document.getElementById('pdf-word-file');
    this.upload = document.getElementById('pdf-word-upload');
    this.workspace = document.getElementById('pdf-word-workspace');
    this.documentEl = document.getElementById('pdf-word-document');
    this.thumbs = document.getElementById('pdf-word-thumbs');
    this.statusEl = document.getElementById('pdf-word-status');
    this.doc = null;
    this.fileName = 'edited.pdf';
    this.pageIndex = 0;
    this.history = [];
    this.future = [];
    this.savedSelection = null;
    this.bind();
  }

  bind() {
    document.getElementById('pdf-word-browse')?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', e => e.target.files?.[0] && this.load(e.target.files[0]));
    this.upload?.addEventListener('dragover', e => { e.preventDefault(); this.upload.classList.add('is-dragover'); });
    this.upload?.addEventListener('dragleave', () => this.upload.classList.remove('is-dragover'));
    this.upload?.addEventListener('drop', e => {
      e.preventDefault();
      this.upload.classList.remove('is-dragover');
      if (e.dataTransfer?.files?.[0]) this.load(e.dataTransfer.files[0]);
    });

    document.getElementById('pdf-word-download')?.addEventListener('click', () => this.save());
    document.getElementById('pdf-word-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('pdf-word-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('pdf-word-prev')?.addEventListener('click', () => this.goPage(this.pageIndex - 1));
    document.getElementById('pdf-word-next')?.addEventListener('click', () => this.goPage(this.pageIndex + 1));
    document.getElementById('pdf-word-bold')?.addEventListener('click', () => this.command('bold'));
    document.getElementById('pdf-word-italic')?.addEventListener('click', () => this.command('italic'));
    document.getElementById('pdf-word-underline')?.addEventListener('click', () => this.command('underline'));
    document.getElementById('pdf-word-align-left')?.addEventListener('click', () => this.command('justifyLeft'));
    document.getElementById('pdf-word-align-center')?.addEventListener('click', () => this.command('justifyCenter'));
    document.getElementById('pdf-word-align-right')?.addEventListener('click', () => this.command('justifyRight'));
    document.getElementById('pdf-word-align-justify')?.addEventListener('click', () => this.command('justifyFull'));

    document.getElementById('pdf-word-font-size')?.addEventListener('change', e => {
      this.restoreSelection();
      document.execCommand('fontSize', false, '7');
      this.replaceFontSize(e.target.value);
      this.saveSelection();
      this.changed();
    });

    document.getElementById('pdf-word-font')?.addEventListener('change', e => {
      this.restoreSelection();
      document.execCommand('fontName', false, e.target.value);
      this.saveSelection();
      this.changed();
    });

    document.addEventListener('selectionchange', () => this.saveSelection());
    this.documentEl?.addEventListener('input', () => this.changed());
    this.documentEl?.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '\\t');
      }
    });
  }

  async load(file) {
    if (!/\.pdf$/i.test(file.name)) return this.setStatus('Please choose a PDF file.');

    try {
      this.progress(true, 'Reading PDF…', 8);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = PdfEngine.load(bytes);
      this.progress(true, 'Rebuilding editable document…', 20);

      this.doc = PdfWordDocument.fromPdf(pdf, file.name);
      this.fileName = this.doc.fileName;
      this.pageIndex = 0;
      this.history = [];
      this.future = [];

      this.upload.style.display = 'none';
      this.workspace.style.display = 'block';
      this.render();
      this.history = [this.documentEl.innerHTML];
      this.future = [];
      this.updateControls();
      this.progress(false);

      const textPages = this.doc.pages.filter(p => p.sourceHasText).length;
      const scanPages = this.doc.pages.length - textPages;
      this.setStatus(scanPages
        ? `${this.doc.pages.length} pages loaded. ${scanPages} page(s) contain no editable text layer and are kept as non-editable content.`
        : 'PDF converted to an editable document.');
    } catch (error) {
      this.progress(false);
      this.setStatus('Could not open this PDF: ' + (error?.message || 'unsupported PDF'));
    }
  }

  render() {
    if (!this.documentEl || !this.doc) return;
    this.documentEl.innerHTML = '';

    const page = this.doc.pages[this.pageIndex];
    const el = this.createPage(page, this.pageIndex);
    this.documentEl.appendChild(el);
    this.renderThumbs();
    this.updateControls();
  }

  createPage(pageModel, pageIndex) {
    const page = document.createElement('section');
    page.className = 'df-word-page';
    page.dataset.pageIndex = pageIndex;
    page.style.width = pageModel.width + 'px';
    page.style.minHeight = pageModel.height + 'px';
    page.style.padding = `${pageModel.margin.top}px ${pageModel.margin.right}px ${pageModel.margin.bottom}px ${pageModel.margin.left}px`;

    const content = document.createElement('div');
    content.className = 'df-word-content';
    content.contentEditable = 'true';
    content.spellcheck = true;

    for (const block of pageModel.blocks) {
      if (block.type === 'image') {
        content.appendChild(this.createImage(block));
      } else {
        content.appendChild(this.createParagraph(block));
      }
    }

    if (!content.childNodes.length) {
      content.appendChild(document.createElement('p'));
    }

    page.appendChild(content);
    return page;
  }

  createParagraph(model) {
    const p = document.createElement('p');
    p.className = 'df-word-paragraph' + (model.heading ? ' df-word-heading' : '');
    p.dataset.blockType = 'paragraph';
    p.style.textAlign = model.align || 'left';
    p.style.marginTop = '0';
    p.style.marginBottom = model.spacingAfter + 'px';
    p.style.textIndent = model.indent ? model.indent + 'px' : '0';

    const runs = model.runs.length ? model.runs : [{ text: model.text, style: { font: 'Helvetica', size: 12, color: [0,0,0], bold:false, italic:false, underline:false } }];
    for (const run of runs) {
      const span = document.createElement('span');
      span.textContent = run.text;
      span.style.fontFamily = this.cssFont(run.style.font);
      span.style.fontSize = run.style.size + 'pt';
      span.style.color = this.cssColor(run.style.color);
      span.style.fontWeight = run.style.bold ? '700' : '400';
      span.style.fontStyle = run.style.italic ? 'italic' : 'normal';
      span.style.textDecoration = run.style.underline ? 'underline' : 'none';
      p.appendChild(span);
    }
    return p;
  }

  createImage(block) {
    const figure = document.createElement('div');
    figure.className = 'df-word-image-block';
    figure.contentEditable = 'false';
    figure.style.textAlign = block.align;

    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.src = block.image.toDataUrl();
    img.style.width = block.width + 'px';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.dataset.originalWidth = String(block.width);
    img.dataset.originalHeight = String(block.height);
    figure.appendChild(img);
    return figure;
  }

  cssFont(font) {
    if (/courier/i.test(font)) return '"Courier New", monospace';
    if (/times/i.test(font)) return '"Times New Roman", Georgia, serif';
    return 'Arial, Helvetica, sans-serif';
  }

  cssColor(c) {
    const r = Math.round(clamp(Number(c?.[0] || 0), 0, 1) * 255);
    const g = Math.round(clamp(Number(c?.[1] || 0), 0, 1) * 255);
    const b = Math.round(clamp(Number(c?.[2] || 0), 0, 1) * 255);
    return `rgb(${r} ${g} ${b})`;
  }

  command(command) {
    this.restoreSelection();
    document.execCommand(command, false, null);
    this.saveSelection();
    this.changed();
  }

  replaceFontSize(points) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const fragment = selection.getRangeAt(0).cloneContents();
    const wrapper = document.createElement('span');
    wrapper.appendChild(fragment);
    wrapper.querySelectorAll('*').forEach(el => el.style.fontSize = points + 'pt');
    const span = document.createElement('span');
    span.style.fontSize = points + 'pt';
    span.innerHTML = wrapper.innerHTML || selection.toString();
    document.execCommand('insertHTML', false, span.outerHTML);
  }

  saveSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!this.documentEl?.contains(range.commonAncestorContainer)) return;
    this.savedSelection = range.cloneRange();
  }

  restoreSelection() {
    if (!this.savedSelection) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(this.savedSelection);
  }

  changed() {
    this.history.push(this.documentEl.innerHTML);
    if (this.history.length > 60) this.history.shift();
    this.future = [];
    this.setStatus('Unsaved changes.');
  }

  undo() {
    if (this.history.length < 2) return;
    const current = this.history.pop();
    this.future.push(current);
    this.documentEl.innerHTML = this.history[this.history.length - 1];
    this.setStatus('Undid the last change.');
  }

  redo() {
    if (!this.future.length) return;
    const next = this.future.pop();
    this.history.push(next);
    this.documentEl.innerHTML = next;
    this.setStatus('Redid the last change.');
  }

  syncCurrentPage() {
    const pageEl = this.documentEl?.querySelector('.df-word-page');
    if (!pageEl || !this.doc) return;
    this.doc.pages[this.pageIndex].html = pageEl.querySelector('.df-word-content')?.innerHTML || '';
  }

  syncAllPages() {
    this.syncCurrentPage();
  }

  async goPage(index) {
    this.syncCurrentPage();
    this.pageIndex = clamp(index, 0, this.doc.pages.length - 1);
    this.render();
    this.history = [this.documentEl.innerHTML];
    this.future = [];
    this.updateControls();
  }

  renderThumbs() {
    if (!this.thumbs || !this.doc) return;
    this.thumbs.innerHTML = '';
    this.doc.pages.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i === this.pageIndex ? 'active' : '';
      b.textContent = 'Page ' + (i + 1);
      b.addEventListener('click', () => this.goPage(i));
      this.thumbs.appendChild(b);
    });
  }

  updateControls() {
    const label = document.getElementById('pdf-word-page-label');
    if (label) label.textContent = 'Page ' + (this.pageIndex + 1) + ' of ' + this.doc.pages.length;
    document.getElementById('pdf-word-prev')?.toggleAttribute('disabled', this.pageIndex === 0);
    document.getElementById('pdf-word-next')?.toggleAttribute('disabled', this.pageIndex === this.doc.pages.length - 1);
    document.getElementById('pdf-word-undo')?.toggleAttribute('disabled', this.history.length < 2);
    document.getElementById('pdf-word-redo')?.toggleAttribute('disabled', !this.future.length);
  }

  async save() {
    if (!this.doc) return;
    try {
      this.syncCurrentPage();
      this.progress(true, 'Creating edited PDF…', 10);
      const out = PdfEngine.create();

      for (let i = 0; i < this.doc.pages.length; i++) {
        this.progress(true, `Writing page ${i + 1} of ${this.doc.pages.length}…`, 10 + Math.round(i / this.doc.pages.length * 85));
        const model = this.doc.pages[i];
        const page = out.addPage(model.width, model.height);

        if (!model.html) {
          model.html = this.pageHtmlForIndex(i);
        }

        const content = document.createElement('div');
        content.innerHTML = model.html || '<p></p>';
        const modifier = page.getModifier();
        let cursor = model.height - model.margin.top;
        const maxWidth = model.width - model.margin.left - model.margin.right;

        for (const node of Array.from(content.children)) {
          if (node.classList.contains('df-word-image-block')) {
            const imgIndex = this.findImageIndex(model, node);
            if (imgIndex >= 0) {
              const block = model.blocks.filter(b => b.type === 'image')[imgIndex];
              const image = block.image;
              const width = Math.min(Number(node.querySelector('img')?.dataset.originalWidth || block.width), maxWidth);
              const height = Number(node.querySelector('img')?.dataset.originalHeight || block.height) * (width / block.width);
              cursor -= 6 + height;
              const x = node.style.textAlign === 'center'
                ? model.margin.left + (maxWidth - width) / 2
                : node.style.textAlign === 'right'
                  ? model.width - model.margin.right - width
                  : model.margin.left;
              modifier.drawImage(image, { x, y: cursor, width, height });
              cursor -= 6;
            }
            continue;
          }

          if (!/^P|H[1-6]$/.test(node.tagName)) continue;
          cursor = this.renderParagraph(modifier, node, cursor, model.margin.left, maxWidth);
        }
        modifier.commit();
      }

      const bytes = PdfEngine.save(out);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      this.progress(false);
      this.setStatus('PDF downloaded.');
    } catch (error) {
      this.progress(false);
      this.setStatus('Could not create the PDF: ' + (error?.message || 'PDF write error'));
    }
  }

  pageHtmlForIndex(index) {
    if (index === this.pageIndex) {
      return this.documentEl.querySelector('.df-word-content')?.innerHTML || '';
    }
    return this.doc.pages[index].html || '';
  }

  findImageIndex(model, node) {
    const all = Array.from(node.parentElement?.children || []);
    const imageNodes = all.filter(x => x.classList.contains('df-word-image-block'));
    return imageNodes.indexOf(node);
  }

  renderParagraph(modifier, p, cursor, x, width) {
    const align = p.style.textAlign || 'left';
    const spacingAfter = parseFloat(p.style.marginBottom || '6') || 6;
    const indent = parseFloat(p.style.textIndent || '0') || 0;
    const runs = this.domRuns(p);

    const tokens = [];
    for (const run of runs) {
      const parts = run.text.split(/(\\s+)/);
      for (const part of parts) {
        if (part === '') continue;
        tokens.push({ text: part, style: run.style });
      }
    }

    const lines = [];
    let line = [];
    let lineWidth = 0;
    const available = Math.max(10, width - indent);

    for (const token of tokens) {
      const tokenWidth = PdfFontMetrics.measureTextWidth(token.text, token.style.font, token.style.size);
      const isSpace = /^\\s+$/.test(token.text);
      if (!isSpace && line.length && lineWidth + tokenWidth > available) {
        lines.push({ tokens: line, width: lineWidth });
        line = [];
        lineWidth = 0;
      }
      if (isSpace && !line.length) continue;
      line.push(token);
      lineWidth += tokenWidth;
    }
    if (line.length) lines.push({ tokens: line, width: lineWidth });
    if (!lines.length) lines.push({ tokens: [], width: 0 });

    const baseSize = runs[0]?.style?.size || 12;
    const lineHeight = baseSize * 1.22;

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const last = i === lines.length - 1;
      let drawX = x + (i === 0 ? indent : 0);
      const usable = width - (i === 0 ? indent : 0);

      if (align === 'center') drawX = x + (width - ln.width) / 2;
      else if (align === 'right') drawX = x + width - ln.width;
      else if (align === 'justify' && !last) {
        // Word-like justification is approximated by expanding normal spaces.
        const spaces = ln.tokens.filter(t => /^\\s+$/.test(t.text)).length;
        const extra = spaces ? Math.max(0, (usable - ln.width) / spaces) : 0;
        let cx = drawX;
        for (const t of ln.tokens) {
          const w = PdfFontMetrics.measureTextWidth(t.text, t.style.font, t.style.size);
          if (!/^\\s+$/.test(t.text)) {
            modifier.drawText(t.text, { x: cx, y: cursor - lineHeight * 0.8, size: t.style.size, font: t.style.font, color: t.style.color });
          }
          cx += w + (/^\\s+$/.test(t.text) ? extra : 0);
        }
        cursor -= lineHeight;
        continue;
      }

      for (const t of ln.tokens) {
        if (/^\\s+$/.test(t.text)) {
          drawX += PdfFontMetrics.measureTextWidth(t.text, t.style.font, t.style.size);
          continue;
        }
        modifier.drawText(t.text, {
          x: drawX,
          y: cursor - lineHeight * 0.8,
          size: t.style.size,
          font: t.style.font,
          color: t.style.color
        });
        drawX += PdfFontMetrics.measureTextWidth(t.text, t.style.font, t.style.size);
      }
      cursor -= lineHeight;
    }

    return cursor - spacingAfter;
  }

  domRuns(p) {
    const out = [];
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue) {
          const parent = node.parentElement || p;
          const cs = getComputedStyle(parent);
          const bold = Number.parseInt(cs.fontWeight, 10) >= 600 || cs.fontWeight === 'bold';
          const italic = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique';
          const underline = String(cs.textDecorationLine || '').includes('underline');
          out.push({
            text: node.nodeValue,
            style: {
              font: this.pdfFontForComputed(cs.fontFamily, bold, italic),
              size: parseFloat(cs.fontSize) * 0.75 || 12,
              color: this.cssToRgb(cs.color),
              bold,
              italic,
              underline
            }
          });
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      for (const child of node.childNodes) walk(child);
    };
    walk(p);
    return out;
  }

  pdfFontForComputed(family, bold, italic) {
    let base = PdfWordDocument.pdfFontName(family);
    if (/courier/i.test(base)) {
      if (bold && italic) return 'Courier-BoldOblique';
      if (bold) return 'Courier-Bold';
      if (italic) return 'Courier-Oblique';
      return 'Courier';
    }
    if (/times/i.test(base)) {
      if (bold && italic) return 'Times-BoldItalic';
      if (bold) return 'Times-Bold';
      if (italic) return 'Times-Italic';
      return 'Times-Roman';
    }
    if (bold && italic) return 'Helvetica-BoldOblique';
    if (bold) return 'Helvetica-Bold';
    if (italic) return 'Helvetica-Oblique';
    return 'Helvetica';
  }

  cssToRgb(value) {
    const m = String(value || '').match(/rgba?\\(([^)]+)\\)/i);
    if (!m) return [0, 0, 0];
    const parts = m[1].split(/[,\\s]+/).filter(Boolean).map(Number);
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }

  progress(show, message, percent) {
    const modal = document.getElementById('pdf-progress-modal');
    if (!modal) return;
    modal.hidden = !show;
    const label = document.getElementById('pdf-progress-label');
    const bar = document.getElementById('pdf-progress-bar');
    if (label) label.textContent = message || 'Processing PDF…';
    if (bar && Number.isFinite(percent)) bar.style.width = clamp(percent, 0, 100) + '%';
  }

  setStatus(message) {
    if (this.statusEl) this.statusEl.textContent = message;
  }
}

window.addEventListener('DOMContentLoaded', () => new PdfWordEditor());
