export type OtoolsNativeEvent = {
    payload: {
        pluginUuid?: string;
        topic?: string;
        payload?: unknown;
    };
};
export type OtoolsNativeEventHandler = (event: OtoolsNativeEvent) => void | Promise<void>;
export type OtoolsNativeEventClientOptions = {
    wsUrl: string;
    token?: string;
    WebSocketImpl?: typeof WebSocket;
    acquire?: (pluginUuid: string) => Promise<void>;
    release?: (pluginUuid: string) => Promise<void>;
};
export declare function createOtoolsNativeEventClient({ wsUrl, token, WebSocketImpl, acquire, release, }: OtoolsNativeEventClientOptions): {
    listen(pluginUuid: string, handler: OtoolsNativeEventHandler, _options?: unknown): Promise<() => Promise<void>>;
    close(): void;
    getConnectionState(): "closed" | "open" | "idle" | "connecting";
};
