import parse from './parse.js'
import Channel from './Channel.js'
import ws from 'ws'
import { SOCKET_CODES, FRAMES } from './constant.js'
import http from 'http'

const noop = () => {}

export default ({
  http_server = http.createServer(),
  timeout = 30_000,
  allow_upgrade = () => true,
  on_socket = noop,
  channel_limit = 50,
  channels_threshold = 4096,
  ws_options = {
    path             : '/',
    perMessageDeflate: false,
    maxPayload       : 4096 * 4,
  },
} = {}) => {
  // we prevent usage of those as it's up to the http server to decide
  // @see https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
  const { host, port, ...options } = ws_options
  const wss = new ws.Server({
    ...options,
    noServer: true,
  })

  http_server.on(
      'upgrade',
      async (request, socket, head) => {
        const context = Object.create(null)
        const allowed = await allow_upgrade({
          request,
          socket,
          head,
          context,
        })

        if (!allowed) {
          socket.destroy()
          return
        }

        wss.handleUpgrade(request, socket, head, sock => {
          wss.emit('connection', sock, request, context)
        })
      },
  )

  wss.on('connection', (sock, request, context) => {
    sock.alive = true

    const channels = new Map()
    const terminate = () => {
      channels.forEach(channel => {
        channel.close()
      })
      sock.terminate()
    }

    sock.binaryType = 'arraybuffer'
    sock.on('error', terminate)
    sock.on('close', terminate)
    sock.on('message', message => {
      if (!(message instanceof ArrayBuffer)) {
        sock.close(
            SOCKET_CODES.CLOSE_UNSUPPORTED,
            'not arrayBuffer',
        )
        return
      }

      try {
        const { event, channel_id, chunk } = parse(message)

        if (!channels.has(channel_id)) {
          if (channels.size >= channel_limit) {
            sock.close(
                SOCKET_CODES.CLOSE_PROTOCOL_ERROR,
                'too much channels',
            )
            return
          }

          const channel = new Channel({
            ws       : sock,
            id       : channel_id,
            label    : 'server',
            threshold: channels_threshold,
          })

          channels.set(channel_id, channel)
          sock.emit('channel', channel)
        }

        channels.get(channel_id).on_message(event, chunk)

        if (event === FRAMES.END)
          channels.delete(channel_id)
      } catch (error) {
        if (error.code)
          sock.close(error.code, error.message)
        else {
          sock.close(
              SOCKET_CODES.CLOSE_PROTOCOL_ERROR,
              error.message,
          )
        }
      }
    })
    sock.on('pong', () => {
      sock.alive = true
    })
    on_socket({
      socket: sock,
      request,
      context,
    })
  })

  const interval = setInterval(() => {
    wss.clients.forEach(sock => {
      /* c8 ignore next 7 */
      // this is hardly testable.. it come from the
      // official doc of WS
      if (!sock.alive) {
        // close() instead of terminate() to allow channels cleanup
        sock.close()
        return
      }

      sock.alive = false
      sock.ping(noop)
    })
  }, timeout)

  http_server.on('close', () => {
    clearInterval(interval)
  })

  return new Proxy(http_server, {
    get(target, property, receiver) {
      switch (property) {
        case 'close':
          clearInterval(interval)
          wss.clients.forEach(sock => {
            sock.close()
          })
          return () =>
            new Promise(resolve => {
              target.close(resolve)
            })

        case 'listen':
          return (...parameters) =>
            new Promise(resolve => {
              target.listen(...parameters, resolve)
            })
        default:
          return Reflect.get(target, property, receiver)
      }
    },
  })
}
