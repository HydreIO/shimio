/* eslint-disable max-lines */
import stream from 'stream'
import { promisify } from 'util'
import events from 'events'
import { Client, Server } from '../src/index.js'

const pipeline = promisify(stream.pipeline)

let port = 20_000

export default class {
  static name = 'Shimio'
  static timeout = 1000
  static loop = 1

  #server
  #client
  #new_port
  #on_channel
  #allow_upgrade = () => true

  #yield_later = count =>
    async function *(data) {
      let i = 0

      while (++i <= count) {
        yield data
        await new Promise(resolve =>
          setTimeout(resolve, Math.random() * 5 | 0))
      }
    }

  constructor(cleanup) {
    const new_port = ++port
    const that = this

    this.#new_port = new_port

    this.#server = Server({
      allow_upgrade: () => that.#allow_upgrade(),
      on_channel   : channel => that.#on_channel(channel),
      timeout      : 20,
    })

    this.#client = new Client({
      host   : `ws://0.0.0.0:${ new_port }`,
      timeout: 10,
    })

    cleanup(async () => {
      this.#client.disconnect()
      await this.#server.close()
    })
  }

  async ['client timeout'](affirmation) {
    const affirm = affirmation(1)

    await this.#server.listen({ port: this.#new_port })
    await this.#client.connect()
    await this.#server.close()
    await new Promise(resolve => setTimeout(resolve, 50))
    affirm({
      that   : 'a shimio client',
      should : `timeout gracefully`,
      because: this.#client.connected,
      is     : false,
    })
  }

  async invariants(affirmation) {
    const affirm = affirmation(11)

    await this.#server.listen({ port: this.#new_port })
    await this.#client.connect()

    affirm({
      that   : 'a shimio client',
      should : `be able to connect to a shimio server`,
      because:
        this.#client.connected && this.#server.listening,
      is: true,
    })

    const failing_client = new Client({
      host   : `ws://0.0.0.0:${ this.#new_port }`,
      timeout: 10,
    })

    await failing_client.connect()
    failing_client.raw_socket.send('yo')
    await new Promise(resolve => setTimeout(resolve, 10))

    affirm({
      that   : 'a shimio server',
      should : `reject a socket sending non binary data`,
      because: failing_client.connected,
      is     : false,
    })

    failing_client.disconnect()

    const channel = this.#client.open_channel()

    affirm({
      that   : 'a shimio channel',
      should : `include a readable`,
      because: channel.readable.constructor.name,
      is     : 'AsyncGeneratorFunction',
    })

    affirm({
      that   : 'a shimio channel',
      should : `include a writable`,
      because: channel.writable.constructor.name,
      is     : 'AsyncFunction',
    })

    affirm({
      that   : 'a shimio channel',
      should : `include a read function`,
      because: channel.read.constructor.name,
      is     : 'AsyncFunction',
    })

    affirm({
      that   : 'a shimio channel',
      should : `include a write function`,
      because: channel.write.constructor.name,
      is     : 'AsyncFunction',
    })

    affirm({
      that   : 'a shimio channel',
      should : `include a passthrough function`,
      because: channel.passthrough.constructor.name,
      is     : 'AsyncGeneratorFunction',
    })

    await this.#client.connect()
    this.#client.raw_socket.send(Uint8Array.of(1))
    await new Promise(resolve => setTimeout(resolve, 10))

    affirm({
      that   : 'a shimio server',
      should : `close the socket in case of illegals packets`,
      because: this.#client.connected,
      is     : false,
    })

    this.#allow_upgrade = () => false
    try {
      await this.#client.connect()
    } catch (error) {
      affirm({
        that   : 'a shimio server',
        should : `refuse upgrade if the condition is falsy`,
        because: error.message,
        is     : 'socket hang up',
      })
    }

    this.#allow_upgrade = () => true
    await this.#client.connect()
    this.#client.raw_socket.send(Uint8Array.of(4))
    await new Promise(resolve => setTimeout(resolve, 10))

    const elon_chan = this.#client.open_channel()

    elon_chan.close()
    elon_chan.close()

    affirm({
      that   : 'closing a channel 2 times',
      should : `be a noop`,
      because: this.#client.connected,
      is     : false,
    })

    try {
      await elon_chan.write(Uint8Array.of(4))
    } catch (error) {
      affirm({
        that   : 'writing to a channel after his close',
        should : `throw an error`,
        because: error.message,
        is     : 'Channel closed',
      })
    }

    await new Promise(resolve => setTimeout(resolve, 10))
  }

  async ['Passing datas'](affirmation) {
    const affirm = affirmation(2)
    const through = new stream.PassThrough({
      objectMode: true,
    })

    this.#on_channel = async channel => {
      through.write(await channel.read())
    }

    await this.#server.listen({ port: this.#new_port })
    await this.#client.connect()

    const room = this.#client.open_channel()
    const data = Uint8Array.of(120)
    const read = events.once(through, 'data')

    try {
      await room.write('yo')
    } catch (error) {
      affirm({
        that   : 'writing non binary datas',
        should : `throw an error`,
        because: error.message,
        is     : 'chunk yo is not an Uint8Array',
      })
    }

    room.write(data).catch(() => {})

    const [datas] = await read

    affirm({
      that   : 'a client',
      should : 'be able to send message through a channel',
      because: Buffer.from(datas).toString(),
      is     : 'x',
    })
    room.close()
    await new Promise(resolve => setTimeout(resolve, 10))
    through.end()
  }

  async ['Dear Nagle'](affirmation) {
    const max = 100
    const affirm = affirmation(2 + max + max / 2)

    this.#on_channel = async channel => {
      const cleanup = new Promise(resolve => {
        channel.cleanup(() => {
          affirm({
            that   : 'a shimio channel',
            should : `will be cleaned up before end`,
            because: !resolve(),
            is     : true,
          })
        })
      })

      await pipeline(
          channel.readable.bind(channel),
          channel.writable.bind(channel),
      )
      await cleanup
    }

    await this.#server.listen({ port: this.#new_port })
    await this.#client.connect()

    const room_a = this.#client.open_channel()
    const room_b = this.#client.open_channel()
    const yield_data = this.#yield_later(max)

    let count = 0

    await Promise.all([
      pipeline(
          yield_data(Uint8Array.of(120)),
          room_a.passthrough.bind(room_a),
          async source => {
            for await (const chunk of source) {
              affirm({
                that   : 'datas',
                should : 'flow back to the channel A',
                because: Buffer.from(chunk).toString(),
                is     : 'x',
              })
              if (++count >= max / 2) room_a.close()
            }
          },
      ),
      pipeline(
          yield_data(Uint8Array.of(121)),
          room_b.passthrough.bind(room_b),
          async source => {
            for await (const chunk of source) {
              affirm({
                that   : 'datas',
                should : 'flow back to the channel B',
                because: Buffer.from(chunk).toString(),
                is     : 'y',
              })
            }
          },
      ),
    ])

    room_b.close()

    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
