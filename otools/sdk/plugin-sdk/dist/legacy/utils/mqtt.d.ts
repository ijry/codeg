export type PayloadEncoding = "plaintext" | "json" | "base64" | "hex" | "cbor";
export interface MqttConnection {
    id: string;
    name: string;
    protocol: "mqtt" | "mqtts";
    host: string;
    port: number;
    username: string;
    password: string;
    client_id: string;
    mqtt_version: "3.1.1" | "5.0";
    connect_timeout_secs: number;
    keep_alive_secs: number;
    clean_start: boolean;
    session_expiry_secs: number;
    receive_maximum: number;
    max_packet_size: number;
    request_channel_capacity: number;
    inflight: number;
    ssl_enabled: boolean;
    ssl_verify: boolean;
    ssl_alpn: string;
    ssl_ca_file: string;
    ssl_client_cert_file: string;
    ssl_client_key_file: string;
    created_at: string;
    data: MqttConnectionData;
}
export interface MqttPayloadViews {
    plaintext: string;
    json: string | null;
    base64: string;
    hex: string;
    cbor: string | null;
}
export interface MqttMessageEvent {
    connection_id: string;
    topic: string;
    qos: number;
    retain: boolean;
    timestamp: string;
    payload: MqttPayloadViews;
}
export interface MqttSubscriptionItem {
    topic: string;
    qos: number;
}
export interface MqttSentMessageItem {
    id: string;
    direction: string;
    topic: string;
    timestamp: string;
    payload_text: string;
}
export interface MqttConnectionData {
    subscribed_topics: MqttSubscriptionItem[];
    received_messages: MqttMessageEvent[];
    sent_messages: MqttSentMessageItem[];
}
export interface MqttConnectionDataPatch {
    subscribed_topics?: MqttSubscriptionItem[];
    received_messages?: MqttMessageEvent[];
    sent_messages?: MqttSentMessageItem[];
}
export type MqttConnectionStatus = "connected" | "disconnected" | "error";
export interface MqttStatusEvent {
    connection_id: string;
    status: MqttConnectionStatus;
    message?: string;
}
export interface MqttPublishParams {
    connectionId: string;
    topic: string;
    payload: string;
    encoding: PayloadEncoding;
    qos: number;
    retain: boolean;
}
export declare class MqttApi {
    static addConnection(connection: MqttConnection): Promise<string>;
    static getConnections(): Promise<MqttConnection[]>;
    static updateConnection(id: string, connection: MqttConnection): Promise<void>;
    static deleteConnection(id: string): Promise<void>;
    static connect(connection: MqttConnection): Promise<boolean>;
    static disconnect(connectionId: string): Promise<boolean>;
    static updateConnectionData(connectionId: string, patch: MqttConnectionDataPatch): Promise<void>;
    static subscribe(connectionId: string, topic: string, qos?: number): Promise<void>;
    static unsubscribe(connectionId: string, topic: string): Promise<void>;
    static publish(params: MqttPublishParams): Promise<void>;
    static listenMessages(handler: (event: MqttMessageEvent) => void): Promise<() => void>;
    static listenStatus(handler: (event: MqttStatusEvent) => void): Promise<() => void>;
}
