import { types } from "./node-util-shim";

export const isArrayBuffer = (value: unknown) => types.isArrayBuffer(value);
export const isDate = (value: unknown) => types.isDate(value);
export const isMap = (value: unknown) => types.isMap(value);
export const isRegExp = (value: unknown) => types.isRegExp(value);
export const isSet = (value: unknown) => types.isSet(value);
export const isUint8Array = (value: unknown) => types.isUint8Array(value);

export default types;
