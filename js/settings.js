/**
 * settings.js
 * 负责起始页的全局配置生命周期：背景上传存储、搜索引擎切换等。
 */

const TabulaSettings = (function () {
  const STORAGE_KEY = 'tabula_config';
  const DEFAULT_CONFIG = {
    engine: 'google',
    bgColor: '#0f0f11',
    bgImage: null, 
    customUrl: '',
    searchWidth: 560,
    searchOpacity: 0.1,
    searchBackdropBlur: 20,
    wpBlur: 0,
    wpBrightness: 1.0,
    searchLeft: 50,
    searchTop: 45
  };

  const engineUrls = {
    google: "https://www.google.com/search?q=",
    bing: "https://www.bing.com/search?q=",
    baidu: "https://www.baidu.com/s?wd="
  };

  let config = { ...DEFAULT_CONFIG };

  // ---- UI Elements ----
  let modalOverlay, btnOpen, btnClose;
  let engineBtns, colorPicker, btnUpload, inputFile, btnReset;
  let colorLayer, bgLayer;
  let customEngineWrapper, customEngineInput;

  async function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], async (res) => {
        if (res[STORAGE_KEY]) {
          config = { ...DEFAULT_CONFIG, ...res[STORAGE_KEY] };
          
          // ==== 自动迁移逻辑：Base64 -> IndexedDB & 生成缩略图 ====
          if (config.bgImage && config.bgImage.startsWith('data:image')) {
            console.log("[Tabula] Migrating legacy Base64 wallpaper to IndexedDB...");
            try {
              const response = await fetch(config.bgImage);
              const blob = await response.blob();
              await TabulaIDB.setWallpaper('main', blob);
              config.bgImage = 'indexeddb:wallpaper';
              await saveConfig();
              console.log("[Tabula] Migration successful.");
            } catch (e) {
              console.error("[Tabula] Migration failed:", e);
            }
          }

          // 额外检查：如果已经是数据库模式但缺少缩略图（针对迁移）
          if (config.bgImage === 'indexeddb:wallpaper' && !localStorage.getItem('tabula_bgThumb')) {
            console.log("[Tabula] Missing thumbnail for existing wallpaper, generating...");
            const blob = await getWallpaperBlob();
            if (blob) {
              const img = new Image();
              img.onload = () => {
                const thumbData = generateThumbnail(img);
                localStorage.setItem('tabula_bgThumb', thumbData);
                // 不再自动修改颜色样本，尊重用户的 bgColor 配置
              };
              img.src = URL.createObjectURL(blob);
            }
          }
        }
        resolve(config);
      });
    });
  }

  async function saveConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: config }, () => {
        // 同步存入 localStorage（作为首帧防闪烁的底层缓存）
        try {
          if (config.bgImage) {
            // 如果是数据库存储，存入一个标记位，让 preload.js 知道有图
            const val = config.bgImage === 'indexeddb:wallpaper' ? 'indexeddb' : config.bgImage;
            localStorage.setItem('tabula_bgImage', val);
          } else {
            localStorage.removeItem('tabula_bgImage');
            localStorage.removeItem('tabula_bgThumb'); // 清理缩略图
          }
          localStorage.setItem('tabula_bgColor', config.bgColor);
          
          // ==== NEW Phase 2.9: 同步关键视觉参数到 localStorage 以供 preload.js 瞬时提取 ====
          localStorage.setItem('tabula_searchWidth', config.searchWidth);
          localStorage.setItem('tabula_searchOpacity', config.searchOpacity);
          localStorage.setItem('tabula_searchLeft', config.searchLeft);
          localStorage.setItem('tabula_searchTop', config.searchTop);
        } catch (e) {
          console.warn("[Tabula] localStorage quota exceeded, check storage usage.", e);
        }
        resolve();
      });
    });
  }

  async function getWallpaperBlob() {
    try {
      if (window.__tabula_wp_cache) {
        const cachedBlob = await window.__tabula_wp_cache;
        if (cachedBlob) return cachedBlob;
      }
    } catch (e) {
      console.warn("[Tabula] Preloaded wallpaper cache failed, retrying IDB.", e);
    } finally {
      window.__tabula_wp_cache = null;
    }

    return TabulaIDB.getWallpaper('main');
  }

  async function applyBackground() {
    console.log("[Tabula] Applying background style... Image:", !!config.bgImage, "Color:", config.bgColor);

    const layerColor = config.bgColor || '#0f0f11';
    document.documentElement.style.backgroundColor = layerColor;
    document.documentElement.style.setProperty('--init-bg-color', layerColor);
    if (colorLayer) {
      colorLayer.style.backgroundColor = layerColor;
    }
    
    // 强制重置壁纸层，纯色层由 colorLayer 独立承载
    bgLayer.style.background = 'none';
    bgLayer.style.backgroundImage = 'none';
    bgLayer.style.backgroundColor = 'transparent';

    if (config.bgImage) {
      bgLayer.style.backgroundPosition = 'center center';
      bgLayer.style.backgroundSize = 'cover';
      bgLayer.style.backgroundRepeat = 'no-repeat';

      if (config.bgImage === 'indexeddb:wallpaper') {
        const blob = await getWallpaperBlob();
        if (blob) {
          const url = URL.createObjectURL(blob);
          console.log("[Tabula] Successfully generated ObjectURL for rendering.");
          // 关闭预加载器的 CSS Blur，配合 0.3s transition 实现“聚焦”效果
          bgLayer.style.filter = ''; // 移除显式 none，允许 CSS Focus 滤镜生效
          bgLayer.style.backgroundImage = `url(${url})`;
          bgLayer.classList.add('wallpaper-fade');
        } else {
          console.warn("[Tabula] Wallpaper blob missing in IDB, using fallback background.");
          bgLayer.style.filter = '';
          const thumb = localStorage.getItem('tabula_bgThumb');
          if (thumb) {
            bgLayer.style.backgroundImage = `url(${thumb})`;
            bgLayer.classList.add('wallpaper-fade');
          }
        }
      } else {
        // Legacy/Direct Base64
        bgLayer.style.filter = '';
        bgLayer.style.backgroundImage = `url(${config.bgImage})`;
      }
    } else {
      console.log("[Tabula] Solid color mode activated.");
      bgLayer.style.backgroundImage = 'none';
      bgLayer.style.filter = '';
      bgLayer.classList.remove('wallpaper-fade');
    }
  }

  /**
   * 应用全维度视觉参数（搜索框 & 壁纸）
   * 确保这些参数在常态与聚焦态下均能实时生效
   */
  async function applyVisualStyles() {
    const root = document.documentElement;
    // 强制保护：确保配置项即使在数据异常时也能平稳运行
    const bBlur = config.searchBackdropBlur ?? 20;
    const wpB = config.wpBlur ?? 0;
    const wpBright = config.wpBrightness ?? 1.0;

    // 分发 CSS 变量 (注入 root 级别以保证全局覆盖)
    root.style.setProperty('--search-width', `${config.searchWidth || 560}px`);
    root.style.setProperty('--search-opacity', config.searchOpacity ?? 0.1);
    root.style.setProperty('--search-backdrop-blur', `${bBlur}px`);
    
    // 关键修正：确保壁纸参数被 body 和 html 同时捕获，增强渲染优先级
    root.style.setProperty('--wp-base-blur', `${wpB}px`);
    root.style.setProperty('--wp-brightness', wpBright);

    // 新增：分发搜索框位置变量
    root.style.setProperty('--search-left', `${config.searchLeft ?? 50}%`);
    root.style.setProperty('--search-top', `${config.searchTop ?? 45}%`);
    
    // 额外强制刷新：针对部分 Chromium 版本的渲染抑制
    if (bgLayer) {
      bgLayer.style.zIndex = '2';
    }
  }

  function renderUIState() {
    // Engine Buttons
    engineBtns.forEach(btn => {
      if (btn.dataset.engine === config.engine) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 处理自定义输入框显隐
    if (config.engine === 'custom') {
      customEngineWrapper.style.display = 'block';
    } else {
      customEngineWrapper.style.display = 'none';
    }
    customEngineInput.value = config.customUrl || '';

    // Color
    colorPicker.value = config.bgColor;
  }

  // ==== Event Handlers ====

  function bindEvents() {
    btnOpen.addEventListener('click', () => {
      renderUIState();
      modalOverlay.style.display = 'flex';
      setTimeout(() => modalOverlay.classList.add('active'), 10);
    });

    btnClose.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
      setTimeout(() => modalOverlay.style.display = 'none', 300); // Wait for transition
    });

    // Handle Tab Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        // Remove active class from all nav items and panes
        navItems.forEach(nav => nav.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        // Add active class to clicked nav item
        item.classList.add('active');
        
        // Add active class to corresponding tab pane
        const targetTabId = 'tab-' + item.dataset.tab;
        const targetPane = document.getElementById(targetTabId);
        if (targetPane) {
          targetPane.classList.add('active');
        }
      });
    });

    // Handle Engine Select
    engineBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        config.engine = e.target.dataset.engine;
        renderUIState();
        await saveConfig();
      });
    });

    // Handle Custom URL Change
    customEngineInput.addEventListener('input', (e) => {
      config.customUrl = e.target.value.trim();
    });
    customEngineInput.addEventListener('change', async () => {
      await saveConfig();
    });

    // Handle Color Change
    colorPicker.addEventListener('input', async (e) => {
      config.bgColor = e.target.value;
      await applyBackground();
    });
    colorPicker.addEventListener('change', async () => {
      await saveConfig();
    });

    // Handle Image Upload
    btnUpload.addEventListener('click', () => inputFile.click());

    inputFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      console.log("[Tabula] File selected:", file.name, file.size);
      
      const reader = new FileReader();
      reader.onerror = (err) => console.error("[Tabula] FileReader error:", err);
      
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => console.error("[Tabula] Image object load failed.");
        
        img.onload = async () => {
          console.log("[Tabula] Image loaded into object, starting canvas processing...");
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_WIDTH = 2560; 
          
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          console.log("[Tabula] Canvas drawn, converting to blob...");
          canvas.toBlob(async (blob) => {
            if (!blob) {
              console.error("[Tabula] Canvas.toBlob returned null.");
              return;
            }
            console.log("[Tabula] Blob generated, saving to IDB...", blob.size);
            
            try {
              // 0. 重要：废弃 preload.js 中的旧预加载 Promise 缓存
              window.__tabula_wp_cache = null;

              // 1. 生成并保存缩略图到 localStorage (不再自动修改基准色 bgColor)
              const thumbData = generateThumbnail(img);
              localStorage.setItem('tabula_bgThumb', thumbData);

              // 2. 保存原图到 IDB
              await TabulaIDB.setWallpaper('main', blob);
              config.bgImage = 'indexeddb:wallpaper';
              
              console.log("[Tabula] Saved to IDB, applying background UI...");
              await applyBackground();
              await saveConfig();
              
              inputFile.value = '';
              console.log("[Tabula] Upload process complete.");
            } catch (err) {
              console.error("[Tabula] Failed during IDB set or UI apply:", err);
            }
          }, 'image/webp', 0.85);
        };
        img.src = event.target.result;
      };
      
      reader.readAsDataURL(file);
    });

    // Handle Reset Background
    btnReset.addEventListener('click', async () => {
      config = { ...DEFAULT_CONFIG, engine: config.engine };
      await TabulaIDB.deleteWallpaper('main');
      await applyBackground();
      renderUIState();
      await saveConfig();
    });

    // Global Hotkey: Ctrl + , (or Cmd + ,) to toggle settings
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        if (modalOverlay.classList.contains('active')) {
          btnClose.click();
        } else {
          btnOpen.click();
        }
      } else if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
        e.preventDefault();
        btnClose.click();
      }
    });

    // Handle Remove Wallpaper Only
    btnDeleteWallpaper.addEventListener('click', async () => {
      config.bgImage = null;
      localStorage.removeItem('tabula_bgImage');
      localStorage.removeItem('tabula_bgThumb');
      window.__tabula_wp_cache = null;
      await TabulaIDB.deleteWallpaper('main');
      await applyBackground();
      await saveConfig();
    });

    // Handle Search Box Tuning
    const widthSlider = document.getElementById('search-width-slider');
    const searchBlurSlider = document.getElementById('search-backdrop-blur-slider');
    const opacitySlider = document.getElementById('search-opacity-slider');

    widthSlider.addEventListener('input', (e) => {
      config.searchWidth = parseInt(e.target.value, 10);
      applyVisualStyles();
    });
    widthSlider.addEventListener('change', () => saveConfig());

    searchBlurSlider.addEventListener('input', (e) => {
      config.searchBackdropBlur = parseInt(e.target.value, 10);
      applyVisualStyles();
    });
    searchBlurSlider.addEventListener('change', () => saveConfig());

    opacitySlider.addEventListener('input', (e) => {
      config.searchOpacity = parseFloat(e.target.value);
      applyVisualStyles();
    });
    opacitySlider.addEventListener('change', () => saveConfig());

    // Handle Wallpaper Tuning
    const wpBlurSlider = document.getElementById('wp-blur-slider');
    const wpBrightnessSlider = document.getElementById('wp-brightness-slider');

    wpBlurSlider.addEventListener('input', (e) => {
      config.wpBlur = parseInt(e.target.value, 10);
      applyVisualStyles();
    });
    wpBlurSlider.addEventListener('change', () => saveConfig());

    wpBrightnessSlider.addEventListener('input', (e) => {
      config.wpBrightness = parseFloat(e.target.value);
      applyVisualStyles();
    });
    wpBrightnessSlider.addEventListener('change', () => saveConfig());

    // Handle Search Position
    const searchLeftSlider = document.getElementById('search-left-slider');
    const searchTopSlider = document.getElementById('search-top-slider');
    const btnCenterX = document.getElementById('btn-center-x');
    const btnCenterY = document.getElementById('btn-center-y');
    const btnCenterAll = document.getElementById('btn-center-all');

    searchLeftSlider.addEventListener('input', (e) => {
      config.searchLeft = parseInt(e.target.value, 10);
      applyVisualStyles();
    });
    searchLeftSlider.addEventListener('change', () => saveConfig());

    searchTopSlider.addEventListener('input', (e) => {
      config.searchTop = parseInt(e.target.value, 10);
      applyVisualStyles();
    });
    searchTopSlider.addEventListener('change', () => saveConfig());

    btnCenterX.addEventListener('click', async () => {
      config.searchLeft = 50;
      searchLeftSlider.value = 50;
      applyVisualStyles();
      await saveConfig();
    });

    btnCenterY.addEventListener('click', async () => {
      config.searchTop = 45;
      searchTopSlider.value = 45;
      applyVisualStyles();
      await saveConfig();
    });

    btnCenterAll.addEventListener('click', async () => {
      config.searchLeft = 50;
      config.searchTop = 45;
      searchLeftSlider.value = 50;
      searchTopSlider.value = 45;
      applyVisualStyles();
      await saveConfig();
    });

    // ==== NEW Phase 2.9: Backup & Restore Event Binding ====
    const btnExport = document.getElementById('btn-export-backup');
    const btnImportTrigger = document.getElementById('btn-import-trigger');
    const btnSyncOdin = document.getElementById('btn-sync-odin');
    const btnPreviewOdin = document.getElementById('btn-preview-odin');
    const odinSyncScope = document.getElementById('odin-sync-scope');
    const odinScopeSelect = document.getElementById('odin-scope-select');
    const odinScopeTrigger = document.getElementById('odin-scope-trigger');
    const odinScopeLabel = document.getElementById('odin-scope-label');
    const odinScopeOptions = document.querySelectorAll('.scope-select-option');
    const odinSyncStatus = document.getElementById('odin-sync-status');
    const odinSyncDetails = document.getElementById('odin-sync-details');
    const odinStatusRow = document.getElementById('odin-status-row');
    const odinConnectionLabel = document.getElementById('odin-connection-label');
    const inputImport = document.getElementById('input-import-backup');
    const ODIN_BASE_URL = 'http://127.0.0.1:29000';

    function setOdinSyncStatus(message, type = '') {
      if (!odinSyncStatus) return;
      odinSyncStatus.textContent = message;
      odinSyncStatus.className = `sync-status ${type}`.trim();
    }

    function setOdinConnectionStatus(state, message) {
      if (!odinStatusRow || !odinConnectionLabel) return;
      odinStatusRow.className = `odin-status-row ${state}`.trim();
      odinConnectionLabel.textContent = message;
    }

    function escapeHTML(str) {
      return window.TabulaStorage._escapeHTML(str);
    }

    function setOdinDetails(details) {
      if (!odinSyncDetails) return;
      const groups = [
        ['Added bookmarks', details.addedBookmarks],
        ['Skipped duplicate bookmarks', details.skippedDuplicateBookmarks],
        ['Added aliases', details.addedAliases],
        ['Skipped alias conflicts', details.skippedConflictAliases],
        ['Invalid items', details.invalidItems]
      ].filter(([, items]) => Array.isArray(items) && items.length > 0);

      if (groups.length === 0) {
        odinSyncDetails.classList.remove('active');
        odinSyncDetails.innerHTML = '';
        return;
      }

      odinSyncDetails.innerHTML = groups.map(([title, items]) => {
        const visible = items.slice(0, 6).map(item => `<li>${escapeHTML(item)}</li>`).join('');
        const more = items.length > 6 ? `<li>${items.length - 6} more...</li>` : '';
        return `<strong>${escapeHTML(title)}</strong><ul>${visible}${more}</ul>`;
      }).join('');
      odinSyncDetails.classList.add('active');
    }

    function clearOdinDetails() {
      setOdinDetails({});
    }

    function getSyncScopeLabel() {
      const scope = odinSyncScope ? odinSyncScope.value : 'all';
      const labels = {
        all: 'All bookmarks',
        alias: 'Bookmarks with alias',
        recent: 'Used in last 30 days',
        used: 'Used at least once'
      };
      return labels[scope] || scope;
    }

    function filterBookmarksForOdin(bookmarks) {
      const scope = odinSyncScope ? odinSyncScope.value : 'all';
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      if (scope === 'alias') {
        return bookmarks.filter(bm => String(bm.alias || '').trim());
      }
      if (scope === 'recent') {
        return bookmarks.filter(bm => (bm.lastUsedAt || 0) >= thirtyDaysAgo);
      }
      if (scope === 'used') {
        return bookmarks.filter(bm => (bm.frequency || 0) > 0 || (bm.lastUsedAt || 0) > 0);
      }
      return bookmarks;
    }

    async function fetchOdin(path, options = {}, timeoutMs = 4000) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${ODIN_BASE_URL}${path}`, {
          ...options,
          signal: controller.signal
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
          throw new Error(data.message || 'Odin request failed.');
        }
        return data;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    async function checkOdinStatus() {
      setOdinConnectionStatus('', 'Checking Odin...');
      try {
        await fetchOdin('/ping', { method: 'GET' }, 1800);
        setOdinConnectionStatus('connected', 'Odin connected on 127.0.0.1:29000');
        return true;
      } catch (err) {
        setOdinConnectionStatus('offline', 'Odin is not running or the local API is unreachable');
        return false;
      }
    }

    async function buildOdinPayload(dryRun) {
      const allBookmarks = await window.TabulaStorage.getAll();
      const scopedBookmarks = filterBookmarksForOdin(allBookmarks);
      return {
        source: 'Tabula',
        mode: 'merge',
        dryRun,
        bookmarks: scopedBookmarks.map(bm => ({
          title: bm.title || '',
          url: bm.url || '',
          alias: bm.alias || '',
          frequency: bm.frequency || 0,
          lastUsedAt: bm.lastUsedAt || 0
        })),
        totalBookmarks: allBookmarks.length,
        scopedBookmarks: scopedBookmarks.length
      };
    }

    function formatOdinStats(stats, actionLabel, scopedCount) {
      return `${actionLabel} (${getSyncScopeLabel()}, ${scopedCount} selected): ` +
        `+${stats.addedBookmarks || 0} bookmarks, +${stats.addedAliases || 0} aliases. ` +
        `Skipped ${stats.skippedDuplicateBookmarks || 0} duplicate bookmarks, ` +
        `${stats.skippedConflictAliases || 0} alias conflicts, ${stats.invalidItems || 0} invalid items.`;
    }

    function setScopeSelectOpen(open) {
      if (!odinScopeSelect || !odinScopeTrigger) return;
      odinScopeSelect.classList.toggle('open', open);
      odinScopeTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function setOdinSyncScope(value) {
      if (!odinSyncScope) return;
      odinSyncScope.value = value;
      if (odinScopeLabel) {
        odinScopeLabel.textContent = getSyncScopeLabel();
      }
      odinScopeOptions.forEach(option => {
        const isActive = option.dataset.value === value;
        option.classList.toggle('active', isActive);
        option.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      clearOdinDetails();
      setOdinSyncStatus(`Scope changed to ${getSyncScopeLabel()}. Preview before syncing for exact counts.`);
    }

    async function runOdinSync(dryRun) {
      const activeButton = dryRun ? btnPreviewOdin : btnSyncOdin;
      if (!activeButton) return;

      activeButton.disabled = true;
      if (btnPreviewOdin && !dryRun) btnPreviewOdin.disabled = true;
      if (btnSyncOdin && dryRun) btnSyncOdin.disabled = true;
      clearOdinDetails();
      setOdinSyncStatus(dryRun ? 'Previewing Odin sync...' : 'Syncing bookmarks to Odin...');

      try {
        const payload = await buildOdinPayload(dryRun);
        if (payload.scopedBookmarks === 0) {
          setOdinSyncStatus(`No bookmarks match the selected scope: ${getSyncScopeLabel()}.`, 'error');
          return;
        }

        const data = await fetchOdin('/integrations/tabula/bookmarks/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const stats = data.data && data.data.stats ? data.data.stats : {};
        const details = data.data && data.data.details ? data.data.details : {};
        setOdinConnectionStatus('connected', 'Odin connected on 127.0.0.1:29000');
        setOdinSyncStatus(
          formatOdinStats(stats, dryRun ? 'Preview' : 'Synced', payload.scopedBookmarks),
          'success'
        );
        setOdinDetails(details);
      } catch (err) {
        const isAbort = err && err.name === 'AbortError';
        setOdinConnectionStatus('offline', 'Odin is not running or the local API is unreachable');
        setOdinSyncStatus(
          isAbort
            ? 'Odin sync timed out. Please make sure Odin is running.'
            : 'Odin is not running or the local sync API is unreachable.',
          'error'
        );
      } finally {
        if (btnPreviewOdin) btnPreviewOdin.disabled = false;
        if (btnSyncOdin) btnSyncOdin.disabled = false;
      }
    }

    btnExport.addEventListener('click', async () => {
      const bookmarks = await window.TabulaStorage.getAll();
      const backupData = {
        version: 'v2.9',
        timestamp: Date.now(),
        config: config,
        bookmarks: bookmarks
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tabula_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    btnImportTrigger.addEventListener('click', () => inputImport.click());
    if (btnPreviewOdin) {
      btnPreviewOdin.addEventListener('click', () => runOdinSync(true));
    }
    if (btnSyncOdin) {
      btnSyncOdin.addEventListener('click', () => runOdinSync(false));
    }
    if (odinScopeTrigger && odinScopeSelect) {
      odinScopeTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        setScopeSelectOpen(!odinScopeSelect.classList.contains('open'));
      });
      odinScopeOptions.forEach(option => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          setOdinSyncScope(option.dataset.value || 'all');
          setScopeSelectOpen(false);
        });
      });
      document.addEventListener('click', (e) => {
        if (!odinScopeSelect.contains(e.target)) {
          setScopeSelectOpen(false);
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          setScopeSelectOpen(false);
        }
      });
    }
    checkOdinStatus();

    inputImport.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (!data.config || !data.bookmarks) {
            alert("Invalid backup format. Missing config or bookmarks.");
            return;
          }

          // 1. 恢复配置
          config = { ...DEFAULT_CONFIG, ...data.config };
          await saveConfig();

          // 2. 恢复书签（通过原生存储接口进行全量覆盖）
          if (chrome && chrome.storage && chrome.storage.local) {
            await new Promise(r => chrome.storage.local.set({ 'tabula_bookmarks': data.bookmarks }, r));
          } else {
            localStorage.setItem('tabula_bookmarks', JSON.stringify(data.bookmarks));
          }

          alert("Success! Configuration & Bookmarks restored. Applying changes...");
          window.location.reload();
        } catch (err) {
          alert("Import failed: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  /**
   * 生成微型缩略图 (用于首屏极致无感加载)
   * @param {HTMLImageElement} img 
   * @returns {string} Base64 DataURI
   */
  function generateThumbnail(img) {
    const thumbCanvas = document.createElement('canvas');
    const size = 40; // 极小尺寸
    thumbCanvas.width = size;
    thumbCanvas.height = size;
    const tctx = thumbCanvas.getContext('2d');
    // 填满绘制
    tctx.drawImage(img, 0, 0, size, size);
    return thumbCanvas.toDataURL('image/webp', 0.2); // 低质量高压缩
  }

  return {
    async init() {
      modalOverlay = document.getElementById('settings-modal');
      btnOpen = document.getElementById('btn-settings-open');
      btnClose = document.getElementById('btn-settings-close');
      engineBtns = document.querySelectorAll('.engine-btn');
      colorPicker = document.getElementById('bg-color-picker');
      btnUpload = document.getElementById('btn-upload-wallpaper');
      btnDeleteWallpaper = document.getElementById('btn-delete-wallpaper');
      inputFile = document.getElementById('wallpaper-file');
      btnReset = document.getElementById('btn-reset-bg');
      colorLayer = document.getElementById('bg-color-layer');
      bgLayer = document.getElementById('bg-layer');
      customEngineWrapper = document.getElementById('custom-engine-wrapper');
      customEngineInput = document.getElementById('custom-engine-url');

      await loadConfig();
      await applyBackground();
      await applyVisualStyles();

      // 同步 UI 状态（滑块位置）
      document.getElementById('search-width-slider').value = config.searchWidth || 560;
      document.getElementById('search-backdrop-blur-slider').value = config.searchBackdropBlur || 20;
      document.getElementById('search-opacity-slider').value = config.searchOpacity || 0.1;
      document.getElementById('wp-blur-slider').value = config.wpBlur || 0;
      document.getElementById('wp-brightness-slider').value = config.wpBrightness || 1.0;
      document.getElementById('search-left-slider').value = config.searchLeft || 50;
      document.getElementById('search-top-slider').value = config.searchTop || 45;

      bindEvents();
      
      // ==== NEW Phase 2.9: 动力学解禁 ====
      // 在首帧瞬时定位完成后（约50ms），移除 transition 屏蔽类，恢复动态滑块的丝滑手感
      setTimeout(() => {
        const wrapper = document.querySelector('.search-box-wrapper');
        if (wrapper) wrapper.classList.remove('no-init-transition');
      }, 50);

      console.log("[TabulaSettings] Loaded and applied.");
    },
    
    // 给 search.js 导出使用的查询前缀
    getSearchPrefix() {
      if (config.engine === 'custom') {
        return config.customUrl || engineUrls['google'];
      }
      return engineUrls[config.engine] || engineUrls['google'];
    }
  };
})();

window.TabulaSettings = TabulaSettings;
