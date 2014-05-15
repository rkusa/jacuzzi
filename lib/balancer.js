var extend = require('util')._extend
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
    pool.opts = utils.validateOptions(extend(this._opts, pool._opts))

  }

}