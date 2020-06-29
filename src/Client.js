import Channel from './Channel.js'
import parse from './parse.js'
// polifylled by webpack or https://github.com/Gozala/events
import { EventEmitter } from 'events'
import Debug from 'debug'

const debug = Debug('shimio').extend('client')

export default ({ host, threshold = 4096, retry_strategy }) => {
  const emitter = new EventEmitter()
  const internal = new EventEmitter()

  debug('new client created')

  internal.on('connect', (options, attempts = 0) => {
    debug('connecting client')

    // eslint-disable-next-line no-undef
    const ws = new WebSocket(host, undefined, options)
    const handle_error = () => {}
    const handle_open = () => {
      // eslint-disable-next-line no-param-reassign
      attempts = 0
      return emitter.emit('connected')
    }
    const channels = new Map()
    const handle_message = ({ data }) => {
      const { event, channel_id, chunk } = parse(data)
      const channel = channels.get(channel_id)

      debug('handle message %O', {
        event,
        channel_id,
        chunk,
      })

      if (channel) {
        channel.message({
          frame : event,
          buffer: chunk,
        })
      }
    }

    let channel_count = 0

    const handle_channel = () => {
      const id = ++channel_count

      debug('handle channel %O', id)

      const channel = Channel({
        socket: ws,
        id,
        label : 'client',
        threshold,
      })

      channels.set(id, channel)
      emitter.emit('channel', channel)
    }
    const handle_disconnect = () => {
      debug('handle disconnect')
      channels.forEach(channel => {
        channel.close()
      })
      channels.clear()
      ws.close(4100, 'closed by client')
    }
    const handle_unexpected = async code => {
      if (retry_strategy) {
        const retry_result = await retry_strategy(attempts)

        // eslint-disable-next-line unicorn/prefer-number-properties
        if (!isNaN(retry_result)) {
          debug('code<%O> | retrying in %O [%O]', code, retry_result, attempts)
          setTimeout(() => {
            internal.emit('connect', options, attempts + 1)
          }, retry_result)
        } else debug('giving up.. code: %O', code)
      }
    }

    internal.on('disconnect', handle_disconnect)
    internal.on('open_channel', handle_channel)

    ws.binaryType = 'arraybuffer'
    ws.addEventListener('message', handle_message)
    ws.addEventListener('open', handle_open)
    ws.addEventListener('error', handle_error)
    ws.addEventListener(
        'close',
        async ({ code }) => {
          debug('handle close %O', code)
          ws.removeEventListener('open', handle_open)
          ws.removeEventListener('message', handle_message)
          ws.removeEventListener('error', handle_error)
          internal.off('disconnect', handle_disconnect)
          internal.off('open_channel', handle_channel)
          if (code !== 4100) handle_unexpected(code)
          emitter.emit('disconnected', code)
        },
        { once: true },
    )
  })

  return new Proxy(emitter, {
    get(target, property, receiver) {
      switch (property) {
        case 'connect':
          return options =>
            new Promise(resolve => {
              emitter.once('connected', resolve)
              internal.emit('connect', options)
            })

        case 'disconnect':
          return () => internal.emit('disconnect')

        case 'open_channel':
          return () =>
            new Promise(resolve => {
              emitter.once('channel', resolve)
              internal.emit('open_channel')
            })

        default:
          return Reflect.get(target, property, receiver)
      }
    },
  })
}
