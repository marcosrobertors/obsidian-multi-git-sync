import { App, TAbstractFile, TFile, TFolder } from "obsidian";

export class FileTreeSelector {
  private readonly selectedRules: Set<string>;

  constructor(
    private readonly app: App,
    private readonly containerEl: HTMLElement,
    private readonly targetRoot: string,
    rules: string[],
    private readonly onChange: (rules: string[]) => void,
  ) {
    this.selectedRules = new Set(rules.map((rule) => rule.trim()).filter(Boolean));
  }

  render(): void {
    this.containerEl.empty();

    const toolbar = this.containerEl.createDiv({ cls: "multi-git-sync-tree-toolbar" });
    toolbar.createEl("button", { text: "Ignore all direct children" }).onclick = () => {
      const root = this.getRootFolder();
      if (!root) return;
      for (const child of this.getVisibleChildren(root)) this.selectedRules.add(ruleFor(child, this.rootPrefix()));
      this.emit();
      this.render();
    };
    toolbar.createEl("button", { text: "Clear ignore selection" }).onclick = () => {
      this.selectedRules.clear();
      this.emit();
      this.render();
    };

    const hint = this.containerEl.createDiv({ cls: "setting-item-description" });
    hint.setText("A árvore é carregada sob demanda. Abra uma pasta para carregar somente seus filhos diretos.");

    const root = this.getRootFolder();
    const treeEl = this.containerEl.createDiv({ cls: "multi-git-sync-tree" });
    if (!root) {
      treeEl.createEl("p", { text: "Target root not found in the vault." });
      return;
    }

    for (const child of this.getVisibleChildren(root)) this.renderEntry(treeEl, child, 0);
  }

  private renderEntry(parentEl: HTMLElement, file: TAbstractFile, depth: number): void {
    const row = parentEl.createDiv({ cls: "multi-git-sync-tree-row" });
    row.style.paddingLeft = `${depth * 16}px`;

    const checkbox = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
    const rule = ruleFor(file, this.rootPrefix());
    checkbox.checked = this.isIgnored(file);
    checkbox.onchange = () => {
      if (checkbox.checked) this.selectedRules.add(rule);
      else this.selectedRules.delete(rule);
      this.emit();
      checkbox.checked = this.isIgnored(file);
    };

    if (file instanceof TFolder) {
      const toggle = row.createEl("button", { text: "+", cls: "multi-git-sync-tree-toggle" });
      const label = row.createSpan({ text: `[dir] ${file.name}/`, cls: "multi-git-sync-tree-label" });
      let loaded = false;
      let open = false;
      const childrenEl = parentEl.createDiv({ cls: "multi-git-sync-tree-children" });
      childrenEl.hide();

      const toggleOpen = () => {
        open = !open;
        toggle.setText(open ? "-" : "+");
        if (open) {
          childrenEl.show();
          if (!loaded) {
            loaded = true;
            for (const child of this.getVisibleChildren(file)) this.renderEntry(childrenEl, child, depth + 1);
          }
        } else {
          childrenEl.hide();
        }
      };
      toggle.onclick = toggleOpen;
      label.onclick = toggleOpen;
    } else if (file instanceof TFile) {
      row.createSpan({ text: `[file] ${file.name}`, cls: "multi-git-sync-tree-label" });
    }
  }

  private getRootFolder(): TFolder | null {
    const rootPath = normalizeRoot(this.targetRoot);
    if (!rootPath) return this.app.vault.getRoot();
    const found = this.app.vault.getAbstractFileByPath(rootPath);
    return found instanceof TFolder ? found : null;
  }

  private getVisibleChildren(folder: TFolder): TAbstractFile[] {
    return [...folder.children]
      .filter((child) => !shouldHideSystemPath(child.path))
      .sort((a, b) => {
        const af = a instanceof TFolder;
        const bf = b instanceof TFolder;
        if (af !== bf) return af ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  private isIgnored(file: TAbstractFile): boolean {
    const rule = ruleFor(file, this.rootPrefix());
    if (this.selectedRules.has(rule)) return true;
    const rel = relativeToPrefix(file.path, this.rootPrefix());
    return ancestorsOf(rel).some((ancestor) => this.selectedRules.has(`${ancestor}/`));
  }

  private rootPrefix(): string {
    return normalizeRoot(this.targetRoot);
  }

  private emit(): void {
    this.onChange(Array.from(this.selectedRules).sort());
  }
}

function normalizeRoot(root: string): string {
  const normalized = root.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalized === "." ? "" : normalized;
}

function relativeToPrefix(path: string, prefix: string): string {
  if (!prefix) return path;
  if (path === prefix) return "";
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path;
}

function ruleFor(file: TAbstractFile, prefix: string): string {
  const rel = relativeToPrefix(file.path, prefix);
  return file instanceof TFolder ? `${rel}/` : rel;
}

function ancestorsOf(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const ancestors: string[] = [];
  for (let i = 1; i < parts.length; i++) ancestors.push(parts.slice(0, i).join("/"));
  return ancestors;
}

function shouldHideSystemPath(path: string): boolean {
  return path === ".obsidian" || path.startsWith(".obsidian/") || path.includes("/node_modules/") || path.endsWith("/node_modules") || path === "node_modules";
}
