type BufferConstructorLike = {
    alloc: (size: number, fill?: unknown, encoding?: string) => Uint8Array;
    allocUnsafe: (size: number) => Uint8Array;
    byteLength: (value: unknown, encoding?: string) => number;
    from: (value: unknown, encoding?: string) => Uint8Array;
    isBuffer: (value: unknown) => boolean;
};
export declare const Buffer: BufferConstructorLike;
export declare const atob: typeof globalThis.atob;
export declare const btoa: typeof globalThis.btoa;
export declare const constants: {
    MAX_LENGTH: number;
    MAX_STRING_LENGTH: number;
};
export declare const INSPECT_MAX_BYTES = 50;
export declare const kMaxLength: number;
export declare const kStringMaxLength: number;
declare const _default: {
    Buffer: BufferConstructorLike;
    INSPECT_MAX_BYTES: number;
    atob: typeof globalThis.atob;
    btoa: typeof globalThis.btoa;
    constants: {
        MAX_LENGTH: number;
        MAX_STRING_LENGTH: number;
    };
    kMaxLength: number;
    kStringMaxLength: number;
};
export default _default;
