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

Balancer.UnavailableError = utils.UnavailableError

/**
 * Generic Resource Pool
 *
 * @constructor
 * @param {String} [name]
 * @param {PoolOptions} opts
 * @param {...*} args
 * @api public
 */
var Pool = exports.Pool = function() {
  var args = Array.prototype.slice.call(arguments)
  var opts = args.shift() || {}, name
  if (typeof opts === 'string') {
    name = opts
    opts = args.shift() || {}
  }
  this.initialize(name, opts, args)
}

Pool.prototype = Object.create(
  utils.extend(require('./pool'), EventEmitter.prototype)
)