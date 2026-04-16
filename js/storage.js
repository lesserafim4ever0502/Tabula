/* js/storage.js */

/**
 * 核心存储管理模块：TabulaStorage
 * 优先在 Chrome/Edge Extension 环境中使用 chrome.storage.local
 * 为了便利网页版调试，平滑降级至浏览器的 localStorage
 */
const TabulaStorage = (function () {
  const STORAGE_KEY = 'tabula_bookmarks';

  // 检查是否运行在 Chrome Extension 环境
  const isExtensionEnv = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  /**
   * 基础读写适配器 (适配异步与同步方案统一为 Promise)
   */
  const core = {
    async get() {
      if (isExtensionEnv) {
        return new Promise((resolve) => {
          chrome.storage.local.get([STORAGE_KEY], (result) => {
            resolve(result[STORAGE_KEY] || []);
          });
        });
      } else {
        const data = localStorage.getItem(STORAGE_KEY);
        return Promise.resolve(data ? JSON.parse(data) : []);
      }
    },
    async set(bookmarksList) {
      if (isExtensionEnv) {
        return new Promise((resolve) => {
          chrome.storage.local.set({ [STORAGE_KEY]: bookmarksList }, () => {
            resolve();
          });
        });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarksList));
        return Promise.resolve();
      }
    }
  };

  /**
   * 内部小工具：生成简易唯一 ID (基于时间戳排重机制)
   */
  function generateId() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  }

  // ==== 对外暴露的 API ====

  return {
    /**
     * 初始化：检查运行环境合法性
     */
    async init() {
      const data = await core.get();
      if (!data) {
        await core.set([]);
      }
    },

    /**
     * 获取全量书签（按 frequency 降序排序）
     * 核心逻辑：给 Mode B 下拉框直接提供排好序的源数据集
     */
    async getAll() {
      const list = await core.get();
      // 高频优先
      return list.sort((a, b) => b.frequency - a.frequency);
    },

    /**
     * 增
     */
    async add(title, url, icon = 'i-bookmark', alias = '') {
      const all = await this.getAll();
      const newBM = {
        id: generateId(),
        title,
        url,
        icon,
        alias,
        frequency: 0,
        createdAt: Date.now()
      };
      all.unshift(newBM);
      await core.set(all);
      return newBM;
    },

    /**
     * 频次 +1 (核心打分算法支撑)
     * 当用户点击某个书签或者按下实体 Enter 跳转时触发
     */
    async incrementFrequency(id) {
      const list = await core.get();
      const index = list.findIndex(b => b.id === id);
      if (index !== -1) {
        list[index].frequency += 1;
        await core.set(list);
      }
    },

    /**
     * 频次清零 (供 Drawer 面板使用)
     */
    async resetFrequency(id) {
      const list = await core.get();
      const index = list.findIndex(b => b.id === id);
      if (index !== -1) {
        list[index].frequency = 0;
        await core.set(list);
      }
    },

    /**
     * 删除书签
     */
    async remove(id) {
      let list = await core.get();
      list = list.filter(b => b.id !== id);
      await core.set(list);
    },

    /**
     * 删除全部书签
     */
    async removeAll() {
      await core.set([]);
    },

    /**
     * 修改某项 (例如：直接改 Title, Url, Icon)
     */
    async update(id, updatesObj) {
      const list = await core.get();
      const index = list.findIndex(b => b.id === id);
      if (index !== -1) {
        list[index] = { ...list[index], ...updatesObj };
        await core.set(list);
      }
    },

    /**
     * 防XSS简易转义内部方法
     */
    _escapeHTML(str) {
      if (!str) return '';
      return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag));
    },

    /**
     * 导出主流规范的 Netscape Bookmark HTML 字符串
     */
    async exportData() {
      const all = await this.getAll();
      let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;
      all.forEach(bm => {
        const d = Math.floor(bm.createdAt / 1000);
        html += `    <DT><A HREF="${bm.url}" ADD_DATE="${d}" tabula-freq="${bm.frequency}" tabula-icon="${bm.icon}" tabula-alias="${bm.alias || ''}">${bm.title}</A>\n`;
      });
      html += `</DL><p>`;
      return html;
    },

    /**
     * 解析主流的包含 <A> 标签的 HTML 书签字符串导出文件（覆盖写）
     * 采用纯正则提取以防 Manifest V3 强干预 DOMParser 和 innerHTML
     */
    async importData(htmlString) {
      try {
        const newList = [];
        // 全局匹配含 href 的 a 标签，兼容杂乱的 Chrome 导出书签格式
        const aRegex = /<a[\s\S]*?href=["'](.*?)["'][\s\S]*?>([\s\S]*?)<\/a>/gi;
        let match;
        
        while ((match = aRegex.exec(htmlString)) !== null) {
          const url = match[1];
          // 剥离内部潜在的 HTML 标签（如果有）
          const rawTitle = match[2].replace(/<\/?[^>]+(>|$)/g, ""); 
          const title = rawTitle.trim() || 'Untitled Bookmark';
          
          if (!url || !url.startsWith('http')) continue;
          
          let freq = 0;
          let icon = '📌';
          let alias = '';
          let createdAt = Date.now();

          // 尝试捕获 ADD_DATE
          const addDateMatch = match[0].match(/ADD_DATE=["'](\d+)["']/i);
          if (addDateMatch) {
             createdAt = parseInt(addDateMatch[1], 10) * 1000;
          }

          // 尝试捕获我们自定义的 tabula-freq
          const freqMatch = match[0].match(/tabula-freq=["'](\d+)["']/i);
          if (freqMatch) {
             freq = parseInt(freqMatch[1], 10);
          }

          // 尝试捕获我们自定义的 tabula-icon
          const iconMatch = match[0].match(/tabula-icon=["']([^"']+)["']/i);
          if (iconMatch) {
             icon = iconMatch[1];
          }

          const aliasMatch = match[0].match(/tabula-alias=["']([^"']+)["']/i);
          if (aliasMatch) {
             alias = aliasMatch[1];
          }

          newList.push({
            id: generateId(),
            title: title,
            url: url,
            icon: icon,
            alias: alias,
            frequency: isNaN(freq) ? 0 : freq,
            createdAt: createdAt
          });
        }
        
        if (newList.length > 0) {
          await core.set(newList);
          return true;
        }
        return false;
      } catch (e) {
        console.error("Import HTML RegEx parsing error", e);
        return false;
      }
    }
  };
})();

// 在非模块化（Vanilla Script 导入）场景下暴露全局变量
window.TabulaStorage = TabulaStorage;
