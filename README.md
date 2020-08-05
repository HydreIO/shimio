<h1 align=center>@hydre/shimio</h1>
<p align=center>
  <img src="https://img.shields.io/github/license/hydreio/shimio.svg?style=for-the-badge" />
  <img src="https://img.shields.io/codecov/c/github/hydreio/shimio/edge?logo=codecov&style=for-the-badge"/>
  <a href="https://www.npmjs.com/package/@hydre/shimio">
    <img src="https://img.shields.io/npm/v/@hydre/shimio.svg?logo=npm&style=for-the-badge" />
  </a>
  <img src="https://img.shields.io/npm/dw/@hydre/shimio?logo=npm&style=for-the-badge" />
  <img src="https://img.shields.io/github/workflow/status/hydreio/shimio/CI?logo=Github&style=for-the-badge" />
</p>

<h3 align=center>A minimal multiplexed Websocket server and client</h3>

- [Install](#install)
- [Use](#use)
  - [Client](#client)
  - [Server](#server)

## Install

```sh
npm install @hydre/shimio
```

## Use

### Client

`threshold` represent the maximum WebSocket `bufferedAmount` length
before starting to delay write operations

The client emit 3 events

- `connected` when connected
- `disconnected` when disconnected
- `channel` when a new channel was openned

```js
import Client from '@hydre/shimio/client'

const client = Client({
    host: 'ws://0.0.0.0:3000',
    threshold: 4096,
    retry_strategy: attempts => 100 // retry connection every 100ms
  })

// possible to pass an option object for testing in nodejs
// see https://github.com/websockets/ws/blob/41b0f9b36749ca1498d22726d22f72233de1424a/lib/websocket.js#L445
await client.connect({
  headers: {}
})
```

open some channel (must be awaited but do not make any network request so it's free)

```js
const foo = await client.open_channel()
const bar = await client.open_channel()
const baz = await client.open_channel()
```

- write is an async function in which you have to pass an Uint8Array
- read is an async Iterable

A channel emit a `close` event

```js
await foo.write(Uint8Array.of(100))
await bar.write(Uint8Array.of(42))
await baz.write(Uint8Array.of(100))

for await const(chunk of bar.read)
  console.log(chunk) // Uint8Array<42>
```

### Server

```js
import Server from '@hydre/shimio/server'
import Koa from 'koa'

// not a Class
const server = Server({
  koa: new Koa(),
  timeout: 30_000, // dropping unresponding clients
  on_upgrade: ({ request, socket, head, context }) => true, // authentication
  on_socket : ({ socket, context }) => {
    // the client opened a channel (and wrote at least once)
    socket.on('channel', async channel => {
      // let's send back all datas transparently
      for await (const chunk of channel.read)
        await channel.write(chunk)
    })
  },
  channel_limit: 50, // prevent a client from openning too much channel (encoded on an Uint32 (4,294,967,295))
  threshold    : 4096, // max bufferedAmount before delaying writes
  ws_options   : { // @see https://github.com/websockets/ws
    path             : '/',
    perMessageDeflate: false,
    maxPayload       : 4096 * 4,
  },
  request_limit: { // 20 request max every 10s
    max  : 20,
    every: 1000 * 10,
  },
  time_between_connections: 1000 * 30, // min 30s between 2 connection for an ip
})

await server.listen(3000) // promisified for you folks
await server.close()
```
