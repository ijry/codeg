import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

export class MqttApi {
  static async addConnection(connection: MqttConnection): Promise<string> {
    return await invoke<string>("add_mqtt_connection", { connection });
  }

  static async getConnections(): Promise<MqttConnection[]> {
    return await invoke<MqttConnection[]>("get_mqtt_connections");
  }

  static async updateConnection(
    id: string,
    connection: MqttConnection,
  ): Promise<void> {
    return await invoke<void>("update_mqtt_connection", { id, connection });
  }

  static async deleteConnection(id: string): Promise<void> {
    return await invoke<void>("delete_mqtt_connection", { id });
  }

  static async connect(connection: MqttConnection): Promise<boolean> {
    return await invoke<boolean>("connect_mqtt_connection", { connection });
  }

  static async disconnect(connectionId: string): Promise<boolean> {
    return await invoke<boolean>("disconnect_mqtt_connection", {
      connectionId,
    });
  }

  static async updateConnectionData(
    connectionId: string,
    patch: MqttConnectionDataPatch,
  ): Promise<void> {
    return await invoke<void>("mqtt_update_connection_data", {
      connectionId,
      patch,
    });
  }

  static async subscribe(
    connectionId: string,
    topic: string,
    qos = 0,
  ): Promise<void> {
    return await invoke<void>("mqtt_subscribe", { connectionId, topic, qos });
  }

  static async unsubscribe(
    connectionId: string,
    topic: string,
  ): Promise<void> {
    return await invoke<void>("mqtt_unsubscribe", { connectionId, topic });
  }

  static async publish(params: MqttPublishParams): Promise<void> {
    return await invoke<void>("mqtt_publish", {
      connectionId: params.connectionId,
      topic: params.topic,
      payload: params.payload,
      encoding: params.encoding,
      qos: params.qos,
      retain: params.retain,
    });
  }

  static async listenMessages(
    handler: (event: MqttMessageEvent) => void,
  ): Promise<() => void> {
    return await listen<MqttMessageEvent>("mqtt-message", (event) => {
      handler(event.payload);
    });
  }

  static async listenStatus(
    handler: (event: MqttStatusEvent) => void,
  ): Promise<() => void> {
    return await listen<MqttStatusEvent>("mqtt-status", (event) => {
      handler(event.payload);
    });
  }
}
