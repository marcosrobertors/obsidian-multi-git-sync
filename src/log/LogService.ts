import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "fs";
import { join } from "path";

export class LogService {
  private readonly logsDir: string;
  private currentLogPath = "";

  constructor(private readonly vaultRoot: string) {
    this.logsDir = join(vaultRoot, ".obsidian", "plugins", "multi-git-sync", "logs");
  }

  start(label: string): string {
    mkdirSync(this.logsDir, { recursive: true });
    const safeLabel = label.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "sync";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.currentLogPath = join(this.logsDir, `${stamp}-${safeLabel}.log`);
    writeFileSync(this.currentLogPath, `Multi Git Sync log\nStarted: ${new Date().toString()}\nTarget: ${label}\n\n`, "utf8");
    return this.currentLogPath;
  }

  append(message: string): void {
    if (!this.currentLogPath) this.start("manual");
    appendFileSync(this.currentLogPath, `${message}\n`, "utf8");
  }

  command(cwd: string, args: string[]): void {
    this.append(`\n$ git -C ${cwd || "."} ${args.join(" ")}`);
  }

  result(stdout: string, stderr: string): void {
    if (stdout.trim()) this.append(`stdout:\n${truncate(stdout.trimEnd())}`);
    if (stderr.trim()) this.append(`stderr:\n${truncate(stderr.trimEnd())}`);
  }

  error(error: unknown): void {
    this.append(`\nERROR:\n${error instanceof Error ? error.stack || error.message : String(error)}`);
  }

  getCurrentLogPath(): string {
    return this.currentLogPath;
  }

  latest(): { path: string; text: string } | null {
    if (!existsSync(this.logsDir)) return null;
    const files = readdirSync(this.logsDir)
      .filter((name) => name.endsWith(".log"))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    const path = join(this.logsDir, files[0]);
    return { path, text: readFileSync(path, "utf8") };
  }

  clearOldLogs(keep = 20): number {
    if (!existsSync(this.logsDir)) return 0;
    const files = readdirSync(this.logsDir)
      .filter((name) => name.endsWith(".log"))
      .sort()
      .reverse();
    let deleted = 0;
    for (const name of files.slice(keep)) {
      unlinkSync(join(this.logsDir, name));
      deleted++;
    }
    return deleted;
  }

  getLogsDir(): string {
    mkdirSync(this.logsDir, { recursive: true });
    return this.logsDir;
  }
}

function truncate(text: string): string {
  const maxChars = 12000;
  const maxLines = 180;
  const lines = text.split(/\r?\n/);
  let out: string;
  if (lines.length > maxLines) {
    const head = lines.slice(0, 80).join("\n");
    const tail = lines.slice(-80).join("\n");
    out = `${head}\n... truncated ${lines.length - 160} middle lines ...\n${tail}`;
  } else {
    out = lines.join("\n");
  }
  if (out.length > maxChars) {
    const head = out.slice(0, 6000);
    const tail = out.slice(-4000);
    out = `${head}\n... truncated middle chars ...\n${tail}`;
  }
  return out;
}
