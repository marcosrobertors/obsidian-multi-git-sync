import { App, Notice, TFile } from "obsidian";
import { CliGitClient } from "../git/CliGitClient";
import { GitignoreManager } from "../ignore/GitignoreManager";
import { LogService } from "../log/LogService";
import { MultiGitSyncSettings, SyncTarget } from "../types";

export class SyncService {
  constructor(
    private readonly app: App,
    private readonly settings: MultiGitSyncSettings,
    private readonly vaultRoot: string,
  ) {}

  async syncTarget(target: SyncTarget): Promise<void> {
    if (!target.enabled) return;
    const log = new LogService(this.vaultRoot);
    log.start(target.name || target.root);
    log.append(`Root: ${target.root}`);
    log.append(`Remote: ${target.remoteUrl}`);
    log.append(`Branch: ${target.branch || "main"}`);
    this.validateTarget(target);
    this.validateTargetDoesNotDoubleSyncChildren(target);
    log.append("Applying managed .gitignore rules.");
    new GitignoreManager(this.vaultRoot).applyManagedRules(target.root, target.managedIgnoreRules);

    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot, log);
    const message = renderCommitMessage(target.commitMessageTemplate || "Sync: {{date}}", target.name);
    try {
      log.append("Starting sync.");
      const conflicts = await git.sync(target.root, target.remoteUrl, target.branch || "main", message, target.autoCommit);
      if (conflicts.length > 0) {
        log.append(`Conflicts: ${conflicts.join(", ")}`);
        await this.openConflictFiles(target.root, conflicts);
        this.notice(`Sync conflict in ${target.name}. Opened unmerged files.`, "WARNING");
        return;
      }
      log.append("Sync completed.");
      this.notice(`Synced ${target.name}.`, "ALL", true);
    } catch (error) {
      log.error(error);
      this.notice(`Sync failed for ${target.name}. See latest Multi Git Sync log.`, "ERROR");
      throw error;
    }
  }

  async syncAll(): Promise<void> {
    const targets = this.settings.targets.filter((t) => t.enabled);
    this.validateOverlappingTargets(targets);
    for (const target of targets) {
      await this.syncTarget(target);
    }
    if (targets.length > 1) this.notice("Sync complete.", "ALL", true);
  }

  async pullTarget(target: SyncTarget): Promise<void> {
    if (!target.enabled) return;
    const log = new LogService(this.vaultRoot);
    log.start(`pull-${target.name || target.root}`);
    log.append(`Root: ${target.root}`);
    log.append(`Remote: ${target.remoteUrl}`);
    log.append(`Branch: ${target.branch || "main"}`);
    this.validateTarget(target);
    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot, log);
    try {
      const conflicts = await git.pull(target.root, target.remoteUrl, target.branch || "main");
      if (conflicts.length > 0) {
        log.append(`Conflicts: ${conflicts.join(", ")}`);
        await this.openConflictFiles(target.root, conflicts);
        this.notice(`Pull conflict in ${target.name}. Opened unmerged files.`, "WARNING");
        return;
      }
      log.append("Pull completed.");
      this.notice(`Pulled ${target.name}.`, "ALL", true);
    } catch (error) {
      log.error(error);
      this.notice(`Pull failed for ${target.name}. See latest Multi Git Sync log.`, "ERROR");
      throw error;
    }
  }

  async getStatus(target: SyncTarget): Promise<string> {
    this.validateTarget(target);
    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot);
    return await git.status(target.root);
  }

  async testGit(): Promise<string> {
    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot);
    return await git.version();
  }

  async diagnoseTarget(target: SyncTarget): Promise<string> {
    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot);
    const lines = [
      `Target: ${target.name || "(unnamed)"}`,
      `Root: ${target.root || "."}`,
      `Remote: ${target.remoteUrl || "(none)"}`,
      `Branch: ${target.branch || "main"}`,
      "",
    ];
    lines.push(`Git repository: ${await git.isRepository(target.root) ? "yes" : "no"}`);
    if (target.remoteUrl.trim()) {
      try {
        await git.ensureRepository(target.root, target.remoteUrl, target.branch || "main");
        lines.push(`Remote branch exists: ${await git.remoteBranchExistsPublic(target.root, target.branch || "main") ? "yes" : "no"}`);
        lines.push("");
        lines.push("Status:");
        lines.push(await git.status(target.root));
      } catch (error) {
        lines.push("");
        lines.push(`Diagnostic error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return lines.join("\n");
  }

  async getConflicts(target: SyncTarget): Promise<string[]> {
    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot);
    return await git.hasUnmerged(target.root);
  }

  async markConflictResolved(target: SyncTarget, file: string): Promise<void> {
    const log = new LogService(this.vaultRoot);
    log.start(`resolve-${target.name || target.root}`);
    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot, log);
    await git.addPaths(target.root, [file]);
  }

  async continueRebase(target: SyncTarget): Promise<void> {
    const log = new LogService(this.vaultRoot);
    log.start(`rebase-continue-${target.name || target.root}`);
    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot, log);
    await git.rebaseContinue(target.root);
  }

  async abortRebase(target: SyncTarget): Promise<void> {
    const log = new LogService(this.vaultRoot);
    log.start(`rebase-abort-${target.name || target.root}`);
    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot, log);
    await git.rebaseAbort(target.root);
  }

  async syncOnStartupIfBehind(): Promise<void> {
    const git = new CliGitClient(this.settings.gitPath, this.vaultRoot);
    for (const target of this.settings.targets.filter((t) => t.enabled && t.syncOnStartupIfBehind)) {
      try {
        if (await git.isBehind(target.root, target.branch || "main")) await this.syncTarget(target);
      } catch (error) {
        this.notice(`Startup sync check failed for ${target.name}: ${String(error)}`, "WARNING");
      }
    }
  }

  private validateTarget(target: SyncTarget): void {
    if (!target.root.trim()) throw new Error("Target root is required.");
    if (!target.remoteUrl.trim()) throw new Error("Remote URL is required.");
  }

  private validateOverlappingTargets(targets: SyncTarget[]): void {
    for (const parent of targets) {
      const parentRoot = normalizeRoot(parent.root);
      for (const child of targets) {
        if (parent.id === child.id) continue;
        const childRoot = normalizeRoot(child.root);
        if (!childRoot || !isParentOf(parentRoot, childRoot)) continue;
        const requiredRule = parentRoot ? `${childRoot.slice(parentRoot.length + 1)}/` : `${childRoot}/`;
        if (!parent.managedIgnoreRules.includes(requiredRule)) {
          throw new Error(`Target "${child.name}" is inside "${parent.name}". Add "${requiredRule}" to the parent .gitignore first.`);
        }
      }
    }
  }

  private validateTargetDoesNotDoubleSyncChildren(parent: SyncTarget): void {
    const parentRoot = normalizeRoot(parent.root);
    for (const child of this.settings.targets.filter((target) => target.enabled)) {
      if (parent.id === child.id) continue;
      const childRoot = normalizeRoot(child.root);
      if (!childRoot || !isParentOf(parentRoot, childRoot)) continue;
      const requiredRule = parentRoot ? `${childRoot.slice(parentRoot.length + 1)}/` : `${childRoot}/`;
      if (!parent.managedIgnoreRules.includes(requiredRule)) {
        throw new Error(`Target "${child.name}" is inside "${parent.name}". Add "${requiredRule}" to the parent .gitignore first.`);
      }
    }
  }

  private async openConflictFiles(targetRoot: string, files: string[]): Promise<void> {
    for (const file of files) {
      const path = [targetRoot, file].filter((p) => p && p !== ".").join("/").replace(/\\/g, "/");
      const abstractFile = this.app.vault.getAbstractFileByPath(path);
      if (abstractFile instanceof TFile) await this.app.workspace.getLeaf(true).openFile(abstractFile);
    }
  }

  private notice(message: string, level: "ALL" | "WARNING" | "ERROR", success = false): void {
    if (success && this.settings.hideSuccessMessage) return;
    if (this.settings.noticeLevel === "ERROR" && level !== "ERROR") return;
    if (this.settings.noticeLevel === "WARNING" && level === "ALL") return;
    new Notice(message);
  }
}

function normalizeRoot(root: string): string {
  const normalized = root.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalized === "." ? "" : normalized;
}

function isParentOf(parentRoot: string, childRoot: string): boolean {
  if (!parentRoot) return !!childRoot;
  return childRoot.startsWith(`${parentRoot}/`);
}

function renderCommitMessage(template: string, targetName: string): string {
  return template
    .replace(/\{\{date\}\}/g, new Date().toISOString().slice(0, 19).replace("T", " "))
    .replace(/\{\{target\}\}/g, targetName);
}
