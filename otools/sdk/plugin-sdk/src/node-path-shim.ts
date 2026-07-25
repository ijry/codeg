import {
  basename as fallbackBasename,
  dirname as fallbackDirname,
  extname as fallbackExtname,
  isAbsolutePath,
  joinPath,
  normalizePath,
  readNoderModule,
  relativePath,
  resolvePath,
} from "./node-compat-core";

export type PathModule = {
  basename: typeof fallbackBasename;
  delimiter: string;
  dirname: typeof fallbackDirname;
  extname: typeof fallbackExtname;
  format: (pathObject: Record<string, unknown>) => string;
  isAbsolute: typeof isAbsolutePath;
  join: typeof joinPath;
  normalize: typeof normalizePath;
  parse: (path: unknown) => {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
  };
  posix?: PathModule;
  relative: typeof relativePath;
  resolve: typeof resolvePath;
  sep: string;
  toNamespacedPath: (path: unknown) => string;
  win32?: PathModule;
};

function readPathModule(): PathModule | null {
  return readNoderModule<PathModule>("path");
}

function fallbackParse(path: unknown) {
  const base = fallbackBasename(path);
  const ext = fallbackExtname(base);
  const dir = fallbackDirname(path);
  return {
    root: isAbsolutePath(path) ? "/" : "",
    dir,
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base,
  };
}

function fallbackFormat(pathObject: Record<string, unknown>) {
  const dir = String(pathObject.dir || pathObject.root || "");
  const base = String(
    pathObject.base ||
      `${String(pathObject.name || "")}${String(pathObject.ext || "")}`,
  );
  return dir ? joinPath(dir, base) : base;
}

const fallbackPath: PathModule = {
  basename: fallbackBasename,
  delimiter: ":",
  dirname: fallbackDirname,
  extname: fallbackExtname,
  format: fallbackFormat,
  isAbsolute: isAbsolutePath,
  join: joinPath,
  normalize: normalizePath,
  parse: fallbackParse,
  relative: relativePath,
  resolve: resolvePath,
  sep: "/",
  toNamespacedPath: (path) => String(path ?? ""),
};

fallbackPath.posix = fallbackPath;
fallbackPath.win32 = {
  ...fallbackPath,
  delimiter: ";",
  sep: "\\",
};

const pathProxy = new Proxy(fallbackPath, {
  get(target, prop) {
    const value = readPathModule()?.[prop as keyof PathModule] ?? target[prop as keyof PathModule];
    return typeof value === "function" ? value.bind(readPathModule() ?? target) : value;
  },
});

export const basename = (...args: Parameters<PathModule["basename"]>) =>
  (readPathModule()?.basename ?? fallbackPath.basename)(...args);
export const delimiter = readPathModule()?.delimiter ?? fallbackPath.delimiter;
export const dirname = (...args: Parameters<PathModule["dirname"]>) =>
  (readPathModule()?.dirname ?? fallbackPath.dirname)(...args);
export const extname = (...args: Parameters<PathModule["extname"]>) =>
  (readPathModule()?.extname ?? fallbackPath.extname)(...args);
export const format = (...args: Parameters<PathModule["format"]>) =>
  (readPathModule()?.format ?? fallbackPath.format)(...args);
export const isAbsolute = (...args: Parameters<PathModule["isAbsolute"]>) =>
  (readPathModule()?.isAbsolute ?? fallbackPath.isAbsolute)(...args);
export const join = (...args: Parameters<PathModule["join"]>) =>
  (readPathModule()?.join ?? fallbackPath.join)(...args);
export const normalize = (...args: Parameters<PathModule["normalize"]>) =>
  (readPathModule()?.normalize ?? fallbackPath.normalize)(...args);
export const parse = (...args: Parameters<PathModule["parse"]>) =>
  (readPathModule()?.parse ?? fallbackPath.parse)(...args);
export const posix = readPathModule()?.posix ?? fallbackPath.posix;
export const relative = (...args: Parameters<PathModule["relative"]>) =>
  (readPathModule()?.relative ?? fallbackPath.relative)(...args);
export const resolve = (...args: Parameters<PathModule["resolve"]>) =>
  (readPathModule()?.resolve ?? fallbackPath.resolve)(...args);
export const sep = readPathModule()?.sep ?? fallbackPath.sep;
export const toNamespacedPath = (
  ...args: Parameters<PathModule["toNamespacedPath"]>
) => (readPathModule()?.toNamespacedPath ?? fallbackPath.toNamespacedPath)(...args);
export const win32 = readPathModule()?.win32 ?? fallbackPath.win32;

export default pathProxy;
