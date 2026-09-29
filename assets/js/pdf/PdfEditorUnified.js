/**
 * Unified PDF Editor
 * Uses the existing DataFrog PDF document, content, text, image, annotation,
 * form, page-operation and writer engines. The PDF document remains the
 * editable source of truth; no PDF -> HTML -> PDF conversion is performed.
 */

import { PdfEngine } from './PdfEngine.js';
import { PdfWriter } from '../writer/PdfWriter.js';
import { PdfEditor } from './PdfEditor.js';
import { PdfTextEditor } from './PdfTextEditor.js';
import { PdfTextExtractor } from '../extraction/PdfTextExtractor.js';
import { PdfImageExtractor } from '../images/PdfImageExtractor.js';

class UnifiedPdfEditor {
  constructor() {
    this.fileInput = document.getElementById('pdf-word-file') || document.getElementById('pdf-file-input');
    this.upload = document.getElementById('pdf-word-upload') || document.getElementById('pdf-edit-dropzone');
    this.workspace = document.getElementById('pdf-word-workspace') || document.getElementById('pdf-edit-workspace');
    this.documentEl = document.getElementById('pdf-word-document') || document.getElementById('pdf-stage');
    this.thumbs = document.getElementById('pdf-word-thumbs') || document.getElementById('pdf-thumbs');
    this.statusEl = document.getElementById('pdf-word-status') || document.getElementById('edit-status');
    this.fileName = document.getElementById('pdf-edit-file-name');
    this.download = document.getElementById('edit-download');

    this.doc = null;
    this.sourceBytes = null;
    this.fileNameValue = 'edited.pdf';
    this.pageIndex = 0;
    this.selected = null;
    this.history = [];
    this.future = [];
    this.drag = null;
    this.mode = 'select';

    this.bind();
  }

