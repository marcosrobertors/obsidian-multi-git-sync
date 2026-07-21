import { Modal, Notice, Plugin, Setting, TFile } from "obsidian";
import { SyncService } from "./sync/SyncService";
import { MultiGitSyncSettingTab } from "./settings/SettingsTab";
import { DEFAULT_SETTINGS, MultiGitSyncSettings, SyncTarget } from "./types";
import { GitignoreManager } from "./ignore/GitignoreManager";
import { LogService } from "./log/LogService";

export default class MultiGitSyncPlugin extends Plugin {
  settings: MultiGitSyncSettings;
  private periodicSyncIntervalId: number | null = null;
  private syncInProgress = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new MultiGitSyncSettingTab(this.app, this));

    this.addRibbonIcon("sync", "Sync with Remote", () => this.syncFromRibbon());

    this.addCommand({
      id: "sync-with-remote",
      name: "Sync with Remote",
      callback: () => this.syncFromRibbon(),
    });
    this.addCommand({
      id: "sync-all-targets",
      name: "Sync all targets",
      callback: () => this.syncAllTargets(),
    });
    this.addCommand({
      id: "sync-selected-target",
      name: "Sync selected target",
      callback: () => this.chooseTargetAndSync(),
    });
    this.addCommand({
      id: "pull-selected-target",
      name: "Pull selected target from remote",
      callback: () => this.chooseTargetAndPull(),
    });
    this.addCommand({
      id: "show-status",
      name: "Show status",
      callback: () => this.chooseTargetAndShowStatus(),
    });
    this.addCommand({
      id: "show-conflicts",
      name: "Show conflicts",
      callback: () => this.chooseTargetAndShowConflicts(),
    });
    this.addCommand({
      id: "show-latest-log",
      name: "Show latest log",
      callback: () => this.showLatestLog(),
    });
    this.addCommand({
      id: "new-target-wizard",
      name: "New target wizard",
      callback: () => new SetupTargetModal(this).open(),
    });
    this.addCommand({
      id: "open-logs-folder",
      name: "Open logs folder",
      callback: () => this.openLogsFolder(),
    });
    this.addCommand({
      id: "clear-old-logs",
      name: "Clear old logs",
      callback: () => this.clearOldLogs(),
    });
    this.addCommand({
      id: "test-git",
      name: "Test Git installation",
      callback: () => this.testGitInstallation(),
    });

    this.app.workspace.onLayoutReady(() => {
      void this.getSyncService().syncOnStartupIfBehind();
      this.configurePeriodicSync();
    });
  }

  onunload(): void {
    if (this.periodicSyncIntervalId !== null) window.clearInterval(this.periodicSyncIntervalId);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.targets = this.settings.targets ?? [];
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  configurePeriodicSync(): void {
    if (this.periodicSyncIntervalId !== null) {
      window.clearInterval(this.periodicSyncIntervalId);
      this.periodicSyncIntervalId = null;
    }
    const minutes = this.settings.autoSyncIntervalMinutes ?? 0;
    if (minutes <= 0) return;
    this.periodicSyncIntervalId = window.setInterval(() => {
      if (this.syncInProgress) return;
      void this.syncAllTargets();
    }, minutes * 60 * 1000);
  }

  async syncTarget(target: SyncTarget): Promise<void> {
    if (this.syncInProgress) {
      new Notice("Sync already in progress.");
      return;
    }
    this.syncInProgress = true;
    try {
      await this.getSyncService().syncTarget(target);
    } catch (error) {
      new Notice(`Sync failed for ${target.name}. Use "Multi Git Sync: Show latest log".`);
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncAllTargets(): Promise<void> {
    if (this.syncInProgress) {
      new Notice("Sync already in progress.");
      return;
    }
    if (this.settings.targets.filter((t) => t.enabled).length === 0) {
      new Notice("No enabled sync targets configured.");
      return;
    }
    this.syncInProgress = true;
    try {
      await this.getSyncService().syncAll();
    } catch (error) {
      new Notice('Sync failed. Use "Multi Git Sync: Show latest log".');
    } finally {
      this.syncInProgress = false;
    }
  }

  async pullTarget(target: SyncTarget): Promise<void> {
    if (this.syncInProgress) {
      new Notice("Sync already in progress.");
      return;
    }
    this.syncInProgress = true;
    try {
      await this.getSyncService().pullTarget(target);
    } catch (error) {
      new Notice(`Pull failed for ${target.name}. Use "Multi Git Sync: Show latest log".`);
    } finally {
      this.syncInProgress = false;
    }
  }

  async diagnoseTarget(target: SyncTarget): Promise<string> {
    return await this.getSyncService().diagnoseTarget(target);
  }

  async addTarget(target: SyncTarget): Promise<void> {
    this.settings.targets.push(target);
    await this.saveSettings();
  }

  async markConflictResolved(target: SyncTarget, file: string): Promise<void> {
    await this.getSyncService().markConflictResolved(target, file);
  }

  async continueRebase(target: SyncTarget): Promise<void> {
    await this.getSyncService().continueRebase(target);
  }

  async abortRebase(target: SyncTarget): Promise<void> {
    await this.getSyncService().abortRebase(target);
  }

  async getConflicts(target: SyncTarget): Promise<string[]> {
    return await this.getSyncService().getConflicts(target);
  }

  async openTargetFile(target: SyncTarget, file: string): Promise<void> {
    const path = [target.root, file].filter((part) => part && part !== ".").join("/").replace(/\\/g, "/");
    const abstractFile = this.app.vault.getAbstractFileByPath(path);
    if (abstractFile instanceof TFile) await this.app.workspace.getLeaf(true).openFile(abstractFile);
    else new Notice(`File not found in vault: ${path}`);
  }

  async applyGitignore(target: SyncTarget): Promise<void> {
    new GitignoreManager(this.getVaultRoot()).applyManagedRules(target.root, target.managedIgnoreRules);
    new Notice(`Applied .gitignore for ${target.name}.`);
  }

  async testGitInstallation(): Promise<void> {
    try {
      const version = await this.getSyncService().testGit();
      new Notice(`Git OK: ${version}`);
    } catch {
      new Notice('Git not found. Install Git or set "Git path" in Multi Git Sync settings.');
    }
  }

  private async syncFromRibbon(): Promise<void> {
    if (this.settings.ribbonSyncMode === "allTargets") return this.syncAllTargets();
    if (this.settings.ribbonSyncMode === "ask") return this.chooseTargetAndSync();
    const target = this.settings.targets.find((t) => t.id === this.settings.defaultTargetId) ?? this.settings.targets.find((t) => t.enabled);
    if (!target) {
      new Notice("No sync target configured.");
      return;
    }
    await this.syncTarget(target);
  }

  private async chooseTargetAndSync(): Promise<void> {
    new TargetPickerModal(this, this.settings.targets.filter((t) => t.enabled), (target) => void this.syncTarget(target)).open();
  }

  private async chooseTargetAndPull(): Promise<void> {
    new TargetPickerModal(this, this.settings.targets.filter((t) => t.enabled), (target) => void this.pullTarget(target), "Pull").open();
  }

  private async chooseTargetAndShowStatus(): Promise<void> {
    new TargetPickerModal(this, this.settings.targets.filter((t) => t.enabled), async (target) => {
      try {
        const status = await this.getSyncService().getStatus(target);
        new StatusModal(this, target, status).open();
      } catch (error) {
        new Notice(`Status failed for ${target.name}: ${String(error)}`);
      }
    }, "Show status").open();
  }

  private async chooseTargetAndShowConflicts(): Promise<void> {
    new TargetPickerModal(this, this.settings.targets.filter((t) => t.enabled), async (target) => {
      try {
        const conflicts = await this.getSyncService().getConflicts(target);
        new ConflictModal(this, target, conflicts).open();
      } catch (error) {
        new Notice(`Conflict check failed for ${target.name}. Use latest log if available.`);
      }
    }, "Show conflicts").open();
  }

  private showLatestLog(): void {
    const latest = new LogService(this.getVaultRoot()).latest();
    if (!latest) {
      new Notice("No Multi Git Sync logs found.");
      return;
    }
    new LogModal(this, latest.path, latest.text).open();
  }

  private openLogsFolder(): void {
    const dir = new LogService(this.getVaultRoot()).getLogsDir();
    const electronRequire = window.require as ((module: string) => { shell?: { openPath(path: string): Promise<string> } }) | undefined;
    const shell = electronRequire?.("electron").shell;
    if (shell) void shell.openPath(dir);
    else {
      void navigator.clipboard.writeText(dir);
      new Notice("Logs folder path copied.");
    }
  }

  private clearOldLogs(): void {
    const deleted = new LogService(this.getVaultRoot()).clearOldLogs(20);
    new Notice(`Cleared ${deleted} old Multi Git Sync logs.`);
  }

  private getSyncService(): SyncService {
    return new SyncService(this.app, this.settings, this.getVaultRoot());
  }

  private getVaultRoot(): string {
    // @ts-expect-error adapter exists in desktop Obsidian.
    return this.app.vault.adapter.getBasePath();
  }
}

class TargetPickerModal extends Modal {
  constructor(
    private readonly plugin: MultiGitSyncPlugin,
    private readonly targets: SyncTarget[],
    private readonly onChoose: (target: SyncTarget) => void,
    private readonly actionLabel = "Sync",
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Select target" });
    if (this.targets.length === 0) {
      this.contentEl.createEl("p", { text: "No enabled targets configured." });
      return;
    }
    for (const target of this.targets) {
      new Setting(this.contentEl)
        .setName(target.name)
        .setDesc(`${target.root} -> ${target.remoteUrl || "no remote"}`)
        .addButton((button) => button.setButtonText(this.actionLabel).onClick(() => {
          this.close();
          this.onChoose(target);
        }));
    }
  }
}

class StatusModal extends Modal {
  constructor(
    private readonly plugin: MultiGitSyncPlugin,
    private readonly target: SyncTarget,
    private readonly status: string,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: `Git status: ${this.target.name}` });
    this.contentEl.createEl("pre", { text: this.status });
  }
}

