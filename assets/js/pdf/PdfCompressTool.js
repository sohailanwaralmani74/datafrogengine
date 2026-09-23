/**
 * PdfCompressTool.js - Interactive Client-Side PDF Compression Studio
 * Handles drag-and-drop, PDF file parsing, multi-page canvas rendering,
 * interactive compression progress simulation, before/after statistics, and instant download.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfCompressor } from './PdfCompressor.js';
import { PdfRenderer } from '../rendering/PdfRenderer.js';
import { PdfDocumentBuilder } from '../builder/PdfDocumentBuilder.js';
import '../writer/PdfWriter.js';

export class PdfCompressTool {
  constructor() {
    this.originalBytes = null;
    this.originalDoc = null;
    this.compressedBytes = null;
    this.compressedDoc = null;
    this.activeDoc = null; // Either originalDoc or compressedDoc
    this.fileName = 'document.pdf';
    this.currentPage = 0;
    this.totalPages = 1;
    this.zoom = 1.0;
    this.activeTab = 'compressed'; // 'compressed' | 'original'
    this.activeBlobUrl = null;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    // Dropzone & Input
    this.dropzone = document.getElementById('compress-dropzone');
    this.fileInput = document.getElementById('compress-file-input');
    this.btnBrowse = document.getElementById('btn-browse-file');
    this.btnSample = document.getElementById('btn-sample-pdf');
    this.presetSelect = document.getElementById('compression-preset');

    // Stage & Workspace
    this.stageSection = document.getElementById('compress-workspace-stage');
    this.dropzoneSection = document.getElementById('compress-dropzone-section');
    this.fileNameDisplay = document.getElementById('stage-file-name');
    this.originalSizeBadge = document.getElementById('stage-original-size');
    this.pageCountBadge = document.getElementById('stage-page-count');
    this.btnCompressNow = document.getElementById('btn-compress-now');
    this.btnNewFile = document.getElementById('btn-new-file');
    this.stagePresetSelect = document.getElementById('stage-preset-select');

    // Viewer Controls
    this.canvas = document.getElementById('pdf-render-canvas');
    this.canvasContext = this.canvas ? this.canvas.getContext('2d') : null;
    this.canvasContainer = document.getElementById('pdf-canvas-container');
    this.nativeEmbed = document.getElementById('pdf-native-embed');
    this.pageIndicator = document.getElementById('viewer-page-indicator');
    this.btnPrevPage = document.getElementById('btn-prev-page');
    this.btnNextPage = document.getElementById('btn-next-page');
    this.btnZoomIn = document.getElementById('btn-zoom-in');
    this.btnZoomOut = document.getElementById('btn-zoom-out');
    this.btnZoomReset = document.getElementById('btn-zoom-reset');
    this.viewModeSelect = document.getElementById('viewer-mode-select');

    // Inspection & Meta Details
    this.detailSize = document.getElementById('detail-file-size');
    this.detailPages = document.getElementById('detail-page-count');
    this.detailDimensions = document.getElementById('detail-dimensions');
    this.detailVersion = document.getElementById('detail-version');
    this.detailTitle = document.getElementById('detail-title');
    this.detailProducer = document.getElementById('detail-producer');

    // Progress Modal
    this.progressOverlay = document.getElementById('compress-progress-overlay');
    this.progressBar = document.getElementById('compress-progress-bar');
    this.progressPercent = document.getElementById('compress-progress-percent');
    this.progressStatus = document.getElementById('compress-progress-status');

    // Results Stage
    this.resultsPanel = document.getElementById('compress-results-panel');
    this.resOriginalSize = document.getElementById('res-original-size');
    this.resCompressedSize = document.getElementById('res-compressed-size');
    this.resSavingsPercent = document.getElementById('res-savings-percent');
    this.resSavingsBytes = document.getElementById('res-savings-bytes');
    this.resTimeMs = document.getElementById('res-time-ms');
    this.btnDownload = document.getElementById('btn-download-compressed');
    this.btnDownloadOriginal = document.getElementById('btn-download-original');
    this.btnCompressAgain = document.getElementById('btn-compress-again');
    this.previewToggleBtns = document.querySelectorAll('.btn-preview-toggle');
  }

  bindEvents() {
    if (!this.dropzone) return;

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.remove('drag-active');
      });
    });

    this.dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        this.handleFileSelect(files[0]);
      }
    });

    // Browse Button
    if (this.btnBrowse) {
      this.btnBrowse.addEventListener('click', () => {
        if (this.fileInput) this.fileInput.click();
      });
    }

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleFileSelect(e.target.files[0]);
        }
      });
    }

    // Sample PDF
    if (this.btnSample) {
      this.btnSample.addEventListener('click', () => {
        this.loadSamplePdf();
      });
    }

    // Reset / New File
    if (this.btnNewFile) {
      this.btnNewFile.addEventListener('click', () => {
        this.resetWorkspace();
      });
    }
    if (this.btnCompressAgain) {
      this.btnCompressAgain.addEventListener('click', () => {
        this.resetWorkspace();
      });
    }

    // Compress Button
    if (this.btnCompressNow) {
      this.btnCompressNow.addEventListener('click', () => {
        this.runCompression();
      });
    }

    // Viewer Navigation
    if (this.btnPrevPage) {
      this.btnPrevPage.addEventListener('click', () => {
        if (this.currentPage > 0) {
          this.currentPage--;
          this.renderCurrentPage();
        }
      });
    }

    if (this.btnNextPage) {
      this.btnNextPage.addEventListener('click', () => {
        if (this.currentPage < this.totalPages - 1) {
          this.currentPage++;
          this.renderCurrentPage();
        }
      });
    }

    // Zoom Controls
    if (this.btnZoomIn) {
      this.btnZoomIn.addEventListener('click', () => {
        if (this.zoom < 2.5) {
          this.zoom += 0.2;
          this.renderCurrentPage();
        }
      });
    }

    if (this.btnZoomOut) {
      this.btnZoomOut.addEventListener('click', () => {
        if (this.zoom > 0.6) {
          this.zoom -= 0.2;
          this.renderCurrentPage();
        }
      });
    }

    if (this.btnZoomReset) {
      this.btnZoomReset.addEventListener('click', () => {
        this.zoom = 1.0;
        this.renderCurrentPage();
      });
    }

    // Viewer Mode (Canvas vs Native Embed)
    if (this.viewModeSelect) {
      this.viewModeSelect.addEventListener('change', (e) => {
        this.switchViewerMode(e.target.value);
      });
    }

    // Preview Toggle (Compressed vs Original)
    if (this.previewToggleBtns) {
      this.previewToggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const target = e.currentTarget.getAttribute('data-preview');
          this.setPreviewMode(target);
        });
      });
    }

    // Downloads
    if (this.btnDownload) {
      this.btnDownload.addEventListener('click', () => {
        if (this.compressedBytes) {
          const outName = this.fileName.replace(/\.pdf$/i, '') + '_compressed.pdf';
          this.triggerDownload(this.compressedBytes, outName);
        }
      });
    }

    if (this.btnDownloadOriginal) {
      this.btnDownloadOriginal.addEventListener('click', () => {
        if (this.originalBytes) {
          this.triggerDownload(this.originalBytes, this.fileName);
        }
      });
    }

    // Sync presets
    if (this.presetSelect && this.stagePresetSelect) {
      this.presetSelect.addEventListener('change', (e) => {
        this.stagePresetSelect.value = e.target.value;
      });
      this.stagePresetSelect.addEventListener('change', (e) => {
        this.presetSelect.value = e.target.value;
      });
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async handleFileSelect(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Please select a valid .pdf document.');
      return;
    }

    this.fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    this.loadDocumentBytes(uint8);
  }

  loadSamplePdf() {
    try {
      // Build a realistic 3-page corporate financial statement with tables and graphics
      const builder = new PdfDocumentBuilder({
        pageSize: 'A4',
        defaultFont: 'Helvetica',
        margins: 40
      });

      builder.addHeading('GLOBAL LOGISTICS & INFRASTRUCTURE INC.', { level: 1 });
      builder.addParagraph('Annual Operational Statement & Data Pipeline Architecture (Confidential)');
      builder.addDivider();

      builder.addHeading('1. Executive Summary', { level: 2 });
      builder.addParagraph('This sample document serves as an interactive test payload for the pure JavaScript PDF 1.7 engine. It contains nested indirect object dictionaries, cross-reference tables, font descriptors, vector line dividers, and tabular accounting data.');

      builder.addTable({
        headers: ['Asset Class', 'Region', 'Allocation (USD)', 'Q4 Return', 'Status'],
        rows: [
          ['Cloud Streaming ETL', 'US-East / N. Virginia', '$4,250,000', '+18.4%', 'Optimal'],
          ['Edge Memory Caches', 'EU-West / Frankfurt', '$2,800,000', '+14.2%', 'Active'],
          ['Relational DB Clusters', 'AP-South / Tokyo', '$1,950,000', '+11.9%', 'Active'],
          ['Document Sanitization', 'CA-Central / Montreal', '$920,000', '+22.5%', 'Optimal'],
          ['Security Auditing Hub', 'UK-South / London', '$1,400,000', '+9.8%', 'Review']
        ]
      });

      builder.addSpacer(20);
      builder.addHeading('2. Compliance & Regional Data Sovereignty', { level: 2 });
      builder.addParagraph('All document processing operations are executed in-memory within the client environment. Compliant with EU GDPR Article 25 (Data Protection by Design) and California Consumer Privacy Act (CCPA). No external network transmission is initiated.');

      builder.addPage();
      builder.addHeading('3. Technical Verification & Stream Optimization', { level: 2 });
      builder.addParagraph('Below is a secondary page with system configuration directives and schema mapping records:');
      
      builder.addTable({
        headers: ['Directive', 'Target Encoding', 'Compression Type', 'Deflate Ratio'],
        rows: [
          ['PageContentStream', 'ASCII / UTF-8', 'FlateDecode', '65.2%'],
          ['FontDescriptorTree', 'CID / Type1', 'Subsetting', '48.1%'],
          ['IndirectObjectRef', 'Numeric ID', 'Re-indexed XRef', '32.0%'],
          ['MetadataDictionary', 'Latin1 / UTF-16BE', 'Sanitized / Anonymized', '100.0%']
        ]
      });

      const doc = builder.build();
      const bytes = doc.save();
      this.fileName = 'Sample_Financial_Statement_A4.pdf';
      this.loadDocumentBytes(bytes);
    } catch (err) {
      console.error('Error generating sample PDF:', err);
      alert('Could not generate sample PDF: ' + err.message);
    }
  }

  loadDocumentBytes(uint8) {
    try {
      this.originalBytes = uint8;
      this.originalDoc = PdfDocument.load(uint8);
      this.compressedBytes = null;
      this.compressedDoc = null;
      this.activeDoc = this.originalDoc;
      this.activeTab = 'original';
      this.currentPage = 0;
      this.totalPages = this.originalDoc.getPageCount();

      this.updateWorkspaceUI();
      this.renderCurrentPage();

      // Show workspace, hide initial dropzone card
      if (this.dropzoneSection) this.dropzoneSection.style.display = 'none';
      if (this.stageSection) this.stageSection.style.display = 'block';
      if (this.resultsPanel) this.resultsPanel.style.display = 'none';

      // Scroll smoothly to workspace
      this.stageSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error('Failed to parse PDF document:', err);
      alert('Unable to parse PDF: ' + err.message + '\nPlease ensure the file is an uncorrupted PDF 1.0-1.7 document.');
    }
  }

  updateWorkspaceUI() {
    if (this.fileNameDisplay) this.fileNameDisplay.textContent = this.fileName;
    const formattedSize = this.formatBytes(this.originalBytes.length);
    if (this.originalSizeBadge) this.originalSizeBadge.textContent = formattedSize;
    if (this.pageCountBadge) this.pageCountBadge.textContent = `${this.totalPages} ${this.totalPages === 1 ? 'Page' : 'Pages'}`;

    // Meta details
    if (this.detailSize) this.detailSize.textContent = formattedSize;
    if (this.detailPages) this.detailPages.textContent = `${this.totalPages} pages`;

    try {
      const size = this.originalDoc.getPageSize(0);
      if (this.detailDimensions && size) {
        const orientation = size.width > size.height ? 'Landscape' : 'Portrait';
        this.detailDimensions.textContent = `${Math.round(size.width)} × ${Math.round(size.height)} pt (${orientation})`;
      }
    } catch (_) {
      if (this.detailDimensions) this.detailDimensions.textContent = 'Standard (Letter/A4)';
    }

    if (this.detailVersion) {
      this.detailVersion.textContent = `PDF ${this.originalDoc.getPdfVersion() || '1.7'}`;
    }

    const meta = this.originalDoc.getMetadata();
    if (this.detailTitle) {
      this.detailTitle.textContent = (meta && meta.title) ? meta.title : 'Untitled Document';
    }
    if (this.detailProducer) {
      this.detailProducer.textContent = (meta && meta.producer) ? meta.producer : 'Standard PDF Generator';
    }
  }

  renderCurrentPage() {
    if (!this.activeDoc) return;

    if (this.pageIndicator) {
      this.pageIndicator.textContent = `Page ${this.currentPage + 1} of ${this.totalPages}`;
    }
    if (this.btnPrevPage) this.btnPrevPage.disabled = (this.currentPage === 0);
    if (this.btnNextPage) this.btnNextPage.disabled = (this.currentPage >= this.totalPages - 1);

    // Render to Canvas
    if (this.canvas && this.canvasContext) {
      try {
        const page = this.activeDoc.getPage(this.currentPage);
        if (page) {
          PdfRenderer.renderToCanvas(page, this.canvas, {
            scale: this.zoom * 1.3,
            background: '#ffffff'
          });
        }
      } catch (err) {
        console.warn('Canvas rendering note:', err);
        // Fallback: draw placeholder page with document info
        this.renderCanvasFallback();
      }
    }

    // Also update native embed preview if in embed mode
    this.updateNativeEmbed();
  }

  renderCanvasFallback() {
    if (!this.canvas || !this.canvasContext) return;
    const ctx = this.canvasContext;
    const w = 612 * this.zoom;
    const h = 792 * this.zoom;
    this.canvas.width = w;
    this.canvas.height = h;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(20, 20, w - 40, 60);

    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${Math.round(18 * this.zoom)}px system-ui, sans-serif`;
    ctx.fillText(this.fileName, 35, 55 * this.zoom);

    ctx.fillStyle = '#64748b';
    ctx.font = `${Math.round(13 * this.zoom)}px system-ui, sans-serif`;
    ctx.fillText(`Page ${this.currentPage + 1} of ${this.totalPages} · ${this.formatBytes(this.activeDoc === this.compressedDoc && this.compressedBytes ? this.compressedBytes.length : this.originalBytes.length)}`, 35, 95 * this.zoom);

    // Decorative document lines
    ctx.fillStyle = '#e2e8f0';
    for (let y = 130 * this.zoom; y < h - 40; y += 22 * this.zoom) {
      ctx.fillRect(35, y, w - 70, 8 * this.zoom);
    }
  }

  updateNativeEmbed() {
    if (!this.nativeEmbed) return;
    const currentBytes = (this.activeDoc === this.compressedDoc && this.compressedBytes)
      ? this.compressedBytes
      : this.originalBytes;

    if (!currentBytes) return;

    if (this.activeBlobUrl) {
      URL.revokeObjectURL(this.activeBlobUrl);
    }
    const blob = new Blob([currentBytes], { type: 'application/pdf' });
    this.activeBlobUrl = URL.createObjectURL(blob);
    this.nativeEmbed.data = this.activeBlobUrl;
  }

  switchViewerMode(mode) {
    if (!this.canvasContainer || !this.nativeEmbed) return;
    if (mode === 'embed') {
      this.canvasContainer.style.display = 'none';
      this.nativeEmbed.style.display = 'block';
      this.updateNativeEmbed();
    } else {
      this.canvasContainer.style.display = 'flex';
      this.nativeEmbed.style.display = 'none';
      this.renderCurrentPage();
    }
  }

  setPreviewMode(mode) {
    this.activeTab = mode;
    this.previewToggleBtns.forEach(b => {
      if (b.getAttribute('data-preview') === mode) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    if (mode === 'compressed' && this.compressedDoc) {
      this.activeDoc = this.compressedDoc;
    } else {
      this.activeDoc = this.originalDoc;
    }

    this.renderCurrentPage();
  }

  async runCompression() {
    if (!this.originalBytes) return;

    const preset = (this.stagePresetSelect ? this.stagePresetSelect.value : 'recommended') || 'recommended';
    const stripMeta = document.getElementById('opt-strip-meta')?.checked ?? true;
    const purgeOrphans = document.getElementById('opt-purge-orphans')?.checked ?? true;
    const stripAnnots = document.getElementById('opt-strip-annots')?.checked ?? (preset === 'extreme');

    // Show Progress Modal
    this.showProgressModal();

    try {
      // Step 1: Parsing and object graph analysis
      await this.updateProgress(20, 'Step 1/4: Analyzing indirect object graph & catalog references...');
      await new Promise(r => setTimeout(r, 220));

      // Step 2: Garbage collection of unreferenced objects
      await this.updateProgress(50, 'Step 2/4: Purging unreferenced objects & dead revisions...');
      await new Promise(r => setTimeout(r, 260));

      // Step 3: Stream and dictionary optimization
      await this.updateProgress(80, 'Step 3/4: Sanitizing dictionary entries & re-compressing streams...');
      await new Promise(r => setTimeout(r, 240));

      // Step 4: Final binary generation
      const report = PdfCompressor.compressWithReport(this.originalBytes, {
        level: preset,
        stripMetadata: stripMeta,
        stripAnnotations: stripAnnots,
        cleanOrphanObjects: purgeOrphans
      });

      this.compressedBytes = report.bytes;
      this.compressedDoc = PdfDocument.load(this.compressedBytes);
      this.activeDoc = this.compressedDoc;
      this.activeTab = 'compressed';

      await this.updateProgress(100, 'Step 4/4: Finalizing optimized PDF 1.7 binary structure...');
      await new Promise(r => setTimeout(r, 200));

      // Hide progress modal
      this.hideProgressModal();

      // Display results
      this.displayResults(report);

      // Re-render viewer with compressed document
      this.setPreviewMode('compressed');

      // Scroll to results panel
      if (this.resultsPanel) {
        this.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (err) {
      this.hideProgressModal();
      console.error('Compression failed:', err);
      alert('Compression encountered an issue: ' + err.message);
    }
  }

  showProgressModal() {
    if (this.progressOverlay) {
      this.progressOverlay.style.display = 'flex';
      this.progressBar.style.width = '0%';
      this.progressPercent.textContent = '0%';
      this.progressStatus.textContent = 'Initiating client-side PDF compression engine...';
    }
  }

  hideProgressModal() {
    if (this.progressOverlay) {
      this.progressOverlay.style.display = 'none';
    }
  }

  updateProgress(percent, message) {
    if (this.progressBar) this.progressBar.style.width = `${percent}%`;
    if (this.progressPercent) this.progressPercent.textContent = `${percent}%`;
    if (this.progressStatus) this.progressStatus.textContent = message;
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  displayResults(report) {
    if (!this.resultsPanel) return;
    this.resultsPanel.style.display = 'block';

    if (this.resOriginalSize) this.resOriginalSize.textContent = this.formatBytes(report.originalSize);
    if (this.resCompressedSize) this.resCompressedSize.textContent = this.formatBytes(report.compressedSize);

    // If file was already highly optimized or minimal, ensure friendly display
    const savedBytes = Math.max(0, report.originalSize - report.compressedSize);
    const savingsPercent = report.originalSize > 0
      ? ((savedBytes / report.originalSize) * 100).toFixed(1)
      : '0.0';

    if (this.resSavingsPercent) {
      this.resSavingsPercent.textContent = `-${savingsPercent}%`;
    }
    if (this.resSavingsBytes) {
      this.resSavingsBytes.textContent = `${this.formatBytes(savedBytes)} saved`;
    }
    if (this.resTimeMs) {
      this.resTimeMs.textContent = `${report.durationMs} ms`;
    }

    const reportPurged = document.getElementById('res-objects-purged');
    if (reportPurged) {
      reportPurged.textContent = `${report.objectsPurged} items`;
    }
  }

  triggerDownload(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  resetWorkspace() {
    this.originalBytes = null;
    this.originalDoc = null;
    this.compressedBytes = null;
    this.compressedDoc = null;
    this.activeDoc = null;
    this.currentPage = 0;
    this.totalPages = 1;
    if (this.fileInput) this.fileInput.value = '';

    if (this.activeBlobUrl) {
      URL.revokeObjectURL(this.activeBlobUrl);
      this.activeBlobUrl = null;
    }

    if (this.stageSection) this.stageSection.style.display = 'none';
    if (this.resultsPanel) this.resultsPanel.style.display = 'none';
    if (this.dropzoneSection) this.dropzoneSection.style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('compress-dropzone')) {
      window.pdfCompressToolInstance = new PdfCompressTool();
    }
  });
}
