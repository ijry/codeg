import { readNoderModule } from "./node-compat-core";

type BufferConstructorLike = {
  alloc: (size: number, fill?: unknown, encoding?: string) => Uint8Array;
  allocUnsafe: (size: number) => Uint8Array;
  byteLength: (value: unknown, encoding?: string) => number;
  from: (value: unknown, encoding?: string) => Uint8Array;
  isBuffer: (value: unknown) => boolean;
};

function encodeText(value: unknown) {
  return new TextEncoder().encode(String(value ?? ""));
}

function decorateBuffer(bytes: Uint8Array) {
  Object.defineProperty(bytes, "toString", {
    configurable: true,
    value(encoding = "utf8") {
      if (encoding === "base64") {
        let binary = "";
        for (const byte of bytes) {
          binary += String.fromCharCode(byte);
        }
        return globalThis.btoa(binary);
      }
      if (encoding === "hex") {
        return [...bytes]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }
      return new TextDecoder().decode(bytes);
    },
  });
  return bytes;
}

const fallbackBuffer: BufferConstructorLike = {
  alloc(size, fill = 0, encoding) {
    const buffer = new Uint8Array(Math.max(0, Math.trunc(Number(size) || 0)));
    if (typeof fill === "number") {
      buffer.fill(fill);
    } else if (fill !== undefined && fill !== null) {
      const bytes = fallbackBuffer.from(String(fill), encoding);
      for (let index = 0; index < buffer.length; index += 1) {
        buffer[index] = bytes[index % bytes.length] ?? 0;
      }
    }
    return decorateBuffer(buffer);
  },
  allocUnsafe(size) {
    return decorateBuffer(
      new Uint8Array(Math.max(0, Math.trunc(Number(size) || 0))),
    );
  },
  byteLength(value, encoding) {
    return fallbackBuffer.from(value, encoding).length;
  },
  from(value, encoding) {
    if (typeof value === "string") {
      if (encoding === "base64") {
        const binary = globalThis.atob(value);
        return decorateBuffer(
          new Uint8Array([...binary].map((char) => char.charCodeAt(0))),
        );
      }
      if (encoding === "hex") {
        const bytes =
          value.match(/.{1,2}/g)?.map((item) => parseInt(item, 16)) ?? [];
        return decorateBuffer(new Uint8Array(bytes));
      }
      return decorateBuffer(new Uint8Array(encodeText(value)));
    }
    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      const copied = new Uint8Array(view.byteLength);
      copied.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return decorateBuffer(copied);
    }
    if (value instanceof ArrayBuffer) {
      return decorateBuffer(new Uint8Array(value.slice(0)));
    }
    if (Array.isArray(value)) {
      return decorateBuffer(new Uint8Array(value));
    }
    return decorateBuffer(new Uint8Array(encodeText(value)));
  },
  isBuffer(value) {
    return value instanceof Uint8Array;
  },
};

function readBuffer(): BufferConstructorLike {
  const moduleBuffer = readNoderModule<{ Buffer?: BufferConstructorLike }>("buffer")?.Buffer;
  return moduleBuffer ?? fallbackBuffer;
}

export const Buffer = new Proxy(fallbackBuffer, {
  get(target, prop) {
    const value =
      readBuffer()?.[prop as keyof BufferConstructorLike] ??
      target[prop as keyof BufferConstructorLike];
    return typeof value === "function" ? value.bind(readBuffer()) : value;
  },
});

export const atob = globalThis.atob?.bind(globalThis);
export const btoa = globalThis.btoa?.bind(globalThis);
export const constants = {
  MAX_LENGTH: Number.MAX_SAFE_INTEGER,
  MAX_STRING_LENGTH: Number.MAX_SAFE_INTEGER,
};
export const INSPECT_MAX_BYTES = 50;
export const kMaxLength = constants.MAX_LENGTH;
export const kStringMaxLength = constants.MAX_STRING_LENGTH;

export default {
  Buffer,
  INSPECT_MAX_BYTES,
  atob,
  btoa,
  constants,
  kMaxLength,
  kStringMaxLength,
};
