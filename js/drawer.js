/* js/drawer.js */

const TabulaDrawer = (function () {
  const drawerEl = document.getElementById('drawer-container');
  const closeBtn = document.getElementById('drawer-close-btn');
  const listContainer = document.getElementById('drawer-list-container');
  const btnAddNew = document.getElementById('btn-add-new');
  const btnExport = document.getElementById('btn-export');
  const btnHealthCheck = document.getElementById('btn-health-check');
  const importFile = document.getElementById('import-file');
  
  // 核心状态：当前是否有打开的编辑器
  let editingId = null;
  let isNewEditing = false; // 标志位：是否正在编辑刚新建的项
  let isOpen = false;
  let focusedIndex = -1; // 记录键盘聚焦选中的卡片索引
  let currentRenderedList = []; // 记录当前过滤后渲染的数组
  let healthMode = false;
  const searchInputDrawer = document.getElementById('drawer-search-input');

  // 统一图标渲染引擎：支持矢量图标、Emoji 及用户自定义上传图片（Base64）
  function getIconHTML(icon) {
    if (!icon || icon === '📌' || icon === 'i-bookmark') {
      return '<span class="t-icon i-bookmark"></span>';
    }
    if (typeof icon === 'string' && icon.startsWith('data:image')) {
      return `<img class="bm-icon-img" src="${icon}" alt="icon">`;
    }
    if (typeof icon === 'string' && icon.startsWith('i-')) {
      return `<span class="t-icon ${icon}"></span>`;
    }
    return `<span>${icon}</span>`;
  }

  // Canvas 压缩管线：任意图片 → 48×48 JPEG Base64（SVG 直通）
  function compressIcon(file) {
    return new Promise((resolve) => {
      if (file.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const SIZE = 48;
          const canvas = document.createElement('canvas');
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext('2d');
          // Cover 居中裁切
          const scale = Math.max(SIZE / img.width, SIZE / img.height);
          const sw = SIZE / scale, sh = SIZE / scale;
          const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ==== 核心开关控制 ====

  function openDrawer() {
    isOpen = true;
    drawerEl.classList.add('open');
    if (searchInputDrawer) {
      searchInputDrawer.value = '';
    }
    focusedIndex = -1;
    healthMode = false;
    renderList();
  }

  function closeDrawer() {
    isOpen = false;
    drawerEl.classList.remove('open');
    editingId = null;
    focusedIndex = -1;
    healthMode = false;
  }

  // 组件滚动对齐
  function scrollToFocus() {
    const activeEl = listContainer.querySelector('.keyboard-focus');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  // ==== 数据与视图渲染 ====

  async function renderList(query) {
    if (healthMode) {
      await renderHealthReport();
      return;
    }

    // 核心修复：若点击编辑/保存等动作未传参，自动从搜索框 DOM 实时同步当前的过滤关键词
    const activeQuery = query !== undefined ? query : (searchInputDrawer ? searchInputDrawer.value.trim() : '');
    
    let allBM = await window.TabulaStorage.getAll();
    
    // 局部检索过滤
    if (activeQuery) {
      allBM = allBM.map(bm => {
        const q = activeQuery.toLowerCase();
        // 1. URL 严格包含 (Score: 1)
        const isUrlMatch = bm.url.toLowerCase().includes(q);
        // 2. 标题 & 别名：启用 Pinyin 子序列模糊匹配 (Score: 2)
        const isTitleMatch = window.PinyinMatch ? 
                            window.PinyinMatch.match(bm.title, q) : 
                            bm.title.toLowerCase().includes(q);
        const isAliasMatch = window.PinyinMatch ? 
                            window.PinyinMatch.match(bm.alias || '', q) : 
                            (bm.alias || '').toLowerCase().includes(q);

        let score = 0;
        if (isTitleMatch || isAliasMatch) score = 2;
        else if (isUrlMatch) score = 1;

      return { ...bm, score };
      })
      .filter(bm => bm.score > 0)
      .sort(compareBookmarkRank);
    }

    // 编辑中的书签如果属于“新建并置顶”场景，则始终强制置顶
    // （解决新建书签频率为0被排到底部的问题；而已有项编辑则保持原位）
    if (editingId !== null && isNewEditing) {
      const editIdx = allBM.findIndex(b => String(b.id) === String(editingId));
      if (editIdx > 0) {
        const [editItem] = allBM.splice(editIdx, 1);
        allBM.unshift(editItem);
      }
    }

    currentRenderedList = allBM;

    // 如果为空
    if (allBM.length === 0) {
      listContainer.innerHTML = `<div class="bm-empty" style="margin-top: 40px">No bookmarks found.</div>`;
      return;
    }

    const html = allBM.map((bm, index) => {
      const isFocused = index === focusedIndex ? 'keyboard-focus' : '';
      
      // 正在处于编辑态的 Row
      if (editingId === bm.id) {
        const iconPreviewHTML = getIconHTML(bm.icon);
        return `
          <div class="bm-edit-form ${isFocused}" data-id="${bm.id}">
            <div class="edit-header-row">
              <div class="icon-upload-area" title="点击更换图标">
                <div class="icon-preview-wrap">${iconPreviewHTML}</div>
                <input type="file" class="icon-file-inp" accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/svg+xml" style="display:none">
                <span class="icon-upload-hint">Change</span>
              </div>
              <div class="edit-right-col">
                <input type="text" class="edit-alias-inp" value="${escapeHTML(bm.alias || '')}" placeholder="Alias">
                <button class="btn-sm icon-reset-btn">↩ Reset</button>
              </div>
            </div>
            <input type="text" class="edit-title-inp" value="${escapeHTML(bm.title)}" placeholder="Title">
            <input type="text" class="edit-url-inp" value="${escapeHTML(bm.url)}" placeholder="URL">
            <div class="form-actions">
              <button class="btn-sm btn-primary action-save">✓ Save</button>
              <button class="btn-sm btn-cancel action-cancel">Cancel</button>
              <button class="btn-sm btn-warning action-reset" title="Reset frequency">0 Freq</button>
              <button class="btn-sm btn-danger action-delete">Delete</button>
            </div>
          </div>
        `;
      }
      
      // 普通展示态的 Row
      return `
        <div class="bm-view-item ${isFocused}" data-id="${bm.id}" data-index="${index}">
          <span class="bm-icon">${getIconHTML(bm.icon)}</span>
          <div class="bm-info">
            <div class="bm-title" title="${escapeHTML(bm.title)}">
               <span class="bm-title-text">${escapeHTML(bm.title)}</span>
               ${bm.alias ? `<span class="bm-alias-badge">${escapeHTML(bm.alias)}</span>` : ''}
            </div>
          </div>
          <span class="bm-freq">★ ${bm.frequency}${bm.lastUsedAt ? ' · Recent' : ''}</span>
          <button class="icon-btn edit-icon action-edit" title="Edit">✎</button>
        </div>
      `;
    }).join('');

    listContainer.innerHTML = html;
    bindListEvents();
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag] || tag));
  }

  function compareBookmarkRank(a, b) {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.lastUsedAt || 0) !== (a.lastUsedAt || 0)) {
      return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
    }
    return (b.frequency || 0) - (a.frequency || 0);
  }

  function renderIssueGroup(title, items, formatter) {
    if (!items.length) return '';
    return `
      <section class="health-group">
        <h3>${escapeHTML(title)} <span>${items.length}</span></h3>
        ${items.map(formatter).join('')}
      </section>
    `;
  }

  function renderBookmarkIssue(bm) {
    return `
      <div class="health-item">
        <strong>${escapeHTML(bm.title || 'Untitled Bookmark')}</strong>
        <span>${escapeHTML(bm.url || 'Missing URL')}</span>
      </div>
    `;
  }

  function renderDuplicateGroup(group) {
    return `
      <div class="health-item">
        ${group.map(bm => `<strong>${escapeHTML(bm.title || 'Untitled Bookmark')}</strong>`).join('')}
        <span>${group.map(bm => escapeHTML(bm.url || 'Missing URL')).join(' | ')}</span>
      </div>
    `;
  }

  async function renderHealthReport() {
    const report = await window.TabulaStorage.healthCheck();
    const issueCount = report.invalidUrls.length + report.missingTitles.length + report.duplicateUrls.length + report.duplicateAliases.length;
    focusedIndex = -1;
    currentRenderedList = [];

    listContainer.innerHTML = `
      <div class="health-report">
        <div class="health-summary ${issueCount === 0 ? 'is-clean' : ''}">
          <div>
            <strong>${issueCount === 0 ? 'All bookmarks look healthy.' : `${issueCount} issue groups found.`}</strong>
            <span>${report.total} bookmarks checked locally.</span>
          </div>
          <button class="btn-sm action-health-back">Back</button>
        </div>
        ${renderIssueGroup('Invalid URLs', report.invalidUrls, renderBookmarkIssue)}
        ${renderIssueGroup('Missing Titles', report.missingTitles, renderBookmarkIssue)}
        ${renderIssueGroup('Duplicate URLs', report.duplicateUrls, renderDuplicateGroup)}
        ${renderIssueGroup('Duplicate Aliases', report.duplicateAliases, renderDuplicateGroup)}
      </div>
    `;

    const backBtn = listContainer.querySelector('.action-health-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        healthMode = false;
        renderList(searchInputDrawer ? searchInputDrawer.value.trim() : '');
      });
    }
  }

  // ==== 列表内的事件代理委托 ====

  function bindListEvents() {
    
    // Bookmark Item Click to Jump
    const viewItems = listContainer.querySelectorAll('.bm-view-item');
    viewItems.forEach(item => item.addEventListener('click', async (e) => {
      if (e.target.closest('.action-edit')) return;
      
      const id = item.dataset.id;
      const targetBM = currentRenderedList.find(b => String(b.id) === String(id));
      if (targetBM) {
        await window.TabulaStorage.incrementFrequency(targetBM.id);
        window.location.href = targetBM.url;
      }
    }));
    // 因为每次 renderList 都会重写 DOM，这里直接找渲染后的 btn
    const editBtns = listContainer.querySelectorAll('.action-edit');
    editBtns.forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      isNewEditing = false; // 明确：点击已有项编辑不执行置顶
      editingId = e.target.closest('.bm-view-item').dataset.id;
      renderList();
    }));

    const cancelBtns = listContainer.querySelectorAll('.action-cancel');
    cancelBtns.forEach(btn => btn.addEventListener('click', () => {
      editingId = null;
      isNewEditing = false;
      renderList();
    }));

    // 图标上传：点击预览区触发 file input
    const iconUploadAreas = listContainer.querySelectorAll('.icon-upload-area');
    iconUploadAreas.forEach(area => {
      area.addEventListener('click', () => {
        area.querySelector('.icon-file-inp').click();
      });
    });

    // 图标文件选择：Canvas 压缩 + 实时预览
    const iconFileInps = listContainer.querySelectorAll('.icon-file-inp');
    iconFileInps.forEach(inp => {
      inp.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const area = inp.closest('.icon-upload-area');
        const form = inp.closest('.bm-edit-form');
        const base64 = await compressIcon(file);
        form.dataset.pendingIcon = base64;
        // 实时预览
        area.querySelector('.icon-preview-wrap').innerHTML = `<img class="bm-icon-img" src="${base64}" alt="icon">`;
      });
    });

    // 重置图标为默认
    const iconResetBtns = listContainer.querySelectorAll('.icon-reset-btn');
    iconResetBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const form = btn.closest('.bm-edit-form');
        form.dataset.pendingIcon = 'i-bookmark';
        const area = form.querySelector('.icon-preview-wrap');
        area.innerHTML = '<span class="t-icon i-bookmark"></span>';
      });
    });

    const saveBtns = listContainer.querySelectorAll('.action-save');
    saveBtns.forEach(btn => btn.addEventListener('click', async (e) => {
      const form = e.target.closest('.bm-edit-form');
      const id = form.dataset.id;
      // 优先使用 pendingIcon（上传或重置）；若无则维持旧图标
      const bm = currentRenderedList.find(b => String(b.id) === String(id));
      const newIcon = form.dataset.pendingIcon !== undefined
        ? form.dataset.pendingIcon
        : (bm ? bm.icon : 'i-bookmark');
      const updates = {
        icon: newIcon,
        alias: form.querySelector('.edit-alias-inp').value.trim(),
        title: form.querySelector('.edit-title-inp').value,
        url: form.querySelector('.edit-url-inp').value
      };
      await window.TabulaStorage.update(id, updates);
      editingId = null;
      isNewEditing = false;
      renderList();
    }));

    const delBtns = listContainer.querySelectorAll('.action-delete');
    delBtns.forEach(btn => btn.addEventListener('click', async (e) => {
      if (confirm("Delete this bookmark?")) {
        const id = e.target.closest('.bm-edit-form').dataset.id;
        await window.TabulaStorage.remove(id);
        editingId = null;
        isNewEditing = false;
        renderList();
      }
    }));

    const resetBtns = listContainer.querySelectorAll('.action-reset');
    resetBtns.forEach(btn => btn.addEventListener('click', async (e) => {
        const id = e.target.closest('.bm-edit-form').dataset.id;
        await window.TabulaStorage.resetFrequency(id);
        renderList();
    }));
  }

  // ==== 导入导出与数据操纵 ====

  async function handleExport() {
    const htmlStr = await window.TabulaStorage.exportData();
    const blob = new Blob([htmlStr], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tabula_Backup_${new Date().getTime()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target.result;
      const success = await window.TabulaStorage.importData(content);
      if (success) {
        alert("Bookmarks imported successfully!");
        renderList();
      } else {
        alert("Failed to import. Please check if the JSON is valid.");
      }
    };
    reader.readAsText(file);
    // 重置 input 以便下次同文件依然能触发 onChange
    e.target.value = '';
  }

  return {
    init() {
      if (!drawerEl) return;

      // Drawer 本地搜索框绑定
      if (searchInputDrawer) {
        searchInputDrawer.addEventListener('input', (e) => {
          healthMode = false;
          focusedIndex = -1;
          renderList(e.target.value.trim());
        });
      }

      // 强绑定快捷键 Ctrl+B 和 Cmd+B
      document.addEventListener('keydown', (e) => {
        // 1. 切换 Drawer
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          if (isOpen) closeDrawer();
          else openDrawer();
          return;
        }

        // 全局 / 或 Shift+Space 跳转搜索框 (Shift+Space 冲突更少)
        const isFocusShortcut = e.key === '/' || (e.shiftKey && (e.code === 'Space' || e.key === ' '));
        if (isFocusShortcut && !isOpen && document.activeElement !== document.getElementById('core-searchInput')) {
          e.preventDefault();
          const mainInput = document.getElementById('core-searchInput');
          if (mainInput) {
            mainInput.focus();
            mainInput.select();
          }
          return;
        }

        if (!isOpen) return;

        // 如果焦点在内部输入表单上，允许使用 Esc 退回并中断操作，或者 Enter 直接保存
        const focusInEditForm = e.target.closest('.bm-edit-form');
        if (focusInEditForm && (e.target.tagName === 'INPUT')) {
          if (e.key === 'Escape') {
             editingId = null;
             renderList(searchInputDrawer ? searchInputDrawer.value.trim() : '');
             e.preventDefault();
             e.stopPropagation();
          } else if (e.key === 'Enter') {
             const saveBtn = focusInEditForm.querySelector('.action-save');
             if (saveBtn) saveBtn.click();
             e.preventDefault();
             e.stopPropagation();
          }
          return; // 表单内停止其他 Vim 热键响应
        }

        // 2. Esc 层级取消
        if (e.key === 'Escape') {
          if (editingId !== null) {
            editingId = null;
            isNewEditing = false;
            renderList(searchInputDrawer ? searchInputDrawer.value.trim() : '');
          } else {
            closeDrawer();
          }
          return;
        }

        // 3. Vim 热键穿透 (避免和输入框冲突)
        if (e.target.tagName !== 'INPUT' || e.target === searchInputDrawer) {
          const q = searchInputDrawer ? searchInputDrawer.value.trim() : '';
          
          if (e.key === 'ArrowDown' || (e.key === 'j' && e.target !== searchInputDrawer)) {
            e.preventDefault();
            if (currentRenderedList.length > 0) {
              focusedIndex = (focusedIndex + 1) % currentRenderedList.length;
              renderList(q);
              scrollToFocus();
            }
          } else if (e.key === 'ArrowUp' || (e.key === 'k' && e.target !== searchInputDrawer)) {
            e.preventDefault();
            if (currentRenderedList.length > 0) {
              focusedIndex = focusedIndex <= 0 ? currentRenderedList.length - 1 : focusedIndex - 1;
              renderList(q);
              scrollToFocus();
            }
          } else if (e.key === 'o' && e.target !== searchInputDrawer) {
            if (focusedIndex >= 0 && currentRenderedList[focusedIndex]) {
              e.preventDefault();
              window.open(currentRenderedList[focusedIndex].url, '_blank');
              window.TabulaStorage.incrementFrequency(currentRenderedList[focusedIndex].id);
            }
          } else if (e.key === 'Enter') {
            // 对当前光标编辑
            if (focusedIndex >= 0 && currentRenderedList[focusedIndex]) {
              e.preventDefault();
              isNewEditing = false;
              editingId = currentRenderedList[focusedIndex].id;
              renderList(q);
            }
          } else if (e.key === 'Delete') {
            // 对当前光标删除
            if (focusedIndex >= 0 && currentRenderedList[focusedIndex]) {
              e.preventDefault();
              if (confirm("Delete this bookmark [" + currentRenderedList[focusedIndex].title + "]?")) {
                window.TabulaStorage.remove(currentRenderedList[focusedIndex].id);
                focusedIndex = -1;
                renderList(q);
              }
            }
          }
        }
      });

      // UI 绑定
      closeBtn.addEventListener('click', closeDrawer);
      
      btnAddNew.addEventListener('click', async () => {
        const newBM = await window.TabulaStorage.add("New Bookmark", "https://");
        editingId = newBM.id;
        isNewEditing = true; // 开启置顶逻辑：因为是新创建的，需要用户立即看到
        renderList();
      });

      if (btnExport) {
        btnExport.addEventListener('click', handleExport);
      }

      if (btnHealthCheck) {
        btnHealthCheck.addEventListener('click', () => {
          healthMode = true;
          renderHealthReport();
        });
      }

      const realBtnImport = document.getElementById('btn-import');
      if (realBtnImport) {
        realBtnImport.addEventListener('click', () => {
          if (importFile) importFile.click();
        });
      }

      if (importFile) {
        importFile.addEventListener('change', handleImport);
      }

      const btnClearAll = document.getElementById('btn-clear-all');
      if (btnClearAll) {
        btnClearAll.addEventListener('click', async () => {
          if (confirm("Are you SURE you want to delete all bookmarks? This cannot be undone!")) {
            await window.TabulaStorage.removeAll();
            renderList();
          }
        });
      }

      console.log("[TabulaDrawer] Drawer initialized via Ctrl+B.");
    }
  };
})();

window.TabulaDrawer = TabulaDrawer;
