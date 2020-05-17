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
    // eslint-disable-next-line no-unused-vars
    request,
    next,
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
    next()
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
