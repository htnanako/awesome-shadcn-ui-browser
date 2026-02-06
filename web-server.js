#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'components-data.json');
const DOWNLOADS_DIR = path.join(ROOT, 'downloaded-components');
const DOWNLOAD_REGISTRY_FILE = path.join(ROOT, '.download-registry.json');
const PORT = Number(process.env.PORT || 8080);
const ALLOW_CUSTOM_SAVE_PATH = process.env.ALLOW_CUSTOM_SAVE_PATH !== '0';
const ALLOWED_SAVE_ROOTS = String(process.env.ALLOWED_SAVE_ROOTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => path.resolve(s));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}

function ensureDataFile() {
  if (fs.existsSync(DATA_FILE)) return;
  execSync('node generate-json.js', { cwd: ROOT, stdio: 'inherit' });
}

function loadComponents() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function parseGithubUrl(url) {
  const match = String(url || '').match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace('.git', ''),
  };
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function cleanupPath(target) {
  if (!target) return;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (_) {
    // Ignore cleanup errors.
  }
}

function getErrorDetail(result) {
  return String(result?.stderr || result?.stdout || '').trim();
}

function openDirectory(targetPath) {
  try {
    if (process.platform === 'darwin') {
      const r = spawnSync('open', [targetPath], { stdio: 'ignore' });
      return r.status === 0 ? { opened: true } : { opened: false, message: '目录打开失败。' };
    }
    if (process.platform === 'win32') {
      const r = spawnSync('explorer', [targetPath], { stdio: 'ignore' });
      return r.status === 0 ? { opened: true } : { opened: false, message: '目录打开失败。' };
    }
    if (process.platform === 'linux') {
      const r = spawnSync('xdg-open', [targetPath], { stdio: 'ignore' });
      return r.status === 0 ? { opened: true } : { opened: false, message: '目录打开失败。' };
    }
    return { opened: false, message: '当前系统不支持自动打开目录。' };
  } catch (err) {
    return { opened: false, message: `目录打开失败: ${err.message}` };
  }
}

function isPathInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isPathInsideOrSame(parent, child) {
  const a = path.resolve(parent);
  const b = path.resolve(child);
  return a === b || isPathInside(a, b);
}

