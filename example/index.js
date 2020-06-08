import ws from 'ws'
import EventTarget from '../test/EventTarget.js'
import Event from '../test/Event.js'

// eslint-disable-next-line no-undef
globalThis.WebSocket = ws
// eslint-disable-next-line no-undef
globalThis.EventTarget = EventTarget
// eslint-disable-next-line no-undef
globalThis.Event = Event

await import('./node.js')
