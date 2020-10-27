/* eslint-disable max-lines */
import Doubt from '@hydre/doubt'
import reporter from 'tap-spec-emoji'
import { pipeline, PassThrough } from 'stream'
import ws from 'ws'
import Koa from 'koa'
import Server from '../src/Server.js'
import Client from '../src/Client.js'

// this should be allowed but it is a recent feature
// will see to bump the lint config
// eslint-disable-next-line no-undef
globalThis.WebSocket = ws

const through = new PassThrough()
const koa = new Koa()
const with_port = port => `ws://127.0.0.1:${ port }`
const write_some = async ({ channel, datas, count }) => {
  for (let index = 0; index < count; index++) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5 | 0))
    await channel.write(datas)
  }
}
const read_some = async ({ channel, count, test }) => {
  let loop = 0

  for await (const chunk of channel.read) {
    test(chunk)
    if (++loop >= count) channel.close()
  }
}

pipeline(through, reporter(), process.stdout, () => {})

const doubt = Doubt({
  stdout: through,
  title : 'Shimio websocket',
  calls : 46,
})
const server_1 = Server({
  koa,
  timeout   : 30000,
  on_upgrade: () => true,
  on_socket : ({ socket }) => {
    socket.on('channel', async channel => {
      for await (const chunk of channel.read) await channel.write(chunk)
    })
  },
  channel_limit: 50,
  threshold    : 4096,
  ws_options   : {
    path             : '/',
    perMessageDeflate: false,
    maxPayload       : 4096 * 4,
  },
  request_limit: {
    max  : 50,
    every: 1000,
  },
  time_between_connections: -1,
})
const client_1 = Client({
  host: with_port(5600),
})
const client_2 = Client({
  host: with_port(5600),
})

doubt['A client is not connected before being connected (lol)']({
  because: client_2.connected,
  is     : false,
})

await server_1.listen(5600)
await client_1.connect()
await client_2.connect()

doubt['A client is connected after being connected (yes i know)']({
  because: client_2.connected,
  is     : true,
})

doubt['Connecting a client twice is a noop']({
  because: await client_1.connect(),
  is     : undefined,
})

const read_write = ({ client_id, channel, char, count }) => [
  write_some({
    channel,
    count,
    datas: Uint8Array.of(char.charCodeAt(0)),
  }),
  read_some({
    channel,
    count,
    test: chunk => {
      doubt[
          `Channel<${ client_id }_${ channel.id }> \
correctly read sent datas (${ char })`
      ]({
        because: Buffer.from(chunk).toString(),
        is     : char,
      })
    },
  }),
]

await Promise.all([
  ...read_write({
    client_id: 1,
    channel  : await client_1.open_channel(),
    char     : 'a',
    count    : 10,
  }),
  ...read_write({
    client_id: 1,
    channel  : await client_1.open_channel(),
    char     : 'b',
    count    : 3,
  }),
  ...read_write({
    client_id: 2,
    channel  : await client_2.open_channel(),
    char     : 'c',
    count    : 7,
  }),
  ...read_write({
    client_id: 2,
    channel  : await client_2.open_channel(),
    char     : 'd',
    count    : 5,
  }),
])

client_1.disconnect()
client_2.disconnect()

await server_1.close()

let retried = 0

const client_3 = Client({
  host          : with_port(5000),
  threshold     : 4096,
  retry_strategy: async count => {
    client_3.connect()
    if (count === 3) {
      retried++
      await server_1.listen(5000)
      doubt['A client will reconnect after an unexpected close']({
        because: count,
        is     : 3,
      })
      if (retried === 2) {
        await new Promise(resolve => setTimeout(resolve, 100))
        await server_1.close()
        return undefined
      }
    }

    return 100
  },
})

client_3.on('disconnected', () => {
  doubt['A client notify unexpected close']({
    because: 0,
    is     : 0,
  })
})

await client_3.connect()
await server_1.close()

const client_4 = Client({
  host: with_port(3500),
})
const server_2 = Server({
  koa,
  timeout   : 30000,
  on_upgrade: () => true,
  on_socket : ({ socket }) => {
    socket.on('channel', async channel => {
      for await (const chunk of channel.read) await channel.write(chunk)
    })
  },
  channel_limit: 50,
  threshold    : 4096,
  ws_options   : {
    path             : '/',
    perMessageDeflate: false,
    maxPayload       : 4096 * 4,
  },
  request_limit: {
    max  : 50,
    every: 1000,
  },
  time_between_connections: -1,
})

