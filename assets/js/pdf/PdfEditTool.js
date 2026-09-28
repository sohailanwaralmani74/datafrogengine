import { PdfDocument } from '../document/PdfDocument.js';
import { PdfWriter } from '../writer/PdfWriter.js';
import { PdfEditor } from './PdfEditor.js';
import { PdfTextEditor } from './PdfTextEditor.js';

class PdfEditTool {
  constructor() {
    this.fileInput = document.getElementById('pdf-file-input');
    this.dropzone = document.getElementById('pdf-edit-dropzone');
    this.workspace = document.getElementById('pdf-edit-workspace');
    this.nativePreview = document.getElementById('pdf-edit-preview');
    this.fileName = document.getElementById('pdf-edit-file-name');
    this.pageInput = document.getElementById('edit-page-number');
    this.pageCount = document.getElementById('edit-page-count');
    this.textList = document.getElementById('edit-text-list');
    this.status = document.getElementById('edit-status');
    this.outputPanel = document.getElementById('edit-output');
    this.download = document.getElementById('edit-download');
    this.search = document.getElementById('edit-search');
    this.replace = document.getElementById('edit-replace');
    this.action = document.getElementById('edit-apply-text');
    this.addText = document.getElementById('edit-add-text');
    this.addX = document.getElementById('edit-add-x');
    this.addY = document.getElementById('edit-add-y');
    this.addSize = document.getElementById('edit-add-size');
    this.coverX = document.getElementById('edit-cover-x');
    this.coverY = document.getElementById('edit-cover-y');
    this.coverW = document.getElementById('edit-cover-w');
    this.coverH = document.getElementById('edit-cover-h');
    this.rotate = document.getElementById('edit-rotate');
    this.deletePage = document.getElementById('edit-delete-page');
    this.reset = document.getElementById('edit-reset');
    this.currentBytes = null;
    this.doc = null;
    this.blobUrl = null;
    this.bind();
  }

  bind() {
    this.dropzone?.addEventListener('click', () => this.fileInput?.click());
    this.dropzone?.addEventListener('dragover', e => { e.preventDefault(); this.dropzone.classList.add('is-dragover'); });
    this.dropzone?.addEventListener('dragleave', () => this.dropzone.classList.remove('is-dragover'));
    this.dropzone?.addEventListener('drop', e => {
      e.preventDefault();
      this.dropzone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.load(file);
    });
    this.fileInput?.addEventListener('change', e => e.target.files?.[0] && this.load(e.target.files[0]));
    this.pageInput?.addEventListener('change', () => this.inspectPage());
    this.action?.addEventListener('click', () => this.applyTextEdit());
    document.getElementById('edit-add-text-btn')?.addEventListener('click', () => this.applyAddText());
    document.getElementById('edit-cover-btn')?.addEventListener('click', () => this.applyCover());
    this.rotate?.addEventListener('click', () => this.applyRotate());
    this.deletePage?.addEventListener('click', () => this.applyDelete());
    this.reset?.addEventListener('click', () => location.reload());
  }

