export default (
    // uInt8
    event,
    // uInt32
    id,
    // uInt8Array
    chunk,
) => {
  if (!(chunk instanceof Uint8Array))
    throw new Error(`chunk ${ chunk } is not an Uint8Array`)

  const buffer = new ArrayBuffer(5 + chunk.byteLength)
  const view = new DataView(buffer)

  view.setUint8(
      0,
      event,
  )
  view.setUint32(
      1,
      id,
  )

  const packet = new Uint8Array(buffer)

  packet.set(
      chunk,
      5,
  )
  return packet
}