function readDownloadRegistry() {
  if (!fs.existsSync(DOWNLOAD_REGISTRY_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(DOWNLOAD_REGISTRY_FILE, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writeDownloadRegistry(items) {
  fs.writeFileSync(DOWNLOAD_REGISTRY_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

function saveDownloadRecord(record) {
  const current = readDownloadRegistry();
  const deduped = current.filter((item) => {
    if (!item || !item.path) return true;
    return !(item.path === record.path || (item.name === record.name && item.link === record.link));
  });
  deduped.push(record);
  writeDownloadRegistry(deduped);
}

function normalizeSaveRoot(rawPath) {
  const input = String(rawPath || '').trim();
  if (!input) return DOWNLOADS_DIR;
  if (!ALLOW_CUSTOM_SAVE_PATH) {
    throw new Error('服务端未启用自定义保存路径。');
  }

  const resolved = path.resolve(input);
  if (ALLOWED_SAVE_ROOTS.length > 0) {
    const allowed = ALLOWED_SAVE_ROOTS.some((root) => isPathInsideOrSame(root, resolved));
    if (!allowed) {
      throw new Error(`保存路径不在允许范围内。允许根目录: ${ALLOWED_SAVE_ROOTS.join(', ')}`);
    }
  }
  return resolved;
}

function getDownloadedIndex() {
  const byName = {};
  const byLink = {};

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    return { byName, byLink };
  }

  const categories = fs.readdirSync(DOWNLOADS_DIR);
  categories.forEach((category) => {
    const categoryPath = path.join(DOWNLOADS_DIR, category);
    if (!fs.existsSync(categoryPath) || !fs.statSync(categoryPath).isDirectory()) return;

    const components = fs.readdirSync(categoryPath);
    components.forEach((compFolder) => {
      const compPath = path.join(categoryPath, compFolder);
      const metaPath = path.join(compPath, '.component-metadata.json');
      if (!fs.existsSync(metaPath)) return;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const item = {
          name: meta.name,
          link: meta.link,
          path: compPath,
          downloadedAt: meta.downloadedAt,
        };
        if (meta.name) byName[meta.name] = item;
        if (meta.link) byLink[meta.link] = item;
      } catch (_) {
        // Ignore invalid metadata files.
      }
    });
  });

  const registryItems = readDownloadRegistry();
  registryItems.forEach((item) => {
    const itemPath = String(item?.path || '').trim();
    if (!itemPath || !fs.existsSync(itemPath)) return;
    const normalized = {
      name: item.name,
      link: item.link,
      path: itemPath,
      downloadedAt: item.downloadedAt,
    };
    if (normalized.name) byName[normalized.name] = normalized;
    if (normalized.link) byLink[normalized.link] = normalized;
  });

  return { byName, byLink };
}

function serveFile(reqPath, res) {
  const urlPath = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  const safePath = path.resolve(ROOT, urlPath);
  const rootPath = path.resolve(ROOT);
  if (!(safePath === rootPath || safePath.startsWith(`${rootPath}${path.sep}`))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(safePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(safePath).pipe(res);
}

function cloneComponent(component, options = {}) {
  const parsed = parseGithubUrl(component.link);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      message: '该组件不是 GitHub 仓库，无法自动下载。',
    };
  }

  const saveRoot = normalizeSaveRoot(options.saveRoot);
  const category = slugify(component.category || 'unknown');
  const folder = slugify(component.folder || component.name || parsed.repo);
  const targetDir = path.join(saveRoot, category, folder);

  if (fs.existsSync(targetDir)) {
    return {
      ok: true,
      skipped: true,
      message: '组件已存在，已跳过。',
      path: targetDir,
    };
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  const result = spawnSync('git', ['clone', '--depth', '1', component.link, targetDir], {
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    const detail = (result.stderr || result.stdout || '').trim();
    return {
      ok: false,
      status: 500,
      message: detail || 'git clone 失败，请检查网络或仓库地址。',
    };
  }

  const gitDir = path.join(targetDir, '.git');
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }

  const metadata = {
    name: component.name,
    link: component.link,
    category: component.category,
    categoryLabel: component.categoryLabel || component.category,
    downloadedAt: new Date().toISOString(),
    owner: parsed.owner,
    repo: parsed.repo,
  };
  fs.writeFileSync(path.join(targetDir, '.component-metadata.json'), JSON.stringify(metadata, null, 2));
  saveDownloadRecord({
    name: component.name,
    link: component.link,
    path: targetDir,
    downloadedAt: metadata.downloadedAt,
  });

  return {
    ok: true,
    skipped: false,
    message: '下载成功。',
    path: targetDir,
  };
}

function handleDownload(req, res) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1024 * 1024) {
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      const body = raw ? JSON.parse(raw) : {};
      const name = String(body.name || '').trim();
      const link = String(body.link || '').trim();
      const saveRoot = String(body.saveRoot || '').trim();
      if (!name && !link) {
        writeJson(res, 400, { ok: false, message: '缺少组件信息。' });
        return;
      }

      const components = loadComponents();
      const component = components.find((item) => {
        return (name && item.name === name) || (link && item.link === link);
      });

      if (!component) {
        writeJson(res, 404, { ok: false, message: '未找到该组件。' });
        return;
      }

      try {
        const result = cloneComponent(component, { saveRoot });
        writeJson(res, result.status || 200, result);
      } catch (err) {
        writeJson(res, 400, { ok: false, message: `保存路径无效: ${err.message}` });
      }
    } catch (err) {
      writeJson(res, 500, { ok: false, message: `处理失败: ${err.message}` });
    }
  });
}

function handleDownloadZip(req, res) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1024 * 1024) req.destroy();
  });

  req.on('end', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'awesome-shadcn-'));
    const cleanup = () => cleanupPath(tempRoot);

    try {
      const body = raw ? JSON.parse(raw) : {};
      const name = String(body.name || '').trim();
      const link = String(body.link || '').trim();
      if (!name && !link) {
        cleanup();
        writeJson(res, 400, { ok: false, message: '缺少组件信息。' });
        return;
      }

      const components = loadComponents();
      const component = components.find((item) => {
        return (name && item.name === name) || (link && item.link === link);
      });

      if (!component) {
        cleanup();
        writeJson(res, 404, { ok: false, message: '未找到该组件。' });
        return;
      }

      const parsed = parseGithubUrl(component.link);
      if (!parsed) {
        cleanup();
        writeJson(res, 400, { ok: false, message: '该组件不是 GitHub 仓库，无法打包下载。' });
        return;
      }

      const repoDir = path.join(tempRoot, 'repo');
      const cloneResult = spawnSync('git', ['clone', '--depth', '1', component.link, repoDir], {
        encoding: 'utf-8',
      });

      if (cloneResult.status !== 0) {
        const detail = getErrorDetail(cloneResult);
        cleanup();
        writeJson(res, 500, { ok: false, message: detail || 'git clone 失败，请稍后重试。' });
        return;
      }

      cleanupPath(path.join(repoDir, '.git'));

      const zipBaseName = `${slugify(component.name || parsed.repo || 'component') || 'component'}.zip`;
      const zipFile = path.join(tempRoot, zipBaseName);
      const zipResult = spawnSync('zip', ['-r', '-q', zipFile, '.'], {
        cwd: repoDir,
        encoding: 'utf-8',
      });

      if (zipResult.status !== 0) {
        const detail = getErrorDetail(zipResult);
        const isZipMissing = /not found|ENOENT/i.test(detail);
        cleanup();
        writeJson(
          res,
          500,
          { ok: false, message: isZipMissing ? '服务端缺少 zip 命令，无法打包。' : (detail || 'zip 打包失败。') }
        );
        return;
      }

      const safeName = encodeURIComponent(zipBaseName);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`,
        'Cache-Control': 'no-store',
      });
      const stream = fs.createReadStream(zipFile);
      stream.on('error', () => {
        cleanup();
        if (!res.headersSent) {
          writeJson(res, 500, { ok: false, message: '读取压缩包失败。' });
        } else {
          res.destroy();
        }
      });
      stream.on('close', cleanup);
      res.on('close', cleanup);
      stream.pipe(res);
    } catch (err) {
      cleanup();
      writeJson(res, 500, { ok: false, message: `处理失败: ${err.message}` });
    }
  });
}

function handleDownloaded(res) {
  const index = getDownloadedIndex();
  writeJson(res, 200, { ok: true, items: Object.values(index.byName) });
}

function handleOpenDirectory(req, res) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1024 * 1024) req.destroy();
  });

  req.on('end', () => {
    try {
      const body = raw ? JSON.parse(raw) : {};
      const targetPath = String(body.path || '').trim();
      if (!targetPath) {
        writeJson(res, 400, { ok: false, message: '缺少目录路径。' });
        return;
      }

      const resolved = path.resolve(targetPath);
      const allowedPaths = new Set([path.resolve(DOWNLOADS_DIR)]);
      readDownloadRegistry().forEach((item) => {
        if (item?.path) allowedPaths.add(path.resolve(item.path));
      });
      const canOpen = [...allowedPaths].some((p) => isPathInsideOrSame(p, resolved));
      if (!canOpen) {
        writeJson(res, 403, { ok: false, message: '仅允许打开已下载组件路径。' });
        return;
      }
      if (!fs.existsSync(resolved)) {
        writeJson(res, 404, { ok: false, message: '目录不存在。' });
        return;
      }

      const result = openDirectory(resolved);
      if (!result.opened) {
        writeJson(res, 500, { ok: false, message: result.message || '目录打开失败。' });
        return;
      }
      writeJson(res, 200, { ok: true, message: '目录已打开。' });
    } catch (err) {
      writeJson(res, 500, { ok: false, message: `处理失败: ${err.message}` });
    }
  });
}

function createServer() {
  return http.createServer((req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const reqPath = decodeURIComponent(reqUrl.pathname);

    if (req.method === 'GET' && reqPath === '/api/health') {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && reqPath === '/api/downloaded') {
      handleDownloaded(res);
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/download') {
      handleDownload(req, res);
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/download-zip') {
      handleDownloadZip(req, res);
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/open-directory') {
      handleOpenDirectory(req, res);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    serveFile(reqPath, res);
  });
}

function maybeOpenBrowser() {
  if (!process.argv.includes('--open')) return;
  try {
    execSync(`open http://localhost:${PORT}/index.html`, { stdio: 'ignore' });
  } catch (_) {
    // Ignore open failures in headless shells.
  }
}

ensureDataFile();
const server = createServer();
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被占用，请先关闭旧服务或使用 PORT=${PORT + 1} npm run web`);
    process.exit(1);
  }
  console.error(`❌ 服务启动失败: ${err.message}`);
  process.exit(1);
});
server.listen(PORT, () => {
  console.log(`🌐 Web UI: http://localhost:${PORT}/index.html`);
  console.log('📥 已启用组件下载 API: POST /api/download-zip');
  maybeOpenBrowser();
});
