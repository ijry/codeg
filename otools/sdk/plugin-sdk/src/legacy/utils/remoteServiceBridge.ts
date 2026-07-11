type InvokeArgs = Record<string, unknown> | undefined;

export {
  buildRemoteFileUrl,
  isLocalFilePath,
  normalizeLocalFilePath,
} from "../../remote-service-compat-file-shim";

export {
  beep,
  open,
  openExternal,
  openPath,
  showItemInFolder,
  trashItem,
} from "../../remote-service-compat-shell-shim";

export {
  browseDialog,
  createDir,
  homeDir,
  joinPath,
  listDir,
  pickFiles,
  pickFolder,
  pickSavePath,
  readFile,
  removeEntry,
  renameEntry,
  touchFile,
  writeFile,
} from "../../remote-service-host-fs-shim";

let remoteCorePromise: Promise<typeof import("../../remote-service-api-core-shim")> | null =
  null;

const loadRemoteCore = () => {
  if (!remoteCorePromise) {
    remoteCorePromise = import("../../remote-service-api-core-shim");
  }
  return remoteCorePromise;
};

export const invokeRemoteService = <T = unknown>(
  command: string,
  args?: InvokeArgs,
  options?: unknown,
): Promise<T> =>
  loadRemoteCore().then(({ invoke }) =>
    invoke(command, args) as Promise<T>,
  );
