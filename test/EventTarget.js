import { EventEmitter } from 'events'

export default class EventTarget extends EventEmitter {
  addEventListener(
      type,
      listener,
      options,
  ) {
    const method = options?.once ? 'once' : 'on'

    this[method](type, listener)
  }

  removeEventListener(type, listener) {
    this.off(type, listener)
  }

  dispatchEvent(event) {
    this.emit(event.type, event)
  }
}
