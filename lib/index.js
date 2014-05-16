var EventEmitter = require('events').EventEmitter
var utils = require('./utils')

/**
 * Balancer that balances multiple generic Resource Pools
 *
 * @class
 * @param {PoolOptions} opts
 */
var Balancer = module.exports = function(opts) {
  Object.defineProperty(this, '_opts', { value: opts || {} })
  this.opts = utils.validateOptions(this._opts, false)
}

Balancer.prototype = Object.create(utils.extend(require('./balancer'), EventEmitter.prototype))

/**
 * Generic Resource Pool
 *
 * @class
 * @param {PoolOptions} opts
 */
var Pool = Balancer.Pool = function(opts) {
  Object.defineProperty(this, '_opts', { value: opts || {} })
  this.opts = utils.validateOptions(this._opts, true)
  this.pool = []
  this.pending = []
  this.size = 0

  var queue = this.queue = []
  this.on('create', function(resource) {
    var resolve = queue.shift()
    if (resolve) resolve(resource)
  })

  this.healthCheck()
}

Pool.prototype = Object.create(utils.extend(require('./pool'), EventEmitter.prototype))