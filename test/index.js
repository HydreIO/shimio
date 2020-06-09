import doubt from '@hydre/doubt'
import reporter from 'tap-spec-emoji'
import { pipeline } from 'stream'
import ws from 'ws'

// this should be allowed but it is a recent feature
// will see to bump the lint config
// eslint-disable-next-line no-undef
globalThis.WebSocket = ws

const { default: Suite } = await import('./shimio.test.js')

pipeline(
    await doubt(Suite),
    reporter(),
    process.stdout,
    error => {
      if (error) console.error(error)
    },
)
