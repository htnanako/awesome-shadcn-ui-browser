#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const README_FILE = path.join(__dirname, 'README.md');
const OUTPUT_FILE = path.join(__dirname, 'components-data.json');

const EXCLUDED_SECTIONS = new Set([
  'Star History',
  'Contributors',
  'License',
  'Development & Contributing',
]);

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}

function parseTableRow(line) {
  const linkPattern = /\|\s*\[Link\]\(([^)]+)\)\s*\|/;
  const linkMatch = line.match(linkPattern);
  if (!linkMatch) return null;

  const linkToken = linkMatch[0];
  const link = linkMatch[1].trim();
  const [left, right] = line.split(linkToken);

  if (!left || right === undefined) return null;

  const leftCells = left.split('|').map((cell) => cell.trim()).filter(Boolean);
  const name = leftCells[0] || '';
  const description = leftCells.slice(1).join(' | ').trim();
  const date = (right.split('|')[0] || '').trim();

  if (!name || !link) return null;

  return { name, description, link, date };
}

function parseComponentsFromReadme(content) {
  const lines = content.split('\n');
  const components = [];
  let currentSection = null;
  let inTable = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('## ')) {
      const section = line.replace('## ', '').trim();
      if (EXCLUDED_SECTIONS.has(section)) {
        currentSection = null;
        inTable = false;
        continue;
      }

      currentSection = section;
      inTable = false;
      continue;
    }

    if (!currentSection) continue;

    if (line.startsWith('| Name |')) {
      inTable = true;
      continue;
    }

    if (!inTable) continue;

    if (line.startsWith('| ---') || line.startsWith('|---')) {
      continue;
    }

    if (!line.startsWith('|')) {
      inTable = false;
      continue;
    }

    const parsed = parseTableRow(line);
    if (!parsed) continue;

    components.push({
      ...parsed,
      category: slugify(currentSection),
      categoryLabel: currentSection,
      folder: slugify(parsed.name),
    });
  }

  return components;
}

function main() {
  if (!fs.existsSync(README_FILE)) {
    console.error('❌ 未找到 README.md');
    process.exit(1);
  }

  console.log('🚀 正在从 README.md 生成 components-data.json...');

  const readmeContent = fs.readFileSync(README_FILE, 'utf-8');
  const components = parseComponentsFromReadme(readmeContent);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(components, null, 2), 'utf-8');

  console.log(`✅ 成功生成 ${components.length} 个组件的数据文件`);
  console.log(`📄 文件位置: ${OUTPUT_FILE}`);
}

main();
