/* js/idb.js */

/**
 * TabulaIDB - 轻量级 IndexedDB 封装模块
 * 专门用于存储大体积二进制背景图 (Blob)，绕过 chrome.storage 的限制
 */
const TabulaIDB = (function () {
  const DB_NAME = 'TabulaDB';
  const STORE_NAME = 'wallpapers';
  const DB_VERSION = 1;

  let db = null;

  async function getDB() {
    if (db) return db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const dbInstance = e.target.result;
        if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
          dbInstance.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };

      request.onerror = (e) => {
        console.error("[TabulaIDB] Database error:", e.target.error);
        reject(e.target.error);
      };
    });
  }

  return {
    /**
     * 存储或更新壁纸
     * @param {string} key 
     * @param {Blob|File} blob 
     */
    async setWallpaper(key, blob) {
      console.log("[TabulaIDB] setWallpaper key:", key);
      const database = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ key, blob, timestamp: Date.now() });

        request.onsuccess = () => {
          console.log("[TabulaIDB] Wallpaper saved successfully.");
          resolve(true);
        };
        request.onerror = (e) => {
          console.error("[TabulaIDB] Wallpaper save ERROR:", e.target.error);
          reject(e.target.error);
        };
      });
    },

    /**
     * 获取壁纸 Blob
     * @param {string} key 
     * @returns {Promise<Blob|null>}
     */
    async getWallpaper(key) {
      console.log("[TabulaIDB] getWallpaper key:", key);
      const database = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result ? request.result.blob : null;
          console.log("[TabulaIDB] Wallpaper retrieval success, found:", !!result);
          resolve(result);
        };
        request.onerror = (e) => {
          console.error("[TabulaIDB] Wallpaper retrieval ERROR:", e.target.error);
          reject(e.target.error);
        };
      });
    },

    /**
     * 删除指定壁纸
     * @param {string} key 
     */
    async deleteWallpaper(key) {
      const database = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
      });
    }
  };
})();

// 暴露全局变量
window.TabulaIDB = TabulaIDB;
