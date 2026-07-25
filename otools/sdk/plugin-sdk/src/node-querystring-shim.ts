import { readNoderModule } from "./node-compat-core";

type QuerystringModule = {
  decode?: typeof parse;
  encode?: typeof stringify;
  escape?: (value: string) => string;
  parse?: typeof parse;
  stringify?: typeof stringify;
  unescape?: (value: string) => string;
};

function readQuerystring(): QuerystringModule | null {
  return readNoderModule<QuerystringModule>("querystring");
}

export function escape(value: string) {
  return readQuerystring()?.escape?.(value) ?? encodeURIComponent(value);
}

export function unescape(value: string) {
  return readQuerystring()?.unescape?.(value) ?? decodeURIComponent(value);
}

export function parse(query: string) {
  const nativeParse = readQuerystring()?.parse;
  if (nativeParse) {
    return nativeParse(query);
  }
  const output: Record<string, string | string[]> = {};
  const params = new URLSearchParams(String(query || "").replace(/^\?/, ""));
  for (const [key, value] of params) {
    const existing = output[key];
    if (existing === undefined) {
      output[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      output[key] = [existing, value];
    }
  }
  return output;
}

export function stringify(value: Record<string, unknown>) {
  const nativeStringify = readQuerystring()?.stringify;
  if (nativeStringify) {
    return nativeStringify(value);
  }
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(value || {})) {
    if (Array.isArray(item)) {
      for (const nested of item) {
        params.append(key, String(nested ?? ""));
      }
    } else if (item !== undefined) {
      params.append(key, String(item ?? ""));
    }
  }
  return params.toString();
}

export const decode = parse;
export const encode = stringify;

export default {
  decode,
  encode,
  escape,
  parse,
  stringify,
  unescape,
};
