import {
  SOCKET_CODES, FRAMES,
} from './constant.js'

export default raw_packet => {
  const view = new DataView(raw_packet)
  const event = view.getUint8(0)

  if (!Object.values(FRAMES).includes(event)) {
    const error = new Error('uh oh, received an illegal frame')

    error.code = SOCKET_CODES.CLOSE_UNSUPPORTED
    throw error
  }

  // 4294967295 channels per connection
  const channel_id = view.getUint32(1)

  return {
    event,
    channel_id,
    chunk: new Uint8Array(
        raw_packet,
        5,
    ).slice(0),
  }
}
