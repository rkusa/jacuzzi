'use strict'

var EventEmitter = require('events').EventEmitter
var utils = require('./utils')

/**
 * Balancer that balances multiple generic Resource Pools
 *
 * @constructor
 * @param {BalancerOptions} opts
 * @api public
 */
var Balancer = exports.Balancer = function(opts) {
  this.initialize(opts || {})
}


Balancer.prototype = Object.create(
  utils.extend(require('./balancer'), EventEmitter.prototype)
)

/**
 * Generic Resource Pool
 *
 * @constructor
 * @param {PoolOptions} opts
 * @param {...*} args
 * @api public
 */
var Pool = exports.Pool = function(opts) {
  var args = Array.prototype.slice.call(arguments)
  var opts = args.shift() || {}
  opts.args = args
  this.initialize(opts)
}

Pool.prototype = Object.create(
  utils.extend(require('./pool'), EventEmitter.prototype)
)