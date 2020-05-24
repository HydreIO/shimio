import { Server, Client } from '../src/index.js'
import stream from 'stream'
import { promisify } from 'util'
import fs from 'fs'

const pipeline = promisify(stream.pipeline)
const read = fs.createReadStream('example/hello.txt', {
  highWaterMark: 2000,
})
const write = fs.createWriteStream('example/world.txt')
const client = new Client({ host: 'ws://0.0.0.0:3000' })
const server = Server({
  allow_upgrade: () => true,
  async on_channel(channel) {
    await pipeline(
        channel.readable.bind(channel),
        channel.writable.bind(channel),
    )
  },
  timeout: 20,
})

await server.listen(3000)
await client.connect()

const channel_a = client.open_channel() // noop
const round_trip = channel_a.passthrough.bind(channel_a)

await pipeline(read, round_trip, write)
client.disconnect()
await server.close()
