export default class Event {
  /**
   * Create a new `Event`.
   *
   * @param {String} type The name of the event
   * @param {Object} data
   * A reference to the target to which the event was dispatched
   */
  constructor(
      type, target,
  ) {
    this.target = target
    this.type = type
  }
}
