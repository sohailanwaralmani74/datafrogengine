import { PdfDocument } from '../document/PdfDocument.js';
import { PdfTextExtractor } from '../extraction/PdfTextExtractor.js';
import { PdfImageExtractor } from '../images/PdfImageExtractor.js';
import { PdfFont } from '../fonts/PdfFont.js';
import { PdfPageOperations } from '../operations/PdfPageOperations.js';
import { PdfContentBuilder } from '../content/PdfContentBuilder.js';
import { PdfObjectWriter } from '../writer/PdfObjectWriter.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfStream } from '../objects/PdfStream.js';
import { FlateEncode } from '../streams/filters/FlateEncode.js';

class PdfWordEditor {
  constructor(){
    this.fileInput=document.getElementById('pdf-word-file');
    this.upload=document.getElementById('pdf-word-upload');
    this.workspace=document.getElementById('pdf-word-workspace');
    this.docEl=document.getElementById('pdf-word-document');
    this.thumbs=document.getElementById('pdf-word-thumbs');
    this.statusEl=document.getElementById('pdf-word-status');
    this.pageLabel=document.getElementById('pdf-word-page-label');
    this.font=document.getElementById('pdf-word-font');
    this.size=document.getElementById('pdf-word-size');
    this.doc=null; this.source=null; this.models=[]; this.history=[]; this.future=[]; this.activePage=0;
    this.bind();
  }

  bind(){
    document.getElementById('pdf-word-browse')?.addEventListener('click',()=>this.fileInput?.click());
    this.fileInput?.addEventListener('change',e=>e.target.files?.[0]&&this.load(e.target.files[0]));
    this.upload?.addEventListener('dragover',e=>{e.preventDefault();this.upload.style.borderColor='#ef4444'});
    this.upload?.addEventListener('dragleave',()=>this.upload.style.borderColor='');
    this.upload?.addEventListener('drop',e=>{e.preventDefault();this.upload.style.borderColor='';const f=e.dataTransfer?.files?.[0];if(f)this.load(f)});
    document.querySelectorAll('[data-cmd]').forEach(b=>b.addEventListener('click',()=>document.execCommand(b.dataset.cmd,false,null)));
    this.font?.addEventListener('change',()=>document.execCommand('fontName',false,this.font.value));
    this.size?.addEventListener('change',()=>document.execCommand('fontSize',false,'7'));
    document.getElementById('pdf-word-add-table')?.addEventListener('click',()=>this.insertTable());
    document.getElementById('pdf-word-download')?.addEventListener('click',()=>this.downloadPdf());
    document.getElementById('pdf-word-undo')?.addEventListener('click',()=>document.execCommand('undo'));
    document.getElementById('pdf-word-redo')?.addEventListener('click',()=>document.execCommand('redo'));
  }

  setStatus(s){if(this.statusEl)this.statusEl.textContent=s}

  async load(file){
    try{
      this.setStatus('Reading PDF…');
      this.source=new Uint8Array(await file.arrayBuffer());
      this.doc=await PdfDocument.open(this.source);
      this.models=Array.from({length:this.doc.getPageCount()},(_,i)=>this.extractPage(i));
      this.upload.style.display='none'; this.workspace.style.display='block';
      this.renderAll(); this.setStatus('PDF converted to an editable document. Click anywhere and edit.');
    }catch(e){this.setStatus('Could not open this PDF: '+(e?.message||'unsupported PDF structure'))}
  }

  extractPage(index){
    const page=this.doc.getPage(index), size=page.getSize();
    let items=[]; let images=[];
    try{items=PdfTextExtractor.extractTextItems(page)||[]}catch(e){}
    try{images=PdfImageExtractor.extractImages(page)||[]}catch(e){}
    items.sort((a,b)=>b.y-a.y||a.x-b.x);
    const lines=[];
    for(const item of items){
      let line=lines.find(l=>Math.abs(l.y-item.y)<=Math.max(2,item.height*.45));
      if(!line){line={y:item.y,height:item.height,items:[]};lines.push(line)}
      line.items.push(item); line.height=Math.max(line.height,item.height);
    }
    lines.sort((a,b)=>b.y-a.y);
    return {index,size,items,images,lines};
  }

