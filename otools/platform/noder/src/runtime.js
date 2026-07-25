(() => {
  const installKey = "__OToolsNoderInstalled__";
  if (window[installKey]) {
    return;
  }
  window[installKey] = true;

  const textEncoder = new TextEncoder();
  const decoderCache = new Map();
  const moduleCache = new Map();
  const processInfoCache = { os: null, cwd: null };

  const defineGlobal = (key, value) => {
    try {
      Object.defineProperty(window, key, {
        value,
        configurable: true,
        writable: true
      });
    } catch {
      window[key] = value;
    }
  };

  const normalizePermissionName = (value) => {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }
    const normalized = text.toLowerCase().replace(/[\s-]+/g, "_");
    if (normalized === "fs") {
      return "fs";
    }
    if (normalized === "dialog") {
      return "dialog";
    }
    if (normalized === "shell") {
      return "shell";
    }
    if (normalized === "child_process" || normalized === "childprocess") {
      return "child_process";
    }
    return null;
  };

  const getDeclaredPluginPermissions = () => {
    const raw = window.__OToolsEnv?.pluginPermissions;
    if (!Array.isArray(raw)) {
      return null;
    }
    const seen = new Set();
    const normalized = [];
    for (const item of raw) {
      const permission = normalizePermissionName(item);
      if (!permission || seen.has(permission)) {
        continue;
      }
      seen.add(permission);
      normalized.push(permission);
    }
    return normalized;
  };

  const hasRestrictedPluginPermissions = () => Array.isArray(window.__OToolsEnv?.pluginPermissions);

  const hasPluginPermission = (permission) => {
    const normalized = normalizePermissionName(permission);
    if (!normalized) {
      return false;
    }
    const declared = getDeclaredPluginPermissions();
    if (!declared) {
      return true;
    }
    return declared.includes(normalized);
  };

  const createPermissionDeniedError = (specifier, permission) => {
    const pluginUuid = String(window.__OToolsEnv?.pluginUuid || "").trim();
    const pluginLabel = pluginUuid || "current plugin";
    const error = new Error(
      `Plugin "${pluginLabel}" has not declared "${permission}" permission required by "${specifier}".`
    );
    error.code = "ERR_OTOOLS_PERMISSION_DENIED";
    error.permission = permission;
    error.specifier = String(specifier || "");
    return error;
  };

  const getDecoder = (encoding = "utf-8") => {
    const normalized = normalizeEncoding(encoding) || "utf-8";
    if (!decoderCache.has(normalized)) {
      decoderCache.set(normalized, new TextDecoder(normalized));
    }
    return decoderCache.get(normalized);
  };

  const bytesToBase64 = (bytes) => {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  };

  const base64ToBytes = (value) => {
    let text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    while (text.length % 4) {
      text += "=";
    }
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  };

  const normalizeEncoding = (value) => {
    if (!value) {
      return null;
    }
    const text = String(value).trim().toLowerCase();
    if (!text) {
      return null;
    }
    if (text === "utf8") {
      return "utf-8";
    }
    if (text === "utf16le") {
      return "utf-16le";
    }
    if (text === "latin1" || text === "binary") {
      return "iso-8859-1";
    }
    return text;
  };

  const hexToBytes = (value) => {
    const text = String(value || "").replace(/[^0-9a-f]/gi, "");
    const bytes = new Uint8Array(Math.floor(text.length / 2));
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = parseInt(text.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  };

  const encodeStringToBytes = (value, encoding) => {
    const normalized = normalizeEncoding(encoding) || "utf-8";
    const text = String(value || "");
    if (normalized === "base64") {
      return base64ToBytes(text);
    }
    if (normalized === "base64url") {
      return base64ToBytes(text);
    }
    if (normalized === "hex") {
      return hexToBytes(text);
    }
    if (normalized === "utf-16le") {
      const bytes = new Uint8Array(text.length * 2);
      for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        bytes[index * 2] = code & 0xff;
        bytes[index * 2 + 1] = code >>> 8;
      }
      return bytes;
    }
    if (normalized === "iso-8859-1") {
      const bytes = new Uint8Array(text.length);
      for (let index = 0; index < text.length; index += 1) {
        bytes[index] = text.charCodeAt(index) & 0xff;
      }
      return bytes;
    }
    return textEncoder.encode(text);
  };

  const normalizeBufferBounds = (length, start = 0, end = length) => {
    let from = Number(start);
    let to = Number(end);
    if (!Number.isFinite(from)) {
      from = 0;
    }
    if (!Number.isFinite(to)) {
      to = length;
    }
    if (from < 0) {
      from = Math.max(length + from, 0);
    }
    if (to < 0) {
      to = Math.max(length + to, 0);
    }
    return [
      Math.max(0, Math.min(length, Math.trunc(from))),
      Math.max(0, Math.min(length, Math.trunc(to)))
    ];
  };

  class BufferPolyfill extends Uint8Array {
    static from(value, encoding) {
      if (value instanceof BufferPolyfill) {
        return new BufferPolyfill(value);
      }
      if (typeof value === "string") {
        return new BufferPolyfill(encodeStringToBytes(value, encoding));
      }
      if (ArrayBuffer.isView(value)) {
        return new BufferPolyfill(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      }
      if (value instanceof ArrayBuffer) {
        return new BufferPolyfill(value.slice(0));
      }
      if (Array.isArray(value)) {
        return new BufferPolyfill(value);
      }
      if (typeof value === "number") {
        return BufferPolyfill.alloc(value);
      }
      if (value && typeof value === "object" && typeof value.type === "string" && value.type === "Buffer" && Array.isArray(value.data)) {
        return new BufferPolyfill(value.data);
      }
      throw new TypeError("Unsupported Buffer input");
    }

    static alloc(size, fill = 0, encoding) {
      const buffer = new BufferPolyfill(Math.trunc(Math.max(0, Number(size) || 0)));
      if (typeof fill === "string") {
        const fillBuffer = BufferPolyfill.from(fill, encoding);
        for (let index = 0; index < buffer.length; index += 1) {
          buffer[index] = fillBuffer[index % fillBuffer.length] || 0;
        }
      } else {
        buffer.fill(fill);
      }
      return buffer;
    }

    static allocUnsafe(size) {
      return new BufferPolyfill(Math.trunc(Math.max(0, Number(size) || 0)));
    }

    static allocUnsafeSlow(size) {
      return BufferPolyfill.allocUnsafe(size);
    }

    static concat(list, totalLength) {
      const buffers = Array.isArray(list) ? list.map((item) => BufferPolyfill.from(item)) : [];
      const length = Number.isFinite(totalLength)
        ? Number(totalLength)
        : buffers.reduce((sum, item) => sum + item.length, 0);
      const out = BufferPolyfill.alloc(length);
      let offset = 0;
      for (const buffer of buffers) {
        out.set(buffer.subarray(0, Math.max(0, Math.min(buffer.length, length - offset))), offset);
        offset += buffer.length;
        if (offset >= length) {
          break;
        }
      }
      return out;
    }

    static isBuffer(value) {
      return value instanceof BufferPolyfill;
    }

    static byteLength(value, encoding) {
      return BufferPolyfill.from(value, encoding).length;
    }

    static compare(left, right) {
      const a = BufferPolyfill.from(left);
      const b = BufferPolyfill.from(right);
      const length = Math.min(a.length, b.length);
      for (let index = 0; index < length; index += 1) {
        if (a[index] !== b[index]) {
          return a[index] < b[index] ? -1 : 1;
        }
      }
      if (a.length === b.length) {
        return 0;
      }
      return a.length < b.length ? -1 : 1;
    }

    static isEncoding(encoding) {
      const normalized = normalizeEncoding(encoding);
      return [
        "base64",
        "hex",
        "iso-8859-1",
        "utf-8",
        "utf-16le",
        "ascii",
        "base64url"
      ].includes(normalized);
    }

    toString(encoding = "utf8", start = 0, end = this.length) {
      const normalized = normalizeEncoding(encoding) || "utf-8";
      const [from, to] = normalizeBufferBounds(this.length, start, end);
      const slice = this.subarray(from, to);
      if (normalized === "base64") {
        return bytesToBase64(slice);
      }
      if (normalized === "base64url") {
        return bytesToBase64(slice).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      }
      if (normalized === "hex") {
        return Array.from(slice, (item) => item.toString(16).padStart(2, "0")).join("");
      }
      if (normalized === "ascii") {
        return Array.from(slice, (item) => String.fromCharCode(item & 0x7f)).join("");
      }
      return getDecoder(normalized).decode(slice);
    }

    compare(other, targetStart = 0, targetEnd, sourceStart = 0, sourceEnd) {
      const target = BufferPolyfill.from(other);
      const [targetFrom, targetTo] = normalizeBufferBounds(target.length, targetStart, targetEnd ?? target.length);
      const [sourceFrom, sourceTo] = normalizeBufferBounds(this.length, sourceStart, sourceEnd ?? this.length);
      return BufferPolyfill.compare(this.subarray(sourceFrom, sourceTo), target.subarray(targetFrom, targetTo));
    }

    copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
      if (!ArrayBuffer.isView(target)) {
        throw new TypeError("target must be a Buffer or Uint8Array");
      }
      const out = target;
      const [from, to] = normalizeBufferBounds(this.length, sourceStart, sourceEnd);
      const offset = Math.max(0, Math.min(out.length, Math.trunc(Number(targetStart) || 0)));
      const slice = this.subarray(from, Math.min(to, from + out.length - offset));
      out.set(slice, offset);
      return slice.length;
    }

    equals(other) {
      const target = BufferPolyfill.from(other);
      if (target.length !== this.length) {
        return false;
      }
      for (let index = 0; index < this.length; index += 1) {
        if (target[index] !== this[index]) {
          return false;
        }
      }
      return true;
    }

    fill(value = 0, start = 0, end = this.length, encoding) {
      const [from, to] = normalizeBufferBounds(this.length, start, end);
      if (typeof value === "string") {
        const bytes = BufferPolyfill.from(value, encoding);
        if (!bytes.length) {
          return this;
        }
        for (let index = from; index < to; index += 1) {
          this[index] = bytes[(index - from) % bytes.length];
        }
        return this;
      }
      super.fill(Number(value) || 0, from, to);
      return this;
    }

    includes(value, byteOffset = 0, encoding) {
      return this.indexOf(value, byteOffset, encoding) !== -1;
    }

    indexOf(value, byteOffset = 0, encoding) {
      const needle = typeof value === "number" ? new BufferPolyfill([value & 0xff]) : BufferPolyfill.from(value, encoding);
      const start = Math.max(0, Math.trunc(Number(byteOffset) || 0));
      if (!needle.length) {
        return start <= this.length ? start : this.length;
      }
      outer: for (let index = start; index <= this.length - needle.length; index += 1) {
        for (let offset = 0; offset < needle.length; offset += 1) {
          if (this[index + offset] !== needle[offset]) {
            continue outer;
          }
        }
        return index;
      }
      return -1;
    }

    lastIndexOf(value, byteOffset = this.length, encoding) {
      const needle = typeof value === "number" ? new BufferPolyfill([value & 0xff]) : BufferPolyfill.from(value, encoding);
      let start = Math.min(this.length - needle.length, Math.trunc(Number(byteOffset) || 0));
      if (!needle.length) {
        return Math.min(start, this.length);
      }
      outer: for (let index = start; index >= 0; index -= 1) {
        for (let offset = 0; offset < needle.length; offset += 1) {
          if (this[index + offset] !== needle[offset]) {
            continue outer;
          }
        }
        return index;
      }
      return -1;
    }

    slice(start = 0, end = this.length) {
      const [from, to] = normalizeBufferBounds(this.length, start, end);
      return new BufferPolyfill(super.slice(from, to));
    }

    subarray(start = 0, end = this.length) {
      const [from, to] = normalizeBufferBounds(this.length, start, end);
      return new BufferPolyfill(super.subarray(from, to));
    }

    toJSON() {
      return {
        type: "Buffer",
        data: Array.from(this)
      };
    }

    write(value, offset = 0, length, encoding) {
      if (typeof offset === "string") {
        encoding = offset;
        offset = 0;
        length = this.length;
      } else if (typeof length === "string") {
        encoding = length;
        length = this.length - Number(offset || 0);
      }
      const start = Math.max(0, Math.min(this.length, Math.trunc(Number(offset) || 0)));
      const maxLength = Math.max(0, Math.min(this.length - start, Math.trunc(Number(length ?? this.length - start))));
      const bytes = BufferPolyfill.from(String(value || ""), encoding);
      const slice = bytes.subarray(0, maxLength);
      this.set(slice, start);
      return slice.length;
    }

    _checkOffset(offset, size) {
      const target = Number(offset);
      if (!Number.isInteger(target) || target < 0 || target + size > this.length) {
        throw new RangeError("Index out of range");
      }
      return target;
    }

    _dataView() {
      return new DataView(this.buffer, this.byteOffset, this.byteLength);
    }

    readUInt8(offset = 0) {
      return this[this._checkOffset(offset, 1)];
    }

    readUint8(offset = 0) {
      return this.readUInt8(offset);
    }

    readInt8(offset = 0) {
      const value = this.readUInt8(offset);
      return value & 0x80 ? value - 0x100 : value;
    }

    readUInt16LE(offset = 0) {
      return this._dataView().getUint16(this._checkOffset(offset, 2), true);
    }

    readUInt16BE(offset = 0) {
      return this._dataView().getUint16(this._checkOffset(offset, 2), false);
    }

    readUint16LE(offset = 0) {
      return this.readUInt16LE(offset);
    }

    readUint16BE(offset = 0) {
      return this.readUInt16BE(offset);
    }

    readInt16LE(offset = 0) {
      return this._dataView().getInt16(this._checkOffset(offset, 2), true);
    }

    readInt16BE(offset = 0) {
      return this._dataView().getInt16(this._checkOffset(offset, 2), false);
    }

    readUInt32LE(offset = 0) {
      return this._dataView().getUint32(this._checkOffset(offset, 4), true);
    }

    readUInt32BE(offset = 0) {
      return this._dataView().getUint32(this._checkOffset(offset, 4), false);
    }

    readUint32LE(offset = 0) {
      return this.readUInt32LE(offset);
    }

    readUint32BE(offset = 0) {
      return this.readUInt32BE(offset);
    }

    readInt32LE(offset = 0) {
      return this._dataView().getInt32(this._checkOffset(offset, 4), true);
    }

    readInt32BE(offset = 0) {
      return this._dataView().getInt32(this._checkOffset(offset, 4), false);
    }

    readFloatLE(offset = 0) {
      return this._dataView().getFloat32(this._checkOffset(offset, 4), true);
    }

    readFloatBE(offset = 0) {
      return this._dataView().getFloat32(this._checkOffset(offset, 4), false);
    }

    readDoubleLE(offset = 0) {
      return this._dataView().getFloat64(this._checkOffset(offset, 8), true);
    }

    readDoubleBE(offset = 0) {
      return this._dataView().getFloat64(this._checkOffset(offset, 8), false);
    }

    readUIntLE(offset = 0, byteLength = 1) {
      const length = this._checkByteLength(byteLength);
      const start = this._checkOffset(offset, length);
      let value = 0;
      let multiplier = 1;
      for (let index = 0; index < length; index += 1) {
        value += this[start + index] * multiplier;
        multiplier *= 0x100;
      }
      return value;
    }

    readUIntBE(offset = 0, byteLength = 1) {
      const length = this._checkByteLength(byteLength);
      const start = this._checkOffset(offset, length);
      let value = 0;
      for (let index = 0; index < length; index += 1) {
        value = value * 0x100 + this[start + index];
      }
      return value;
    }

    readUintLE(offset = 0, byteLength = 1) {
      return this.readUIntLE(offset, byteLength);
    }

    readUintBE(offset = 0, byteLength = 1) {
      return this.readUIntBE(offset, byteLength);
    }

    readIntLE(offset = 0, byteLength = 1) {
      const value = this.readUIntLE(offset, byteLength);
      const limit = 2 ** (8 * byteLength - 1);
      return value >= limit ? value - 2 ** (8 * byteLength) : value;
    }

    readIntBE(offset = 0, byteLength = 1) {
      const value = this.readUIntBE(offset, byteLength);
      const limit = 2 ** (8 * byteLength - 1);
      return value >= limit ? value - 2 ** (8 * byteLength) : value;
    }

    _checkByteLength(byteLength) {
      const length = Number(byteLength);
      if (!Number.isInteger(length) || length < 1 || length > 6) {
        throw new RangeError("byteLength must be between 1 and 6");
      }
      return length;
    }

    _writeNumber(method, offset, size, value, littleEndian) {
      const start = this._checkOffset(offset, size);
      this._dataView()[method](start, value, littleEndian);
      return start + size;
    }

    writeUInt8(value, offset = 0) {
      const start = this._checkOffset(offset, 1);
      this[start] = Number(value) & 0xff;
      return start + 1;
    }

    writeUint8(value, offset = 0) {
      return this.writeUInt8(value, offset);
    }

    writeInt8(value, offset = 0) {
      return this.writeUInt8(value, offset);
    }

    writeUInt16LE(value, offset = 0) {
      return this._writeNumber("setUint16", offset, 2, Number(value), true);
    }

    writeUInt16BE(value, offset = 0) {
      return this._writeNumber("setUint16", offset, 2, Number(value), false);
    }

    writeUint16LE(value, offset = 0) {
      return this.writeUInt16LE(value, offset);
    }

    writeUint16BE(value, offset = 0) {
      return this.writeUInt16BE(value, offset);
    }

    writeInt16LE(value, offset = 0) {
      return this._writeNumber("setInt16", offset, 2, Number(value), true);
    }

    writeInt16BE(value, offset = 0) {
      return this._writeNumber("setInt16", offset, 2, Number(value), false);
    }

    writeUInt32LE(value, offset = 0) {
      return this._writeNumber("setUint32", offset, 4, Number(value), true);
    }

    writeUInt32BE(value, offset = 0) {
      return this._writeNumber("setUint32", offset, 4, Number(value), false);
    }

    writeUint32LE(value, offset = 0) {
      return this.writeUInt32LE(value, offset);
    }

    writeUint32BE(value, offset = 0) {
      return this.writeUInt32BE(value, offset);
    }

    writeInt32LE(value, offset = 0) {
      return this._writeNumber("setInt32", offset, 4, Number(value), true);
    }

    writeInt32BE(value, offset = 0) {
      return this._writeNumber("setInt32", offset, 4, Number(value), false);
    }

    writeFloatLE(value, offset = 0) {
      return this._writeNumber("setFloat32", offset, 4, Number(value), true);
    }

    writeFloatBE(value, offset = 0) {
      return this._writeNumber("setFloat32", offset, 4, Number(value), false);
    }

    writeDoubleLE(value, offset = 0) {
      return this._writeNumber("setFloat64", offset, 8, Number(value), true);
    }

    writeDoubleBE(value, offset = 0) {
      return this._writeNumber("setFloat64", offset, 8, Number(value), false);
    }

    writeUIntLE(value, offset = 0, byteLength = 1) {
      const length = this._checkByteLength(byteLength);
      const start = this._checkOffset(offset, length);
      let remaining = Number(value);
      for (let index = 0; index < length; index += 1) {
        this[start + index] = remaining & 0xff;
        remaining = Math.floor(remaining / 0x100);
      }
      return start + length;
    }

    writeUIntBE(value, offset = 0, byteLength = 1) {
      const length = this._checkByteLength(byteLength);
      const start = this._checkOffset(offset, length);
      let remaining = Number(value);
      for (let index = length - 1; index >= 0; index -= 1) {
        this[start + index] = remaining & 0xff;
        remaining = Math.floor(remaining / 0x100);
      }
      return start + length;
    }

    writeUintLE(value, offset = 0, byteLength = 1) {
      return this.writeUIntLE(value, offset, byteLength);
    }

    writeUintBE(value, offset = 0, byteLength = 1) {
      return this.writeUIntBE(value, offset, byteLength);
    }

    writeIntLE(value, offset = 0, byteLength = 1) {
      const length = this._checkByteLength(byteLength);
      const max = 2 ** (8 * length);
      const normalized = Number(value) < 0 ? max + Number(value) : Number(value);
      return this.writeUIntLE(normalized, offset, length);
    }

    writeIntBE(value, offset = 0, byteLength = 1) {
      const length = this._checkByteLength(byteLength);
      const max = 2 ** (8 * length);
      const normalized = Number(value) < 0 ? max + Number(value) : Number(value);
      return this.writeUIntBE(normalized, offset, length);
    }
  }

  const toBuffer = (value, encoding) => {
    if (BufferPolyfill.isBuffer(value)) {
      return value;
    }
    if (typeof value === "string" && normalizeEncoding(encoding) === "base64") {
      return new BufferPolyfill(base64ToBytes(value));
    }
    return BufferPolyfill.from(value, encoding);
  };

  class EventEmitter {
    constructor() {
      this._events = Object.create(null);
    }

    on(event, listener) {
      if (typeof listener !== "function") {
        throw new TypeError("Listener must be a function");
      }
      (this._events[event] || (this._events[event] = new Set())).add(listener);
      return this;
    }

    addListener(event, listener) {
      return this.on(event, listener);
    }

    prependListener(event, listener) {
      if (typeof listener !== "function") {
        throw new TypeError("Listener must be a function");
      }
      const existing = Array.from(this._events[event] || []);
      this._events[event] = new Set([listener, ...existing]);
      return this;
    }

    once(event, listener) {
      const wrapper = (...args) => {
        this.off(event, wrapper);
        listener(...args);
      };
      wrapper._original = listener;
      return this.on(event, wrapper);
    }

    prependOnceListener(event, listener) {
      const wrapper = (...args) => {
        this.off(event, wrapper);
        listener(...args);
      };
      wrapper._original = listener;
      return this.prependListener(event, wrapper);
    }

    off(event, listener) {
      const listeners = this._events[event];
      if (!listeners) {
        return this;
      }
      for (const candidate of listeners) {
        if (candidate === listener || candidate._original === listener) {
          listeners.delete(candidate);
        }
      }
      if (!listeners.size) {
        delete this._events[event];
      }
      return this;
    }

    removeListener(event, listener) {
      return this.off(event, listener);
    }

    removeAllListeners(event) {
      if (event === undefined) {
        this._events = Object.create(null);
      } else {
        delete this._events[event];
      }
      return this;
    }

    emit(event, ...args) {
      const listeners = this._events[event];
      if (!listeners || !listeners.size) {
        if (event === "error") {
          const error = args[0] instanceof Error ? args[0] : new Error(args[0] ? String(args[0]) : "Unhandled error event");
          throw error;
        }
        return false;
      }
      for (const listener of Array.from(listeners)) {
        listener(...args);
      }
      return true;
    }

    eventNames() {
      return Reflect.ownKeys(this._events);
    }

    listenerCount(event) {
      return this._events[event]?.size || 0;
    }

    listeners(event) {
      return Array.from(this._events[event] || [], (listener) => listener._original || listener);
    }

    rawListeners(event) {
      return Array.from(this._events[event] || []);
    }

    setMaxListeners() {
      return this;
    }

    getMaxListeners() {
      return 0;
    }
  }

  EventEmitter.listenerCount = (emitter, event) =>
    typeof emitter?.listenerCount === "function" ? emitter.listenerCount(event) : 0;

  const createEventsModule = () => {
    const once = (emitter, event) =>
      new Promise((resolve, reject) => {
        const cleanup = () => {
          emitter.off?.(event, handleEvent);
          emitter.off?.("error", handleError);
        };
        const handleEvent = (...args) => {
          cleanup();
          resolve(args);
        };
        const handleError = (error) => {
          cleanup();
          reject(error);
        };
        emitter.once?.(event, handleEvent);
        if (event !== "error") {
          emitter.once?.("error", handleError);
        }
      });
    const on = async function* (emitter, event) {
      const queue = [];
      let pending = null;
      const handler = (...args) => {
        if (pending) {
          pending({ value: args, done: false });
          pending = null;
        } else {
          queue.push(args);
        }
      };
      emitter.on?.(event, handler);
      try {
        while (true) {
          if (queue.length) {
            yield queue.shift();
          } else {
            yield await new Promise((resolve) => {
              pending = resolve;
            });
          }
        }
      } finally {
        emitter.off?.(event, handler);
      }
    };
    Object.assign(EventEmitter, {
      EventEmitter,
      default: EventEmitter,
      listenerCount: EventEmitter.listenerCount,
      on,
      once
    });
    return EventEmitter;
  };

  const inferPlatform = () => {
    const agent = String(navigator.userAgent || "").toLowerCase();
    if (agent.includes("windows")) {
      return "win32";
    }
    if (agent.includes("mac")) {
      return "darwin";
    }
    if (agent.includes("linux")) {
      return "linux";
    }
    return "linux";
  };

  const getBridgeBaseUrl = () => {
    const configured = String(window.__OToolsEnv?.noderBridgeBaseUrl || "").trim();
    if (configured) {
      return configured.replace(/\/+$/, "");
    }
    const protocol = String(window.location.protocol || "");
    const host = String(window.location.hostname || "");
    const isWindowsHost = protocol.startsWith("http") && host.endsWith(".localhost");
    if (isWindowsHost || inferPlatform() === "win32") {
      const scheme = protocol === "https:" ? "https:" : "http:";
      return `${scheme}//otools-noder.localhost`;
    }
    return "otools-noder://localhost";
  };

  const getBridgeAuthToken = () =>
    String(window.__OToolsEnv?.noderBridgeAuthToken || window.__OToolsEnv?.hostFileAuthToken || "").trim();

  const normalizeNodeError = (payload, fallbackMessage) => {
    const error = new Error(payload?.message || fallbackMessage || "Unknown noder error");
    if (payload && typeof payload === "object") {
      if (payload.code) {
        error.code = payload.code;
      }
      if (payload.errno !== undefined && payload.errno !== null) {
        error.errno = payload.errno;
      }
      if (payload.syscall) {
        error.syscall = payload.syscall;
      }
      if (payload.path) {
        error.path = payload.path;
      }
    }
    return error;
  };

  const parseBridgeResponse = (status, responseText) => {
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }
    if (status < 200 || status >= 300 || !payload || payload.ok !== true) {
      throw normalizeNodeError(payload?.error, `Noder request failed with status ${status}`);
    }
    return payload.value;
  };

  const callBridgeSync = (op, args = {}) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getBridgeBaseUrl()}/invoke`, false);
    const token = getBridgeAuthToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.send(JSON.stringify({ op, args }));
    return parseBridgeResponse(xhr.status || 500, xhr.responseText || "");
  };

  const callBridgeAsync = async (op, args = {}) => {
    const token = getBridgeAuthToken();
    const response = await fetch(`${getBridgeBaseUrl()}/invoke`, {
      method: "POST",
      mode: "cors",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: JSON.stringify({ op, args })
    });
    return parseBridgeResponse(response.status, await response.text());
  };

  const getOsInfo = () => {
    if (processInfoCache.os) {
      return processInfoCache.os;
    }
    try {
      processInfoCache.os = callBridgeSync("os.info");
    } catch {
      processInfoCache.os = {
        arch: "unknown",
        platform: inferPlatform(),
        type: inferPlatform() === "darwin" ? "Darwin" : inferPlatform() === "win32" ? "Windows_NT" : "Linux",
        release: "",
        hostname: "",
        homedir: "",
        tmpdir: "",
        endianness: "LE",
        eol: inferPlatform() === "win32" ? "\r\n" : "\n",
        cpus: [],
        totalmem: 0,
        freemem: 0,
        cwd: "."
      };
    }
    return processInfoCache.os;
  };

  const getProcessCwd = () => {
    if (processInfoCache.cwd) {
      return processInfoCache.cwd;
    }
    try {
      processInfoCache.cwd = callBridgeSync("process.cwd").cwd || ".";
    } catch {
      processInfoCache.cwd = getOsInfo().cwd || ".";
    }
    return processInfoCache.cwd;
  };

  const resolveHostInvoke = () => {
    const localInvoke =
      window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function"
        ? window.__TAURI_INTERNALS__.invoke
        : null;
    if (localInvoke) {
      return localInvoke;
    }
    try {
      const parentInvoke = window.parent?.__TAURI_INTERNALS__?.invoke;
      if (typeof parentInvoke === "function") {
        return parentInvoke;
      }
    } catch {
      // ignore cross-origin access
    }
    try {
      const topInvoke = window.top?.__TAURI_INTERNALS__?.invoke;
      if (typeof topInvoke === "function") {
        return topInvoke;
      }
    } catch {
      // ignore cross-origin access
    }
    return null;
  };

  const hasHostInvoke = () => typeof resolveHostInvoke() === "function";

  const callHostInvoke = (command, payload) => {
    const invoke = resolveHostInvoke();
    if (!invoke) {
      return Promise.reject(new Error(`OTools host invoke is unavailable for ${command}`));
    }
    try {
      return Promise.resolve(invoke(command, payload));
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const toPathString = (value) => {
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof URL && value.protocol === "file:") {
      return decodeURIComponent(value.pathname);
    }
    if (value && typeof value === "object" && typeof value.href === "string") {
      return String(value.href);
    }
    return String(value || "");
  };

  const normalizeFsOptions = (options) => {
    if (typeof options === "string") {
      return { encoding: options };
    }
    if (options && typeof options === "object") {
      return { ...options };
    }
    return {};
  };

  const encodeFsData = (data, encoding) => {
    if (typeof data === "string") {
      if (normalizeEncoding(encoding) === "base64") {
        return data;
      }
      return bytesToBase64(textEncoder.encode(data));
    }
    return bytesToBase64(toBuffer(data));
  };

  const decodeFsData = (payload, options) => {
    const encoding = normalizeEncoding(options.encoding);
    const bytes = new BufferPolyfill(base64ToBytes(payload?.dataBase64 || ""));
    if (!encoding) {
      return bytes;
    }
    if (encoding === "base64") {
      return payload?.dataBase64 || "";
    }
    return bytes.toString(encoding);
  };

  class Stats {
    constructor(payload) {
      this.dev = 0;
      this.mode = payload?.mode || 0;
      this.nlink = 0;
      this.uid = 0;
      this.gid = 0;
      this.rdev = 0;
      this.blksize = 0;
      this.ino = 0;
      this.size = payload?.size || 0;
      this.blocks = 0;
      this.atimeMs = payload?.accessedAtMs || 0;
      this.mtimeMs = payload?.modifiedAtMs || 0;
      this.ctimeMs = payload?.createdAtMs || 0;
      this.birthtimeMs = payload?.createdAtMs || 0;
      this.atime = new Date(this.atimeMs || 0);
      this.mtime = new Date(this.mtimeMs || 0);
      this.ctime = new Date(this.ctimeMs || 0);
      this.birthtime = new Date(this.birthtimeMs || 0);
      this._payload = payload || {};
    }

    isFile() {
      return Boolean(this._payload?.isFile);
    }

    isDirectory() {
      return Boolean(this._payload?.isDirectory);
    }

    isSymbolicLink() {
      return Boolean(this._payload?.isSymlink);
    }
  }

  class Dirent {
    constructor(entry) {
      this.name = entry?.name || "";
      this.path = entry?.path || "";
      this._entry = entry || {};
    }

    isFile() {
      return Boolean(this._entry?.isFile);
    }

    isDirectory() {
      return Boolean(this._entry?.isDirectory);
    }

    isSymbolicLink() {
      return Boolean(this._entry?.isSymlink);
    }
  }

  const createFsModule = () => {
    const readFileSync = (path, options) => {
      const normalized = normalizeFsOptions(options);
      const payload = callBridgeSync("fs.readFile", { path: toPathString(path) });
      return decodeFsData(payload, normalized);
    };

    const readFile = (path, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const normalized = normalizeFsOptions(options);
      const promise = callBridgeAsync("fs.readFile", { path: toPathString(path) }).then((payload) =>
        decodeFsData(payload, normalized)
      );
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const writeFileSync = (path, data, options) => {
      const normalized = normalizeFsOptions(options);
      return callBridgeSync("fs.writeFile", {
        path: toPathString(path),
        dataBase64: encodeFsData(data, normalized.encoding),
        append: false
      });
    };

    const writeFile = (path, data, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const normalized = normalizeFsOptions(options);
      const promise = callBridgeAsync("fs.writeFile", {
        path: toPathString(path),
        dataBase64: encodeFsData(data, normalized.encoding),
        append: false
      });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const appendFileSync = (path, data, options) => {
      const normalized = normalizeFsOptions(options);
      return callBridgeSync("fs.writeFile", {
        path: toPathString(path),
        dataBase64: encodeFsData(data, normalized.encoding),
        append: true
      });
    };

    const appendFile = (path, data, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const normalized = normalizeFsOptions(options);
      const promise = callBridgeAsync("fs.writeFile", {
        path: toPathString(path),
        dataBase64: encodeFsData(data, normalized.encoding),
        append: true
      });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const existsSync = (path) => Boolean(callBridgeSync("fs.exists", { path: toPathString(path) }).exists);

    const statSync = (path) => new Stats(callBridgeSync("fs.stat", { path: toPathString(path) }));
    const lstatSync = (path) => new Stats(callBridgeSync("fs.lstat", { path: toPathString(path) }));

    const stat = (path, callback) => {
      const promise = callBridgeAsync("fs.stat", { path: toPathString(path) }).then((payload) => new Stats(payload));
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const lstat = (path, callback) => {
      const promise = callBridgeAsync("fs.lstat", { path: toPathString(path) }).then((payload) => new Stats(payload));
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const readdirSync = (path, options) => {
      const normalized = normalizeFsOptions(options);
      const entries = callBridgeSync("fs.readdir", { path: toPathString(path) }) || [];
      if (normalized.withFileTypes) {
        return entries.map((entry) => new Dirent(entry));
      }
      return entries.map((entry) => entry.name);
    };

    const readdir = (path, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const normalized = normalizeFsOptions(options);
      const promise = callBridgeAsync("fs.readdir", { path: toPathString(path) }).then((entries) =>
        normalized.withFileTypes ? (entries || []).map((entry) => new Dirent(entry)) : (entries || []).map((entry) => entry.name)
      );
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const mkdirSync = (path, options = {}) => {
      const recursive = typeof options === "object" ? Boolean(options?.recursive) : false;
      return callBridgeSync("fs.mkdir", { path: toPathString(path), recursive });
    };

    const mkdir = (path, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const recursive = typeof options === "object" ? Boolean(options?.recursive) : false;
      const promise = callBridgeAsync("fs.mkdir", { path: toPathString(path), recursive });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const rmSync = (path, options = {}) =>
      callBridgeSync("fs.rm", {
        path: toPathString(path),
        recursive: Boolean(options?.recursive),
        force: Boolean(options?.force)
      });

    const rm = (path, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const promise = callBridgeAsync("fs.rm", {
        path: toPathString(path),
        recursive: Boolean(options?.recursive),
        force: Boolean(options?.force)
      });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const unlinkSync = (path) => rmSync(path);
    const unlink = (path, callback) => rm(path, {}, callback);
    const rmdirSync = (path, options = {}) => rmSync(path, options);
    const rmdir = (path, options, callback) => rm(path, options, callback);

    const renameSync = (from, to) => callBridgeSync("fs.rename", { from: toPathString(from), to: toPathString(to) });
    const rename = (from, to, callback) => {
      const promise = callBridgeAsync("fs.rename", { from: toPathString(from), to: toPathString(to) });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const copyFileSync = (from, to) => callBridgeSync("fs.copyFile", { from: toPathString(from), to: toPathString(to) });
    const copyFile = (from, to, callback) => {
      const promise = callBridgeAsync("fs.copyFile", { from: toPathString(from), to: toPathString(to) });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const realpathSync = (path) => callBridgeSync("fs.realpath", { path: toPathString(path) }).path || "";
    const realpath = (path, callback) => {
      const promise = callBridgeAsync("fs.realpath", { path: toPathString(path) }).then((payload) => payload.path || "");
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const accessSync = (path) => callBridgeSync("fs.access", { path: toPathString(path) });
    const access = (path, mode, callback) => {
      if (typeof mode === "function") {
        callback = mode;
      }
      const promise = callBridgeAsync("fs.access", { path: toPathString(path) });
      if (typeof callback === "function") {
        promise.then(() => callback(null), (error) => callback(error));
        return;
      }
      return promise;
    };

    const promises = {
      readFile: (path, options) => readFile(path, options),
      writeFile: (path, data, options) => writeFile(path, data, options),
      appendFile: (path, data, options) => appendFile(path, data, options),
      stat: (path) => stat(path),
      lstat: (path) => lstat(path),
      readdir: (path, options) => readdir(path, options),
      mkdir: (path, options) => mkdir(path, options),
      rm: (path, options) => rm(path, options),
      rename: (from, to) => rename(from, to),
      copyFile: (from, to) => copyFile(from, to),
      realpath: (path) => realpath(path),
      access: (path) => access(path)
    };

    return {
      constants: {
        F_OK: 0,
        R_OK: 4,
        W_OK: 2,
        X_OK: 1
      },
      Dirent,
      Stats,
      promises,
      readFileSync,
      readFile,
      writeFileSync,
      writeFile,
      appendFileSync,
      appendFile,
      existsSync,
      statSync,
      stat,
      lstatSync,
      lstat,
      readdirSync,
      readdir,
      mkdirSync,
      mkdir,
      rmSync,
      rm,
      unlinkSync,
      unlink,
      rmdirSync,
      rmdir,
      renameSync,
      rename,
      copyFileSync,
      copyFile,
      realpathSync,
      realpath,
      accessSync,
      access
    };
  };

  const normalizeSegments = (segments, allowAboveRoot) => {
    const out = [];
    for (const segment of segments) {
      if (!segment || segment === ".") {
        continue;
      }
      if (segment === "..") {
        if (out.length && out[out.length - 1] !== "..") {
          out.pop();
        } else if (allowAboveRoot) {
          out.push("..");
        }
      } else {
        out.push(segment);
      }
    }
    return out;
  };

  const createPosixPath = () => {
    const sep = "/";

    const split = (path) => String(path || "").split("/").filter(Boolean);
    const isAbsolute = (path) => String(path || "").startsWith("/");
    const normalize = (path) => {
      const input = String(path || "");
      const absolute = isAbsolute(input);
      const trailingSlash = input.endsWith("/");
      const body = normalizeSegments(split(input), !absolute).join(sep);
      let output = absolute ? `/${body}` : body || ".";
      if (!absolute && !body) {
        output = ".";
      }
      if (trailingSlash && output !== "/" && output !== ".") {
        output += "/";
      }
      return output;
    };
    const join = (...parts) => normalize(parts.filter((item) => item !== undefined && item !== null).join("/"));
    const dirname = (path) => {
      const input = normalize(path);
      if (input === "/") {
        return "/";
      }
      const value = input.replace(/\/+$/, "");
      const index = value.lastIndexOf("/");
      if (index <= 0) {
        return index === 0 ? "/" : ".";
      }
      return value.slice(0, index);
    };
    const basename = (path, ext) => {
      const value = normalize(path).replace(/\/+$/, "").split("/").pop() || "";
      if (ext && value.endsWith(ext)) {
        return value.slice(0, -ext.length);
      }
      return value;
    };
    const extname = (path) => {
      const value = basename(path);
      const index = value.lastIndexOf(".");
      return index > 0 ? value.slice(index) : "";
    };
    const resolve = (...parts) => {
      let resolved = "";
      for (let index = parts.length - 1; index >= -1; index -= 1) {
        const part = index >= 0 ? String(parts[index] || "") : getProcessCwd();
        if (!part) {
          continue;
        }
        resolved = resolved ? `${part}/${resolved}` : part;
        if (part.startsWith("/")) {
          break;
        }
      }
      return normalize(resolved);
    };
    const parse = (path) => {
      const dir = dirname(path);
      const base = basename(path);
      const ext = extname(path);
      const name = ext ? base.slice(0, -ext.length) : base;
      return { root: isAbsolute(path) ? "/" : "", dir, base, ext, name };
    };
    const format = (parts) => {
      const dir = parts?.dir || parts?.root || "";
      const base = parts?.base || `${parts?.name || ""}${parts?.ext || ""}`;
      return dir ? join(dir, base) : base;
    };
    const relative = (from, to) => {
      const fromParts = normalize(resolve(from)).split("/").filter(Boolean);
      const toParts = normalize(resolve(to)).split("/").filter(Boolean);
      while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
        fromParts.shift();
        toParts.shift();
      }
      return normalizeSegments(
        fromParts.map(() => "..").concat(toParts),
        true
      ).join("/") || "";
    };
    return {
      sep,
      delimiter: ":",
      basename,
      dirname,
      extname,
      format,
      isAbsolute,
      join,
      normalize,
      parse,
      relative,
      resolve
    };
  };

  const createWin32Path = () => {
    const sep = "\\";
    const splitDevice = (path) => {
      const input = String(path || "");
      const match = input.match(/^([A-Za-z]:)([\\/]|$)/);
      if (match) {
        return { root: `${match[1]}\\`, tail: input.slice(match[0].length) };
      }
      if (input.startsWith("\\") || input.startsWith("/")) {
        return { root: "\\", tail: input.replace(/^[\\/]+/, "") };
      }
      return { root: "", tail: input };
    };
    const split = (path) => splitDevice(path).tail.split(/[\\/]+/).filter(Boolean);
    const isAbsolute = (path) => Boolean(splitDevice(path).root);
    const normalize = (path) => {
      const input = String(path || "");
      const parsed = splitDevice(input);
      const body = normalizeSegments(split(input), !parsed.root).join(sep);
      const trailingSlash = /[\\/]$/.test(input);
      let output = parsed.root ? `${parsed.root}${body}` : body || ".";
      if (!parsed.root && !body) {
        output = ".";
      }
      if (trailingSlash && output !== "\\" && output !== ".") {
        output += "\\";
      }
      return output.replace(/\\{2,}/g, "\\");
    };
    const join = (...parts) => normalize(parts.filter((item) => item !== undefined && item !== null).join("\\"));
    const dirname = (path) => {
      const input = normalize(path);
      const parsed = splitDevice(input);
      const value = input.replace(/[\\/]+$/, "");
      const index = value.lastIndexOf("\\");
      if (index < parsed.root.length) {
        return parsed.root || ".";
      }
      return value.slice(0, index);
    };
    const basename = (path, ext) => {
      const value = normalize(path).replace(/[\\/]+$/, "").split(/[/\\]/).pop() || "";
      if (ext && value.endsWith(ext)) {
        return value.slice(0, -ext.length);
      }
      return value;
    };
    const extname = (path) => {
      const value = basename(path);
      const index = value.lastIndexOf(".");
      return index > 0 ? value.slice(index) : "";
    };
    const resolve = (...parts) => {
      let resolved = "";
      let resolvedRoot = "";
      for (let index = parts.length - 1; index >= -1; index -= 1) {
        const part = index >= 0 ? String(parts[index] || "") : getProcessCwd();
        if (!part) {
          continue;
        }
        const parsed = splitDevice(part);
        resolved = resolved ? `${parsed.tail}\\${resolved}` : parsed.tail;
        if (parsed.root) {
          resolvedRoot = parsed.root;
          break;
        }
      }
      return normalize(`${resolvedRoot}${resolved}`);
    };
    const parse = (path) => {
      const normalized = normalize(path);
      const parsed = splitDevice(normalized);
      const dir = dirname(normalized);
      const base = basename(normalized);
      const ext = extname(normalized);
      const name = ext ? base.slice(0, -ext.length) : base;
      return { root: parsed.root, dir, base, ext, name };
    };
    const format = (parts) => {
      const dir = parts?.dir || parts?.root || "";
      const base = parts?.base || `${parts?.name || ""}${parts?.ext || ""}`;
      return dir ? join(dir, base) : base;
    };
    const relative = (from, to) => {
      const fromResolved = normalize(resolve(from));
      const toResolved = normalize(resolve(to));
      const fromParts = fromResolved.split(/[/\\]+/).filter(Boolean);
      const toParts = toResolved.split(/[/\\]+/).filter(Boolean);
      while (fromParts.length && toParts.length && fromParts[0].toLowerCase() === toParts[0].toLowerCase()) {
        fromParts.shift();
        toParts.shift();
      }
      return normalizeSegments(
        fromParts.map(() => "..").concat(toParts),
        true
      ).join("\\") || "";
    };
    return {
      sep,
      delimiter: ";",
      basename,
      dirname,
      extname,
      format,
      isAbsolute,
      join,
      normalize,
      parse,
      relative,
      resolve
    };
  };

  const createPathModule = () => {
    const posix = createPosixPath();
    const win32 = createWin32Path();
    const active = getOsInfo().platform === "win32" ? win32 : posix;
    return Object.assign({}, active, { posix, win32 });
  };

  const sharedPathModule = createPathModule();
  const sharedFsModule = createFsModule();
  const commonJsCache = Object.create(null);

  const fileUrlToPath = (value) => {
    const parsed = new URL(String(value || ""));
    let pathname = decodeURIComponent(parsed.pathname || "");
    if (getOsInfo().platform === "win32" && /^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname;
  };

  const normalizeModuleFilename = (value) => {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    let filename = text;
    if (/^file:\/\//i.test(filename)) {
      filename = fileUrlToPath(filename);
    }
    try {
      if (sharedFsModule.existsSync(filename)) {
        return sharedFsModule.realpathSync(filename);
      }
    } catch {
      // ignore
    }
    return filename;
  };

  const isRelativeSpecifier = (specifier) =>
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../");

  const isAbsoluteSpecifier = (specifier) =>
    /^file:\/\//i.test(specifier) || sharedPathModule.isAbsolute(specifier);

  const safeStatSync = (filename) => {
    try {
      return sharedFsModule.statSync(filename);
    } catch {
      return null;
    }
  };

  const safeReadJsonSync = (filename) => {
    try {
      return JSON.parse(sharedFsModule.readFileSync(filename, "utf8"));
    } catch {
      return null;
    }
  };

  const createNodeModulePaths = (startDirectory) => {
    const paths = [];
    const seen = new Set();
    const addPath = (value) => {
      if (!seen.has(value)) {
        seen.add(value);
        paths.push(value);
      }
    };
    let current = sharedPathModule.resolve(startDirectory || getProcessCwd());
    while (current) {
      if (sharedPathModule.basename(current) === "node_modules") {
        addPath(current);
      } else {
        addPath(sharedPathModule.join(current, "node_modules"));
      }
      const parent = sharedPathModule.dirname(current);
      if (!parent || parent === current || parent === ".") {
        break;
      }
      current = parent;
    }
    return paths;
  };

  const packageExportTargets = (value) => {
    if (typeof value === "string") {
      return [value];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => packageExportTargets(item));
    }
    if (value && typeof value === "object") {
      const targets = [];
      for (const key of ["browser", "require", "node", "import", "default"]) {
        targets.push(...packageExportTargets(value[key]));
      }
      return targets;
    }
    return [];
  };

  const packageExportsCandidates = (manifest, subpath = "") => {
    const candidates = [];
    const exportsField = manifest.exports;
    if (!exportsField) {
      return candidates;
    }
    const exportKey = subpath ? `./${String(subpath).replace(/^\.?\//, "")}` : ".";
    if (!subpath && (typeof exportsField === "string" || Array.isArray(exportsField))) {
      candidates.push(...packageExportTargets(exportsField));
    } else if (exportsField && typeof exportsField === "object") {
      const hasSubpathKeys = Object.keys(exportsField).some((key) => key.startsWith("."));
      const direct = exportsField[exportKey] ?? (!subpath ? (hasSubpathKeys ? exportsField.default ?? exportsField.require ?? exportsField.import : exportsField) : undefined);
      candidates.push(...packageExportTargets(direct));
      if (subpath && !candidates.length) {
        for (const [pattern, target] of Object.entries(exportsField)) {
          if (!pattern.includes("*")) {
            continue;
          }
          const [prefix, suffix = ""] = pattern.split("*");
          if (exportKey.startsWith(prefix) && exportKey.endsWith(suffix)) {
            const wildcard = exportKey.slice(prefix.length, exportKey.length - suffix.length);
            for (const item of packageExportTargets(target)) {
              candidates.push(item.replace(/\*/g, wildcard));
            }
          }
        }
      }
    }
    return candidates.filter(Boolean);
  };

  const packageMainCandidates = (directory) => {
    const manifest = safeReadJsonSync(sharedPathModule.join(directory, "package.json"));
    if (!manifest || typeof manifest !== "object") {
      return [];
    }
    const candidates = packageExportsCandidates(manifest);
    for (const key of ["browser", "main", "module"]) {
      const value = manifest[key];
      if (typeof value === "string") {
        candidates.push(value);
      }
    }
    return candidates.filter(Boolean);
  };

  const tryResolveModuleFile = (candidate) => {
    const stats = safeStatSync(candidate);
    if (stats && stats.isFile()) {
      try {
        return sharedFsModule.realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
    if (stats && stats.isDirectory()) {
      for (const entry of packageMainCandidates(candidate)) {
        const resolved = tryResolveModuleFile(sharedPathModule.join(candidate, entry));
        if (resolved) {
          return resolved;
        }
      }
    }
    const attempts = [
      `${candidate}.js`,
      `${candidate}.json`,
      sharedPathModule.join(candidate, "index.js"),
      sharedPathModule.join(candidate, "index.json")
    ];
    for (const attempt of attempts) {
      const stats = safeStatSync(attempt);
      if (stats && stats.isFile()) {
        try {
          return sharedFsModule.realpathSync(attempt);
        } catch {
          return attempt;
        }
      }
    }
    return null;
  };

  const parsePackageSpecifier = (specifier) => {
    const parts = String(specifier || "").split("/");
    if (parts[0]?.startsWith("@") && parts.length >= 2) {
      return {
        packageName: `${parts[0]}/${parts[1]}`,
        subpath: parts.slice(2).join("/")
      };
    }
    return {
      packageName: parts[0] || "",
      subpath: parts.slice(1).join("/")
    };
  };

  const resolveNodeModuleFilename = (specifier, parentFilename) => {
    const { packageName, subpath } = parsePackageSpecifier(specifier);
    if (!packageName) {
      return null;
    }
    const startDirectory = parentFilename
      ? sharedPathModule.dirname(parentFilename)
      : getProcessCwd();
    for (const nodeModulesPath of createNodeModulePaths(startDirectory)) {
      const packageRoot = sharedPathModule.join(nodeModulesPath, packageName);
      const manifest = safeReadJsonSync(sharedPathModule.join(packageRoot, "package.json"));
      if (manifest && typeof manifest === "object") {
        for (const exported of packageExportsCandidates(manifest, subpath)) {
          const resolved = tryResolveModuleFile(sharedPathModule.join(packageRoot, exported));
          if (resolved) {
            return resolved;
          }
        }
      }
      const candidate = subpath ? sharedPathModule.join(packageRoot, subpath) : packageRoot;
      const resolved = tryResolveModuleFile(candidate);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  };

  const resolveLocalModuleFilename = (specifier, parentFilename) => {
    const raw = /^file:\/\//i.test(specifier) ? fileUrlToPath(specifier) : specifier;
    if (isAbsoluteSpecifier(raw)) {
      return tryResolveModuleFile(raw);
    }
    if (!isRelativeSpecifier(raw)) {
      return resolveNodeModuleFilename(raw, parentFilename);
    }
    if (!parentFilename) {
      throw new Error(`Cannot resolve relative module without base file: ${specifier}`);
    }
    return tryResolveModuleFile(sharedPathModule.resolve(sharedPathModule.dirname(parentFilename), raw));
  };

  const escapeSourceUrl = (filename) =>
    String(filename || "")
      .replace(/\\/g, "/")
      .replace(/\r/g, "")
      .replace(/\n/g, "");

  const createModuleRecord = (filename, parentModule) => {
    const module = {
      id: filename,
      filename,
      exports: {},
      loaded: false,
      parent: parentModule || null,
      children: [],
      paths: createNodeModulePaths(sharedPathModule.dirname(filename))
    };
    if (parentModule && Array.isArray(parentModule.children)) {
      parentModule.children.push(module);
    }
    commonJsCache[filename] = module;
    return module;
  };

  const resolveRequireTarget = (specifier, parentFilename) => {
    const raw = String(specifier || "");
    const builtinId = aliasMap[raw];
    if (builtinId) {
      return { type: "builtin", id: builtinId };
    }
    const filename = resolveLocalModuleFilename(raw, parentFilename);
    if (filename) {
      return { type: "file", id: filename };
    }
    throw new Error(`Unsupported require target: ${raw}`);
  };

  const loadFileModule = (filename, parentModule) => {
    const normalizedFilename = normalizeModuleFilename(filename);
    if (commonJsCache[normalizedFilename]) {
      return commonJsCache[normalizedFilename].exports;
    }

    const module = createModuleRecord(normalizedFilename, parentModule || null);
    const ext = sharedPathModule.extname(normalizedFilename).toLowerCase();

    if (ext === ".json") {
      const source = sharedFsModule.readFileSync(normalizedFilename, { encoding: "utf8" });
      module.exports = JSON.parse(source);
      module.loaded = true;
      return module.exports;
    }

    const source = sharedFsModule.readFileSync(normalizedFilename, { encoding: "utf8" });
    const localRequire = createModuleRequire(module);
    module.require = localRequire;
    const dirname = sharedPathModule.dirname(normalizedFilename);
    const factory = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      "process",
      "Buffer",
      "global",
      `${source}\n//# sourceURL=${escapeSourceUrl(normalizedFilename)}`
    );
    factory(
      module.exports,
      localRequire,
      module,
      normalizedFilename,
      dirname,
      builtinRequire("process"),
      BufferPolyfill,
      window
    );
    module.loaded = true;
    return module.exports;
  };

  function createModuleRequire(moduleOrFilename) {
    const parentFilename =
      typeof moduleOrFilename === "string"
        ? normalizeModuleFilename(moduleOrFilename)
        : normalizeModuleFilename(moduleOrFilename?.filename || "");
    const parentModule =
      typeof moduleOrFilename === "string"
        ? commonJsCache[parentFilename] || null
        : moduleOrFilename || null;

    const localRequire = (specifier) => {
      const target = resolveRequireTarget(specifier, parentFilename);
      if (target.type === "builtin") {
        return builtinRequire(target.id);
      }
      return loadFileModule(target.id, parentModule);
    };

    localRequire.resolve = (specifier) => resolveRequireTarget(specifier, parentFilename).id;
    localRequire.cache = commonJsCache;
    return localRequire;
  }

  const runEntryModule = (filename, factory) => {
    const normalizedFilename = normalizeModuleFilename(filename) || "preload.js";
    const module = commonJsCache[normalizedFilename] || createModuleRecord(normalizedFilename, null);
    const localRequire = createModuleRequire(module);
    module.require = localRequire;
    factory(
      module.exports,
      localRequire,
      module,
      normalizedFilename,
      sharedPathModule.dirname(normalizedFilename),
      builtinRequire("process"),
      BufferPolyfill,
      window
    );
    module.loaded = true;
    return module.exports;
  };

  const createOsModule = () => ({
    arch: () => getOsInfo().arch || "unknown",
    cpus: () => Array.isArray(getOsInfo().cpus) ? getOsInfo().cpus.slice() : [],
    endianness: () => getOsInfo().endianness || "LE",
    freemem: () => Number(getOsInfo().freemem || 0),
    homedir: () => getOsInfo().homedir || "",
    hostname: () => getOsInfo().hostname || "",
    platform: () => getOsInfo().platform || inferPlatform(),
    release: () => getOsInfo().release || "",
    tmpdir: () => getOsInfo().tmpdir || "",
    totalmem: () => Number(getOsInfo().totalmem || 0),
    type: () => getOsInfo().type || "Linux",
    EOL: getOsInfo().eol || "\n"
  });

  const toExecResult = (payload, options = {}) => {
    const encoding = normalizeEncoding(options.encoding);
    const stdout = new BufferPolyfill(base64ToBytes(payload?.stdoutBase64 || ""));
    const stderr = new BufferPolyfill(base64ToBytes(payload?.stderrBase64 || ""));
    return {
      status: payload?.status,
      signal: payload?.signal ?? null,
      stdout,
      stderr,
      stdoutValue: encoding ? stdout.toString(encoding) : stdout,
      stderrValue: encoding ? stderr.toString(encoding) : stderr
    };
  };

  const createExecError = (command, result) => {
    const error = new Error(`Command failed: ${command}`);
    error.status = result.status;
    error.signal = result.signal;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.output = [null, result.stdout, result.stderr];
    return error;
  };

  const runCommandSync = (command, args, options = {}, shell = false) => {
    const payload = callBridgeSync("childProcess.run", {
      command,
      args: Array.isArray(args) ? args.map((item) => String(item)) : [],
      cwd: options.cwd,
      env: options.env,
      shell,
      inputBase64: options.input ? encodeFsData(options.input, options.encoding) : undefined
    });
    const result = toExecResult(payload, options);
    if (options.stdio === "inherit") {
      if (result.stdout.length) {
        console.log(result.stdout.toString("utf8"));
      }
      if (result.stderr.length) {
        console.error(result.stderr.toString("utf8"));
      }
    }
    if (!(payload && payload.success)) {
      throw createExecError(command, result);
    }
    return options.stdio === "inherit" ? null : result.stdoutValue;
  };

  class ChildReadableStream extends EventEmitter {
    constructor() {
      super();
      this.readable = true;
      this.destroyed = false;
      this._encoding = null;
    }

    setEncoding(encoding) {
      this._encoding = normalizeEncoding(encoding) || "utf-8";
      return this;
    }

    pipe(destination) {
      this.on("data", (chunk) => {
        if (destination && typeof destination.write === "function") {
          destination.write(chunk);
        }
      });
      this.on("end", () => {
        if (destination && typeof destination.end === "function") {
          destination.end();
        }
      });
      return destination;
    }

    destroy(error) {
      if (this.destroyed) {
        return this;
      }
      this.destroyed = true;
      this.readable = false;
      if (error) {
        this.emit("error", error);
      }
      this.emit("close");
      return this;
    }

    _push(base64Value) {
      if (!this.readable) {
        return;
      }
      const chunk = new BufferPolyfill(base64ToBytes(base64Value || ""));
      this.emit("data", this._encoding ? chunk.toString(this._encoding) : chunk);
    }

    _close() {
      if (!this.readable) {
        return;
      }
      this.readable = false;
      this.emit("end");
      this.emit("close");
    }
  }

  class ChildWritableStream extends EventEmitter {
    constructor(id) {
      super();
      this._id = id;
      this.writable = true;
      this.destroyed = false;
      this._queue = Promise.resolve();
    }

    _enqueue(taskFactory, callback) {
      const task = this._queue.then(taskFactory, taskFactory);
      this._queue = task.then(
        () => undefined,
        () => undefined
      );
      if (typeof callback === "function") {
        task.then(
          () => callback(null),
          (error) => callback(error)
        );
      }
      return true;
    }

    write(chunk, encoding, callback) {
      if (typeof encoding === "function") {
        callback = encoding;
        encoding = undefined;
      }
      if (!this.writable || this.destroyed) {
        const error = new Error("stdin is closed");
        if (typeof callback === "function") {
          callback(error);
        }
        this.emit("error", error);
        return false;
      }
      return this._enqueue(
        () =>
          callBridgeAsync("childProcess.stdinWrite", {
            id: this._id,
            dataBase64: encodeFsData(chunk, encoding)
          }),
        callback
      );
    }

    end(chunk, encoding, callback) {
      if (typeof chunk === "function") {
        callback = chunk;
        chunk = undefined;
        encoding = undefined;
      } else if (typeof encoding === "function") {
        callback = encoding;
        encoding = undefined;
      }
      if (chunk !== undefined) {
        this.write(chunk, encoding);
      }
      const finalize = () =>
        callBridgeAsync("childProcess.stdinEnd", { id: this._id }).then(() => {
          this.writable = false;
          this.emit("finish");
          this.emit("close");
        });
      this._enqueue(finalize, callback);
      return this;
    }

    destroy(error) {
      if (this.destroyed) {
        return this;
      }
      this.destroyed = true;
      this.writable = false;
      void callBridgeAsync("childProcess.stdinEnd", { id: this._id }).catch(() => {});
      if (error) {
        this.emit("error", error);
      }
      this.emit("close");
      return this;
    }
  }

  const spawnChildProcess = (command, args = [], options = {}) => {
    const session = callBridgeSync("childProcess.spawn", {
      command: String(command || ""),
      args: Array.isArray(args) ? args.map((item) => String(item)) : [],
      cwd: options.cwd,
      env: options.env,
      shell: Boolean(options.shell),
      inputBase64: options.input ? encodeFsData(options.input, options.encoding) : undefined
    });

    const child = new EventEmitter();
    child.pid = Number(session?.pid || 0);
    child.killed = false;
    child.exitCode = null;
    child.signalCode = null;
    child.stdin = new ChildWritableStream(session.id);
    child.stdout = new ChildReadableStream();
    child.stderr = new ChildReadableStream();

    let cursor = 0;
    let closed = false;

    const finish = () => {
      if (closed) {
        return;
      }
      closed = true;
      child.stdin.writable = false;
      void callBridgeAsync("childProcess.dispose", { id: session.id }).catch(() => {});
    };

    const poll = async () => {
      if (closed) {
        return;
      }
      try {
        const payload = await callBridgeAsync("childProcess.poll", {
          id: session.id,
          cursor
        });
        const events = Array.isArray(payload?.events) ? payload.events : [];
        for (const event of events) {
          cursor = Math.max(cursor, Number(event?.seq || 0));
          if (event?.type === "data") {
            if (event.stream === "stderr") {
              child.stderr._push(event.dataBase64 || "");
            } else {
              child.stdout._push(event.dataBase64 || "");
            }
            continue;
          }
          if (event?.type === "error") {
            const error = normalizeNodeError(
              { message: event.message || "child process error" },
              "child process error"
            );
            if (event.stream === "stderr") {
              child.stderr.emit("error", error);
            } else if (event.stream === "stdout") {
              child.stdout.emit("error", error);
            } else {
              child.emit("error", error);
            }
            continue;
          }
          if (event?.type === "close") {
            child.exitCode = event.status ?? null;
            child.signalCode = event.signal ?? null;
            child.stdout._close();
            child.stderr._close();
            child.emit("exit", child.exitCode, child.signalCode);
            child.emit("close", child.exitCode, child.signalCode);
            finish();
            return;
          }
        }
        if (payload?.done) {
          child.stdout._close();
          child.stderr._close();
          child.emit("close", child.exitCode, child.signalCode);
          finish();
          return;
        }
        setTimeout(poll, Number(options.pollInterval || 60));
      } catch (error) {
        child.stdout.destroy(error);
        child.stderr.destroy(error);
        child.emit("error", error);
        finish();
      }
    };

    child.kill = () => {
      child.killed = true;
      void callBridgeAsync("childProcess.kill", { id: session.id }).catch((error) => {
        child.emit("error", error);
      });
      return true;
    };

    child.disconnect = () => {};

    setTimeout(poll, 0);
    return child;
  };

  const createChildProcessModule = () => {
    const execSync = (command, options = {}) =>
      runCommandSync(String(command || ""), [], options, options.shell !== undefined ? options.shell : true);

    const spawnSync = (command, args = [], options = {}) => {
      const payload = callBridgeSync("childProcess.run", {
        command: String(command || ""),
        args: Array.isArray(args) ? args.map((item) => String(item)) : [],
        cwd: options.cwd,
        env: options.env,
        shell: Boolean(options.shell),
        inputBase64: options.input ? encodeFsData(options.input, options.encoding) : undefined
      });
      const result = toExecResult(payload, options);
      return {
        pid: 0,
        output: [null, result.stdout, result.stderr],
        stdout: result.stdoutValue,
        stderr: result.stderrValue,
        status: result.status,
        signal: result.signal,
        error: payload && payload.success ? undefined : createExecError(String(command || ""), result)
      };
    };

    const spawn = (command, args, options) => {
      if (!Array.isArray(args)) {
        options = args || {};
        args = [];
      }
      return spawnChildProcess(command, args, options || {});
    };

    const execFileSync = (file, args = [], options = {}) =>
      runCommandSync(String(file || ""), args, { ...options, shell: false }, false);

    const exec = (command, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const child = new EventEmitter();
      child.pid = 0;
      child.killed = false;
      child.kill = () => false;

      callBridgeAsync("childProcess.run", {
        command: String(command || ""),
        args: [],
        cwd: options?.cwd,
        env: options?.env,
        shell: options?.shell !== undefined ? options.shell : true,
        inputBase64: options?.input ? encodeFsData(options.input, options.encoding) : undefined
      }).then((payload) => {
        const result = toExecResult(payload, options || {});
        if (!(payload && payload.success)) {
          const error = createExecError(String(command || ""), result);
          if (typeof callback === "function") {
            callback(error, result.stdoutValue, result.stderrValue);
          }
          child.emit("error", error);
          child.emit("close", result.status, result.signal);
          return;
        }
        if (typeof callback === "function") {
          callback(null, result.stdoutValue, result.stderrValue);
        }
        child.emit("close", result.status, result.signal);
      }).catch((error) => {
        if (typeof callback === "function") {
          callback(error, "", "");
        }
        child.emit("error", error);
      });

      return child;
    };

    const execFile = (file, args, options, callback) => {
      if (typeof args === "function") {
        callback = args;
        args = [];
        options = {};
      } else if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const child = new EventEmitter();
      child.pid = 0;
      child.killed = false;
      child.kill = () => false;

      callBridgeAsync("childProcess.run", {
        command: String(file || ""),
        args: Array.isArray(args) ? args.map((item) => String(item)) : [],
        cwd: options?.cwd,
        env: options?.env,
        shell: false,
        inputBase64: options?.input ? encodeFsData(options.input, options.encoding) : undefined
      }).then((payload) => {
        const result = toExecResult(payload, options || {});
        if (!(payload && payload.success)) {
          const error = createExecError(String(file || ""), result);
          if (typeof callback === "function") {
            callback(error, result.stdoutValue, result.stderrValue);
          }
          child.emit("error", error);
          child.emit("close", result.status, result.signal);
          return;
        }
        if (typeof callback === "function") {
          callback(null, result.stdoutValue, result.stderrValue);
        }
        child.emit("close", result.status, result.signal);
      }).catch((error) => {
        if (typeof callback === "function") {
          callback(error, "", "");
        }
        child.emit("error", error);
      });

      return child;
    };

    return {
      exec,
      execSync,
      execFile,
      execFileSync,
      spawn,
      spawnSync
    };
  };

  class IncomingMessage extends EventEmitter {
    constructor(response) {
      super();
      this.statusCode = response.status;
      this.statusMessage = response.statusText;
      this.headers = {};
      response.headers.forEach((value, key) => {
        this.headers[key.toLowerCase()] = value;
      });
      this._response = response;
      this._encoding = null;
    }

    setEncoding(encoding) {
      this._encoding = normalizeEncoding(encoding) || "utf-8";
      return this;
    }

    async _pump() {
      const bytes = new BufferPolyfill(await this._response.arrayBuffer());
      this.emit("data", this._encoding ? bytes.toString(this._encoding) : bytes);
      this.emit("end");
    }
  }

  const normalizeHttpArgs = (url, options, callback) => {
    if (typeof url === "object" && url !== null && !(url instanceof URL)) {
      callback = options;
      options = url;
      url = options?.href || options?.url || "";
    }
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    return {
      url: String(url || options?.href || ""),
      options: options && typeof options === "object" ? { ...options } : {},
      callback
    };
  };

  const createHttpModule = (defaultProtocol) => {
    const request = (url, options, callback) => {
      const normalized = normalizeHttpArgs(url, options, callback);
      const headers = new Headers(normalized.options.headers || {});
      const emitter = new EventEmitter();
      const chunks = [];
      let ended = false;
      let aborted = false;

      const requestApi = Object.assign(emitter, {
        setHeader(name, value) {
          headers.set(name, value);
        },
        getHeader(name) {
          return headers.get(name);
        },
        removeHeader(name) {
          headers.delete(name);
        },
        write(chunk) {
          chunks.push(toBuffer(chunk));
        },
        end(chunk) {
          if (chunk !== undefined) {
            requestApi.write(chunk);
          }
          if (ended || aborted) {
            return;
          }
          ended = true;
          const body = chunks.length ? BufferPolyfill.concat(chunks) : undefined;
          const finalUrl = normalized.url || `${defaultProtocol || "http:"}//localhost`;
          fetch(finalUrl, {
            method: normalized.options.method || "GET",
            headers,
            body: body && body.length ? body : undefined,
            redirect: normalized.options.followRedirects === false ? "manual" : "follow"
          }).then(async (response) => {
            const message = new IncomingMessage(response);
            if (typeof normalized.callback === "function") {
              normalized.callback(message);
            }
            emitter.emit("response", message);
            await message._pump();
            emitter.emit("close");
          }).catch((error) => {
            emitter.emit("error", error);
          });
        },
        abort() {
          aborted = true;
        },
        destroy(error) {
          aborted = true;
          if (error) {
            emitter.emit("error", error);
          }
        }
      });
      return requestApi;
    };

    return {
      METHODS: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
      Agent: function Agent() {},
      request,
      get(url, options, callback) {
        const req = request(url, options, callback);
        req.end();
        return req;
      }
    };
  };

  const normalizeDialogMessageOptions = (options) => {
    if (typeof options === "string") {
      return { title: options };
    }
    if (options && typeof options === "object") {
      return { ...options };
    }
    return {};
  };

  const normalizeDialogConfirmOptions = (options) => {
    if (typeof options === "string") {
      return { title: options };
    }
    if (options && typeof options === "object") {
      return { ...options };
    }
    return {};
  };

  const resolveDialogOkLabel = (options, fallbackText) => {
    if (
      options &&
      typeof options === "object" &&
      options.buttons &&
      typeof options.buttons === "object" &&
      options.buttons.ok
    ) {
      return String(options.buttons.ok);
    }
    if (options && typeof options.okLabel === "string" && options.okLabel.trim()) {
      return options.okLabel.trim();
    }
    return fallbackText;
  };

  const browserAlert = (message, options = {}) => {
    const title = String(options.title || "").trim();
    const text = title ? `${title}\n\n${String(message || "")}` : String(message || "");
    window.alert(text);
  };

  const browserConfirm = (message, options = {}) => {
    const title = String(options.title || "").trim();
    const text = title ? `${title}\n\n${String(message || "")}` : String(message || "");
    return window.confirm(text);
  };

  const createDialogModule = () => {
    const open = async (options = {}) => {
      if (!hasHostInvoke()) {
        return null;
      }
      return callHostInvoke("plugin:dialog|open", { options });
    };

    const save = async (options = {}) => {
      if (!hasHostInvoke()) {
        return null;
      }
      return callHostInvoke("plugin:dialog|save", { options });
    };

    const message = async (messageText, options) => {
      const normalized = normalizeDialogMessageOptions(options);
      if (hasHostInvoke()) {
        await callHostInvoke("plugin:dialog|message", {
          message: String(messageText || ""),
          title: normalized.title ? String(normalized.title) : undefined,
          kind: normalized.kind,
          okButtonLabel: resolveDialogOkLabel(normalized, "确定")
        });
        return;
      }
      browserAlert(messageText, normalized);
    };

    const confirm = async (messageText, options) => {
      const normalized = normalizeDialogConfirmOptions(options);
      if (hasHostInvoke()) {
        return callHostInvoke("plugin:dialog|confirm", {
          message: String(messageText || ""),
          title: normalized.title ? String(normalized.title) : undefined,
          kind: normalized.kind,
          okButtonLabel: resolveDialogOkLabel(normalized, "确定"),
          cancelButtonLabel:
            normalized && typeof normalized.cancelLabel === "string" && normalized.cancelLabel.trim()
              ? normalized.cancelLabel.trim()
              : "取消"
        });
      }
      return browserConfirm(messageText, normalized);
    };

    const ask = async (messageText, options) => {
      const normalized = normalizeDialogConfirmOptions(options);
      if (hasHostInvoke()) {
        return callHostInvoke("plugin:dialog|ask", {
          message: String(messageText || ""),
          title: normalized.title ? String(normalized.title) : undefined,
          kind: normalized.kind,
          yesButtonLabel: resolveDialogOkLabel(normalized, "是"),
          noButtonLabel:
            normalized && typeof normalized.cancelLabel === "string" && normalized.cancelLabel.trim()
              ? normalized.cancelLabel.trim()
              : "否"
        });
      }
      return browserConfirm(messageText, normalized);
    };

    return {
      open,
      save,
      message,
      confirm,
      ask
    };
  };

  const EXTERNAL_SHELL_TARGET_RE = /^(https?:\/\/|mailto:|tel:)/i;

  const openBrowserWindow = (target) => {
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = target;
    }
  };

  const createShellModule = () => {
    const open = async (path, openWith) => {
      const target = String(path || "").trim();
      if (!target) {
        return;
      }
      if (hasHostInvoke()) {
        await callHostInvoke("plugin:shell|open", {
          path: target,
          with: openWith
        });
        return;
      }
      if (EXTERNAL_SHELL_TARGET_RE.test(target)) {
        openBrowserWindow(target);
      }
    };

    const openPath = async (fullPath) => {
      const target = String(fullPath || "").trim();
      if (!target) {
        return;
      }
      if (window.otools && typeof window.otools.shellOpenPath === "function") {
        window.otools.shellOpenPath(target);
        return;
      }
      await open(target);
    };

    const showItemInFolder = async (fullPath) => {
      const target = String(fullPath || "").trim();
      if (!target) {
        return;
      }
      if (window.otools && typeof window.otools.shellShowItemInFolder === "function") {
        window.otools.shellShowItemInFolder(target);
        return;
      }
      await openPath(target);
    };

    const trashItem = async (fullPath) => {
      const target = String(fullPath || "").trim();
      if (!target) {
        return;
      }
      if (window.otools && typeof window.otools.shellTrashItem === "function") {
        window.otools.shellTrashItem(target);
      }
    };

    const openExternal = async (url) => {
      const target = String(url || "").trim();
      if (!target) {
        return;
      }
      if (window.otools && typeof window.otools.shellOpenExternal === "function") {
        window.otools.shellOpenExternal(target);
        return;
      }
      await open(target);
    };

    const beep = async () => {
      if (window.otools && typeof window.otools.shellBeep === "function") {
        window.otools.shellBeep();
      }
    };

    return {
      open,
      openPath,
      showItemInFolder,
      trashItem,
      openExternal,
      beep
    };
  };

  const createElectronNoopShellModule = () => {
    const emptyAsync = async () => undefined;
    return {
      open: emptyAsync,
      openExternal: emptyAsync,
      openPath: async () => "",
      showItemInFolder: () => undefined,
      trashItem: emptyAsync,
      beep: () => undefined,
      moveItemToTrash: emptyAsync
    };
  };

  const createElectronNoopDialogModule = () => ({
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showOpenDialogSync: () => undefined,
    showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
    showSaveDialogSync: () => undefined,
    showMessageBox: async () => ({ response: 0, checkboxChecked: false }),
    showMessageBoxSync: () => 0,
    showErrorBox: (title, content) => {
      try {
        console.error(`${String(title || "Error")}: ${String(content || "")}`);
      } catch {
        // ignore console failures
      }
    }
  });

  const createElectronNativeImage = () => {
    class NativeImage {
      constructor({ dataUrl = "", path = "", buffer = null } = {}) {
        this._dataUrl = String(dataUrl || "");
        this._path = String(path || "");
        this._buffer = buffer ? BufferPolyfill.from(buffer) : BufferPolyfill.alloc(0);
      }

      isEmpty() {
        return !this._dataUrl && !this._path && this._buffer.length === 0;
      }

      getSize() {
        return { width: 0, height: 0 };
      }

      toDataURL() {
        if (this._dataUrl) {
          return this._dataUrl;
        }
        if (this._buffer.length) {
          return `data:image/png;base64,${this._buffer.toString("base64")}`;
        }
        return "";
      }

      toPNG() {
        return this._buffer.length ? BufferPolyfill.from(this._buffer) : BufferPolyfill.alloc(0);
      }

      toJPEG() {
        return this.toPNG();
      }

      toBitmap() {
        return this.toPNG();
      }

      getBitmap() {
        return this.toPNG();
      }

      resize() {
        return new NativeImage({
          dataUrl: this._dataUrl,
          path: this._path,
          buffer: this._buffer
        });
      }

      crop() {
        return this.resize();
      }

      addRepresentation() {
        return undefined;
      }
    }

    const createFromPath = (path) => new NativeImage({ path });
    const createFromDataURL = (dataUrl) => new NativeImage({ dataUrl });
    const createFromBuffer = (buffer) => new NativeImage({ buffer });
    const createEmpty = () => new NativeImage();
    return {
      NativeImage,
      createEmpty,
      createFromBitmap: createFromBuffer,
      createFromBuffer,
      createFromDataURL,
      createFromNamedImage: createEmpty,
      createFromPath
    };
  };

  const createElectronClipboardModule = (nativeImage) => {
    let textValue = "";
    let htmlValue = "";
    let bookmarkValue = null;
    let imageValue = nativeImage.createEmpty();

    const writeText = (text) => {
      textValue = String(text || "");
      if (window.otools && typeof window.otools.copyText === "function") {
        try {
          window.otools.copyText(textValue);
        } catch {
          // keep in-memory clipboard value
        }
      } else if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(textValue).catch(() => undefined);
      }
    };

    const clipboard = {
      availableFormats: () => {
        const formats = [];
        if (textValue) {
          formats.push("text/plain");
        }
        if (htmlValue) {
          formats.push("text/html");
        }
        if (imageValue && !imageValue.isEmpty()) {
          formats.push("image/png");
        }
        return formats;
      },
      clear: () => {
        textValue = "";
        htmlValue = "";
        bookmarkValue = null;
        imageValue = nativeImage.createEmpty();
      },
      readText: () => textValue,
      writeText,
      readHTML: () => htmlValue,
      writeHTML: (html) => {
        htmlValue = String(html || "");
      },
      readBookmark: () => bookmarkValue || { title: "", url: "" },
      writeBookmark: (title, url) => {
        bookmarkValue = { title: String(title || ""), url: String(url || "") };
      },
      readImage: () => imageValue,
      writeImage: (image) => {
        imageValue =
          image && typeof image === "object" && typeof image.toPNG === "function"
            ? image
            : nativeImage.createFromBuffer(image || []);
        const dataUrl =
          imageValue && typeof imageValue.toDataURL === "function"
            ? imageValue.toDataURL()
            : "";
        if (dataUrl && window.otools && typeof window.otools.copyImage === "function") {
          try {
            window.otools.copyImage(dataUrl);
          } catch {
            // keep in-memory image value
          }
        }
      },
      readBuffer: () => BufferPolyfill.alloc(0),
      writeBuffer: () => undefined,
      readFindText: () => textValue,
      writeFindText: writeText,
      write: (data = {}) => {
        if (typeof data.text === "string") {
          writeText(data.text);
        }
        if (typeof data.html === "string") {
          htmlValue = data.html;
        }
        if (data.image) {
          clipboard.writeImage(data.image);
        }
      }
    };
    return clipboard;
  };

  const createElectronScreenModule = () => {
    const buildDisplay = () => {
      const width = Number(window.screen?.width || window.innerWidth || 0);
      const height = Number(window.screen?.height || window.innerHeight || 0);
      const scaleFactor = Number(window.devicePixelRatio || 1);
      return {
        id: 1,
        label: "Primary Display",
        bounds: { x: 0, y: 0, width, height },
        workArea: { x: 0, y: 0, width, height },
        size: { width, height },
        workAreaSize: { width, height },
        scaleFactor,
        rotation: 0,
        internal: true,
        touchSupport: "unknown"
      };
    };
    return {
      getCursorScreenPoint: () => ({
        x: Number(window.screenX || window.screenLeft || 0),
        y: Number(window.screenY || window.screenTop || 0)
      }),
      getPrimaryDisplay: buildDisplay,
      getAllDisplays: () => [buildDisplay()],
      getDisplayNearestPoint: buildDisplay,
      getDisplayMatching: buildDisplay,
      screenToDipPoint: (point) => point,
      dipToScreenPoint: (point) => point,
      screenToDipRect: (_window, rect) => rect,
      dipToScreenRect: (_window, rect) => rect
    };
  };

  const createElectronIpcRenderer = () => {
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
      invoke(channel, ...args) {
        const command = String(channel || "");
        const payload = args.length <= 1 ? args[0] : { args };
        if (hasHostInvoke()) {
          return callHostInvoke(command, payload);
        }
        return Promise.resolve(null);
      },
      send(channel, ...args) {
        const eventName = `electron-ipc:${String(channel || "")}`;
        try {
          window.dispatchEvent(new CustomEvent(eventName, { detail: args }));
        } catch {
          // ignore custom event failures
        }
        if (hasHostInvoke()) {
          callHostInvoke(String(channel || ""), args.length <= 1 ? args[0] : { args }).catch(() => undefined);
        }
      },
      sendSync() {
        return null;
      },
      postMessage(channel, message) {
        this.send(channel, message);
      },
      sendToHost(channel, ...args) {
        this.send(channel, ...args);
      }
    });
  };

  const createElectronBrowserWindowClass = () => {
    class BrowserWindow extends EventEmitter {
      constructor(options = {}) {
        super();
        this.id = Date.now();
        this.webContents = new EventEmitter();
        this.webContents.id = this.id;
        this.webContents.getURL = () => window.location.href;
        this.webContents.loadURL = (url) => this.loadURL(url);
        this.webContents.reload = () => window.location.reload();
        this.webContents.openDevTools = () => undefined;
        this.webContents.closeDevTools = () => undefined;
        this.webContents.send = () => undefined;
        this._options = options || {};
      }

      loadURL(url) {
        const target = String(url || "");
        if (target) {
          window.location.href = target;
        }
        return Promise.resolve();
      }

      loadFile(path) {
        return this.loadURL(`file://${String(path || "")}`);
      }

      show() {
        window.otools?.showMainWindow?.();
      }

      hide() {
        window.otools?.hideMainWindow?.();
      }

      focus() {
        window.focus();
      }

      blur() {
        window.blur();
      }

      close() {
        window.otools?.outPlugin?.();
        this.emit("closed");
      }

      destroy() {
        this.close();
      }

      isDestroyed() {
        return false;
      }

      isVisible() {
        return !document.hidden;
      }

      isFocused() {
        return document.hasFocus();
      }

      getBounds() {
        return {
          x: Number(window.screenX || window.screenLeft || 0),
          y: Number(window.screenY || window.screenTop || 0),
          width: Number(window.innerWidth || 0),
          height: Number(window.innerHeight || 0)
        };
      }

      setBounds() {
        return undefined;
      }

      getSize() {
        return [Number(window.innerWidth || 0), Number(window.innerHeight || 0)];
      }

      setSize() {
        return undefined;
      }

      minimize() {
        this.hide();
      }

      restore() {
        this.show();
      }

      maximize() {
        return undefined;
      }

      unmaximize() {
        return undefined;
      }

      isMaximized() {
        return false;
      }
    }

    const focusedWindow = new BrowserWindow();
    BrowserWindow.getFocusedWindow = () => focusedWindow;
    BrowserWindow.getAllWindows = () => [focusedWindow];
    BrowserWindow.fromId = () => focusedWindow;
    BrowserWindow.fromWebContents = () => focusedWindow;
    return BrowserWindow;
  };

  const createElectronModule = () => {
    const nativeImage = createElectronNativeImage();
    const clipboard = createElectronClipboardModule(nativeImage);
    const optionalDialog = getOptionalBuiltinModule("@otools/dialog");
    const optionalShell = getOptionalBuiltinModule("@otools/shell");
    const dialogCore = optionalDialog || createElectronNoopDialogModule();
    const shellCore = optionalShell || createElectronNoopShellModule();
    const electronDialog = {
      showOpenDialog: async (_browserWindowOrOptions, maybeOptions) => {
        const options =
          maybeOptions && typeof maybeOptions === "object"
            ? maybeOptions
            : _browserWindowOrOptions && typeof _browserWindowOrOptions === "object"
              ? _browserWindowOrOptions
              : {};
        const value =
          typeof dialogCore.open === "function"
            ? await dialogCore.open(options)
            : await dialogCore.showOpenDialog(options);
        const filePaths = Array.isArray(value) ? value : value ? [value] : [];
        return { canceled: filePaths.length === 0, filePaths };
      },
      showOpenDialogSync: () => undefined,
      showSaveDialog: async (_browserWindowOrOptions, maybeOptions) => {
        const options =
          maybeOptions && typeof maybeOptions === "object"
            ? maybeOptions
            : _browserWindowOrOptions && typeof _browserWindowOrOptions === "object"
              ? _browserWindowOrOptions
              : {};
        const filePath =
          typeof dialogCore.save === "function"
            ? await dialogCore.save(options)
            : (await dialogCore.showSaveDialog(options))?.filePath;
        return { canceled: !filePath, filePath: filePath || undefined };
      },
      showSaveDialogSync: () => undefined,
      showMessageBox: async (_browserWindowOrOptions, maybeOptions) => {
        const options =
          maybeOptions && typeof maybeOptions === "object"
            ? maybeOptions
            : _browserWindowOrOptions && typeof _browserWindowOrOptions === "object"
              ? _browserWindowOrOptions
              : {};
        if (typeof dialogCore.confirm === "function") {
          const confirmed = await dialogCore.confirm(options.message || "", options);
          return { response: confirmed ? 0 : 1, checkboxChecked: false };
        }
        return { response: 0, checkboxChecked: false };
      },
      showMessageBoxSync: () => 0,
      showErrorBox: createElectronNoopDialogModule().showErrorBox
    };
    const electronShell = {
      openExternal: (url, options) => shellCore.openExternal(url, options),
      openPath: async (path) => {
        await shellCore.openPath(path);
        return "";
      },
      showItemInFolder: (path) => shellCore.showItemInFolder(path),
      trashItem: (path) => shellCore.trashItem(path),
      moveItemToTrash: (path) => shellCore.trashItem(path),
      beep: () => shellCore.beep()
    };
    const BrowserWindow = createElectronBrowserWindowClass();
    const nativeTheme = new EventEmitter();
    Object.assign(nativeTheme, {
      shouldUseDarkColors: window.matchMedia?.("(prefers-color-scheme: dark)").matches || false,
      themeSource: "system"
    });
    const app = new EventEmitter();
    Object.assign(app, {
      name: String(window.__OToolsEnv?.appName || "codeg-plus"),
      isReady: () => true,
      whenReady: () => Promise.resolve(),
      getName: () => String(window.__OToolsEnv?.appName || "codeg-plus"),
      setName: (name) => {
        app.name = String(name || "");
      },
      getVersion: () => String(window.__OToolsEnv?.appVersion || ""),
      getAppPath: () => String(window.__OToolsEnv?.paths?.app || getProcessCwd()),
      getPath: (name) => String(window.__OToolsEnv?.paths?.[String(name || "")] || ""),
      getLocale: () => navigator.language || "en-US",
      getSystemLocale: () => navigator.language || "en-US",
      quit: () => window.otools?.outPlugin?.(),
      exit: () => window.otools?.outPlugin?.()
    });
    const electron = {
      app,
      BrowserView: class BrowserView {},
      BrowserWindow,
      clipboard,
      contextBridge: {
        exposeInMainWorld: (key, value) => {
          defineGlobal(String(key || ""), value);
        }
      },
      crashReporter: { start: () => undefined, getLastCrashReport: () => null, getUploadedReports: () => [] },
      desktopCapturer: { getSources: async () => [] },
      dialog: electronDialog,
      globalShortcut: {
        isRegistered: () => false,
        register: () => false,
        registerAll: () => undefined,
        unregister: () => undefined,
        unregisterAll: () => undefined
      },
      ipcMain: new EventEmitter(),
      ipcRenderer: createElectronIpcRenderer(),
      Menu: class Menu {
        static buildFromTemplate(template) {
          return { items: Array.isArray(template) ? template : [], popup: () => undefined, closePopup: () => undefined };
        }
        static setApplicationMenu() {
          return undefined;
        }
      },
      nativeImage,
      nativeTheme,
      Notification: class ElectronNotification extends EventEmitter {
        constructor(options = {}) {
          super();
          this.options = options;
        }
        show() {
          const body = this.options.body || this.options.title || "";
          window.otools?.showNotification?.(body);
          this.emit("show");
        }
        close() {
          this.emit("close");
        }
        static isSupported() {
          return true;
        }
      },
      powerMonitor: new EventEmitter(),
      protocol: { registerSchemesAsPrivileged: () => undefined },
      screen: createElectronScreenModule(),
      shell: electronShell,
      systemPreferences: {
        getAccentColor: () => "",
        getColor: () => "",
        getEffectiveAppearance: () => (nativeTheme.shouldUseDarkColors ? "dark" : "light"),
        isDarkMode: () => Boolean(nativeTheme.shouldUseDarkColors)
      },
      Tray: class Tray extends EventEmitter {
        constructor(image) {
          super();
          this.image = image;
        }
        destroy() {
          this.emit("destroyed");
        }
        setContextMenu() {
          return undefined;
        }
        setToolTip() {
          return undefined;
        }
      },
      webFrame: {
        getZoomFactor: () => Number(window.visualViewport?.scale || 1),
        setZoomFactor: () => undefined,
        getZoomLevel: () => 0,
        setZoomLevel: () => undefined,
        clearCache: () => undefined
      }
    };
    electron.remote = {
      app,
      BrowserWindow,
      clipboard,
      dialog: electronDialog,
      getCurrentWindow: () => BrowserWindow.getFocusedWindow(),
      getCurrentWebContents: () => BrowserWindow.getFocusedWindow().webContents,
      Menu: electron.Menu,
      nativeImage,
      nativeTheme,
      require: (specifier) => builtinRequire(specifier),
      screen: electron.screen,
      shell: electronShell
    };
    return electron;
  };

  const processStartMs = Date.now();

  const createProcessModule = () => {
    const process = new EventEmitter();
    const env = {
      NODE_ENV: window.__OToolsEnv?.isDev === true ? "development" : "production",
      ...(window.__OToolsEnv?.processEnv && typeof window.__OToolsEnv.processEnv === "object"
        ? window.__OToolsEnv.processEnv
        : {})
    };
    const hrtime = (previous) => {
      const elapsedMs = typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now() - processStartMs;
      let seconds = Math.floor(elapsedMs / 1000);
      let nanoseconds = Math.floor((elapsedMs - seconds * 1000) * 1_000_000);
      if (Array.isArray(previous)) {
        seconds -= Number(previous[0]) || 0;
        nanoseconds -= Number(previous[1]) || 0;
        if (nanoseconds < 0) {
          seconds -= 1;
          nanoseconds += 1_000_000_000;
        }
      }
      return [seconds, nanoseconds];
    };
    hrtime.bigint = () => {
      const [seconds, nanoseconds] = hrtime();
      return BigInt(seconds) * 1_000_000_000n + BigInt(nanoseconds);
    };
    const stdout = new EventEmitter();
    stdout.isTTY = false;
    stdout.write = (value) => {
      console.log(String(value));
      return true;
    };
    const stderr = new EventEmitter();
    stderr.isTTY = false;
    stderr.write = (value) => {
      console.error(String(value));
      return true;
    };
    const stdin = new EventEmitter();
    stdin.isTTY = false;
    stdin.readable = false;
    stdin.resume = () => stdin;
    stdin.pause = () => stdin;

    return Object.assign(process, {
      arch: getOsInfo().arch || "unknown",
      argv: [],
      argv0: "noder",
      browser: false,
      chdir() {
        const error = new Error("process.chdir is not supported in OTools Noder");
        error.code = "ENOSYS";
        throw error;
      },
      cwd: () => getProcessCwd(),
      env,
      execArgv: [],
      execPath: "noder",
      exit(code = 0) {
        process.exitCode = Number(code) || 0;
        process.emit("exit", process.exitCode);
      },
      exitCode: 0,
      hrtime,
      kill(pid, signal = "SIGTERM") {
        process.emit("warning", new Error(`process.kill(${pid}, ${signal}) is not available in OTools Noder`));
        return false;
      },
      memoryUsage() {
        const heap = typeof performance !== "undefined" ? performance.memory || {} : {};
        return {
          arrayBuffers: 0,
          external: 0,
          heapTotal: Number(heap.totalJSHeapSize || 0),
          heapUsed: Number(heap.usedJSHeapSize || 0),
          rss: Number(heap.totalJSHeapSize || 0)
        };
      },
      cpuUsage(previous) {
        const elapsed = Math.floor((Date.now() - processStartMs) * 1000);
        const usage = { system: 0, user: elapsed };
        if (previous && typeof previous === "object") {
          usage.system -= Number(previous.system) || 0;
          usage.user -= Number(previous.user) || 0;
        }
        return usage;
      },
      nextTick(callback, ...args) {
        Promise.resolve().then(() => callback(...args));
      },
      pid: 1,
      platform: getOsInfo().platform || inferPlatform(),
      ppid: 0,
      release: {
        name: "noder"
      },
      stderr,
      stdin,
      stdout,
      title: "noder",
      umask: () => 0,
      uptime: () => (Date.now() - processStartMs) / 1000,
      version: "v20.0.0-tauri",
      versions: {
        node: "20.0.0-tauri",
        noder: "1.0.0",
        v8: ""
      },
      emitWarning(warning) {
        const error = warning instanceof Error ? warning : new Error(String(warning || ""));
        process.emit("warning", error);
      }
    });
  };

  const safeDecodeURIComponent = (value) => {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch {
      return String(value || "");
    }
  };

  const escapeQueryValue = (value) => encodeURIComponent(String(value ?? ""));

  const stringifyQuery = (value, sep = "&", eq = "=") => {
    if (!value || typeof value !== "object") {
      return "";
    }
    const parts = [];
    for (const [key, raw] of Object.entries(value)) {
      const values = Array.isArray(raw) ? raw : [raw];
      for (const item of values) {
        parts.push(`${escapeQueryValue(key)}${eq}${escapeQueryValue(item)}`);
      }
    }
    return parts.join(sep);
  };

  const parseQueryString = (value, sep = "&", eq = "=") => {
    const out = Object.create(null);
    const text = String(value || "").replace(/^\?/, "");
    if (!text) {
      return out;
    }
    for (const part of text.split(sep)) {
      if (!part) {
        continue;
      }
      const splitAt = part.indexOf(eq);
      const key = safeDecodeURIComponent(splitAt >= 0 ? part.slice(0, splitAt) : part);
      const item = safeDecodeURIComponent(splitAt >= 0 ? part.slice(splitAt + eq.length) : "");
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        out[key] = Array.isArray(out[key]) ? out[key].concat(item) : [out[key], item];
      } else {
        out[key] = item;
      }
    }
    return out;
  };

  const inspectValue = (value) => {
    if (typeof value === "string") {
      return value;
    }
    const seen = new WeakSet();
    try {
      return JSON.stringify(
        value,
        (_key, item) => {
          if (typeof item === "bigint") {
            return `${item.toString()}n`;
          }
          if (item && typeof item === "object") {
            if (seen.has(item)) {
              return "[Circular]";
            }
            seen.add(item);
          }
          return item;
        },
        2
      );
    } catch {
      return String(value);
    }
  };

  const formatValue = (first, ...args) => {
    if (typeof first !== "string") {
      return [first, ...args].map(inspectValue).join(" ");
    }
    let index = 0;
    const formatted = first.replace(/%[sdifjoO%]/g, (token) => {
      if (token === "%%") {
        return "%";
      }
      if (index >= args.length) {
        return token;
      }
      const value = args[index++];
      if (token === "%d" || token === "%i") {
        return String(parseInt(value, 10));
      }
      if (token === "%f") {
        return String(parseFloat(value));
      }
      if (token === "%j") {
        try {
          return JSON.stringify(value);
        } catch {
          return "[Circular]";
        }
      }
      if (token === "%o" || token === "%O") {
        return inspectValue(value);
      }
      return String(value);
    });
    return [formatted, ...args.slice(index).map(inspectValue)].join(" ");
  };

  const promisifyCustom = Symbol.for("nodejs.util.promisify.custom");

  const createUtilModule = () => {
    const promisify = (fn) => {
      if (fn && typeof fn[promisifyCustom] === "function") {
        return fn[promisifyCustom];
      }
      const wrapped = (...args) =>
        new Promise((resolve, reject) => {
          fn(...args, (error, value) => (error ? reject(error) : resolve(value)));
        });
      wrapped[promisifyCustom] = wrapped;
      return wrapped;
    };
    promisify.custom = promisifyCustom;

    return {
      TextDecoder,
      TextEncoder,
      callbackify(fn) {
        return (...args) => {
          const callback = args.pop();
          Promise.resolve()
            .then(() => fn(...args))
            .then(
              (value) => callback(null, value),
              (error) => callback(error || new Error("Promise was rejected with a falsy value"))
            );
        };
      },
      format: formatValue,
      inherits(ctor, superCtor) {
        if (typeof ctor !== "function" || typeof superCtor !== "function") {
          throw new TypeError("ctor and superCtor must be functions");
        }
        Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
        Object.defineProperty(ctor.prototype, "constructor", {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        });
      },
      inspect: inspectValue,
      promisify,
      types: {
        isAnyArrayBuffer: (value) => value instanceof ArrayBuffer,
        isArrayBufferView: ArrayBuffer.isView,
        isDate: (value) => value instanceof Date,
        isNativeError: (value) => value instanceof Error,
        isPromise: (value) => Boolean(value && typeof value.then === "function"),
        isRegExp: (value) => value instanceof RegExp,
        isTypedArray: (value) => ArrayBuffer.isView(value) && !(value instanceof DataView),
        isUint8Array: (value) =>
          ArrayBuffer.isView(value) &&
          Object.prototype.toString.call(value).slice(8, -1) === "Uint8Array"
      }
    };
  };

  const isWindowsNoderPlatform = () => (getOsInfo().platform || inferPlatform()) === "win32";

  const fileURLToPath = (value) => {
    const url = value instanceof URL ? value : new URL(String(value || ""));
    if (url.protocol !== "file:") {
      throw new TypeError("The URL must use file protocol");
    }
    let path = decodeURIComponent(url.pathname);
    if (isWindowsNoderPlatform() && path.startsWith("/") && /^[A-Za-z]:/.test(path.slice(1))) {
      path = path.slice(1).replace(/\//g, "\\");
    }
    return path;
  };

  const pathToFileURL = (value) => {
    let path = String(value || "");
    if (isWindowsNoderPlatform() || /^[A-Za-z]:[\\/]/.test(path)) {
      path = path.replace(/\\/g, "/");
      if (/^[A-Za-z]:/.test(path)) {
        path = `/${path}`;
      }
    }
    const encoded = path
      .split("/")
      .map((part) => encodeURIComponent(part).replace(/%3A/gi, ":"))
      .join("/");
    return new URL(`file://${encoded.startsWith("/") ? "" : "/"}${encoded}`);
  };

  const createUrlModule = () => ({
    URL,
    URLSearchParams,
    domainToASCII: (value) => {
      try {
        return new URL(`http://${String(value || "")}`).hostname;
      } catch {
        return "";
      }
    },
    domainToUnicode: (value) => String(value || ""),
    fileURLToPath,
    format(value) {
      if (value instanceof URL) {
        return value.toString();
      }
      if (!value || typeof value !== "object") {
        return String(value || "");
      }
      const protocol = value.protocol ? String(value.protocol).replace(/:?$/, ":") : "";
      const auth = value.auth ? `${value.auth}@` : "";
      const host = value.host || (value.hostname ? `${auth}${value.hostname}${value.port ? `:${value.port}` : ""}` : "");
      const pathname = value.pathname || "";
      const query = value.search || (value.query ? `?${typeof value.query === "string" ? value.query : stringifyQuery(value.query)}` : "");
      const hash = value.hash ? String(value.hash).replace(/^#?/, "#") : "";
      return `${protocol}${host ? `//${host}` : ""}${pathname}${query}${hash}`;
    },
    parse(value, parseQuery = false) {
      const text = String(value || "");
      const url = new URL(text, /^[A-Za-z][A-Za-z\d+\-.]*:/.test(text) ? undefined : window.location.href);
      const auth = url.username || url.password ? `${safeDecodeURIComponent(url.username)}${url.password ? `:${safeDecodeURIComponent(url.password)}` : ""}` : null;
      return {
        auth,
        hash: url.hash || null,
        host: url.host || null,
        hostname: url.hostname || null,
        href: url.href,
        path: `${url.pathname}${url.search}`,
        pathname: url.pathname,
        port: url.port || null,
        protocol: url.protocol || null,
        query: parseQuery ? parseQueryString(url.search) : url.search.replace(/^\?/, ""),
        search: url.search || null,
        slashes: url.href.startsWith(`${url.protocol}//`)
      };
    },
    pathToFileURL,
    resolve: (from, to) => new URL(String(to || ""), String(from || window.location.href)).toString(),
    urlToHttpOptions: (value) => {
      const url = value instanceof URL ? value : new URL(String(value || ""));
      return {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        href: url.href
      };
    }
  });

  const createQuerystringModule = () => ({
    decode: parseQueryString,
    encode: stringifyQuery,
    escape: escapeQueryValue,
    parse: parseQueryString,
    stringify: stringifyQuery,
    unescape: safeDecodeURIComponent
  });

  class AssertionError extends Error {
    constructor(options = {}) {
      super(options.message || `Expected ${inspectValue(options.actual)} ${options.operator || "=="} ${inspectValue(options.expected)}`);
      this.name = "AssertionError";
      this.code = "ERR_ASSERTION";
      this.actual = options.actual;
      this.expected = options.expected;
      this.operator = options.operator;
      if (typeof Error.captureStackTrace === "function") {
        Error.captureStackTrace(this, options.stackStartFn || AssertionError);
      }
    }
  }

  const createAssertionError = (options = {}) => {
    return new AssertionError(options);
  };

  const isDeepStrictEqual = (left, right, seen = new WeakMap()) => {
    if (Object.is(left, right)) {
      return true;
    }
    if (!left || !right || typeof left !== "object" || typeof right !== "object") {
      return false;
    }
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
      return false;
    }
    if (left instanceof Date || right instanceof Date) {
      return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
    }
    if (left instanceof RegExp || right instanceof RegExp) {
      return left instanceof RegExp && right instanceof RegExp && String(left) === String(right);
    }
    if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
      if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right) || left.byteLength !== right.byteLength) {
        return false;
      }
      const a = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
      const b = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
      return a.every((value, index) => value === b[index]);
    }
    if (seen.get(left) === right) {
      return true;
    }
    seen.set(left, right);
    const leftKeys = Reflect.ownKeys(left);
    const rightKeys = Reflect.ownKeys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!rightKeys.includes(key) || !isDeepStrictEqual(left[key], right[key], seen)) {
        return false;
      }
    }
    return true;
  };

  const createAssertModule = (strictMode = false) => {
    const failAssertion = (options) => {
      throw createAssertionError(options);
    };
    const assert = (value, message) => {
      if (!value) {
        failAssertion({ actual: value, expected: true, message, operator: "==" });
      }
    };
    const matchesExpectedError = (error, expected) => {
      if (expected === undefined) {
        return true;
      }
      if (expected instanceof RegExp) {
        return expected.test(String(error?.message || error));
      }
      if (typeof expected === "function") {
        return error instanceof expected || expected(error) === true;
      }
      if (expected && typeof expected === "object") {
        return Object.entries(expected).every(([key, value]) => isDeepStrictEqual(error?.[key], value));
      }
      return false;
    };
    assert.AssertionError = AssertionError;
    assert.ok = assert;
    assert.fail = (message) => failAssertion(typeof message === "object" ? message : { message, operator: "fail" });
    assert.equal = (actual, expected, message) => {
      if (strictMode ? !Object.is(actual, expected) : actual != expected) {
        failAssertion({ actual, expected, message, operator: strictMode ? "strictEqual" : "==" });
      }
    };
    assert.notEqual = (actual, expected, message) => {
      if (strictMode ? Object.is(actual, expected) : actual == expected) {
        failAssertion({ actual, expected, message, operator: strictMode ? "notStrictEqual" : "!=" });
      }
    };
    assert.strictEqual = (actual, expected, message) => {
      if (!Object.is(actual, expected)) {
        failAssertion({ actual, expected, message, operator: "strictEqual" });
      }
    };
    assert.notStrictEqual = (actual, expected, message) => {
      if (Object.is(actual, expected)) {
        failAssertion({ actual, expected, message, operator: "notStrictEqual" });
      }
    };
    assert.deepStrictEqual = (actual, expected, message) => {
      if (!isDeepStrictEqual(actual, expected)) {
        failAssertion({ actual, expected, message, operator: "deepStrictEqual" });
      }
    };
    assert.notDeepStrictEqual = (actual, expected, message) => {
      if (isDeepStrictEqual(actual, expected)) {
        failAssertion({ actual, expected, message, operator: "notDeepStrictEqual" });
      }
    };
    assert.deepEqual = strictMode ? assert.deepStrictEqual : (actual, expected, message) => {
      if (!isDeepStrictEqual(actual, expected)) {
        failAssertion({ actual, expected, message, operator: "deepEqual" });
      }
    };
    assert.notDeepEqual = strictMode ? assert.notDeepStrictEqual : (actual, expected, message) => {
      if (isDeepStrictEqual(actual, expected)) {
        failAssertion({ actual, expected, message, operator: "notDeepEqual" });
      }
    };
    assert.match = (value, regexp, message) => {
      if (!(regexp instanceof RegExp) || !regexp.test(String(value))) {
        failAssertion({ actual: value, expected: regexp, message, operator: "match" });
      }
    };
    assert.doesNotMatch = (value, regexp, message) => {
      if (regexp instanceof RegExp && regexp.test(String(value))) {
        failAssertion({ actual: value, expected: regexp, message, operator: "doesNotMatch" });
      }
    };
    assert.ifError = (error) => {
      if (error) {
        throw error;
      }
    };
    assert.throws = (fn, expected, message) => {
      let thrown;
      try {
        fn();
      } catch (error) {
        thrown = error;
      }
      if (!thrown || !matchesExpectedError(thrown, expected)) {
        failAssertion({ actual: thrown, expected, message, operator: "throws" });
      }
      return thrown;
    };
    assert.doesNotThrow = (fn, expected, message) => {
      try {
        fn();
      } catch (error) {
        if (matchesExpectedError(error, expected)) {
          failAssertion({ actual: error, expected, message, operator: "doesNotThrow" });
        }
      }
    };
    assert.rejects = async (promiseOrFn, expected, message) => {
      const promise = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
      let thrown;
      try {
        await promise;
      } catch (error) {
        thrown = error;
      }
      if (!thrown || !matchesExpectedError(thrown, expected)) {
        failAssertion({ actual: thrown, expected, message, operator: "rejects" });
      }
      return thrown;
    };
    assert.doesNotReject = async (promiseOrFn, expected, message) => {
      try {
        await (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn);
      } catch (error) {
        if (matchesExpectedError(error, expected)) {
          failAssertion({ actual: error, expected, message, operator: "doesNotReject" });
        }
      }
    };
    assert.strict = strictMode ? assert : createAssertModule(true);
    return assert;
  };

  const nodeFsConstants = {
    COPYFILE_EXCL: 1,
    COPYFILE_FICLONE: 2,
    COPYFILE_FICLONE_FORCE: 4,
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    O_CREAT: 64,
    O_EXCL: 128,
    O_TRUNC: 512,
    O_APPEND: 1024,
    S_IFMT: 61440,
    S_IFREG: 32768,
    S_IFDIR: 16384,
    S_IFLNK: 40960
  };

  const createConstantsModule = () => ({
    ...nodeFsConstants,
    errno: {
      EACCES: 13,
      EEXIST: 17,
      EINVAL: 22,
      EISDIR: 21,
      ENOENT: 2,
      ENOTDIR: 20,
      EPERM: 1
    },
    signals: {
      SIGINT: 2,
      SIGTERM: 15
    }
  });

  const createStringDecoderModule = () => {
    class StringDecoder {
      constructor(encoding = "utf8") {
        this.encoding = normalizeEncoding(encoding) || "utf-8";
        this.decoder = ["utf-8", "utf-16le", "iso-8859-1"].includes(this.encoding)
          ? new TextDecoder(this.encoding)
          : null;
      }
      write(value) {
        const bytes = toBuffer(value || "");
        if (!this.decoder) {
          return bytes.toString(this.encoding);
        }
        return this.decoder.decode(bytes, { stream: true });
      }
      end(value) {
        const text = value === undefined ? "" : this.write(value);
        return this.decoder ? text + this.decoder.decode() : text;
      }
    }
    return { StringDecoder };
  };

  const createTtyModule = () => {
    class ReadStream extends EventEmitter {
      constructor(fd = 0) {
        super();
        this.fd = fd;
        this.isTTY = false;
        this.readable = false;
      }
      setRawMode() {
        return this;
      }
    }
    class WriteStream extends EventEmitter {
      constructor(fd = 1) {
        super();
        this.columns = 80;
        this.fd = fd;
        this.isTTY = false;
        this.rows = 24;
        this.writable = true;
      }
      clearLine() {
        return false;
      }
      clearScreenDown() {
        return false;
      }
      cursorTo() {
        return false;
      }
      moveCursor() {
        return false;
      }
      write(value, _encoding, callback) {
        console.log(String(value));
        const cb = typeof _encoding === "function" ? _encoding : callback;
        if (typeof cb === "function") {
          cb();
        }
        return true;
      }
    }
    return {
      ReadStream,
      WriteStream,
      isatty: () => false
    };
  };

  const createDomainModule = () => {
    class Domain extends EventEmitter {
      add() {
        return this;
      }
      bind(callback) {
        return (...args) => this.run(callback, ...args);
      }
      enter() {
        return this;
      }
      exit() {
        return this;
      }
      intercept(callback) {
        return (error, ...args) => {
          if (error) {
            this.emit("error", error);
            return undefined;
          }
          return this.run(callback, ...args);
        };
      }
      remove() {
        return this;
      }
      run(callback, ...args) {
        try {
          return callback(...args);
        } catch (error) {
          this.emit("error", error);
          return undefined;
        }
      }
    }
    return {
      Domain,
      create: () => new Domain()
    };
  };

  const createTimersModule = () => {
    const setImmediateCompat = globalThis.setImmediate || ((callback, ...args) => setTimeout(callback, 0, ...args));
    const clearImmediateCompat = globalThis.clearImmediate || clearTimeout;
    return {
      clearImmediate: clearImmediateCompat,
      clearInterval,
      clearTimeout,
      setImmediate: setImmediateCompat,
      setInterval,
      setTimeout
    };
  };

  const createTimersPromisesModule = () => ({
    setImmediate: (value) => new Promise((resolve) => setTimeout(() => resolve(value), 0)),
    setInterval: async function* (delay = 1, value) {
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        yield value;
      }
    },
    setTimeout: (delay = 1, value) =>
      new Promise((resolve) => setTimeout(() => resolve(value), delay))
  });

  const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  const rotateRight32 = (value, bits) => (value >>> bits) | (value << (32 - bits));

  const sha256Bytes = (bytes) => {
    const bitLength = bytes.length * 8;
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const data = new Uint8Array(paddedLength);
    data.set(bytes);
    data[bytes.length] = 0x80;
    const view = new DataView(data.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);
    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;
    const words = new Uint32Array(64);
    for (let offset = 0; offset < data.length; offset += 64) {
      for (let index = 0; index < 16; index += 1) {
        words[index] = view.getUint32(offset + index * 4);
      }
      for (let index = 16; index < 64; index += 1) {
        const s0 = rotateRight32(words[index - 15], 7) ^ rotateRight32(words[index - 15], 18) ^ (words[index - 15] >>> 3);
        const s1 = rotateRight32(words[index - 2], 17) ^ rotateRight32(words[index - 2], 19) ^ (words[index - 2] >>> 10);
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
      }
      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      let f = h5;
      let g = h6;
      let h = h7;
      for (let index = 0; index < 64; index += 1) {
        const s1 = rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + s1 + ch + SHA256_K[index] + words[index]) >>> 0;
        const s0 = rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
      h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0;
      h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, index) => outView.setUint32(index * 4, value));
    return out;
  };

  const getWebCrypto = () => globalThis.crypto || window.crypto || null;

  const fillRandomBytes = (bytes) => {
    const cryptoApi = getWebCrypto();
    if (cryptoApi?.getRandomValues) {
      cryptoApi.getRandomValues(bytes);
      return bytes;
    }
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
    return bytes;
  };

  const createCryptoModule = () => ({
    createHash(algorithm) {
      const normalized = String(algorithm || "").toLowerCase().replace(/[-_]/g, "");
      if (normalized !== "sha256") {
        throw new Error(`Unsupported hash algorithm: ${algorithm}`);
      }
      const chunks = [];
      return {
        update(data, encoding) {
          chunks.push(toBuffer(data, encoding));
          return this;
        },
        digest(encoding) {
          const hash = new BufferPolyfill(sha256Bytes(BufferPolyfill.concat(chunks)));
          return encoding ? hash.toString(encoding) : hash;
        }
      };
    },
    getRandomValues: fillRandomBytes,
    randomBytes(size, callback) {
      const length = Number(size);
      if (!Number.isFinite(length) || length < 0) {
        throw new RangeError("size must be a non-negative number");
      }
      const bytes = fillRandomBytes(new BufferPolyfill(Math.floor(length)));
      if (typeof callback === "function") {
        setTimeout(() => callback(null, bytes), 0);
      }
      return bytes;
    },
    randomUUID() {
      const cryptoApi = getWebCrypto();
      if (typeof cryptoApi?.randomUUID === "function") {
        return cryptoApi.randomUUID();
      }
      const bytes = fillRandomBytes(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (item) => item.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
    },
    webcrypto: getWebCrypto()
  });

  const createStreamModule = () => {
    class Readable extends EventEmitter {
      constructor() {
        super();
        this.readable = true;
        this.readableEnded = false;
      }
      pipe(destination) {
        this.on("data", (chunk) => destination?.write?.(chunk));
        this.on("end", () => destination?.end?.());
        return destination;
      }
      push(chunk) {
        if (chunk === null) {
          this.readableEnded = true;
          this.emit("end");
          return false;
        }
        this.emit("data", chunk);
        return true;
      }
      read() {
        return null;
      }
      resume() {
        return this;
      }
      pause() {
        return this;
      }
      setEncoding() {
        return this;
      }
      destroy(error) {
        if (error) {
          this.emit("error", error);
        }
        this.readable = false;
        this.readableEnded = true;
        this.emit("close");
        return this;
      }
    }
    Readable.from = (iterable) => {
      const readable = new Readable();
      Promise.resolve()
        .then(async () => {
          for await (const chunk of iterable || []) {
            readable.push(chunk);
          }
          readable.push(null);
        })
        .catch((error) => readable.emit("error", error));
      return readable;
    };
    class Writable extends EventEmitter {
      constructor() {
        super();
        this.writable = true;
        this.writableEnded = false;
      }
      write(chunk, _encoding, callback) {
        const cb = typeof _encoding === "function" ? _encoding : callback;
        this.emit("data", chunk);
        if (typeof cb === "function") {
          cb();
        }
        return true;
      }
      end(chunk, encoding, callback) {
        if (chunk !== undefined) {
          this.write(chunk, encoding);
        }
        this.emit("finish");
        const cb = typeof encoding === "function" ? encoding : callback;
        if (typeof cb === "function") {
          cb();
        }
        this.writableEnded = true;
      }
      destroy(error) {
        if (error) {
          this.emit("error", error);
        }
        this.writable = false;
        this.writableEnded = true;
        this.emit("close");
        return this;
      }
    }
    class Duplex extends Readable {
      write(chunk, encoding, callback) {
        return Writable.prototype.write.call(this, chunk, encoding, callback);
      }
      end(chunk, encoding, callback) {
        return Writable.prototype.end.call(this, chunk, encoding, callback);
      }
    }
    class PassThrough extends Duplex {}
    return {
      Duplex,
      PassThrough,
      Readable,
      Transform: Duplex,
      Writable,
      finished(stream, callback) {
        if (typeof callback === "function") {
          stream.once?.("end", () => callback());
          stream.once?.("finish", () => callback());
        }
        return () => {};
      },
      pipeline(...args) {
        const callback = typeof args[args.length - 1] === "function" ? args.pop() : null;
        const streams = args;
        for (let index = 0; index < streams.length - 1; index += 1) {
          streams[index]?.pipe?.(streams[index + 1]);
        }
        if (callback) {
          callback();
        }
        return streams[streams.length - 1];
      }
    };
  };

  const collectStreamChunks = async (stream) => {
    if (!stream) {
      return [];
    }
    if (typeof stream.getReader === "function") {
      const reader = stream.getReader();
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock?.();
      }
      return chunks;
    }
    if (typeof stream[Symbol.asyncIterator] === "function") {
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return chunks;
    }
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on?.("data", (chunk) => chunks.push(chunk));
      stream.once?.("end", () => resolve(chunks));
      stream.once?.("finish", () => resolve(chunks));
      stream.once?.("error", reject);
    });
  };

  const createStreamPromisesModule = () => ({
    finished(stream) {
      return new Promise((resolve, reject) => {
        stream.once?.("end", resolve);
        stream.once?.("finish", resolve);
        stream.once?.("close", resolve);
        stream.once?.("error", reject);
      });
    },
    pipeline(...streams) {
      return new Promise((resolve, reject) => {
        builtinRequire("stream").pipeline(...streams, (error, value) => (error ? reject(error) : resolve(value)));
      });
    }
  });

  const createStreamConsumersModule = () => {
    const buffer = async (stream) => BufferPolyfill.concat((await collectStreamChunks(stream)).map((chunk) => toBuffer(chunk)));
    return {
      arrayBuffer: async (stream) => {
        const output = await buffer(stream);
        return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
      },
      blob: async (stream) => {
        const chunks = await collectStreamChunks(stream);
        return typeof Blob === "function" ? new Blob(chunks) : chunks;
      },
      buffer,
      json: async (stream) => JSON.parse((await buffer(stream)).toString()),
      text: async (stream) => (await buffer(stream)).toString()
    };
  };

  const createStreamWebModule = () => ({
    ByteLengthQueuingStrategy: globalThis.ByteLengthQueuingStrategy,
    CountQueuingStrategy: globalThis.CountQueuingStrategy,
    ReadableByteStreamController: globalThis.ReadableByteStreamController,
    ReadableStream: globalThis.ReadableStream,
    ReadableStreamBYOBReader: globalThis.ReadableStreamBYOBReader,
    ReadableStreamBYOBRequest: globalThis.ReadableStreamBYOBRequest,
    ReadableStreamDefaultController: globalThis.ReadableStreamDefaultController,
    ReadableStreamDefaultReader: globalThis.ReadableStreamDefaultReader,
    TransformStream: globalThis.TransformStream,
    TransformStreamDefaultController: globalThis.TransformStreamDefaultController,
    WritableStream: globalThis.WritableStream,
    WritableStreamDefaultController: globalThis.WritableStreamDefaultController,
    WritableStreamDefaultWriter: globalThis.WritableStreamDefaultWriter
  });

  const createPunycodeModule = () => ({
    decode: (value) => String(value || ""),
    encode: (value) => String(value || ""),
    toASCII(value) {
      try {
        return new URL(`http://${String(value || "")}`).hostname;
      } catch {
        return String(value || "");
      }
    },
    toUnicode: (value) => String(value || ""),
    ucs2: {
      decode: (value) => Array.from(String(value || ""), (char) => char.codePointAt(0)),
      encode: (values) => Array.from(values || [], (code) => String.fromCodePoint(Number(code) || 0)).join("")
    },
    version: "2.1.0"
  });

  const createModuleModule = () => {
    function Module(id = "") {
      this.id = String(id || "");
      this.filename = this.id;
      this.exports = {};
      this.loaded = false;
      this.children = [];
    }
    Module.builtinModules = builtinModuleNames.slice();
    Module.createRequire = (filename) => runtimeApi.createRequire(filename || "preload.js");
    return {
      Module,
      builtinModules: builtinModuleNames.slice(),
      createRequire: Module.createRequire
    };
  };

  const builtinModuleNames = Object.freeze([
    "assert",
    "assert/strict",
    "buffer",
    "constants",
    "crypto",
    "domain",
    "events",
    "fs",
    "fs/promises",
    "module",
    "path",
    "path/posix",
    "path/win32",
    "os",
    "process",
    "child_process",
    "http",
    "https",
    "punycode",
    "querystring",
    "stream",
    "stream/consumers",
    "stream/promises",
    "stream/web",
    "string_decoder",
    "timers",
    "timers/promises",
    "tty",
    "url",
    "util",
    "util/types",
    "electron",
    "electron/common",
    "electron/main",
    "electron/remote",
    "electron/renderer",
    "@electron/remote",
    "@electron/remote/main",
    "@otools/runtime",
    "@otools/dialog",
    "@otools/shell",
    "@otools/fs",
    "@otools/path",
    "@otools/os",
    "@otools/process",
    "@otools/child_process"
  ]);

  const builtinPermissionMap = {
    fs: "fs",
    "fs/promises": "fs",
    child_process: "child_process",
    "@otools/dialog": "dialog",
    "@otools/shell": "shell"
  };

  const ensureBuiltinPermission = (normalizedSpecifier, originalSpecifier) => {
    const permission = builtinPermissionMap[String(normalizedSpecifier || "")];
    if (permission && !hasPluginPermission(permission)) {
      throw createPermissionDeniedError(originalSpecifier || normalizedSpecifier, permission);
    }
  };

  const getOptionalBuiltinModule = (specifier) => {
    const normalized = aliasMap[String(specifier || "")];
    if (!normalized) {
      return null;
    }
    const permission = builtinPermissionMap[normalized];
    if (permission && !hasPluginPermission(permission)) {
      return null;
    }
    return builtinRequire(normalized);
  };

  const createRuntimeModule = () => ({
    isNoder: true,
    isNativeTauri: hasHostInvoke(),
    hasHostBridge: hasHostInvoke(),
    platform: getOsInfo().platform || inferPlatform(),
    appName: String(window.__OToolsEnv?.appName || ""),
    appVersion: String(window.__OToolsEnv?.appVersion || ""),
    pluginUuid: String(window.__OToolsEnv?.pluginUuid || ""),
    env: window.__OToolsEnv || {},
    permissionsRestricted: hasRestrictedPluginPermissions(),
    permissions: getDeclaredPluginPermissions() || [],
    hasPermission: (permission) => hasPluginPermission(permission),
    versions: { ...builtinRequire("process").versions },
    builtinModules: builtinModuleNames.slice(),
    require: globalRequire,
    createRequire: (filename) => runtimeApi.createRequire(filename),
    fs: getOptionalBuiltinModule("fs"),
    path: sharedPathModule,
    os: builtinRequire("os"),
    process: builtinRequire("process"),
    childProcess: getOptionalBuiltinModule("child_process"),
    dialog: getOptionalBuiltinModule("@otools/dialog"),
    shell: getOptionalBuiltinModule("@otools/shell")
  });

  const builtinFactories = {
    assert: () => createAssertModule(),
    "assert/strict": () => builtinRequire("assert").strict,
    buffer: () => ({ Buffer: BufferPolyfill }),
    constants: () => createConstantsModule(),
    crypto: () => createCryptoModule(),
    domain: () => createDomainModule(),
    events: () => createEventsModule(),
    fs: () => sharedFsModule,
    "fs/promises": () => builtinRequire("fs").promises,
    module: () => createModuleModule(),
    path: () => sharedPathModule,
    "path/posix": () => sharedPathModule.posix,
    "path/win32": () => sharedPathModule.win32,
    os: () => createOsModule(),
    process: () => createProcessModule(),
    child_process: () => createChildProcessModule(),
    http: () => createHttpModule("http:"),
    https: () => createHttpModule("https:"),
    punycode: () => createPunycodeModule(),
    querystring: () => createQuerystringModule(),
    stream: () => createStreamModule(),
    "stream/consumers": () => createStreamConsumersModule(),
    "stream/promises": () => createStreamPromisesModule(),
    "stream/web": () => createStreamWebModule(),
    string_decoder: () => createStringDecoderModule(),
    timers: () => createTimersModule(),
    "timers/promises": () => createTimersPromisesModule(),
    tty: () => createTtyModule(),
    url: () => createUrlModule(),
    util: () => createUtilModule(),
    "util/types": () => builtinRequire("util").types,
    electron: () => createElectronModule(),
    "electron/common": () => builtinRequire("electron"),
    "electron/main": () => builtinRequire("electron"),
    "electron/remote": () => builtinRequire("electron").remote,
    "electron/renderer": () => builtinRequire("electron"),
    "@electron/remote": () => builtinRequire("electron").remote,
    "@electron/remote/main": () => ({
      initialize: () => undefined,
      enable: () => undefined
    }),
    "@otools/runtime": () => createRuntimeModule(),
    "@otools/dialog": () => createDialogModule(),
    "@otools/shell": () => createShellModule()
  };

  const aliasMap = {
    assert: "assert",
    "node:assert": "assert",
    "assert/strict": "assert/strict",
    "node:assert/strict": "assert/strict",
    buffer: "buffer",
    "node:buffer": "buffer",
    constants: "constants",
    "node:constants": "constants",
    crypto: "crypto",
    "node:crypto": "crypto",
    domain: "domain",
    "node:domain": "domain",
    events: "events",
    "node:events": "events",
    fs: "fs",
    "node:fs": "fs",
    "fs/promises": "fs/promises",
    "node:fs/promises": "fs/promises",
    module: "module",
    "node:module": "module",
    path: "path",
    "node:path": "path",
    "path/posix": "path/posix",
    "node:path/posix": "path/posix",
    "path/win32": "path/win32",
    "node:path/win32": "path/win32",
    os: "os",
    "node:os": "os",
    process: "process",
    "node:process": "process",
    "process/browser": "process",
    child_process: "child_process",
    "node:child_process": "child_process",
    http: "http",
    "node:http": "http",
    https: "https",
    "node:https": "https",
    punycode: "punycode",
    "node:punycode": "punycode",
    querystring: "querystring",
    "node:querystring": "querystring",
    stream: "stream",
    "node:stream": "stream",
    "stream/consumers": "stream/consumers",
    "node:stream/consumers": "stream/consumers",
    "stream/promises": "stream/promises",
    "node:stream/promises": "stream/promises",
    "stream/web": "stream/web",
    "node:stream/web": "stream/web",
    string_decoder: "string_decoder",
    "node:string_decoder": "string_decoder",
    timers: "timers",
    "node:timers": "timers",
    "timers/promises": "timers/promises",
    "node:timers/promises": "timers/promises",
    tty: "tty",
    "node:tty": "tty",
    url: "url",
    "node:url": "url",
    util: "util",
    "node:util": "util",
    "util/types": "util/types",
    "node:util/types": "util/types",
    electron: "electron",
    "electron/common": "electron/common",
    "electron/main": "electron/main",
    "electron/remote": "electron/remote",
    "electron/renderer": "electron/renderer",
    "@electron/remote": "@electron/remote",
    "@electron/remote/main": "@electron/remote/main",
    "@otools/runtime": "@otools/runtime",
    "@otools/dialog": "@otools/dialog",
    "@otools/shell": "@otools/shell",
    "@otools/fs": "fs",
    "@otools/path": "path",
    "@otools/os": "os",
    "@otools/process": "process",
    "@otools/child_process": "child_process"
  };

  function builtinRequire(specifier) {
    const normalized = aliasMap[String(specifier || "")];
    if (!normalized) {
      throw new Error(`Unsupported require target: ${specifier}`);
    }
    ensureBuiltinPermission(normalized, specifier);
    if (!moduleCache.has(normalized)) {
      const factory = builtinFactories[normalized];
      if (!factory) {
        throw new Error(`Unsupported builtin module: ${specifier}`);
      }
      moduleCache.set(normalized, factory());
    }
    return moduleCache.get(normalized);
  }

  const globalRequire = createModuleRequire(null);
  const assignSdkProperty = (target, key, value) => {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return;
    }
    try {
      target[key] = value;
    } catch {
      // ignore assignment failure
    }
  };

  const getSdkModules = () => ({
    runtime: builtinRequire("@otools/runtime"),
    dialog: getOptionalBuiltinModule("@otools/dialog"),
    shell: getOptionalBuiltinModule("@otools/shell"),
    fs: getOptionalBuiltinModule("fs"),
    path: sharedPathModule,
    os: builtinRequire("os"),
    process: builtinRequire("process"),
    childProcess: getOptionalBuiltinModule("child_process"),
    require: globalRequire,
    createRequire: (filename) => runtimeApi.createRequire(filename)
  });

  const attachPluginSdkToOtools = (target) => {
    if (!target || typeof target !== "object") {
      return target;
    }
    const sdk = getSdkModules();
    assignSdkProperty(target, "runtime", sdk.runtime);
    assignSdkProperty(target, "dialog", sdk.dialog);
    assignSdkProperty(target, "shell", sdk.shell);
    assignSdkProperty(target, "fs", sdk.fs);
    assignSdkProperty(target, "path", sdk.path);
    assignSdkProperty(target, "os", sdk.os);
    assignSdkProperty(target, "process", sdk.process);
    assignSdkProperty(target, "childProcess", sdk.childProcess);
    assignSdkProperty(target, "require", sdk.require);
    assignSdkProperty(target, "createRequire", sdk.createRequire);
    return target;
  };

  const runtimeApi = {
    builtinRequire,
    createRequire(filename) {
      return createModuleRequire(normalizeModuleFilename(filename));
    },
    require: globalRequire,
    getSdkModules,
    attachOtoolsSdk(target) {
      return attachPluginSdkToOtools(target || window.otools || null);
    },
    runEntryModule
  };

  builtinRequire.resolve = (specifier) => resolveRequireTarget(specifier, "").id;
  builtinRequire.cache = commonJsCache;

  const timersModule = builtinRequire("timers");
  defineGlobal("Buffer", BufferPolyfill);
  if (typeof window.setImmediate !== "function") {
    defineGlobal("setImmediate", timersModule.setImmediate);
  }
  if (typeof window.clearImmediate !== "function") {
    defineGlobal("clearImmediate", timersModule.clearImmediate);
  }
  defineGlobal("global", window);
  defineGlobal("process", builtinRequire("process"));
  defineGlobal("require", globalRequire);
  defineGlobal("__non_webpack_require__", globalRequire);
  defineGlobal("__OTOOLS_NODER__", runtimeApi);
  attachPluginSdkToOtools(window.otools || null);
})();
