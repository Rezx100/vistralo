#!/usr/bin/env node
'use strict';

// Source-only guard: bundled server-ui/style.css is generated from web/styles.
// Layout percentages, zero, viewport units and responsive query thresholds are
// structural. Color, typography and fixed spacing values belong in tokens.css.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const tokenFile = path.join(root, 'web/styles/tokens.css');
const errors = [];
const allowedColor = new Set(['inherit', 'initial', 'unset', 'revert', 'none', 'transparent', 'currentcolor']);
const dimensionProperties = /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|font-size|line-height|letter-spacing|word-spacing|border-radius|border-width|outline-width|outline-offset|text-indent|(?:min-|max-)?(?:width|height|inline-size|block-size)|flex-basis)(?:-|$)/;
const colorProperties = /(?:^color$|color$|^background$|^fill$|^stroke$)/;
const rawColor = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(|\b(?:white|black|red|green|blue|gray|grey|purple|orange|yellow)\b/i;
const rawFixedLength = /(?:^|[^\w.-])-?(?:[1-9]\d*(?:\.\d+)?|0\.\d+|\.\d+)(?:px|rem|em|pt|pc|cm|mm|in)\b/i;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    const full = path.join(dir, item.name);
    return item.isDirectory() ? walk(full) : [full];
  });
}
function report(file, source, index, message) {
  errors.push(`${path.relative(root, file)}:${source.slice(0, index).split('\n').length}: ${message}`);
}
function checkDeclaration(file, source, index, property, value) {
  const prop = property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).trim().toLowerCase();
  const val = value.trim();
  const literals = val.replace(/var\(\s*--[\w-]+\s*\)/g, '');
  if (rawColor.test(literals)) report(file, source, index, `${prop}: use a color token instead of ${val}`);
  if (dimensionProperties.test(prop) && rawFixedLength.test(val)) report(file, source, index, `${prop}: use a spacing or size token instead of ${val}`);
  if (prop === 'font-family' && !/^(?:var\(|inherit|initial|unset|revert)/.test(val)) report(file, source, index, 'font-family: use var(--font-family)');
  if (colorProperties.test(prop) && /^[a-z]+$/i.test(val) && !allowedColor.has(val.toLowerCase())) report(file, source, index, `${prop}: named colors belong in tokens.css`);
  if (prop === 'transition' && /(?:^|\s|,)all(?:\s|,|$)/.test(val)) report(file, source, index, 'transition: name animated properties; transition: all is not allowed');
}

const files = walk(path.join(root, 'web')).filter(file => /\.(css|tsx|jsx)$/.test(file));
if (!fs.existsSync(tokenFile)) errors.push('web/styles/tokens.css: central token file is missing');
for (const file of files) {
  if (file === tokenFile) continue;
  const source = fs.readFileSync(file, 'utf8');
  // Preserve offsets for actionable line numbers.
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, text => text.replace(/[^\n]/g, ' '));
  if (file.endsWith('.css')) {
    const declarations = /(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g;
    let match;
    while ((match = declarations.exec(stripped))) checkDeclaration(file, source, match.index, match[1], match[2]);
  } else {
    const inlineStyles = /style\s*=\s*\{\{([\s\S]*?)\}\}/g;
    let style;
    while ((style = inlineStyles.exec(stripped))) {
      const declarations = /([a-zA-Z][\w]*)\s*:\s*(['"])(.*?)\2/g;
      let match;
      while ((match = declarations.exec(style[1]))) checkDeclaration(file, source, style.index + match.index, match[1], match[3]);
      const numbers = /\b(padding\w*|margin\w*|gap|rowGap|columnGap|fontSize|lineHeight|borderRadius|letterSpacing)\s*:\s*([1-9]\d*(?:\.\d+)?)(?=\s*[,}])/g;
      while ((match = numbers.exec(style[1]))) report(file, source, style.index + match.index, `${match[1]}: use a spacing or typography token instead of ${match[2]}`);
    }
  }
}
if (errors.length) {
  console.error(`Design token check failed (${errors.length}):\n${errors.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Design token check passed (${files.length} source files).`);
