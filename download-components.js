#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_FILE = path.join(__dirname, 'components-data.json');
const DOWNLOADS_DIR = path.join(__dirname, 'downloaded-components');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}

function ensureDataFile() {
  if (fs.existsSync(DATA_FILE)) return;
  execSync('node generate-json.js', { stdio: 'inherit', cwd: __dirname });
}

function loadAllComponents() {
  ensureDataFile();
  const components = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  return components.map((comp) => ({
    ...comp,
    folder: comp.folder || slugify(comp.name),
  }));
}

function parseGithubUrl(url) {
  const match = (url || '').match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
  if (!match) return { isGithub: false };
  return {
    owner: match[1],
    repo: match[2].replace('.git', ''),
    isGithub: true,
  };
}

function cloneRepository(component, shallow = true) {
  const githubInfo = parseGithubUrl(component.link);

  if (!githubInfo.isGithub) {
    console.log(colorize(`⚠️  ${component.name} 不是GitHub仓库，跳过`, 'yellow'));
    return { ok: false, skipped: true };
  }

  const downloadPath = path.join(DOWNLOADS_DIR, component.category, component.folder);

  if (fs.existsSync(downloadPath)) {
    console.log(colorize(`✓ ${component.name} 已存在，跳过`, 'cyan'));
    return { ok: false, skipped: true };
  }

  fs.mkdirSync(downloadPath, { recursive: true });

  try {
    console.log(colorize(`📥 正在克隆: ${component.name}...`, 'blue'));

    const cloneCommand = shallow
      ? `git clone --depth 1 ${component.link} "${downloadPath}"`
      : `git clone ${component.link} "${downloadPath}"`;

    execSync(cloneCommand, { stdio: 'pipe' });

    const gitDir = path.join(downloadPath, '.git');
    if (fs.existsSync(gitDir)) {
      fs.rmSync(gitDir, { recursive: true, force: true });
    }

    const metadata = {
      name: component.name,
      description: component.description,
      link: component.link,
      category: component.category,
      categoryLabel: component.categoryLabel || component.category,
      downloadedAt: new Date().toISOString(),
      githubOwner: githubInfo.owner,
      githubRepo: githubInfo.repo,
    };

    fs.writeFileSync(
      path.join(downloadPath, '.component-metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    console.log(colorize(`✅ ${component.name} 克隆成功`, 'green'));
    return { ok: true, skipped: false };
  } catch (error) {
    console.log(colorize(`❌ ${component.name} 克隆失败: ${error.message}`, 'red'));
    if (fs.existsSync(downloadPath)) {
      fs.rmSync(downloadPath, { recursive: true, force: true });
    }
    return { ok: false, skipped: false };
  }
}

function batchDownload(components, options = {}) {
  const { limit = 10, category = null, shallow = true } = options;

  let toDownload = components.filter((c) => parseGithubUrl(c.link).isGithub);

  if (category) {
    const key = category.toLowerCase();
    toDownload = toDownload.filter((c) => {
      return c.category.toLowerCase().includes(key) || (c.categoryLabel || '').toLowerCase().includes(key);
    });
  }

  if (limit > 0) {
    toDownload = toDownload.slice(0, limit);
  }

  console.log(colorize(`\n🚀 准备下载 ${toDownload.length} 个组件...\n`, 'bright'));

  let success = 0;
  let failed = 0;
  let skipped = 0;

  toDownload.forEach((comp, index) => {
    console.log(colorize(`\n[${index + 1}/${toDownload.length}]`, 'cyan'));
    const result = cloneRepository(comp, shallow);
    if (result.ok) success += 1;
    else if (result.skipped) skipped += 1;
    else failed += 1;
  });

  console.log(colorize('\n' + '═'.repeat(50), 'cyan'));
  console.log(colorize('📊 下载统计:', 'bright'));
  console.log(colorize(`  ✅ 成功: ${success}`, 'green'));
  console.log(colorize(`  ⏭️  跳过: ${skipped}`, 'cyan'));
  console.log(colorize(`  ❌ 失败: ${failed}`, 'red'));
  console.log(colorize('═'.repeat(50) + '\n', 'cyan'));
}

function generateDownloadReport() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.log(colorize('⚠️  下载目录不存在', 'yellow'));
    return;
  }

  const downloaded = [];
  const categories = fs.readdirSync(DOWNLOADS_DIR).filter((item) => {
    const itemPath = path.join(DOWNLOADS_DIR, item);
    return fs.statSync(itemPath).isDirectory();
  });

  categories.forEach((category) => {
    const categoryPath = path.join(DOWNLOADS_DIR, category);
    const components = fs.readdirSync(categoryPath);

    components.forEach((comp) => {
      const metadataPath = path.join(categoryPath, comp, '.component-metadata.json');
      if (fs.existsSync(metadataPath)) {
        downloaded.push(JSON.parse(fs.readFileSync(metadataPath, 'utf-8')));
      }
    });
  });

  const reportPath = path.join(DOWNLOADS_DIR, 'DOWNLOAD_REPORT.md');

  let content = '# 已下载组件报告\n\n';
  content += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  content += `总计: **${downloaded.length}** 个已下载组件\n\n`;

  const byCategory = {};
  downloaded.forEach((comp) => {
    if (!byCategory[comp.category]) byCategory[comp.category] = [];
    byCategory[comp.category].push(comp);
  });

  content += '## 分类统计\n\n';
  content += '| 分类 | 数量 |\n';
  content += '|------|------|\n';
  Object.entries(byCategory)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([category, comps]) => {
      content += `| ${category} | ${comps.length} |\n`;
    });

  content += '\n## 详细列表\n\n';
  Object.keys(byCategory)
    .sort()
    .forEach((category) => {
      content += `### ${category}\n\n`;
      byCategory[category].forEach((comp) => {
        content += `- **${comp.name}**\n`;
        content += `  - 描述: ${comp.description || 'N/A'}\n`;
        content += `  - 仓库: ${comp.link}\n`;
        content += `  - 下载时间: ${new Date(comp.downloadedAt).toLocaleString('zh-CN')}\n\n`;
      });
    });

  fs.writeFileSync(reportPath, content, 'utf-8');
  console.log(colorize(`\n✅ 下载报告已生成: ${reportPath}`, 'green'));
}

