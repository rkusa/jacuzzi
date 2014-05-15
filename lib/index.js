var EventEmitter = require('events').EventEmitter
var extend = require('util')._extend
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

Balancer.prototype = Object.create(extend(EventEmitter.prototype, require('./balancer')))

/**
 * Generic Resource Pool
 *
 * @class
 * @param {PoolOptions} opts
 */
var Pool = Balancer.Pool = function(opts) {
  Object.defineProperty(this, '_opts', { value: opts || {} })
  this.opts = utils.validateOptions(this._opts, true)
  this.resources = []
  this.resourcesCount = 0
  this.healthCheck()
}

Pool.prototype = Object.create(extend(EventEmitter.prototype, require('./pool')))