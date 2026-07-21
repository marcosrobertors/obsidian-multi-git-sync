import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const BEGIN = "# BEGIN Multi Git Sync managed rules";
const END = "# END Multi Git Sync managed rules";

export class GitignoreManager {
  constructor(private readonly vaultRoot: string) {}

  applyManagedRules(targetRoot: string, rules: string[]): void {
    const gitignorePath = resolve(this.vaultRoot, targetRoot || ".", ".gitignore");
    const current = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
    const normalizedRules = rules.map((r) => r.trim()).filter(Boolean);
    const block = [BEGIN, ...normalizedRules, END].join("\n");

    let next: string;
    const beginIndex = current.indexOf(BEGIN);
    const endIndex = current.indexOf(END);
    if (beginIndex >= 0 && endIndex > beginIndex) {
      next = current.slice(0, beginIndex).trimEnd() + "\n\n" + block + current.slice(endIndex + END.length);
    } else {
      next = current.trimEnd();
      next = next ? next + "\n\n" + block + "\n" : block + "\n";
    }
    writeFileSync(gitignorePath, next, "utf8");
  }
}
