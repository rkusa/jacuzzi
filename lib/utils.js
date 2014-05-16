// if (!GLOBAL.Promise) {
//   var Promise
//   try {
//     Promise = require('es6-promise').Promise
//   } catch(e) {
//     throw new Error('When using `jacuzzi` with node <0.11 ' +
//                     'you have to additionally install `es6-promise`')
//   }
// }

var _extend = require('util')._extend

exports.extend = function() {
  var args = Array.prototype.slice.call(arguments)
  var target = args.shift(), obj
  while ((obj = args.shift())) {
    _extend(target, obj)
  }
  return target
}

/**
 * Timeout Error
 *
 * @class TimeoutError
 * @param {String} message
 */
function TimeoutError(message) {
  Error.call(this)
  Error.captureStackTrace(this, this.constructor)

  this.name = 'TimeoutError'
  this.message = message || 'Timeout'
}
TimeoutError.prototype = Object.create(Error.prototype, {
  constructor: { value: TimeoutError }
})

exports.TimeoutError = TimeoutError

/**
 * @typedef PoolOptions
 * @type {Object}
 * @property {Number} min=2
 * @property {Number} max=10
 * @property {Pool~create} create
 * @property {Pool~destroy} [destroy]
 * @property {Pool~check} [check]
 * @property {Array.<String>} events=['close', 'end', 'error', 'timeout']
 * @property {Number} creationTimeout=500
 * @property {Number} destructionTimeout=500
 */

var defaultOpts = {
  min: 2,
  max: 10,
  events: ['close', 'end', 'error', 'timeout'],
  creationTimeout: 500,
  destructionTimeout: 500
}

exports.validateOptions = function(opts, isPool) {
  ['min', 'max', 'creationTimeout', 'destructionTimeout'].forEach(function(prop) {
    if (typeof opts[prop] !== 'number' || opts[prop] < 0) {
      delete opts[prop]
    }
  })

  if (opts.max < 1) {
    delete opts.max
  }

  if (isPool && typeof opts.create !== 'function') {
    throw new TypeError('`opts.create` must be a function')
  }

  if (opts.destroy && typeof opts.destroy !== 'function') {
    throw new TypeError('`opts.destroy` must be a function')
  }

  if (opts.check && typeof opts.check !== 'function') {
    throw new TypeError('`opts.check` must be a function')
  }

  var merged = exports.extend({}, defaultOpts, opts)
  if (merged.min > merged.max) {
    merged.max = merged.min
  }

  return merged
}

/**
 * Resource
 * @name Resource
 */

/**
 * Create
 * @method Pool~create
 * @returns {Resource|Promise}
 */

/**
 * Destroy
 * @method Pool~destroy
 * @param {Resource} resource
 * @returns {?Promise}
 */

/**
 * Check
 * @method Pool~check
 * @param {Resource} resource
 * @returns {Boolean|Promise}
 */