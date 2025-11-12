/*! nab-editor v1.0.3 | MIT */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('jquery'));
  } else {
    root.NabEditor = factory(root.jQuery);
  }
}(typeof self !== 'undefined' ? self : this, function ($) {
  'use strict';
  if (!$) throw new Error('NabEditor: jQuery 3.7+ is required');

  /* ---------- utils ---------- */
  const blockTags=/^(P|DIV|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|PRE|LI|TD|TH)$/i;
  const inside=(node,root)=>{ if(!node) return false; if(node.nodeType===3) node=node.parentNode; return root.contains(node); };
  const exec=(cmd,val=null)=>document.execCommand(cmd,false,val);
  let UID=1; const uid=()=>`nab${(UID++).toString(36)}`;

  function sanitize(html){
    const t=document.createElement('template'); t.innerHTML=html;
    $(t.content).find('script,style').remove();
    $(t.content).find('*').each(function(){
      [...this.attributes].forEach(a=>{
        const n=a.name.toLowerCase(), v=(a.value||'').toLowerCase();
        if(n.startsWith('on')) this.removeAttribute(a.name);
        if(n==='href' && v.startsWith('javascript:')) this.removeAttribute('href');
      });
    });
    return t.innerHTML;
  }
  function clean(html){
    const t=document.createElement('template'); t.innerHTML=html;
    const strip=s=>s.replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\u00A0/g,' ')
                    .replace(/[ \t]+/g,' ').replace(/ *\n+ */g,'\n').trim();
    const w=document.createTreeWalker(t.content,NodeFilter.SHOW_TEXT,null);
    const rm=[]; while(w.nextNode()){ const n=w.currentNode; n.nodeValue=strip(n.nodeValue); if(!n.nodeValue) rm.push(n); }
    rm.forEach(n=>n.parentNode&&n.parentNode.removeChild(n));
    $(t.content).find('*').each(function(){
      const tag=this.tagName;
      if(['BR','IMG','HR','TD','TH','TR','TABLE'].includes(tag)) return;
      if(!this.children.length && !(this.textContent||'').trim()) this.remove();
    });
    $(t.content).find('br+br').each(function(){ $(this).remove(); });
    return sanitize(t.innerHTML);
  }
  function getRangeInEditable(ed){
    const sel=window.getSelection(); if(!sel||!sel.rangeCount) return null;
    const r=sel.getRangeAt(0); const c=r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentNode;
    return ed.contains(c)?r:null;
  }
  function getBlockAncestor(node,root){
    let n=(node.nodeType===1?node:node.parentNode);
    while(n&&n!==root){ if(blockTags.test(n.nodeName)) return n; n=n.parentNode; }
    return null;
  }
  function blocksInRange(range,root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT,{
      acceptNode(node){
        if(!blockTags.test(node.nodeName)) return NodeFilter.FILTER_SKIP;
        const nr=document.createRange(); try{nr.selectNodeContents(node);}catch(e){return NodeFilter.FILTER_SKIP;}
        const s=range.compareBoundaryPoints(Range.END_TO_START,nr);
        const e=range.compareBoundaryPoints(Range.START_TO_END,nr);
        return (s<0&&e>0)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP;
      }
    });
    const arr=[]; while(walker.nextNode()) arr.push(walker.currentNode);
    if(!arr.length){ const b=getBlockAncestor(range.startContainer,root); if(b) arr.push(b); }
    return arr;
  }
  function replaceBlockTag(block,newTag){
    if(!block||block.nodeName===newTag.toUpperCase()) return block;
    const nb=document.createElement(newTag);
    if(block.getAttribute('style')) nb.setAttribute('style', block.getAttribute('style'));
    if(block.getAttribute('class')) nb.setAttribute('class', block.getAttribute('class'));
    while(block.firstChild) nb.appendChild(block.firstChild);
    block.parentNode.replaceChild(nb,block);
    return nb;
  }
  function wrapRangeBlock(range,tag){
    if(range.collapsed){
      const el=document.createElement(tag); el.innerHTML='&#8203;'; range.insertNode(el);
      const r=document.createRange(); r.setStart(el.firstChild,1); r.collapse(true);
      const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r); return;
    }
    const frag=range.extractContents(); const el=document.createElement(tag); el.appendChild(frag);
    range.insertNode(el); const r=document.createRange(); r.selectNodeContents(el);
    const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  function wrapRangeInline(range,styleObj){
    if(range.collapsed){
      const s=document.createElement('span'); Object.assign(s.style,styleObj); s.textContent="\u200B";
      range.insertNode(s); const r=document.createRange(); r.setStart(s.firstChild,1); r.collapse(true);
      const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r); return;
    }
    const frag=range.extractContents(); const s=document.createElement('span'); Object.assign(s.style,styleObj); s.appendChild(frag);
    range.insertNode(s); const r=document.createRange(); r.selectNodeContents(s);
    const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }

  /* ---------- class ---------- */
  class NabEditor{
    constructor(target,opts={}){
      this.$host=(target instanceof $)?target:$(target);
      if(!this.$host.length) throw new Error('NabEditor: target not found');
      this.opts=Object.assign({name:'content',placeholder:'Start typing…',zoom:1,onChange:null},opts);
      this.id=uid();
      this.build(); this.bind(); this.sync();
    }

    build(){
      const tpl=`
      <div class="nab nab-wrap" data-nab="${this.id}">
        <div class="nab-doc">
          <div class="nab-toolbar" role="toolbar">
            <div class="nab-group">
              <button type="button" class="nab-btn" data-cmd="undo"><i class="fa fa-rotate-left"></i></button>
              <button type="button" class="nab-btn" data-cmd="redo"><i class="fa fa-rotate-right"></i></button>
            </div>
            <div class="nab-group">
              <select class="nab-sel" data-act="block">
                <option value="P">Paragraph</option><option value="H1">Heading 1</option>
                <option value="H2">Heading 2</option><option value="H3">Heading 3</option>
                <option value="H4">Heading 4</option><option value="H5">Heading 5</option>
                <option value="H6">Heading 6</option>
              </select>
              <select class="nab-sel" data-act="fontName">
                <option value="">Font: Default</option>
                <option value="Arial, Helvetica, sans-serif">Arial</option>
                <option value="'Times New Roman', Times, serif">Times New Roman</option>
                <option value="Georgia, 'Times New Roman', Times, serif">Georgia</option>
                <option value="'Trebuchet MS', Helvetica, sans-serif">Trebuchet MS</option>
                <option value="'Courier New', Courier, monospace">Courier New</option>
              </select>
              <select class="nab-sel" data-act="fontSizePx"></select>
            </div>
            <div class="nab-group">
              <button class="nab-btn" data-cmd="bold"><i class="fa fa-bold"></i></button>
              <button class="nab-btn" data-cmd="italic"><i class="fa fa-italic"></i></button>
              <button class="nab-btn" data-cmd="underline"><i class="fa fa-underline"></i></button>
              <button class="nab-btn" data-cmd="strikeThrough"><i class="fa fa-strikethrough"></i></button>
              <button class="nab-btn" data-cmd="superscript"><i class="fa fa-superscript"></i></button>
              <button class="nab-btn" data-cmd="subscript"><i class="fa fa-subscript"></i></button>
              <button class="nab-btn" data-cmd="removeFormat"><i class="fa fa-eraser"></i></button>
            </div>
            <div class="nab-group">
              <button class="nab-btn" data-cmd="justifyLeft"><i class="fa fa-align-left"></i></button>
              <button class="nab-btn" data-cmd="justifyCenter"><i class="fa fa-align-center"></i></button>
              <button class="nab-btn" data-cmd="justifyRight"><i class="fa fa-align-right"></i></button>
              <button class="nab-btn" data-cmd="justifyFull"><i class="fa fa-align-justify"></i></button>
              <button class="nab-btn" data-cmd="insertHorizontalRule"><i class="fa fa-minus"></i></button>
            </div>
            <div class="nab-group">
              <button class="nab-btn" data-cmd="insertUnorderedList"><i class="fa fa-list-ul"></i></button>
              <button class="nab-btn" data-cmd="insertOrderedList"><i class="fa fa-list-ol"></i></button>
              <button class="nab-btn" data-cmd="outdent"><i class="fa fa-outdent"></i></button>
              <button class="nab-btn" data-cmd="indent"><i class="fa fa-indent"></i></button>
            </div>
            <div class="nab-group">
              <button class="nab-btn" data-act="link"><i class="fa fa-link"></i></button>
              <button class="nab-btn" data-act="unlink"><i class="fa fa-unlink"></i></button>
              <button class="nab-btn" data-act="image"><i class="fa-regular fa-image"></i></button>
              <input type="file" accept="image/*" class="nab-file" hidden />
              <button class="nab-btn" data-act="table"><i class="fa fa-table"></i></button>
            </div>
            <div class="nab-group">
              <label class="nab-btn"><i class="fa fa-droplet"></i>
                <input type="color" class="nab-color" data-cmd="foreColor" />
              </label>
              <label class="nab-btn"><i class="fa fa-highlighter"></i>
                <input type="color" class="nab-color" data-cmd="hiliteColor" />
              </label>
              <button class="nab-btn" data-act="cleanup"><i class="fa fa-broom"></i></button>
              <button class="nab-btn" data-act="clearAll"><i class="fa fa-trash-can"></i></button>
            </div>
            <div class="nab-group">
              <label>Zoom</label>
              <select class="nab-sel" data-act="zoom">
                <option value="0.90">90%</option><option value="1.00" selected>100%</option>
                <option value="1.25">125%</option><option value="1.50">150%</option>
              </select>
            </div>
            <div class="nab-group"><span class="nab-kbd">Ctrl/Cmd + B/I/U</span></div>
          </div>
        </div>

        <div class="nab-frame">
          <div class="nab-doc">
            <div class="nab-paper nab-clearfix">
              <div class="nab-editable" contenteditable="true"></div>
            </div>
            <div class="nab-status"><span class="nab-msg">Ready</span><span class="nab-cnt">0 chars used</span></div>
            <input type="hidden" class="nab-hidden" />
          </div>
        </div>
      </div>`;
      this.$root=$(tpl); this.$host.empty().append(this.$root);
      this.$toolbar=this.$root.find('.nab-toolbar');
      this.$editable=this.$root.find('.nab-editable');
      this.$hidden=this.$root.find('.nab-hidden');
      this.$cnt=this.$root.find('.nab-cnt');
      this.$file=this.$root.find('.nab-file');

      /* body portals */
      this.$resizer=$(`
        <div class="nab-portal-resizer" data-nab="${this.id}" aria-hidden="true">
          <div class="ir-handle nw" data-pos="nw"></div><div class="ir-handle ne" data-pos="ne"></div>
          <div class="ir-handle sw" data-pos="sw"></div><div class="ir-handle se" data-pos="se"></div>
          <div class="ir-handle n" data-pos="n"></div><div class="ir-handle s" data-pos="s"></div>
          <div class="ir-handle w" data-pos="w"></div><div class="ir-handle e" data-pos="e"></div>
        </div>`);
      this.$imgTools=$(`
        <div class="nab-portal-tools nab-image" data-nab="${this.id}">
          <button class="nab-btn" data-img="left"><i class="fa-solid fa-align-left"></i></button>
          <button class="nab-btn" data-img="right"><i class="fa-solid fa-align-right"></i></button>
          <button class="nab-btn" data-img="inline"><i class="fa-solid fa-text-height"></i></button>
          <button class="nab-btn" data-img="para"><i class="fa-solid fa-paragraph"></i></button>
          <button class="nab-btn" data-img="remove"><i class="fa-regular fa-trash-can"></i></button>
        </div>`);
      this.$tblTools=$(`
        <div class="nab-portal-tools nab-table" data-nab="${this.id}">
          <button class="nab-btn" data-tt="row-above"><i class="fa-solid fa-arrow-up"></i></button>
          <button class="nab-btn" data-tt="row-below"><i class="fa-solid fa-arrow-down"></i></button>
          <button class="nab-btn" data-tt="col-left"><i class="fa-solid fa-arrow-left"></i></button>
          <button class="nab-btn" data-tt="col-right"><i class="fa-solid fa-arrow-right"></i></button>
          <button class="nab-btn" data-tt="del-rows"><i class="fa-solid fa-delete-left"></i></button>
          <button class="nab-btn" data-tt="del-cols"><i class="fa-regular fa-square-minus"></i></button>
          <button class="nab-btn" data-tt="del-table"><i class="fa-regular fa-trash-can"></i></button>
        </div>`);
      $(document.body).append(this.$resizer,this.$imgTools,this.$tblTools);

      /* config */
      this.$editable.attr('data-ph', this.opts.placeholder);
      this.$hidden.attr('name', this.opts.name);

      const $fs=this.$toolbar.find('select[data-act="fontSizePx"]').empty();
      for(let i=8;i<=48;i++) $fs.append(`<option value="${i}" ${i===16?'selected':''}>${i} px</option>`);
      document.documentElement.style.setProperty('--base-font',(16*(this.opts.zoom||1))+'px');
    }

    bind(){
      const $ed=this.$editable, $tb=this.$toolbar;
      const ns='.'+this.id;

      /* selection store (per instance) */
      const store=new WeakMap();
      const saveSel=()=>{ const s=window.getSelection(); if(s&&s.rangeCount){ const r=s.getRangeAt(0); if(inside(r.commonAncestorContainer,$ed[0])) store.set($ed[0],r.cloneRange()); }};
      const restoreSel=()=>{ const r=store.get($ed[0]); if(!r) return false; const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); return true; };

      /* toolbar */
      $tb.on('mousedown','button,select,label,input[type="color"]',function(e){ e.preventDefault(); saveSel(); });
      $tb.on('click','.nab-btn[data-cmd]',(e)=>{ restoreSel(); exec($(e.currentTarget).data('cmd')); saveSel(); this.sync(); });
      $tb.on('input','.nab-color',(e)=>{ restoreSel(); exec($(e.currentTarget).data('cmd'),$(e.currentTarget).val()); saveSel(); this.sync(); });
      $tb.on('change','select.nab-sel',(e)=>{
        const act=$(e.currentTarget).data('act');
        if(!['block','fontName','fontSizePx','zoom'].includes(act)) return;
        if(act==='zoom'){ const z=parseFloat($(e.currentTarget).val()||'1'); document.documentElement.style.setProperty('--base-font',(16*z)+'px'); return this.sync(); }
        restoreSel();
        let range=getRangeInEditable($ed[0]);
        if(!range){ const r=document.createRange(); r.selectNodeContents($ed[0]); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); range=r; }
        if(act==='block'){ const tag=$(e.currentTarget).val(); const blocks=blocksInRange(range,$ed[0]); if(blocks.length){ blocks.forEach(b=>{ if(b&&b!==$ed[0]) replaceBlockTag(b,tag); }); } else { wrapRangeBlock(range,tag); } }
        if(act==='fontName'){ const v=$(e.currentTarget).val(); wrapRangeInline(range, v?{fontFamily:v}:{fontFamily:''}); }
        if(act==='fontSizePx'){ const px=parseInt($(e.currentTarget).val(),10)||16; wrapRangeInline(range,{fontSize:px+'px'}); }
        saveSel(); this.sync();
      });
      $tb.on('click','.nab-btn[data-act]',(e)=>{
        const act=$(e.currentTarget).data('act'); restoreSel();
        if(act==='link'){ const u=prompt('Enter URL (https://...)'); if(u) exec('createLink',u); }
        else if(act==='unlink'){ exec('unlink'); }
        else if(act==='image'){ this.$file.trigger('click'); }
        else if(act==='table'){ const r=parseInt(prompt('Rows?','3')||'3',10), c=parseInt(prompt('Columns?','3')||'3',10); if(r>0&&c>0){ let h='<table>'; for(let i=0;i<r;i++){ h+='<tr>'; for(let j=0;j<c;j++){ h+=i===0?'<th>&nbsp;</th>':'<td>&nbsp;</td>'; } h+='</tr>'; } h+='</table>'; exec('insertHTML',h); } }
        else if(act==='cleanup'){ $ed.html(clean($ed.html())); }
        else if(act==='clearAll'){ if(confirm('Clear the entire document?')){ $ed.html(''); this.hideImgUI(); this.hideTableTools(); } }
        saveSel(); this.sync();
      });

      /* file → image */
      this.$file.on('change',(ev)=>{
        const f=ev.target.files&&ev.target.files[0]; if(!f) return;
        const reader=new FileReader();
        reader.onload=()=>{
          restoreSel(); exec('insertImage',reader.result);
          const $imgs=$ed.find('img');
          if($imgs.length){ const img=$imgs.last()[0]; $(img).removeClass('nab-img-left nab-img-right'); this.ensureParagraphAfter(img,true); this.imgTarget=img; this.positionImgResizer(); this.positionImgTools(); }
          ev.target.value=''; saveSel(); this.sync();
        };
        reader.readAsDataURL(f);
      });

      /* input/paste */
      $ed.on('input',()=>this.sync());
      $ed.on('paste',(ev)=>{
        ev.preventDefault();
        const dt=ev.originalEvent.clipboardData||window.clipboardData;
        const html=dt.getData('text/html'), text=dt.getData('text');
        if(html) exec('insertHTML', clean(html)); else exec('insertText',(text||'').replace(/\s+/g,' ').trim());
        this.sync();
      });

      /* selection tracking */
      $ed.on('keyup mouseup', ()=>saveSel());
      document.addEventListener('selectionchange', ()=>{
        const s=window.getSelection(); if(s&&s.rangeCount){ const c=s.getRangeAt(0).commonAncestorContainer; if(c&&$ed[0].contains(c)) saveSel(); }
      });

      /* image overlays */
      this.$resizer.on('mousedown','.ir-handle',(e)=>{ e.preventDefault(); e.stopPropagation(); this.beginResize($(e.currentTarget).data('pos'),e); });
      $(document).on('mousemove'+ns,(e)=>{ if(this.resizing) this.applyResize(e); });
      $(document).on('mouseup'+ns,()=>this.endResize());
      $(window).on('scroll'+ns+' resize'+ns, ()=>{ this.positionImgResizer(); this.positionImgTools(); if(this._lastCells) this.positionTableTools(this._lastCells); });
      try{ this._ro=new ResizeObserver(()=>{ this.positionImgResizer(); this.positionImgTools(); if(this._lastCells) this.positionTableTools(this._lastCells); }); this._ro.observe(document.body); }catch(_){}

      this.$root.on('click','.nab-editable img',(e)=>{ e.preventDefault(); this.imgTarget=e.currentTarget; this.positionImgResizer(); this.positionImgTools(); });
      $(document).on('mousedown'+ns,(e)=>{
        const $t=$(e.target);
        if(!$t.closest(this.$resizer).length && !$t.closest(this.$imgTools).length && !$t.closest('.nab-editable img').length) this.hideImgUI();
        if(!$t.closest(this.$tblTools).length && !$t.is('td,th')) this.hideTableTools();
      });
      document.addEventListener('keydown',(e)=>{ if(!this.imgTarget) return; if(e.key==='Backspace'||e.key==='Delete'){ setTimeout(()=>{ if(!document.body.contains(this.imgTarget)) this.hideImgUI(); },0); } });

      this.$imgTools.on('click','.nab-btn',(e)=>{
        if(!this.imgTarget) return;
        const act=$(e.currentTarget).data('img');
        if(act==='left'){ $(this.imgTarget).removeClass('nab-img-right').addClass('nab-img-left'); this.ensureParagraphAfter(this.imgTarget); }
        else if(act==='right'){ $(this.imgTarget).removeClass('nab-img-left').addClass('nab-img-right'); this.ensureParagraphAfter(this.imgTarget); }
        else if(act==='inline'){ $(this.imgTarget).removeClass('nab-img-left nab-img-right').css({display:'inline',float:''}); this.ensureParagraphAfter(this.imgTarget); }
        else if(act==='para'){ this.ensureParagraphAfter(this.imgTarget,true); }
        else if(act==='remove'){ const $e=$(this.imgTarget).closest('.nab-editable'); $(this.imgTarget).remove(); $e.focus(); this.hideImgUI(); }
        this.positionImgResizer(); this.positionImgTools();
      });

      /* table selection/tools */
      let selecting=false, anchor=null, $activeTable=null;
      const cellCoords=$c=>({row:$c.parent().index(), col:$c.index()});
      const norm=(a,b)=>({r1:Math.min(a.row,b.row), r2:Math.max(a.row,b.row), c1:Math.min(a.col,b.col), c2:Math.max(a.col,b.col)});
      const selectRect=($t,rect)=>{
        $t.find('td,th').removeClass('nab-cell-selected');
        $t.find('tr').each(function(r){
          if(r<rect.r1||r>rect.r2) return;
          $(this).children('th,td').each(function(c){ if(c<rect.c1||c>rect.c2) return; $(this).addClass('nab-cell-selected'); });
        });
      };

      $ed.on('mousedown','td,th',(e)=>{
        this.hideImgUI(); selecting=true;
        const $cell=$(e.currentTarget); $activeTable=$cell.closest('table'); anchor=cellCoords($cell);
        $activeTable.find('td,th').removeClass('nab-cell-selected');
        $activeTable.find('tr').eq(anchor.row).children('th,td').eq(anchor.col).addClass('nab-cell-selected');
        this._lastCells=$activeTable.find('.nab-cell-selected'); this.positionTableTools(this._lastCells); e.preventDefault();
      });
      $ed.on('mouseover','td,th',(e)=>{
        if(!selecting||!$activeTable) return;
        const cur=cellCoords($(e.currentTarget)); selectRect($activeTable, norm(anchor,cur));
        this._lastCells=$activeTable.find('.nab-cell-selected'); this.positionTableTools(this._lastCells);
      });
      $(document).on('mouseup'+ns+'-tbl',()=>{ if(selecting) selecting=false; });

      this.$tblTools.on('click','.nab-btn',(e)=>{
        const act=$(e.currentTarget).data('tt');
        const $cells=$ed.find('.nab-cell-selected'); const $tbl=$cells.length?$cells.first().closest('table'):null; if(!$tbl) return;
        const rows=[...new Set($cells.map(function(){return $(this).parent().index();}).get())].sort((a,b)=>a-b);
        const cols=[...new Set($cells.map(function(){return $(this).index();}).get())].sort((a,b)=>a-b);
        if(act==='row-above'&&rows.length){ const r0=rows[0], n=$tbl.find('tr:first').children('th,td').length, $tr=$('<tr/>'); for(let i=0;i<n;i++) $tr.append('<td>&nbsp;</td>'); $tbl.find('tr').eq(r0).before($tr); }
        if(act==='row-below'&&rows.length){ const r1=rows[rows.length-1], n=$tbl.find('tr:first').children('th,td').length, $tr=$('<tr/>'); for(let i=0;i<n;i++) $tr.append('<td>&nbsp;</td>'); $tbl.find('tr').eq(r1).after($tr); }
        if(act==='col-left'&&cols.length){ const c0=cols[0]; $tbl.find('tr').each(function(i){ const tag=i===0?'th':'td'; $(this).children('th,td').eq(c0).before(`<${tag}>&nbsp;</${tag}>`); }); }
        if(act==='col-right'&&cols.length){ const c1=cols[cols.length-1]; $tbl.find('tr').each(function(i){ const tag=i===0?'th':'td'; $(this).children('th,td').eq(c1).after(`<${tag}>&nbsp;</${tag}>`); }); }
        if(act==='del-rows'&&rows.length){ for(let i=rows.length-1;i>=0;i--) $tbl.find('tr').eq(rows[i]).remove(); }
        if(act==='del-cols'&&cols.length){ $tbl.find('tr').each(function(){ for(let i=cols.length-1;i>=0;i--) $(this).children('th,td').eq(cols[i]).remove(); }); }
        if(act==='del-table'){ $tbl.remove(); this.hideTableTools(); }
        $ed.find('.nab-cell-selected').removeClass('nab-cell-selected'); this.hideTableTools(); this.sync();
      });

      /* expose for later */
      this._saveSel=saveSel; this._restoreSel=restoreSel;
    }

    /* API */
    getHTML(){ return clean(this.$editable.html()); }
    getText(){ return (this.$editable.text()||'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim(); }
    getStats(){ return {chars:this.getText().length}; }
    setHTML(h){ this.$editable.html(clean(h||'')); this.sync(); }
    focus(){ this.$editable.trigger('focus'); }
    destroy(){
      const ns='.'+this.id;
      $(document).off(ns).off(ns+'-tbl'); $(window).off(ns);
      if(this._ro&&this._ro.disconnect) this._ro.disconnect();
      this.$resizer.remove(); this.$imgTools.remove(); this.$tblTools.remove(); this.$root.remove();
    }

    /* sync */
    sync(){
      const html=this.getHTML();
      this.$hidden.val(html); this.$cnt.text(this.getStats().chars+' chars used');
      if(typeof this.opts.onChange==='function') this.opts.onChange(html,this.getStats());
      if(this.imgTarget){ this.positionImgResizer(); this.positionImgTools(); }
      if(this._lastCells) this.positionTableTools(this._lastCells);
    }

    /* images */
    ensureParagraphAfter(img,force=false){
      const $n=$(img); const next=$n[0].nextSibling;
      if(force || !next || (next.nodeType===1 && next.tagName==='BR')){ const p=document.createElement('p'); p.innerHTML='<br>'; $n.after(p); }
    }
    positionImgResizer(){ if(!this.imgTarget) return; const r=this.imgTarget.getBoundingClientRect(); this.$resizer.css({display:'block',top:r.top,left:r.left,width:r.width,height:r.height}).attr('aria-hidden','false'); }
    positionImgTools(){ if(!this.imgTarget) return this.$imgTools.hide(); const r=this.imgTarget.getBoundingClientRect(); this.$imgTools.css({display:'flex',top:r.top-this.$imgTools.outerHeight()-6,left:r.left}); }
    hideImgUI(){ this.$resizer.hide().attr('aria-hidden','true'); this.$imgTools.hide(); this.imgTarget=null; this.resizing=false; this._rs=null; }
    beginResize(pos,e){ if(!this.imgTarget) return; const r=this.imgTarget.getBoundingClientRect(); this._rs={x:e.clientX,y:e.clientY,w:r.width,h:r.height,ratio:r.width/r.height,pos}; this.resizing=true; $(document.documentElement).css('cursor', this.$resizer.find('.ir-handle.'+pos).css('cursor')); }
    applyResize(e){
      const st=this._rs; if(!this.resizing||!st||!this.imgTarget) return;
      const dx=e.clientX-st.x, dy=e.clientY-st.y; let W=st.w,H=st.h;
      const pos=st.pos, sx=(pos.includes('e')?1:(pos.includes('w')?-1:0)), sy=(pos.includes('s')?1:(pos.includes('n')?-1:0));
      const maxW=this.$editable[0].getBoundingClientRect().width - 24;
      if(sx){ W=Math.max(40,Math.min(st.w+dx*sx,maxW)); H=W/st.ratio; }
      else if(sy){ H=Math.max(40,st.h+dy*sy); W=H*st.ratio; W=Math.max(40,Math.min(W,maxW)); H=W/st.ratio; }
      this.imgTarget.style.width=Math.round(W)+'px'; this.imgTarget.style.height='auto';
      this.positionImgResizer(); this.positionImgTools();
    }
    endResize(){ if(!this.resizing) return; this.resizing=false; $(document.documentElement).css('cursor',''); }

    /* tables */
    positionTableTools($cells){ if(!$cells||!$cells.length) return this.$tblTools.hide(); const r=$cells.get(0).getBoundingClientRect(); this.$tblTools.css({display:'flex',top:r.top-this.$tblTools.outerHeight()-6,left:r.left}); }
    hideTableTools(){ this.$tblTools.hide(); }
  }

  return NabEditor;
}));
