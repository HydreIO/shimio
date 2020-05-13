// globalThis should contains stuff
/* eslint-disable no-undef */
import { FRAMES } from './constant.js'

// these seems dumb to me but meh that's how web works
import AckEvent from './events/AckEvent.js'
import EndEvent from './events/EndEvent.js'
import DataEvent from './events/DataEvent.js'
import CloseEvent from './events/CloseEvent.js'

const pack
  = (
      // uInt8
      event,
      // uInt32
      id,
      // uInt8Array
      chunk,
  ) => {
    const buffer = new ArrayBuffer(5 + chunk.byteLength)
    const view = new DataView(buffer)

    view.setUint8(0, event)
    view.setUint32(1, id)

    const packet = new Uint8Array(buffer)

    packet.set(chunk, 5)
    return packet
  }

export default class Channel extends EventTarget {
  #ws
  #once_ack
  #once_chunk

  constructor(ws) {
    super()
    this.#ws = ws
    this.#once_ack = async () =>
      new Promise((resolve, reject) => {
        this.addEventListener(
            'ack', resolve, { once: true },
        )
        this.addEventListener(
            // we only want ack
            'data', reject, { once: true },
        )
        this.addEventListener(
            'end', reject, { once: true },
        )
      })
    this.#once_chunk = async () =>
      new Promise((resolve, reject) => {
        this.addEventListener(
            'data', resolve, { once: true },
        )
        this.addEventListener(
            // we only want datas
            'ack', reject, { once: true },
        )
        this.addEventListener(
            'end', reject, { once: true },
        )
      })
  }

  on_message(event, array) {
    switch (event) {
      case FRAMES.ACK:
        this.dispatchEvent(new AckEvent(this))
        break

      case FRAMES.DATA:
        this.dispatchEvent(new DataEvent(array, this))
        break

      case FRAMES.END:
        this.dispatchEvent(new EndEvent(this))
        break

      // no default
    }
  }

  close() {
    const packet
    = pack(
        FRAMES.END,
        count,
        new Uint8Array(),
    )

    this.#ws.send(packet)
    this.dispatchEvent(new CloseEvent(this))
  }

  async write(chunk) {
    const ack = this.#once_ack()
    const packet
    = pack(
        FRAMES.DATA,
        count,
        chunk,
    )

    this.#ws.send(packet)
    // wait for ack
    return ack
  }

  async read() {
    const data = this.#once_chunk()
    const packet
    = pack(
        FRAMES.ACK,
        count,
        new Uint8Array(),
    )

    this.#ws.send(packet)
    // wait for chunk
    return data
  }

  async writeable(source) {
    try {
      for await (const chunk of source)
        await this.write(chunk)
      this.close()
    } catch {
      this.dispatchEvent(new CloseEvent(this))
    }
  }

  async *readable() {
    try {
      for (; ;)
        yield await this.read()
    } catch {
      this.dispatchEvent(new CloseEvent(this))
    }
  }

  async [Symbol.asyncIterator](source) {
    this.writeable(source)
    return this.readable()
  }
}
