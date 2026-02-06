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
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function ensureDataFile() {
  if (fs.existsSync(DATA_FILE)) return;
  execSync('node generate-json.js', { stdio: 'inherit', cwd: __dirname });
}

function loadAllComponents() {
  ensureDataFile();
  const content = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(content);
}

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function searchComponents(query, components) {
  const lowerQuery = query.toLowerCase();
  return components.filter((comp) => {
    return (
      comp.name.toLowerCase().includes(lowerQuery) ||
      (comp.description || '').toLowerCase().includes(lowerQuery) ||
      comp.category.toLowerCase().includes(lowerQuery) ||
      (comp.categoryLabel || '').toLowerCase().includes(lowerQuery)
    );
  });
}

function getStatsByCategory(components) {
  const stats = {};
  for (const comp of components) {
    if (!stats[comp.category]) {
      stats[comp.category] = {
        count: 0,
        label: comp.categoryLabel || comp.category,
      };
    }
    stats[comp.category].count += 1;
  }
  return stats;
}

function displayComponent(component, index) {
  console.log(colorize(`\n[${index + 1}] ${component.name}`, 'bright'));
  console.log(colorize(`📁 分类: ${component.categoryLabel || component.category}`, 'cyan'));
  console.log(colorize(`📝 描述: ${component.description || 'N/A'}`, 'yellow'));
  console.log(colorize(`🔗 链接: ${component.link || 'N/A'}`, 'blue'));
  console.log(colorize(`📅 日期: ${component.date || 'N/A'}`, 'magenta'));
}

function generateCategoryIndex(components) {
  ensureReportsDir();
  const stats = getStatsByCategory(components);
  const outputPath = path.join(REPORTS_DIR, 'CATEGORY_INDEX.md');

  let content = '# shadcn/ui 组件分类索引\n\n';
  content += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  content += `总计: **${components.length}** 个组件\n\n`;
  content += '| 分类 | 数量 |\n';
  content += '|------|------|\n';

  Object.entries(stats)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([key, meta]) => {
      content += `| ${meta.label} (${key}) | ${meta.count} |\n`;
    });

  content += '\n## 详细列表\n\n';

  Object.entries(stats)
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .forEach(([category, meta]) => {
      content += `### ${meta.label} (${meta.count})\n\n`;
      components
        .filter((c) => c.category === category)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((comp) => {
          content += `- **[${comp.name}](${comp.link})** - ${comp.description || 'N/A'}\n`;
        });
      content += '\n';
    });

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(colorize(`\n✅ 分类索引已生成: ${outputPath}`, 'green'));
}

function generateGithubList(components) {
  ensureReportsDir();
  const outputPath = path.join(REPORTS_DIR, 'GITHUB_COMPONENTS.md');
  const githubComponents = components.filter((c) => (c.link || '').includes('github.com'));

  let content = '# GitHub 开源组件列表\n\n';
  content += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  content += `总计: **${githubComponents.length}** 个 GitHub 开源组件\n\n`;

  const grouped = {};
  for (const comp of githubComponents) {
    if (!grouped[comp.category]) grouped[comp.category] = [];
    grouped[comp.category].push(comp);
  }

  Object.keys(grouped)
    .sort()
    .forEach((category) => {
      const label = grouped[category][0].categoryLabel || category;
      content += `## ${label} (${category})\n\n`;
      grouped[category].forEach((comp) => {
        content += `- **[${comp.name}](${comp.link})** - ${comp.description || 'N/A'} (${comp.date || 'N/A'})\n`;
      });
      content += '\n';
    });

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(colorize(`\n✅ GitHub组件列表已生成: ${outputPath}`, 'green'));
}

