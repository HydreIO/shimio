// eslint-disable-next-line no-undef
export default class AckEvent extends Event {
  constructor(target) {
    super('ack', target)
  }
}
