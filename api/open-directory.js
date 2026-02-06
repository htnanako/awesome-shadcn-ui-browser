const { writeJson } = require('../lib/api-utils');

module.exports = async function handler(req, res) {
  writeJson(res, 501, {
    ok: false,
    message: 'Vercel 环境不支持在服务端打开本地目录。',
  });
};