function generateTimelineList(components) {
  ensureReportsDir();
  const outputPath = path.join(REPORTS_DIR, 'TIMELINE.md');

  const sorted = components
    .filter((c) => c.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  let content = '# shadcn/ui 组件时间线\n\n';
  content += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  content += '按添加日期排序（最新在前）\n\n';

  for (const comp of sorted) {
    content += `- **${comp.date}** - [${comp.name}](${comp.link}) (${comp.categoryLabel || comp.category})\n`;
    content += `  ${comp.description || 'N/A'}\n\n`;
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(colorize(`\n✅ 时间线列表已生成: ${outputPath}`, 'green'));
}

function showStats(components) {
  const stats = getStatsByCategory(components);

  console.log(colorize('\n📊 统计信息', 'bright'));
  console.log(colorize('═'.repeat(50), 'cyan'));
  console.log(colorize(`总组件数: ${components.length}`, 'green'));
  console.log(colorize(`总分类数: ${Object.keys(stats).length}`, 'green'));

  console.log(colorize('\n各分类组件数量:', 'yellow'));
  Object.entries(stats)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([category, meta]) => {
      const percentage = ((meta.count / components.length) * 100).toFixed(1);
      console.log(`  ${colorize('▪', 'blue')} ${category}: ${colorize(meta.count, 'green')} (${percentage}%)`);
    });

  const githubCount = components.filter((c) => (c.link || '').includes('github.com')).length;
  console.log(colorize(`\nGitHub开源组件: ${githubCount}`, 'magenta'));

  const recent = components
    .filter((c) => c.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  console.log(colorize('\n最近添加的5个组件:', 'yellow'));
  recent.forEach((comp, i) => {
    console.log(`  ${i + 1}. ${colorize(comp.name, 'cyan')} (${comp.date})`);
  });
}

function showHelp() {
  console.log(colorize('\n📖 使用说明:', 'bright'));
  console.log('  node component-manager.js stats          - 查看统计信息');
  console.log('  node component-manager.js search <关键词> - 搜索组件');
  console.log('  node component-manager.js category <分类> - 按分类查看');
  console.log('  node component-manager.js index          - 生成分类索引');
  console.log('  node component-manager.js github         - 生成GitHub组件列表');
  console.log('  node component-manager.js timeline       - 生成时间线');
  console.log('  node component-manager.js all            - 生成所有报告');
  console.log('  node component-manager.js help           - 显示帮助\n');
}

function main() {
  const args = process.argv.slice(2);
  const components = loadAllComponents();

  if (args.length === 0) {
    showStats(components);
    console.log(colorize('\n💡 提示: 使用 "node component-manager.js help" 查看所有命令', 'yellow'));
    return;
  }

  switch (args[0]) {
    case 'stats':
      showStats(components);
      break;
    case 'search': {
      if (!args[1]) {
        console.log(colorize('请提供搜索关键词: node component-manager.js search <关键词>', 'yellow'));
        return;
      }
      const results = searchComponents(args[1], components);
      console.log(colorize(`\n🔍 搜索 "${args[1]}" 的结果: ${results.length} 个`, 'bright'));
      results.forEach((comp, i) => displayComponent(comp, i));
      break;
    }
    case 'category': {
      if (!args[1]) {
        console.log(colorize('请提供分类关键词: node component-manager.js category <分类>', 'yellow'));
        return;
      }
      const key = args[1].toLowerCase();
      const results = components.filter((c) => {
        return c.category.toLowerCase().includes(key) || (c.categoryLabel || '').toLowerCase().includes(key);
      });
      console.log(colorize(`\n📁 分类 "${args[1]}" 的组件: ${results.length} 个`, 'bright'));
      results.forEach((comp, i) => displayComponent(comp, i));
      break;
    }
    case 'index':
      generateCategoryIndex(components);
      break;
    case 'github':
      generateGithubList(components);
      break;
    case 'timeline':
      generateTimelineList(components);
      break;
    case 'all':
      console.log(colorize('\n🚀 生成所有报告...', 'bright'));
      generateCategoryIndex(components);
      generateGithubList(components);
      generateTimelineList(components);
      console.log(colorize('\n✅ 所有报告生成完成！', 'green'));
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

main();
