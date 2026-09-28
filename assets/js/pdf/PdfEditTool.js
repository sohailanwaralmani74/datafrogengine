import { PdfDocument } from '../document/PdfDocument.js';
import { PdfWriter } from '../writer/PdfWriter.js';
import { PdfEditor } from './PdfEditor.js';
import { PdfTextEditor } from './PdfTextEditor.js';

class PdfEditTool {
  constructor() {
    this.fileInput=document.getElementById('pdf-file-input'); this.dropzone=document.getElementById('pdf-edit-dropzone'); this.uploader=document.getElementById('pdf-edit-uploader');
    this.workspace=document.getElementById('pdf-edit-workspace'); this.stage=document.getElementById('pdf-stage'); this.canvasArea=document.getElementById('pdf-canvas-area');
    this.thumbs=document.getElementById('pdf-thumbs'); this.fileName=document.getElementById('pdf-edit-file-name'); this.pageInput=document.getElementById('edit-page-number'); this.pageCount=document.getElementById('edit-page-count');
    this.status=document.getElementById('edit-status'); this.outputPanel=document.getElementById('edit-output'); this.download=document.getElementById('edit-download');
    this.selectedPanel=document.getElementById('pdf-text-editor-panel'); this.addPanel=document.getElementById('pdf-add-editor-panel'); this.coverPanel=document.getElementById('pdf-cover-editor-panel'); this.emptyPanel=document.getElementById('pdf-side-empty');
    this.selectedText=document.getElementById('pdf-selected-text'); this.replacement=document.getElementById('pdf-replacement-text'); this.newText=document.getElementById('pdf-new-text'); this.newSize=document.getElementById('pdf-new-size');
    this.currentBytes=null; this.doc=null; this.fileNameValue='edited.pdf'; this.pageIndex=0; this.zoom=1; this.selectedItem=null; this.mode='select'; this.history=[]; this.future=[]; this.drag=null; this.bind();
  }
  bind(){
    this.dropzone?.addEventListener('click',e=>{if(e.target?.id!=='btn-browse-file')this.fileInput?.click()});
    document.getElementById('btn-browse-file')?.addEventListener('click',e=>{e.stopPropagation();this.fileInput?.click()});
    this.dropzone?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.fileInput?.click()}});
    this.dropzone?.addEventListener('dragover',e=>{e.preventDefault();this.dropzone.classList.add('is-dragover')});
    this.dropzone?.addEventListener('dragleave',()=>this.dropzone.classList.remove('is-dragover'));
    this.dropzone?.addEventListener('drop',e=>{e.preventDefault();this.dropzone.classList.remove('is-dragover');const f=e.dataTransfer?.files?.[0];if(f)this.load(f)});
    this.fileInput?.addEventListener('change',e=>e.target.files?.[0]&&this.load(e.target.files[0]));
    document.getElementById('pdf-prev-page')?.addEventListener('click',()=>this.goPage(this.pageIndex-1));
    document.getElementById('pdf-next-page')?.addEventListener('click',()=>this.goPage(this.pageIndex+1));
    this.pageInput?.addEventListener('change',()=>this.goPage((Number(this.pageInput.value)||1)-1));
    document.getElementById('pdf-zoom-in')?.addEventListener('click',()=>this.setZoom(this.zoom+.1)); document.getElementById('pdf-zoom-out')?.addEventListener('click',()=>this.setZoom(this.zoom-.1)); document.getElementById('pdf-fit')?.addEventListener('click',()=>this.fitPage());
    document.getElementById('pdf-select-tool')?.addEventListener('click',()=>this.setMode('select')); document.getElementById('pdf-add-text-tool')?.addEventListener('click',()=>this.setMode('add')); document.getElementById('pdf-cover-tool')?.addEventListener('click',()=>this.setMode('cover'));
    document.getElementById('pdf-rotate-tool')?.addEventListener('click',()=>this.mutate('Page rotated 90° clockwise.',()=>PdfEditor.rotatePage(this.doc,this.pageIndex,90)));
    document.getElementById('pdf-delete-page-tool')?.addEventListener('click',()=>this.deletePage());
    document.getElementById('pdf-apply-replacement')?.addEventListener('click',()=>this.applyReplacement()); document.getElementById('pdf-cancel-selection')?.addEventListener('click',()=>this.clearSelection());
    document.getElementById('pdf-place-text')?.addEventListener('click',()=>this.setMode('place-text')); document.getElementById('pdf-cancel-add')?.addEventListener('click',()=>this.setMode('select')); document.getElementById('pdf-cancel-cover')?.addEventListener('click',()=>this.setMode('select'));
    document.getElementById('pdf-save')?.addEventListener('click',()=>this.save()); document.getElementById('pdf-undo')?.addEventListener('click',()=>this.undo()); document.getElementById('pdf-redo')?.addEventListener('click',()=>this.redo());
    this.stage?.addEventListener('click',e=>this.onStageClick(e)); this.stage?.addEventListener('pointerdown',e=>this.onPointerDown(e)); window.addEventListener('resize',()=>this.doc&&this.renderPage());
  }
  async load(file){
    if(!file.type.includes('pdf')&&!file.name.toLowerCase().endsWith('.pdf'))return this.setStatus('Please choose a PDF file.');
    try{this.currentBytes=new Uint8Array(await file.arrayBuffer());this.fileNameValue=file.name.replace(/\.pdf$/i,'')+'-edited.pdf';this.fileName.textContent=file.name;this.uploader.style.display='none';this.workspace.style.display='block';this.outputPanel.style.display='none';this.history=[];this.future=[];this.doc=await PdfDocument.open(this.currentBytes);this.pageIndex=0;this.pageCount.textContent=String(this.doc.getPageCount());this.pageInput.max=String(this.doc.getPageCount());this.pageInput.value='1';this.setStatus('PDF loaded. Click text on the page to edit it.');await this.renderPage();this.fitPage()}catch(error){this.doc=null;this.setStatus('This PDF could not be opened for editing: '+(error?.message||'unsupported PDF structure'))}
  }
  async renderPage(){
    if(!this.doc)return; const page=this.doc.getPage(this.pageIndex),size=page.getSize(); let svg='';
    try{svg=page.renderToSvg({scale:1,background:'#fff'})}catch(e){this.setStatus('This page could not be rendered: '+(e?.message||'renderer error'));return}
    this.stage.innerHTML=svg; this.stage.style.width=size.width+'px'; this.stage.style.height=size.height+'px'; this.stage.querySelector('svg')?.setAttribute('width',String(size.width)); this.stage.querySelector('svg')?.setAttribute('height',String(size.height));
    this.clearSelection(false); await this.renderTextOverlays(page,size); this.renderThumbnails(); this.pageInput.value=String(this.pageIndex+1); this.pageCount.textContent=String(this.doc.getPageCount()); this.applyZoom();
  }
  async renderTextOverlays(page,size){
    let items=[]; try{items=page.extractTextItems()||[]}catch(_){}
    for(const item of items.slice(0,400)){const text=String(item?.text??item?.str??item?.value??item?.content??'');if(!text.trim())continue;const box=this.itemBox(item,size);if(!box)continue;
      const el=document.createElement('button');el.type='button';el.className='pdf-text-overlay';el.dataset.text=text;el.style.left=box.x+'px';el.style.top=box.y+'px';el.style.width=Math.max(box.width,3)+'px';el.style.height=Math.max(box.height,10)+'px';el.innerHTML='<span class="overlay-label">Edit text</span>';el.title=text;
      el.addEventListener('click',e=>{e.stopPropagation();this.selectItem(item,el,text)});this.stage.appendChild(el);
    }
  }
  itemBox(item,size){
    const x=Number(item?.x??item?.left??item?.origin?.x),y=Number(item?.y??item?.top??item?.origin?.y);if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    const width=Number(item?.width??item?.w??item?.bbox?.width??item?.fontSize??Math.max(20,String(item?.text??'').length*6));const height=Number(item?.height??item?.h??item?.bbox?.height??item?.fontSize??12);
    const top=item?.yIsTop===true||item?.coordinateSystem==='top-left'?y:size.height-y-height;return{x,y:top,width:Math.max(3,width),height:Math.max(10,height)};
  }
  selectItem(item,el,text){this.selectedItem={item,el,text};this.stage.querySelectorAll('.pdf-text-overlay.selected').forEach(x=>x.classList.remove('selected'));el.classList.add('selected');this.selectedText.value=text;this.replacement.value=text;this.showPanel('text');this.setStatus('Text selected. Change it on the right and apply.')}
  applyReplacement(){
    if(!this.selectedItem||!this.doc)return;const search=this.selectedItem.text,replacement=this.replacement.value;if(!search)return;
    this.mutate('',()=>{const result=PdfTextEditor.replaceText(this.doc.getPage(this.pageIndex),search,replacement,{all:false});if(!result.changed)throw new Error(result.unsupported?'This text encoding cannot be safely rewritten.':'The selected text could not be rewritten.');this.setStatus('Text changed.')});
  }
  onStageClick(e){
    if(e.target.closest('.pdf-text-overlay'))return;
    if(this.mode==='place-text'){const p=this.stagePoint(e),text=this.newText.value.trim();if(!text)return this.setStatus('Enter the text first.');const size=Number(this.newSize.value)||12;this.mutate('Text added to the page.',()=>this.doc.getPage(this.pageIndex).drawText(text,{x:p.x,y:this.doc.getPage(this.pageIndex).getSize().height-p.y,size,font:'Helvetica',color:'#000'}));this.setMode('select')}
  }
  onPointerDown(e){
    if(this.mode!=='cover'||e.target.closest('.pdf-text-overlay'))return;e.preventDefault();const start=this.stagePoint(e);this.drag={start,current:start};
    const move=ev=>{this.drag.current=this.stagePoint(ev);this.drawCoverPreview()};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);if(!this.drag)return;const a=this.drag.start,b=this.drag.current;this.drag=null;const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(a.x-b.x),h=Math.abs(a.y-b.y);if(w<3||h<3)return;const page=this.doc.getPage(this.pageIndex),s=page.getSize(),pdfY=s.height-y-h;this.mutate('A white cover was added. This is not secure redaction.',()=>page.drawRectangle({x,y:pdfY,width:w,height:h,fillColor:'#fff'}));this.setMode('select')};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  }
  drawCoverPreview(){let p=this.stage.querySelector('.pdf-cover-preview');if(!p){p=document.createElement('div');p.className='pdf-cover-preview';p.style.cssText='position:absolute;border:1px dashed #ef4444;background:rgba(255,255,255,.75);pointer-events:none;z-index:30';this.stage.appendChild(p)}const a=this.drag.start,b=this.drag.current;p.style.left=Math.min(a.x,b.x)+'px';p.style.top=Math.min(a.y,b.y)+'px';p.style.width=Math.abs(a.x-b.x)+'px';p.style.height=Math.abs(a.y-b.y)+'px'}
  stagePoint(e){const r=this.stage.getBoundingClientRect();return{x:(e.clientX-r.left)/this.zoom,y:(e.clientY-r.top)/this.zoom}}
  deletePage(){if(!this.doc)return;if(this.doc.getPageCount()<=1)return this.setStatus('A PDF must contain at least one page.');this.mutate('Page deleted.',()=>{PdfEditor.deletePage(this.doc,this.pageIndex);this.pageIndex=Math.min(this.pageIndex,this.doc.getPageCount()-1)})}
  async mutate(message,fn){
    if(!this.doc)return;const before=this.currentBytes||PdfWriter.write(this.doc);this.history.push(before);this.future=[];
    try{fn();this.currentBytes=PdfWriter.write(this.doc);await this.renderPage();this.outputPanel.style.display='block';this.updateHistoryButtons();this.setStatus(message||'Change applied.')}catch(error){this.history.pop();this.updateHistoryButtons();this.setStatus('Change could not be saved: '+(error?.message||'PDF write error'))}
  }
  async save(){if(!this.doc)return;try{this.currentBytes=PdfWriter.write(this.doc);const url=URL.createObjectURL(new Blob([this.currentBytes],{type:'application/pdf'}));this.download.href=url;this.download.download=this.fileNameValue;this.outputPanel.style.display='block';this.setStatus('Edited PDF is ready to download.')}catch(error){this.setStatus('Could not save the PDF: '+(error?.message||'PDF write error'))}}
  async undo(){if(!this.history.length)return;const current=PdfWriter.write(this.doc),bytes=this.history.pop();this.future.push(current);try{this.doc=await PdfDocument.open(bytes);this.currentBytes=bytes;this.pageIndex=Math.min(this.pageIndex,this.doc.getPageCount()-1);await this.renderPage();this.updateHistoryButtons();this.setStatus('Undid the last change.')}catch(error){this.setStatus('Undo failed: '+(error?.message||'PDF open error'))}}
  async redo(){if(!this.future.length)return;const current=PdfWriter.write(this.doc),bytes=this.future.pop();this.history.push(current);try{this.doc=await PdfDocument.open(bytes);this.currentBytes=bytes;this.pageIndex=Math.min(this.pageIndex,this.doc.getPageCount()-1);await this.renderPage();this.updateHistoryButtons();this.setStatus('Redid the last change.')}catch(error){this.setStatus('Redo failed: '+(error?.message||'PDF open error'))}}
  async goPage(index){if(!this.doc)return;this.pageIndex=Math.max(0,Math.min(index,this.doc.getPageCount()-1));await this.renderPage()}
  renderThumbnails(){if(!this.thumbs||!this.doc)return;this.thumbs.innerHTML='';for(let i=0;i<this.doc.getPageCount();i++){const h=document.createElement('button');h.type='button';h.className='pdf-thumb'+(i===this.pageIndex?' active':'');h.innerHTML='<div class="pdf-thumb-page"></div><span>'+(i+1)+'</span>';try{h.querySelector('.pdf-thumb-page').innerHTML=this.doc.getPage(i).renderToSvg({scale:.18,background:'#fff'})}catch(_){}h.addEventListener('click',()=>this.goPage(i));this.thumbs.appendChild(h)}}
  setMode(mode){this.mode=mode;['pdf-select-tool','pdf-add-text-tool','pdf-cover-tool'].forEach(id=>document.getElementById(id)?.classList.remove('active'));const map={select:'pdf-select-tool',add:'pdf-add-text-tool',cover:'pdf-cover-tool'};if(map[mode])document.getElementById(map[mode])?.classList.add('active');this.showPanel(mode==='add'||mode==='place-text'?'add':mode==='cover'?'cover':this.selectedItem?'text':'empty');this.stage.style.cursor=mode==='cover'||mode==='add'||mode==='place-text'?'crosshair':'default'}
  showPanel(which){this.emptyPanel.style.display=which==='empty'?'block':'none';this.selectedPanel.style.display=which==='text'?'block':'none';this.addPanel.style.display=which==='add'||which==='place-text'?'block':'none';this.coverPanel.style.display=which==='cover'?'block':'none'}
  clearSelection(showEmpty=true){this.selectedItem=null;this.stage?.querySelectorAll('.pdf-text-overlay.selected').forEach(x=>x.classList.remove('selected'));if(showEmpty)this.showPanel('empty')}
  setZoom(v){this.zoom=Math.max(.5,Math.min(2.5,v));this.applyZoom()}
  applyZoom(){this.zoomLabel.textContent=Math.round(this.zoom*100)+'%';this.stage.style.transform='scale('+this.zoom+')';this.stage.style.marginBottom=Math.max(0,this.stage.offsetHeight*(this.zoom-1))+'px';this.stage.style.marginRight=Math.max(0,this.stage.offsetWidth*(this.zoom-1))+'px'}
  fitPage(){if(!this.doc||!this.canvasArea)return;const size=this.doc.getPage(this.pageIndex).getSize(),available=Math.max(260,this.canvasArea.clientWidth-68);this.setZoom(Math.max(.5,Math.min(1.5,available/size.width)))}
  updateHistoryButtons(){document.getElementById('pdf-undo').disabled=!this.history.length;document.getElementById('pdf-redo').disabled=!this.future.length}
  setStatus(message){if(this.status)this.status.textContent=message}
}
window.addEventListener('DOMContentLoaded',()=>new PdfEditTool());
