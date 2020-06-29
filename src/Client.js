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
  #retry_strategy
  #attempts = 0
  #listeners = new Set()

  constructor({
    host,
    channels_threshold = 4096,
    retry_strategy,
  }) {
    this.#host = host
    this.#channels_threshold = channels_threshold
    this.#retry_strategy = retry_strategy

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

  on_connect(handler) {
    this.#listeners.add(handler)
  }

  off_connect(handler) {
    this.#listeners.delete(handler)
  }

  async connect(options = {}) {
    if (this.connected) return

    const that = this

    // globalThis environment should contain WebSocket
    // eslint-disable-next-line no-undef
    this.#ws = new WebSocket(this.#host, undefined, options)
    this.#attempts++
    this.#ws.binaryType = 'arraybuffer'
    this.#channels = new Map()
    this.#ws.addEventListener(
        'message',
        this.#on_message.bind(this),
    )
    await new Promise((resolve, reject) => {
      this.#ws.addEventListener('open', () => {
        that.#attempts = 0
        resolve()
      })
      this.#ws.addEventListener('error', async error => {
        if (!that.#retry_strategy) {
          reject(error)
          return
        }

        const retry_result = await that.#retry_strategy({
          error,
          attempts: that.#attempts,
          client  : that,
        })

        // eslint-disable-next-line unicorn/prefer-number-properties
        if (!isNaN(retry_result)) {
          setTimeout(() => {
            that.connect(options).then(resolve, reject)
          }, retry_result)
          return
        }

        reject(error)
      })
    })
    this.#ws.addEventListener('close', async event => {
      if (event.reason === 'closed by client') return

      const error = new Error('Client lost the connection')

      if (!that.#retry_strategy) throw error

      const retry_result = await that.#retry_strategy({
        error,
        attempts: that.#attempts,
        client  : that,
      })

      // eslint-disable-next-line unicorn/prefer-number-properties
      if (!isNaN(retry_result)) {
        setTimeout(() => {
          that.disconnect()
          that.connect(options).catch(({ message }) => {
            console.error(
                `Client lost the connection (retry failed)`,
                message,
            )
          })
        }, retry_result)
      }
    })
    this.#channel_count = -1
    this.#listeners.forEach(handler => {
      handler()
    })
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
