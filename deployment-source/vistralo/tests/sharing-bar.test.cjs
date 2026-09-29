'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const {buildSync} = require('esbuild');

function load(entry) {
  const bundled = buildSync({
    entryPoints: [path.join(__dirname, '../web/features/' + entry + '.ts')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'cjs',
  }).outputFiles[0].text;
  const module = {exports: {}};
  vm.runInNewContext(bundled, {module, exports: module.exports, URL, Date, setTimeout, clearTimeout});
  return module.exports;
}

const {sharingBarPixels} = load('capture');

function metrics(overrides) {
  return {
    outerWidth: 1200,
    outerHeight: 800,
    innerBefore: 640,
    innerAfter: 600,
    screenX: 0,
    screenY: 0,
    screenWidth: 1920,
    screenHeight: 1080,
    availLeft: 0,
    availTop: 0,
    devicePixelRatio: 1,
    ...overrides,
  };
}

function bandOf(surface, width, height, overrides) {
  const band = sharingBarPixels(surface, width, height, metrics(overrides));
  return band && {y: band.y, h: band.height};
}

test('a shared window loses the sharing bar and keeps the toolbar above it', () => {
  assert.deepEqual(bandOf('window', 1200, 800), {y: 160, h: 40});
});

test('window capture scales the bar with the device pixel ratio', () => {
  assert.deepEqual(bandOf('window', 2400, 1600, {devicePixelRatio: 2}), {y: 320, h: 80});
});

test('a tab recording is the page, so the on-screen bar is not cropped again', () => {
  assert.equal(sharingBarPixels('browser', 1200, 600, metrics()), null);
});

test('a tab frame that still contains the bar is cropped from the top', () => {
  assert.deepEqual(bandOf('browser', 1200, 640), {y: 0, h: 40});
});

test('an entire screen drops the bar when this window covers that screen', () => {
  assert.deepEqual(
    bandOf('monitor', 1920, 1080, {
      outerWidth: 1920,
      outerHeight: 1080,
      innerBefore: 920,
      innerAfter: 880,
    }),
    {y: 160, h: 40},
  );
});

test('a small window on a shared screen is left alone', () => {
  assert.equal(
    sharingBarPixels('monitor', 1920, 1080, metrics({outerWidth: 800, outerHeight: 600})),
    null,
  );
});

test('a different window size is not cropped with this window measurements', () => {
  assert.equal(sharingBarPixels('window', 800, 600, metrics()), null);
});

test('viewport noise and a tall panel are not treated as the sharing bar', () => {
  assert.equal(sharingBarPixels('window', 1200, 800, metrics({innerAfter: 636})), null);
  assert.equal(sharingBarPixels('window', 1200, 800, metrics({innerAfter: 300})), null);
});

test('the cropped band stays on even pixel boundaries', () => {
  const band = sharingBarPixels(
    'window',
    1200,
    801,
    metrics({outerHeight: 801, innerBefore: 640, innerAfter: 599}),
  );
  assert.equal(band.y % 2, 0);
  assert.equal(band.height % 2, 0);
  assert.ok(band.height >= 40 && band.height <= 44);
});
