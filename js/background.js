/* js/background.js */

importScripts('pinyin_match.js', 'bookmark_match.js');

const BOOKMARKS_KEY = 'tabula_bookmarks';
const CONFIG_KEY = 'tabula_config';
const DEFAULT_SEARCH_URL = 'https://www.google.com/search?q=';
const ENGINE_URLS = {
  google: DEFAULT_SEARCH_URL,
  bing: 'https://www.bing.com/search?q=',
  baidu: 'https://www.baidu.com/s?wd='
};
const BOOKMARK_CONTENT_PREFIX = 'tabula-bookmark:';

function storageGet(keys) {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, result => resolve(result || {}));
  });
}

function storageSet(values) {
  return new Promise(resolve => {
    chrome.storage.local.set(values, resolve);
  });
}

function escapeDescription(value) {
  return String(value || '').replace(/[&<>]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  }[char]));
}

function formatBookmarkDescription(bookmark, action = 'Open') {
  const title = escapeDescription(bookmark.title || bookmark.url);
  const url = escapeDescription(bookmark.url);
  const alias = bookmark.alias ? ` <dim>[${escapeDescription(bookmark.alias)}]</dim>` : '';
  return `<match>${action} ${title}</match>${alias} <dim>${url}</dim>`;
}

function setDefaultDescription(description) {
  chrome.omnibox.setDefaultSuggestion({ description });
}

async function getBookmarks() {
  const stored = await storageGet([BOOKMARKS_KEY]);
  return Array.isArray(stored[BOOKMARKS_KEY]) ? stored[BOOKMARKS_KEY] : [];
}

async function recordBookmarkUsage(bookmarks, targets) {
  if (!targets.length) return;

  const counts = new Map();
  targets.forEach(target => counts.set(target.id, (counts.get(target.id) || 0) + 1));
  const usedAt = Date.now();
  const updated = bookmarks.map(bookmark => {
    const increment = counts.get(bookmark.id) || 0;
    if (!increment) return bookmark;
    return {
      ...bookmark,
      frequency: (Number.isFinite(bookmark.frequency) ? bookmark.frequency : 0) + increment,
      lastUsedAt: usedAt
    };
  });

  await storageSet({ [BOOKMARKS_KEY]: updated });
}

function updateCurrentTab(url) {
  return new Promise(resolve => chrome.tabs.update({ url }, resolve));
}

function createTab(url, active) {
  return new Promise(resolve => chrome.tabs.create({ url, active }, resolve));
}

async function openUrls(urls, disposition) {
  if (!urls.length) return;

  if (disposition === 'currentTab') {
    await updateCurrentTab(urls[0]);
  } else {
    await createTab(urls[0], disposition !== 'newBackgroundTab');
  }

  for (let index = 1; index < urls.length; index += 1) {
    await createTab(urls[index], false);
  }
}

async function getSearchUrl(query) {
  const stored = await storageGet([CONFIG_KEY]);
  const config = stored[CONFIG_KEY] || {};
  const prefix = config.engine === 'custom'
    ? config.customUrl || DEFAULT_SEARCH_URL
    : ENGINE_URLS[config.engine] || DEFAULT_SEARCH_URL;
  return prefix + encodeURIComponent(query);
}

async function handleInputChanged(text, suggest) {
  try {
    const rawText = String(text || '').trim();
    if (rawText.startsWith('/')) {
      const webQuery = rawText.slice(1).trim();
      setDefaultDescription(webQuery
        ? `<match>Search the web for ${escapeDescription(webQuery)}</match>`
        : 'Type a web search after <match>/</match>');
      suggest([]);
      return;
    }

    const bookmarks = await getBookmarks();
    const parts = globalThis.TabulaBookmarkMatch.splitQueries(rawText);

    if (parts.length > 1) {
      const targets = globalThis.TabulaBookmarkMatch.matchBestPerQuery(bookmarks, rawText);
      setDefaultDescription(targets.length
        ? `<match>Open ${targets.length} Tabula bookmarks</match> <dim>${targets.map(item => escapeDescription(item.title)).join(', ')}</dim>`
        : 'No Tabula bookmarks match these terms');
      suggest([]);
      return;
    }

    const matches = rawText
      ? globalThis.TabulaBookmarkMatch.matchBookmarks(bookmarks, rawText, 5)
      : globalThis.TabulaBookmarkMatch.recommendBookmarks(bookmarks, 5);

    setDefaultDescription(matches.length
      ? formatBookmarkDescription(matches[0])
      : 'No Tabula bookmarks match');
    suggest(matches.map(bookmark => ({
      content: BOOKMARK_CONTENT_PREFIX + encodeURIComponent(bookmark.id),
      description: formatBookmarkDescription(bookmark)
    })));
  } catch (error) {
    console.error('[TabulaOmnibox] Failed to build suggestions.', error);
    setDefaultDescription('Tabula bookmark search is temporarily unavailable');
    suggest([]);
  }
}

async function handleInputEntered(text, disposition) {
  try {
    const rawText = String(text || '').trim();

    if (rawText.startsWith('/')) {
      const webQuery = rawText.slice(1).trim();
      if (!webQuery) return;
      await openUrls([await getSearchUrl(webQuery)], disposition);
      return;
    }

    const bookmarks = await getBookmarks();
    let targets;

    if (!rawText) {
      targets = globalThis.TabulaBookmarkMatch.recommendBookmarks(bookmarks, 1);
    } else if (rawText.startsWith(BOOKMARK_CONTENT_PREFIX)) {
      const id = decodeURIComponent(rawText.slice(BOOKMARK_CONTENT_PREFIX.length));
      targets = bookmarks.filter(bookmark => bookmark.id === id).slice(0, 1);
    } else if (globalThis.TabulaBookmarkMatch.splitQueries(rawText).length > 1) {
      targets = globalThis.TabulaBookmarkMatch.matchBestPerQuery(bookmarks, rawText);
    } else {
      targets = globalThis.TabulaBookmarkMatch.matchBookmarks(bookmarks, rawText, 1);
    }

    if (!targets.length) return;
    await recordBookmarkUsage(bookmarks, targets);
    await openUrls(targets.map(target => target.url), disposition);
  } catch (error) {
    console.error('[TabulaOmnibox] Failed to open input.', error);
  }
}

chrome.omnibox.onInputStarted.addListener(() => {
  setDefaultDescription('Search Tabula bookmarks');
});
chrome.omnibox.onInputChanged.addListener(handleInputChanged);
chrome.omnibox.onInputEntered.addListener(handleInputEntered);
