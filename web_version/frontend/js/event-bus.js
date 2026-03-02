export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const handlers = this.listeners.get(eventName);
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  once(eventName, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }

    const unsubscribe = this.on(eventName, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  emit(eventName, payload) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || handlers.size === 0) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }

  clear(eventName) {
    if (typeof eventName === "string") {
      this.listeners.delete(eventName);
      return;
    }
    this.listeners.clear();
  }
}
