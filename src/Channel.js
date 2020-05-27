// globalThis should contains stuff
/* eslint-disable no-undef */
import { FRAMES, SOCKET_OPEN } from './constant.js'
import serialize from './serialize.js'

export default class Channel {
  #id
  #ws
  #once_ack
  #once_chunk

  // we don't want to send an ack on the first read
  #first_read = true
  #closed

  #resolve_write
  #reject_write
  #resolve_read
  #reject_read

  #cleanup

  constructor(ws, id) {
    this.#id = id
    this.#ws = ws
  }

  cleanup(f) {
    this.#cleanup = f
  }

  on_message(event, array) {
    switch (event) {
      case FRAMES.ACK:
        this.#resolve_write?.()
        break

      case FRAMES.DATA:
        this.#resolve_read?.(array)
        break

      case FRAMES.END:
        this.#cleanup?.()
        if (this.#closed) break
        this.#reject_read?.(new Error('received END'))
        this.#reject_write?.(new Error('received END'))
        break

      // no default
    }
  }

  close() {
    if (this.#closed) return
    this.#closed = true
    this.#reject_read?.(new Error('Channel closed'))
    this.#reject_write?.(new Error('Channel closed'))

    const packet = serialize(
        FRAMES.END,
        this.#id,
        new Uint8Array(),
    )

    if (this.#ws.readyState === SOCKET_OPEN)
      this.#ws.send(packet, true)
  }

  async write(chunk) {
    const that = this
    const ack = new Promise((resolve, reject) => {
      if (that.#closed) reject(new Error('Channel closed'))
      that.#resolve_write = resolve
      that.#reject_write = reject
    })
    const packet = serialize(FRAMES.DATA, this.#id, chunk)

    this.#ws.send(packet, true)
    return ack
  }

  async read() {
    const that = this
    const chunk = new Promise((resolve, reject) => {
      if (that.#closed) reject(new Error('Channel closed'))
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

      this.#ws.send(packet, true)
    }

    return chunk
  }

  async writable(source) {
    try {
      for await (const chunk of source)
        await this.write(chunk)
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
