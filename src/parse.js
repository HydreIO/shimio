import {
  SOCKET_CODES, FRAMES,
} from './constant.js'

export default raw_packet => {
  const [event] = new Uint8Array(
      raw_packet, 0, 1,
  )
  // 4294967295 channels per connection
  const [channel_id] = new Uint32Array(
      raw_packet, 1, 5,
  )

  if (event === undefined || channel_id === undefined) {
    const error = new Error('uh oh, received an illegal packet')

    error.code = SOCKET_CODES.CLOSE_PROTOCOL_ERROR
    throw error
  }

  if (!Object.values(FRAMES).includes(event)) {
    const error = new Error('uh oh, received an illegal frame')

    error.code = SOCKET_CODES.CLOSE_UNSUPPORTED
    throw error
  }

  return {
    event,
    channel_id,
    chunk: new Uint8Array(raw_packet, 5),
  }
}
