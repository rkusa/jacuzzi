/*global suite, before, bench, after, set*/
/*eslint max-nested-callbacks: 0*/

'use strict'

var net = require('net')
var assert = require('assert')
var Pool = require('../').Pool
var Promise = GLOBAL.Promise || require('es6-promise').Promise
var port = process.env.PORT || 4000
var server, pool

suite('jacuzzi', function () {
  set('iterations', 1000)
  set('concurrency', 100)
  // set('type', 'static')

  before(function(done) {
    server = net.createServer(port, function(socket) {
      socket.setEncoding('utf8')
      socket.on('data', function(data) {
        assert.equal(data, 'ping')
        socket.write('pong')
      })
    })
    server.listen(port, done)
  })

  before(function() {
    pool = new Pool({
      max: 10,
      create: function() {
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
          socket.end(resolve)
        })
      }
    })
  })

  bench('naive approach (1 conn / request)', function(next) {
    var socket = net.connect(port, function() {
      socket.write('ping')
    })
    socket.setEncoding('utf8')
    socket.on('data', function(data) {
      assert.equal(data, 'pong')
      socket.end(next)
    })
  })

  bench('jacuzzi connection pool', function(next) {
    pool.acquire(function(socket) {
      // console.log(arguments)
      socket.on('data', function ondata(data) {
        socket.removeListener('data', ondata)
        assert.equal(data, 'pong')
        pool.release(socket)
        next()
      })
      socket.write('ping')
    })
  })

  after(function(done) {
    server.close(done)
    pool.drain()
  })
})