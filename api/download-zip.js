const { Readable } = require('stream');
const {
  writeJson,
  parseGithubUrl,
  slugify,
  loadComponents,
  readJsonBody,
} = require('../lib/api-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    writeJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim();
    const link = String(body.link || '').trim();

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

    const parsed = parseGithubUrl(component.link);
    if (!parsed) {
      writeJson(res, 400, { ok: false, message: '该组件不是 GitHub 仓库，无法打包下载。' });
      return;
    }

    const zipballUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/zipball`;
    const upstream = await fetch(zipballUrl, {
      headers: {
        'User-Agent': 'awesome-shadcn-ui-browser',
        Accept: 'application/vnd.github+json',
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      let detail = '';
      try {
        detail = await upstream.text();
      } catch (_) {
        // ignore parse failures
      }
      writeJson(res, upstream.status || 500, {
        ok: false,
        message: `GitHub 下载失败: ${detail || upstream.statusText || 'unknown error'}`,
      });
      return;
    }

    const fileName = `${slugify(component.name || parsed.repo || 'component') || 'component'}.zip`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Cache-Control', 'no-store');

    if (!upstream.body) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
      return;
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    writeJson(res, 500, { ok: false, message: `处理失败: ${err.message}` });
  }
};
