/**
 * DataFrog Word-Style PDF Editor
 *
 * PDF -> fixed-page editable document -> PDF.
 * The original PDF is never exposed as a collection of character boxes.
 * Non-text page artwork is rendered without text and used as the page artwork;
 * recovered PDF text becomes normal contenteditable paragraphs.
 */
import { PdfEngine } from './PdfEngine.js';
import { PdfImage } from '../images/PdfImage.js';

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
    this.pages = [];
    this.pageIndex = 0;
    this.history = [];
    this.future = [];
    this.dirty = false;
    this.renderScale = 2;
    this.activeBlock = null;

    this.bind();
  }

  bind() {
    document.getElementById('pdf-word-browse')?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) this.load(file);
    });

    this.upload?.addEventListener('dragover', e => {
      e.preventDefault();
      this.upload.classList.add('is-dragover');
    });
    this.upload?.addEventListener('dragleave', () => this.upload.classList.remove('is-dragover'));
    this.upload?.addEventListener('drop', e => {
      e.preventDefault();
      this.upload.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.load(file);
    });

    document.getElementById('pdf-word-download')?.addEventListener('click', () => this.save());
    document.getElementById('pdf-word-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('pdf-word-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('pdf-word-prev')?.addEventListener('click', () => this.goPage(this.pageIndex - 1));
    document.getElementById('pdf-word-next')?.addEventListener('click', () => this.goPage(this.pageIndex + 1));
    document.getElementById('pdf-word-add-page')?.addEventListener('click', () => this.addPage());

    document.getElementById('pdf-word-bold')?.addEventListener('click', () => this.exec('bold'));
    document.getElementById('pdf-word-italic')?.addEventListener('click', () => this.exec('italic'));
    document.getElementById('pdf-word-align-left')?.addEventListener('click', () => this.exec('justifyLeft'));
    document.getElementById('pdf-word-align-center')?.addEventListener('click', () => this.exec('justifyCenter'));
    document.getElementById('pdf-word-align-right')?.addEventListener('click', () => this.exec('justifyRight'));

    document.getElementById('pdf-word-font-size')?.addEventListener('change', e => {
      const value = Number(e.target.value);
      if (!value || !this.activeBlock) return;
      this.pushHistory();
      this.activeBlock.style.fontSize = value + 'px';
      this.markDirty();
    });

    document.getElementById('pdf-word-font')?.addEventListener('change', e => {
      if (!this.activeBlock || !e.target.value) return;
      this.pushHistory();
      this.activeBlock.style.fontFamily = e.target.value;
      this.markDirty();
    });

    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if (!selection?.anchorNode) return;
      const el = selection.anchorNode.nodeType === 1
        ? selection.anchorNode
        : selection.anchorNode.parentElement;
      const block = el?.closest?.('.pdf-word-text');
      if (block) this.activeBlock = block;
    });
  }

  setStatus(message) {
    if (this.statusEl) this.statusEl.textContent = message;
  }

  progress(show, message, percent) {
    const modal = document.getElementById('pdf-progress-modal');
    const bar = document.getElementById('pdf-progress-bar');
    const label = document.getElementById('pdf-progress-label');
    if (!modal) return;
    modal.hidden = !show;
    if (label) label.textContent = message || 'Processing PDF…';
    if (bar && Number.isFinite(percent)) bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
  }

  async load(file) {
    if (!/\.pdf$/i.test(file.name)) {
      this.setStatus('Please choose a PDF file.');
      return;
    }

    try {
      this.progress(true, 'Opening PDF…', 5);
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.doc = PdfEngine.load(bytes);
      this.fileName = file.name.replace(/\.pdf$/i, '') + '-edited.pdf';
      this.pages = [];
      this.history = [];
      this.future = [];
      this.pageIndex = 0;
      this.dirty = false;

      const count = this.doc.getPageCount();
      for (let i = 0; i < count; i++) {
        this.progress(true, 'Converting page ' + (i + 1) + ' of ' + count + '…', 10 + Math.round(i / count * 80));
        this.pages.push(await this.buildPageModel(i));
      }

      this.upload.style.display = 'none';
      this.workspace.style.display = 'block';
      await this.render();
      this.progress(false);
      this.setStatus('PDF is ready. Click text and edit it like a document.');
    } catch (error) {
      this.progress(false);
      this.doc = null;
      this.setStatus('Could not open this PDF: ' + (error?.message || 'unsupported PDF'));
    }
  }

  async buildPageModel(index) {
    const page = this.doc.getPage(index);
    const size = page.getSize();
    const canvas = document.createElement('canvas');

    page.renderToCanvas(canvas, {
      scale: this.renderScale,
      background: '#ffffff',
      renderText: false
    });

    const jpeg = this.canvasToBytes(canvas, 'image/jpeg', 0.98);
    const items = PdfEngine.extractTextItems(this.doc, index) || [];
    const lines = this.groupItems(items, size);

    return {
      width: size.width,
      height: size.height,
      rotation: page.getRotation(),
      background: jpeg,
      backgroundWidth: canvas.width,
      backgroundHeight: canvas.height,
      items: lines,
      hasEditableText: lines.length > 0
    };
  }

  canvasToBytes(canvas, type, quality) {
    const dataUrl = canvas.toDataURL(type, quality);
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  groupItems(items, size) {
    const usable = items
      .filter(item => String(item?.text ?? '').length > 0)
      .map(item => ({ ...item }))
      .sort((a, b) => {
        const ay = Number(a.y || 0);
        const by = Number(b.y || 0);
        if (Math.abs(by - ay) > Math.max(3, Math.min(a.height || 12, b.height || 12) * 0.45)) {
          return by - ay;
        }
        return Number(a.x || 0) - Number(b.x || 0);
      });

    const rows = [];
    for (const item of usable) {
      const y = Number(item.y || 0);
      const h = Number(item.height || item.fontSize || 12);
      let row = rows.find(r => Math.abs(r.y - y) <= Math.max(3, h * 0.45));
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push(item);
    }

    rows.sort((a, b) => b.y - a.y);

    return rows.map(row => {
      row.items.sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
      const first = row.items[0];
      const last = row.items[row.items.length - 1];
      const x = Number(first.x || 0);
      const right = Number(last.x || 0) + Number(last.width || 0);
      const height = Math.max(...row.items.map(i => Number(i.height || i.fontSize || 12)));
      const text = this.joinItems(row.items);

      return {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
        text,
        x,
        y: Number(row.y || 0),
        top: size.height - Number(row.y || 0) - height,
        width: Math.max(20, right - x),
        height: Math.max(10, height),
        fontSize: Number(first.fontSize || height || 12),
        font: this.normalFont(first.fontName || first.fontBaseName || 'Helvetica'),
        color: this.pdfColor(first.color),
        bold: /bold/i.test(first.fontName || first.fontBaseName || ''),
        italic: /italic|oblique/i.test(first.fontName || first.fontBaseName || ''),
        rotate: this.rotationFromItem(first),
        align: 'left'
      };
    });
  }

  joinItems(items) {
    let text = '';
    let previous = null;

    for (const item of items) {
      const current = String(item.text ?? '');
      if (previous) {
        const gap = Number(item.x || 0) - (Number(previous.x || 0) + Number(previous.width || 0));
        const average = Number(previous.width || 0) / Math.max(1, String(previous.text || '').length);
        if (gap > Math.max(1.5, average * 0.35) &&
            !previous.text.endsWith(' ') && !current.startsWith(' ')) {
          text += ' ';
        }
      }
      text += current;
      previous = item;
    }

    return text;
  }

  normalFont(name) {
    const n = String(name || '').replace(/^\+/, '');
    if (/courier/i.test(n)) return /bold/i.test(n) ? 'Courier-Bold' : 'Courier';
    if (/times/i.test(n)) {
      if (/bold.*italic|italic.*bold/i.test(n)) return 'Times-BoldItalic';
      if (/bold/i.test(n)) return 'Times-Bold';
      if (/italic|oblique/i.test(n)) return 'Times-Italic';
      return 'Times-Roman';
    }
    if (/helvetica|arial|sans/i.test(n)) {
      if (/bold.*oblique|oblique.*bold|bold.*italic|italic.*bold/i.test(n)) return 'Helvetica-BoldOblique';
      if (/bold/i.test(n)) return 'Helvetica-Bold';
      if (/italic|oblique/i.test(n)) return 'Helvetica-Oblique';
      return 'Helvetica';
    }
    if (/symbol/i.test(n)) return 'Symbol';
    return 'Helvetica';
  }

  pdfColor(color) {
    if (Array.isArray(color) && color.length >= 3) {
      return color.map(v => Math.max(0, Math.min(1, Number(v) || 0)));
    }
    return [0, 0, 0];
  }

  rotationFromItem(item) {
    const m = item?.matrix;
    if (!Array.isArray(m) || m.length < 4) return 0;
    let angle = Math.atan2(Number(m[1]), Number(m[0])) * 180 / Math.PI;
    if (!Number.isFinite(angle)) angle = 0;
    return Math.round(angle);
  }

  async render() {
    const model = this.pages[this.pageIndex];
    if (!model || !this.documentEl) return;

    this.documentEl.innerHTML = '';
    const page = document.createElement('section');
    page.className = 'pdf-word-page';
    page.style.width = model.width + 'px';
    page.style.height = model.height + 'px';

    const background = document.createElement('img');
    background.className = 'pdf-word-background';
    background.alt = '';
    background.draggable = false;
    background.src = this.bytesToDataUrl(model.background, 'image/jpeg');
    page.appendChild(background);

    for (const item of model.items) {
      page.appendChild(this.createTextBlock(item, model));
    }

    this.documentEl.appendChild(page);
    this.renderThumbs();
    this.updatePageControls();
    this.updateHistoryButtons();
  }

  bytesToDataUrl(bytes, mime) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return 'data:' + mime + ';base64,' + btoa(binary);
  }

  createTextBlock(item, model) {
    const el = document.createElement('div');
    el.className = 'pdf-word-text';
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.textContent = item.text;
    el.dataset.id = item.id;

    el.style.left = item.x + 'px';
    el.style.top = item.top + 'px';
    el.style.minWidth = Math.max(20, item.width) + 'px';
    el.style.minHeight = Math.max(10, item.height) + 'px';
    el.style.fontSize = item.fontSize + 'px';
    el.style.fontFamily = item.font;
    el.style.fontWeight = item.bold ? '700' : '400';
    el.style.fontStyle = item.italic ? 'italic' : 'normal';
    el.style.color = this.rgbCss(item.color);
    el.style.textAlign = item.align || 'left';
    el.style.transform = item.rotate ? 'rotate(' + item.rotate + 'deg)' : '';
    el.style.transformOrigin = 'left top';

    el.addEventListener('focus', () => {
      this.activeBlock = el;
      this.pushHistory();
      el.classList.add('editing');
    });
    el.addEventListener('blur', () => {
      el.classList.remove('editing');
      this.syncBlock(el);
      this.markDirty();
    });
    el.addEventListener('input', () => {
      this.syncBlock(el);
      this.markDirty();
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '    ');
      }
    });

    return el;
  }

  rgbCss(color) {
    const r = Math.round((color?.[0] ?? 0) * 255);
    const g = Math.round((color?.[1] ?? 0) * 255);
    const b = Math.round((color?.[2] ?? 0) * 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  syncBlock(el) {
    const model = this.pages[this.pageIndex];
    const item = model?.items.find(x => x.id === el.dataset.id);
    if (!item) return;

    item.text = el.innerText.replace(/\r/g, '');
    item.fontSize = parseFloat(getComputedStyle(el).fontSize) || item.fontSize;
    item.font = this.normalFont(getComputedStyle(el).fontFamily || item.font);
    item.bold = getComputedStyle(el).fontWeight === '700' || getComputedStyle(el).fontWeight === 'bold';
    item.italic = getComputedStyle(el).fontStyle === 'italic';
    item.align = getComputedStyle(el).textAlign || 'left';
  }

  exec(command) {
    if (!this.activeBlock) return;
    this.pushHistory();
    this.activeBlock.focus();
    document.execCommand(command, false, null);
    this.syncBlock(this.activeBlock);
    this.markDirty();
  }

  pushHistory() {
    const snapshot = JSON.stringify(this.pages);
    if (this.history.length && this.history[this.history.length - 1] === snapshot) return;
    this.history.push(snapshot);
    if (this.history.length > 40) this.history.shift();
    this.future = [];
    this.updateHistoryButtons();
  }

  restoreSnapshot(snapshot) {
    this.pages = JSON.parse(snapshot);
  }

  markDirty() {
    this.dirty = true;
    this.updateHistoryButtons();
  }

  async undo() {
    if (!this.history.length) return;
    const current = JSON.stringify(this.pages);
    const previous = this.history.pop();
    this.future.push(current);
    this.restoreSnapshot(previous);
    await this.render();
    this.setStatus('Undid the last change.');
  }

  async redo() {
    if (!this.future.length) return;
    const current = JSON.stringify(this.pages);
    const next = this.future.pop();
    this.history.push(current);
    this.restoreSnapshot(next);
    await this.render();
    this.setStatus('Redid the last change.');
  }

  addPage() {
    if (!this.doc) return;
    this.pushHistory();
    const base = this.pages[this.pages.length - 1] || { width: 612, height: 792 };
    const blank = this.blankJpeg(base.width, base.height);
    this.pages.push({
      width: base.width,
      height: base.height,
      rotation: 0,
      background: blank.bytes,
      backgroundWidth: blank.width,
      backgroundHeight: blank.height,
      items: [],
      hasEditableText: false
    });
    this.pageIndex = this.pages.length - 1;
    this.markDirty();
    this.render();
  }

  blankJpeg(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * this.renderScale));
    canvas.height = Math.max(1, Math.round(height * this.renderScale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return {
      bytes: this.canvasToBytes(canvas, 'image/jpeg', 0.98),
      width: canvas.width,
      height: canvas.height
    };
  }

  async goPage(index) {
    this.pageIndex = Math.max(0, Math.min(index, this.pages.length - 1));
    await this.render();
  }

  renderThumbs() {
    if (!this.thumbs) return;
    this.thumbs.innerHTML = '';

    this.pages.forEach((model, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = index === this.pageIndex ? 'active' : '';
      button.innerHTML = '<span>Page ' + (index + 1) + '</span><img alt="" src="' +
        this.bytesToDataUrl(model.background, 'image/jpeg') + '">';
      button.addEventListener('click', () => this.goPage(index));
      this.thumbs.appendChild(button);
    });
  }

  updatePageControls() {
    const label = document.getElementById('pdf-word-page-label');
    if (label) label.textContent = 'Page ' + (this.pageIndex + 1) + ' of ' + this.pages.length;
  }

  updateHistoryButtons() {
    document.getElementById('pdf-word-undo')?.toggleAttribute('disabled', !this.history.length);
    document.getElementById('pdf-word-redo')?.toggleAttribute('disabled', !this.future.length);
  }

  async save() {
    if (!this.pages.length) return;

    try {
      this.syncVisibleBlocks();
      this.progress(true, 'Building edited PDF…', 10);

      const output = PdfEngine.create();
      for (let i = 0; i < this.pages.length; i++) {
        const model = this.pages[i];
        this.progress(true, 'Writing page ' + (i + 1) + ' of ' + this.pages.length + '…',
          10 + Math.round((i / this.pages.length) * 80));

        const page = output.addPage(model.width, model.height);
        const background = new PdfImage({
        name: 'page-background-' + (i + 1),
        width: model.backgroundWidth || Math.round(model.width * this.renderScale),
        height: model.backgroundHeight || Math.round(model.height * this.renderScale),
        colorSpace: { family: 'DeviceRGB', components: 3, details: {} },
        bitsPerComponent: 8,
        bytes: model.background,
        format: 'jpeg'
      });
      page.drawImage(background, {
        x: 0,
        y: 0,
        width: model.width,
        height: model.height
      });

        for (const item of model.items) {
          this.drawEditableItem(page, item, model);
        }
      }

      const bytes = PdfEngine.save(output);
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
      this.dirty = false;
      this.setStatus('PDF downloaded.');
    } catch (error) {
      this.progress(false);
      this.setStatus('Could not create the PDF: ' + (error?.message || 'PDF write error'));
    }
  }

  syncVisibleBlocks() {
    this.documentEl?.querySelectorAll('.pdf-word-text').forEach(el => this.syncBlock(el));
  }

  drawEditableItem(page, item, model) {
    if (!item.text) return;

    const y = model.height - item.top - item.fontSize;
    page.drawText(item.text, {
      x: item.x,
      y,
      size: item.fontSize,
      font: item.font,
      color: item.color,
      rotate: item.rotate,
      align: item.align
    });
  }
}

window.addEventListener('DOMContentLoaded', () => new PdfWordEditor());
