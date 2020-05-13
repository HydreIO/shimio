import stream from 'stream'
import { promisify } from 'util'

import {
  Client,
  Server,
} from '../src/index.js'

const pipeline = promisify(stream.pipeline)

let port = 20000

export default class {
  static name = 'Shimio'
  static timeout = 100

  #server
  #client

  #yield_later = count =>
    async function *(data) {
      let i = 0

      while (++i < count) {
        yield data
        await new Promise(resolve =>
          setTimeout(resolve, Math.random() * 5 | 0))
      }
    }

  constructor(cleanup) {
    const new_port = port++

    this.#server = new Server({
      port       : new_port,
      uws_options: {
        idleTimeout: 1,
      },
    })
    this.#client = new Client({
      host   : `ws://0.0.0.0:${ new_port }`,
      timeout: 10,
    })

    cleanup(() => {
      this.#client.disconnect()
      this.#server.stop()
    })
  }

  async invariants(affirmation) {
    const affirm = affirmation(6)

    await this.#server.listen()
    await this.#client.connect()

    affirm({
      that   : 'a shimio client',
      should : `be able to connect to a shimio server`,
      because: this.#client.connected,
      is     : true,
    })

    await new Promise(resolve => setTimeout(resolve, 10))
    this.#server.stop()
    await new Promise(resolve => setTimeout(resolve, 10))

    affirm({
      that   : 'a shimio client',
      should : `be disconnected when the server is closed`,
      because: this.#client.connected,
      is     : false,
    })

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
      because: channel.writeable.constructor.name,
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
  }
}
