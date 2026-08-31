const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'js', 'settings.js'),
  'utf8'
);
const match = source.match(/function generateThumbnail\(img\) \{[\s\S]*?^  \}/m);

assert.ok(match, 'settings.js must define generateThumbnail().');

const drawCalls = [];
const canvas = {
  width: 0,
  height: 0,
  getContext(type) {
    assert.equal(type, '2d');
    return {
      drawImage(...args) {
        drawCalls.push(args);
      }
    };
  },
  toDataURL(type, quality) {
    assert.equal(type, 'image/webp');
    assert.equal(quality, 0.2);
    return 'data:image/webp;base64,thumbnail';
  }
};
const context = vm.createContext({
  document: {
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      return canvas;
    }
  },
  image: { width: 1920, height: 1080 }
});

vm.runInContext(`${match[0]}; globalThis.result = generateThumbnail(globalThis.image);`, context);

assert.equal(context.result, 'data:image/webp;base64,thumbnail');
assert.equal(canvas.width, 40);
assert.equal(canvas.height, 40);
assert.equal(drawCalls.length, 1);
assert.equal(drawCalls[0][0], context.image);
assert.deepEqual(drawCalls[0].slice(1), [0, 0, 40, 40]);

console.log('PASS: wallpaper upload thumbnail generation returns a 40x40 WebP data URL.');