  bind() {
    const browse = document.getElementById('pdf-word-browse') || document.getElementById('btn-browse-file');
    browse?.addEventListener('click', () => this.fileInput?.click());
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
    document.getElementById('pdf-save')?.addEventListener('click', () => this.save());

    document.getElementById('pdf-word-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('pdf-word-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('pdf-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('pdf-redo')?.addEventListener('click', () => this.redo());

    document.getElementById('pdf-prev-page')?.addEventListener('click', () => this.goPage(this.pageIndex - 1));
    document.getElementById('pdf-next-page')?.addEventListener('click', () => this.goPage(this.pageIndex + 1));
    document.getElementById('edit-page-number')?.addEventListener('change', e => this.goPage((Number(e.target.value) || 1) - 1));

    document.getElementById('pdf-delete-page-tool')?.addEventListener('click', () => this.deletePage());
    document.getElementById('pdf-rotate-tool')?.addEventListener('click', () => this.mutate('Page rotated.', () => PdfEditor.rotatePage(this.doc, this.pageIndex, 90)));

    document.getElementById('pdf-apply-replacement')?.addEventListener('click', () => this.replaceSelected());
    document.getElementById('pdf-cancel-selection')?.addEventListener('click', () => this.clearSelection());

    document.getElementById('pdf-place-text')?.addEventListener('click', () => this.addText());
    document.getElementById('pdf-add-text-tool')?.addEventListener('click', () => this.setMode('add'));
    document.getElementById('pdf-select-tool')?.addEventListener('click', () => this.setMode('select'));
    document.getElementById('pdf-cover-tool')?.addEventListener('click', () => this.setMode('cover'));
    document.getElementById('pdf-cancel-add')?.addEventListener('click', () => this.setMode('select'));
    document.getElementById('pdf-cancel-cover')?.addEventListener('click', () => this.setMode('select'));

    this.documentEl?.addEventListener('click', e => this.onPageClick(e));
    this.documentEl?.addEventListener('pointerdown', e => this.onPointerDown(e));
  }

  setStatus(message) {
    if (this.statusEl) this.statusEl.textContent = message;
    const label = document.getElementById('pdf-progress-label');
    if (label) label.textContent = message;
  }

  progress(show, message = 'Processing PDF…', percent = 0) {
    const modal = document.getElementById('pdf-progress-modal');
    const bar = document.getElementById('pdf-progress-bar');
    const label = document.getElementById('pdf-progress-label');
    if (!modal) return;
    modal.hidden = !show;
    if (label) label.textContent = message;
    if (bar) bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
  }

  async load(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.setStatus('Please choose a PDF file.');
      return;
    }

    try {
      this.progress(true, 'Opening PDF…', 10);
      this.setStatus('Opening PDF…');
      this.sourceBytes = new Uint8Array(await file.arrayBuffer());
      this.progress(true, 'Reading PDF structure…', 35);
      this.doc = PdfEngine.load(this.sourceBytes);
      this.fileNameValue = file.name.replace(/\.pdf$/i, '') + '-edited.pdf';
      if (this.fileName) this.fileName.textContent = file.name;

      this.history = [];
      this.future = [];
      this.pageIndex = 0;

      if (this.upload) this.upload.style.display = 'none';
      if (this.workspace) this.workspace.style.display = 'block';

      this.progress(true, 'Rendering PDF…', 70);
      await this.render();
      this.progress(false);
      this.setStatus('PDF loaded. The original PDF structure is being edited directly.');
    } catch (error) {
      this.doc = null;
      this.progress(false);
      this.setStatus('Could not open this PDF: ' + (error?.message || 'unsupported PDF structure'));
    }
  }

  async render() {
    if (!this.doc || !this.documentEl) return;

    const page = this.doc.getPage(this.pageIndex);
    const viewport = page.getViewport({ scale: 1 });
    const width = viewport.width;
    const height = viewport.height;

    this.documentEl.innerHTML = '';

    const wrapper = document.createElement('section');
    wrapper.className = 'pdf-unified-page';
    wrapper.dataset.page = String(this.pageIndex);
    wrapper.style.position = 'relative';
    wrapper.style.width = width + 'px';
    wrapper.style.height = height + 'px';
    wrapper.style.background = '#fff';
    wrapper.style.margin = '0 auto 28px';
    wrapper.style.boxShadow = '0 8px 28px rgba(0,0,0,.25)';

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-unified-canvas';
    canvas.style.display = 'block';
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    try {
      page.renderToCanvas(canvas, { scale: 1, background: '#ffffff' });
      wrapper.appendChild(canvas);
    } catch (error) {
      this.setStatus('Page rendering failed: ' + (error?.message || 'renderer error'));
      return;
    }

    let items = [];
    try {
      items = PdfEngine.extractTextItems(this.doc, this.pageIndex) || [];
    } catch (error) {
      this.setStatus('Text extraction warning: ' + (error?.message || 'unable to extract text'));
    }

    const rows = this.groupTextIntoRows(items);
    for (const row of rows) {
      const box = this.rowBox(row, { width, height });
      if (!box) continue;

      const hit = document.createElement('button');
      hit.type = 'button';
      hit.className = 'pdf-unified-row-hit';
      hit.title = 'Edit row';
      hit.style.position = 'absolute';
      hit.style.left = box.x + 'px';
      hit.style.top = box.y + 'px';
      hit.style.width = Math.max(12, box.width) + 'px';
      hit.style.height = Math.max(12, box.height) + 'px';
      hit.style.background = 'transparent';
      hit.style.border = '0';
      hit.style.padding = '0';
      hit.style.cursor = 'text';
      hit.addEventListener('click', e => {
        e.stopPropagation();
        this.selectRow(row, hit);
      });
      wrapper.appendChild(hit);
    }

    this.documentEl.appendChild(wrapper);
    this.renderThumbs();
    this.updatePageControls();
  }

  groupTextIntoRows(items) {
    const usable = items.filter(item => String(item?.text ?? '').trim());
    usable.sort((a, b) => {
      const ay = Number(a?.y ?? a?.top ?? a?.origin?.y ?? 0);
      const by = Number(b?.y ?? b?.top ?? b?.origin?.y ?? 0);
      const ax = Number(a?.x ?? a?.left ?? a?.origin?.x ?? 0);
      const bx = Number(b?.x ?? b?.left ?? b?.origin?.x ?? 0);
      return Math.abs(ay - by) < 3 ? ax - bx : ay - by;
    });

    const rows = [];
    for (const item of usable) {
      const y = Number(item?.y ?? item?.top ?? item?.origin?.y ?? 0);
      const height = Number(item?.height ?? item?.fontSize ?? 12);
      let row = rows.find(r => Math.abs(r.baseline - y) <= Math.max(3, height * 0.35));
      if (!row) {
        row = { baseline: y, items: [] };
        rows.push(row);
      }
      row.items.push(item);
      row.items.sort((a,b) =>
        Number(a?.x ?? a?.left ?? a?.origin?.x ?? 0) -
        Number(b?.x ?? b?.left ?? b?.origin?.x ?? 0)
      );
    }

    return rows.map(row => {
      const first = row.items[0];
      const last = row.items[row.items.length - 1];
      const firstX = Number(first?.x ?? first?.left ?? first?.origin?.x ?? 0);
      const lastX = Number(last?.x ?? last?.left ?? last?.origin?.x ?? firstX);
      const lastWidth = Number(last?.width ?? last?.w ?? 0);
      const maxHeight = Math.max(...row.items.map(i => Number(i?.height ?? i?.fontSize ?? 12)));
      return {
        items: row.items,
        text: row.items.map(i => String(i?.text ?? '')).join(''),
        x: firstX,
        y: row.baseline,
        width: Math.max(1, lastX + lastWidth - firstX),
        height: Math.max(8, maxHeight)
      };
    });
  }

  rowBox(row, size) {
    if (!row || !Number.isFinite(row.x) || !Number.isFinite(row.y)) return null;
    const top = row.items[0]?.yIsTop === true || row.items[0]?.coordinateSystem === 'top-left'
      ? row.y : size.height - row.y - row.height;
    return { x: row.x, y: top, width: row.width, height: row.height };
  }

  selectRow(row, element) {
    this.selected = { row, item: row.items[0], element };
    this.documentEl.querySelectorAll('.pdf-unified-row-hit.selected')
      .forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');

    const selected = document.getElementById('pdf-selected-text');
    const replacement = document.getElementById('pdf-replacement-text');
    if (selected) {
      selected.value = row.text;
      selected.readOnly = true;
    }
    if (replacement) {
      replacement.value = row.text;
      replacement.focus();
      replacement.select();
    }
    this.showPanel('text');
    this.setStatus('Row selected. Edit the complete line, then apply.');
  }

  itemBox(item, size) {
    const x = Number(item?.x ?? item?.left ?? item?.origin?.x);
    const y = Number(item?.y ?? item?.top ?? item?.origin?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const width = Number(item?.width ?? item?.w ?? item?.bbox?.width ?? 20);
    const height = Number(item?.height ?? item?.h ?? item?.bbox?.height ?? item?.fontSize ?? 12);
    const top = item?.yIsTop === true || item?.coordinateSystem === 'top-left'
      ? y
      : size.height - y - height;

    return { x, y: top, width, height };
  }

  selectText(item, element) {
    this.selected = { item, element };
    this.documentEl.querySelectorAll('.pdf-unified-text-hit.selected')
      .forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');

    const selected = document.getElementById('pdf-selected-text');
    const replacement = document.getElementById('pdf-replacement-text');
    if (selected) selected.value = item.text || '';
    if (replacement) replacement.value = item.text || '';

    this.showPanel('text');
    this.setStatus('Text selected. Replace it without rebuilding the page.');
  }

  replaceSelected() {
    if (!this.doc || !this.selected) return;

    const replacement = document.getElementById('pdf-replacement-text')?.value ?? '';
    const row = this.selected.row;
    const original = row.text;

    this.mutate('Row changed.', () => {
      const result = PdfTextEditor.replaceText(this.doc.getPage(this.pageIndex), original, replacement, {
        all: false,
        textItems: row.items
      });

      if (!result.changed) {
        throw new Error(result.details?.[0]?.message || 'The selected row could not be rewritten.');
      }
    });
  }

  addText() {
    if (!this.doc) return;

    const text = document.getElementById('pdf-new-text')?.value?.trim();
    if (!text) {
      this.setStatus('Enter the text first.');
      return;
    }

    const size = Number(document.getElementById('pdf-new-size')?.value) || 12;
    const page = this.doc.getPage(this.pageIndex);
    const box = page.getSize();

    this.mutate('Text added.', () => {
      page.drawText(text, {
        x: 50,
        y: box.height - 70,
        size,
        font: 'Helvetica',
        color: '#000000'
      });
    });
  }

  onPageClick(event) {
    if (event.target.closest('.pdf-unified-text-hit')) return;
    if (this.mode !== 'cover') return;

    const page = this.doc?.getPage(this.pageIndex);
    if (!page) return;

    const r = this.documentEl.querySelector('.pdf-unified-page').getBoundingClientRect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    const size = page.getSize();

    this.mutate('White cover added.', () => {
      page.drawRectangle({
        x,
        y: size.height - y - 20,
        width: 120,
        height: 20,
        fillColor: '#ffffff'
      });
    });
  }

  onPointerDown() {}

  deletePage() {
    if (!this.doc) return;
    if (this.doc.getPageCount() <= 1) {
      this.setStatus('A PDF must contain at least one page.');
      return;
    }

    this.mutate('Page deleted.', () => {
      PdfEditor.deletePage(this.doc, this.pageIndex);
      this.pageIndex = Math.min(this.pageIndex, this.doc.getPageCount() - 1);
    });
  }

  async mutate(message, operation) {
    if (!this.doc) return;

    const before = PdfEngine.save(this.doc);
    this.history.push(before);
    this.future = [];

    try {
      operation();
      const after = PdfEngine.save(this.doc);
      this.sourceBytes = after;
      await this.render();
      this.updateHistoryButtons();
      this.setStatus(message);
    } catch (error) {
      this.history.pop();
      this.updateHistoryButtons();
      this.setStatus('Change failed: ' + (error?.message || 'PDF write error'));
    }
  }

  async undo() {
    if (!this.doc || !this.history.length) return;

    const current = PdfEngine.save(this.doc);
    const previous = this.history.pop();
    this.future.push(current);

    try {
      this.doc = PdfEngine.load(previous);
      this.sourceBytes = previous;
      await this.render();
      this.updateHistoryButtons();
      this.setStatus('Undid the last change.');
    } catch (error) {
      this.setStatus('Undo failed: ' + (error?.message || 'PDF open error'));
    }
  }

  async redo() {
    if (!this.doc || !this.future.length) return;

    const current = PdfWriter.write(this.doc);
    const next = this.future.pop();
    this.history.push(current);

    try {
      this.doc = PdfEngine.load(next);
      this.sourceBytes = next;
      await this.render();
      this.updateHistoryButtons();
      this.setStatus('Redid the last change.');
    } catch (error) {
      this.setStatus('Redo failed: ' + (error?.message || 'PDF open error'));
    }
  }

  async save() {
    if (!this.doc) return;

    try {
      this.setStatus('Saving PDF…');
      const bytes = PdfEngine.save(this.doc);
      this.sourceBytes = bytes;
      this.progress(true, 'Preparing download…', 85);

      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      if (this.download) {
        this.download.href = url;
        this.download.download = this.fileNameValue;
        this.download.style.display = '';
        this.download.click();
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = this.fileNameValue;
        a.click();
      }

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.progress(false);
      this.setStatus('PDF saved.');
    } catch (error) {
      this.progress(false);
      this.setStatus('Could not save the PDF: ' + (error?.message || 'PDF write error'));
    }
  }

  async goPage(index) {
    if (!this.doc) return;
    this.pageIndex = Math.max(0, Math.min(index, this.doc.getPageCount() - 1));
    await this.render();
  }

  renderThumbs() {
    if (!this.thumbs || !this.doc) return;
    this.thumbs.innerHTML = '';

    for (let i = 0; i < this.doc.getPageCount(); i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Page ' + (i + 1);
      button.className = i === this.pageIndex ? 'active' : '';
      button.addEventListener('click', () => this.goPage(i));
      this.thumbs.appendChild(button);
    }
  }

  updatePageControls() {
    const pageInput = document.getElementById('edit-page-number');
    const pageCount = document.getElementById('edit-page-count');
    const label = document.getElementById('pdf-word-page-label');

    if (pageInput) {
      pageInput.value = String(this.pageIndex + 1);
      pageInput.max = String(this.doc.getPageCount());
    }
    if (pageCount) pageCount.textContent = String(this.doc.getPageCount());
    if (label) label.textContent = 'Page ' + (this.pageIndex + 1) + ' of ' + this.doc.getPageCount();
  }

  updateHistoryButtons() {
    document.getElementById('pdf-word-undo')?.toggleAttribute('disabled', !this.history.length);
    document.getElementById('pdf-word-redo')?.toggleAttribute('disabled', !this.future.length);
    document.getElementById('pdf-undo')?.toggleAttribute('disabled', !this.history.length);
    document.getElementById('pdf-redo')?.toggleAttribute('disabled', !this.future.length);
  }

  setMode(mode) {
    this.mode = mode;
    this.showPanel(mode === 'add' ? 'add' : mode === 'cover' ? 'cover' : 'empty');
  }

  showPanel(which) {
    const map = [
      ['pdf-side-empty', which === 'empty'],
      ['pdf-text-editor-panel', which === 'text'],
      ['pdf-add-editor-panel', which === 'add'],
      ['pdf-cover-editor-panel', which === 'cover']
    ];

    for (const [id, visible] of map) {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? 'block' : 'none';
    }
  }

  clearSelection() {
    this.selected = null;
    this.documentEl?.querySelectorAll('.pdf-unified-text-hit.selected')
      .forEach(el => el.classList.remove('selected'));
    this.showPanel('empty');
  }
}

window.addEventListener('DOMContentLoaded', () => new UnifiedPdfEditor());
