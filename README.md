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

<h3 align=center>A blazing fast websocket multiplexing therapy built on uWs</h3>

## Install

```sh
npm install @hydre/shimio
```

## Usage

see /example/index.js for client usage in node

```js
import {
  Server, Client,
} from '../src/index.js'
import stream from 'stream'
import { promisify } from 'util'
import fs from 'fs'

const pipeline = promisify(stream.pipeline)
const read = fs.createReadStream(
    'example/foo.jpg',
    {
      highWaterMark: 2000,
    },
)
const write = fs.createWriteStream('example/bar.jpg')
const main = async () => {
  const client = new Client({ host: 'ws://0.0.0.0:3000' })
  const server = new Server({
    port       : 3000,
    path       : '/',
    uws_options: {
      idleTimeout     : 30,
      compression     : 0,
      maxPayloadLength: 2048,
    },
  })

  server.use(({
    ws,
    request,
  }) => {
    ws.on(
        'channel',
        async channel => {
          await pipeline(
              channel.readable.bind(channel),
              channel.writable.bind(channel),
          )
        },
    )
  })

  await server.listen()
  await client.connect()

  const channel_a = client.open_channel() // noop
  const pass_through = channel_a.passthrough.bind(channel_a)

  await pipeline(
      read,
      pass_through,
      write,
  )
}

main()
```