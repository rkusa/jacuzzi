'use strict'

var Promise = GLOBAL.Promise || require('es6-promise').Promise
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
 * Timeout Error
 *
 * @class TimeoutError
 * @param {String} message
 */
function UnavailableError(message) {
  Error.call(this)
  Error.captureStackTrace(this, this.constructor)

  this.name = 'UnavailableError'
  this.message = message || 'Unavailable'
}
UnavailableError.prototype = Object.create(Error.prototype, {
  constructor: { value: UnavailableError }
})

exports.UnavailableError = UnavailableError

exports.callbackify = function(promise, callback) {
  if (!callback) return promise

  return promise

  .then(function(resource) {
    setImmediate(function() {
      callback(null, resource)
    })

    return resource
  })

  .catch(function(err) {
    setImmediate(function() {
      callback(err, null)
    })

    return Promise.reject(err)
  })
}

exports.promisify = function(fn) {
  if (fn.length === 0) {
    return Promise.resolve(fn())
  } else {
    return new Promise(function(resolve, reject) {
      fn(function(err, resource) {
        if (err) reject(err)
        else     resolve(resource)
      })
    })
  }
}

function fib(n) {
  return n <= 1 ? n : (fib(n - 1) + fib(n - 2))
}

exports.backoff = function(attempt) {
  return 50 * fib(Math.min(attempt, 20))
}
