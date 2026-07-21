import { ExecFileException, execFile } from "child_process";
import { join, resolve } from "path";
import { existsSync, mkdirSync, statSync } from "fs";

export interface GitResult {
  stdout: string;
  stderr: string;
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

export class GitError extends Error {
  constructor(message: string, public readonly result?: GitResult, public readonly code?: string | number) {
    super(message);
  }
}

export class CliGitClient {
  constructor(
    private readonly gitPath: string,
    private readonly vaultRoot: string,
    private readonly logger?: { command(cwd: string, args: string[]): void; result(stdout: string, stderr: string): void },
  ) {}

  async run(cwdRelative: string, args: string[]): Promise<GitResult> {
    const cwd = resolve(this.vaultRoot, cwdRelative || ".");
    this.logger?.command(cwdRelative || ".", args);
    return new Promise((resolvePromise, reject) => {
      execFile(this.getGitExecutable(), args, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        const result = { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
        this.logger?.result(result.stdout, result.stderr);
        if (error) {
          reject(new GitError(formatGitError(error, result), result, error.code ?? undefined));
          return;
        }
        resolvePromise(result);
      });
    });
  }

  async isBehind(root: string, branch: string): Promise<boolean> {
    if (!(await this.remoteBranchExists(root, branch))) return false;
    await this.run(root, ["fetch", "origin", branch]);
    return (await this.getAheadBehind(root, branch)).behind > 0;
  }

  async version(): Promise<string> {
    const result = await this.run(".", ["--version"]);
    return result.stdout.trim();
  }

  async status(root: string): Promise<string> {
    const result = await this.run(root, ["status", "-sb", "--ignore-submodules=dirty"]);
    return result.stdout.trim() || "No status output.";
  }

  async hasChanges(root: string, ignoreDirtySubmodules = false): Promise<boolean> {
    const args = ignoreDirtySubmodules ? ["status", "--porcelain", "--ignore-submodules=dirty"] : ["status", "--porcelain"];
    const result = await this.run(root, args);
    return result.stdout.trim().length > 0;
  }

  async hasStagedChanges(root: string): Promise<boolean> {
    try {
      await this.run(root, ["diff", "--cached", "--quiet"]);
      return false;
    } catch (error) {
      if (error instanceof GitError && error.code === 1) return true;
      throw error;
    }
  }

  async hasUnmerged(root: string): Promise<string[]> {
    const result = await this.run(root, ["diff", "--name-only", "--diff-filter=U"]);
    return result.stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  }

  async addPaths(root: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.run(root, ["add", "--", ...paths]);
  }

  async rebaseContinue(root: string): Promise<void> {
    await this.run(root, ["rebase", "--continue"]);
  }

  async rebaseAbort(root: string): Promise<void> {
    await this.run(root, ["rebase", "--abort"]);
  }

  async remoteBranchExistsPublic(root: string, branch: string): Promise<boolean> {
    return await this.remoteBranchExists(root, branch);
  }

  async isRepository(root: string): Promise<boolean> {
    try {
      await this.run(root, ["rev-parse", "--is-inside-work-tree"]);
      return true;
    } catch {
      return false;
    }
  }

  async ensureRepository(root: string, remoteUrl: string, branch: string): Promise<void> {
    mkdirSync(resolve(this.vaultRoot, root || "."), { recursive: true });
    try {
      await this.run(root, ["rev-parse", "--is-inside-work-tree"]);
    } catch {
      await this.run(root, ["init"]);
    }

    if (process.platform === "win32") {
      await this.run(root, ["config", "core.longpaths", "true"]);
      await this.run(root, ["config", "core.autocrlf", "false"]);
      await this.run(root, ["config", "core.safecrlf", "false"]);
    }

    const remotes = await this.run(root, ["remote"]);
    if (remotes.stdout.split(/\r?\n/).includes("origin")) {
      await this.run(root, ["remote", "set-url", "origin", remoteUrl]);
    } else {
      await this.run(root, ["remote", "add", "origin", remoteUrl]);
    }

    await this.run(root, ["branch", "-M", branch]);
  }

