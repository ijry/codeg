export { emit, listen, once, type UnlistenFn } from "./runtime";
export type RemoteServiceEvent<T = unknown> = {
  event: string;
  id: string | number;
  payload: T;
};
