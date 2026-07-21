import { App, PluginSettingTab, Setting, TextAreaComponent } from "obsidian";
import MultiGitSyncPlugin from "../main";
import { SyncTarget } from "../types";
import { FileTreeSelector } from "./FileTreeSelector";

export class MultiGitSyncSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: MultiGitSyncPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Multi Git Sync" });

    new Setting(containerEl)
      .setName("Git path")
      .setDesc("Use 'git', a git executable path, or a folder containing git.exe. On Windows, the plugin also tries common Git install paths.")
      .addText((text) => text
        .setPlaceholder("git")
        .setValue(this.plugin.settings.gitPath)
        .onChange(async (value) => {
          this.plugin.settings.gitPath = value.trim() || "git";
          await this.plugin.saveSettings();
        }))
      .addButton((button) => button
        .setButtonText("Test Git")
        .onClick(() => void this.plugin.testGitInstallation()));

    new Setting(containerEl)
      .setName("Notice level")
      .addDropdown((dropdown) => dropdown
        .addOption("ALL", "ALL")
        .addOption("WARNING", "WARNING")
        .addOption("ERROR", "ERROR")
        .setValue(this.plugin.settings.noticeLevel)
        .onChange(async (value) => {
          this.plugin.settings.noticeLevel = value as any;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Hide success message")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.hideSuccessMessage)
        .onChange(async (value) => {
          this.plugin.settings.hideSuccessMessage = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Ribbon sync mode")
      .addDropdown((dropdown) => dropdown
        .addOption("allTargets", "All enabled targets")
        .addOption("defaultTarget", "Default target")
        .addOption("ask", "Ask")
        .setValue(this.plugin.settings.ribbonSyncMode)
        .onChange(async (value) => {
          this.plugin.settings.ribbonSyncMode = value as any;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Periodic auto-sync interval")
      .setDesc("Minutes between automatic sync runs. Use 0 to disable. Applies to all enabled targets.")
      .addText((text) => text
        .setPlaceholder("0")
        .setValue(String(this.plugin.settings.autoSyncIntervalMinutes ?? 0))
        .onChange(async (value) => {
          const minutes = Number.parseInt(value.trim(), 10);
          this.plugin.settings.autoSyncIntervalMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
          await this.plugin.saveSettings();
          this.plugin.configurePeriodicSync();
        }));

    containerEl.createEl("h3", { text: "Targets" });
    for (const target of this.plugin.settings.targets) this.renderTarget(containerEl, target);

    new Setting(containerEl)
      .addButton((button) => button
        .setButtonText("Add target")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.targets.push(createDefaultTarget());
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  private renderTarget(containerEl: HTMLElement, target: SyncTarget): void {
    const details = containerEl.createEl("details");
    details.createEl("summary", { text: target.name || target.root || "Unnamed target" });

    new Setting(details).setName("Enabled").addToggle((toggle) => toggle.setValue(target.enabled).onChange(async (value) => {
      target.enabled = value;
      await this.plugin.saveSettings();
    }));

    new Setting(details).setName("Name").addText((text) => text.setValue(target.name).onChange(async (value) => {
      target.name = value;
      await this.plugin.saveSettings();
    }));

    new Setting(details).setName("Root folder").setDesc("Relative to vault root. Use . for the whole vault.").addText((text) => text.setValue(target.root).onChange(async (value) => {
      target.root = value.trim() || ".";
      await this.plugin.saveSettings();
    }));

    new Setting(details).setName("Remote URL").setDesc("HTTPS or SSH URL.").addText((text) => text.setValue(target.remoteUrl).onChange(async (value) => {
      target.remoteUrl = value.trim();
      await this.plugin.saveSettings();
    }));

    new Setting(details).setName("Branch").addText((text) => text.setValue(target.branch).onChange(async (value) => {
      target.branch = value.trim() || "main";
      await this.plugin.saveSettings();
    }));

    new Setting(details).setName("Auto sync on startup if behind remote").addToggle((toggle) => toggle.setValue(target.syncOnStartupIfBehind).onChange(async (value) => {
      target.syncOnStartupIfBehind = value;
      await this.plugin.saveSettings();
    }));

    new Setting(details).setName("Auto commit local changes").addToggle((toggle) => toggle.setValue(target.autoCommit).onChange(async (value) => {
      target.autoCommit = value;
      await this.plugin.saveSettings();
    }));

    new Setting(details).setName("Commit message").addText((text) => text.setValue(target.commitMessageTemplate).onChange(async (value) => {
      target.commitMessageTemplate = value || "Sync: {{date}}";
      await this.plugin.saveSettings();
    }));

    let ignoreTextArea: TextAreaComponent;
    new Setting(details).setName("Managed .gitignore rules").setDesc("One rule per line. Only the managed block is edited.").addTextArea((text) => {
      ignoreTextArea = text;
      text
      .setValue(target.managedIgnoreRules.join("\n"))
      .onChange(async (value) => {
        target.managedIgnoreRules = value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      });
    });

    new Setting(details)
      .setName("Ignore presets")
      .setDesc("Add common safe rules without replacing your current rules.")
      .addButton((button) => button.setButtonText("OS junk").onClick(async () => {
        await this.addIgnoreRules(target, ignoreTextArea, ["desktop.ini", "Thumbs.db", ".DS_Store"]);
      }))
      .addButton((button) => button.setButtonText("Obsidian volatile").onClick(async () => {
        await this.addIgnoreRules(target, ignoreTextArea, [".obsidian/workspace.json", ".obsidian/workspace-mobile.json", ".obsidian/cache/", ".trash/", ".claudian/", ".tmp.driveupload/", ".multi-git-sync-backups/"]);
      }))
      .addButton((button) => button.setButtonText("Large archives").onClick(async () => {
        await this.addIgnoreRules(target, ignoreTextArea, ["*.zip", "*.7z", "*.rar", "*.tar", "*.gz"]);
      }))
      .addButton((button) => button.setButtonText("Nested Git").onClick(async () => {
        await this.addIgnoreRules(target, ignoreTextArea, ["**/.git/"]);
      }));

    const treeContainer = details.createDiv({ cls: "multi-git-sync-ignore-tree-container" });
    treeContainer.createEl("h4", { text: "Visual ignore selector" });
    treeContainer.createEl("p", {
      text: "Checked items are ignored for this target. Checking a folder ignores all descendants through one folder rule.",
      cls: "setting-item-description",
    });
    new FileTreeSelector(this.app, treeContainer.createDiv(), target.root, target.managedIgnoreRules, async (rules) => {
      target.managedIgnoreRules = rules;
      await this.plugin.saveSettings();
      ignoreTextArea.setValue(rules.join("\n"));
    }).render();

    const overlapWarning = getOverlapWarning(target, this.plugin.settings.targets);
    if (overlapWarning) {
      const warning = details.createDiv({ cls: "multi-git-sync-warning" });
      warning.setText(overlapWarning.message);
      new Setting(warning).addButton((button) => button
        .setButtonText("Add required ignore rule")
        .onClick(async () => {
          overlapWarning.parent.managedIgnoreRules = Array.from(new Set([...overlapWarning.parent.managedIgnoreRules, overlapWarning.rule])).sort();
          await this.plugin.saveSettings();
          this.display();
        }));
    }

    new Setting(details)
      .addButton((button) => button.setButtonText("Sync now").onClick(() => this.plugin.syncTarget(target)))
      .addButton((button) => button.setButtonText("Pull now").onClick(() => this.plugin.pullTarget(target)))
      .addButton((button) => button.setButtonText("Apply .gitignore now").onClick(() => this.plugin.applyGitignore(target)))
      .addButton((button) => button.setButtonText("Delete").setWarning().onClick(async () => {
        this.plugin.settings.targets = this.plugin.settings.targets.filter((t) => t.id !== target.id);
        await this.plugin.saveSettings();
        this.display();
      }));
  }

  private async addIgnoreRules(target: SyncTarget, textArea: TextAreaComponent, rules: string[]): Promise<void> {
    target.managedIgnoreRules = Array.from(new Set([...target.managedIgnoreRules, ...rules])).sort();
    textArea.setValue(target.managedIgnoreRules.join("\n"));
    await this.plugin.saveSettings();
  }
}

function createDefaultTarget(): SyncTarget {
  const id = crypto.randomUUID?.() ?? String(Date.now());
  return {
    id,
    name: "New target",
    root: ".",
    remoteUrl: "",
    branch: "main",
    enabled: false,
    syncOnStartupIfBehind: false,
    autoCommit: true,
    commitMessageTemplate: "Sync: {{date}}",
    managedIgnoreRules: [".multi-git-sync-backups/"],
  };
}

function getOverlapWarning(target: SyncTarget, targets: SyncTarget[]): { message: string; parent: SyncTarget; rule: string } | null {
  const childRoot = normalizeRoot(target.root);
  if (!childRoot) return null;
  for (const parent of targets) {
    if (parent.id === target.id || !parent.enabled) continue;
    const parentRoot = normalizeRoot(parent.root);
    if (isParentOf(parentRoot, childRoot)) {
      const rule = parentRoot ? `${childRoot.slice(parentRoot.length + 1)}/` : `${childRoot}/`;
      if (!parent.managedIgnoreRules.includes(rule)) {
        return {
          parent,
          rule,
          message: `Target "${target.name}" is inside "${parent.name}". Add "${rule}" to the parent .gitignore to avoid double sync.`,
        };
      }
    }
  }
  return null;
}

function normalizeRoot(root: string): string {
  const normalized = root.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalized === "." ? "" : normalized;
}

function isParentOf(parentRoot: string, childRoot: string): boolean {
  if (!parentRoot) return !!childRoot;
  return childRoot.startsWith(`${parentRoot}/`);
}
