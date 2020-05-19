import Channel from './Channel.js'
import { SOCKET_OPEN } from './constant.js'
import parse from './parse.js'
import debug from 'debug'

// can't define browser websocket in node
// eslint-disable-next-line no-use-before-define
export default class ShimioClient {
  #ws
  #host
  #timeout
  #channel_count
  #channels

  #pong_once
  #keep_alive
  #notify_close
  #on_message

  #log = debug('shimio').extend('client')

  constructor({ host, timeout = 31_000 }) {
    this.#host = host
    this.#timeout = timeout

    // awaiting ecma private method support
    // to move this inside prototype
    this.#pong_once = async () => {
      const ws = this.#ws

      return new Promise(resolve => {
        ws.addEventListener('pong', resolve, { once: true })
      })
    }

    this.#on_message = ({ data }) => {
      const { event, channel_id, chunk } = parse(data)
      const channel = this.#channels.get(channel_id)

      if (!channel)
        throw new Error(`received unknown channel with id ${ channel_id }`)


      channel.on_message(event, chunk)
    }

    this.#keep_alive = async () => {
      if (!this.connected) return
      this.#ws.ping()

      const race_timeout = this.#timeout

      try {
        await Promise.race([
          this.#pong_once(),
          new Promise((_, reject) =>
            setTimeout(reject, race_timeout)),
        ])
        setTimeout(
            this.#keep_alive.bind(this),
            race_timeout,
        )
      } catch {
        this.#ws?.terminate()
      }
    }
  }

  get raw_socket() {
    return this.#ws
  }

  get connected() {
    if (!this.#ws) return false
    return this.#ws.readyState === SOCKET_OPEN
  }

  async connect() {
    if (this.connected) return

    // globalThis environment should contain WebSocket
    // eslint-disable-next-line no-undef
    this.#ws = new WebSocket(this.#host)
    this.#ws.binaryType = 'arraybuffer'
    this.#channels = new Map()
    await new Promise((resolve, reject) => {
      this.#ws.addEventListener(
          'message',
          this.#on_message.bind(this),
      )
      this.#ws.addEventListener('open', resolve)
      this.#ws.addEventListener('error', reject)
    })
    this.#channel_count = -1
    this.#keep_alive()
  }

  disconnect() {
    if (!this.connected) return
    this.#ws.close(1000, 'closed by client')
    this.#ws = undefined
  }

  open_channel() {
    const count = ++this.#channel_count
    const channel = new Channel(this.#ws, count, this.#log)

    this.#channels.set(count, channel)
    return channel
  }
}
