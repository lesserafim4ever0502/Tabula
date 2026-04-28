// preload.js — 首帧防闪烁同步拦截器 + 异步数据预取引擎
// 此脚本必须在 <head> 中以同步方式加载，阻塞渲染树
// 架构革新：同步从 localStorage 读缩略图，异步从 IndexedDB 预取原图，实现极致并行
(function () {
  try {
    var col = localStorage.getItem('tabula_bgColor') || '#0f0f11';
    document.documentElement.style.backgroundColor = col;
    
    var bg = localStorage.getItem('tabula_bgImage');
    var thumb = localStorage.getItem('tabula_bgThumb');
    
    // 如果有缩略图，立即注入变量为首帧提供视觉掩护
    if (thumb) {
      document.documentElement.style.setProperty('--init-bg-thumb', 'url(' + thumb + ')');
      document.documentElement.style.setProperty('--init-blur', 'blur(10px)');
    } else {
      document.documentElement.style.setProperty('--init-blur', 'none');
    }

    // 如果是数据库存储标识，标记为 'none' 让其在首帧仅显示背景色或缩略图
    var bgVal = (bg === 'indexeddb') ? 'none' : (bg ? 'url(' + bg + ')' : 'none');
    
    if (bgVal !== 'none') {
      document.documentElement.style.setProperty('--init-bg', bgVal);
    } else {
      document.documentElement.style.setProperty('--init-bg', col);
    }

    // ==== NEW Phase 2.9: 搜索框视觉参数首帧注入 (瞬时吸附) ====
    var sWidth = localStorage.getItem('tabula_searchWidth');
    var sOpacity = localStorage.getItem('tabula_searchOpacity');
    var sLeft = localStorage.getItem('tabula_searchLeft');
    var sTop = localStorage.getItem('tabula_searchTop');

    if (sWidth) document.documentElement.style.setProperty('--search-width', sWidth + 'px');
    if (sOpacity) document.documentElement.style.setProperty('--search-opacity', sOpacity);
    if (sLeft) document.documentElement.style.setProperty('--search-left', sLeft + '%');
    if (sTop) document.documentElement.style.setProperty('--search-top', sTop + '%');

  } catch (e) { /* 静默降级 */ }

  // ==== 极致性能：在 CPU 空闲前，抢先开启 IndexedDB 异步读取任务 ====
  // 建立全局缓存 Promise，让后序的 settings.js 无需等待直接拿结果
  window.__tabula_wp_cache = new Promise(function(resolve) {
    try {
      var request = indexedDB.open('TabulaDB', 2);
      request.onupgradeneeded = function(e) {
        var upgradeDb = e.target.result;
        if (!upgradeDb.objectStoreNames.contains('wallpapers')) {
          upgradeDb.createObjectStore('wallpapers', { keyPath: 'key' });
        }
      };
      request.onsuccess = function(e) {
        var db = e.target.result;
        // 容错处理：若是新库或非法库，直接 resolve null
        if (!db.objectStoreNames.contains('wallpapers')) { resolve(null); return; }
        
        var transaction = db.transaction(['wallpapers'], 'readonly');
        var store = transaction.objectStore('wallpapers');
        var getReq = store.get('main');
        getReq.onsuccess = function(ev) {
          resolve(ev.target.result ? ev.target.result.blob : null);
        };
        getReq.onerror = function() { resolve(null); };
      };
      request.onerror = function() { resolve(null); };
    } catch (err) { resolve(null); }
  });
})();
