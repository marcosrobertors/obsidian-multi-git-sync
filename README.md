# Multi Git Sync

Multi Git Sync is a desktop-only Obsidian plugin for syncing different vault scopes with different Git remotes.

It is designed for vaults where one repository is not enough, for example:

- the main vault syncs to one repository;
- a sensitive or work-specific folder syncs to another repository;
- selected folders need their own `.gitignore` rules;
- sync should be available from inside Obsidian without opening a terminal.

> Beta status: this plugin is usable, but still young. Test with non-critical repositories before using it as your only sync workflow.

## Features

- Multiple sync targets, each pointing to a vault-relative folder.
- HTTPS and SSH Git remotes.
- Manual sync from ribbon, command palette, or target settings.
- Pull-only command for first setup on another machine.
- Optional periodic auto-sync.
- Optional startup sync when a target is behind its remote.
- Visual `.gitignore` helper with presets.
- Managed `.gitignore` block that preserves manual rules outside the block.
- Conflict helper: open conflicted files, mark resolved, continue or abort rebase.
- Short notices plus persistent logs.
- Desktop-only Git CLI integration.

## Requirements

- Obsidian desktop.
- Git installed and available in your system PATH, or configured in the plugin settings.
- A Git remote you control.

Check Git:

```bash
git --version
```

## Install with BRAT

1. Install the Obsidian community plugin **BRAT**.
2. Open the command palette.
3. Run `BRAT: Add a beta plugin for testing`.
4. Paste this repository URL.
5. Enable `Multi Git Sync` in Obsidian community plugins.

If BRAT asks for a version, use the latest release.

## Manual install

Download the latest release assets:

- `manifest.json`
- `main.js`
- `styles.css`

Copy them into:

```txt
<your-vault>/.obsidian/plugins/multi-git-sync/
```

Then restart Obsidian and enable the plugin.

## First machine: initial push

Use this when the local folder already has the content and the remote is empty.

1. Create a target in plugin settings or run `Multi Git Sync: New target wizard`.
2. Set:
   - name;
   - root folder, for example `SAG`;
   - remote URL;
   - branch, usually `main`.
3. Click `Sync now`.

The plugin initializes Git if needed, commits local changes, and pushes to the remote.

## Another machine: first pull

Use this when the remote already has content and the local folder should receive it.

1. Run `Multi Git Sync: New target wizard`.
2. Enter the same root folder, remote URL, and branch.
3. Click `Save + Pull`.

If the local folder already has files that Git would overwrite, Git will block the pull. The plugin does not automatically delete, overwrite, or stash user files.

## Normal sync

`Sync now` runs a conservative Git flow:

1. apply managed `.gitignore` rules;
2. stage and commit local committable changes;
3. fetch the remote branch;
4. pull/rebase only when behind remote;
5. push local commits.

## Conflicts

The plugin uses `git pull --rebase`. If conflicts happen:

1. Run `Multi Git Sync: Show conflicts`.
2. Open each conflicted file.
3. Resolve conflict markers manually:

```txt
<<<<<<<
=======
>>>>>>>
```

4. Click `Mark resolved`.
5. Click `Continue rebase`.
6. Run `Sync now` again if needed.

Use `Abort rebase` only if you want to cancel the current rebase attempt.

## Logs

Logs are stored under the plugin data folder:

```txt
.obsidian/plugins/multi-git-sync/logs/
```

Useful commands:

- `Multi Git Sync: Show latest log`
- `Multi Git Sync: Open logs folder`
- `Multi Git Sync: Clear old logs`

## Security and privacy

This plugin runs local Git commands and can push files from configured vault folders to configured remotes.

It does not include telemetry, analytics, ads, or third-party network calls. Network access happens through your local Git executable when you configure a remote and run pull/push/fetch.

You are responsible for checking your `.gitignore` rules before pushing sensitive vault content.

## Limitations

- Desktop only.
- Requires Git CLI.
- No mobile support.
- No branch management UI beyond choosing a branch name.
- Nested Git repositories/submodules are not automatically committed recursively.
- Conflict resolution is assisted but still manual.

## Development

```bash
npm install
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

## License

MIT
