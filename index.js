var IMCPushAdapter = require('./src/IMCPushAdapter');
var log = require('npmlog');

module.exports = IMCPushAdapter;
module.exports.default = IMCPushAdapter;

if (process.env.VERBOSE || process.env.VERBOSE_PARSE_SERVER_IMC_ADAPTER) {
  log.level = 'verbose';
}