await server_2.listen(3500)
await client_4.connect()

const channel_4 = await client_4.open_channel()

try {
  await channel_4.write('e')
} catch (error) {
  doubt['A client have to send Uint8Arrays only']({
    because: error.message,
    is     : 'chunk e is not an Uint8Array',
  })
}

// eslint-disable-next-line no-undef
const ws_1003 = new WebSocket(with_port(3500))

await new Promise(resolve => {
  ws_1003.addEventListener('open', resolve, { once: true })
})
ws_1003.send('awdwdw')
await new Promise(resolve => {
  ws_1003.addEventListener(
      'close',
      ({ code }) => {
        doubt['A hacking client will be closed with a code 1003']({
          because: code,
          is     : 1003,
        })
        resolve()
      },
      { once: true },
  )
})

// eslint-disable-next-line no-undef
const ws_frame = new WebSocket(with_port(3500))

await new Promise(resolve => {
  ws_frame.addEventListener('open', resolve, { once: true })
})
ws_frame.send(Uint8Array.from([9, 8, 7]))
await new Promise(resolve => {
  ws_frame.addEventListener(
      'close',
      ({ code }) => {
        doubt['A frame hacking client will be closed with a code 1003']({
          because: code,
          is     : 1003,
        })
        resolve()
      },
      { once: true },
  )
})

// eslint-disable-next-line no-undef
const ws_frame_2 = new WebSocket(with_port(3500))

await new Promise(resolve => {
  ws_frame_2.addEventListener('open', resolve, { once: true })
})
ws_frame_2.send(Uint8Array.from([1, 7]))
await new Promise(resolve => {
  ws_frame_2.addEventListener(
      'close',
      ({ code }) => {
        doubt['A frame hacking client will be closed with a code 1002']({
          because: code,
          is     : 1002,
        })
        resolve()
      },
      { once: true },
  )
})
await server_2.close()

const server_3 = Server({
  koa,
  timeout   : 30000,
  on_upgrade: () => false,
})

await server_3.listen(6952)

const client_5 = Client({
  host: with_port(6952),
})

client_5.on('disconnected', async code => {
  doubt['A refused client will be dropped']({
    because: code,
    is     : 1006,
  })
  await server_3.close()
})

client_5.connect()

const server_15 = Server({
  koa,
  timeout   : 30000,
  on_upgrade: () => true,
  on_socket : ({ socket }) => {
    socket.on('channel', async channel => {
      for await (const chunk of channel.read) await channel.write(chunk)
    })
  },
  request_limit: {
    max  : 1,
    every: 1,
  },
  time_between_connections: -1,
})

await server_15.listen(6525)

const client_15 = Client({
  host: with_port(6525),
})

client_15.on('disconnected', async code => {
  doubt['A spamming client will be dropped']({
    because: code,
    is     : 4005,
  })
  await server_15.close()
})

client_15.connect()

const channel_15 = await client_15.open_channel()

await write_some({
  channel: channel_15,
  datas  : Uint8Array.of(97),
  count  : 5,
})

const server_4 = Server({
  koa,
  timeout      : 5,
  on_upgrade   : () => true,
  channel_limit: 2,
  request_limit: {
    max  : 50,
    every: 1000,
  },
  time_between_connections: -1,
})
const client_6 = Client({
  host: with_port(4507),
})

await server_4.listen(4507)

await client_6.connect()
await new Promise(resolve => setTimeout(resolve, 10))

const channel_6_1 = await client_6.open_channel()
const channel_6_2 = await client_6.open_channel()
const channel_6_3 = await client_6.open_channel()

client_6.on('disconnected', async code => {
  doubt['A client openning too much channels will be droped']({
    because: code,
    is     : 1002,
  })
  await server_4.close()
})
server_4.on('close', () => {
  doubt['A server is 1-1 with node a node http server']({
    because: 'kaaris',
    is     : 'kaaris',
  })
})
await channel_6_1.write(Uint8Array.of(1))
await channel_6_2.write(Uint8Array.of(1))
await channel_6_3.write(Uint8Array.of(1))