  async load(file) {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      this.setStatus('Please choose a PDF file.');
      return;
    }
    this.currentBytes = new Uint8Array(await file.arrayBuffer());
    this.fileName.textContent = file.name;
    this.dropzone.style.display = 'none';
    this.workspace.style.display = 'block';
    this.outputPanel.style.display = 'none';
    this.showPreview(this.currentBytes);
    this.setStatus('PDF loaded. Choose an edit below.');
    await this.prepareDocument();
  }

  showPreview(bytes) {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    this.nativePreview.src = this.blobUrl;
  }

  async prepareDocument() {
    try {
      this.doc = await PdfDocument.open(this.currentBytes);
      const count = this.doc.getPageCount();
      this.pageCount.textContent = String(count);
      this.pageInput.max = String(count);
      this.pageInput.value = '1';
      await this.inspectPage();
    } catch (error) {
      this.setStatus('This PDF could not be opened for editing: ' + (error?.message || 'unsupported PDF structure'));
      this.doc = null;
    }
  }

  async inspectPage() {
    if (!this.doc) return;
    const pageNumber = Math.max(1, Math.min(Number(this.pageInput.value) || 1, this.doc.getPageCount()));
    this.pageInput.value = String(pageNumber);
    const page = this.doc.getPage(pageNumber - 1);
    this.textList.innerHTML = '<div class="edit-muted">Reading editable text on this page…</div>';
    try {
      const items = page.extractTextItems();
      this.textList.innerHTML = '';
      if (!items.length) {
        this.textList.innerHTML = '<div class="edit-muted">No editable text runs were found on this page.</div>';
        return;
      }
      for (const item of items.slice(0, 120)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'edit-text-item';
        button.textContent = item.text.length > 90 ? item.text.slice(0, 87) + '…' : item.text;
        button.title = 'Page ' + pageNumber + ' · x ' + item.x + ', y ' + item.y;
        button.addEventListener('click', () => {
          this.search.value = item.text;
          this.replace.focus();
        });
        this.textList.appendChild(button);
      }
    } catch (_) {
      this.textList.innerHTML = '<div class="edit-muted">Text could not be inspected on this page.</div>';
    }
  }

  applyTextEdit() {
    if (!this.doc) return;
    const search = this.search.value;
    const replacement = this.replace.value;
    if (!search) return this.setStatus('Enter the existing text you want to change.');
    const page = this.doc.getPage(Number(this.pageInput.value) - 1);
    const result = PdfTextEditor.replaceText(page, search, replacement, { all: true });
    if (!result.changed) {
      this.setStatus(result.unsupported
        ? 'That text uses an encoding this editor cannot safely rewrite.'
        : 'That exact text was not found as an editable PDF text run.');
      return;
    }
    this.finishEdit(String(result.replacements) + ' text occurrence' + (result.replacements === 1 ? '' : 's') + ' changed.');
  }

  applyAddText() {
    if (!this.doc) return;
    const text = this.addText.value.trim();
    if (!text) return this.setStatus('Enter the text to add.');
    const page = this.doc.getPage(Number(this.pageInput.value) - 1);
    page.drawText(text, {
      x: Number(this.addX.value) || 50,
      y: Number(this.addY.value) || 50,
      size: Number(this.addSize.value) || 12,
      font: 'Helvetica',
      color: '#000000'
    });
    this.finishEdit('Text added to the page.');
  }

  applyCover() {
    if (!this.doc) return;
    const page = this.doc.getPage(Number(this.pageInput.value) - 1);
    page.drawRectangle({
      x: Number(this.coverX.value) || 50,
      y: Number(this.coverY.value) || 50,
      width: Number(this.coverW.value) || 150,
      height: Number(this.coverH.value) || 30,
      fillColor: '#ffffff'
    });
    this.finishEdit('A white cover area was added. This hides visible content but is not secure redaction.');
  }

  applyRotate() {
    if (!this.doc) return;
    PdfEditor.rotatePage(this.doc, Number(this.pageInput.value) - 1, 90);
    this.finishEdit('Page rotated 90° clockwise.');
  }

  applyDelete() {
    if (!this.doc) return;
    if (this.doc.getPageCount() <= 1) return this.setStatus('A PDF must contain at least one page.');
    const page = Number(this.pageInput.value) - 1;
    PdfEditor.deletePage(this.doc, page);
    this.pageInput.max = String(this.doc.getPageCount());
    this.pageInput.value = String(Math.min(page + 1, this.doc.getPageCount()));
    this.finishEdit('Page deleted.');
  }

  finishEdit(message) {
    try {
      const bytes = PdfWriter.write(this.doc);
      this.currentBytes = bytes;
      this.showPreview(bytes);
      this.outputPanel.style.display = 'block';
      this.download.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      this.download.download = this.fileName.textContent.replace(/\.pdf$/i, '') + '-edited.pdf';
      this.setStatus(message);
      this.inspectPage();
    } catch (error) {
      this.setStatus('The edit could not be saved safely: ' + (error?.message || 'PDF write error'));
    }
  }

  setStatus(message) {
    if (this.status) this.status.textContent = message;
  }
}

window.addEventListener('DOMContentLoaded', () => new PdfEditTool());
