import doubt from '@hydre/doubt'
import reporter from 'tap-spec-emoji'
import { pipeline } from 'stream'
import ws from 'ws'
import EventTarget from './EventTarget.js'
import Event from './Event.js'

// this should be allowed but it is a recent feature
// will see to bump the lint config
// eslint-disable-next-line no-undef
globalThis.WebSocket = ws
// eslint-disable-next-line no-undef
globalThis.EventTarget = EventTarget
// eslint-disable-next-line no-undef
globalThis.Event = Event

const { default: Suite } = await import('./shimio.test.js')

pipeline(await doubt(Suite), reporter(), process.stdout, error => {
  if (error) console.error(error)
})
