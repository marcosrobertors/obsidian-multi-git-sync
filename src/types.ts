export type NoticeLevel = "ALL" | "WARNING" | "ERROR";
export type RibbonSyncMode = "allTargets" | "defaultTarget" | "ask";

export interface SyncTarget {
  id: string;
  name: string;
  root: string;
  remoteUrl: string;
  branch: string;
  enabled: boolean;
  syncOnStartupIfBehind: boolean;
  autoCommit: boolean;
  commitMessageTemplate: string;
  managedIgnoreRules: string[];
}

export interface MultiGitSyncSettings {
  gitPath: string;
  noticeLevel: NoticeLevel;
  hideSuccessMessage: boolean;
  ribbonSyncMode: RibbonSyncMode;
  defaultTargetId: string;
  autoSyncIntervalMinutes: number;
  targets: SyncTarget[];
}

export const DEFAULT_SETTINGS: MultiGitSyncSettings = {
  gitPath: "git",
  noticeLevel: "ALL",
  hideSuccessMessage: false,
  ribbonSyncMode: "allTargets",
  defaultTargetId: "",
  autoSyncIntervalMinutes: 0,
  targets: [],
};
