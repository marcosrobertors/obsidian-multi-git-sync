# Multi Git Sync

Multi Git Sync is a desktop-only Obsidian plugin for syncing different vault folders with different Git remotes.

It is meant for vaults where one Git repository is not enough. Example use cases:

- sync the main vault to one repository;
- sync a work folder to another repository;
- keep some folders out of the main repository;
- configure `.gitignore` rules from inside Obsidian;
- run Git sync without opening a terminal.

> Beta status: this plugin is still young. Test it with non-critical repositories before relying on it as your only sync workflow.

---

## What this plugin does

For each configured sync target, the plugin can:

- initialize a Git repository if needed;
- configure the remote URL;
- fetch and pull from the remote branch;
- stage and commit local changes;
- push local commits;
- manage a protected block inside `.gitignore`;
- show logs when something fails.

A sync target is a vault-relative folder, for example:

```txt
.
Projects
Work
PrivateFolder
```

Each target can point to a different Git remote.

---

## Requirements

You need:

1. Obsidian desktop.
2. Git installed on the computer.
3. A Git remote repository, for example GitHub.
4. BRAT, if installing this as a beta plugin.

This plugin does **not** support mobile because it uses the local Git CLI.

---

## Step 1 ? Install Git

### Windows

Install Git for Windows:

```txt
https://git-scm.com/download/win
```

During installation, choose the option that makes Git available from the command line and third-party software.

After installing, close and reopen Obsidian.

You can test Git in a terminal:

```bash
git --version
```

Inside Obsidian, you can also run:

```txt
Multi Git Sync: Test Git installation
```

If Git is installed but the plugin cannot find it, open the plugin settings and set `Git path` to one of these:

```txt
C:/Program Files/Git/cmd
```

or:

```txt
C:/Program Files/Git/bin/git.exe
```

### macOS/Linux

Install Git using your system package manager or developer tools, then verify:

```bash
git --version
```

---

## Step 2 ? Install BRAT

BRAT is an Obsidian community plugin used to install beta plugins from GitHub.

1. Open Obsidian.
2. Go to:

```txt
Settings ? Community plugins
```

3. Turn off Restricted Mode if needed.
4. Click `Browse`.
5. Search for:

```txt
BRAT
```

6. Install **Obsidian42 - BRAT**.
7. Enable BRAT.

---

## Step 3 ? Install Multi Git Sync through BRAT

1. Open the command palette:

```txt
Ctrl+P
```

2. Run:

```txt
BRAT: Add a beta plugin for testing
```

3. Paste this repository URL:

```txt
https://github.com/marcosrobertors/obsidian-multi-git-sync
```

4. Choose the latest release.
5. Enable `Multi Git Sync` in:

```txt
Settings ? Community plugins
```

6. Confirm the plugin appears in:

```txt
Settings ? Multi Git Sync
```

---

## Step 4 ? Test Git inside Obsidian

Before configuring any repository, run:

```txt
Multi Git Sync: Test Git installation
```

Expected result:

```txt
Git OK: git version ...
```

If it fails, fix Git installation or set `Git path` in plugin settings.

Do not continue until this works.

---

## Core concepts

### Sync target

A sync target is one folder inside your vault that should be synced with one Git remote.

Example:

```txt
Name: Work
Root folder: Work
Remote URL: https://github.com/user/work-notes
Branch: main
```

### Root folder

The root folder is relative to the vault root.

Examples:

```txt
.
Work
Projects/ClientA
```

Use `.` only if you want the whole vault to be a Git repository.

### Remote URL

The plugin accepts HTTPS and SSH remotes:

```txt
https://github.com/user/repo
```

or:

```txt
git@github.com:user/repo.git
```

Authentication is handled by your local Git installation, not by this plugin.

---

## First setup: remote already has content

Use this when another computer should download an existing repository.

1. Run:

```txt
Multi Git Sync: New target wizard
```

2. Fill in:

```txt
Name: Work
Root folder: Work
Remote URL: https://github.com/user/repo
Branch: main
```

3. Click:

```txt
Save + Pull
```

The plugin will:

1. create the folder if needed;
2. initialize Git if needed;
3. configure `origin`;
4. fetch the remote branch;
5. check out the remote branch locally.

### If local files already exist

If the local repository has no first commit yet and local untracked files would block the checkout, the plugin moves those files to:

```txt
<target>/.multi-git-sync-backups/<timestamp>/
```

Then it checks out the remote branch.

The plugin does not delete those files.

---

## First setup: local folder should create the remote content

Use this when the local folder has the content and the remote repository is empty.

1. Create a new empty GitHub repository.
2. In Obsidian, run:

