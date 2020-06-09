import ws from 'ws'
// eslint-disable-next-line no-undef
globalThis.WebSocket = ws
await import('./node.js')
