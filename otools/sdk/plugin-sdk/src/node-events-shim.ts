import { CompatEventEmitter, readNoderModule } from "./node-compat-core";

type EventsModule = typeof CompatEventEmitter & {
  EventEmitter?: typeof CompatEventEmitter;
  listenerCount?: (emitter: CompatEventEmitter, event: string | symbol) => number;
  once?: (emitter: CompatEventEmitter, event: string | symbol) => Promise<unknown[]>;
};

function readEvents(): EventsModule | null {
  return readNoderModule<EventsModule>("events");
}

export class EventEmitter extends CompatEventEmitter {}

export function listenerCount(
  emitter: CompatEventEmitter,
  event: string | symbol,
) {
  return readEvents()?.listenerCount?.(emitter, event) ?? emitter.listenerCount(event);
}

export function once(emitter: CompatEventEmitter, event: string | symbol) {
  const eventsOnce = readEvents()?.once;
  if (eventsOnce) {
    return eventsOnce(emitter, event);
  }
  return new Promise<unknown[]>((resolve) => {
    emitter.once(event, (...args) => resolve(args));
  });
}

export default Object.assign(EventEmitter, {
  EventEmitter,
  listenerCount,
  once,
});
