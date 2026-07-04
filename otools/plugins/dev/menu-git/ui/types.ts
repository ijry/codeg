export interface DevVersionRecord {
  id: string;
  version: string;
  changelog: string;
  downloadUrl: string;
  publishedAt: string;
  status: string;
}

export interface DevPluginRecord {
  uuid: string;
  packid: string;
  displayName: string;
  displayNameCN?: string;
  developerName: string;
  summary: string;
  screenshots: string[];
  version: string;
  icon: string;
  devUrl: string;
  hasAd: boolean;
  inPluginPurchase: boolean;
  agreementAccepted: boolean;
  createdAt: string;
  updatedAt: string;
  debugEnabled: boolean;
  directoryBound: boolean;
  boundDirectoryPath: string;
  pluginManifestPath: string;
  packFilePath: string;
  versionRecords: DevVersionRecord[];
}

export interface DevPluginInput {
  packid: string;
  displayName: string;
  displayNameCN?: string;
  developerName: string;
  summary: string;
  screenshots: string[];
  version: string;
  icon: string;
  devUrl: string;
  hasAd: boolean;
  inPluginPurchase: boolean;
  agreementAccepted: boolean;
}

export interface DevPluginActionResult {
  message: string;
  item: DevPluginRecord;
}

export interface DevPublishVersionInput {
  uuid: string;
  version: string;
  changelog: string;
  downloadUrl: string;
}

export interface DevWorkspace {
  metaStateFilePath: string;
  bindingStateFilePath: string;
  packsDir: string;
  docsUrl: string;
  items: DevPluginRecord[];
}
