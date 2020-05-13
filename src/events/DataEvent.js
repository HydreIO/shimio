// eslint-disable-next-line no-undef
export default class DataEvent extends Event {
  constructor(data, target) {
    super('data', target)
    this.data = data
  }
}
