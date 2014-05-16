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
      for (var j = 0, len = this.queue.length; j < len; ++j) {
        this.createResource()
      }
    }
  },

  /**
   * @fires Pool#create
   * @fires Pool#fail
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

    Promise.race([timeout, Promise.resolve(this.opts.create())])

    .then(function(resource) {
      if (!resource) {
        throw new Error('Create failed')
      }
      debug('resource created')

      if (typeof resource.on === 'function') {
        pool.opts.events.forEach(function(event) {
          resource.on(event, function callback() {
            resource.removeListener(event, callback)
            pool.destroyResource(resource)
          })
        })
      }

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

    .catch(function(err) {
      var delay = backoff(attempt || 1)
      debug('creating resource failed - trying again with %dms backoff', delay)

      if (err) {
        debug(err.toString())
        debug(err.stack)
        pool.emit('fail', err)
      }
      setTimeout(function() {
        pool.size--
        pool.createResource(attempt && ++attempt || 2)
      }, delay)
    })
  },

  /**
   * @fires Pool#destroy
   * @fires Pool#fail
   */
  destroyResource: function(resource) {
    var idx
    if ((idx = this.pool.indexOf(resource)) > -1) {
      this.pool.splice(idx, 1)
    }

    debug('destroying resource')

    var pool = this

    new Promise(function(resolve) {
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
        pool.emit('fail', err)
      }
    })

    .then(function() {
      if (pool.draining) return
      if (pool.size < pool.opts.min) {
        pool.createResource()
      }
    })
  },

  acquire: function(callback) {
    if (this.draining) {
      throw new Error('Cannot acquire from a pool that got shut down')
    }

    debug('requesting resource')

    var pool = this

    function acquire(prepend) {
      return new Promise(function(resolve) {
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
        if (pool.opts.leakDetectionThreshold > 0) {
          pool.timer.push(setTimeout(function() {
            console.error('Possible resource leak detected. ' +
                          'Resource not released within %ds',
                          pool.opts.leakDetectionThreshold / 1000)
            console.trace()
          }, pool.opts.leakDetectionThreshold))
        }
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

  /**
   * @fires Pool#fail
   */
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
        pool.emit('fail', err)
      }
    })

    return check
  },

  release: function(resource) {
    var idx
    if (this.draining || (idx = this.pending) === -1) {
      return
    }

    this.pending.splice(idx, 1)
    clearTimeout(this.timer.splice(idx, 1)[0])

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
  },

  drain: function() {
    debug('draining pool')

    this.draining = true
    this.pool.concat(this.pending).forEach(function(resource) {
      this.destroyResource(resource)
    }, this)

    this.pool.push = this.destroyResource.bind(this)
  }
}

/**
 * Fail event.
 *
 * @event Pool#fail
 * @type {Error}
 */

function backoff(attempt) {
  return 50 * fib(Math.min(attempt, 20))
}

function fib(n) {
  return n <= 1 ? n : (fib(n - 1) + fib(n - 2))
}