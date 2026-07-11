export { invoke } from './runtime';
export { registerTransformCallback as transformCallback } from './native-event-bridge';
export declare const isTauri: () => boolean;
export declare const convertFileSrc: (filePath: string, protocol?: string) => string;
