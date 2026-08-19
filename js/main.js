/* js/main.js */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Storage 初始化能力：若是全新安装，注入一些演示数据（仅为演示体验，支持随时清空）
  if (typeof TabulaStorage !== 'undefined') {
    await TabulaStorage.init();
  }
  
  // 2. 搜索模块初始化：挂载键盘和焦点输入事件
  if (typeof TabulaSearch !== 'undefined') {
    TabulaSearch.init();
  }

  // 3. 侧边栏/设置抽屉事件监听器 (含 Ctrl+B 快捷键唤醒)
  if (typeof TabulaDrawer !== 'undefined') {
    TabulaDrawer.init();
  }
  
  // 4. 用户设置（外观、搜索引擎、轮盘持久化模块）初始化
  if (typeof TabulaSettings !== 'undefined') {
    await TabulaSettings.init();
  }

  // 5. Quicker 风格书签轮盘菜单初始化（依赖 Settings 与 Storage）
  if (typeof TabulaWheel !== 'undefined') {
    await TabulaWheel.init();
  }
  
  console.log("[Tabula Main] Application successfully booted.");
});
