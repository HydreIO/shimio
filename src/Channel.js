// globalThis should contains stuff
/* eslint-disable no-undef */
import { FRAMES, SOCKET_OPEN } from './constant.js'
import serialize from './serialize.js'
import EI from 'event-iterator/lib/event-iterator.js'

const { EventIterator } = EI

export default class Channel {
  #id
  #ws
  #label // unused value for debugging purposes
  #closed
  #threshold
  #push
  #stop

  constructor({ ws, id, label, threshold }) {
    this.#id = id
    this.#ws = ws
    this.#label = label
    this.#threshold = threshold
    this.read = new EventIterator(({ push, stop }) => {
      this.#push = push
      this.#stop = stop
      return () => {
        this.close()
      }
    })
  }

  /**
   * @returns weither or not the socket is not in a open state
   */
  get socket_closed() {
    return this.#ws.readyState !== SOCKET_OPEN
  }

  /**
   * @returns weither or not the channel or the socket is closed
   */
  get closed() {
    return this.#closed || this.socket_closed
  }

  get #overflowing() {
    return this.#ws.bufferedAmount > this.#threshold
  }

  async #drain() {
    while (this.#overflowing)
      await new Promise(resolve => setTimeout(resolve, 5))
  }

  on_message(event, array) {
    switch (event) {
      case FRAMES.DATA:
        this.#push(array)
        break

      case FRAMES.END:
        this.#stop?.()
        this.#closed = true
        break

      // no default
    }
  }

  /**
   * Close the channel and free ressources
   */
  close() {
    if (this.closed) return
    this.#closed = true
    this.#stop?.()
    if (!this.socket_closed) {
      this.#ws.send(
          serialize(FRAMES.END, this.#id, new Uint8Array()),
          true,
      )
    }
  }

  /**
   * Write an Uint8Array to the channel and block in case the
   * bufferedAmount is above threshold.
   * If the channel or the socket is closed, then write is a noop
   * @param {Uint8Array} chunk The chunk of data
   */
  async write(chunk) {
    if (this.closed) return
    await this.#drain()
    this.#ws.send(
        serialize(FRAMES.DATA, this.#id, chunk),
        true,
    )
  }
}
