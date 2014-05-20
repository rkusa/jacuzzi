/*eslint-env node, mocha */

'use strict'

var chai = require('chai')
chai.use(require('chai-spies'))
var expect = chai.expect

var Promise = GLOBAL.Promise || require('es6-promise').Promise
var net = require('net')
var utils = require('../lib/utils')
var TimeoutError = utils.TimeoutError

var Pool = require('../lib/').Pool

suite('Pool', function() {

  var Resource = function() {}

  test('instantiation', function(done) {
    var pool = new Pool({
      create: function() {
        return new Resource
      }
    })

    expect(pool.size).to.equal(2)

    var spy = chai.spy()
    pool.on('create', spy)
    setTimeout(function() {
      expect(spy).to.have.been.called.twice()
      expect(pool.pool.length).to.equal(2)
      expect(pool.size).to.equal(2)
      pool.pool.forEach(function(resource) {
        expect(resource).to.be.an.instanceOf(Resource)
      })
      done()
    })
  })

  test('instantiation with Promises', function(done) {
    var pool = new Pool({
      create: function() {
        return new Promise(function(resolve) {
          setTimeout(function() { resolve(new Resource) }, 50)
        })
      }
    })

    expect(pool.pool.length).to.equal(0)
    expect(pool.size).to.equal(2)
    setTimeout(function() {
      expect(pool.pool.length).to.equal(2)
      expect(pool.size).to.equal(2)
      done()
    }, 200)

  })

  suite('Creation', function() {

    test('promise', function(done) {
      var pool = new Pool({
        create: function() {
          return new Promise(function(resolve, reject) {
            resolve(new Resource)
          })
        }
      })

      expect(pool.pool.length).to.equal(0)
      expect(pool.size).to.equal(2)
      setTimeout(function() {
        expect(pool.pool.length).to.equal(2)
        expect(pool.size).to.equal(2)

        done()
      }, 300)
    })

    test('callback', function(done) {
      var pool = new Pool({
        create: function(callback) {
          callback(null, new Resource)
        }
      })

      expect(pool.pool.length).to.equal(0)
      expect(pool.size).to.equal(2)
      setTimeout(function() {
        expect(pool.pool.length).to.equal(2)
        expect(pool.size).to.equal(2)
        done()
      }, 300)
    })

    test('retry', function(done) {
      var count = 0
      var pool = new Pool({
        create: function() {
          return new Promise(function(resolve, reject) {
            if (++count < 6) return reject()
            resolve(new Resource)
          })
        }
      })

      expect(pool.pool.length).to.equal(0)
      expect(pool.size).to.equal(2)
      setTimeout(function() {
        expect(pool.pool.length).to.equal(2)
        expect(pool.size).to.equal(2)
        done()
      }, 300)
    })

  })

  suite('Destruction', function() {

    test('promise', function(done) {
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        destroy: function() {
          return new Promise(function(resolve) {
            setTimeout(resolve, 50)
          })
        }
      })

      pool.opts.min = 1

      setTimeout(function() {
        expect(pool.pool.length).to.equal(2)
        expect(pool.size).to.equal(2)

        pool.destroyResource(pool.pool[0])
        expect(pool.pool.length).to.equal(1)
        expect(pool.size).to.equal(2)

        setTimeout(function() {
          expect(pool.pool.length).to.equal(1)
          expect(pool.size).to.equal(1)
          done()
        }, 100)
      })
    })

    test('callback', function(done) {
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        destroy: function(resource, callback) {
          callback()
        }
      })

      pool.opts.min = 1

      setTimeout(function() {
        expect(pool.pool.length).to.equal(2)
        expect(pool.size).to.equal(2)

        pool.destroyResource(pool.pool[0])
        expect(pool.pool.length).to.equal(1)
        expect(pool.size).to.equal(2)

        setTimeout(function() {
          expect(pool.pool.length).to.equal(1)
          expect(pool.size).to.equal(1)
          done()
        }, 100)
      })
    })

    test('reject', function(done) {
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        destroy: function() {
          return new Promise(function(resolve, reject) {
            reject()
          })
        }
      })

      pool.opts.min = 1

      setTimeout(function() {
        expect(pool.pool.length).to.equal(2)
        expect(pool.size).to.equal(2)

        pool.destroyResource(pool.pool[0])
        expect(pool.pool.length).to.equal(1)
        expect(pool.size).to.equal(2)

        setTimeout(function() {
          expect(pool.pool.length).to.equal(1)
          expect(pool.size).to.equal(1)
          done()
        })
      })
    })

    test('timeout', function(done) {
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        destroy: function() {
          return new Promise(function() {})
        }
      })

      setTimeout(function() {
        expect(pool.pool.length).to.equal(2)
        expect(pool.size).to.equal(2)

        pool.on('fail', function onerror(err) {
          expect(err).to.be.an.instanceof(TimeoutError)
          pool.removeListener('fail', onerror)
          done()
        })
        pool.destroyResource(pool.pool[0])
      })
    })

    test('create after destroy if #resources < opts.min', function(done) {
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        destroy: function() {
          return new Promise(function(resolve, reject) {
            reject()
          })
        }
      })

      setTimeout(function() {
        pool.destroyResource(pool.pool[0])
        expect(pool.pool.length).to.equal(1)
        expect(pool.size).to.equal(2)

        pool.on('create', function oncreate() {
          pool.removeListener('create', oncreate)

          expect(pool.pool.length).to.equal(2)
          expect(pool.size).to.equal(2)
          done()
        })
      })
    })

  })

  suite('Acquisition', function() {

    test('passing check', function(done) {
      var checked = 0
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        check: function() {
          checked++
          return true
        }
      })

      setTimeout(function() {
        expect(pool.pool.length).to.equal(2)
        expect(pool.size).to.equal(2)

        var acquire = pool.acquire()

        acquire.then(function(resource) {
          expect(resource).to.be.an.instanceOf(Resource)
          expect(pool.pool.length).to.equal(1)
          expect(pool.size).to.equal(2)
          expect(checked).to.equal(1)

          pool.acquire(function(err, resource) {
            expect(err).to.be.not.exist
            expect(resource).to.be.an.instanceOf(Resource)
            expect(pool.pool.length).to.equal(0)
            expect(pool.size).to.equal(2)
            expect(checked).to.equal(2)

            done()
          })
        })

        .catch(done)
      })
    })

    test('failing check', function(done) {
      var checked = 0
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        check: function() {
          return ++checked > 1
        }
      })

      setTimeout(function() {
        expect(pool.pool.length).to.equal(2)
        expect(pool.size).to.equal(2)

        pool.opts.min = 0

        pool.acquire(function(err, resource) {
          expect(resource).to.be.an.instanceOf(Resource)
          expect(pool.pool.length).to.equal(0)
          expect(pool.size).to.equal(1)

          done()
        })
      })
    })

    test('create if #resources < opts.max', function(done) {
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        min: 0
      })

      setTimeout(function() {
        expect(pool.pool.length).to.equal(0)
        expect(pool.size).to.equal(0)

        pool.acquire(function(err, resource) {
          expect(resource).to.be.an.instanceOf(Resource)
          expect(pool.pool.length).to.equal(0)
          expect(pool.size).to.equal(1)

          done()
        })
      })
    })

    test('wait', function(done) {
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        min: 1,
        max: 1
      })

      setTimeout(function() {
        expect(pool.pool.length).to.equal(1)
        expect(pool.size).to.equal(1)

        pool.acquire(function(err, resource) {
          expect(resource).to.be.an.instanceOf(Resource)
          expect(pool.pool.length).to.equal(0)
          expect(pool.size).to.equal(1)

          pool.acquire(function() {})

          expect(pool.queue).to.have.lengthOf(1)
          done()
        })
      })
    })

    test('timeout', function(done) {
      var pool = new Pool({
        create: function() {
          return new Promise(function() {
            // never ...
          })
        },
        min: 0,
        acquisitionTimeout: 500
      })

      pool.acquire()
      .catch(function(err) {
        expect(err).to.be.an.instanceOf(TimeoutError)

        // with callback
        pool.acquire(function(err, resource) {
          expect(err).to.be.an.instanceOf(TimeoutError)
          expect(resource).to.not.exist
          done()
        })
      })
    })

  })

  suite('Releasing', function() {

    test('add back', function(done) {
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        min: 1,
        max: 1
      })

      setTimeout(function() {
        expect(pool.pool.length).to.equal(1)
        expect(pool.size).to.equal(1)

        pool.acquire(function(err, resource) {
          expect(resource).to.be.an.instanceOf(Resource)
          expect(pool.pool.length).to.equal(0)
          expect(pool.size).to.equal(1)

          pool.release(resource)

          setTimeout(function() {
            expect(pool.pool.length).to.equal(1)
            expect(pool.size).to.equal(1)

            done()
          })
        })
      })
    })

    test('forward', function(done) {
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        min: 1,
        max: 1
      })

      setTimeout(function() {
        expect(pool.pool.length).to.equal(1)
        expect(pool.size).to.equal(1)

        pool.acquire(function(err, resource) {
          expect(resource).to.be.an.instanceOf(Resource)
          expect(pool.pool.length).to.equal(0)
          expect(pool.size).to.equal(1)

          pool.acquire(function(err, res) {
            expect(resource).to.equal(res)
            expect(pool.pool.length).to.equal(0)
            expect(pool.size).to.equal(1)
            done()
          })

          expect(pool.queue).to.have.lengthOf(1)
          pool.release(resource)
        })
      })
    })

    test('check', function(done) {
      var checked = 0
      var pool = new Pool({
        create: function() {
          return new Resource
        },
        check: function() {
          return ++checked === 1
        },
        min: 1,
        max: 1
      })

      setTimeout(function() {
        expect(pool.pool.length).to.equal(1)
        expect(pool.size).to.equal(1)

        pool.acquire(function(err, resource) {
          expect(resource).to.be.an.instanceOf(Resource)
          expect(pool.pool.length).to.equal(0)
          expect(pool.size).to.equal(1)

          var spy = chai.spy()
          pool.on('destroy', spy)

          pool.opts.min = 0
          pool.release(resource)

          setTimeout(function() {
            expect(spy).to.have.been.called()
            expect(pool.pool.length).to.equal(0)
            expect(pool.size).to.equal(0)

            done()
          })
        })
      })
    })

  })

})