class LogModal extends Modal {
  constructor(
    private readonly plugin: MultiGitSyncPlugin,
    private readonly logPath: string,
    private readonly logText: string,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Latest Multi Git Sync log" });
    this.contentEl.createEl("p", { text: this.logPath });
    const pre = this.contentEl.createEl("pre", { text: this.logText });
    pre.style.maxHeight = "60vh";
    pre.style.overflow = "auto";
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Copy log").onClick(async () => {
        await navigator.clipboard.writeText(this.logText);
        new Notice("Log copied.");
      }));
  }
}

class ConflictModal extends Modal {
  constructor(
    private readonly plugin: MultiGitSyncPlugin,
    private readonly target: SyncTarget,
    private conflicts: string[],
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: `Conflicts: ${this.target.name}` });
    if (this.conflicts.length === 0) {
      this.contentEl.createEl("p", { text: "No unmerged files detected." });
    } else {
      this.contentEl.createEl("p", { text: "Resolve files manually, then mark them resolved and continue the rebase." });
      for (const file of this.conflicts) {
        new Setting(this.contentEl)
          .setName(file)
          .addButton((button) => button.setButtonText("Open").onClick(() => void this.plugin.openTargetFile(this.target, file)))
          .addButton((button) => button.setButtonText("Mark resolved").onClick(async () => {
            try {
              await this.plugin.markConflictResolved(this.target, file);
              this.conflicts = this.conflicts.filter((candidate) => candidate !== file);
              new Notice(`Marked resolved: ${file}`);
              this.render();
            } catch {
              new Notice(`Could not mark resolved: ${file}`);
            }
          }));
      }
    }

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Refresh").onClick(async () => {
        this.conflicts = await this.plugin.getConflicts(this.target);
        this.render();
      }))
      .addButton((button) => button.setButtonText("Continue rebase").setCta().onClick(async () => {
        try {
          await this.plugin.continueRebase(this.target);
          new Notice("Rebase continued.");
          this.close();
        } catch {
          new Notice('Rebase continue failed. Use "Multi Git Sync: Show latest log".');
        }
      }))
      .addButton((button) => button.setButtonText("Abort rebase").setWarning().onClick(async () => {
        try {
          await this.plugin.abortRebase(this.target);
          new Notice("Rebase aborted.");
          this.close();
        } catch {
          new Notice('Rebase abort failed. Use "Multi Git Sync: Show latest log".');
        }
      }));
  }
}

