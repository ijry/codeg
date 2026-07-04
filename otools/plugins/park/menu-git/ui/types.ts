export interface ParkReviewItem {
  user: string;
  rating: number;
  content: string;
  date: string;
}

export interface ParkCatalogItem {
  uuid: string;
  packid: string;
  displayName: string;
  displayNameCN?: string;
  developerName: string;
  summary: string;
  screenshots: string[];
  version: string;
  minOToolsVersion: string;
  installedVersion: string;
  updateAvailable: boolean;
  meetsMinOToolsVersion: boolean;
  icon: string;
  entry: string;
  easyMode: number;
  hasAd: boolean;
  inPluginPurchase: boolean;
  official: boolean;
  rating: number;
  ratingCount: number;
  categories: string[];
  packageUrl: string;
  reviews: ParkReviewItem[];
  supportMacos: boolean;
  supportWindows: boolean;
  supportLinux: boolean;
  installed: boolean;
  installable: boolean;
}

export interface ParkCategory {
  key: string;
  label: string;
  count: number;
}

export interface ParkWorkspace {
  downloadsDir: string;
  pluginsDir: string;
  pluginsFilePath: string;
  currentOToolsVersion: string;
  categories: ParkCategory[];
  items: ParkCatalogItem[];
  note: string;
}

export interface ParkInstallResult {
  uuid: string;
  packid: string;
  displayName: string;
  displayNameCN?: string;
  downloadPath: string;
  installPath: string;
  allPluginsCount: number;
  message: string;
}

export interface ParkUninstallResult {
  uuid: string;
  packid: string;
  displayName: string;
  displayNameCN?: string;
  allPluginsCount: number;
  message: string;
}
