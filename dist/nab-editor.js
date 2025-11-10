/*!
 * NAB Editor (no-framework WYSIWYG)
 * Peer deps: jQuery >=3.7, Font Awesome (icons)
 * Auto-inits on .nab-editor elements. Exposes window.NABEditor
 */
(function (window, document, $) {
  if (!$) { throw new Error('NABEditor requires jQuery'); }

  /* ================== Utils / Sanitizer ================== */
  const sanitize = (html)=>{
    const t = document.createElement('template');
    t.innerHTML = html;
    $(t.content).find('script,style').remove();
    $(t.content).find('*').each(function(){
      [...this.attributes].forEach(a=>{
        const n=a.name.toLowerCase(), v=(a.value||'').toLowerCase();
        if(n.startsWith('on')) this.removeAttribute(a.name);
        if(n==='href' && v.startsWith('javascript:')) this.removeAttribute('href');
      });
    });
    return t.innerHTML;
  };
  const blockTags = /^(P|DIV|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|PRE|LI|TD|TH)$/i;
  function exec(cmd, val=null){ document.execCommand(cmd, false, val); }
  function inside(node, root){ if(!node) return false; if(node.nodeType===3) node = node.parentNode; return root.contains(node); }
  function getRangeInEditable(editable){
    const sel = window.getSelection(); if(!sel || sel.rangeCount===0) return null;
    const r = sel.getRangeAt(0);
    const container = r.commonAncestorContainer.nodeType===1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode;
    if(!editable.contains(container)) return null; return r;
  }
  function getBlockAncestor(node, root){
    let n = (node.nodeType===1 ? node : node.parentNode);
    while(n && n!==root){ if(blockTags.test(n.nodeName)) return n; n = n.parentNode; }
    return null;
  }
  function blocksInRange(range, root){
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node){
        if(!blockTags.test(node.nodeName)) return NodeFilter.FILTER_SKIP;
        const nr = document.createRange();
        try{ nr.selectNodeContents(node); }catch(e){ return NodeFilter.FILTER_SKIP; }
        const s = range.compareBoundaryPoints(Range.END_TO_START, nr);
        const e = range.compareBoundaryPoints(Range.START_TO_END,   nr);
        return (s < 0 && e > 0) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const arr=[]; while(walker.nextNode()) arr.push(walker.currentNode);
    if(arr.length===0){ const b = getBlockAncestor(range.startContainer, root); if(b) arr.push(b); }
    return arr;
  }
  function replaceBlockTag(block, newTag){
    if(!block || block.nodeName===newTag.toUpperCase()) return block;
    const nb = document.createElement(newTag);
    if(block.getAttribute('style')) nb.setAttribute('style', block.getAttribute('style'));
    if(block.getAttribute('class')) nb.setAttribute('class', block.getAttribute('class'));
    while(block.firstChild) nb.appendChild(block.firstChild);
    block.parentNode.replaceChild(nb, block); return nb;
  }
  function wrapRangeBlock(range, tag, root){
    if(range.collapsed){
      const el = document.createElement(tag); el.innerHTML = '&#8203;';
      range.insertNode(el);
      const r = document.createRange(); r.setStart(el.firstChild, 1); r.collapse(true);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); return;
    }
    const frag = range.extractContents(); const el = document.createElement(tag);
    el.appendChild(frag); range.insertNode(el);
    const r = document.createRange(); r.selectNodeContents(el);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  function wrapRangeInline(range, styleObj){
    if(range.collapsed){
      const span = document.createElement('span'); Object.assign(span.style, styleObj); span.textContent = "\u200B";
      range.insertNode(span);
      const r = document.createRange(); r.setStart(span.firstChild, 1); r.collapse(true);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); return;
    }
    const frag = range.extractContents(); const span = document.createElement('span'); Object.assign(span.style, styleObj);
    span.appendChild(frag); range.insertNode(span);
    const r = document.createRange(); r.selectNodeContents(span);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }

  /* ================== Image Resizer (shared) ================== */
  const $imgResizer = $('<div class="nab-img-resizer" id="nabImgResizer" aria-hidden="true">\
    <div class="ir-handle nw" data-pos="nw"></div>\
    <div class="ir-handle ne" data-pos="ne"></div>\
    <div class="ir-handle sw" data-pos="sw"></div>\
    <div class="ir-handle se" data-pos="se"></div>\
    <div class="ir-handle n"  data-pos="n"></div>\
    <div class="ir-handle s"  data-pos="s"></div>\
    <div class="ir-handle w"  data-pos="w"></div>\
    <div class="ir-handle e"  data-pos="e"></div>\
  </div>');
  $('body').append($imgResizer);

  let imgTarget = null, resizing = false, start = null;
  function maxImageWidthFor(img){
    const editable = $(img).closest('.nab-editable')[0];
    const edRect = editable.getBoundingClientRect();
    return edRect.width - 24;
  }
  function showImgResizer(img){
    imgTarget = img;
    const rect = img.getBoundingClientRect();
    $imgResizer.css({
      display:'block',
      top:  window.scrollY + rect.top + 'px',
      left: window.scrollX + rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px'
    }).attr('aria-hidden','false');
  }
  function hideImgResizer(){ $imgResizer.hide().attr('aria-hidden','true'); imgTarget = null; resizing = false; start = null; }
  function repositionImgResizer(){
    if(!imgTarget) return;
    const rect = imgTarget.getBoundingClientRect();
    $imgResizer.css({
      top:  window.scrollY + rect.top + 'px',
      left: window.scrollX + rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px'
    });
  }
  function beginResize(pos, e){
    if(!imgTarget) return;
    const rect = imgTarget.getBoundingClientRect();
    start = { x:e.pageX, y:e.pageY, w:rect.width, h:rect.height, ratio:rect.width/rect.height, pos };
    resizing = true; $(document.documentElement).css('cursor', $('.ir-handle.'+pos).css('cursor'));
  }
  function applyResize(e){
    if(!resizing || !start || !imgTarget) return;
    const dx = e.pageX - start.x, dy = e.pageY - start.y;
    let newW = start.w, newH = start.h;
    const pos = start.pos, signX = (pos.includes('e') ? +1 : (pos.includes('w') ? -1 : 0)), signY = (pos.includes('s') ? +1 : (pos.includes('n') ? -1 : 0));
    if(signX !== 0){ newW = start.w + dx * signX; newW = Math.max(40, Math.min(newW, maxImageWidthFor(imgTarget))); newH = newW / start.ratio; }
    else if(signY !== 0){ newH = start.h + dy * signY; newH = Math.max(40, newH); newW = newH * start.ratio; newW = Math.max(40, Math.min(newW, maxImageWidthFor(imgTarget))); newH = newW / start.ratio; }
    imgTarget.style.width = Math.round(newW) + 'px'; imgTarget.style.height = 'auto'; repositionImgResizer();
  }
  function endResize(){ if(!resizing) return; resizing = false; $(document.documentElement).css('cursor',''); }
  $imgResizer.on('mousedown', '.ir-handle', function(e){ e.preventDefault(); e.stopPropagation(); beginResize($(this).data('pos'), e); });
  $(document).on('mousemove', function(e){ if(resizing) applyResize(e); });
  $(document).on('mouseup', endResize);
  $(window).on('scroll resize', repositionImgResizer);
  $(document).on('mousedown', function(e){
    const isImg = $(e.target).closest('img').length > 0;
    const isRes = $(e.target).closest('#nabImgResizer').length > 0;
    if(!isImg && !isRes) hideImgResizer();
  });
  $(document).on('click', '.nab-editable img', function(e){ e.preventDefault(); showImgResizer(this); });
  document.addEventListener('keydown', function(e){
    if(!imgTarget) return;
    if(e.key === 'Backspace' || e.key === 'Delete'){
      setTimeout(()=>{ if(!document.body.contains(imgTarget)) hideImgResizer(); else repositionImgResizer(); }, 0);
    }
  });

  /* ================== Table helpers ================== */
  function cellCoords($cell){ return { row:$cell.parent().index(), col:$cell.index() }; }
  function normalizeRect(a,b){ const r1=Math.min(a.row,b.row), r2=Math.max(a.row,b.row), c1=Math.min(a.col,b.col), c2=Math.max(a.col,b.col); return {r1,r2,c1,c2}; }
  function selectRect($table, rect){
    $table.find('td,th').removeClass('nab-cell-selected');
    $table.find('tr').each(function(r){
      if(r<rect.r1 || r>rect.r2) return;
      $(this).children('th,td').each(function(c){ if(c<rect.c1 || c>rect.c2) return; $(this).addClass('nab-cell-selected'); });
    });
  }

  /* ================== Selection store ================== */
  const selStore = new WeakMap();
  function saveSelFor(editableEl){
    const sel = window.getSelection();
    if(!sel || sel.rangeCount===0) return;
    const r = sel.getRangeAt(0);
    if(inside(r.commonAncestorContainer, editableEl)){ selStore.set(editableEl, r.cloneRange()); }
  }
  function restoreSelFor(editableEl){
    const r = selStore.get(editableEl); if(!r) return false;
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); return true;
  }

  /* ================== Toolbar template ================== */
  function buildToolbar(fontSizeOptions) {
    const sizeOptions = fontSizeOptions.map(px=>`<option value="${px}">${px} px</option>`).join('');
    return (
`<div class="nab-toolbar" role="toolbar" aria-label="NAB toolbar">
  <div class="nab-group">
    <button type="button" class="nab-btn" data-cmd="undo" title="Undo"><i class="fa fa-rotate-left"></i></button>
    <button type="button" class="nab-btn" data-cmd="redo" title="Redo"><i class="fa fa-rotate-right"></i></button>
  </div>

  <div class="nab-group">
    <select class="nab-sel" data-act="block" title="Paragraph & Headings">
      <option value="P">Paragraph</option>
      <option value="H1">Heading 1</option>
      <option value="H2">Heading 2</option>
      <option value="H3">Heading 3</option>
      <option value="H4">Heading 4</option>
      <option value="H5">Heading 5</option>
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
    <select class="nab-sel" data-act="fontSizePx" title="Font Size">
      ${sizeOptions}
    </select>
  </div>

  <div class="nab-group">
    <button type="button" class="nab-btn" data-cmd="bold" title="Bold"><i class="fa fa-bold"></i></button>
    <button type="button" class="nab-btn" data-cmd="italic" title="Italic"><i class="fa fa-italic"></i></button>
    <button type="button" class="nab-btn" data-cmd="underline" title="Underline"><i class="fa fa-underline"></i></button>
    <button type="button" class="nab-btn" data-cmd="strikeThrough" title="Strikethrough"><i class="fa fa-strikethrough"></i></button>
    <button type="button" class="nab-btn" data-cmd="superscript" title="Superscript"><i class="fa fa-superscript"></i></button>
    <button type="button" class="nab-btn" data-cmd="subscript" title="Subscript"><i class="fa fa-subscript"></i></button>
    <button type="button" class="nab-btn" data-cmd="removeFormat" title="Clear inline formatting"><i class="fa fa-eraser"></i></button>
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
    <button type="button" class="nab-btn" data-act="clearAll" title="Clear document"><i class="fa fa-trash-can"></i></button>
    <button type="button" class="nab-btn" data-act="print" title="Print"><i class="fa fa-print"></i></button>
  </div>

  <div class="nab-group"><span class="nab-kbd">Ctrl/Cmd + B/I/U</span></div>
</div>`
    );
  }

  function mountEditor($host, opts = {}){
    const name = $host.data('name') || opts.name || 'content';
    const placeholder = $host.data('placeholder') || opts.placeholder || 'Start typing…';
    const sizeOpts = opts.fontSizes || [8,9,10,11,12,14,16,18,20,22,24,28,32,36,40,44,48]; // 8 → 48

    const $wrap = $('<div class="nab-wrap"></div>');
    const $toolbar = $(buildToolbar(sizeOpts));
    const $frame = $('<div class="nab-frame"></div>');
    const $paper = $('<div class="nab-paper"></div>');
    const $editable = $(`<div class="nab-editable" contenteditable="true" data-ph="${placeholder}"></div>`);
    const $status = $(`<div class="nab-status"><span class="nab-msg">Ready</span><span class="nab-cnt">0 chars</span></div>`);
    const $hidden = $(`<input type="hidden" name="${name}" value="">`);
    const $tableTools = $(
      `<div class="nab-table-tools">
        <button type="button" class="nab-btn" data-tt="row-above" title="Insert row above"><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" class="nab-btn" data-tt="row-below" title="Insert row below"><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" class="nab-btn" data-tt="col-left"  title="Insert column left"><i class="fa-solid fa-arrow-left"></i></button>
        <button type="button" class="nab-btn" data-tt="col-right" title="Insert column right"><i class="fa-solid fa-arrow-right"></i></button>
        <button type="button" class="nab-btn" data-tt="del-rows"  title="Delete selected rows"><i class="fa-solid fa-delete-left"></i></button>
        <button type="button" class="nab-btn" data-tt="del-cols"  title="Delete selected cols"><i class="fa-regular fa-square-minus"></i></button>
        <button type="button" class="nab-btn" data-tt="del-table" title="Delete table"><i class="fa-regular fa-trash-can"></i></button>
      </div>`
    );

    const $file = $toolbar.find('.nab-file'); const $cnt = $status.find('.nab-cnt');

    $paper.append($editable); $frame.append($paper, $status); $wrap.append($toolbar, $frame, $hidden);
    $host.empty().append($wrap); $('body').append($tableTools);

    const sync = ()=>{ repositionImgResizer(); $hidden.val(sanitize($editable.html())); $cnt.text(($editable.text()||'').trim().length + ' chars'); };

    // Selection snapshot
    $editable.on('keyup mouseup', function(){ saveSelFor($editable[0]); });
    document.addEventListener('selectionchange', function(){
      const sel = window.getSelection();
      if(sel && sel.rangeCount>0 && inside(sel.getRangeAt(0).commonAncestorContainer, $editable[0])){ saveSelFor($editable[0]); }
    });

    // Buttons vs selects
    $toolbar.on('mousedown', 'button', function(e){ saveSelFor($editable[0]); e.preventDefault(); });
    $toolbar.on('mousedown', 'select, input[type="color"], label', function(){ saveSelFor($editable[0]); });

    // execCommand
    $toolbar.on('click','.nab-btn[data-cmd]', function(){ restoreSelFor($editable[0]); exec($(this).data('cmd')); saveSelFor($editable[0]); sync(); });

    // actions
    $toolbar.on('click','.nab-btn[data-act]', function(){
      const act = $(this).data('act'); restoreSelFor($editable[0]);
      if(act==='link'){ const url = prompt('Enter URL (https://...)'); if(url) exec('createLink', url); }
      else if(act==='unlink'){ exec('unlink'); }
      else if(act==='image'){ $file.trigger('click'); }
      else if(act==='table'){
        const rows = parseInt(prompt('Rows?','3')||'3',10), cols = parseInt(prompt('Columns?','3')||'3',10);
        if(rows>0 && cols>0){ let html='<table>'; for(let r=0;r<rows;r++){ html+='<tr>'; for(let c=0;c<cols;c++){ html+= r===0?'<th>&nbsp;</th>':'<td>&nbsp;</td>'; } html+='</tr>'; } html+='</table>'; exec('insertHTML', html); }
      } else if(act==='clearAll'){ if(confirm('Clear the entire document?')){ $editable.html(''); $('#nabImgResizer').hide(); } }
      else if(act==='print'){
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>Print</title><style>body{font-family:Segoe UI,Arial;margin:20px} img{max-width:100%}</style></head><body>${$editable.html()}</body></html>`);
        w.document.close(); w.focus(); w.print(); w.close();
      }
      saveSelFor($editable[0]); sync();
    });

    // colors
    $toolbar.on('input','.nab-color', function(){ restoreSelFor($editable[0]); exec($(this).data('cmd'), $(this).val()); saveSelFor($editable[0]); sync(); });

    // selects
    $toolbar.on('change','.nab-sel', function(){
      restoreSelFor($editable[0]);
      const act = $(this).data('act');
      let range = getRangeInEditable($editable[0]);
      if(!range){
        const r = document.createRange(); r.selectNodeContents($editable[0]); r.collapse(false);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); range = r;
      }
      if(act==='block'){
        const tag = $(this).val(); const blocks = blocksInRange(range, $editable[0]);
        if(blocks.length){ blocks.forEach(b=> { if(b && b!==$editable[0]) replaceBlockTag(b, tag); }); }
        else { wrapRangeBlock(range, tag, $editable[0]); }
      } else if(act==='fontName'){ const val = $(this).val(); wrapRangeInline(range, val ? { fontFamily: val } : { fontFamily: '' }); }
      else if(act==='fontSizePx'){ const px = parseInt($(this).val(),10)||16; wrapRangeInline(range, { fontSize: px+'px' }); }
      saveSelFor($editable[0]); sync();
    });

    // file -> image
    $file.on('change', function(){
      const f = this.files && this.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        restoreSelFor($editable[0]); exec('insertImage', reader.result);
        saveSelFor($editable[0]); sync();
        const $imgs = $editable.find('img'); if($imgs.length){ showImgResizer($imgs.last()[0]); }
        $file.val('');
      };
      reader.readAsDataURL(f);
    });

    // typing/paste
    $editable.on('input', sync);
    $editable.on('paste', function(e){
      e.preventDefault();
      const dt = e.originalEvent.clipboardData || window.clipboardData;
      const html = dt.getData('text/html'); const text = dt.getData('text');
      if(html) exec('insertHTML', sanitize(html)); else exec('insertText', text); sync();
    });

    // Table selection & tools
    let selecting=false, anchor=null, $activeTable=null;
    function positionTableTools($cells){
      if(!$cells || $cells.length===0){ $tableTools.hide(); return; }
      const rect = $cells.get(0).getBoundingClientRect();
      $tableTools.css({ display:'flex', top:`${window.scrollY + rect.top - $tableTools.outerHeight() - 6}px`, left:`${window.scrollX + rect.left}px` });
    }
    function hideTableTools(){ $tableTools.hide(); }

    $editable.on('mousedown','td,th', function(e){
      $('#nabImgResizer').hide();
      selecting = true;
      const $cell = $(this);
      $activeTable = $cell.closest('table');
      anchor = cellCoords($cell);
      $activeTable.find('td,th').removeClass('nab-cell-selected');
      $activeTable.find('tr').eq(anchor.row).children('th,td').eq(anchor.col).addClass('nab-cell-selected');
      positionTableTools($activeTable.find('.nab-cell-selected'));
      e.preventDefault();
    });
    $editable.on('mouseover','td,th', function(){
      if(!selecting || !$activeTable) return;
      const cur = cellCoords($(this)); const rect = normalizeRect(anchor, cur);
      selectRect($activeTable, rect); positionTableTools($activeTable.find('.nab-cell-selected'));
    });
    $(document).on('mouseup', function(){ if(selecting){ selecting=false; } });
    $editable.on('mousedown', function(e){
      if(!$(e.target).is('td,th')){ $editable.find('.nab-cell-selected').removeClass('nab-cell-selected'); hideTableTools(); }
      if(!$(e.target).is('img')){ $('#nabImgResizer').hide(); }
    });

    $tableTools.on('click','.nab-btn', function(){
      const action = $(this).data('tt');
      const $table = (function(){ const $cells = $editable.find('.nab-cell-selected'); return $cells.length ? $cells.first().closest('table') : null; })();
      if(!$table || $table.length===0) return;
      const rowIdx = (function(){ const idx=new Set(); $table.find('.nab-cell-selected').each(function(){ idx.add($(this).parent().index()); }); return [...idx].sort((a,b)=>a-b); })();
      const colIdx = (function(){ const idx=new Set(); $table.find('.nab-cell-selected').each(function(){ idx.add($(this).index()); }); return [...idx].sort((a,b)=>a-b); })();

      if(action==='row-above' && rowIdx.length){ const r0=rowIdx[0]; const cols=$table.find('tr:first').children('th,td').length; const $tr=$('<tr/>'); for(let i=0;i<cols;i++) $tr.append('<td>&nbsp;</td>'); $table.find('tr').eq(r0).before($tr); }
      if(action==='row-below' && rowIdx.length){ const r1=rowIdx[rowIdx.length-1]; const cols=$table.find('tr:first').children('th,td').length; const $tr=$('<tr/>'); for(let i=0;i<cols;i++) $tr.append('<td>&nbsp;</td>'); $table.find('tr').eq(r1).after($tr); }
      if(action==='col-left' && colIdx.length){ const c0=colIdx[0]; $table.find('tr').each(function(ri){ const tag=ri===0?'th':'td'; $(this).children('th,td').eq(c0).before(`<${tag}>&nbsp;</${tag}>`); }); }
      if(action==='col-right' && colIdx.length){ const c1=colIdx[colIdx.length-1]; $table.find('tr').each(function(ri){ const tag=ri===0?'th':'td'; $(this).children('th,td').eq(c1).after(`<${tag}>&nbsp;</${tag}>`); }); }
      if(action==='del-rows' && rowIdx.length){ for(let i=rowIdx.length-1;i>=0;i--) $table.find('tr').eq(rowIdx[i]).remove(); }
      if(action==='del-cols' && colIdx.length){ $table.find('tr').each(function(){ for(let i=colIdx.length-1;i>=0;i--) $(this).children('th,td').eq(colIdx[i]).remove(); }); }
      if(action==='del-table'){ $table.remove(); hideTableTools(); }

      $editable.find('.nab-cell-selected').removeClass('nab-cell-selected');
      hideTableTools(); sync();
    });

    // initial sync + toggles
    sync();
    function updateToggles(){ ['bold','italic','underline','strikeThrough'].forEach(cmd=>{ const st=document.queryCommandState(cmd); $toolbar.find(`.nab-btn[data-cmd="${cmd}"]`).attr('aria-pressed', st ? 'true':'false'); }); }
    $editable.on('keyup mouseup', function(){ updateToggles(); repositionImgResizer(); });

    return {
      getHTML: ()=> $hidden.val(),
      setHTML: (html)=> { $editable.html(html||''); sync(); },
      focus: ()=> $editable.trigger('focus'),
      destroy: ()=> { $('#nabImgResizer').hide(); $tableTools.remove(); $host.empty(); }
    };
  }

  /* ================== Public API ================== */
  const NABEditor = {
    mount: mountEditor,
    autoInit: function(selector='.nab-editor', options){
      const instances = [];
      $(selector).each(function(){ instances.push( NABEditor.mount($(this), options||{}) ); });
      return instances;
    }
  };
  window.NABEditor = NABEditor;

  // Auto-init
  $(function(){ NABEditor.autoInit(); });

})(window, document, window.jQuery);
