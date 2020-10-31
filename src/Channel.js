import { FRAMES, STATE } from './constant.js'
import serialize from './serialize.js'
import { EventEmitter } from 'events'
import EI from 'event-iterator/lib/event-iterator.js'

const EventIterator = typeof EI === 'function' ? EI : EI.EventIterator

export default ({ socket, id, threshold }) => {
  const internal = new EventEmitter()
  const emitter = new EventEmitter()
  const drain = async () => {
    /* c8 ignore next 3 */
    // hardly testable
    if (socket.bufferedAmount < threshold) return
    await new Promise(resolve => setTimeout(resolve, 5)).then(drain)
  }
  const iterator = new EventIterator(({ push, stop }) => {
    const handle_message = ({ frame, buffer }) => {
      if (frame === FRAMES.DATA) push(buffer)
      else if (frame === FRAMES.END) {
        stop()
        emitter.emit('close')
      }
    }

    internal.on('message', handle_message)
    internal.on('close', stop)
    return () => {
      internal.off('message', handle_message)
      internal.off('close', stop)
      if (socket.readyState === STATE.OPEN)
        socket.send(serialize(FRAMES.END, id, new Uint8Array()), true)
    }
  })

  return new Proxy(emitter, {
    get(target, property, receiver) {
      switch (property) {
        case 'read':
          return iterator

        case 'write':
          return async chunk => {
            await drain()
            if (socket.readyState === STATE.OPEN)
              socket.send(serialize(FRAMES.DATA, id, chunk), true)
          }

        case 'close':
          return () => {
            internal.emit('close')
            emitter.emit('close')
          }

        case 'message':
          return payload => internal.emit('message', payload)

        case 'id':
          return id

        default:
          return Reflect.get(target, property, receiver)
      }
    },
  })
}