function cleanDownloads(category = null) {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.log(colorize('⚠️  下载目录不存在', 'yellow'));
    return;
  }

  if (category) {
    const categoryPath = path.join(DOWNLOADS_DIR, category);
    if (!fs.existsSync(categoryPath)) {
      console.log(colorize(`⚠️  分类不存在: ${category}`, 'yellow'));
      return;
    }
    fs.rmSync(categoryPath, { recursive: true, force: true });
    console.log(colorize(`✅ 已清理分类: ${category}`, 'green'));
    return;
  }

  fs.rmSync(DOWNLOADS_DIR, { recursive: true, force: true });
  console.log(colorize('✅ 已清理所有下载', 'green'));
}

function listPopularComponents(components) {
  console.log(colorize('\n⭐ 热门GitHub组件 (按字母排序)\n', 'bright'));
  const githubComponents = components
    .filter((c) => parseGithubUrl(c.link).isGithub)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 20);

  githubComponents.forEach((comp, i) => {
    console.log(colorize(`${i + 1}. ${comp.name}`, 'cyan'));
    console.log(`   ${comp.description || 'N/A'}`);
    console.log(colorize(`   ${comp.link}`, 'blue'));
    console.log('');
  });
}

function main() {
  const args = process.argv.slice(2);
  const components = loadAllComponents();

  if (args.length === 0) {
    console.log(colorize('\n📦 shadcn/ui 组件下载器\n', 'bright'));
    console.log('使用方法:');
    console.log('  node download-components.js download [limit]     - 下载组件 (默认10个)');
    console.log('  node download-components.js download-all         - 下载所有GitHub组件');
    console.log('  node download-components.js download-category <分类> [limit] - 下载指定分类');
    console.log('  node download-components.js report               - 生成下载报告');
    console.log('  node download-components.js clean [category]     - 清理下载');
    console.log('  node download-components.js popular              - 列出热门组件');
    console.log('  node download-components.js list-github          - 列出所有GitHub组件\n');
    return;
  }

  const command = args[0];

  switch (command) {
    case 'download': {
      const limit = parseInt(args[1], 10) || 10;
      batchDownload(components, { limit, shallow: true });
      break;
    }
    case 'download-all':
      batchDownload(components, { limit: 0, shallow: true });
      break;
    case 'download-category': {
      if (!args[1]) {
        console.log(colorize('⚠️  请指定分类名称', 'yellow'));
        return;
      }
      const categoryLimit = parseInt(args[2], 10) || 0;
      batchDownload(components, {
        category: args[1],
        limit: categoryLimit,
        shallow: true,
      });
      break;
    }
    case 'report':
      generateDownloadReport();
      break;
    case 'clean':
      cleanDownloads(args[1]);
      break;
    case 'popular':
      listPopularComponents(components);
      break;
    case 'list-github': {
      const githubComponents = components.filter((c) => parseGithubUrl(c.link).isGithub);
      console.log(colorize(`\n📦 GitHub组件列表 (${githubComponents.length}个)\n`, 'bright'));
      githubComponents.forEach((comp, i) => {
        console.log(`${i + 1}. ${colorize(comp.name, 'cyan')} (${comp.category})`);
        console.log(`   ${comp.link}`);
      });
      break;
    }
    default:
      console.log(colorize('⚠️  未知命令，使用 --help 查看帮助', 'yellow'));
  }
}

main();
