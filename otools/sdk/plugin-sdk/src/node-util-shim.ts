import { readNoderModule } from "./node-compat-core";

type UtilModule = {
  callbackify?: (fn: (...args: unknown[]) => Promise<unknown>) => (...args: unknown[]) => void;
  format?: (...args: unknown[]) => string;
  inherits?: (constructor: unknown, superConstructor: unknown) => void;
  inspect?: (value: unknown) => string;
  promisify?: (fn: (...args: unknown[]) => void) => (...args: unknown[]) => Promise<unknown>;
  types?: Record<string, (value: unknown) => boolean>;
};

function readUtil(): UtilModule | null {
  return readNoderModule<UtilModule>("util");
}

function stringify(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function format(first: unknown, ...args: unknown[]) {
  const nativeFormat = readUtil()?.format;
  if (nativeFormat) {
    return nativeFormat(first, ...args);
  }
  let index = 0;
  const template = String(first ?? "");
  const formatted = template.replace(/%[sdjifoO%]/g, (token) => {
    if (token === "%%") {
      return "%";
    }
    const value = args[index++];
    if (token === "%d" || token === "%i") {
      return String(parseInt(String(value ?? 0), 10));
    }
    if (token === "%f") {
      return String(parseFloat(String(value ?? 0)));
    }
    return stringify(value);
  });
  return [formatted, ...args.slice(index).map(stringify)].join(" ");
}

export function inspect(value: unknown) {
  return readUtil()?.inspect?.(value) ?? stringify(value);
}

export function inherits(constructor: unknown, superConstructor: unknown) {
  const nativeInherits = readUtil()?.inherits;
  if (nativeInherits) {
    nativeInherits(constructor, superConstructor);
    return;
  }
  if (
    typeof constructor === "function" &&
    typeof superConstructor === "function"
  ) {
    constructor.prototype = Object.create(superConstructor.prototype);
    Object.defineProperty(constructor.prototype, "constructor", {
      configurable: true,
      value: constructor,
      writable: true,
    });
  }
}

export function promisify(fn: (...args: unknown[]) => void) {
  const nativePromisify = readUtil()?.promisify;
  if (nativePromisify) {
    return nativePromisify(fn);
  }
  return (...args: unknown[]) =>
    new Promise<unknown>((resolve, reject) => {
      fn(...args, (error: unknown, value: unknown) =>
        error ? reject(error) : resolve(value),
      );
    });
}

export function callbackify(fn: (...args: unknown[]) => Promise<unknown>) {
  const nativeCallbackify = readUtil()?.callbackify;
  if (nativeCallbackify) {
    return nativeCallbackify(fn);
  }
  return (...args: unknown[]) => {
    const callback = args.pop();
    void fn(...args).then(
      (value) => {
        if (typeof callback === "function") {
          callback(null, value);
        }
      },
      (error) => {
        if (typeof callback === "function") {
          callback(error);
        }
      },
    );
  };
}

export const types =
  readUtil()?.types ?? {
    isArrayBuffer: (value: unknown) => value instanceof ArrayBuffer,
    isDate: (value: unknown) => value instanceof Date,
    isMap: (value: unknown) => value instanceof Map,
    isRegExp: (value: unknown) => value instanceof RegExp,
    isSet: (value: unknown) => value instanceof Set,
    isUint8Array: (value: unknown) => value instanceof Uint8Array,
  };

export default {
  callbackify,
  format,
  inherits,
  inspect,
  promisify,
  types,
};
