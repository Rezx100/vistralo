'use strict';
// Checks docs/seo/keyword-map.md: titles at most 60 characters, meta descriptions at most 155,
// one primary phrase per page, and a title row for every page in the page table.
const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'docs', 'seo', 'keyword-map.md');
const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function rows(heading) {
  const start = text.indexOf('\n## ' + heading + '\n');
  if (start < 0) throw Error('Missing section: ' + heading);
  const section = text.slice(start + 1).split('\n## ')[0];
  // A cell may contain an escaped pipe (a title ending "| Vistralo"); split on the unescaped ones only.
  return section.split('\n').filter(line => line.startsWith('| ') && !/^\| -+/.test(line)).slice(1)
    .map(line => line.slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|')));
}

function check() {
  const problems = [];
  const pages = rows('Pages');
  const seen = new Map();
  for (const [page, , primary, , , volume] of pages) {
    const key = primary.toLowerCase();
    if (seen.has(key)) problems.push(`"${primary}" is the primary phrase of both ${seen.get(key)} and ${page}`);
    seen.set(key, page);
    if (volume !== 'unmeasured' && !/^\d/.test(volume)) problems.push(`${page}: volume must be a number or "unmeasured"`);
  }
  const titles = new Map();
  for (const [page, title, description, heading] of rows('Titles, descriptions and headings')) {
    titles.set(page, {title, description, heading});
    if (title.length > 60) problems.push(`${page}: title is ${title.length} characters (60 at most): ${title}`);
    if (description.length > 155) problems.push(`${page}: description is ${description.length} characters (155 at most)`);
    if (description.length < 70) problems.push(`${page}: description is only ${description.length} characters`);
    if (!heading) problems.push(`${page}: no H1`);
  }
  for (const [page] of pages) if (!titles.has(page)) problems.push(`${page}: no title row`);
  return {problems, pages, titles};
}

module.exports = {check, rows};

if (require.main === module) {
  const {problems, pages} = check();
  if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
  else console.log(`Keyword map checked: ${pages.length} pages, one primary phrase each.`);
}