  renderAll(){
    this.docEl.innerHTML=''; this.thumbs.innerHTML='';
    this.models.forEach((model,i)=>{
      const page=document.createElement('section'); page.className='pdf-word-page'; page.dataset.page=i;
      page.style.width=model.size.width+'px'; page.style.height=model.size.height+'px';
      const content=document.createElement('div'); content.className='pdf-word-page-content'; content.contentEditable='true'; content.spellcheck=false;
      const top=model.size.height-(model.lines[0]?.y||model.size.height);
      let previousY=model.size.height;
      for(const line of model.lines){
        const div=document.createElement('div'); div.className='pdf-word-line';
        const gap=Math.max(0,previousY-line.y-line.height*.95); div.style.marginTop=(i===0&&div===content.firstChild?0:gap)+'px';
        line.items.sort((a,b)=>a.x-b.x).forEach(item=>{
          const span=document.createElement('span'); span.className='pdf-word-run'; span.textContent=item.text;
          span.dataset.fontResource=item.fontResource||''; span.dataset.fontName=item.fontName||''; span.dataset.fontSize=item.fontSize||12;
          span.dataset.x=item.x; span.dataset.y=item.y; span.dataset.width=item.width; span.dataset.height=item.height;
          span.style.fontSize=(item.fontSize||12)+'px'; span.style.fontFamily=this.cssFont(item.fontName);
          div.appendChild(span);
        });
        content.appendChild(div); previousY=line.y;
      }
      model.images.forEach(img=>{
        const el=document.createElement('img'); el.className='pdf-word-image'; el.src=img.toDataUrl();
        const p=img.position||{x:0,y:0,width:img.width,height:img.height};
        el.style.left=p.x+'px'; el.style.top=(model.size.height-p.y-p.height)+'px'; el.style.width=p.width+'px'; el.style.height=p.height+'px'; el.contentEditable='false';
        page.appendChild(el);
      });
      page.appendChild(content); this.docEl.appendChild(page);
      page.addEventListener('focusin',()=>{this.activePage=i;this.pageLabel.textContent='Page '+(i+1)+' of '+this.models.length});
      const thumb=document.createElement('button'); thumb.type='button'; thumb.className='pdf-word-thumb'; thumb.innerHTML='<div class="pdf-word-thumb-page"></div><small style="color:#cbd5e1">Page '+(i+1)+'</small>';
      thumb.onclick=()=>page.scrollIntoView({behavior:'smooth',block:'start'});
      const t=thumb.querySelector('.pdf-word-thumb-page'); t.style.aspectRatio=(model.size.width/model.size.height);
      model.lines.slice(0,10).forEach(line=>{const s=document.createElement('div');s.className='thumb-line';s.textContent=line.items.map(x=>x.text).join('');s.style.left=(line.items[0]?.x||0)/model.size.width*100+'%';s.style.top=(model.size.height-line.y)/model.size.height*100+'%';s.style.fontSize=Math.max(2,(line.height/model.size.height)*100)+'%';t.appendChild(s)});
      this.thumbs.appendChild(thumb);
    });
    this.activePage=0; this.pageLabel.textContent='Page 1 of '+this.models.length;
  }

  cssFont(name){
    const n=String(name||'').toLowerCase();
    if(n.includes('times')||n.includes('serif'))return 'Times New Roman,serif';
    if(n.includes('courier')||n.includes('mono'))return 'Courier New,monospace';
    return 'Arial,sans-serif';
  }

  insertTable(){
    const page=this.docEl.querySelector('.pdf-word-page-content[contenteditable="true"]:focus')||this.docEl.querySelector('.pdf-word-page-content');
    if(!page)return;
    const table=document.createElement('table'); table.style.borderCollapse='collapse'; table.style.width='100%'; table.contentEditable='true';
    table.innerHTML='<tbody><tr><td> </td><td> </td></tr><tr><td> </td><td> </td></tr></tbody>';
    table.querySelectorAll('td').forEach(td=>{td.style.border='1px solid #999';td.style.padding='6px'});
    const sel=window.getSelection(); if(sel&&sel.rangeCount){sel.getRangeAt(0).insertNode(table)}else page.appendChild(table);
  }

