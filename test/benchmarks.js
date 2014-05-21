/*global suite, before, bench, after, set*/
/*eslint max-nested-callbacks: 0*/

'use strict'

var net = require('net')
var path = require('path')
var spawn = require('child_process').spawn
var assert = require('assert')
var Pool = require('../').Pool
var Balancer = require('../').Balancer
var Promise = GLOBAL.Promise || require('es6-promise').Promise

suite('jacuzzi', function () {
  set('iterations', 1000)
  set('concurrency', 100)
  // set('type', 'static')

  var pool, balancer, server1, server2, server3

  before(function(done) {
    server1 = spawn('node', [path.join(__dirname, 'server.js'), 4001], { stdio: 'inherit' })
    server2 = spawn('node', [path.join(__dirname, 'server.js'), 4002], { stdio: 'inherit' })
    server3 = spawn('node', [path.join(__dirname, 'server.js'), 4003], { stdio: 'inherit' })

    var opts = {
      min: 0,
      max: 10,
      acquisitionTimeout: 0,
      leakDetectionThreshold: 0,
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
      }
    }

    balancer = new Balancer
    balancer.add(pool = new Pool('Server1', opts, 4001), 1)
    balancer.add(new Pool('Server2', opts, 4002), 1)
    balancer.add(new Pool('Server3', opts, 4003), 1)

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

  bench('jacuzzi balancer (2 servers)', function(next) {
    balancer.acquire(function(err, socket) {
      if (err) throw err
      socket.on('data', function ondata(data) {
        socket.removeListener('data', ondata)
        assert.equal(data, 'pong')
        balancer.release(socket)
        next()
      })
      socket.write('ping')
    })
  })

  after(function() {
    server1.kill()
    server2.kill()
    server3.kill()
    pool.drain()
  })

  process.on('exit', function() {
    server1.kill()
    server2.kill()
    server3.kill()
  })
})