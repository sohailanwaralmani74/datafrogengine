import { PdfDocument } from '../document/PdfDocument.js';
import { PdfTextExtractor } from '../extraction/PdfTextExtractor.js';
import { PdfWriter } from '../writer/PdfWriter.js';
import '../modification/PdfPageModifier.js';

class PdfDocumentEditor {
  constructor() {
    this.fileInput = document.getElementById('pdf-file-input');
    this.dropzone = document.getElementById('pdf-edit-dropzone');
    this.uploader = document.getElementById('pdf-edit-uploader');
    this.workspace = document.getElementById('pdf-edit-workspace');
    this.pages = document.getElementById('pdf-document-pages');
    this.fileName = document.getElementById('pdf-edit-file-name');
    this.status = document.getElementById('edit-status');
    this.output = document.getElementById('edit-output');
    this.download = document.getElementById('edit-download');
    this.pageCount = document.getElementById('edit-page-count');
    this.currentBytes = null;
    this.fileNameValue = 'edited.pdf';
    this.originalPageSizes = [];
    this.doc = null;
    this.bind();
  }

  bind() {
    this.dropzone?.addEventListener('click', e => {
      if (e.target?.id !== 'btn-browse-file') this.fileInput?.click();
    });
    document.getElementById('btn-browse-file')?.addEventListener('click', e => {
      e.stopPropagation();
      this.fileInput?.click();
    });
    this.dropzone?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.fileInput?.click();
      }
    });
    this.dropzone?.addEventListener('dragover', e => {
      e.preventDefault();
      this.dropzone.classList.add('is-dragover');
    });
    this.dropzone?.addEventListener('dragleave', () => this.dropzone.classList.remove('is-dragover'));
    this.dropzone?.addEventListener('drop', e => {
      e.preventDefault();
      this.dropzone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.load(file);
    });
    this.fileInput?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) this.load(file);
    });

    document.getElementById('pdf-add-page')?.addEventListener('click', () => this.addPage());
    document.getElementById('pdf-save')?.addEventListener('click', () => this.save());
    document.getElementById('pdf-clear-format')?.addEventListener('click', () => this.clearFormatting());

    document.querySelectorAll('[data-editor-command]').forEach(button => {
      button.addEventListener('mousedown', e => e.preventDefault());
      button.addEventListener('click', () => {
        const command = button.dataset.editorCommand;
        const value = button.dataset.editorValue || null;
        const active = this.getActiveEditor();
        if (!active) return;
        active.focus();
        if (command === 'formatBlock') {
          document.execCommand(command, false, value);
        } else {
          document.execCommand(command, false, value);
        }
        this.setStatus('Document edited. Changes are kept in your browser.');
      });
    });

    this.pages?.addEventListener('input', e => {
      if (e.target.closest('.pdf-document-page-editor')) {
        this.setStatus('Unsaved changes. Click Save PDF when finished.');
        this.output.style.display = 'none';
      }
    });
  }

  getActiveEditor() {
    const selection = window.getSelection();
    const node = selection?.anchorNode?.nodeType === 3 ? selection.anchorNode.parentElement : selection?.anchorNode;
    return node?.closest?.('.pdf-document-page-editor') || this.pages?.querySelector('.pdf-document-page-editor');
  }

  async load(file) {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      this.setStatus('Please choose a PDF file.');
      return;
    }

    try {
      this.setStatus('Reading PDF text…');
      this.currentBytes = new Uint8Array(await file.arrayBuffer());
      this.fileNameValue = file.name.replace(/\.pdf$/i, '') + '-edited.pdf';
      this.fileName.textContent = file.name;
      this.doc = await PdfDocument.open(this.currentBytes);
      this.originalPageSizes = [];
      this.pages.innerHTML = '';

      let totalText = 0;
      for (let i = 0; i < this.doc.getPageCount(); i++) {
        const page = this.doc.getPage(i);
        const size = page.getSize();
        this.originalPageSizes.push(size);

        let text = '';
        try {
          text = PdfTextExtractor.extractText(page) || '';
        } catch (_) {
          text = '';
        }

        totalText += text.trim().length;
        this.renderPageEditor(i, size, text);
      }

      this.pageCount.textContent = String(this.doc.getPageCount());
      this.uploader.style.display = 'none';
      this.workspace.style.display = 'block';
      this.output.style.display = 'none';

      if (!totalText) {
        this.setStatus('No editable text was found. This PDF may be scanned or image-only. Run OCR first.');
      } else {
        this.setStatus('PDF converted to an editable document. Edit the text like a simple Word document, then save as PDF.');
      }
    } catch (error) {
      this.doc = null;
      this.setStatus('This PDF could not be opened: ' + (error?.message || 'unsupported PDF structure'));
    }
  }

  renderPageEditor(index, size, text) {
    const wrapper = document.createElement('section');
    wrapper.className = 'pdf-document-page';
    wrapper.dataset.pageIndex = String(index);

    const label = document.createElement('div');
    label.className = 'pdf-document-page-label';
    label.textContent = 'Page ' + (index + 1);

    const editor = document.createElement('div');
    editor.className = 'pdf-document-page-editor';
    editor.contentEditable = 'true';
    editor.spellcheck = true;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-label', 'Editable PDF page ' + (index + 1));

    const lines = String(text || '').replace(/\r/g, '').split('\n');
    if (!String(text || '').trim()) {
      editor.innerHTML = '<p class="pdf-empty-line"><br></p>';
    } else {
      for (const line of lines) {
        const p = document.createElement('p');
        p.textContent = line;
        editor.appendChild(p);
      }
    }

    const width = Math.max(360, Math.round(size.width * 1.08));
    const height = Math.max(470, Math.round(size.height * 1.08));
    editor.style.minHeight = height + 'px';
    editor.style.width = Math.min(width, 900) + 'px';

    wrapper.appendChild(label);
    wrapper.appendChild(editor);
    this.pages.appendChild(wrapper);
  }

  addPage() {
    const index = this.pages.querySelectorAll('.pdf-document-page').length;
    const fallback = this.originalPageSizes[this.originalPageSizes.length - 1] || { width: 612, height: 792 };
    this.originalPageSizes.push({ ...fallback });
    this.renderPageEditor(index, fallback, '');
    this.pageCount.textContent = String(index + 1);
    this.pages.lastElementChild?.querySelector('.pdf-document-page-editor')?.focus();
    this.setStatus('Blank page added.');
  }

  clearFormatting() {
    const editor = this.getActiveEditor();
    if (!editor) return;
    editor.focus();
    document.execCommand('removeFormat', false, null);
    this.setStatus('Formatting cleared from the current selection.');
  }

  wrapLines(text, maxWidth, fontSize, fontName = 'Helvetica') {
    const canvas = this._measureCanvas || (this._measureCanvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    ctx.font = (fontName.includes('Bold') ? '700 ' : '') + fontSize + 'px Arial';
    const words = text.split(/(\s+)/);
    const lines = [];
    let line = '';

    for (const token of words) {
      const candidate = line + token;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line.trim() || !lines.length) lines.push(line.trimEnd());
    return lines;
  }

  exportPageContent(page, editor, pageIndex) {
    const size = this.originalPageSizes[pageIndex] || { width: 612, height: 792 };
    const margin = 50;
    const maxWidth = Math.max(120, size.width - margin * 2);
    const fontSize = 12;
    const leading = 18;
    const top = size.height - margin;
    const bottom = margin;

    const paragraphs = [];
    const blocks = Array.from(editor.children);
    if (!blocks.length) {
      paragraphs.push('');
    } else {
      for (const block of blocks) {
        const text = (block.innerText ?? block.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n+/g, ' ').trim();
        paragraphs.push(text);
      }
    }

    let y = top;
    const pageLines = [];
    const overflow = [];

    for (const paragraph of paragraphs) {
      if (!paragraph) {
        y -= leading;
        if (y < bottom) break;
        continue;
      }

      const lines = this.wrapLines(paragraph, maxWidth, fontSize);
      for (const line of lines) {
        if (y < bottom) {
          overflow.push(line);
          continue;
        }
        pageLines.push({ text: this.pdfSafeText(line), y });
        y -= leading;
      }
      y -= 7;
    }

    for (const line of pageLines) {
      page.drawText(line.text, {
        x: margin,
        y: line.y,
        size: fontSize,
        font: 'Helvetica',
        color: '#000000'
      });
    }

    return overflow;
  }

  pdfSafeText(text) {
    let result = '';
    for (const ch of String(text)) {
      const code = ch.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        result += ch;
      } else if (code >= 160 && code <= 255) {
        result += ch;
      } else if (ch === '\t') {
        result += ' ';
      } else {
        result += '?';
      }
    }
    return result;
  }

  async save() {
    const editors = Array.from(this.pages.querySelectorAll('.pdf-document-page-editor'));
    if (!editors.length) return;

    try {
      this.setStatus('Building a new editable-text PDF…');

      const out = PdfDocument.create();
      let overflow = [];

      for (let i = 0; i < editors.length; i++) {
        const size = this.originalPageSizes[i] || { width: 612, height: 792 };
        const page = out.addPage(size.width, size.height);
        overflow = this.exportPageContent(page, editors[i], i);

        if (overflow.length) {
          const extra = out.addPage(size.width, size.height);
          const extraEditor = document.createElement('div');
          extraEditor.innerHTML = overflow.map(line => '<p>' + this.escapeHtml(line) + '</p>').join('');
          overflow = this.exportPageContent(extra, extraEditor, i);
          while (overflow.length) {
            const more = out.addPage(size.width, size.height);
            const moreEditor = document.createElement('div');
            moreEditor.innerHTML = overflow.map(line => '<p>' + this.escapeHtml(line) + '</p>').join('');
            overflow = this.exportPageContent(more, moreEditor, i);
          }
        }
      }

      out.setCreator('DataFrog PDF Editor');
      this.currentBytes = PdfWriter.write(out);

      const url = URL.createObjectURL(new Blob([this.currentBytes], { type: 'application/pdf' }));
      if (this.download.dataset.url) URL.revokeObjectURL(this.download.dataset.url);
      this.download.dataset.url = url;
      this.download.href = url;
      this.download.download = this.fileNameValue;
      this.output.style.display = 'block';
      this.setStatus('Edited PDF is ready. The original PDF was not changed.');
    } catch (error) {
      this.setStatus('Could not create the edited PDF: ' + (error?.message || 'PDF write error'));
    }
  }

  escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  setStatus(message) {
    if (this.status) this.status.textContent = message;
  }
}

window.addEventListener('DOMContentLoaded', () => new PdfDocumentEditor());
