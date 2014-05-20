'use strict'

var net = require('net')
var assert = require('assert')
var port = parseInt(process.argv[2], 10)

var server = net.createServer(port, function(socket) {
  socket.setEncoding('utf8')
  socket.on('data', function(data) {
    assert.equal(data, 'ping')
    socket.write('pong')
  })
})
server.listen(port, function() {
  console.log('Server is listening on port %d', port)
})