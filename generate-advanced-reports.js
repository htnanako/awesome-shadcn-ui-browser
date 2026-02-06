#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_FILE = path.join(__dirname, 'components-data.json');
const REPORTS_DIR = path.join(__dirname, 'reports');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function ensureDataFile() {
  if (fs.existsSync(DATA_FILE)) return;
  execSync('node generate-json.js', { stdio: 'inherit', cwd: __dirname });
}

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function loadAllComponents() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function generateRecommendations(components) {
  const buckets = {
    'UI组件库': [],
    '表单相关': [],
    '日历和日期': [],
    '图表和数据': [],
    '动画效果': [],
  };

  components.forEach((comp) => {
    const name = comp.name.toLowerCase();
    const desc = (comp.description || '').toLowerCase();
    const category = (comp.category || '').toLowerCase();

    if (name.includes('ui') || desc.includes('component')) buckets['UI组件库'].push(comp);
    if (name.includes('form') || name.includes('input') || desc.includes('form')) buckets['表单相关'].push(comp);
    if (name.includes('calendar') || name.includes('date') || name.includes('time')) buckets['日历和日期'].push(comp);
    if (name.includes('chart') || name.includes('table') || name.includes('data')) buckets['图表和数据'].push(comp);
    if (category.includes('animation') || name.includes('animation') || name.includes('motion')) buckets['动画效果'].push(comp);
  });

  return buckets;
}

function writeRecommendations(components) {
  ensureReportsDir();
  const outputPath = path.join(REPORTS_DIR, 'RECOMMENDATIONS.md');
  const recommendations = generateRecommendations(components);

  let content = '# shadcn/ui 组件推荐\n\n';
  content += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

  Object.entries(recommendations).forEach(([title, list]) => {
    content += `## ${title}\n\n`;
    list.slice(0, 12).forEach((comp) => {
      content += `- [${comp.name}](${comp.link}) - ${comp.description || 'N/A'}\n`;
    });
    content += '\n';
  });

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(colorize(`✅ 推荐报告已生成: ${outputPath}`, 'green'));
}

function writeComparison(components) {
  ensureReportsDir();
  const outputPath = path.join(REPORTS_DIR, 'COMPARISON.md');

  const targets = {
    '富文本编辑器': ['novel', 'plate', 'minimal-tiptap', 'echo-editor', 'shadcn-editor'],
    '表单构建器': ['auto-form', 'form-builder', 'shadcn-builder'],
    '数据表格': ['shadcn-table-v2', 'tanstack-ui-table', 'tnks-data-table'],
  };

  let content = '# 组件对比\n\n';
  content += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

  Object.entries(targets).forEach(([title, names]) => {
    const rows = names
      .map((name) => components.find((c) => c.name.toLowerCase().includes(name.toLowerCase())))
      .filter(Boolean);

    if (rows.length === 0) return;

    content += `## ${title}\n\n`;
    content += '| 名称 | 分类 | GitHub | 日期 |\n';
    content += '|------|------|--------|------|\n';
    rows.forEach((comp) => {
      const gh = (comp.link || '').includes('github.com') ? '✅' : '❌';
      content += `| [${comp.name}](${comp.link}) | ${comp.categoryLabel || comp.category} | ${gh} | ${comp.date || 'N/A'} |\n`;
    });
    content += '\n';
  });

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(colorize(`✅ 对比表已生成: ${outputPath}`, 'green'));
}

function main() {
  console.log(colorize('\n🚀 生成高级报告...\n', 'bright'));
  const components = loadAllComponents();

  writeRecommendations(components);
  writeComparison(components);

  console.log(colorize('\n✅ 高级报告生成完成', 'green'));
  console.log(colorize(`📂 输出目录: ${REPORTS_DIR}`, 'yellow'));
}

main();
