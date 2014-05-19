var debug = require('debug')('jacuzzi:pool')
var utils = require('./utils')
var TimeoutError = utils.TimeoutError

module.exports = /** @lends Pool */ {

  /**
   * Acquire a resource from the pool.
   *
   * @param {Pool~acquire} [callback] An optional callback that
   *        gets called once a resource is ready.
   * @returns {Promise} It additionally returns a `Promise`, which can be used
   *        instead of the `callback`.
   * @public
   */
  acquire: function(callback) {
    if (this.draining) {
      throw new Error('Cannot acquire from a pool that got shut down')
    }

    this.debug('requesting resource')

    var pool = this

    function acquire(prepend) {

      // get a resource
      var chain = new Promise(function(resolve) {
        // try to get a resource from the pool
        var resource = pool.pool.shift()
        if (resource) {
          pool.debug('requesting resource: resource available')
          resolve(resource)
        }
        // if there is no available resource, queue this request and try to
        // refill the pool
        else {
          pool.debug('requesting resource: resource unavailable - request queued')
          pool.queue[prepend ? 'unshift' : 'push'](resolve)
          pool.refill()
        }
      })

      // check the resource
      .then(function(resource) {
        return pool.check(resource)
      })

      // return resource
      .then(function(resource) {
        // if the resource is `null`, the check failed, retry process
        if (!resource) {
          pool.debug('requesting resource: retry')
          // `true` indicates to add this request to the first position in
          // the queue (instead of normally enqueueing it)
          return acquire(true)
        }

        pool.debug('requesting resource: done')
        pool.pending.push(resource)

        // set the timer for possible resource leak detection
        if (pool.opts.leakDetectionThreshold > 0) {
          pool.timer.push(setTimeout(function() {
            console.error('Possible resource leak detected. ' +
                          'Resource not released within %ds',
                          pool.opts.leakDetectionThreshold / 1000)
            console.trace()
          }, pool.opts.leakDetectionThreshold))
        }

        // if the `callback` argument is provided, call it
        if (callback) {
          setImmediate(function() {
            callback(null, resource)
          })
        }

        // finalize Promise
        return resource
      })

      .catch(function(err) {
        throw err
      })

      return chain
    }

    return acquire(false)
  },

  /**
   * @callback Pool~acquire
   * @param {Error} err
   * @param {Resource} resource
   */

  /**
   * Return a resource back into the pool.
   *
   * @param {Resource} resource The resource being returned.
   * @api public
   */
  release: function(resource) {
    // check if the resource released is a resource the pool is waiting for
    var idx
    if ((idx = this.pending) === -1) {
      return
    }

    // remove from list of pending resources and clear the leak detection timer
    this.pending.splice(idx, 1)
    clearTimeout(this.timer.splice(idx, 1)[0])

    this.debug('releasing resource')

    // if there are request waiting for a resource, provide the released
    // resource directly to the first request in the queue
    if (this.queue.length) {
      this.debug('releasing resource - resource forwarded')
      var resolve = this.queue.shift()
      resolve(resource)
    }
    // otherwise, check the resource and return it to the pool
    else {
      var pool = this
      this.check(resource)
      .then(function(resource) {
        if (!resource) return
        pool.debug('releasing resource - resource added back into pool')
        pool.pool.push(resource)
      })
      .catch(function(err) {
        throw err
      })
    }
  },

  /**
   * Refills the pool according to `opts.min` and `opts.max`.
   *
   * @api private
   */
  refill: function() {
    if (this.draining) return

    // create at least `opts.min` resources
    if (this.size < this.opts.min) {
      for (var i = this.size; i < this.opts.min; ++i) {
        this.createResource()
      }
    }

    // if `opts.max` is not yet reached look for waiting requests and provide
    // them with resources
    for (var j = 0, len = this.queue.length; this.size <= this.opts.max && j < len; ++j) {
      this.createResource()
    }
  },

  /**
   * Create a new resource and add it to the pool.
   *
   * @fires Pool#create
   * @fires Pool#fail
   * @param {Number} [attempt] The attempt counter increases the delay on
   *         failure or timeout.
   * @api private
   */
  createResource: function(attempt) {
    if (this.size >= this.opts.max) {
      return
    }

    this.debug('adding resource')

    this.size++

    var pool = this

    var timeout = new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new TimeoutError('Creating resource timed out'))
      }, pool.opts.creationTimeout)
    })

    // the first Promise that resolves wins (creating vs timeout)
    Promise.race([timeout, Promise.resolve(this.opts.create())])

    // initialize resource
    .then(function(resource) {
      if (!resource) {
        throw new Error('Create failed')
      }
      pool.debug('resource created')

      // add event listeners
      if (typeof resource.on === 'function') {
        pool.opts.events.forEach(function(event) {
          resource.on(event, function callback() {
            resource.removeListener(event, callback)
            if (pool.pool.indexOf(resource) === -1) return
            pool.destroyResource(resource)
          })
        })
      }

      // if there are requests waiting with a resource, feed them
      if (pool.queue.length) {
        var resolve = pool.queue.shift()
        resolve(resource)
      }
      // otherweise, add the resource to the pool
      else {
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

    // if the creating fails, retry it (with an increasing backoff)
    .catch(function(err) {
      var delay = backoff(attempt || 1)
      pool.debug('creating resource failed - trying again with %dms backoff', delay)

      if (err) {
        pool.debug(err.toString())
        pool.debug(err.stack)
        pool.emit('fail', err)
      }
      setTimeout(function() {
        pool.size--
        pool.createResource(attempt && ++attempt || 2)
      }, delay)
    })
  },

  /**
   * Destroy a resource and remove it from the pool.
   *
   * @fires Pool#destroy
   * @fires Pool#fail
   * @param {Resource} The resource to be destroyed.
   * @api private
   */
  destroyResource: function(resource) {
    // if the resource is currently inside the pool, remove it
    var idx
    if ((idx = this.pool.indexOf(resource)) > -1) {
      this.pool.splice(idx, 1)
    }

    this.debug('destroying resource')

    var pool = this

    // destroy the resource
    new Promise(function(resolve) {
      if (!pool.opts.destroy) return resolve()

      var timeout = new Promise(function(resolve, reject) {
        setTimeout(function() {
          reject(new TimeoutError('Destroying resource timed out'))
        }, pool.opts.destructionTimeout)
      })

      // the first Promise that resolves wins (destroying vs timeout)
      resolve(Promise.race([
        timeout,
        Promise.resolve(pool.opts.destroy(resource))
      ]))
    })

    // dispose resource
    .then(function() {
      pool.size--
      pool.debug('resource successfully destroyed')

      /**
       * Destroy event.
       *
       * @event Pool#destroy
       * @type {Resource}
       */
      pool.emit('destroy', resource)
    })

    // if the destruction fails, remove it anyway ...
    .catch(function(err) {
      pool.size--
      pool.debug('destroying resource failed - removing it anyway')
      if (err) {
        pool.debug(err.toString())
        pool.debug(err.stack)
        pool.emit('fail', err)
      }
    })

    // finalize
    .then(function() {
      pool.refill()
    })
  },

  /**
   * Check a resource and destroy it on failure.
   *
   * @fires Pool#fail
   * @param {Resource} The resource to be checked.
   * @api private
   */
  check: function(resource) {
    // if there is no `opts.check` function provided, succeed the check
    if (!this.opts.check) {
      return Promise.resolve(resource)
    }

    this.debug('checking resource')

    var pool = this

    // call `opts.check`
    var check = Promise.resolve(this.opts.check(resource))

    // evaluate the result
    .then(function(result) {
      if (result) {
        pool.debug('checking resource: passed')
        return resource
      }
      else {
        pool.debug('checking resource: failed')
        pool.destroyResource(resource)
        return null
      }
    })

    // on error destroy resource
    .catch(function(err) {
      pool.destroyResource(resource)
      pool.debug('checking resource: errored')
      if (err) {
        pool.debug(err.toString())
        pool.debug(err.stack)
        pool.emit('fail', err)
      }
    })

    return check
  },

  /**
   * Gracefully shut down the pool. Let it drain ...
   *
   * @api public
   */
  drain: function() {
    this.debug('draining pool')

    this.draining = true
    var resource
    while((resource = this.pool.shift())) {
      this.destroyResource(resource)
    }

    this.pool.push = this.destroyResource.bind(this)
  },

  debug: function(msg) {
    debug('[%d, %d, %d, %d] ' + msg, this.size, this.pool.length, this.pending.length, this.queue.length)
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