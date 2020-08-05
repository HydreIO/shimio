import parse from './parse.js'
import Channel from './Channel.js'
import ws from 'ws'
import http from 'http'
import { SOCKET_CODES, FRAMES } from './constant.js'
import Debug from 'debug'
import LRU from 'lru_map'

const debug = Debug('shimio').extend('server')
const noop = () => {}
const ban_ip = new LRU.LRUMap(50)

export default ({
  koa,
  timeout = 30000,
  on_upgrade = () => true,
  on_socket = noop,
  channel_limit = 50,
  threshold = 4096,
  ws_options = {
    path             : '/',
    perMessageDeflate: false,
    maxPayload       : 4096 * 4,
  },
  request_limit = {
    max  : 20,
    every: 1000 * 10,
  },
  time_between_connections = 1000 * 30,
} = {}) => {
  debug('creating server with options %O', {
    timeout,
    channel_limit,
    threshold,
    ws_options,
    request_limit,
    time_between_connections,
  })

  // we prevent usage of those as it's up to the http server to decide
  // @see https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
  const { host, port, ...options } = ws_options
  const http_server = http.createServer(koa.callback())
  const wss = new ws.Server({
    ...options,
    noServer: true,
  })
  const burst_interval = setInterval(() => {
    wss.clients.forEach(client => {
      client.sent_amount = 0
    })
  }, request_limit.every)

  http_server.on('upgrade', async (request, socket, head) => {
    const { address } = socket.address()

    debug('upgrade request from %O', address)

    const context = Object.create(null)
    const last_connection = ban_ip.get(address) || 0
    const banned = last_connection + time_between_connections > Date.now()
    const allowed = await on_upgrade({
      request,
      socket,
      head,
      context,
    })

    if (!allowed || banned) {
      debug('refused, the socket will be destroyed')
      socket.destroy()
      return
    }

    ban_ip.set(address, Date.now())

    wss.handleUpgrade(request, socket, head, sock => {
      wss.emit('connection', sock, request, context, socket)
    })
  })

  wss.on('connection', (sock, request, context, socket) => {
    const { address } = socket.address()
    const log = debug.extend(address)

    log('connected!')

    sock.alive = true
    sock.sent_amount = 0

    const channels = new Map()
    const terminate = () => {
      log('terminating')
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
        log('sent and illegal buffer, closing')
        sock.close(SOCKET_CODES.CLOSE_UNSUPPORTED, 'not arrayBuffer')
        return
      }

      try {
        const { event, channel_id, chunk } = parse(message)

        sock.sent_amount++
        if (sock.sent_amount >= request_limit.max) {
          sock.close(
              SOCKET_CODES.CLOSE_BAN,
              `If you could stop spamming, that'd be great`,
          )
          return
        }

        if (!channels.has(channel_id)) {
          if (channels.size >= channel_limit) {
            sock.close(SOCKET_CODES.CLOSE_PROTOCOL_ERROR, 'too much channels')
            return
          }

          const channel = Channel({
            socket: sock,
            id    : channel_id,
            label : 'server',
            threshold,
          })

          log('new channel openned')
          channels.set(channel_id, channel)
          sock.emit('channel', channel)
        }

        channels.get(channel_id).message({
          frame : event,
          buffer: chunk,
        })

        if (event === FRAMES.END) channels.delete(channel_id)
      } catch (error) {
        log('sent error %O', error)
        if (error.code) sock.close(error.code, error.message)
        else sock.close(SOCKET_CODES.CLOSE_PROTOCOL_ERROR, error.message)
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
    debug('controlling %O clients', wss.clients.size)
    wss.clients.forEach(sock => {
      /* c8 ignore next 7 */
      if (!sock.alive) {
        // this is hardly testable.. it come from the
        // official doc of WS
        // close() instead of terminate() to allow channels cleanup
        sock.close()
        return
      }

      sock.alive = false
      sock.ping(noop)
    })
  }, timeout)

  return new Proxy(http_server, {
    get(target, property, receiver) {
      switch (property) {
        case 'close':
          return () =>
            new Promise(resolve => {
              debug('closing server..')
              clearInterval(burst_interval)
              clearInterval(interval)
              wss.clients.forEach(sock => {
                sock.close()
              })
              target.close(resolve)
            })

        case 'listen':
          return (...parameters) =>
            new Promise(resolve => {
              debug('listening..')
              target.listen(...parameters, resolve)
            })

        default:
          return Reflect.get(target, property, receiver)
      }
    },
  })
}
