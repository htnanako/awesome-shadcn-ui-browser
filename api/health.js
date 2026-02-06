const { writeJson } = require('../lib/api-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    writeJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }
  writeJson(res, 200, { ok: true });
};
