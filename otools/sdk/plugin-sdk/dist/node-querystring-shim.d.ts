export declare function escape(value: string): string;
export declare function unescape(value: string): string;
export declare function parse(query: string): Record<string, string | string[]>;
export declare function stringify(value: Record<string, unknown>): string;
export declare const decode: typeof parse;
export declare const encode: typeof stringify;
declare const _default: {
    decode: typeof parse;
    encode: typeof stringify;
    escape: typeof escape;
    parse: typeof parse;
    stringify: typeof stringify;
    unescape: typeof unescape;
};
export default _default;
