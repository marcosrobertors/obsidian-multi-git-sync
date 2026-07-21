import { copyFileSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const out = join("dist", "multi-git-sync");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const file of ["manifest.json", "main.js", "styles.css", "versions.json", "README.md", "LICENSE"]) {
  copyFileSync(file, join(out, file));
}
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
writeFileSync(join("dist", `multi-git-sync-${manifest.version}.zip.README.txt`), "Zip this folder's manifest.json, main.js, and styles.css for a GitHub release.\n", "utf8");
console.log(`Packaged ${out}`);
