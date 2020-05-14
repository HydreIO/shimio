// globalThis should contains stuff
/* eslint-disable no-undef */
import { FRAMES } from './constant.js'
import serialize from './serialize.js'

export default class Channel extends EventTarget {
  #id
  #ws
  #once_ack
  #once_chunk

  #log
  // we don't want to send an ack on the first read
  #first_read = true
  #closed

  #resolve_write
  #reject_write
  #resolve_read
  #reject_read

  constructor(
      ws, id, log,
  ) {
    super()
    this.#id = id
    this.#ws = ws
    this.#log = log.extend(`channel<${ id }>`)
  }

  on_message(
      event, array,
  ) {
    switch (event) {
      case FRAMES.ACK:
        this.#log('receiving ACK')
        this.#resolve_write()
        break

      case FRAMES.DATA:
        this.#log('receiving DATA')
        this.#resolve_read(array)
        break

      case FRAMES.END:
        this.#log('receiving END')
        this.#reject_read()
        this.#reject_write()
        break

      // no default
    }
  }

  close() {
    if (this.#closed) return
    this.#closed = true
    this.#reject_read()
    this.#reject_write()

    const packet = serialize(
        FRAMES.END,
        this.#id,
        new Uint8Array(),
    )

    this.#log('sending end')
    this.#ws.send(
        packet,
        true,
    )
  }

  async write(chunk) {
    const that = this
    const ack = new Promise((
        resolve, reject,
    ) => {
      that.#resolve_write = resolve
      that.#reject_write = reject
    })
    const packet = serialize(
        FRAMES.DATA,
        this.#id,
        chunk,
    )

    this.#log(
        'sending datas %O',
        chunk,
    )
    this.#ws.send(
        packet,
        true,
    )
    this.#log('awaiting ack')
    return ack
  }

  async read() {
    const that = this
    const chunk = new Promise((
        resolve, reject,
    ) => {
      that.#resolve_read = resolve
      that.#reject_read = reject
    })

    // sending ack only for all others reads
    if (this.#first_read) this.#first_read = false
    else {
      const packet = serialize(
          FRAMES.ACK,
          this.#id,
          new Uint8Array(),
      )

      this.#log('sending ack')
      this.#ws.send(
          packet,
          true,
      )
    }

    this.#log('listening for datas')
    return chunk
  }

  async writable(source) {
    try {
      for await (const chunk of source)
        await this.write(chunk)
      this.#log('normal end writable')
      this.close()
    } catch {}
  }

  async *readable() {
    try {
      for (;;) yield await this.read()
    } catch {}
  }

  async *passthrough(source) {
    this.writable(source)
    yield* this.readable()
  }
}