```txt
Multi Git Sync: New target wizard
```

3. Fill in name, root folder, remote URL, and branch.
4. Click:

```txt
Save target
```

5. Open the target settings and click:

```txt
Sync now
```

The plugin will:

1. initialize Git if needed;
2. apply managed `.gitignore` rules;
3. commit local files;
4. push to the remote.

---

## Normal sync

Use:

```txt
Sync now
```

or:

```txt
Multi Git Sync: Sync selected target
```

The sync flow is conservative:

1. apply managed `.gitignore` rules;
2. stage and commit local committable changes;
3. fetch the remote branch;
4. pull/rebase only if local is behind remote;
5. push local commits.

---

## Periodic sync

In settings:

```txt
Periodic auto-sync interval
```

Set a number of minutes.

Examples:

```txt
0   disabled
15  sync every 15 minutes
60  sync every hour
```

The plugin prevents overlapping sync runs.

---

## Startup sync

Each target has:

```txt
Auto sync on startup if behind remote
```

When enabled, the plugin checks whether the local target is behind the remote branch. If it is behind, it runs sync.

---

## `.gitignore` management

The plugin only edits the block between:

```gitignore
# BEGIN Multi Git Sync managed rules
...
# END Multi Git Sync managed rules
```

Manual rules outside this block are preserved.

### Ignore presets

Available presets:

- OS junk:
  - `desktop.ini`
  - `Thumbs.db`
  - `.DS_Store`
- Obsidian volatile:
  - workspace/cache/trash-like files
- Large archives:
  - `*.zip`, `*.7z`, `*.rar`, etc.
- Nested Git:
  - `**/.git/`

### Visual ignore selector

The visual selector lets you check files or folders that should be ignored.

Checked means ignored.

---

## Multiple repositories inside one vault

A common setup is:

```txt
Vault root          ? repository A
Vault root/Work     ? repository B
Vault root/Private  ? repository C
```

If a child folder is its own sync target, the parent repository should ignore that child folder to avoid double sync.

Example parent `.gitignore` rule:

```gitignore
Work/
```

The plugin warns when it detects overlapping targets.

---

## Conflicts

The plugin uses:

```bash
git pull --rebase
```

If conflicts happen:

1. Run:

```txt
Multi Git Sync: Show conflicts
```

2. Open each conflicted file.
3. Resolve conflict markers manually:

```txt
<<<<<<<
=======
>>>>>>>
```

4. Click:

```txt
Mark resolved
```

5. Click:

```txt
Continue rebase
```

6. Run sync again if needed.

Use `Abort rebase` only if you want to cancel the current rebase attempt.

---

## Logs

When something fails, run:

```txt
Multi Git Sync: Show latest log
```

Other useful commands:

```txt
Multi Git Sync: Open logs folder
Multi Git Sync: Clear old logs
```

Logs are stored under the plugin data folder:

```txt
.obsidian/plugins/multi-git-sync/logs/
```

---

## Troubleshooting

### `spawn git ENOENT`

Git was not found.

Fix:

1. Install Git.
2. Restart Obsidian.
3. Run `Multi Git Sync: Test Git installation`.
4. If needed, set `Git path` manually.

### `HEAD...origin/main unknown revision`

This means the local repository has no first commit yet. Versions `0.1.9+` handle this during first pull.

Update the plugin through BRAT.

### `untracked working tree files would be overwritten`

Local files already exist and would be overwritten by the remote checkout.

Versions `0.1.10+` back up untracked files during first pull into:

```txt
.multi-git-sync-backups/<timestamp>/
```

### Authentication fails

The plugin does not manage GitHub credentials.

Fix authentication in Git itself:

- Git Credential Manager for HTTPS;
- SSH key for SSH remotes;
- test with normal Git commands in a terminal.

### File is not syncing

Check:

1. Is it inside the target root folder?
2. Is it ignored by `.gitignore`?
3. Does `Show status` show the file?
4. Was sync actually run after creating/modifying the file?

---

## Security and privacy

This plugin runs local Git commands and can push files from configured vault folders to configured remotes.

It does not include telemetry, analytics, ads, or third-party network calls. Network access happens through your local Git executable when you configure a remote and run fetch/pull/push.

You are responsible for reviewing what is included before pushing sensitive vault content.

---

## Limitations

- Desktop only.
- Requires Git CLI.
- No mobile support.
- No complex branch management UI.
- Nested Git repositories/submodules are not automatically committed recursively.
- Conflict resolution is assisted but still manual.

---

## Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Package release files:

```bash
npm run package
```

The distributable files are generated at:

```txt
dist/multi-git-sync/
```

---

## License

MIT
