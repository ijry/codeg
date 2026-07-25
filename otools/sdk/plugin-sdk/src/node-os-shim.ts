import { readNoderModule, readRuntimePlatform, runtimeWindow } from "./node-compat-core";

type OsModule = {
  EOL?: string;
  arch?: () => string;
  cpus?: () => unknown[];
  endianness?: () => string;
  freemem?: () => number;
  homedir?: () => string;
  hostname?: () => string;
  platform?: () => string;
  release?: () => string;
  tmpdir?: () => string;
  totalmem?: () => number;
  type?: () => string;
};

function readOs(): OsModule | null {
  return readNoderModule<OsModule>("os");
}

export const EOL = readOs()?.EOL ?? "\n";
export const arch = () => readOs()?.arch?.() ?? "unknown";
export const cpus = () => readOs()?.cpus?.() ?? [];
export const endianness = () => readOs()?.endianness?.() ?? "LE";
export const freemem = () => readOs()?.freemem?.() ?? 0;
export const homedir = () =>
  readOs()?.homedir?.() ?? runtimeWindow()?.__OToolsEnv?.paths?.home ?? "";
export const hostname = () => readOs()?.hostname?.() ?? "";
export const platform = () => readOs()?.platform?.() ?? readRuntimePlatform();
export const release = () => readOs()?.release?.() ?? "";
export const tmpdir = () =>
  readOs()?.tmpdir?.() ?? runtimeWindow()?.__OToolsEnv?.paths?.temp ?? "";
export const totalmem = () => readOs()?.totalmem?.() ?? 0;
export const type = () => readOs()?.type?.() ?? "Browser";

export default {
  EOL,
  arch,
  cpus,
  endianness,
  freemem,
  homedir,
  hostname,
  platform,
  release,
  tmpdir,
  totalmem,
  type,
};
