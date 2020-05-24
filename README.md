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

<h3 align=center>Multiplex Node.js streams over WebSockets (Nagle algorithm)</h3>

> This readme is a WIP

## Install

```sh
npm install @hydre/shimio
```

## Usage

see /example/index.js for client usage in node

```js
import { Server, Client } from '../src/index.js'
import stream from 'stream'
import { promisify } from 'util'
import fs from 'fs'
import Koa from 'koa'

const pipeline = promisify(stream.pipeline)
const read = fs.createReadStream('example/hello.txt', { highWaterMark: 2000 })
const write = fs.createWriteStream('example/world.txt')
const client = new Client({ host: 'ws://0.0.0.0:3000' })
const server = Server({
  http_server  : http.createServer(new Koa().callback()), // optional
  allow_upgrade: ({ request, socket, head, context }) => true, // auth
  timeout      : 30_000, // clients timeout
  ws_options   : { // see [WS](https://github.com/websockets/ws)
    path             : '/',
    perMessageDeflate: false,
    maxPayload       : 4096 * 4,
  },
  on_socket({ socket, request, context }) {
    ws.on('channel', async channel => {
      await pipeline(
          channel.readable.bind(channel),
          channel.writable.bind(channel),
      )
    })
  },
})

await server.listen(3000) // promisified
await client.connect()

const channel_a = client.open_channel() // noop
const round_trip = channel_a.passthrough.bind(channel_a)

await pipeline(read, round_trip, write)
client.disconnect()
await server.close() // promisified (and destroy any connected ws)
```