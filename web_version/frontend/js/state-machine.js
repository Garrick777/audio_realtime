export const CALL_STATES = Object.freeze({
  IDLE: "idle",
  CONNECTING: "connecting",
  READY: "ready",
  USER_SPEAKING: "user_speaking",
  PROCESSING: "processing",
  AI_SPEAKING: "ai_speaking",
  ERROR: "error",
});

const STATE_TRANSITIONS = Object.freeze({
  [CALL_STATES.IDLE]: new Set([CALL_STATES.CONNECTING, CALL_STATES.ERROR]),
  [CALL_STATES.CONNECTING]: new Set([
    CALL_STATES.READY,
    CALL_STATES.IDLE,
    CALL_STATES.ERROR,
  ]),
  [CALL_STATES.READY]: new Set([
    CALL_STATES.CONNECTING,
    CALL_STATES.USER_SPEAKING,
    CALL_STATES.AI_SPEAKING,
    CALL_STATES.IDLE,
    CALL_STATES.ERROR,
  ]),
  [CALL_STATES.USER_SPEAKING]: new Set([
    CALL_STATES.CONNECTING,
    CALL_STATES.PROCESSING,
    CALL_STATES.IDLE,
    CALL_STATES.ERROR,
  ]),
  [CALL_STATES.PROCESSING]: new Set([
    CALL_STATES.CONNECTING,
    CALL_STATES.AI_SPEAKING,
    CALL_STATES.READY,
    CALL_STATES.IDLE,
    CALL_STATES.ERROR,
  ]),
  [CALL_STATES.AI_SPEAKING]: new Set([
    CALL_STATES.CONNECTING,
    CALL_STATES.READY,
    CALL_STATES.USER_SPEAKING,
    CALL_STATES.IDLE,
    CALL_STATES.ERROR,
  ]),
  [CALL_STATES.ERROR]: new Set([CALL_STATES.IDLE, CALL_STATES.CONNECTING]),
});

export class CallStateMachine {
  constructor(initialState = CALL_STATES.IDLE, eventBus = null) {
    this.state = initialState;
    this.eventBus = eventBus;
    this._listeners = new Set();
  }

  onChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  canTransition(nextState) {
    if (nextState === this.state) {
      return true;
    }

    const nextStates = STATE_TRANSITIONS[this.state];
    return Boolean(nextStates && nextStates.has(nextState));
  }

  transition(nextState, meta = {}) {
    if (!this.canTransition(nextState)) {
      return false;
    }

    const previous = this.state;
    if (previous === nextState) {
      return true;
    }

    this.state = nextState;
    const payload = { from: previous, to: nextState, meta };

    for (const listener of this._listeners) {
      listener(payload);
    }

    if (this.eventBus) {
      this.eventBus.emit("state:changed", payload);

      if (nextState === CALL_STATES.USER_SPEAKING) {
        this.eventBus.emit("state:user_speaking_start", payload);
      }
      if (previous === CALL_STATES.USER_SPEAKING && nextState !== CALL_STATES.USER_SPEAKING) {
        this.eventBus.emit("state:user_speaking_stop", payload);
      }

      if (nextState === CALL_STATES.AI_SPEAKING) {
        this.eventBus.emit("state:ai_speaking_start", payload);
      }
      if (previous === CALL_STATES.AI_SPEAKING && nextState !== CALL_STATES.AI_SPEAKING) {
        this.eventBus.emit("state:ai_speaking_stop", payload);
      }
    }

    return true;
  }
}
