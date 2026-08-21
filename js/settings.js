/**
 * settings.js
 * 负责起始页的全局配置生命周期：背景上传存储、搜索引擎切换等。
 */

const TabulaSettings = (function () {
  const STORAGE_KEY = 'tabula_config';
  const DEFAULT_CONFIG = (typeof window !== 'undefined' && window.TABULA_PRESET_DATA && window.TABULA_PRESET_DATA.config)
    ? { ...window.TABULA_PRESET_DATA.config }
    : {
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
        searchTop: 45,
        // Radial Wheel 轮盘配置
        wheelEnabled: true,
        wheelOpenNewTab: true,
        wheelBgColor: '#12141a',
        wheelBgImage: '',
        wheelBgOpacity: 0.9,
        wheelIconOpacity: 1.0,
        wheelShowTitle: true,
        wheelShowUrl: false,
        wheelSlots: {
          n:  { mode: 'auto', bookmarkId: null },
          ne: { mode: 'auto', bookmarkId: null },
          e:  { mode: 'auto', bookmarkId: null },
          se: { mode: 'auto', bookmarkId: null },
          s:  { mode: 'auto', bookmarkId: null },
          sw: { mode: 'auto', bookmarkId: null },
          w:  { mode: 'auto', bookmarkId: null },
          nw: { mode: 'auto', bookmarkId: null }
        }
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

  const isExtensionEnv = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  async function processLoadedConfig(saved) {
    if (saved) {
      config = {
        ...DEFAULT_CONFIG,
        ...saved,
        wheelSlots: {
          ...DEFAULT_CONFIG.wheelSlots,
          ...(saved.wheelSlots || {})
        }
      };
      
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
  }

  async function loadConfig() {
    return new Promise((resolve) => {
      if (isExtensionEnv) {
        chrome.storage.local.get([STORAGE_KEY], async (res) => {
          await processLoadedConfig(res[STORAGE_KEY]);
          resolve(config);
        });
      } else {
        try {
          const data = localStorage.getItem(STORAGE_KEY);
          const parsed = data ? JSON.parse(data) : null;
          processLoadedConfig(parsed).then(() => resolve(config));
        } catch (e) {
          resolve(config);
        }
      }
    });
  }

  async function saveConfig() {
    return new Promise((resolve) => {
      const syncLocalStorage = () => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
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
      };

      if (isExtensionEnv) {
        chrome.storage.local.set({ [STORAGE_KEY]: config }, syncLocalStorage);
      } else {
        syncLocalStorage();
      }
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

        if (item.dataset.tab === 'wheel') {
          renderWheelTabUI();
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

    // Handle Reset Background (仅重置背景样式，保护搜索引擎、界面定位及轮盘等其他配置)
    btnReset.addEventListener('click', async () => {
      config.bgColor = DEFAULT_CONFIG.bgColor;
      config.bgImage = DEFAULT_CONFIG.bgImage;
      config.wpBlur = DEFAULT_CONFIG.wpBlur;
      config.wpBrightness = DEFAULT_CONFIG.wpBrightness;
      localStorage.removeItem('tabula_bgImage');
      localStorage.removeItem('tabula_bgThumb');
      window.__tabula_wp_cache = null;
      await TabulaIDB.deleteWallpaper('main');
      await applyBackground();
      await applyVisualStyles();
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
   * 轮盘 8 方向元数据
   */
  const WHEEL_DIRECTIONS = [
    { key: 'n',  label: '北 (Up)',         arrow: '↑' },
    { key: 'ne', label: '东北 (Up-Right)',   arrow: '↗' },
    { key: 'e',  label: '东 (Right)',       arrow: '→' },
    { key: 'se', label: '东南 (Down-Right)', arrow: '↘' },
    { key: 's',  label: '南 (Down)',        arrow: '↓' },
    { key: 'sw', label: '西南 (Down-Left)',  arrow: '↙' },
    { key: 'w',  label: '西 (Left)',        arrow: '←' },
    { key: 'nw', label: '西北 (Up-Left)',   arrow: '↖' }
  ];

  let currentPickingDirection = null;

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

  /**
   * 渲染设置面板中的 Radial Wheel 选项卡 UI
   */
  async function renderWheelTabUI() {
    const enableToggle = document.getElementById('wheel-enabled-toggle');
    const showTitleToggle = document.getElementById('wheel-show-title-toggle');
    const showUrlToggle = document.getElementById('wheel-show-url-toggle');
    const bgOpacitySlider = document.getElementById('wheel-bg-opacity-slider');
    const iconOpacitySlider = document.getElementById('wheel-icon-opacity-slider');
    const slotsContainer = document.getElementById('wheel-slots-list');
    const bgColorInput = document.getElementById('wheel-bgcolor-input');

    if (!enableToggle || !slotsContainer) return;

    enableToggle.checked = config.wheelEnabled !== false;
    if (showTitleToggle) showTitleToggle.checked = config.wheelShowTitle !== false;
    if (showUrlToggle) showUrlToggle.checked = config.wheelShowUrl === true;
    if (bgOpacitySlider) bgOpacitySlider.value = typeof config.wheelBgOpacity === 'number' ? config.wheelBgOpacity : 0.9;
    if (iconOpacitySlider) iconOpacitySlider.value = typeof config.wheelIconOpacity === 'number' ? config.wheelIconOpacity : 1.0;
    if (bgColorInput) bgColorInput.value = config.wheelBgColor || '#12141a';

    let allBookmarks = [];
    if (typeof window.TabulaStorage !== 'undefined') {
      allBookmarks = await window.TabulaStorage.getAll();
    }
    const bmMap = new Map(allBookmarks.map(b => [b.id, b]));

    const wheelSlots = config.wheelSlots || {};
    let html = '';

    WHEEL_DIRECTIONS.forEach(dir => {
      const slot = wheelSlots[dir.key] || { mode: 'auto', bookmarkId: null };
      const bm = slot.bookmarkId ? bmMap.get(slot.bookmarkId) : null;

      let badgeHtml = '';
      let titleText = '未分配 (Unassigned)';
      let iconHtml = '<span class="t-icon i-plus"></span>';

      if (slot.mode === 'custom') {
        if (bm) {
          badgeHtml = '<span class="slot-badge custom">Custom</span>';
          titleText = bm.title || bm.url;
          iconHtml = getIconHTML(bm.icon);
        } else {
          badgeHtml = '<span class="slot-badge missing">Missing</span>';
          titleText = '书签已被删除 (Deleted)';
          iconHtml = '<span class="t-icon i-trash"></span>';
        }
      } else {
        if (bm) {
          badgeHtml = '<span class="slot-badge auto">Auto</span>';
          titleText = bm.title || bm.url;
          iconHtml = getIconHTML(bm.icon);
        } else {
          badgeHtml = '<span class="slot-badge empty">Auto (Empty)</span>';
          titleText = '等待自动填充 (Waiting)';
        }
      }

      html += `
        <div class="wheel-slot-card" data-dir="${dir.key}">
          <div class="slot-card-left">
            <span class="slot-card-arrow">${dir.arrow}</span>
            <span class="slot-card-label">${dir.label}</span>
            ${badgeHtml}
          </div>
          <div class="slot-card-center">
            <div class="slot-card-icon">${iconHtml}</div>
            <div class="slot-card-title" title="${escapeHTML(titleText)}">${escapeHTML(titleText)}</div>
          </div>
          <div class="slot-card-actions">
            <button type="button" class="slot-action-btn btn-pick btn-pick-bm" data-dir="${dir.key}" title="选择书签固定">Pick</button>
            <button type="button" class="slot-action-btn btn-auto-bm" data-dir="${dir.key}" title="恢复为自动推荐">Auto</button>
            <button type="button" class="slot-action-btn btn-clear-bm" data-dir="${dir.key}" title="清空槽位">Clear</button>
          </div>
        </div>
      `;
    });

    slotsContainer.innerHTML = html;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  /**
   * 打开书签选择器 Popover 供槽位绑定
   */
  async function openBookmarkPicker(dirKey) {
    currentPickingDirection = dirKey;
    const pickerModal = document.getElementById('wheel-picker-modal');
    const searchInput = document.getElementById('wheel-picker-search');
    const listContainer = document.getElementById('wheel-picker-list');
    const dirTitle = document.getElementById('wheel-picker-dir-title');

    if (!pickerModal || !listContainer) return;

    const dirMeta = WHEEL_DIRECTIONS.find(d => d.key === dirKey);
    if (dirTitle && dirMeta) {
      dirTitle.textContent = `选择书签绑定至 [${dirMeta.arrow} ${dirMeta.label}]`;
    }

    if (searchInput) searchInput.value = '';

    const renderList = async (query = '') => {
      let bookmarks = [];
      if (typeof window.TabulaStorage !== 'undefined') {
        bookmarks = await window.TabulaStorage.getAll();
      }

      if (query.trim()) {
        const q = query.toLowerCase();
        bookmarks = bookmarks.filter(b => 
          (b.title && b.title.toLowerCase().includes(q)) || 
          (b.url && b.url.toLowerCase().includes(q)) ||
          (b.alias && b.alias.toLowerCase().includes(q))
        );
      }

      if (bookmarks.length === 0) {
        listContainer.innerHTML = '<div class="picker-empty-tip">未找到匹配的书签（请在侧栏添加书签）</div>';
        return;
      }

      listContainer.innerHTML = bookmarks.map(b => `
        <div class="picker-item" data-id="${b.id}">
          <span class="picker-item-icon">${getIconHTML(b.icon)}</span>
          <div class="picker-item-info">
            <div class="picker-item-title">${escapeHTML(b.title || b.url)}</div>
            <div class="picker-item-url">${escapeHTML(b.url)}</div>
          </div>
        </div>
      `).join('');
    };

    await renderList();
    pickerModal.style.display = 'flex';
    requestAnimationFrame(() => {
      pickerModal.classList.add('active');
      if (searchInput) searchInput.focus();
    });
  }

  function closeBookmarkPicker() {
    const pickerModal = document.getElementById('wheel-picker-modal');
    if (pickerModal) {
      pickerModal.classList.remove('active');
      setTimeout(() => {
        pickerModal.style.display = 'none';
      }, 150);
    }
    currentPickingDirection = null;
  }

  function bindWheelTabEvents() {
    const enableToggle = document.getElementById('wheel-enabled-toggle');
    const slotsContainer = document.getElementById('wheel-slots-list');
    const btnRefresh = document.getElementById('btn-refresh-wheel-slots');

    const showTitleToggle = document.getElementById('wheel-show-title-toggle');
    const showUrlToggle = document.getElementById('wheel-show-url-toggle');
    const bgOpacitySlider = document.getElementById('wheel-bg-opacity-slider');
    const iconOpacitySlider = document.getElementById('wheel-icon-opacity-slider');

    const bgColorInput = document.getElementById('wheel-bgcolor-input');
    const bgColorReset = document.getElementById('wheel-bgcolor-reset');
    const bgImageBtn = document.getElementById('wheel-bgimage-btn');
    const bgImageFile = document.getElementById('wheel-bgimage-file');
    const bgImageClear = document.getElementById('wheel-bgimage-clear');

    const pickerModal = document.getElementById('wheel-picker-modal');
    const pickerClose = document.getElementById('wheel-picker-close');
    const pickerSearch = document.getElementById('wheel-picker-search');
    const pickerList = document.getElementById('wheel-picker-list');

    if (enableToggle) {
      enableToggle.addEventListener('change', async (e) => {
        await updateConfig({ wheelEnabled: e.target.checked });
      });
    }

    if (showTitleToggle) {
      showTitleToggle.addEventListener('change', async (e) => {
        await updateConfig({ wheelShowTitle: e.target.checked });
      });
    }

    if (showUrlToggle) {
      showUrlToggle.addEventListener('change', async (e) => {
        await updateConfig({ wheelShowUrl: e.target.checked });
      });
    }

    if (bgOpacitySlider) {
      bgOpacitySlider.addEventListener('input', async (e) => {
        await updateConfig({ wheelBgOpacity: parseFloat(e.target.value) });
      });
    }

    if (iconOpacitySlider) {
      iconOpacitySlider.addEventListener('input', async (e) => {
        await updateConfig({ wheelIconOpacity: parseFloat(e.target.value) });
      });
    }

    if (bgColorInput) {
      bgColorInput.addEventListener('input', async (e) => {
        await updateConfig({ wheelBgColor: e.target.value });
      });
    }

    if (bgColorReset) {
      bgColorReset.addEventListener('click', async () => {
        if (bgColorInput) bgColorInput.value = '#12141a';
        await updateConfig({ wheelBgColor: '#12141a' });
      });
    }

    if (bgImageBtn && bgImageFile) {
      bgImageBtn.addEventListener('click', () => {
        bgImageFile.click();
      });

      bgImageFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target.result;
          await updateConfig({ wheelBgImage: base64 });
          await renderWheelTabUI();
        };
        reader.readAsDataURL(file);
      });
    }

    if (bgImageClear) {
      bgImageClear.addEventListener('click', async () => {
        await updateConfig({ wheelBgImage: '' });
        if (bgImageFile) bgImageFile.value = '';
        await renderWheelTabUI();
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        if (typeof TabulaWheel !== 'undefined' && TabulaWheel.refreshAutoSlots) {
          await TabulaWheel.refreshAutoSlots();
        }
        await renderWheelTabUI();
      });
    }

    if (slotsContainer) {
      slotsContainer.addEventListener('click', async (e) => {
        const pickBtn = e.target.closest('.btn-pick-bm');
        if (pickBtn) {
          const dir = pickBtn.getAttribute('data-dir');
          openBookmarkPicker(dir);
          return;
        }

        const autoBtn = e.target.closest('.btn-auto-bm');
        if (autoBtn) {
          const dir = autoBtn.getAttribute('data-dir');
          const slots = { ...(config.wheelSlots || {}) };
          slots[dir] = { mode: 'auto', bookmarkId: null };
          await updateConfig({ wheelSlots: slots });
          if (typeof TabulaWheel !== 'undefined' && TabulaWheel.refreshAutoSlots) {
            await TabulaWheel.refreshAutoSlots();
          }
          await renderWheelTabUI();
          return;
        }

        const clearBtn = e.target.closest('.btn-clear-bm');
        if (clearBtn) {
          const dir = clearBtn.getAttribute('data-dir');
          const slots = { ...(config.wheelSlots || {}) };
          slots[dir] = { mode: 'custom', bookmarkId: null };
          await updateConfig({ wheelSlots: slots });
          await renderWheelTabUI();
          return;
        }
      });
    }

    if (pickerClose) {
      pickerClose.addEventListener('click', () => {
        closeBookmarkPicker();
      });
    }

    if (pickerModal) {
      pickerModal.addEventListener('click', (e) => {
        if (e.target === pickerModal) {
          closeBookmarkPicker();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && pickerModal && pickerModal.classList.contains('active')) {
        closeBookmarkPicker();
      }
    });

    if (pickerSearch && pickerList) {
      pickerSearch.addEventListener('input', async (e) => {
        const query = e.target.value.trim().toLowerCase();
        let bookmarks = [];
        if (typeof window.TabulaStorage !== 'undefined') {
          bookmarks = await window.TabulaStorage.getAll();
        }
        if (query) {
          bookmarks = bookmarks.filter(b => 
            (b.title && b.title.toLowerCase().includes(query)) || 
            (b.url && b.url.toLowerCase().includes(query)) ||
            (b.alias && b.alias.toLowerCase().includes(query))
          );
        }
        if (bookmarks.length === 0) {
          pickerList.innerHTML = '<div class="picker-empty-tip">未找到匹配的书签</div>';
          return;
        }
        pickerList.innerHTML = bookmarks.map(b => `
          <div class="picker-item" data-id="${b.id}">
            <span class="picker-item-icon">${getIconHTML(b.icon)}</span>
            <div class="picker-item-info">
              <div class="picker-item-title">${escapeHTML(b.title || b.url)}</div>
              <div class="picker-item-url">${escapeHTML(b.url)}</div>
            </div>
          </div>
        `).join('');
      });
    }

    if (pickerList) {
      pickerList.addEventListener('click', async (e) => {
        const item = e.target.closest('.picker-item');
        if (item && currentPickingDirection) {
          const bmId = item.getAttribute('data-id');
          const slots = { ...(config.wheelSlots || {}) };
          slots[currentPickingDirection] = { mode: 'custom', bookmarkId: bmId };
          await updateConfig({ wheelSlots: slots });
          closeBookmarkPicker();
          await renderWheelTabUI();
        }
      });
    }
  }

  /**
   * 安全获取配置副本
   */
  function getConfig() {
    return structuredClone(config);
  }

  /**
   * 单一配置中心安全更新方法 (处理 wheelSlots 深度合并并派发全局广播)
   */
  async function updateConfig(patch) {
    config = {
      ...config,
      ...patch,
      wheelSlots: patch.wheelSlots
        ? {
            ...config.wheelSlots,
            ...patch.wheelSlots
          }
        : config.wheelSlots
    };

    await saveConfig();

    // 广播配置变更事件
    window.dispatchEvent(
      new CustomEvent('tabula:config-changed', {
        detail: {
          patch: structuredClone(patch),
          config: structuredClone(config)
        }
      })
    );

    return structuredClone(config);
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
      const swSlider = document.getElementById('search-width-slider');
      if (swSlider) swSlider.value = config.searchWidth || 560;
      const sbbSlider = document.getElementById('search-backdrop-blur-slider');
      if (sbbSlider) sbbSlider.value = config.searchBackdropBlur || 20;
      const soSlider = document.getElementById('search-opacity-slider');
      if (soSlider) soSlider.value = config.searchOpacity || 0.1;
      const wbSlider = document.getElementById('wp-blur-slider');
      if (wbSlider) wbSlider.value = config.wpBlur || 0;
      const wbrSlider = document.getElementById('wp-brightness-slider');
      if (wbrSlider) wbrSlider.value = config.wpBrightness || 1.0;
      const slSlider = document.getElementById('search-left-slider');
      if (slSlider) slSlider.value = config.searchLeft || 50;
      const stSlider = document.getElementById('search-top-slider');
      if (stSlider) stSlider.value = config.searchTop || 45;

      bindEvents();
      bindWheelTabEvents();
      
      // ==== NEW Phase 2.9: 动力学解禁 ====
      // 在首帧瞬时定位完成后（约50ms），移除 transition 屏蔽类，恢复动态滑块的丝滑手感
      setTimeout(() => {
        const wrapper = document.querySelector('.search-box-wrapper');
        if (wrapper) wrapper.classList.remove('no-init-transition');
      }, 50);

      console.log("[TabulaSettings] Loaded and applied.");
    },
    
    // 给外部安全获取配置
    getConfig,

    // 给外部安全更新配置并广播
    updateConfig,

    // 渲染轮盘设置 UI
    renderWheelTabUI,

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