class SetupTargetModal extends Modal {
  private nameValue = "New target";
  private rootValue = ".";
  private remoteValue = "";
  private branchValue = "main";
  private outputEl: HTMLPreElement | null = null;

  constructor(private readonly plugin: MultiGitSyncPlugin) {
    super(plugin.app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "New target wizard" });
    this.contentEl.createEl("p", {
      text: "Use Pull for an existing remote. Use Sync later for normal pull/commit/push.",
      cls: "setting-item-description",
    });

    new Setting(this.contentEl)
      .setName("Name")
      .addText((text) => text.setValue(this.nameValue).onChange((value) => this.nameValue = value.trim() || "New target"));
    new Setting(this.contentEl)
      .setName("Root folder")
      .setDesc("Relative to vault root. Example: SAG")
      .addText((text) => text.setValue(this.rootValue).onChange((value) => this.rootValue = value.trim() || "."));
    new Setting(this.contentEl)
      .setName("Remote URL")
      .setDesc("HTTPS or SSH.")
      .addText((text) => text.setPlaceholder("git@github.com:user/repo.git").setValue(this.remoteValue).onChange((value) => this.remoteValue = value.trim()));
    new Setting(this.contentEl)
      .setName("Branch")
      .addText((text) => text.setValue(this.branchValue).onChange((value) => this.branchValue = value.trim() || "main"));

    this.outputEl = this.contentEl.createEl("pre");
    this.outputEl.style.maxHeight = "240px";
    this.outputEl.style.overflow = "auto";
    this.outputEl.setText("Diagnostic output will appear here.");

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Diagnose").onClick(async () => {
        this.output(await this.plugin.diagnoseTarget(this.makeTarget(false)));
      }))
      .addButton((button) => button.setButtonText("Save target").onClick(async () => {
        await this.plugin.addTarget(this.makeTarget(true));
        new Notice("Target saved.");
        this.close();
      }))
      .addButton((button) => button.setButtonText("Save + Pull").setCta().onClick(async () => {
        const target = this.makeTarget(true);
        await this.plugin.addTarget(target);
        await this.plugin.pullTarget(target);
        this.close();
      }));
  }

  private output(text: string): void {
    this.outputEl?.setText(text);
  }

  private makeTarget(enabled: boolean): SyncTarget {
    return {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      name: this.nameValue,
      root: this.rootValue,
      remoteUrl: this.remoteValue,
      branch: this.branchValue,
      enabled,
      syncOnStartupIfBehind: false,
      autoCommit: true,
      commitMessageTemplate: "Sync: {{date}}",
      managedIgnoreRules: ["desktop.ini", "Thumbs.db", ".DS_Store", ".multi-git-sync-backups/"],
    };
  }
}
