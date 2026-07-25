import { CompatEventEmitter } from './node-compat-core';
export declare class EventEmitter extends CompatEventEmitter {
}
export declare function listenerCount(emitter: CompatEventEmitter, event: string | symbol): number;
export declare function once(emitter: CompatEventEmitter, event: string | symbol): Promise<unknown[]>;
declare const _default: typeof EventEmitter & {
    EventEmitter: typeof EventEmitter;
    listenerCount: typeof listenerCount;
    once: typeof once;
};
export default _default;
