import WebSocket from 'ws'
// eslint-disable-next-line no-undef
globalThis.WebSocket = WebSocket
await import('./node.js')
