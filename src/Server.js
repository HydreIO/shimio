import uws from 'uWebSockets.js'
import parse from './parse.js'
import Channel from './Channel.js'
import compose from 'koa-compose'
import { EventEmitter } from 'events'
import { SOCKET_CODES } from './constant.js'
import debug from 'debug'

export default class ShimioServer {
  #app
  #port
  #path
  #socket
  #uws_options
  #closing
  #middleware = []
  #clients = new Set()

  #log = debug('shimio').extend('server')

  constructor({
    port = 3000,
    path = '/',
    uws_options = {
      idleTimeout     : 30,
      compression     : 0,
      maxPayloadLength: 16384,
    },
  } = {}) {
    this.#port = port
    this.#path = path
    this.#app = new uws.App()
    this.#uws_options = uws_options
  }

  get clients() {
    return this.#clients
  }

  use(middleware) {
    this.#middleware.push(middleware)
  }

  async listen() {
    const app = this.#app
    const port = this.#port
    const socket_stuct = await new Promise(resolve => {
      app.listen(
          port,
          resolve,
      )
    })

    if (socket_stuct) {
      this.#socket = socket_stuct
      this.#closing = false
    } else throw new Error(`unable to listen on ${ port }`)

    const that = this
    const middleware = compose(this.#middleware)

    this.#app.ws(
        this.#path,
        {
          ...this.#uws_options,
          async open(
              ws, request,
          ) {
            if (that.#closing) ws.close()

            const current = ws

            that.#clients.add(current)
            current.emitter = new EventEmitter()
            current.channels = new Map()

            await middleware({
              ws: new Proxy(
                  current.emitter,
                  {
                    get(
                        target, property,
                    ) {
                      if (property in ws) {
                        return Reflect.get(
                            ws,
                            property,
                        )
                      }


                      return Reflect.get(
                          target,
                          property,
                      )
                    },
                  },
              ),
              request,
            })
          },
          close(ws) {
            that.#clients.delete(ws)
          },
          async message(
              ws, message, binary,
          ) {
            console.log(
                'receiveddd',
                message,
            )
            if (!that.#clients.has(ws)) return
            if (!binary) {
              that.#log('not binary, exit')
              ws.end(SOCKET_CODES.CLOSE_UNSUPPORTED)
              return
            }

            try {
              const {
                event, channel_id, chunk,
              } = parse(message)
              const {
                channels, emitter,
              } = ws

              that.#log(
                  'receiving %O',
                  event,
              )

              if (!channels.has(channel_id)) {
                const channel = new Channel(
                    ws,
                    channel_id,
                    that.#log,
                )

                channels.set(
                    channel_id,
                    channel,
                )
                emitter.emit(
                    'channel',
                    channel,
                )
              }

              channels.get(channel_id).on_message(
                  event,
                  chunk,
              )
            } catch (error) {
              console.error(error)
              if (error.code) ws.end(error.code)
              else ws.end(SOCKET_CODES.CLOSE_PROTOCOL_ERROR)
            }
          },
        },
    )
  }

  disconnect_clients() {
    this.#clients.forEach(ws => {
      ws.close()
    })
  }

  stop() {
    if (this.#closing) return
    this.#closing = true
    this.disconnect_clients()
    uws.us_listen_socket_close(this.#socket)
  }
}
