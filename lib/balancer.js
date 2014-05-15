var utils = require('./utils')

/** @lends Balancer */
module.exports = {

  /**
   * Add Resource Pool
   *
   * @param {Pool} pool
   * @param {Number} preference
   */
  add: function(pool/*, preference*/) {
    // inherit options
    pool.opts = utils.validateOptions(utils.extend({}, this._opts, pool._opts))

  }

}