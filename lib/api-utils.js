const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, 'components-data.json');

function writeJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseGithubUrl(url) {
  const match = String(url || '').match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace('.git', ''),
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}

function loadComponents() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error('components-data.json not found');
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

module.exports = {
  writeJson,
  parseGithubUrl,
  slugify,
  loadComponents,
  readJsonBody,
};
