/*global suite, before, bench, after, set*/
/*eslint max-nested-callbacks: 0*/

'use strict'

var net = require('net')
var path = require('path')
var spawn = require('child_process').spawn
var assert = require('assert')
var Pool = require('../').Pool
var Promise = GLOBAL.Promise || require('es6-promise').Promise

suite('jacuzzi', function () {
  set('iterations', 1000)
  set('concurrency', 100)
  set('type', 'static')

  var pool, server1

  before(function(done) {
    server1 = spawn('node', [path.join(__dirname, 'server.js'), 4001], { stdio: 'inherit' })

    pool = new Pool({
      min: 0,
      max: 10,
      acquisitionTimeout: 0,
      leakDetectionThreshold: 0,
      create: function() {
        return new Promise(function(resolve) {
          var socket = net.connect(4001, function() {
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

    setTimeout(done, 1000)
  })

  bench('naive approach (1 conn / request)', function(next) {
    var socket = net.connect(4001, function() {
      socket.write('ping')
    })
    socket.setEncoding('utf8')
    socket.on('data', function(data) {
      assert.equal(data, 'pong')
      socket.end(next)
    })
  })

  bench('jacuzzi connection pool', function(next) {
    pool.acquire(function(err, socket) {
      if (err) throw err
      socket.on('data', function ondata(data) {
        socket.removeListener('data', ondata)
        assert.equal(data, 'pong')
        pool.release(socket)
        next()
      })
      socket.write('ping')
    })
  })

  after(function() {
    server1.kill()
    pool.drain()
  })

  process.on('exit', function() {
    server1.kill()
  })
})