import path, { win32 } from "./node-path-shim";

const winPath = win32 ?? path;

export const basename = (...args: Parameters<typeof path.basename>) =>
  winPath.basename(...args);
export const delimiter = winPath.delimiter;
export const dirname = (...args: Parameters<typeof path.dirname>) =>
  winPath.dirname(...args);
export const extname = (...args: Parameters<typeof path.extname>) =>
  winPath.extname(...args);
export const format = (...args: Parameters<typeof path.format>) =>
  winPath.format(...args);
export const isAbsolute = (...args: Parameters<typeof path.isAbsolute>) =>
  winPath.isAbsolute(...args);
export const join = (...args: Parameters<typeof path.join>) =>
  winPath.join(...args);
export const normalize = (...args: Parameters<typeof path.normalize>) =>
  winPath.normalize(...args);
export const parse = (...args: Parameters<typeof path.parse>) =>
  winPath.parse(...args);
export const relative = (...args: Parameters<typeof path.relative>) =>
  winPath.relative(...args);
export const resolve = (...args: Parameters<typeof path.resolve>) =>
  winPath.resolve(...args);
export const sep = winPath.sep;
export const toNamespacedPath = (
  ...args: Parameters<typeof path.toNamespacedPath>
) => winPath.toNamespacedPath(...args);

export default winPath;
