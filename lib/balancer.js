'use strict'

var utils = require('./utils')
var debug = require('debug')('jacuzzi:balancer')
var Promise = GLOBAL.Promise || require('es6-promise').Promise

module.exports = /** @lends Balancer */ {

  initialize: function(opts) {
    this.opts = validateOptions(opts)
    this.pools = {}
    this.priorities = []
    this.pending = 'Map' in GLOBAL ? new GLOBAL.Map : null
    delete this.initialize
  },

  /**
   * Add a Pool
   *
   * @param {Pool} pool
   * @param {Number} priority
   */
  add: function(pool, priority) {
    if (!priority) priority = 1

    if (!this.pools[priority]) {
      this.pools[priority] = []
      this.priorities.push(priority)
      this.priorities.sort(function(lhs, rhs) {
        return lhs - rhs
      })
    }

    pool.opts.errorTolerance = false
    pool.healthy = true

    this.pools[priority].push(pool)
  },

  next: function() {
    var self = this

    return (function select(nextPriority, poolsTried) {
      var priority = self.priorities[nextPriority]

      // no pools (remaining)
      if (!self.pools[priority]) {
        if (self.priorities.length) {
          throw new utils.UnavailableError('All servers are down')
        } else {
          throw new Error('Balancer is empty - add pools first: `balancer.add(new Pool(...))`')
        }
      }

      // tried all pools with the current priority
      if (self.pools[priority].length < ++poolsTried) {
        return select(++nextPriority, 0)
      }

      // balancing, take from first position and add to last
      var pool = self.pools[priority].shift()
      self.pools[priority].push(pool)

      // if selected pool is unhealthy, select next pool
      if (!pool.healthy) {
        return select(nextPriority, ++poolsTried)
      }

      return pool
    })(0, 0)
  },

  /**
   * Acquire a resource from on of the pool.
   *
   * @param {Balancer~acquire} [callback] An optional callback that
   *        gets called once a resource is ready.
   * @returns {Promise} It additionally returns a `Promise`, which can be used
   *        instead of the `callback`.
   * @public
   */
  acquire: function(callback) {
    debug('requesting resource')

    var self = this, pool, stopped = false

    function acquire() {
      if (stopped) return null

      return new Promise(function(resolve) {

        // select pool
        pool = self.next()

        // acquire resource from pool
        pool.acquire().then(resolve, function(err) {
          // if acquisition from pool fails, mark pool as unhealthy and monitor
          // its status until it gets healthy again
          debug('requesting resource: failed with %s', err)
          debug('requesting resource: pool [%s] downed - retry with another pool',
                pool.name)
          pool.healthy = false
          self.monitorPool(pool)

          // try next pool
          resolve(acquire())
        })

      })
    }

    var acquisition = acquire()

    .then(function(resource) {
      debug('requesting resource: done')

      if (self.pending) {
        self.pending.set(resource, pool)
      }

      return resource
    })

    return utils.callbackify(utils.timeout(
      acquisition,
      self.opts.acquisitionTimeout,
      'Acquiring resource timed out'
    ), callback)

    .catch(function(err) {
      stopped = true
      return Promise.reject(err)
    })
  },

  /**
   * @callback Pool~acquire
   * @param {Error} err
   * @param {Resource} resource
   */

  /**
   * Return a resource back into its pool.
   *
   * @param {Resource} resource The resource being returned.
   * @returns {Boolean}
   * @api public
   */
  release: function(resource) {
    // es6
    if (this.pending) {
      if (!this.pending.has(resource)) {
        return false
      }

      var pool = this.pending.get(resource)
      this.pending.delete(resource)
      return pool.release(resource)
    }

    // non es6
    for (var priority in this.pools) {
      var pools = this.pools[priority]
      for (var i = 0, len = pools.length; i < len; ++i) {
        if (pools[i].release(resource)) {
          return true
        }
      }
    }

    return false
  },

  /**
   * Check a pool.
   *
   * @param {Pool} pool The pool to be checked.
   * @returns {Promise}
   * @api private
   */
  checkPool: function(pool) {
    if (!this.opts.check) {
      return Promise.resolve(true)
    }

    debug('checking pool')

    var fn = utils.promisify(this.opts.check.bind(null, pool))

    return Promise.resolve(fn)

    // evaluate the result
    .then(function(result) {
      if (result) {
        debug('checking pool [%s]: passed', pool.name)
        return true
      }
      else {
        debug('checking pool [%s]: failed', pool.name)
        return false
      }
    })
  },

  monitorPool: function(pool, attempt) {
    if (pool.healthy) return

    debug('monitoring pool [%s]', pool.name)

    var self = this

    this.checkPool(pool)

    .then(function(result) {
      pool.healthy = result
    })

    .catch(function(err) {
      debug('monitoring pool [%s]: errored', pool.name)

      if (err) {
        debug(err.toString())
        debug(err.stack)
      }

      self.emit('fail', err)
    })

    .then(function() {
      if (pool.healthy || pool.draining) {
        debug('monitoring pool [%s]: done', pool.name)
        return
      }

      var delay = utils.backoff(attempt || 1)
      debug('monitoring pool [%s]: failed - trying again with %dms backoff',
            pool.name, delay)

      setTimeout(function() {
        self.monitorPool(pool, attempt && ++attempt || 2)
      }, delay)
    })
  },

  shutdown: function() {
    debug('shutting down')

    for (var priority in this.pools) {
      var pools = this.pools[priority]
      pools.forEach(function(pool) {
        pool.drain()
      })
    }

    this.pools = {}
    this.priorities = []
  }

}

/**
 * @typedef BalancerOptions
 * @type {Object}
 * @property {Balancer~check} [check]
 * @property {Number} acquisitionTimeout=10000 a timeout (in ms) for the
 *           acquisition of a resource
 */

var defaultOpts = {
  acquisitionTimeout: 10000
}

function validateOptions(opts) {
  if (typeof opts.acquisitionTimeout !== 'number' || opts.acquisitionTimeout < 0) {
    delete opts.acquisitionTimeout
  }

  if (opts.check && typeof opts.check !== 'function') {
    throw new TypeError('`opts.check` must be a function')
  }

  var merged = utils.extend({}, defaultOpts, opts)
  if (merged.min > merged.max) {
    merged.max = merged.min
  }

  return merged
}

/**
 * Check
 * @method Balancer~check
 * @param {Function} [callback]
 * @returns {Boolean|Promise}
 */