  async pull(root: string, remoteUrl: string, branch: string): Promise<string[]> {
    await this.ensureRepository(root, remoteUrl, branch);
    if (!(await this.remoteBranchExists(root, branch))) {
      throw new GitError(`Remote branch "${branch}" does not exist yet.`);
    }
    await this.run(root, ["fetch", "origin", branch]);
    if ((await this.getAheadBehind(root, branch)).behind === 0) return [];
    if (await this.hasChanges(root, true)) {
      throw new GitError("Cannot pull: local commitable changes exist. Commit, stash, or sync first.");
    }
    try {
      await this.run(root, ["pull", "--rebase", "origin", branch]);
    } catch (error) {
      const unmerged = await this.hasUnmerged(root);
      if (unmerged.length > 0) return unmerged;
      throw error;
    }
    return [];
  }

  async sync(root: string, remoteUrl: string, branch: string, commitMessage: string, autoCommit: boolean): Promise<string[]> {
    await this.ensureRepository(root, remoteUrl, branch);

    if (autoCommit && await this.hasChanges(root, true)) {
      await this.stageAndCommit(root, commitMessage);
    }

    const remoteExists = await this.remoteBranchExists(root, branch);
    if (remoteExists) {
      await this.run(root, ["fetch", "origin", branch]);
      const aheadBehind = await this.getAheadBehind(root, branch);
      if (aheadBehind.behind === 0) {
        await this.run(root, ["push", "-u", "origin", branch]);
        return [];
      }
      if (await this.hasChanges(root, true)) {
        throw new GitError("Cannot pull with rebase: local commitable changes remain after git add/commit. Check latest log.");
      }
      try {
        await this.run(root, ["pull", "--rebase", "origin", branch]);
      } catch (error) {
        const unmerged = await this.hasUnmerged(root);
        if (unmerged.length > 0) return unmerged;
        throw error;
      }
    }

    if (autoCommit && await this.hasChanges(root, true)) {
      await this.stageAndCommit(root, commitMessage);
    }

    await this.run(root, ["push", "-u", "origin", branch]);
    return [];
  }

  async getAheadBehind(root: string, branch: string): Promise<AheadBehind> {
    const result = await this.run(root, ["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`]);
    const [aheadRaw, behindRaw] = result.stdout.trim().split(/\s+/);
    return {
      ahead: Number.parseInt(aheadRaw || "0", 10) || 0,
      behind: Number.parseInt(behindRaw || "0", 10) || 0,
    };
  }

  private async stageAndCommit(root: string, commitMessage: string): Promise<void> {
    await this.run(root, ["add", "."]);
    if (await this.hasStagedChanges(root)) {
      await this.run(root, ["commit", "-m", commitMessage]);
    }
  }

  private async remoteBranchExists(root: string, branch: string): Promise<boolean> {
    try {
      const result = await this.run(root, ["ls-remote", "--heads", "origin", branch]);
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private getGitExecutable(): string {
    if (!this.gitPath || this.gitPath === "git") return detectGitExecutable();
    try {
      if (statSync(this.gitPath).isDirectory()) return join(this.gitPath, process.platform === "win32" ? "git.exe" : "git");
    } catch {
      // Treat as executable path.
    }
    return this.gitPath;
  }
}

function formatGitError(error: ExecFileException, result: GitResult): string {
  if (error.code === "ENOENT") {
    return [
      "Git executable not found.",
      "",
      "Install Git and restart Obsidian, or set Git path in Multi Git Sync settings.",
      "",
      "Windows examples:",
      "C:/Program Files/Git/cmd",
      "C:/Program Files/Git/bin/git.exe",
    ].join("\n");
  }
  const stderr = tail(result.stderr.trim(), 30);
  const stdout = tail(result.stdout.trim(), 10);
  return [
    error.message,
    error.code !== undefined ? `exit/code: ${error.code}` : "",
    stderr ? `stderr tail:\n${stderr}` : "",
    stdout ? `stdout tail:\n${stdout}` : "",
  ].filter(Boolean).join("\n");
}

function detectGitExecutable(): string {
  if (process.platform !== "win32") return "git";
  const candidates = [
    join(process.env.ProgramFiles || "C:/Program Files", "Git", "cmd", "git.exe"),
    join(process.env.ProgramFiles || "C:/Program Files", "Git", "bin", "git.exe"),
    join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Git", "cmd", "git.exe"),
    join(process.env.LocalAppData || "", "Programs", "Git", "cmd", "git.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "git";
}

function tail(text: string, maxLines: number): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}
