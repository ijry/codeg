export declare function format(first: unknown, ...args: unknown[]): string;
export declare function inspect(value: unknown): string;
export declare function inherits(constructor: unknown, superConstructor: unknown): void;
export declare function promisify(fn: (...args: unknown[]) => void): (...args: unknown[]) => Promise<unknown>;
export declare function callbackify(fn: (...args: unknown[]) => Promise<unknown>): (...args: unknown[]) => void;
export declare const types: Record<string, (value: unknown) => boolean>;
declare const _default: {
    callbackify: typeof callbackify;
    format: typeof format;
    inherits: typeof inherits;
    inspect: typeof inspect;
    promisify: typeof promisify;
    types: Record<string, (value: unknown) => boolean>;
};
export default _default;
