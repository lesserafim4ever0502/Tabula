/* js/bookmark_match.js */

/**
 * Shared bookmark matching used by the new-tab page and the omnibox worker.
 */
const TabulaBookmarkMatch = (function () {
  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function compareBookmarkRank(a, b) {
    if ((a.score || 0) !== (b.score || 0)) {
      return (b.score || 0) - (a.score || 0);
    }
    if ((b.lastUsedAt || 0) !== (a.lastUsedAt || 0)) {
      return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
    }
    if ((b.frequency || 0) !== (a.frequency || 0)) {
      return (b.frequency || 0) - (a.frequency || 0);
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  }

  function scoreBookmark(bookmark, rawQuery) {
    const query = normalizeText(rawQuery);
    if (!query) return 0;

    const title = normalizeText(bookmark.title);
    const alias = normalizeText(bookmark.alias);
    const url = normalizeText(bookmark.url);
    const pinyinMatcher = globalThis.PinyinMatch;
    const isTitleMatch = pinyinMatcher
      ? pinyinMatcher.match(bookmark.title || '', query)
      : title.includes(query);
    const isAliasMatch = pinyinMatcher
      ? pinyinMatcher.match(bookmark.alias || '', query)
      : alias.includes(query);

    if (isTitleMatch || isAliasMatch) {
      return title.startsWith(query) || alias.startsWith(query) ? 3 : 2;
    }
    return url.includes(query) ? 1 : 0;
  }

  function matchBookmarks(bookmarks, query, limit) {
    const matches = (Array.isArray(bookmarks) ? bookmarks : [])
      .map(bookmark => ({ ...bookmark, score: scoreBookmark(bookmark, query) }))
      .filter(bookmark => bookmark.score > 0)
      .sort(compareBookmarkRank);

    return Number.isInteger(limit) && limit >= 0 ? matches.slice(0, limit) : matches;
  }

  function recommendBookmarks(bookmarks, limit = 5) {
    return (Array.isArray(bookmarks) ? bookmarks : [])
      .map(bookmark => ({ ...bookmark, score: 0 }))
      .sort(compareBookmarkRank)
      .slice(0, limit);
  }

  function splitQueries(rawQuery) {
    return String(rawQuery || '')
      .split(/[,，]/)
      .map(part => part.trim())
      .filter(Boolean);
  }

  function matchBestPerQuery(bookmarks, rawQuery) {
    return splitQueries(rawQuery)
      .map(query => matchBookmarks(bookmarks, query, 1)[0])
      .filter(Boolean);
  }

  return {
    compareBookmarkRank,
    matchBookmarks,
    matchBestPerQuery,
    recommendBookmarks,
    splitQueries
  };
})();

globalThis.TabulaBookmarkMatch = TabulaBookmarkMatch;
