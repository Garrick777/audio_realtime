import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../../js/event-bus.js";
import { CALL_STATES, CallStateMachine } from "../../js/state-machine.js";

test("CallStateMachine validates transition rules", () => {
  const machine = new CallStateMachine(CALL_STATES.IDLE);

  assert.equal(machine.canTransition(CALL_STATES.CONNECTING), true);
  assert.equal(machine.canTransition(CALL_STATES.READY), false);

  assert.equal(machine.transition(CALL_STATES.READY), false);
  assert.equal(machine.state, CALL_STATES.IDLE);

  assert.equal(machine.transition(CALL_STATES.CONNECTING), true);
  assert.equal(machine.state, CALL_STATES.CONNECTING);
});

test("CallStateMachine emits bus events for speaking start/stop", () => {
  const bus = new EventBus();
  const machine = new CallStateMachine(CALL_STATES.READY, bus);
  const events = [];

  bus.on("state:changed", (payload) => events.push(`changed:${payload.to}`));
  bus.on("state:user_speaking_start", () => events.push("user:start"));
  bus.on("state:user_speaking_stop", () => events.push("user:stop"));
  bus.on("state:ai_speaking_start", () => events.push("ai:start"));
  bus.on("state:ai_speaking_stop", () => events.push("ai:stop"));

  machine.transition(CALL_STATES.USER_SPEAKING, { reason: "vad_start" });
  machine.transition(CALL_STATES.PROCESSING, { reason: "vad_stop" });
  machine.transition(CALL_STATES.AI_SPEAKING, { reason: "playback_start" });
  machine.transition(CALL_STATES.READY, { reason: "playback_end" });

  assert.deepEqual(events, [
    "changed:user_speaking",
    "user:start",
    "changed:processing",
    "user:stop",
    "changed:ai_speaking",
    "ai:start",
    "changed:ready",
    "ai:stop",
  ]);
});

test("CallStateMachine onChange subscription and unsubscribe", () => {
  const machine = new CallStateMachine(CALL_STATES.IDLE);
  const records = [];

  const unsubscribe = machine.onChange((payload) => {
    records.push(payload);
  });

  machine.transition(CALL_STATES.CONNECTING, { reason: "start" });
  unsubscribe();
  machine.transition(CALL_STATES.READY, { reason: "connected" });

  assert.equal(records.length, 1);
  assert.equal(records[0].from, CALL_STATES.IDLE);
  assert.equal(records[0].to, CALL_STATES.CONNECTING);
  assert.equal(records[0].meta.reason, "start");
});

test("Transitioning to same state returns true and does not emit", () => {
  const bus = new EventBus();
  const machine = new CallStateMachine(CALL_STATES.IDLE, bus);
  let changedCalls = 0;
  bus.on("state:changed", () => {
    changedCalls += 1;
  });

  assert.equal(machine.transition(CALL_STATES.IDLE), true);
  assert.equal(changedCalls, 0);
});

test("onChange ignores non-function listener", () => {
  const machine = new CallStateMachine(CALL_STATES.IDLE);
  const unsubscribe = machine.onChange(null);

  assert.equal(typeof unsubscribe, "function");
  assert.doesNotThrow(() => unsubscribe());
});
