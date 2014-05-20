# jacuzzi

  A generic resource pool and balancer.

  [![NPM](https://badge.fury.io/js/jacuzzi.svg)](https://npmjs.org/package/jacuzzi)
  [![Build Status](https://secure.travis-ci.org/rkusa/jacuzzi.svg)](http://travis-ci.org/rkusa/jacuzzi)


  Status: **don't use yet**

## Pool

  A Generic Resource Pool.

```js
  var Pool = require('jacuzzi').Pool
```

### new Pool([name], opts, [args...])

  Instantiates a new Pool. If given, the `name` is used for debugging purposes. The `args` provided after the `opts` argument are forwarded to the `opts.create` function.

  **Options:**

  - **name** (optional) - a name for the pool - useful for debugging purposes
  - **min** (default: 2) - minimum number of active resources in pool at any given time
  - **max** (default: 10) - maximum number of concurrently active resources
  - **create**([args...], [callback]) - a function that creates new resources (could return a new resource directly or a `Promise` or use the `callback` argument)
  - **destroy**(resource, callback) (optional) - a function that is used to destroy resources (could return a `Promise` or use the `callback` argument for asynchronous destruction)
  - **check**(resource, [callback]) (optional) - a function that is used to check a resource (should return a `true` if the resource is OK, or otherwise `false`; for asynchronous checks it could also return a `Promise` or use the `callback` argument)
  - **events** (default: close, end, error, timeout) - a list of events that are listened to on each resource and - if called - lead to the destruction of the resource
  - **creationTimeout** (default: 500ms) - a timeout (in ms) for the creation of a resource
  - **destructionTimeout** (default: 500ms) - a timeout (in ms) for the destruction of a resource
  - **acquisitionTimeout** (default: 10000) -  a timeout (in ms) for the acquisition of a resource
  - **leakDetectionThreshold** (default: 30.000) - an amount (in ms) of time that a resource can be in use out of the pool before a error is thrown indicating a possible resource leak. (0 = disabled)
  - **faultTolerance** (default: true) - whether failures while creating resources should be ignored and the creation retried or the errors returned and creation aborted

### pool.acquire([callback])

  This method is used to acquire / request a resource from the pool. It returns a `Promise`. As soon as there is a resource available, the `Promise` gets resolved and (if provided) the `callback` called.

### pool.release(resource)

  This method is used to release / return a `resource` back to the pool.

### pool.drain()

  Gracefully shut down the pool.

### Example

  Keep in mind that `jacuzzi` is generic, i.e., resources are not limited to sockets nor to connections!

```js
  var net = require('net')
  var Pool = require('jacuzzi').Pool

  var pool = new Pool({
    create: function(port, callback) {
      var socket = net.connect(4000, function() {
        callback(socket)
      })
      socket.setEncoding('utf8')
      socket.setTimeout(300000)
    },
    destroy: function(socket, callback) {
      if (!socket.localPort) callback()
      else socket.end(callback)
    },
    check: function(socket) {
      return !!socket.localPort
    }
  })

  pool.acquire(function(err, socket) {
    pool.release(socket)
  })
```

## Balancer

  A resource pool balancer.

```js
  var Balancer = require('jacuzzi').Balancer
```

### new Balancer(opts)

  Instantiates a new Balancer.

  **Options:**

  - **check**(resource, [callback]) (optional) - a function that is used to check a pool (should return a `true` if the pool is OK, or otherwise `false`; for asynchronous checks it could also return a `Promise` or use the `callback` argument)

### balancer.add(pool, priority)

  This method is used to add a pool to the balancer. The `priority` argument affects the scheduling. The lowest number for `priority` indicates the highest priority. Pools with lower priority are only selected, if the higher ones are down. Multiple pools with the same priority a scheduled First with Come First Serve.

  **Example:**

```js
  balancer.add(a, 1)
  balancer.add(b, 2)
  balancer.add(c, 3)

  balancer.acquire() // ~> a
  balancer.acquire() // ~> a
  balancer.acquire() // ~> a
  ...

  // a goes down

  balancer.acquire() // ~> b
  balancer.acquire() // ~> c
  balancer.acquire() // ~> b
  balancer.acquire() // ~> c
  ...
```

### balancer.acquire([callback])

  This method is used to acquire / request a resource from the balancer. It returns a `Promise`. As soon as there is a resource available, the `Promise` gets resolved and (if provided) the `callback` called.

### balancer.release(resource)

  This method is used to release / return a `resource` back to its pool.

### Example

  Keep in mind that `jacuzzi` is generic, i.e., resources are not limited to sockets nor to connections!

```js
  var net = require('net'), a, b, c
  var opts = {
    create: function(port, callback) {
      var socket = net.connect(port, function() {
        callback(socket)
      })
      socket.setEncoding('utf8')
      socket.setTimeout(300000)
    },
    destroy: function(socket, callback) {
      if (!socket.localPort) callback()
      else socket.end(callback)
    },
    check: function(socket) {
      return !!socket.localPort
    }
  }

  var Balancer = require('jacuzzi').Pool
  var balancer = new Balancer({
    check: function(pool) {
      // e.g. ping
      // pool.opts.args = [4001] (or 4002, 4003 respectively)
    }
  })

  balancer.add(a = new Pool('Pool A', opts, 4001), 1)
  balancer.add(b = new Pool('Pool B', opts, 4002), 2)
  balancer.add(c = new Pool('Pool C', opts, 4003), 2)

  balancer.acquire(function(err, socket) {
    balancer.release(socket)
  })
```

## MIT License

  Copyright (c) 2014 Markus Ast

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.