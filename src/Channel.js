// globalThis should contains stuff
/* eslint-disable no-undef */
import { FRAMES, SOCKET_OPEN } from './constant.js'
import serialize from './serialize.js'

export default class Channel {
  #id
  #ws
  #label // unused value for debugging purposes

  #free_write
  #free_read
  #free_channel

  // we don't want to send an ack on the first read
  #first_read = true
  #closed
  #closing

  #awaiting_ack = false
  #awaiting_datas = false

  constructor(ws, id, label = 'none') {
    const that = this

    this.#id = id
    this.#ws = ws
    this.#label = label
    this.#closing = new Promise(resolve => {
      that.#free_channel = () => {
        that.#closed = true
        resolve()
      }
    })
  }

  on_message(event, array) {
    switch (event) {
      case FRAMES.ACK:
        if (this.#awaiting_ack) this.#free_write()
        else this.#free_channel()
        break

      case FRAMES.DATA:
        if (this.#awaiting_datas) this.#free_read(array)
        else this.#free_channel()
        break

      case FRAMES.END:
        if (!this.#closed) this.#free_channel()
        break

      // no default
    }
  }

  close() {
    if (this.#closed) return
    this.#free_channel()

    const packet = serialize(
        FRAMES.END,
        this.#id,
        new Uint8Array(),
    )

    if (this.#ws.readyState === SOCKET_OPEN)
      this.#ws.send(packet, true)
  }

  static #resolve_free_write(this_arg) {
    return new Promise(resolve => {
      this_arg.#free_write = () => {
        resolve(true)
      }
    })
  }

  static #resolve_free_read(this_arg) {
    return new Promise(resolve => {
      this_arg.#free_read = resolve
    })
  }

  async write(chunk) {
    if (this.#closed)
      throw new Error('[shimio] Write after close.')

    const ack_or_end = [
      this.#closing, Channel.#resolve_free_write(this),
    ]
    const ack = Promise.race(ack_or_end)
    const packet = serialize(FRAMES.DATA, this.#id, chunk)

    this.#awaiting_ack = true
    this.#ws.send(packet, true)
    await ack
    this.#awaiting_ack = false
  }

  async read() {
    if (this.#closed)
      throw new Error('[shimio] Read after close.')
    this.#awaiting_datas = true

    const chunk_or_end = [
      this.#closing, Channel.#resolve_free_read(this),
    ]
    const chunk = Promise.race(chunk_or_end)

    // sending ack only for all others reads
    if (this.#first_read) this.#first_read = false
    else {
      this.#ws.send(
          serialize(FRAMES.ACK, this.#id, new Uint8Array()),
          true,
      )
    }

    const datas = await chunk

    this.#awaiting_datas = false
    return datas
  }

  async writable(source) {
    for await (const chunk of source) {
      await this.write(chunk)
      if (this.#closed) return
    }
  }

  async *readable() {
    for (;;) {
      const chunk = await this.read()

      if (chunk) yield chunk
      else return
    }
  }

  passthrough(source) {
    const that = this

    return {
      [Symbol.asyncIterator]: () => {
        that.writable(source)
        return {
          next: async () => {
            const value = await that.read()

            return {
              value,
              done: !value,
            }
          },
          return: () => {
            that.#free_channel()
            return { done: true }
          },
        }
      },
    }
  }
}
