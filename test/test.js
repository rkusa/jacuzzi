/*eslint-env node, mocha */
/*eslint handle-callback-err:0, max-nested-callbacks:[2, 4], no-unused-expressions:0 */

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
          return new Promise(function(resolve) {
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

    test('return', function(done) {
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

          expect(pool.pool.length).to.equal(1)
          expect(pool.size).to.equal(1)

          done()
        })
      })
    })

  })

})

var Balancer = require('../lib/').Balancer

suite('Balancer', function() {
  var first, second, third

  suiteSetup(function(done) {
    var count = 3, cb = function() {
      if (--count === 0) done()
    }

    function handler(socket) {
      socket.setEncoding('utf8')
      socket.on('data', function(data) {
        expect(data).to.equal('ping')
        socket.write('pong')
      })
    }

    first = net.createServer(handler)
    first.listen(4001, cb)

    second = net.createServer(handler)
    second.listen(4002, cb)

    third = net.createServer(handler)
    third.listen(4003, cb)
  })

  suiteTeardown(function() {
    first.close()
    second.close()
    third.close()
  })

  var balancer, a, b, c
  var opts = {
    min: 0,
    max: 2,
    // acquisitionTimeout: 50,
    create: function(port) {
      return new Promise(function(resolve) {
        var socket = net.connect(port, function() {
          resolve(socket)
        })
        socket.setEncoding('utf8')
        socket.setTimeout(300000)
      })
    },
    destroy: function(socket) {
      return new Promise(function(resolve) {
        if (!socket.localPort) resolve()
        else socket.end(resolve)
      })
    },
    check: function(socket) {
      return !!socket.localPort
    }
  }

  test('instantiation', function() {
    balancer = new Balancer

    balancer.add(a = new Pool('4001', opts, 4001), 1)
    balancer.add(b = new Pool('4002', opts, 4002), 2)
    balancer.add(c = new Pool('4003', opts, 4003), 2)
  })

  test('balancing', function() {
    expect(balancer.next()).to.equal(a)
    expect(balancer.next()).to.equal(a)
    expect(balancer.next()).to.equal(a)

    a.healthy = false

    expect(balancer.next()).to.equal(b)
    expect(balancer.next()).to.equal(c)
    expect(balancer.next()).to.equal(b)
    expect(balancer.next()).to.equal(c)
    expect(balancer.next()).to.equal(b)
    expect(balancer.next()).to.equal(c)

    a.healthy = true

    expect(balancer.next()).to.equal(a)
  })

  test('acquire', function(done) {
    balancer.acquire(function(err, resource) {
      expect(err).to.not.exist
      expect(resource).to.be.an.instanceOf(net.Socket)
      balancer.release(resource)
      done()
    })
  })

  test('release', function(done) {
    expect(a.size).to.equal(1)
    expect(a.pool).to.have.lengthOf(1)
    a.pool[0].end()
    setTimeout(done, 500)
  })

  test('fail create -> mark pool as unhealthy', function(done) {
    a.opts.create = function() {
      return new Promise(function(resolve, reject) {
        reject()
      })
    }
    balancer.opts.check = function() {
      return false
    }

    balancer.acquire(function(err, resource) {
      expect(resource.remotePort).to.equal(4002)
      expect(a.size).to.equal(0)
      expect(a.pool).to.have.lengthOf(0)
      expect(a.healthy).to.be.not.ok
      done()
    })
  })

  test('monitor unhealthy pool', function(done) {
    balancer.opts.check = function() {
      return true
    }
    setTimeout(function() {
      expect(a.healthy).to.be.ok
      done()
    }, 100)
  })

  test('all down', function(done) {
    a.healthy = b.healthy = c.healthy = false
    balancer.opts.check = function() {
      return false
    }

    balancer.acquire(function(err, resource) {
      expect(err).to.exist
      expect(err).to.be.an.instanceof(Balancer.UnavailableError)
      expect(err.message).to.equal('All servers are down')
      expect(resource).to.not.exist
      done()
    })
  })

  test('acquire with no pool', function(done) {
    var b = new Balancer
    b.acquire(function(err, resource) {
      expect(err).to.exist
      expect(err.message).to.equal('Balancer is empty - add pools first: `balancer.add(new Pool(...))`')
      expect(resource).to.not.exist
      done()
    })
  })
})