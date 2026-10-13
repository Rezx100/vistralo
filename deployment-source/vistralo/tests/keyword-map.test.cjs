'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('../scripts/check-keyword-map.cjs');

test('the keyword map gives every page one primary phrase, a title of 60 characters or fewer and a description of 155 or fewer', () => {
  const { problems, pages, titles } = check();
  assert.deepEqual(problems, []);
  assert.ok(pages.length >= 16);
  assert.equal(titles.size, pages.length);
});
