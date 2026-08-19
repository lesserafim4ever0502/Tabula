/* js/wheel.js */

/**
 * TabulaWheel
 * Quicker 风格左键长按书签轮盘菜单 (Radial Wheel Menu)
 * 
 * 核心架构：
 * 1. 5 态严格状态机 (IDLE -> PRESS_PENDING -> GESTURE_ACTIVE / PINNED -> EXECUTE)
 * 2. 双坐标原点体系 (gestureOrigin 物理手势原点 vs visualCenter 视口安全圆盘中心)
 * 3. 固化 8 方向肌肉记忆槽位 (Auto 初次分配并持久化，Custom 删书签留空防漂移)
 * 4. 全局捕获阶段 Synthetic Click 拦截器
 * 5. 真滞后区 (Sector Retention Hysteresis) 扇区角度吸附
 * 6. 整盘毛玻璃 (Backdrop Blur) + SVG 45° 扇环渲染
 */
const TabulaWheel = (function () {
  // 5 态状态定义
  const STATE_IDLE = 'IDLE';
  const STATE_PRESS_PENDING = 'PRESS_PENDING';
  const STATE_GESTURE_ACTIVE = 'GESTURE_ACTIVE';
  const STATE_PINNED = 'PINNED';
  const STATE_EXECUTE = 'EXECUTE';

  // 几何与阈值参数 (px & rad)
  const DISC_RADIUS = 165;       // 轮盘视觉半径 (直径 330px，更大更清晰)
  const INNER_RADIUS = 52;       // 中心死区 / 预览区半径 (直径 104px)
  const COMMIT_RADIUS = 64;      // 手势提交触发半径 (防止误触)
  const ICON_RADIUS = 112;       // 图标中心分布半径
  const HYSTERESIS_RAD = 0.0873; // 扇区保持滞后量 (约 5°)
  const MOVE_THRESHOLD = 18;     // 长按判定允许的最大微小抖动位移 (px)
  const VIEWPORT_PADDING = 16;   // 视口安全边缘边距 (px)

  // 8 方向索引映射：0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
  const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const DIRECTION_METAS = [
    { key: 'n',  label: '北',   arrow: '↑', angle: -Math.PI / 2 },
    { key: 'ne', label: '东北', arrow: '↗', angle: -Math.PI / 4 },
    { key: 'e',  label: '东',   arrow: '→', angle: 0 },
    { key: 'se', label: '东南', arrow: '↘', angle: Math.PI / 4 },
    { key: 's',  label: '南',   arrow: '↓', angle: Math.PI / 2 },
    { key: 'sw', label: '西南', arrow: '↙', angle: 3 * Math.PI / 4 },
    { key: 'w',  label: '西',   arrow: '←', angle: Math.PI },
    { key: 'nw', label: '西北', arrow: '↖', angle: -3 * Math.PI / 4 }
  ];

  // 内部运行状态
  let currentState = STATE_IDLE;
  let longPressTimer = null;
  let suppressNextClick = false;

  // 坐标记录
  let gestureOrigin = { x: 0, y: 0 };
  let visualCenter = { x: 0, y: 0 };

  // 当前选中扇区索引 (-1 为中心死区或未选中)
  let activeSectorIndex = -1;
  let resolvedSlots = []; // 8 项解析后的槽位书签对象

  // DOM 缓存
  let overlayEl = null;
  let discEl = null;
  let svgEl = null;
  let sectorPaths = [];
  let slotNodes = [];
  let centerHubEl = null;
  let centerIconEl = null;
  let centerTitleEl = null;
  let centerDomainEl = null;
  let centerHintEl = null;

  // rAF 渲染调度
  let isRenderPending = false;

  /**
   * 图标统一渲染工具 (复用 Tabula 现有 CSS Mask / Emoji / Base64 图标系统)
   */
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
   * 候选书签排序器：严格按照 frequency -> lastUsedAt -> createdAt 排序
   */
  function rankCandidates(a, b) {
    if ((b.frequency || 0) !== (a.frequency || 0)) {
      return (b.frequency || 0) - (a.frequency || 0);
    }
    if ((b.lastUsedAt || 0) !== (a.lastUsedAt || 0)) {
      return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  }

  /**
   * 获取安全配置副本
   */
  function getConfig() {
    if (typeof TabulaSettings !== 'undefined' && TabulaSettings.getConfig) {
      return TabulaSettings.getConfig();
    }
    return {
      wheelEnabled: true,
      wheelOpenNewTab: true,
      wheelBgColor: '#12141a',
      wheelBgImage: '',
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
  }

  /**
   * 8 槽位解析与智能分配算法 (守护肌肉记忆)
   * - Custom 槽位：严格保留，若对应书签已被删除，则显示 Missing/Empty，绝不擅自自动补位
   * - Auto 槽位：若已分配有效书签，继续保留；若为空或原书签已删除，自动用未被占用的高频书签填补并持久化
   */
  async function resolveSlots() {
    if (typeof window.TabulaStorage === 'undefined') return [];

    let allBookmarks = [];
    try {
      allBookmarks = await window.TabulaStorage.getAll();
    } catch (e) {
      console.warn("[TabulaWheel] Failed to fetch bookmarks", e);
    }

    const bmMap = new Map(allBookmarks.map(bm => [bm.id, bm]));
    const config = getConfig();
    const wheelSlots = config.wheelSlots || {};

    let needsPersist = false;
    const reservedIds = new Set();

    // 1. 扫描并登记所有有效的 Custom 与已分配的 Auto 书签 ID
    DIRECTIONS.forEach(dirKey => {
      const slot = wheelSlots[dirKey];
      if (slot && slot.bookmarkId) {
        if (bmMap.has(slot.bookmarkId)) {
          reservedIds.add(slot.bookmarkId);
        } else {
          // 原书签在 Storage 中已不存在
          if (slot.mode === 'auto') {
            slot.bookmarkId = null;
            needsPersist = true;
          } else {
            // custom 模式：保持 bookmarkId = null，不自动补位
            slot.bookmarkId = null;
            needsPersist = true;
          }
        }
      }
    });

    // 2. 准备可用候选书签列表 (排除已占用的 ID)
    const sortedCandidates = allBookmarks
      .slice()
      .sort(rankCandidates)
      .filter(bm => !reservedIds.has(bm.id));

    // 3. 为未分配的 Auto 槽位按顺序补位
    const result = [];
    DIRECTIONS.forEach((dirKey, index) => {
      let slot = wheelSlots[dirKey];
      if (!slot) {
        slot = { mode: 'auto', bookmarkId: null };
        wheelSlots[dirKey] = slot;
        needsPersist = true;
      }

      let bookmark = null;
      if (slot.bookmarkId && bmMap.has(slot.bookmarkId)) {
        bookmark = bmMap.get(slot.bookmarkId);
      } else if (slot.mode === 'auto') {
        if (sortedCandidates.length > 0) {
          const candidate = sortedCandidates.shift();
          slot.bookmarkId = candidate.id;
          reservedIds.add(candidate.id);
          bookmark = candidate;
          needsPersist = true;
        }
      }

      result.push({
        index,
        dirKey,
        meta: DIRECTION_METAS[index],
        mode: slot.mode,
        bookmarkId: slot.bookmarkId,
        bookmark: bookmark
      });
    });

    // 4. 若发生了初次分配或删除自动补位，静默同步到 Settings 配置
    if (needsPersist && typeof TabulaSettings !== 'undefined' && TabulaSettings.updateConfig) {
      TabulaSettings.updateConfig({ wheelSlots: wheelSlots });
    }

    resolvedSlots = result;
    return result;
  }

  /**
   * 生成 SVG 扇环 Path (从 innerRadius 到 outerRadius，跨度 45°)
   */
  function createSectorPath(startAngle, endAngle, innerR, outerR) {
    const p1x = Math.cos(startAngle) * outerR;
    const p1y = Math.sin(startAngle) * outerR;
    const p2x = Math.cos(endAngle) * outerR;
    const p2y = Math.sin(endAngle) * outerR;
    const p3x = Math.cos(endAngle) * innerR;
    const p3y = Math.sin(endAngle) * innerR;
    const p4x = Math.cos(startAngle) * innerR;
    const p4y = Math.sin(startAngle) * innerR;

    return `M ${p1x} ${p1y} A ${outerR} ${outerR} 0 0 1 ${p2x} ${p2y} L ${p3x} ${p3y} A ${innerR} ${innerR} 0 0 0 ${p4x} ${p4y} Z`;
  }

  /**
   * 应用轮盘主题自定义 (背景颜色 / 背景图片)
   */
  function applyWheelTheme() {
    if (!discEl) return;
    const config = getConfig();
    const bgColor = config.wheelBgColor || '#12141a';
    const bgImage = config.wheelBgImage || '';

    discEl.style.backgroundColor = bgColor;
    if (bgImage) {
      discEl.style.backgroundImage = `url("${bgImage}")`;
      discEl.style.backgroundSize = 'cover';
      discEl.style.backgroundPosition = 'center';
      discEl.style.backgroundRepeat = 'no-repeat';
    } else {
      discEl.style.backgroundImage = 'none';
    }
  }

  /**
   * 初始化一次性构建轮盘 DOM / SVG 骨架
   */
  function buildDOM() {
    overlayEl = document.getElementById('wheel-menu-overlay');
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = 'wheel-menu-overlay';
      overlayEl.className = 'wheel-menu-overlay';
      document.body.appendChild(overlayEl);
    }
    overlayEl.innerHTML = '';

    // 1. 轮盘拟态玻璃圆盘容器
    discEl = document.createElement('div');
    discEl.className = 'wheel-menu-disc';
    applyWheelTheme();

    // 2. SVG 扇区层
    const svgNS = "http://www.w3.org/2000/svg";
    svgEl = document.createElementNS(svgNS, 'svg');
    svgEl.setAttribute('class', 'wheel-svg');
    svgEl.setAttribute('viewBox', `${-DISC_RADIUS} ${-DISC_RADIUS} ${DISC_RADIUS * 2} ${DISC_RADIUS * 2}`);

    sectorPaths = [];
    const angleStep = Math.PI / 4; // 45度
    for (let i = 0; i < 8; i++) {
      const centerAngle = -Math.PI / 2 + i * angleStep;
      const startAngle = centerAngle - angleStep / 2;
      const endAngle = centerAngle + angleStep / 2;

      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', createSectorPath(startAngle, endAngle, INNER_RADIUS, DISC_RADIUS - 2));
      path.setAttribute('class', 'wheel-sector-path');
      path.setAttribute('data-index', i);
      svgEl.appendChild(path);
      sectorPaths.push(path);
    }
    discEl.appendChild(svgEl);

    // 3. 8 方向图标与简略标签层 (极坐标绝对定位，无方向箭头)
    slotNodes = [];
    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'wheel-slots-container';

    for (let i = 0; i < 8; i++) {
      const centerAngle = -Math.PI / 2 + i * angleStep;
      const cx = DISC_RADIUS + Math.cos(centerAngle) * ICON_RADIUS;
      const cy = DISC_RADIUS + Math.sin(centerAngle) * ICON_RADIUS;

      const slotNode = document.createElement('div');
      slotNode.className = 'wheel-slot-node';
      slotNode.style.left = `${cx}px`;
      slotNode.style.top = `${cy}px`;
      slotNode.setAttribute('data-index', i);

      slotNode.innerHTML = `
        <div class="slot-icon-wrap"></div>
        <div class="slot-title-wrap"></div>
      `;

      slotsContainer.appendChild(slotNode);
      slotNodes.push(slotNode);
    }
    discEl.appendChild(slotsContainer);

    // 4. 中心圆盘预览区
    centerHubEl = document.createElement('div');
    centerHubEl.className = 'wheel-center-hub';
    centerHubEl.innerHTML = `
      <div class="center-hub-content">
        <div class="center-icon-wrap" id="wheel-center-icon"></div>
        <div class="center-title-text" id="wheel-center-title">Tabula</div>
        <div class="center-domain-text" id="wheel-center-domain">松开打开</div>
      </div>
      <div class="center-default-hint" id="wheel-center-hint">
        <span class="hint-gesture">滑到对应区域</span>
        <span class="hint-key">松开中键打开</span>
      </div>
    `;
    discEl.appendChild(centerHubEl);

    overlayEl.appendChild(discEl);

    // 缓存中心元素
    centerIconEl = centerHubEl.querySelector('#wheel-center-icon');
    centerTitleEl = centerHubEl.querySelector('#wheel-center-title');
    centerDomainEl = centerHubEl.querySelector('#wheel-center-domain');
    centerHintEl = centerHubEl.querySelector('#wheel-center-hint');
  }

  /**
   * 刷新各槽位显示数据
   */
  function updateSlotsContent() {
    if (!resolvedSlots || resolvedSlots.length === 0) return;

    resolvedSlots.forEach((item, index) => {
      const slotNode = slotNodes[index];
      if (!slotNode) return;
      const iconWrap = slotNode.querySelector('.slot-icon-wrap');
      const titleWrap = slotNode.querySelector('.slot-title-wrap');

      if (item.bookmark) {
        iconWrap.innerHTML = getIconHTML(item.bookmark.icon);
        titleWrap.textContent = item.bookmark.title || item.bookmark.url;
        slotNode.classList.remove('is-empty', 'is-missing');
      } else {
        iconWrap.innerHTML = '<span class="t-icon i-plus"></span>';
        titleWrap.textContent = item.mode === 'custom' ? 'Missing' : 'Empty';
        slotNode.classList.add(item.mode === 'custom' ? 'is-missing' : 'is-empty');
      }
    });
  }

  /**
   * 角度与扇区判定算法 (支持滞后区 Hysteresis)
   */
  function computeSectorIndex(angle, dist, currentIndex) {
    if (dist < INNER_RADIUS) {
      return -1; // 处于中心死区
    }

    const angleStep = Math.PI / 4; // 45°
    const halfStep = angleStep / 2; // 22.5°

    // 角度归一化到 [-PI, PI]
    let normAngle = angle;
    while (normAngle <= -Math.PI) normAngle += Math.PI * 2;
    while (normAngle > Math.PI) normAngle -= Math.PI * 2;

    // 1. 若当前已有选中的扇区，应用真滞后区保持判定 (Sector Retention Hysteresis)
    if (currentIndex >= 0 && currentIndex < 8) {
      const currentCenterAngle = -Math.PI / 2 + currentIndex * angleStep;
      let diff = normAngle - currentCenterAngle;
      while (diff <= -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      // 只要光标处于 当前扇区边界 + 5° 范围内，牢牢锁定当前扇区
      if (Math.abs(diff) <= (halfStep + HYSTERESIS_RAD)) {
        return currentIndex;
      }
    }

    // 2. 无预选或已超出滞后范围：标准 8 方向四舍五入映射
    const raw = Math.round((normAngle + Math.PI / 2) / angleStep);
    return ((raw % 8) + 8) % 8;
  }

  /**
   * 调度 DOM 高亮与中心预览更新 (通过 rAF 批量合并)
   */
  function scheduleUpdateUI() {
    if (isRenderPending) return;
    isRenderPending = true;

    requestAnimationFrame(() => {
      isRenderPending = false;
      renderUIState();
    });
  }

  /**
   * 实际 DOM 状态应用
   */
  function renderUIState() {
    if (!overlayEl) return;

    if (currentState === STATE_IDLE) {
      overlayEl.classList.remove('active', 'pinned', 'gesture-active');
      return;
    }

    overlayEl.classList.add('active');

    if (currentState === STATE_PINNED) {
      overlayEl.classList.add('pinned');
      overlayEl.classList.remove('gesture-active');
    } else if (currentState === STATE_GESTURE_ACTIVE) {
      overlayEl.classList.add('gesture-active');
      overlayEl.classList.remove('pinned');
    }

    // 1. 扇区与槽位高亮
    for (let i = 0; i < 8; i++) {
      const isActive = i === activeSectorIndex;
      if (sectorPaths[i]) {
        sectorPaths[i].classList.toggle('active', isActive);
      }
      if (slotNodes[i]) {
        slotNodes[i].classList.toggle('active', isActive);
      }
    }

    // 2. 中心预览内容更新
    if (activeSectorIndex >= 0 && activeSectorIndex < 8 && resolvedSlots[activeSectorIndex]) {
      const slotData = resolvedSlots[activeSectorIndex];
      if (slotData.bookmark) {
        centerHubEl.classList.add('has-selection');
        centerIconEl.innerHTML = getIconHTML(slotData.bookmark.icon);
        centerTitleEl.textContent = slotData.bookmark.title || slotData.bookmark.url;

        let domain = '';
        try {
          const parsed = new URL(slotData.bookmark.url);
          domain = parsed.hostname;
        } catch (e) {
          domain = slotData.bookmark.url;
        }
        centerDomainEl.textContent = domain;
      } else {
        centerHubEl.classList.add('has-selection');
        centerIconEl.innerHTML = '<span class="t-icon i-plus"></span>';
        centerTitleEl.textContent = slotData.mode === 'custom' ? '未配置书签' : '空槽位';
        centerDomainEl.textContent = '可在设置中绑定';
      }
    } else {
      centerHubEl.classList.remove('has-selection');
      centerIconEl.innerHTML = '';
      centerTitleEl.textContent = 'Tabula';
      centerDomainEl.textContent = currentState === STATE_PINNED ? '点击扇区打开' : '滑向扇区松开';
    }
  }

  /**
   * 打开轮盘 (瞬时同步唤醒，保证零延迟手感)
   */
  function showWheel(clientX, clientY) {
    console.log('[Wheel DEBUG] showWheel() at', clientX, clientY);
    if (!discEl) buildDOM();

    // 实时同步外观主题 (背景颜色与背景图片)
    applyWheelTheme();

    // 立即切换为 GESTURE_ACTIVE
    currentState = STATE_GESTURE_ACTIVE;
    activeSectorIndex = -1;

    // 1. 记录物理手势原点
    gestureOrigin = { x: clientX, y: clientY };

    // 2. 计算视口安全视觉中心 (Clamping，避免圆盘被裁剪)
    const minX = DISC_RADIUS + VIEWPORT_PADDING;
    const maxX = window.innerWidth - DISC_RADIUS - VIEWPORT_PADDING;
    const minY = DISC_RADIUS + VIEWPORT_PADDING;
    const maxY = window.innerHeight - DISC_RADIUS - VIEWPORT_PADDING;

    visualCenter = {
      x: Math.max(minX, Math.min(maxX, clientX)),
      y: Math.max(minY, Math.min(maxY, clientY))
    };

    // 3. 定位视觉圆盘
    discEl.style.left = `${visualCenter.x}px`;
    discEl.style.top = `${visualCenter.y}px`;

    // 4. 立即呈现现有缓存数据
    updateSlotsContent();

    // 5. 若搜索模块正在工作，收起搜索下拉
    if (typeof TabulaSearch !== 'undefined' && TabulaSearch.dismiss) {
      TabulaSearch.dismiss();
    }

    // 立即刷新 DOM 可见性
    renderUIState();

    // 输出 computedStyle 诊断日志
    requestAnimationFrame(() => {
      const overlay = document.getElementById('wheel-menu-overlay');
      const disc = overlay?.querySelector('.wheel-menu-disc');
      console.log('[Wheel DEBUG] overlay computed style', {
        className: overlay?.className,
        display: getComputedStyle(overlay).display,
        visibility: getComputedStyle(overlay).visibility,
        opacity: getComputedStyle(overlay).opacity,
        pointerEvents: getComputedStyle(overlay).pointerEvents,
        zIndex: getComputedStyle(overlay).zIndex
      });
      console.log('[Wheel DEBUG] disc rect', disc?.getBoundingClientRect());
    });

    // 异步确保槽位与 Storage 状态保持最新
    resolveSlots().then(() => updateSlotsContent());
  }

  /**
   * 关闭轮盘并重置回 IDLE
   */
  function hideWheel() {
    currentState = STATE_IDLE;
    activeSectorIndex = -1;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    renderUIState();
  }

  /**
   * 执行指定扇区的书签导航与频次更新
   */
  async function executeSector(index) {
    if (index < 0 || index >= 8) {
      hideWheel();
      return;
    }

    const slotData = resolvedSlots[index];
    if (!slotData || !slotData.bookmark) {
      // 空槽位：直接退出
      hideWheel();
      return;
    }

    currentState = STATE_EXECUTE;
    const bookmark = slotData.bookmark;
    const config = getConfig();

    // 频次累加
    if (typeof window.TabulaStorage !== 'undefined' && bookmark.id) {
      await window.TabulaStorage.incrementFrequency(bookmark.id);
    }

    // 执行跳转：新建标签页打开，保留当前起始页
    const openInNewTab = config.wheelOpenNewTab !== false;

    if (openInNewTab) {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: bookmark.url });
      } else {
        window.open(bookmark.url, '_blank');
      }
      hideWheel();
    } else {
      hideWheel();
      document.body.classList.add('is-navigating');
      window.location.href = bookmark.url;
    }
  }

  /**
   * 判断目标元素是否属于允许长按触发的空白区域 (采用反向排除法)
   */
  function isAllowableSurface(target) {
    if (!target) return false;

    // 1. 如果 Drawer 或 Settings 处于打开态，禁止触发
    const isDrawerOpen = (typeof TabulaDrawer !== 'undefined' && TabulaDrawer.isOpen) 
      ? TabulaDrawer.isOpen() 
      : (document.getElementById('drawer-container') && document.getElementById('drawer-container').classList.contains('open'));
    
    const settingsEl = document.getElementById('settings-modal');
    const isSettingsOpen = settingsEl && (
      settingsEl.classList.contains('active') || 
      (settingsEl.style.display !== 'none' && settingsEl.style.display !== '')
    );

    if (isDrawerOpen || isSettingsOpen) {
      return false;
    }

    // 2. 反向排除：仅排除输入框、按钮、链接、可编辑元素、搜索框包装器、抽屉、设置面板、书签选择器
    const blocked = target.closest(
      'input, textarea, button, a, select, [contenteditable="true"], ' +
      '.search-box-wrapper, #drawer-container, #settings-modal, .floating-settings-btn, ' +
      '#wheel-picker-modal'
    );

    return !blocked;
  }

  // ==== Pointer / Mouse 事件监听体系 ====

  function handlePointerDown(e) {
    const config = getConfig();

    // 严格限制：仅响应鼠标中键 (button === 1 / 滚轮按下)
    if (e.button !== 1) return;
    if (config.wheelEnabled === false) return;

    if (e.cancelable) e.preventDefault();

    // 若当前轮盘已在开启或驻留状态，中键点击视为关闭切换 (Toggle)
    if (currentState === STATE_PINNED || currentState === STATE_GESTURE_ACTIVE) {
      hideWheel();
      return;
    }

    if (!isAllowableSurface(e.target)) return;

    console.log('[Wheel DEBUG] Middle button instant activation at', e.clientX, e.clientY);
    showWheel(e.clientX, e.clientY);
  }

  function handlePointerMove(e) {
    if (currentState === STATE_PRESS_PENDING) {
      const dist = Math.hypot(e.clientX - gestureOrigin.x, e.clientY - gestureOrigin.y);
      if (dist > MOVE_THRESHOLD) {
        // 用户发生较大拖拽或滑动，取消长按等待
        console.log('[Wheel DEBUG] Cancelled by move jitter', dist);
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        currentState = STATE_IDLE;
      }
      return;
    }

    if (currentState === STATE_GESTURE_ACTIVE) {
      // 手势跟手阶段：基于物理手势原点 gestureOrigin 计算
      const dx = e.clientX - gestureOrigin.x;
      const dy = e.clientY - gestureOrigin.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      const newIndex = computeSectorIndex(angle, dist, activeSectorIndex);
      if (newIndex !== activeSectorIndex) {
        activeSectorIndex = newIndex;
        scheduleUpdateUI();
      }
      return;
    }

    if (currentState === STATE_PINNED) {
      // 驻留阶段：基于视觉中心 visualCenter 做精确 hit-test
      const dx = e.clientX - visualCenter.x;
      const dy = e.clientY - visualCenter.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      const newIndex = computeSectorIndex(angle, dist, activeSectorIndex);
      if (newIndex !== activeSectorIndex) {
        activeSectorIndex = newIndex;
        scheduleUpdateUI();
      }
      return;
    }
  }

  function handlePointerUp(e) {
    if (currentState === STATE_PRESS_PENDING) {
      // 在延迟触发前松手：属于普通轻点，取消长按
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      currentState = STATE_IDLE;
      return;
    }

    if (currentState === STATE_GESTURE_ACTIVE) {
      suppressNextClick = true;

      // 1. 滑动到某个有效书签扇区：松开中键/左键立即打开书签！
      if (activeSectorIndex >= 0 && resolvedSlots[activeSectorIndex]?.bookmark) {
        executeSector(activeSectorIndex);
      } else {
        // 2. 未滑动到任何有效书签或在中心死区松开：立即关闭轮盘
        hideWheel();
      }
    }
  }

  /**
   * 全局捕获阶段拦截器：吞掉长按操作产生的二次 Synthetic Click
   */
  function handleCaptureClick(e) {
    if (suppressNextClick) {
      suppressNextClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (currentState === STATE_PINNED) {
      const sectorNode = e.target.closest('.wheel-slot-node, .wheel-sector-path');
      if (sectorNode) {
        const index = parseInt(sectorNode.getAttribute('data-index'), 10);
        if (!isNaN(index)) {
          e.preventDefault();
          e.stopPropagation();
          executeSector(index);
          return;
        }
      }

      // 点击中心或轮盘外部：平滑关闭
      const isInsideDisc = e.target.closest('.wheel-menu-disc');
      if (!isInsideDisc) {
        e.preventDefault();
        e.stopPropagation();
        hideWheel();
      }
    }
  }

  function handleKeyDown(e) {
    if (currentState === STATE_GESTURE_ACTIVE || currentState === STATE_PINNED) {
      if (e.key === 'Escape') {
        e.preventDefault();
        hideWheel();
        return;
      }

      // 数字快捷键 1~8 触发对应扇区
      if (e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        executeSector(index);
      }
    }
  }

  function handleCancelEvent() {
    if (currentState === STATE_GESTURE_ACTIVE || currentState === STATE_PINNED) {
      hideWheel();
    } else if (currentState === STATE_PRESS_PENDING) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      currentState = STATE_IDLE;
    }
  }

  // ==== 对外暴露 API ====

  return {
    /**
     * 模块初始化：构建 DOM 并注册全生命周期事件
     */
    async init() {
      console.log('[Wheel DEBUG] init start');
      try {
        buildDOM();

        // 注册 Pointer / Mouse 事件
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('pointermove', handlePointerMove, { passive: true });
        document.addEventListener('pointerup', handlePointerUp, { passive: true });

        // 拦截并支持鼠标中键点击 (auxclick & mousedown)
        document.addEventListener('auxclick', (e) => {
          if (e.button === 1 && isAllowableSurface(e.target)) {
            if (e.cancelable) e.preventDefault();
          }
        });
        document.addEventListener('mousedown', (e) => {
          if (e.button === 1 && isAllowableSurface(e.target)) {
            if (e.cancelable) e.preventDefault();
          }
        });

        // 阻止原生拖拽和选中文本干扰长按
        document.addEventListener('dragstart', (e) => {
          if (currentState !== STATE_IDLE) e.preventDefault();
        });
        document.addEventListener('selectstart', (e) => {
          if (currentState !== STATE_IDLE) e.preventDefault();
        });

        // 捕获阶段拦截 Click
        document.addEventListener('click', handleCaptureClick, true);

        // 键盘与切屏销毁监听
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('blur', () => {
          if (document.hidden) handleCancelEvent();
        });
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) handleCancelEvent();
        });

        // 监听 Settings 配置更新广播
        window.addEventListener('tabula:config-changed', async () => {
          applyWheelTheme();
          await resolveSlots();
          updateSlotsContent();
          if (currentState === STATE_PINNED || currentState === STATE_GESTURE_ACTIVE) {
            scheduleUpdateUI();
          }
        });

        // 预先静默解析一次槽位，确保初次分配即时固化
        await resolveSlots();
        updateSlotsContent();

        console.log('[Wheel DEBUG] init complete');
      } catch (err) {
        console.error('[Wheel DEBUG] INIT FAILED', err);
        throw err;
      }
    },

    /**
     * 手动重排所有 Auto 槽位（供 Settings 面板「Refresh Suggestions」调用）
     */
    async refreshAutoSlots() {
      if (typeof window.TabulaStorage === 'undefined') return;

      const allBookmarks = await window.TabulaStorage.getAll();
      const config = getConfig();
      const wheelSlots = config.wheelSlots || {};

      // 1. 收集 Custom 占用的 ID
      const reservedIds = new Set();
      DIRECTIONS.forEach(dir => {
        const slot = wheelSlots[dir];
        if (slot && slot.mode === 'custom' && slot.bookmarkId) {
          reservedIds.add(slot.bookmarkId);
        }
      });

      // 2. 清空所有 Auto 槽位
      DIRECTIONS.forEach(dir => {
        let slot = wheelSlots[dir];
        if (!slot || slot.mode === 'auto') {
          wheelSlots[dir] = { mode: 'auto', bookmarkId: null };
        }
      });

      // 3. 获取最新候选排名并重新分配 Auto 槽位
      const sortedCandidates = allBookmarks
        .slice()
        .sort(rankCandidates)
        .filter(bm => !reservedIds.has(bm.id));

      DIRECTIONS.forEach(dir => {
        const slot = wheelSlots[dir];
        if (slot.mode === 'auto') {
          if (sortedCandidates.length > 0) {
            const next = sortedCandidates.shift();
            slot.bookmarkId = next.id;
            reservedIds.add(next.id);
          }
        }
      });

      // 4. 持久化并广播
      if (typeof TabulaSettings !== 'undefined' && TabulaSettings.updateConfig) {
        await TabulaSettings.updateConfig({ wheelSlots });
      }

      await resolveSlots();
      updateSlotsContent();
    },

    /**
     * 手动触发打开（供测试或外部调用）
     */
    show(x, y) {
      showWheel(x || window.innerWidth / 2, y || window.innerHeight / 2);
    },

    /**
     * 手动关闭接口
     */
    dismiss() {
      hideWheel();
    },

    /**
     * 获取当前状态 (供测试和诊断)
     */
    getState() {
      return currentState;
    },

    /**
     * 获取当前 8 槽位解析结果
     */
    getSlots() {
      return resolvedSlots;
    }
  };
})();

window.TabulaWheel = TabulaWheel;
