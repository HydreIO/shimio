/* eslint-disable max-lines */
import stream from 'stream'
import events from 'events'
import Client from '../src/Client.js'
import Server from '../src/Server.js'

const default_allows = ({ context }) => {
  context.hello = 'world'
  return true
}

let port = 20_000

export default class {
  static name = 'Shimio'
  static timeout = 1500

  #server
  #client
  #new_port
  #on_channel
  #allow_upgrade = default_allows

  constructor(cleanup) {
    const new_port = ++port
    const that = this

    this.#new_port = new_port
    this.#server = Server({
      channel_limit: 3,
      allow_upgrade: (...parameters) =>
        that.#allow_upgrade(...parameters),
      on_socket: ({ socket, context }) => {
        socket.on('channel', channel => {
          that.#on_channel({
            channel,
            context,
          })
        })
      },
      timeout: 20,
    })

    this.#client = new Client({
      host          : `ws://0.0.0.0:${ new_port }`,
      retry_strategy: () => {},
    })

    cleanup(async () => {
      this.#client.disconnect()
      await this.#server.close()
    })
  }

  async ['channel close handler'](affirmation) {
    const affirm = affirmation(1)

    await this.#server.listen({ port: this.#new_port })
    await this.#client.connect()

    const channel = this.#client.open_channel()

    let verify = 1

    channel.on_close(() => {
      affirm({
        that   : 'a close handler',
        should : 'be called when the channel is closed',
        because: verify,
        is     : 2,
      })
    })
    verify = 2
    channel.close()
    verify = 3
    channel.close()
  }

  async ['channel limit'](affirmation) {
    const affirm = affirmation(2)

    this.#on_channel = async ({ channel }) => {
      for await (const chunk of channel.read)
        await channel.write(chunk)
    }

    await this.#server.listen({ port: this.#new_port })

    const handler = () => {
      affirm({
        that   : 'the connect listener',
        should : 'be called once',
        because: 0,
        is     : 0,
      })
    }

    this.#client.on('open', handler)
    await this.#client.connect()
    this.#client.off('open', handler)

    const chan = this.#client.open_channel.bind(this.#client)

    let index = 0

    while (++index < 5) await chan().write(Uint8Array.of(5))
    await new Promise(resolve => setTimeout(resolve, 50))
    affirm({
      that   : 'opening too much channels',
      should : 'kill the client',
      because: this.#client.connected,
      is     : false,
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
    const affirm = affirmation(7)

    await this.#server.listen({ port: this.#new_port })
    this.#on_channel = ({ context }) => {
      affirm({
        that   : 'a shimio context',
        should : `passthrough`,
        because: context.hello,
        is     : 'world',
      })
    }

    await this.#client.connect()
    await this.#client
        .open_channel()
        .write(Uint8Array.of(100))

    affirm({
      that   : 'a shimio client',
      should : 'be able to connect to a shimio server',
      because:
        this.#client.connected && this.#server.listening,
      is: true,
    })

    const failing_client = new Client({
      host          : `ws://0.0.0.0:${ this.#new_port }`,
      timeout       : 10,
      retry_strategy: () => {},
    })

    await failing_client.connect()
    failing_client.raw_socket.send('yo')
    await new Promise(resolve => setTimeout(resolve, 50))

    affirm({
      that   : 'a shimio server',
      should : `reject a socket sending non binary data`,
      because: failing_client.connected,
      is     : false,
    })

    failing_client.disconnect()

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

    this.#allow_upgrade = default_allows
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

    await elon_chan.write(Uint8Array.of(4))

    affirm({
      that   : 'writing to a channel after his close',
      should : `be a noop`,
      because: elon_chan.closed,
      is     : true,
    })

    await new Promise(resolve => setTimeout(resolve, 10))
  }

  async ['Retry strategy'](affirmation) {
    const affirm = affirmation(6)

    try {
      await new Client({
        host: 'ws://0.0.0.0:4800',
      }).connect()
    } catch (error) {
      affirm({
        that   : 'a client with no retry strategy',
        should : `end up giving up`,
        because: error.message,
        is     : 'connect ECONNREFUSED 0.0.0.0:4800',
      })
    }

    const client = new Client({
      host          : 'ws://0.0.0.0:4800',
      retry_strategy: ({ attempts }) => {
        if (attempts > 1) return undefined
        affirm({
          that   : 'a client loosing the connection',
          should : `use the retry strategy`,
          because: attempts,
          is     : 1,
        })
        return 50
      },
    })

    try {
      await client.connect()
    } catch (error) {
      affirm({
        that   : 'a client loosing the connection',
        should : `end up giving up`,
        because: error.message,
        is     : 'connect ECONNREFUSED 0.0.0.0:4800',
      })
    }

    client.disconnect()
    await this.#server.listen({ port: 4800 })

    const client_2 = new Client({
      host          : 'ws://0.0.0.0:4800',
      retry_strategy: ({ attempts }) => {
        if (attempts) return undefined
        affirm({
          that   : 'a client loosing the connection',
          should : `use the retry strategy`,
          because: attempts,
          is     : 0,
        })
        return 50
      },
    })

    await client_2.connect()

    const room = client_2.open_channel()

    this.#on_channel = async ({ channel }) => {
      for await (const chunk of channel.read) {
        affirm({
          that   : 'a client correctly connected',
          should : `be able to send messages`,
          because: Buffer.from(chunk).toString(),
          is     : 'x',
        })
        break
      }
    }

    await room.write(Uint8Array.of(120))
    await this.#server.close()
    await room.write(Uint8Array.of(120))
    await this.#server.listen({ port: 4800 })

    affirm({
      that   : 'a client loosing the connection',
      should : `correctly reconnect and do not throw an error`,
      because: 0,
      is     : 0,
    })
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  async ['Passing datas'](affirmation) {
    const affirm = affirmation(2)
    const through = new stream.PassThrough({
      objectMode: true,
    })

    this.#on_channel = async ({ channel }) => {
      for await (const chunk of channel.read)
        through.write(chunk)
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
    const max = 60
    const affirm = affirmation(max * 1.5)

    this.#on_channel = async ({ channel }) => {
      for await (const chunk of channel.read)
        await channel.write(chunk)
    }

    await this.#server.listen({ port: this.#new_port })
    await this.#client.connect()

    const write = async ({ channel, datas, count }) => {
      for (let i = 0; i < count; i++) {
        await new Promise(resolve =>
          setTimeout(resolve, Math.random() * 5 | 0))
        await channel.write(datas)
      }
    }
    const read = async ({ channel, char, count }) => {
      let loop = 0

      for await (const chunk of channel.read) {
        affirm({
          that   : 'datas',
          should : `flow back to the channel ${ char }`,
          because: Buffer.from(chunk).toString(),
          is     : char,
        })
        if (++loop >= count) channel.close()
      }
    }
    const room_a = this.#client.open_channel()
    const room_b = this.#client.open_channel()

    await Promise.all([
      write({
        channel: room_a,
        datas  : Uint8Array.of(120),
        count  : max / 2,
      }),
      read({
        channel: room_a,
        char   : 'x',
        count  : max / 2,
      }),
      write({
        channel: room_b,
        datas  : Uint8Array.of(121),
        count  : max,
      }),
      read({
        channel: room_b,
        char   : 'y',
        count  : max,
      }),
    ])
  }
}
