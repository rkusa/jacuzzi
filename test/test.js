/*global suite, test, suiteSetup */

var expect = require('chai').expect
var Pool = require('../lib/').Pool
var net = require('net')
var utils = require('../lib/utils')
var TimeoutError = utils.TimeoutError

suite('Pool', function() {

  suiteSetup(function(done) {
    var server = net.createServer()
    server.listen(4001, done)
  })

  test('instantiation', function() {
    var resource = {}
    var pool = new Pool({
      create: function() {
        return resource
      },
    })

    setImmediate(function() {
      expect(pool.resources).to.have.lengthOf(2)
      expect(pool.resourcesCount).to.equal(2)
      pool.resources.forEach(function(resource) {
        expect(resource).to.equal(resource)
      })
    })

  })

  test('instantiation with Promises', function(done) {
    var resource = {}
    var pool = new Pool({
      create: function() {
        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve(resource)
          }, 50)
        })
      }
    })

    expect(pool.resources).to.have.lengthOf(0)
    expect(pool.resourcesCount).to.equal(2)
    setTimeout(function() {
      expect(pool.resources).to.have.lengthOf(2)
      expect(pool.resourcesCount).to.equal(2)
      done()
    }, 200)

  })

  test('creation retry', function(done) {
    var count = 0
    var resource = {}
    var pool = new Pool({
      create: function() {
        return new Promise(function(resolve, reject) {
          if (++count < 6) return reject()
          resolve(resource)
        })
      }
    })

    expect(pool.resources).to.have.lengthOf(0)
    expect(pool.resourcesCount).to.equal(2)
    setTimeout(function() {
      expect(pool.resources).to.have.lengthOf(2)
      expect(pool.resourcesCount).to.equal(2)
      done()
    }, 300)
  })

  test('destroy promise', function(done) {
    var resource = {}
    var pool = new Pool({
      create: function() {
        return resource
      },
      destroy: function() {
        return new Promise(function(resolve) {
          setTimeout(resolve, 50)
        })
      }
    })

    setImmediate(function() {
      expect(pool.resources).to.have.lengthOf(2)
      expect(pool.resourcesCount).to.equal(2)

      pool.destroyResource(resource)
      expect(pool.resources).to.have.lengthOf(1)
      expect(pool.resourcesCount).to.equal(2)

      setTimeout(function() {
        expect(pool.resources).to.have.lengthOf(1)
        expect(pool.resourcesCount).to.equal(1)
        done()
      }, 100)
    })
  })

  test('destroy timeout', function(done) {
    var resource = {}
    var pool = new Pool({
      create: function() {
        return resource
      },
      destroy: function() {
        return new Promise(function() {})
      }
    })

    setImmediate(function() {
      expect(pool.resources).to.have.lengthOf(2)
      expect(pool.resourcesCount).to.equal(2)

      pool.on('error', function onerror(err) {
        expect(err).to.be.an.instanceof(TimeoutError)
        pool.removeListener('error', onerror)
        done()
      })
      pool.destroyResource(resource)
    })
  })

})