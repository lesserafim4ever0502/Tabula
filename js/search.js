/* js/search.js */

const TabulaSearch = (function () {
  const inputEl = document.getElementById('core-searchInput');
  const dropdownContainer = document.getElementById('bookmark-dropdown-container');
  let searchBoxWrapper; // 自由位移定位容器
  
  // 模式常量定义
  const MODE_WEB = 'WEB';
  const MODE_LOCAL = 'LOCAL';

  // 内部状态
  let currentMode = MODE_WEB;
  let filteredBookmarks = [];
  let selectedIndex = -1; // -1 表示没选中，或者焦点还在 input 上

  // 统一图标渲染引擎：支持系统矢量图标、用户 Emoji、及自定义上传图片（Base64）
  function getIconHTML(icon) {
    if (!icon || icon === '📌' || icon === 'i-bookmark') {
      return '<span class="t-icon i-bookmark"></span>';
    }
    // 用户上传的自定义图片（Base64 Data URL）
    if (typeof icon === 'string' && icon.startsWith('data:image')) {
      return `<img class="bm-icon-img" src="${icon}" alt="icon">`;
    }
    if (typeof icon === 'string' && icon.startsWith('i-')) {
      return `<span class="t-icon ${icon}"></span>`;
    }
    return `<span>${icon}</span>`;
  }

  // 渲染下拉面板
  function renderDropdown(items, queryStr) {
    if (items.length === 0) {
      hideDropdown();
      return;
    }

    const html = items.map((item, index) => {
      const isActive = index === selectedIndex ? 'active' : '';
      return `
        <div class="bm-item ${isActive}" data-index="${index}" data-id="${item.id}">
          <span class="bm-icon">${getIconHTML(item.icon)}</span>
          <div class="bm-info">
            <div class="bm-title">${escapeHTML(item.title)}</div>
          </div>
          ${item.alias ? `<span class="bm-alias-badge">${escapeHTML(item.alias)}</span>` : ''}
        </div>
      `;
    }).join('');

    dropdownContainer.innerHTML = html;
    dropdownContainer.classList.add('active');

    // 空间感知翻转：检测底部剩余空间是否足够容纳下拉列表（约180px）
    const rect = searchBoxWrapper.getBoundingClientRect();
    const dropdownSpaceNeeded = 180; 
    if (rect.bottom + dropdownSpaceNeeded > window.innerHeight) {
      searchBoxWrapper.classList.add('dropdown-above');
    } else {
      searchBoxWrapper.classList.remove('dropdown-above');
    }
  }

  // 关闭下拉面板
  function hideDropdown(immediate = false) {
    if (immediate) {
      dropdownContainer.style.transition = 'none';
    }

    dropdownContainer.classList.remove('active');
    dropdownContainer.innerHTML = '';
    selectedIndex = -1;

    if (immediate) {
      dropdownContainer.offsetHeight;
      dropdownContainer.style.transition = '';
    }
  }

  function prepareForNavigation() {
    hideDropdown(true);
    inputEl.blur();
    document.body.classList.remove('is-searching');
  }

  // 防XSS简易转义
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // 核心入口：处理 input keyup 进行模式判断及模糊匹配
  async function handleInput(e) {
    const query = e.target.value.trim().toLowerCase();
    
    // 每次输入变化，都意味着重新开始了本地侧漏
    currentMode = MODE_LOCAL;

    const allBM = await window.TabulaStorage.getAll();
    
    if (query === '') {
      filteredBookmarks = []; 
      hideDropdown();
      return;
    }

    // 执行带权重的模糊匹配：计算匹配分值以确定呈现优先级
    filteredBookmarks = allBM.map(bm => {
      const matchQuery = query.toLowerCase();
      
      // 1. URL：严格包含匹配 (权重: 1)
      const isUrlMatch = bm.url.toLowerCase().includes(matchQuery);
      
      // 2. 标题 & 别名：深度模糊匹配 (权重: 2)
      const isTitleMatch = window.PinyinMatch ? 
                          window.PinyinMatch.match(bm.title, matchQuery) : 
                          bm.title.toLowerCase().includes(matchQuery);
      const isAliasMatch = window.PinyinMatch ? 
                          window.PinyinMatch.match(bm.alias || '', matchQuery) : 
                          (bm.alias || '').toLowerCase().includes(matchQuery);

      let score = 0;
      if (isTitleMatch || isAliasMatch) {
        // 区分首字母/前缀精准命中(score=3) vs 模糊子序列命中(score=2)
        const titleStarts = bm.title.toLowerCase().startsWith(matchQuery);
        const aliasStarts = (bm.alias || '').toLowerCase().startsWith(matchQuery);
        score = (titleStarts || aliasStarts) ? 3 : 2;
      } else if (isUrlMatch) {
        score = 1;
      }

      return { ...bm, score };
    })
    .filter(bm => bm.score > 0)
    .sort((a, b) => {
      // 权重分级优先 (Level 2 > Level 1)
      if (a.score !== b.score) return b.score - a.score;
      // 同权重下，频次优先
      return (b.frequency || 0) - (a.frequency || 0);
    });

    // 容错处理：当重新输入内容时，清空选择项状态以便给回车默认触发 Web 留后路
    if (e && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
      selectedIndex = -1;
    }
    
    renderDropdown(filteredBookmarks, query);
  }

  // 跳转穿透并加权
  async function executeAction() {
    const rawVal = inputEl.value.trim();
    if (!rawVal) return;

    // 模式 A: 指令驱动搜索 (仅当以 / 开头时触发搜索引擎)
    if (rawVal.startsWith('/')) {
      const q = rawVal.substring(1).trim();
      if (!q) return;

      const enginePrefix = (window.TabulaSettings && typeof window.TabulaSettings.getSearchPrefix === 'function') 
        ? window.TabulaSettings.getSearchPrefix() 
        : 'https://www.google.com/search?q=';
      
      prepareForNavigation();
      window.location.href = enginePrefix + encodeURIComponent(q);
      return;
    }

    // 模式 C: 书签多开功能 (当输入包含逗号时触发)
    if (rawVal.includes(',') || rawVal.includes('，')) {
      const parts = rawVal.split(/[,，]/).map(p => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        const allBM = await window.TabulaStorage.getAll();
        const targets = [];
        
        for (const part of parts) {
          const matchQuery = part.toLowerCase();
          const matchedBMs = allBM.map(bm => {
            const isUrlMatch = bm.url.toLowerCase().includes(matchQuery);
            const isTitleMatch = window.PinyinMatch ? window.PinyinMatch.match(bm.title, matchQuery) : bm.title.toLowerCase().includes(matchQuery);
            const isAliasMatch = window.PinyinMatch ? window.PinyinMatch.match(bm.alias || '', matchQuery) : (bm.alias || '').toLowerCase().includes(matchQuery);
            let score = 0;
            if (isTitleMatch || isAliasMatch) {
              const titleStarts = bm.title.toLowerCase().startsWith(matchQuery);
              const aliasStarts = (bm.alias || '').toLowerCase().startsWith(matchQuery);
              score = (titleStarts || aliasStarts) ? 3 : 2;
            } else if (isUrlMatch) {
              score = 1;
            }
            return { ...bm, score };
          }).filter(bm => bm.score > 0).sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            return (b.frequency || 0) - (a.frequency || 0);
          });
          
          if (matchedBMs.length > 0) {
            targets.push(matchedBMs[0]);
          }
        }
        
        if (targets.length > 0) {
          targets.forEach(t => window.TabulaStorage.incrementFrequency(t.id));
          prepareForNavigation();
          
          targets.forEach(t => {
            if (window.chrome && window.chrome.tabs && window.chrome.tabs.create) {
              window.chrome.tabs.create({ url: t.url, active: false });
            } else {
              window.open(t.url, '_blank');
            }
          });
          inputEl.value = '';
          return;
        }
      }
    }

    // 模式 B: 书签优先跳转 (起始页核心逻辑)
    // 如果存在匹配的书签结果，无论用户是否用键盘通过 ArrowDown 显式选中，回车即执行首位（权重最高项）跳转
    if (filteredBookmarks.length > 0) {
      const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const targetBM = filteredBookmarks[targetIndex];
      
      await window.TabulaStorage.incrementFrequency(targetBM.id);
      prepareForNavigation();
      window.location.href = targetBM.url;
    } else {
      // 没有任何匹配且未输入指令：静默处理或可在此提示
      console.log("[Tabula] Logic: No match and no '/' instruction found.");
    }
  }

  // 专门处理拦截键盘系统行为（例如阻止上下键在 input 中光标乱跑）
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      inputEl.blur();
      hideDropdown();
      document.body.classList.remove('is-searching');
      return;
    }

    if (e.key === 'Tab') {
      // 当用户通过 Tab 键主动离场时，清除氛围并关闭下拉
      hideDropdown();
      document.body.classList.remove('is-searching');
    }

    if (filteredBookmarks.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % filteredBookmarks.length;
        renderDropdown(filteredBookmarks, inputEl.value.trim());
        // Track visual scroll
        const activeItem = dropdownContainer.querySelector('.bm-item.active');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
        return; 
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // 允许 -1 的兜底状态（回到搜索框本身的纯搜索态）
        selectedIndex = selectedIndex <= -1 ? filteredBookmarks.length - 1 : selectedIndex - 1;
        renderDropdown(filteredBookmarks, inputEl.value.trim());
        const activeItem = dropdownContainer.querySelector('.bm-item.active');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      executeAction();
    }
  }

  return {
    init() {
      if (!inputEl) return;
      searchBoxWrapper = document.querySelector('.search-box-wrapper');
      
      inputEl.addEventListener('input', handleInput);
      inputEl.addEventListener('keydown', handleKeyDown);
      // 输入框被鼠标 focus 点中时，立即触发一次空检索呈现高频历史
      inputEl.addEventListener('focus', () => { handleInput({ target: inputEl }); });

      // 点击空白处收起 Dropdown
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box-wrapper')) {
          hideDropdown();
          document.body.classList.remove('is-searching');
        }
      });

      // 智能聚焦联动：驱动全屏焦点氛围模糊
      inputEl.addEventListener('focus', () => {
        document.body.classList.add('is-searching');
      });

      // 移除旧的自动失焦清除逻辑，实现聚焦持久化 (Alt+Tab 依然保持氛围)
      // 只有在执行 Action 或点击外部时显式清除
      // inputEl.addEventListener('blur', () => { ... });

      // 鼠标点击书签项委托
      dropdownContainer.addEventListener('click', async (e) => {
        const itemEl = e.target.closest('.bm-item');
        if (itemEl) {
          const index = parseInt(itemEl.getAttribute('data-index'), 10);
          selectedIndex = index;
          await executeAction();
        }
      });
      
      // 全局按键捕获：只在用户非功能区键入时夺回焦点
      document.addEventListener('keydown', (e) => {
        // 排除掉已经聚焦在输入框、侧边栏搜索框、或者正在操作设置/模态框的情况
        const isInputActive = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA';
        const isModalOpen = document.getElementById('settings-modal').style.display !== 'none';
        const isDrawerOpen = document.getElementById('drawer-container').classList.contains('active');

        if (!isInputActive && !isModalOpen && !isDrawerOpen) {
          // 全局快捷键夺回焦点：Shift + Space (或普通单字符)
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // 核心修复：精准识别 Shift + 空格，并在聚焦前彻底杀死默认的空格输入动作
            if (e.code === 'Space' && e.shiftKey) {
              e.preventDefault();
              e.stopImmediatePropagation();
              inputEl.focus();
              return;
            }
            inputEl.focus();
          }
        }
      });

      console.log("[TabulaSearch] Key/Input tracking initialized.");
    }
  };
})();

// 提供全局引用
window.TabulaSearch = TabulaSearch;
