var debug = require('debug')('jacuzzi:pool')
var utils = require('./utils')
var TimeoutError = utils.TimeoutError


/** @lends Pool */
module.exports = {

  healthCheck: function() {
    if (this.size < this.opts.min) {
      for (var i = this.size; i < this.opts.min; ++i) {
        this.createResource()
      }
    }

    if (this.size <= this.opts.max) {
      for (var i = 0, len = this.queue.length; i < len; ++i) {
        this.createResource()
      }
    }
  },

  /**
   * @fires Pool#create
   * @fires Pool#error
   */
  createResource: function(attempt) {
    if (this.size >= this.opts.max) {
      return
    }

    debug('adding resource')

    this.size++

    var pool = this

    var timeout = new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new TimeoutError('Creating resource timed out'))
      }, pool.opts.creationTimeout)
    })

    var create = Promise.race([timeout, Promise.resolve(this.opts.create())])

    create.then(function(resource) {
      debug('resource created')

      pool.initializeResource(resource)

      if (pool.queue.length) {
        var resolve = pool.queue.shift()
        resolve(resource)
      } else {
        pool.pool.push(resource)
      }

      /**
       * Create event.
       *
       * @event Pool#create
       * @type {Resource}
       */
      pool.emit('create', resource)
    })

    create.catch(function(err) {
      var delay = backoff(attempt || 1)
      debug('creating resource failed - trying again with %dms backoff', delay)
      if (err) {
        debug(err.toString())
        debug(err.stack)
        pool.emit('error', err)
      }
      setTimeout(function() {
        pool.size--
        pool.createResource(attempt && ++attempt || 2)
      }, delay)
    })
  },

  initializeResource: function(resource) {
    if (typeof resource.on === 'function') {
      var events = this.opts.events
      var pool = this
      events.forEach(function(event) {
        resource.on(event, function callback() {
          resource.removeListener(event, callback)
          pool.destoryResource(resource)
        })
      })
    }
    return resource
  },

  destroyResource: function(resource) {
    var idx
    if ((idx = this.pool.indexOf(resource)) > -1) {
      this.pool.splice(idx, 1)
    }

    debug('destroying resource')

    var pool = this

    new Promise(function(resolve, reject) {
      if (!pool.opts.destroy) return resolve()

      var timeout = new Promise(function(resolve, reject) {
        setTimeout(function() {
          reject(new TimeoutError('Destroying resource timed out'))
        }, pool.opts.destructionTimeout)
      })

      resolve(Promise.race([
        timeout,
        Promise.resolve(pool.opts.destroy(resource))
      ]))
    })

    .then(function() {
      pool.size--
      debug('resource successfully destroyed')

      /**
       * Destroy event.
       *
       * @event Pool#destroy
       * @type {Resource}
       */
      pool.emit('destroy', resource)
    })

    .catch(function(err) {
      pool.size--
      debug('destroying resource failed - removing it anyway')
      if (err) {
        debug(err.toString())
        debug(err.stack)
        pool.emit('error', err)
      }
    })

    .then(function() {
      if (pool.size < pool.opts.min) {
        pool.createResource()
      }
    })
  },

  acquire: function(callback) {
    debug('requesting resource')

    var pool = this

    function acquire(prepend) {
      return new Promise(function(resolve, reject) {
        var resource = pool.pool.shift()
        if (resource) {
          debug('requesting resource: resource available')
          resolve(resource)
        } else {
          debug('requesting resource: resource unavailable - request queued')
          pool.queue[prepend ? 'unshift' : 'push'](resolve)
          pool.healthCheck()
        }
      })

      .then(function(resource) {
        return pool.check(resource)
      })

      .then(function(resource) {
        if (!resource) {
          debug('requesting resource: retry')
          return acquire(true)
        }

        debug('requesting resource: done')
        pool.pending.push(resource)
        if (callback) {
          setImmediate(function() {
            callback(null, resource)
          })
        } else {
          return resource
        }
      })

      .catch(function(err) {
        throw err
      })
    }

    return acquire(false)
  },

  check: function(resource) {
    if (!this.opts.check) {
      return Promise.resolve(resource)
    }

    debug('checking resource')

    var pool = this

    var check = Promise.resolve(this.opts.check(resource))

    .then(function(result) {
      if (result) {
        debug('checking resource: passed')
        return resource
      }
      else {
        debug('checking resource: failed')
        pool.destroyResource(resource)
        return null
      }
    })

    .catch(function(err) {
      pool.destroyResource(resource)
      debug('checking resource: errored')
      if (err) {
        debug(err.toString())
        debug(err.stack)
        pool.emit('error', err)
      }
    })

    return check
  },

  release: function(resource) {
    var idx
    if ((idx = this.pending) === -1) {
      throw Error('Released invalid resource')
    }

    this.pending.splice(idx, 1)

    debug('releasing resource')

    if (this.queue.length) {
      debug('releasing resource - resource forwarded')
      var resolve = this.queue.shift()
      resolve(resource)
      return
    } else {
      var pool = this
      this.check(resource)
      .then(function(resource) {
        if (!resource) return
        debug('releasing resource - resource added back into pool')
        pool.pool.push(resource)
      })
    }
  }

}

/**
 * Error event.
 *
 * @event Pool#error
 * @type {Error}
 */

function backoff(attempt) {
  return 50 * fib(Math.min(attempt, 20))
}

function fib(n) {
  return n <= 1 ? n : (fib(n - 1) + fib(n - 2))
}