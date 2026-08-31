const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createEvent() {
  let listener;
  return {
    addListener(nextListener) {
      listener = nextListener;
    },
    getListener() {
      return listener;
    }
  };
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const storageState = {
    tabula_bookmarks: [
      { id: 'github', title: 'GitHub', url: 'https://github.com', alias: 'gh', frequency: 4, lastUsedAt: 40, createdAt: 1 },
      { id: 'gitlab', title: 'GitLab', url: 'https://gitlab.com', alias: 'gl', frequency: 2, lastUsedAt: 20, createdAt: 2 },
      { id: 'youtube', title: 'YouTube', url: 'https://youtube.com', alias: 'yt', frequency: 3, lastUsedAt: 30, createdAt: 3 },
      { id: 'x', title: 'X', url: 'https://x.com', alias: 'x', frequency: 1, lastUsedAt: 10, createdAt: 4 }
    ],
    tabula_config: { engine: 'bing' }
  };
  const inputStarted = createEvent();
  const inputChanged = createEvent();
  const inputEntered = createEvent();
  const tabCalls = [];
  const errors = [];
  let defaultSuggestion;

  let context;
  context = vm.createContext({
    chrome: {
      storage: {
        local: {
          get(keys, callback) {
            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            callback(Object.fromEntries(requestedKeys.map(key => [key, storageState[key]])));
          },
          set(values, callback) {
            Object.assign(storageState, values);
            callback();
          }
        }
      },
      tabs: {
        update(options, callback) {
          tabCalls.push({ type: 'update', ...options });
          callback({ id: 1, ...options });
        },
        create(options, callback) {
          tabCalls.push({ type: 'create', ...options });
          callback({ id: tabCalls.length + 1, ...options });
        }
      },
      omnibox: {
        onInputStarted: inputStarted,
        onInputChanged: inputChanged,
        onInputEntered: inputEntered,
        setDefaultSuggestion(value) {
          defaultSuggestion = value;
        }
      }
    },
    console: {
      log() {},
      warn() {},
      error(...args) {
        errors.push(args);
      }
    },
    importScripts(...scriptPaths) {
      scriptPaths.forEach(scriptPath => {
        const source = fs.readFileSync(path.join(projectRoot, 'js', scriptPath), 'utf8');
        vm.runInContext(source, context, { filename: `js/${scriptPath}` });
      });
    }
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.omnibox.keyword, 't');
  assert.equal(manifest.background.service_worker, 'js/background.js');

  const backgroundSource = fs.readFileSync(path.join(projectRoot, 'js/background.js'), 'utf8');
  vm.runInContext(backgroundSource, context, { filename: 'js/background.js' });

  await inputStarted.getListener()();
  assert.equal(defaultSuggestion.description, 'Search Tabula bookmarks');

  const suggestions = [];
  await inputChanged.getListener()('git', items => suggestions.push(...items));
  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].content, 'tabula-bookmark:github');
  assert.match(defaultSuggestion.description, /GitHub/);
  console.log('PASS: ranked omnibox suggestions use the shared matcher.');

  await inputEntered.getListener()('', 'currentTab');
  assert.deepEqual(tabCalls.shift(), { type: 'update', url: 'https://github.com' });
  console.log('PASS: empty input opens the recommended bookmark shown by default.');

  await inputEntered.getListener()('gh', 'currentTab');
  assert.deepEqual(tabCalls.shift(), { type: 'update', url: 'https://github.com' });
  assert.equal(storageState.tabula_bookmarks.find(item => item.id === 'github').frequency, 6);
  console.log('PASS: Enter opens the best match and records usage.');

  await inputEntered.getListener()('x,yt', 'newForegroundTab');
  assert.deepEqual(tabCalls.splice(0), [
    { type: 'create', url: 'https://x.com', active: true },
    { type: 'create', url: 'https://youtube.com', active: false }
  ]);
  console.log('PASS: comma-separated input opens multiple ranked bookmarks.');

  await inputEntered.getListener()('/tabula launcher', 'currentTab');
  assert.deepEqual(tabCalls.shift(), {
    type: 'update',
    url: 'https://www.bing.com/search?q=tabula%20launcher'
  });
  console.log('PASS: slash input uses the configured web search engine.');

  await inputEntered.getListener()('tabula-bookmark:youtube', 'newBackgroundTab');
  assert.deepEqual(tabCalls.shift(), {
    type: 'create',
    url: 'https://youtube.com',
    active: false
  });
  assert.equal(errors.length, 0);
  console.log('PASS: selected suggestions honor Chrome omnibox disposition.');
  console.log('All omnibox smoke checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
