import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../../js/event-bus.js";

test("EventBus.on + emit + unsubscribe", () => {
  const bus = new EventBus();
  const received = [];

  const unsubscribe = bus.on("message", (payload) => {
    received.push(payload);
  });

  bus.emit("message", { value: 1 });
  unsubscribe();
  bus.emit("message", { value: 2 });

  assert.deepEqual(received, [{ value: 1 }]);
});

test("EventBus.once only fires once", () => {
  const bus = new EventBus();
  let callCount = 0;

  bus.once("ready", () => {
    callCount += 1;
  });

  bus.emit("ready");
  bus.emit("ready");

  assert.equal(callCount, 1);
});

test("EventBus.clear supports single event and all events", () => {
  const bus = new EventBus();
  let a = 0;
  let b = 0;

  bus.on("a", () => {
    a += 1;
  });
  bus.on("b", () => {
    b += 1;
  });

  bus.clear("a");
  bus.emit("a");
  bus.emit("b");
  assert.equal(a, 0);
  assert.equal(b, 1);

  bus.clear();
  bus.emit("b");
  assert.equal(b, 1);
});

test("EventBus ignores non-function handlers", () => {
  const bus = new EventBus();
  const unsubscribe = bus.on("noop", null);
  const onceUnsubscribe = bus.once("noop", 123);

  assert.equal(typeof unsubscribe, "function");
  assert.equal(typeof onceUnsubscribe, "function");
  assert.doesNotThrow(() => unsubscribe());
  assert.doesNotThrow(() => onceUnsubscribe());
  assert.doesNotThrow(() => bus.emit("noop", "payload"));
});
