/*! nab-editor v1.0.1 | MIT */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('jquery'));
  } else {
    root.NabEditor = factory(root.jQuery);
  }
}(typeof self !== 'undefined' ? self : this, function ($) {
  'use strict';
  if (!$) throw new Error('NabEditor: jQuery is required');

  /* ============== sanitize & clean ============== */
  function sanitize(html){
    const t = document.createElement('template'); t.innerHTML = html;
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
  function cleanUnnecessary(html){
    const t = document.createElement('template'); t.innerHTML = html;
    const strip = s=>s.replace(/[\u200B-\u200D\uFEFF]/g,'')
                      .replace(/\u00A0/g,' ')
                      .replace(/[ \t]+/g,' ')
                      .replace(/ *\n+ */g,'\n').trim();
    const w = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT, null);
    const rm=[];
    while(w.nextNode()){ const n=w.currentNode; n.nodeValue=strip(n.nodeValue); if(!n.nodeValue) rm.push(n); }
    rm.forEach(n=>n.parentNode&&n.parentNode.removeChild(n));
    $(t.content).find('*').each(function(){
      const tag=this.tagName;
      if(['BR','IMG','HR','TD','TH','TR','TABLE'].includes(tag)) return;
      if(!this.children.length && !(this.textContent||'').trim()) this.remove();
    });
    $(t.content).find('br+br').each(function(){ $(this).remove(); });
    return sanitize(t.innerHTML);
  }

  /* ============== selection helpers ============== */
  const blockTags = /^(P|DIV|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|PRE|LI|TD|TH)$/i;
  const inside = (node,root)=>{ if(!node) return false; if(node.nodeType===3) node=node.parentNode; return root.contains(node); };
  function getRangeInEditable(ed){
    const sel=window.getSelection(); if(!sel||!sel.rangeCount) return null;
    const r=sel.getRangeAt(0);
    const c=r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentNode;
    return ed.contains(c)?r:null;
  }
  function getBlockAncestor(node, root){
    let n=(node.nodeType===1?node:node.parentNode);
    while(n && n!==root){ if(blockTags.test(n.nodeName)) return n; n=n.parentNode; }
    return null;
  }
  function blocksInRange(range, root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT,{
      acceptNode(node){
        if(!blockTags.test(node.nodeName)) return NodeFilter.FILTER_SKIP;
        const nr=document.createRange();
        try{ nr.selectNodeContents(node); }catch(e){ return NodeFilter.FILTER_SKIP; }
        const s=range.compareBoundaryPoints(Range.END_TO_START,nr);
        const e=range.compareBoundaryPoints(Range.START_TO_END,nr);
        return (s<0 && e>0)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP;
      }
    });
    const arr=[]; while(walker.nextNode()) arr.push(walker.currentNode);
    if(!arr.length){ const b=getBlockAncestor(range.startContainer,root); if(b) arr.push(b); }
    return arr;
  }
  function replaceBlockTag(block, newTag){
    if(!block || block.nodeName===newTag.toUpperCase()) return block;
    const nb=document.createElement(newTag);
    if(block.getAttribute('style')) nb.setAttribute('style', block.getAttribute('style'));
    if(block.getAttribute('class')) nb.setAttribute('class', block.getAttribute('class'));
    while(block.firstChild) nb.appendChild(block.firstChild);
    block.parentNode.replaceChild(nb, block);
    return nb;
  }
  function wrapRangeBlock(range, tag){
    if(range.collapsed){
      const el=document.createElement(tag); el.innerHTML='&#8203;';
      range.insertNode(el);
      const r=document.createRange(); r.setStart(el.firstChild,1); r.collapse(true);
      const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      return;
    }
    const frag=range.extractContents(); const el=document.createElement(tag);
    el.appendChild(frag); range.insertNode(el);
    const r=document.createRange(); r.selectNodeContents(el);
    const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  function wrapRangeInline(range, styleObj){
    if(range.collapsed){
      const span=document.createElement('span'); Object.assign(span.style, styleObj);
      span.textContent="\u200B"; range.insertNode(span);
      const r=document.createRange(); r.setStart(span.firstChild,1); r.collapse(true);
      const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r); return;
    }
    const frag=range.extractContents(); const span=document.createElement('span');
    Object.assign(span.style, styleObj); span.appendChild(frag);
    range.insertNode(span);
    const r=document.createRange(); r.selectNodeContents(span);
    const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  const exec=(cmd,val=null)=>document.execCommand(cmd,false,val);

  /* ============== class ============== */
  class NabEditor {
    constructor(target, opts={}){
      this.$host   = (target instanceof $) ? target : $(target);
      if (!this.$host.length) throw new Error('NabEditor: target not found');
      this.opts = Object.assign({
        name: 'content',
        placeholder: 'Start typing…',
        zoom: 1.0,
        onChange: null
      }, opts);

      this.build();
      this.bind();
      this.sync();
    }

    /* ---------- DOM ---------- */
    build(){
      const tpl = `
      <div class="nab-reset nab-wrap">
        <div class="nab-doc">
          <div class="nab-toolbar" role="toolbar" aria-label="Nab toolbar">
            <div class="nab-group">
              <button type="button" class="nab-btn" data-cmd="undo" title="Undo"><i class="fa fa-rotate-left"></i></button>
              <button type="button" class="nab-btn" data-cmd="redo" title="Redo"><i class="fa fa-rotate-right"></i></button>
            </div>

            <div class="nab-group">
              <select class="nab-sel" data-act="block" title="Paragraph & Headings">
                <option value="P">Paragraph</option><option value="H1">Heading 1</option>
                <option value="H2">Heading 2</option><option value="H3">Heading 3</option>
                <option value="H4">Heading 4</option><option value="H5">Heading 5</option>
                <option value="H6">Heading 6</option>
              </select>
              <select class="nab-sel" data-act="fontName" title="Font Family">
                <option value="">Font: Default</option>
                <option value="Arial, Helvetica, sans-serif">Arial</option>
                <option value="'Times New Roman', Times, serif">Times New Roman</option>
                <option value="Georgia, 'Times New Roman', Times, serif">Georgia</option>
                <option value="'Trebuchet MS', Helvetica, sans-serif">Trebuchet MS</option>
                <option value="'Courier New', Courier, monospace">Courier New</option>
              </select>
              <select class="nab-sel" data-act="fontSizePx" title="Font Size"></select>
            </div>

            <div class="nab-group">
              <button type="button" class="nab-btn" data-cmd="bold" title="Bold"><i class="fa fa-bold"></i></button>
              <button type="button" class="nab-btn" data-cmd="italic" title="Italic"><i class="fa fa-italic"></i></button>
              <button type="button" class="nab-btn" data-cmd="underline" title="Underline"><i class="fa fa-underline"></i></button>
              <button type="button" class="nab-btn" data-cmd="strikeThrough" title="Strike"><i class="fa fa-strikethrough"></i></button>
              <button type="button" class="nab-btn" data-cmd="superscript" title="Superscript"><i class="fa fa-superscript"></i></button>
              <button type="button" class="nab-btn" data-cmd="subscript" title="Subscript"><i class="fa fa-subscript"></i></button>
              <button type="button" class="nab-btn" data-cmd="removeFormat" title="Clear inline"><i class="fa fa-eraser"></i></button>
            </div>

            <div class="nab-group">
              <button type="button" class="nab-btn" data-cmd="justifyLeft" title="Align left"><i class="fa fa-align-left"></i></button>
              <button type="button" class="nab-btn" data-cmd="justifyCenter" title="Align center"><i class="fa fa-align-center"></i></button>
              <button type="button" class="nab-btn" data-cmd="justifyRight" title="Align right"><i class="fa fa-align-right"></i></button>
              <button type="button" class="nab-btn" data-cmd="justifyFull" title="Justify"><i class="fa fa-align-justify"></i></button>
              <button type="button" class="nab-btn" data-cmd="insertHorizontalRule" title="Insert HR"><i class="fa fa-minus"></i></button>
            </div>

            <div class="nab-group">
              <button type="button" class="nab-btn" data-cmd="insertUnorderedList" title="Bulleted list"><i class="fa fa-list-ul"></i></button>
              <button type="button" class="nab-btn" data-cmd="insertOrderedList" title="Numbered list"><i class="fa fa-list-ol"></i></button>
              <button type="button" class="nab-btn" data-cmd="outdent" title="Outdent"><i class="fa fa-outdent"></i></button>
              <button type="button" class="nab-btn" data-cmd="indent" title="Indent"><i class="fa fa-indent"></i></button>
            </div>

            <div class="nab-group">
              <button type="button" class="nab-btn" data-act="link" title="Insert link"><i class="fa fa-link"></i></button>
              <button type="button" class="nab-btn" data-act="unlink" title="Remove link"><i class="fa fa-unlink"></i></button>
              <button type="button" class="nab-btn" data-act="image" title="Insert image"><i class="fa-regular fa-image"></i></button>
              <input type="file" accept="image/*" class="nab-file" hidden />
              <button type="button" class="nab-btn" data-act="table" title="Insert table"><i class="fa fa-table"></i></button>
            </div>

            <div class="nab-group">
              <label class="nab-btn" title="Text color"><i class="fa fa-droplet"></i>
                <input type="color" class="nab-color" data-cmd="foreColor" />
              </label>
              <label class="nab-btn" title="Highlight"><i class="fa fa-highlighter"></i>
                <input type="color" class="nab-color" data-cmd="hiliteColor" />
              </label>
              <button type="button" class="nab-btn" data-act="cleanup" title="Clean text"><i class="fa fa-broom"></i></button>
              <button type="button" class="nab-btn" data-act="clearAll" title="Clear document"><i class="fa fa-trash-can"></i></button>
            </div>

            <div class="nab-group">
              <label>Zoom</label>
              <select class="nab-sel" data-act="zoom" title="Editor Zoom">
                <option value="0.90">90%</option>
                <option value="1.00" selected>100%</option>
                <option value="1.25">125%</option>
                <option value="1.50">150%</option>
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
            <div class="nab-status">
              <span class="nab-msg">Ready</span>
              <span class="nab-cnt">0 chars used</span>
            </div>
            <input type="hidden" class="nab-hidden" />
          </div>
        </div>

        <!-- overlays (scoped to instance, no IDs) -->
        <div class="nab-table-tools">
          <button type="button" class="nab-btn" data-tt="row-above" title="Insert row above"><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" class="nab-btn" data-tt="row-below" title="Insert row below"><i class="fa-solid fa-arrow-down"></i></button>
          <button type="button" class="nab-btn" data-tt="col-left" title="Insert column left"><i class="fa-solid fa-arrow-left"></i></button>
          <button type="button" class="nab-btn" data-tt="col-right" title="Insert column right"><i class="fa-solid fa-arrow-right"></i></button>
          <button type="button" class="nab-btn" data-tt="del-rows" title="Delete selected rows"><i class="fa-solid fa-delete-left"></i></button>
          <button type="button" class="nab-btn" data-tt="del-cols" title="Delete selected cols"><i class="fa-regular fa-square-minus"></i></button>
          <button type="button" class="nab-btn" data-tt="del-table" title="Delete table"><i class="fa-regular fa-trash-can"></i></button>
        </div>

        <div class="nab-img-resizer" aria-hidden="true">
          <div class="ir-handle nw" data-pos="nw"></div>
          <div class="ir-handle ne" data-pos="ne"></div>
          <div class="ir-handle sw" data-pos="sw"></div>
          <div class="ir-handle se" data-pos="se"></div>
          <div class="ir-handle n"  data-pos="n"></div>
          <div class="ir-handle s"  data-pos="s"></div>
          <div class="ir-handle w"  data-pos="w"></div>
          <div class="ir-handle e"  data-pos="e"></div>
        </div>

        <div class="nab-img-tools">
          <button type="button" class="nab-btn" data-img="left" title="Float left"><i class="fa-solid fa-align-left"></i></button>
          <button type="button" class="nab-btn" data-img="right" title="Float right"><i class="fa-solid fa-align-right"></i></button>
          <button type="button" class="nab-btn" data-img="inline" title="Inline"><i class="fa-solid fa-text-height"></i></button>
          <button type="button" class="nab-btn" data-img="para" title="Add paragraph after"><i class="fa-solid fa-paragraph"></i></button>
          <button type="button" class="nab-btn" data-img="remove" title="Remove image"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>
      `;

      this.$root = $(tpl);
      this.$host.empty().append(this.$root);

      this.$toolbar   = this.$root.find('.nab-toolbar');
      this.$editable  = this.$root.find('.nab-editable');
      this.$hidden    = this.$root.find('.nab-hidden');
      this.$cnt       = this.$root.find('.nab-cnt');
      this.$file      = this.$root.find('.nab-file');

      this.$tableTools = this.$root.find('.nab-table-tools');
      this.$imgResizer = this.$root.find('.nab-img-resizer');
      this.$imgTools   = this.$root.find('.nab-img-tools');

      // config
      this.$editable.attr('data-ph', this.opts.placeholder);
      this.$hidden.attr('name', this.opts.name);

      // font sizes 8–48
      const $fs = this.$toolbar.find('select[data-act="fontSizePx"]').empty();
      for (let i=8;i<=48;i++) $fs.append(`<option value="${i}" ${i===16?'selected':''}>${i} px</option>`);

      // zoom base
      document.documentElement.style.setProperty('--base-font', (16 * (this.opts.zoom||1))+'px');
    }

    /* ---------- event wiring ---------- */
    bind(){
      const $ed = this.$editable;
      const $tb = this.$toolbar;

      // selection store per instance
      const selStore = new WeakMap();
      const saveSel = ()=>{ const sel=window.getSelection(); if(sel&&sel.rangeCount){ const r=sel.getRangeAt(0); if(inside(r.commonAncestorContainer,$ed[0])) selStore.set($ed[0], r.cloneRange()); } };
      const restoreSel = ()=>{ const r=selStore.get($ed[0]); if(!r) return false; const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r); return true; };

      // toolbar interactions
      $tb.on('mousedown','button,select,label,input[type="color"]', (e)=>{ e.preventDefault(); saveSel(); });

      $tb.on('click','.nab-btn[data-cmd]', (e)=>{
        restoreSel(); exec($(e.currentTarget).data('cmd')); saveSel(); this.sync();
      });

      $tb.on('input','.nab-color', (e)=>{
        restoreSel(); exec($(e.currentTarget).data('cmd'), $(e.currentTarget).val()); saveSel(); this.sync();
      });

      $tb.on('change','select.nab-sel', (e)=>{
        const act = $(e.currentTarget).data('act');
        if (!['block','fontName','fontSizePx','zoom'].includes(act)) return;

        if (act==='zoom'){
          const scale=parseFloat($(e.currentTarget).val()||'1');
          document.documentElement.style.setProperty('--base-font', (16*scale)+'px');
          return this.sync();
        }

        restoreSel();
        let range = getRangeInEditable($ed[0]);
        if(!range){
          const r=document.createRange(); r.selectNodeContents($ed[0]); r.collapse(false);
          const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r); range=r;
        }
        if(act==='block'){
          const tag=$(e.currentTarget).val();
          const blocks=blocksInRange(range,$ed[0]);
          if(blocks.length){ blocks.forEach(b=>{ if(b&&b!==$ed[0]) replaceBlockTag(b,tag); }); }
          else { wrapRangeBlock(range,tag); }
        } else if(act==='fontName'){
          const val=$(e.currentTarget).val();
          wrapRangeInline(range, val?{fontFamily:val}:{fontFamily:''});
        } else if(act==='fontSizePx'){
          const px=parseInt($(e.currentTarget).val(),10)||16;
          wrapRangeInline(range, {fontSize:px+'px'});
        }
        saveSel(); this.sync();
      });

      // link / image / table / cleanup / clear
      $tb.on('click','.nab-btn[data-act]', (e)=>{
        const act=$(e.currentTarget).data('act');
        restoreSel();
        if(act==='link'){ const url=prompt('Enter URL (https://...)'); if(url) exec('createLink',url); }
        else if(act==='unlink'){ exec('unlink'); }
        else if(act==='image'){ this.$file.trigger('click'); }
        else if(act==='table'){
          const rows=parseInt(prompt('Rows?','3')||'3',10), cols=parseInt(prompt('Columns?','3')||'3',10);
          if(rows>0&&cols>0){ let html='<table>'; for(let r=0;r<rows;r++){ html+='<tr>'; for(let c=0;c<cols;c++){ html+= r===0?'<th>&nbsp;</th>':'<td>&nbsp;</td>'; } html+='</tr>'; } html+='</table>'; exec('insertHTML',html); }
        } else if(act==='cleanup'){ $ed.html(cleanUnnecessary($ed.html())); }
        else if(act==='clearAll'){ if(confirm('Clear the entire document?')){ $ed.html(''); this.hideImgUI(); this.hideTableTools(); } }
        saveSel(); this.sync();
      });

      // file → image
      this.$file.on('change', (ev)=>{
        const f=ev.target.files && ev.target.files[0]; if(!f) return;
        const reader=new FileReader();
        reader.onload=()=>{
          restoreSel(); exec('insertImage', reader.result);
          const $imgs=$ed.find('img');
          if($imgs.length){
            const img = $imgs.last()[0];
            $(img).removeClass('nab-img-left nab-img-right');
            this.ensureParagraphAfter(img, true);
            this.imgTarget = img;
            this.positionImgResizer(); this.positionImgTools();
          }
          ev.target.value=''; saveSel(); this.sync();
        };
        reader.readAsDataURL(f);
      });

      // typing & paste
      $ed.on('input', ()=>this.sync());
      $ed.on('paste', (ev)=>{
        ev.preventDefault();
        const dt=ev.originalEvent.clipboardData || window.clipboardData;
        const html = dt.getData('text/html');
        const text = dt.getData('text');
        if(html) exec('insertHTML', cleanUnnecessary(html));
        else exec('insertText', (text||'').replace(/\s+/g,' ').trim());
        this.sync();
      });

      // selection updates
      $ed.on('keyup mouseup', ()=> saveSel());
      document.addEventListener('selectionchange', ()=>{
        const sel=window.getSelection();
        if(sel&&sel.rangeCount){
          const c=sel.getRangeAt(0).commonAncestorContainer;
          if(c && $ed[0].contains(c)) saveSel();
        }
      });

      /* ===== Image resizer + tools (FIXED overlays) ===== */
      this.$imgResizer.on('mousedown', '.ir-handle', (e)=>{
        e.preventDefault(); e.stopPropagation();
        const pos = $(e.currentTarget).data('pos');
        this.beginResize(pos, e);
      });

      // namespaced to avoid global clashes
      $(document).on('mousemove.nab', (e)=>{ if(this.resizing) this.applyResize(e); });
      $(document).on('mouseup.nab', ()=> this.endResize());

      // position overlays on scroll/resize
      const repositionOverlays = ()=>{ this.positionImgResizer(); this.positionImgTools(); if(this._lastCells) this.positionTableTools(this._lastCells); };
      $(window).on('scroll.nab resize.nab', repositionOverlays);

      // robust reflow watcher
      try {
        this._ro = new ResizeObserver(()=>{ repositionOverlays(); });
        this._ro.observe(document.body);
      } catch(_) {}

      // image selection
      this.$root.on('click', '.nab-editable img', (e)=>{
        e.preventDefault();
        this.imgTarget = e.currentTarget;
        this.positionImgResizer(); this.positionImgTools();
      });

      // click-away hides overlays
      $(document).on('mousedown.nab', (e)=>{
        const $t=$(e.target);
        const isImg = $t.closest('.nab-editable img').length>0;
        const isRes = $t.closest(this.$imgResizer).length>0;
        const isTools = $t.closest(this.$imgTools).length>0;
        const isTableTools = $t.closest(this.$tableTools).length>0;
        if(!isImg && !isRes && !isTools) this.hideImgUI();
        if(!isTableTools && !$t.is('td,th')) this.hideTableTools();
      });

      // delete image -> hide resizer next tick
      document.addEventListener('keydown', (e)=>{
        if(!this.imgTarget) return;
        if(e.key==='Backspace'||e.key==='Delete'){
          setTimeout(()=>{ if(!document.body.contains(this.imgTarget)) this.hideImgUI(); },0);
        }
      });

      // image tools actions
      this.$imgTools.on('click','.nab-btn', (e)=>{
        if(!this.imgTarget) return;
        const act=$(e.currentTarget).data('img');
        if(act==='left'){ $(this.imgTarget).removeClass('nab-img-right').addClass('nab-img-left'); this.ensureParagraphAfter(this.imgTarget); }
        else if(act==='right'){ $(this.imgTarget).removeClass('nab-img-left').addClass('nab-img-right'); this.ensureParagraphAfter(this.imgTarget); }
        else if(act==='inline'){ $(this.imgTarget).removeClass('nab-img-left nab-img-right').css({display:'inline',float:''}); this.ensureParagraphAfter(this.imgTarget); }
        else if(act==='para'){ this.ensureParagraphAfter(this.imgTarget,true); }
        else if(act==='remove'){ const $e=$(this.imgTarget).closest('.nab-editable'); $(this.imgTarget).remove(); $e.focus(); this.hideImgUI(); }
        this.positionImgResizer(); this.positionImgTools();
      });

      /* ===== Table tools (fixed overlay) ===== */
      let selecting=false, anchor=null, $activeTable=null;
      const cellCoords = ($cell)=>({ row:$cell.parent().index(), col:$cell.index() });
      const normalizeRect = (a,b)=>({ r1:Math.min(a.row,b.row), r2:Math.max(a.row,b.row),
                                       c1:Math.min(a.col,b.col), c2:Math.max(a.col,b.col) });
      const selectRect = ($table, rect)=>{
        $table.find('td,th').removeClass('nab-cell-selected');
        $table.find('tr').each(function(r){
          if(r<rect.r1 || r>rect.r2) return;
          $(this).children('th,td').each(function(c){
            if(c<rect.c1 || c>rect.c2) return;
            $(this).addClass('nab-cell-selected');
          });
        });
      };

      this.$editable.on('mousedown','td,th', (e)=>{
        this.hideImgUI();
        selecting=true;
        const $cell=$(e.currentTarget);
        $activeTable=$cell.closest('table');
        anchor=cellCoords($cell);
        $activeTable.find('td,th').removeClass('nab-cell-selected');
        $activeTable.find('tr').eq(anchor.row).children('th,td').eq(anchor.col).addClass('nab-cell-selected');
        this._lastCells = $activeTable.find('.nab-cell-selected');
        this.positionTableTools(this._lastCells);
        e.preventDefault();
      });

      this.$editable.on('mouseover','td,th', (e)=>{
        if(!selecting || !$activeTable) return;
        const cur=cellCoords($(e.currentTarget));
        const rect=normalizeRect(anchor,cur);
        selectRect($activeTable,rect);
        this._lastCells = $activeTable.find('.nab-cell-selected');
        this.positionTableTools(this._lastCells);
      });

      $(document).on('mouseup.nab-table', ()=>{ if(selecting) selecting=false; });

      this.$tableTools.on('click','.nab-btn', (e)=>{
        const action=$(e.currentTarget).data('tt');
        const $cells=this.$editable.find('.nab-cell-selected');
        const $table=$cells.length?$cells.first().closest('table'):null;
        if(!$table) return;

        const rowIdx=[...new Set($cells.map(function(){return $(this).parent().index();}).get())].sort((a,b)=>a-b);
        const colIdx=[...new Set($cells.map(function(){return $(this).index();}).get())].sort((a,b)=>a-b);

        if(action==='row-above'&&rowIdx.length){
          const r0=rowIdx[0]; const cols=$table.find('tr:first').children('th,td').length;
          const $tr=$('<tr/>'); for(let i=0;i<cols;i++) $tr.append('<td>&nbsp;</td>');
          $table.find('tr').eq(r0).before($tr);
        }
        if(action==='row-below'&&rowIdx.length){
          const r1=rowIdx[rowIdx.length-1]; const cols=$table.find('tr:first').children('th,td').length;
          const $tr=$('<tr/>'); for(let i=0;i<cols;i++) $tr.append('<td>&nbsp;</td>');
          $table.find('tr').eq(r1).after($tr);
        }
        if(action==='col-left'&&colIdx.length){
          const c0=colIdx[0];
          $table.find('tr').each(function(ri){
            const tag=ri===0?'th':'td'; $(this).children('th,td').eq(c0).before(`<${tag}>&nbsp;</${tag}>`);
          });
        }
        if(action==='col-right'&&colIdx.length){
          const c1=colIdx[colIdx.length-1];
          $table.find('tr').each(function(ri){
            const tag=ri===0?'th':'td'; $(this).children('th,td').eq(c1).after(`<${tag}>&nbsp;</${tag}>`);
          });
        }
        if(action==='del-rows'&&rowIdx.length){
          for(let i=rowIdx.length-1;i>=0;i--) $table.find('tr').eq(rowIdx[i]).remove();
        }
        if(action==='del-cols'&&colIdx.length){
          $table.find('tr').each(function(){
            for(let i=colIdx.length-1;i>=0;i--) $(this).children('th,td').eq(colIdx[i]).remove();
          });
        }
        if(action==='del-table'){ $table.remove(); this.hideTableTools(); }

        this.$editable.find('.nab-cell-selected').removeClass('nab-cell-selected');
        this.hideTableTools(); this.sync();
      });

      // store helpers
      this._saveSel = saveSel; this._restoreSel = restoreSel;
    }

    /* ---------- public API ---------- */
    getHTML(){ return cleanUnnecessary(this.$editable.html()); }
    getText(){
      return (this.$editable.text()||'')
        .replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\u00A0/g,' ')
        .replace(/\s+/g,' ').trim();
    }
    getStats(){ return { chars: this.getText().length }; }
    setHTML(html){ this.$editable.html(cleanUnnecessary(html||'')); this.sync(); }
    focus(){ this.$editable.trigger('focus'); }
    destroy(){
      $(document).off('.nab'); $(window).off('.nab'); $(document).off('.nab-table');
      if (this._ro && this._ro.disconnect) this._ro.disconnect();
      this.$root.remove();
    }

    /* ---------- core sync ---------- */
    sync(){
      const cleaned = this.getHTML();
      this.$hidden.val(cleaned);
      this.$cnt.text(this.getStats().chars + ' chars used');
      if (typeof this.opts.onChange === 'function'){
        this.opts.onChange(cleaned, this.getStats());
      }
      if (this.imgTarget){ this.positionImgResizer(); this.positionImgTools(); }
      if (this._lastCells) this.positionTableTools(this._lastCells);
    }

    /* ---------- image tools ---------- */
    ensureParagraphAfter(img, force=false){
      const $node=$(img); const next=$node[0].nextSibling;
      if(force || !next || (next.nodeType===1 && next.tagName==='BR')){
        const p=document.createElement('p'); p.innerHTML='<br>'; $node.after(p);
      }
      setTimeout(()=>{
        const p=$node[0].nextSibling;
        if(p && p.nodeType===1){
          const r=document.createRange(); r.selectNodeContents(p); r.collapse(true);
          const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        }
      },0);
    }
    positionImgResizer(){
      if(!this.imgTarget) return;
      const r=this.imgTarget.getBoundingClientRect();
      this.$imgResizer.css({
        display:'block',
        top: r.top, left: r.left, width: r.width, height: r.height
      }).attr('aria-hidden','false');
    }
    positionImgTools(){
      if(!this.imgTarget) return this.$imgTools.hide();
      const r=this.imgTarget.getBoundingClientRect();
      this.$imgTools.css({
        display:'flex',
        top: r.top - this.$imgTools.outerHeight() - 6,
        left: r.left
      });
    }
    hideImgUI(){
      this.$imgResizer.hide().attr('aria-hidden','true');
      this.$imgTools.hide();
      this.imgTarget=null; this.resizing=false; this._resizeStart=null;
    }

    beginResize(pos, e){
      if(!this.imgTarget) return;
      const r=this.imgTarget.getBoundingClientRect();
      this._resizeStart={x:e.clientX,y:e.clientY,w:r.width,h:r.height,ratio:r.width/r.height,pos};
      this.resizing=true;
      $(document.documentElement).css('cursor', this.$imgResizer.find('.ir-handle.'+pos).css('cursor'));
    }
    applyResize(e){
      const st=this._resizeStart; if(!this.resizing || !st || !this.imgTarget) return;
      const dx=e.clientX-st.x, dy=e.clientY-st.y;
      let newW=st.w, newH=st.h;
      const pos=st.pos, sx=(pos.includes('e')?+1:(pos.includes('w')?-1:0)), sy=(pos.includes('s')?+1:(pos.includes('n')?-1:0));
      const maxW=(()=>{ const ed=this.$editable[0].getBoundingClientRect(); return ed.width - 24; })();
      if(sx!==0){ newW=Math.max(40,Math.min(st.w+dx*sx,maxW)); newH=newW/st.ratio; }
      else if(sy!==0){ newH=Math.max(40,st.h+dy*sy); newW=newH*st.ratio; newW=Math.max(40,Math.min(newW,maxW)); newH=newW/st.ratio; }
      this.imgTarget.style.width=Math.round(newW)+'px';
      this.imgTarget.style.height='auto';
      this.positionImgResizer(); this.positionImgTools();
    }
    endResize(){ if(!this.resizing) return; this.resizing=false; $(document.documentElement).css('cursor',''); }

    /* ---------- table tools (fixed) ---------- */
    positionTableTools($cells){
      if(!$cells || !$cells.length) return this.$tableTools.hide();
      const r=$cells.get(0).getBoundingClientRect();
      this.$tableTools.css({
        display:'flex',
        top: r.top - this.$tableTools.outerHeight() - 6,
        left: r.left
      });
    }
    hideTableTools(){ this.$tableTools.hide(); }
  }

  return NabEditor;
}));