  async downloadPdf(){
    if(!this.doc)return;
    try{
      this.setStatus('Building edited PDF…');
      const output=await this.buildPdf();
      const blob=new Blob([output],{type:'application/pdf'}),url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='edited.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      this.setStatus('Edited PDF downloaded.');
    }catch(e){console.error(e);this.setStatus('PDF export failed: '+(e?.message||'unknown error'))}
  }

  async buildPdf(){
    // Preserve the original page structure/resources. Text edits are written
    // back into the existing PDF where an unchanged source run can be matched.
    // New/changed HTML content is appended as PDF text using its source font resource.
    const out=await PdfDocument.open(this.source);
    for(let i=0;i<this.models.length;i++){
      const page=out.getPage(i), model=this.models[i], domPage=this.docEl.querySelector(`.pdf-word-page[data-page="${i}"]`);
      const runs=[...domPage.querySelectorAll('.pdf-word-run')];
      const original=model.items;
      for(let r=0;r<Math.min(runs.length,original.length);r++){
        const run=runs[r], old=original[r], text=run.textContent||'';
        if(text===old.text)continue;
        const result=await this.replaceRun(page,old,text);
        if(!result) this.overlayRun(page,old,text);
      }
    }
    return this.write(out);
  }

  async replaceRun(page,item,text){
    const resources=page.getResources(),fd=resources.getFont(item.fontResource);
    if(!fd)return false;
    const font=PdfFont.create(fd,page.document),encoded=font.encodeString(text);
    if(!encoded)return false;
    for(const stream of page.getContents()){
      let ops;try{ops=(await import('../content/PdfContentParser.js')).PdfContentParser.parse(stream)}catch(e){continue}
      let current=null;
      for(const op of ops){
        if(op.name==='Tf'){current=op.getName(0);continue}
        if(!['Tj',"'",'"'].includes(op.name)||current!==item.fontResource)continue;
        const idx=op.name==='"' ? 2:0,val=op.getArg(idx);
        if(!(val instanceof PdfString))continue;
        if(!val.bytes||val.bytes.length!==item.rawBytes.length||!val.bytes.every((v,j)=>v===item.rawBytes[j]))continue;
        op.args[idx]=PdfString.of(String.fromCharCode(...encoded),encoded);
        const bytes=this.serializeOps(ops);stream.setBytes(FlateEncode.encode(bytes));stream.dictionary.delete('DecodeParms');stream.dictionary.set('Filter',PdfName.of('FlateDecode'));return true;
      }
    }
    return false;
  }

  overlayRun(page,item,text){
    const mod=page.getModifier();
    mod.drawRectangle({x:item.x-1,y:item.y-item.height*.25,width:Math.max(item.width+2,8),height:item.height*1.2,fillColor:'#ffffff'});
    const resources=page.getResources(),fd=resources.getFont(item.fontResource),font=fd?PdfFont.create(fd,page.document):null;
    const encoded=font?.encodeString(text);
    if(encoded){
      mod.builder.raw(`q BT /${item.fontResource} ${item.fontSize} Tf 1 0 0 1 ${item.x} ${item.y} Tm <${Array.from(encoded).map(b=>b.toString(16).padStart(2,'0')).join('')}> Tj ET Q`);
      mod.commit();
    }else{
      mod.drawText(text,{x:item.x,y:item.y,size:item.fontSize,font:'Helvetica'}).commit();
    }
  }

  serializeOps(ops){
    const chunks=[];
    for(const op of ops){for(const arg of op.args){chunks.push(PdfObjectWriter.serialize(arg));chunks.push(new TextEncoder().encode(' '))}chunks.push(new TextEncoder().encode(op.name+'\n'))}
    return PdfObjectWriter.concatBytes(chunks);
  }

  write(doc){
    return PdfDocumentWriterShim.write(doc);
  }
}

class PdfDocumentWriterShim{
  static async write(doc){
    const mod=await import('../writer/PdfWriter.js');
    return mod.PdfWriter.write(doc);
  }
}

new PdfWordEditor();
