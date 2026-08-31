/**
 * Tabula Pinyin Match Utility
 * A lightweight (approx 3KB) engine for Subsequence & Pinyin matching.
 */
const PinyinMatch = (function() {
  // Simplified first-letter pinyin dictionary (common characters)
  const dict = "a-阿啊;b-八把白百报北被本比便并波不;c-擦才采菜长场车成城程吃出产重传此次从存;d-打大代当到道得等地第点电定东都对多;e-二儿而恩;f-发法反方分风分布放非常;g-该改各给更工公共关观管惯果过;h-哈还海汉好号和合黑很红后互化画划话欢会火;j-集几计记济加家机见建教金进经常就九举句具据决定级极机即居句局剧具据;k-开看可口苦快宽棵况;l-拉来蓝老乐里立粒两了六路律离利力立联量两料列林流陆路律率;m-吗买卖满慢忙毛每美门们面民名命明末木目;n-拿哪那南部内你您牛农弄怒;o-噢哦;p-爬怕排旁跑朋友批片票品平评破普;q-七其期气齐起汽前强切且亲轻青清情请区取去全权群桥且;r-让热人认日容易入软如;s-三色山闪上少设社身深什声生师十石时实使始世市示事项手受说数水虽然死四随岁所;t-它他她台太阳天条调贴铁听同统图外推万往望位文问我无五物业务物;w-挖瓦王往忘望位文问我无五屋务物;x-西习先鲜显现线限向项小校些写心新信星行许学寻迅下先鲜显现线限向项小校些写心新信星行许学寻迅;y-压呀牙延严言演颜眼养样腰要求也页叶业夜一依已以义意因音英影应勇用由游右鱼雨语元员原远月运又已已以义意因音英影应勇用由游右鱼雨语元员原远月运;z-杂载再在咱早造则怎增展站张长找照者这正知直纸指中重主助住注传次从自总走租族昨左作座";

  // Pre-processed map for O(1) character-to-pinyin lookup
  const charToPinMap = {};
  dict.split(';').forEach(group => {
    const [p, chars] = group.split('-');
    if (chars) {
      for (const char of chars) {
        if (!charToPinMap[char]) charToPinMap[char] = [];
        charToPinMap[char].push(p);
      }
    }
  });

  /**
   * Subsequence match logic
   * Returns true if 'q' is a subsequence of 't'
   */
  function checkSubsequence(t, q) {
    if (!q) return true;
    if (!t) return false;
    let tIdx = 0, qIdx = 0;
    while (tIdx < t.length && qIdx < q.length) {
      if (t[tIdx].toLowerCase() === q[qIdx].toLowerCase()) {
        qIdx++;
      }
      tIdx++;
    }
    return qIdx === q.length;
  }

  /**
   * Complex Pinyin subsequence match
   * Checks if 'q' matches 't' by its characters OR its pinyin first-letters
   */
  function match(text, query) {
    if (!query) return true;
    if (!text) return false;
    const q = query.toLowerCase();
    const t = text.toLowerCase();

    // 1. Standard subsequence match (handles English abbreviations and direct char matching)
    if (checkSubsequence(t, q)) return true;

    // 2. Pinyin initial subsequence match
    // Convert text to pinyin initials array (handle multiple possibilities)
    let pinyinInitials = [""];
    for (const char of text) {
      const initials = charToPinMap[char];
      if (initials) {
        const nextBatch = [];
        for (const pre of pinyinInitials) {
          for (const init of initials) {
            nextBatch.push(pre + init);
          }
        }
        pinyinInitials = nextBatch.length > 5 ? nextBatch.slice(0, 5) : nextBatch; // Limit explosion
      } else {
        // Not a Chinese char in our dict, just append lowercase char
        for (let i = 0; i < pinyinInitials.length; i++) {
          pinyinInitials[i] += char.toLowerCase();
        }
      }
    }

    // Check if any of the pinyin initial combinations match the query as a subsequence
    for (const pi of pinyinInitials) {
      if (checkSubsequence(pi, q)) return true;
    }

    return false;
  }

  return { match };
})();

// Expose the matcher in both extension pages and the background service worker.
globalThis.PinyinMatch = PinyinMatch;
