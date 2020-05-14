import { EventEmitter } from 'events'

export default class EventTarget extends EventEmitter {
  addEventListener(
      type, listener, options,
  ) {
    const method = options?.once ? 'once' : 'once'

    this[method](
        type,
        listener,
    )
  }

  removeEventListener(
      type, listener,
  ) {
    this.removeListener(
        type,
        listener,
    )
  }

  dispatchEvent(event) {
    this.emit(
        event.type,
        event,
    )
  }
}
