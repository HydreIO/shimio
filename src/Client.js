import Channel from './Channel.js'
import { SOCKET_OPEN } from './constant.js'
import parse from './parse.js'

// can't define browser websocket in node
// eslint-disable-next-line no-use-before-define
export default class ShimioClient {
  #ws
  #host
  #channel_count
  #channels

  #on_message
  #channels_threshold

  constructor({ host, channels_threshold = 4096 }) {
    this.#host = host
    this.#channels_threshold = channels_threshold

    // awaiting ecma private method support
    // to move this inside prototype
    this.#on_message = ({ data }) => {
      const { event, channel_id, chunk } = parse(data)
      const channel = this.#channels.get(channel_id)

      if (!channel)
        throw new Error(`received unknown channel with id ${ channel_id }`)


      channel.on_message(event, chunk)
    }
  }

  get raw_socket() {
    return this.#ws
  }

  get connected() {
    if (!this.#ws) return false
    return this.#ws.readyState === SOCKET_OPEN
  }

  async connect(options = {}) {
    if (this.connected) return
    // globalThis environment should contain WebSocket
    // eslint-disable-next-line no-undef
    this.#ws = new WebSocket(this.#host, undefined, options)
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
  }

  disconnect() {
    if (!this.connected) return
    this.#ws.close(1000, 'closed by client')
    this.#ws = undefined
  }

  open_channel() {
    const count = ++this.#channel_count
    const channel = new Channel({
      ws       : this.#ws,
      id       : count,
      label    : 'client',
      threshold: this.#channels_threshold,
    })

    this.#channels.set(count, channel)
    return channel
  }
}
