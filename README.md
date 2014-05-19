# jacuzzi

  A generic resource pool and balancer.
  [![NPM](https://badge.fury.io/js/jacuzzi.svg)](https://npmjs.org/package/jacuzzi)
  [![Build Status](https://secure.travis-ci.org/rkusa/jacuzzi.svg)](http://travis-ci.org/rkusa/jacuzzi)

## Pool

  A Generic Resource Pool.

```js
  var pool = require('jacuzzi').Pool
```

### new Pool(opts)

  Instantiate a new Pool.

  **Options:**

  - **min** (default: 2) - minimum number of active resources in pool at any given time
  - **max** (default: 10) - maximum number of concurrently active resources
  - **create** - a function that creates new resources (could return a new resource directly or a `Promise`)
  - **destroy** - a function that is used to destroy resources (could return a `Promise` for asynchronous destruction)
  - **check** - a function that is used to check a resource (should return a `true` if the resource is OK, or otherwise `false`; for asynchronous checks it could also return a `Promise`)
  - **events** (default: close, end, error, timeout) - a list of events that are listened to on each resource and - if called - lead to the destruction of the resource
  - **creationTimeout** (default: 500ms) - a timeout (in ms) for the creation of a resource
  - **destructionTimeout** (default: 500ms) - a timeout (in ms) for the destruction of a resource
  - **leakDetectionThreshold** (default: 30.000) - an amount (in ms) of time that a resource can be in use out of the pool before a error is thrown indicating a possible resource leak. (0 = disabled)

### pool.acquire([callback])

  This method is used to acquire / request a resource from the pool. It returns a `Promise`. As soon as there is a resource available, the `Promise` gets resolved and (if provided) the `callback` called.

### pool.release(resource)

  This method is used to release / return a `resource` back to the pool.

### pool.drain()

  Gracefully shut down the pool.

## MIT License

  Copyright (c) 2014 Markus Ast

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.