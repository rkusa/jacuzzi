var debug = require('debug')('jacuzzi:pool')
var utils = require('./utils')
var TimeoutError = utils.TimeoutError


/** @lends Pool */
module.exports = {

  healthCheck: function() {
    if (this.resourcesCount < this.opts.min) {
      for (var i = this.resourcesCount; i < this.opts.min; ++i) {
        this.createResource()
      }
    }
  },

  /**
   * @fires Pool#create
   * @fires Pool#error
   */
  createResource: function(attempt) {
    if (this.resourcesCount >= this.opts.max) {
      return
    }

    debug('adding resource')

    this.resourcesCount++

    var pool = this

    var timeout = new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new TimeoutError('Creating resource timed out'))
      }, pool.opts.createTimeout)
    })

    var create = Promise.race([timeout, Promise.resolve(this.opts.create())])

    create.then(function(resource) {
      pool.resources.push(pool.initializeResource(resource))
      debug('resource created')

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
        pool.resourcesCount--
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
    if ((idx = this.resources.indexOf(resource)) === -1) {
      return
    }

    this.resources.splice(idx, 1)

    if (!this.opts.destroy) return

    debug('destroying resource')

    var pool = this

    var timeout = new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new TimeoutError('Destroying resource timed out'))
      }, pool.opts.destroyTimeout)
    })

    var destroy = Promise.race([timeout, Promise.resolve(pool.opts.destroy(resource))])

    destroy

    .then(function() {
      pool.resourcesCount--
      debug('resource successfully destroyed')
    })

    .catch(function(err) {
      pool.resourcesCount--
      debug('destroying resource failed - removing it anyway')
      if (err) {
        debug(err.toString())
        debug(err.stack)
        pool.emit('error', err)
      }
    })

    .then(function() {
      if (pool.resourcesCount < pool.opts.min) {
        pool.createResource()
      }
    })
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