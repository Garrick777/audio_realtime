import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../../js/event-bus.js";
import { CALL_STATES, CallStateMachine } from "../../js/state-machine.js";

test("E2E flow: connecting -> ready -> ai speaking -> user interrupt -> idle", () => {
  const bus = new EventBus();
  const machine = new CallStateMachine(CALL_STATES.IDLE, bus);
  const timeline = [];

  bus.on("state:changed", (payload) => timeline.push(`changed:${payload.to}`));
  bus.on("state:user_speaking_start", () => timeline.push("user:start"));
  bus.on("state:user_speaking_stop", () => timeline.push("user:stop"));
  bus.on("state:ai_speaking_start", () => timeline.push("ai:start"));
  bus.on("state:ai_speaking_stop", () => timeline.push("ai:stop"));

  assert.equal(machine.transition(CALL_STATES.CONNECTING), true);
  assert.equal(machine.transition(CALL_STATES.READY), true);
  assert.equal(machine.transition(CALL_STATES.AI_SPEAKING), true);
  assert.equal(machine.transition(CALL_STATES.USER_SPEAKING), true);
  assert.equal(machine.transition(CALL_STATES.PROCESSING), true);
  assert.equal(machine.transition(CALL_STATES.READY), true);
  assert.equal(machine.transition(CALL_STATES.IDLE), true);

  assert.equal(machine.state, CALL_STATES.IDLE);
  assert.deepEqual(timeline, [
    "changed:connecting",
    "changed:ready",
    "changed:ai_speaking",
    "ai:start",
    "changed:user_speaking",
    "user:start",
    "ai:stop",
    "changed:processing",
    "user:stop",
    "changed:ready",
    "changed:idle",
  ]);
});
