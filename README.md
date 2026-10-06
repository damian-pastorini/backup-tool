# Backup Tool

One-way backup of local folders to other drives, for example an external disk or a Google Drive for desktop folder. It's written in Node.js. A scheduler runs the backups on cron schedules, and a small local web panel manages the configuration, runs backups by hand and shows their status.

Every backup works the same way: an **inspection** compares the sources with their destinations and lists the files that changed, and a **sync** copies only those files.

Source files are never modified or deleted. Destination files are only deleted when you pass `--allow-remove`.

## Files

| Path | Purpose |
|---|---|
| `index.js`, `lib/`, `public/` | The web panel (see [Web panel](#web-panel)). |
| `run-scheduler.js` | The scheduler, a separate process that runs the scheduled backups (see [Scheduler](#scheduler)). |
| `scripts/create-shortcut.ps1` | Creates the desktop shortcut for the web panel, and optionally a startup shortcut for the scheduler. |
| `run-inspect-folders.js` | Compares sources with destinations and reports what changed. Copies nothing. Writes sync configs for the changes it finds. |
| `run-sync.js` | Copies new and changed files from the sources to the destinations. |
| `inspect.config.dist.js` | Example settings and mappings config, to copy as `configurations/inspect.config.js`. |
| `configurations/` | All your configuration (see below). Ignored by this repository; keep it in its own private repository if you want its history. |
| `logs/` | One `inspect-folders-*.log` or `sync-*.log` per run, the scheduler's daily logs and its state. Local only, not committed. |

`configurations/` holds:

- `inspect.config.js`: your settings and folder mappings, the main configuration. Edit it from the web panel or by hand.
- `sync.config.js` (optional): the default config for `run-sync.js` when no `--config` or `--config-files` is given.
- `YYYY-MM-DD-HH-MM-SS-sync-config-files.js`: written by each inspection, the exact list of changed files, `{ settings, files: { "source file": ["destination file", ...] } }`. One source can go to several destinations. Older lists, with only the `{ "source file": ... }` part, still work.
- `YYYY-MM-DD-HH-MM-SS-sync.config.js`: written by each inspection, `{ settings, mappings }` with one folder mapping per folder with changes.

Both generated files keep the time tolerance the inspection used (`settings.modifiedTimeThresholdMs`), so a sync of them compares files exactly the same way.

Only the application is committed here. `configurations/` and `logs/` are listed in `.gitignore`, because they contain your own folder paths and file names.

## Requirements

- **Windows 10 or 11.** The desktop and startup shortcuts are Windows-only. The scripts and the web panel also run anywhere Node.js does.
- **Node.js 22.12 or newer**, which includes npm. One of the web panel's dependencies (`sanitize-html`) needs it. Check with `node --version`.
- **Git**, to download and update the app. Without it, download the ZIP from GitHub instead.
- Read access to the source folders and write access to the backup destinations.

## Installation

1. Install Node.js (the LTS version) from <https://nodejs.org>.
2. Download the app and open its folder:

   ```powershell
   git clone https://github.com/damian-pastorini/backup-tool.git
   cd backup-tool
   ```

3. Install the dependencies. This installs `@reldens/server-utils`, which the web panel needs; the two scripts only use built-in Node.js modules.

   ```powershell
   npm install
   ```

4. Set up your configuration, in one of these ways:
   - start the web panel (next step) and use **Add mapping**;
   - copy `inspect.config.dist.js` to `configurations/inspect.config.js` and replace the example paths with your own source and backup folders (see [Mapping options](#mapping-options));
   - if you keep your configuration in its own private repository, clone it as the `configurations` folder: `git clone <your-configuration-repository-url> configurations`.
5. Start the web panel and open <http://localhost:9977>:

   ```powershell
   node .
   ```

6. For scheduled backups, start the scheduler and keep it running (see [Scheduler](#scheduler)):

   ```powershell
   npm run scheduler
   ```

7. Optional: create the desktop shortcut for the panel with `npm run shortcut`, and start the scheduler at every login with `npm run shortcut -- -Startup` (see [Desktop shortcut](#desktop-shortcut)).

Each source folder is scanned recursively, so new subfolders are picked up without changing the config.

Run every command from the app's folder, because configs, generated files and `logs/` are all resolved relative to the current directory.

## Updating

```powershell
git pull
npm install
```

Then restart the web panel and the scheduler: close their console windows and start them again.

## Web panel

```powershell
node .            # or: npm start
node . --open     # also opens it in the default browser (or: npm run open)
```

Open <http://localhost:9977> and bookmark it. The port is unusual on purpose, so it doesn't clash with other local development servers.

### Desktop shortcut

`npm run shortcut` creates a **Backup Tool** shortcut on the Windows desktop. It runs `node index.js --open` in a minimized console window and opens the panel in your default browser. If the panel is already running, clicking the shortcut again only opens the browser.

The console window shows every run as it happens: a `STARTED` line, the script's own output and a `FINISHED` line with its exit code. Its title (visible when you hover the taskbar button) says `RUNNING` while a sync or an inspection is in progress, and `idle` otherwise. Closing the console window stops the panel and cancels a running sync or inspection; the script still saves its log, marked `Status: INTERRUPTED`. Closing the browser tab doesn't stop anything.

To start the **scheduler** automatically at every Windows login, run `npm run shortcut -- -Startup`. That adds a **Backup Tool Scheduler** shortcut to the Windows Startup folder, which runs `node run-scheduler.js` in a minimized console window. Double-click it there to start the scheduler right away, and delete it from there (`Win+R`, then `shell:startup`) to undo. The panel doesn't need to run for the schedules to work.

### What the panel shows

- **Status cards:** the last real backup, the last inspection, what is still pending, whether every mapped folder can be reached, and the scheduler (running or not, its next run, its last result and any schedule problems).
- **Run:** starts an inspection, or a sync with any config. "Dry run" is on by default. A real sync needs a second click to confirm. **Stop** ends the run cleanly, and the log is still written.
- **Live output:** the console output of the running script.
- **Mappings:** the settings (time tolerance, general schedule, log removal) and the folder mappings from `configurations/inspect.config.js`, with a check that each folder exists. You can add, edit, delete, enable, disable and schedule mappings, and inspect or sync a single mapping (see below).
- **History:** every log, with its result. Scheduled runs are marked **scheduled**. Click **View** to see the copied, removed and failed files.
- **Sync configs:** every config, with its list of files or folders.

### Editing mappings

**Add mapping**, **Edit** and **Delete** in the Mappings section change `configurations/inspect.config.js`. A mapping has one source folder, one or more destination folders, and the filters described in [Mapping options](#mapping-options) (the size limit is entered in MB).

**Browse...** opens a folder picker. Browsers don't give web pages the full path of a folder you pick, so the panel lists your drives and folders itself. Click through them, or type or paste a path and press **Go**. **Create folder here** makes a new folder, which is handy for a new backup destination: the inspection skips destinations that don't exist yet.

Saving checks that:

- every path is a full path (`D:\folder` or `\\server\share`);
- no destination is the source folder, inside it, or contains it;
- the same source isn't already copied to the same destination by another mapping.

Folders that don't exist right now (for example an unplugged disk) are allowed, with a warning. Each save rewrites the whole file in a standard format, so comments or custom formatting in it are not kept. If `configurations/` is a git repository, commit the file there to keep its history.

### Enabling, disabling and running single mappings

Each mapping is numbered (`#1`, `#2`, ...) in the order of the config file, and has an **Enabled** switch (also in the editor):

- **Disabled** mappings stay in the file but are skipped by full inspections and by folder syncs of `inspect.config.js`. The Mappings card doesn't warn about their missing folders.
- **Inspect** inspects only that mapping (`node run-inspect-folders.js --mapping=<number>`). Its generated file list then only has that mapping's changes; the Pending sync card and the History say so.
- **Sync** works like every backup: it inspects only that mapping, then, only if the inspection found changes, syncs the file list it generated. It needs a second click to confirm.

The Inspect and Sync buttons are off for disabled mappings and while another job runs.

### Settings

The settings at the top of the Mappings section are saved with **Save settings** in `configurations/inspect.config.js`:

- **Time tolerance** (`settings.modifiedTimeThresholdMs`, entered in seconds), explained in [How files are compared](#how-files-are-compared). Until you save a value, the default of 2 seconds is used.
- **General schedule** (`settings.schedule`): on/off and a cron expression, see [Scheduler](#scheduler).
- **Remove old logs** (`settings.logs`): on by default, removes logs older than the given number of days (30 by default). Turn it off to keep every log.

### Schedules in the panel

Each mapping has a **Scheduled** checkbox and shows its schedule and next run. Its own cron expression is set in the mapping editor; leave it empty to use the general schedule.

**Edit schedule...** (next to the general schedule and in the mapping editor) opens a schedule builder: every few minutes, every hour, every day at a time, on some days of the week, every month on a day, or any custom cron expression. It shows what the expression means and its next 3 run times before you use it. You can also type an expression directly.

The panel serves plain HTTP only. There is no SSL, no HTTPS redirect and no HSTS. It has no login and listens on `127.0.0.1` only. To use another address or port, set environment variables before starting it:

```powershell
$env:BACKUP_TOOL_PORT = '9988'; $env:BACKUP_TOOL_HOST = '0.0.0.0'; node .
```

The panel runs one job of its own at a time. The scheduler runs its jobs separately, so a scheduled job and a job started from the panel can run at the same time. The panel is built on `AppServerFactory` from [`@reldens/server-utils`](https://www.npmjs.com/package/@reldens/server-utils).

## Scheduler

`run-scheduler.js` runs the scheduled backups in its own process. The web panel only edits the configuration; the schedules run whether the panel is open or not, as long as the scheduler runs.

```powershell
npm run scheduler        # or: node run-scheduler.js
```

Keep it running, or start it at every login with the startup shortcut (see [Desktop shortcut](#desktop-shortcut)). Only one scheduler can run at a time, a second one stops with a message. Stop it with Ctrl+C or by closing its console window; the inspections and syncs it was running still save their logs, marked `Status: INTERRUPTED`.

Every minute it reads `configurations/inspect.config.js` again, so changes made in the panel apply within a minute without a restart, and starts the jobs that are due. Each job:

1. runs an **inspection** of its mappings (`run-inspect-folders.js --mapping=...`);
2. only if the inspection found changes, runs a **sync** of the file list the inspection generated (`run-sync.js --config-files=...`). Nothing is ever deleted from the destinations.

Jobs run in parallel, as separate processes. A mapping that is still being inspected or synced is never started again by another job until it finishes: the other job skips it and logs that.

### Which mappings run when

A mapping is only scheduled when the mapping is **Enabled** and its **Scheduled** checkbox is on. Then:

| General schedule | Mapping's own cron | Runs |
|---|---|---|
| on | empty | in the general job, together with the other mappings like it, on the general cron |
| on | set | in its own job, on its own cron (it overrides the general one) |
| off | set | in its own job, on its own cron |
| off | empty | in its own job, on the general cron |

Disabled mappings, and mappings whose **Scheduled** checkbox is off, are never scheduled. Problems, like a scheduled mapping with no cron anywhere, show on the panel's Scheduler card and in the scheduler's log.

### Cron expressions

Standard 5-field cron expressions, in local time: `minute hour day-of-month month day-of-week`. Examples:

| Expression | Runs |
|---|---|
| `0 3 * * *` | every day at 03:00 |
| `*/30 * * * *` | every 30 minutes |
| `0 */6 * * *` | every 6 hours |
| `30 2 * * 1-5` | at 02:30, Monday to Friday |
| `0 4 1 * *` | at 04:00 on the 1st of every month |

Fields accept `*`, numbers, ranges (`1-5`), steps (`*/15`, `0-30/10`), lists (`1,15`), month and weekday names (`JAN`, `MON`), and `7` for Sunday. `@hourly`, `@daily`, `@weekly`, `@monthly` and `@yearly` work too. When both the day of month and the day of week are set, a day matches if either does, like in standard cron.

Runs that were due while the scheduler wasn't running (PC off, scheduler stopped) are not made up later; the next due run catches all the changes anyway.

### Scheduler files

- `logs/scheduler-YYYYMMDD.log`: what the scheduler did, one file per day (jobs started, skipped and finished, and their scripts' output).
- `logs/scheduler-state.json`: jobs, next runs, running jobs and last results, read by the panel's Scheduler card.
- `logs/scheduler.lock`: stops a second scheduler from starting.

## Command-line workflow

The web panel runs these same commands.

```powershell
# 1. Find what changed (copies nothing)
node run-inspect-folders.js

# 2. Preview the copy using the generated file list
node run-sync.js --config-files=YYYY-MM-DD-HH-MM-SS-sync-config-files.js --dry-run

# 3. Copy for real
node run-sync.js --config-files=YYYY-MM-DD-HH-MM-SS-sync-config-files.js
```

In steps 2 and 3, use the file name that step 1 prints on its `File config: ...` line. `run-sync.js` looks for config names in the current folder first, then in `configurations/`, so the file name alone is enough.

Alternatively, skip the inspect step and let the sync scan every folder itself:

```powershell
node run-sync.js --config=inspect.config.js --dry-run
node run-sync.js --config=inspect.config.js
```

## Commands

### `node run-inspect-folders.js [--with-hash] [--modified-time-threshold=<time>] [--mapping=<numbers>]`

- Reads `configurations/inspect.config.js`. The name is fixed.
- For each enabled mapping and each destination, walks the source tree and compares every file with its copy in the destination (see [How files are compared](#how-files-are-compared)). Disabled mappings are skipped.
- `--mapping=2` (or `--mapping=1,3`) inspects only those mappings, numbered from 1 in the config order, even if they are disabled.
- Skips any source or destination root that does not exist, and prints `Origin not found` or `Destination not found`. To fill a brand-new destination, use the folder-mode sync instead.
- Prints the folders that have changes, with their counts of new and modified files.
- If anything changed, writes both configs to `configurations/`.
- Always writes `logs/inspect-folders-<timestamp>.log`.

### `node run-sync.js [options]`

| Option | Effect |
|---|---|
| `--dry-run` | Shows and logs what would be copied or removed, without changing anything. |
| `--config=<file>` | Folder mode with the given config. Any file with a `mappings` array works, including `inspect.config.js`. Disabled mappings are skipped. |
| `--mapping=<numbers>` | Folder mode only: syncs only those mappings (`--mapping=2` or `--mapping=1,3`, numbered from 1 in the config order), even if they are disabled. |
| `--config-files=<file>` | File mode: syncs only the files listed in the given file. |
| `--with-hash` | When the size matches but the source is newer, compares MD5 hashes before copying. |
| `--modified-time-threshold=<time>` | How much newer the source must be to count as changed (see [How files are compared](#how-files-are-compared)). In milliseconds (`2000`) or with a unit (`2s`, `500ms`). Overrides `settings.modifiedTimeThresholdMs` from the config. The inspect script takes it too. |
| `--allow-remove` | Folder mode only: deletes destination files that no longer exist in the source, respecting the filters. It has no effect in file mode. |

When no config option is given, the script picks its config like this:

1. If `configurations/sync-config-files.js` exists, it runs in file mode with that file.
2. Otherwise it runs in folder mode with `configurations/sync.config.js`. If that file doesn't exist either, it stops with `Config file not found`.

### Stopping

Ctrl+C, **Stop** in the web panel, or closing the console window ends a run. The log is still written, with `Status: INTERRUPTED`. An inspection also writes the configs it has collected up to that point.

## How files are compared

Both scripts use the same rules:

1. If the destination file is missing, the file is copied (`new`).
2. If the sizes differ, the file is copied (`modified`).
3. If the sizes match but the source's modified time is newer by more than the time tolerance:
   - without `--with-hash`, the file is copied;
   - with `--with-hash`, the MD5 hashes are compared and the file is copied only if they differ. Files over the hash size limit, and files whose hashing times out, are copied anyway and listed under `HASH ERRORS`.
4. Otherwise the file is already in sync (`OK`).

A destination file with the same size, and a modified time that is newer, the same, or older by no more than the tolerance, is never overwritten.

The time tolerance comes from, in this order:

1. the `--modified-time-threshold` flag;
2. `settings.modifiedTimeThresholdMs` in the config being used (set from the panel's **Time tolerance** field for `inspect.config.js`, and copied into each generated config);
3. the default, 2 seconds.

**Why 2 seconds:** FAT32 disks store modified times in 2-second steps. exFAT disks can store exact times, but many copy tools still write them in 2-second steps. A file copied that way can look up to 2 seconds older than its source, although it's identical. Without the tolerance, every such file would be copied again. Use 0 for an exact comparison. Each log header records the value used.

| Hash limit | Inspect | Sync |
|---|---|---|
| Max file size | 100 MB | 500 MB |
| Timeout per file | 10 s | 30 s |

Hashing reads both files completely. For files that a cloud drive (such as Google Drive for desktop) only streams on demand, that means downloading them.

After each copy, the sync sets the destination's modified time to match the source, then checks the copy. It compares sizes, and also hashes if the timestamps still differ by more than the threshold. A failed check is listed under `ERRORS`.

Google Drive shortcut files (`.gdoc`, `.gsheet`, `.gslides`, `.gform`, `.gmap`) are always skipped.

## Mapping options

Format of `configurations/inspect.config.js` (the web panel writes the same fields):

```js
module.exports = {
    settings: {
        modifiedTimeThresholdMs: 2000,           // time tolerance (optional, default 2000)
        schedule: {                              // the general schedule (optional)
            enabled: true,
            cron: '0 3 * * *'
        },
        logs: {                                  // log removal (optional, on by default, 30 days)
            removeOldLogs: true,
            keepDays: 30
        }
    },
    mappings: [
        {
            from: 'C:\\source\\documents',
            to: ['X:\\backup-1\\documents', 'Y:\\backup-2\\documents'],
            enabled: true,                       // false skips it in full inspections, syncs and schedules (default true)
            schedule: {                          // optional, off by default
                enabled: true,
                cron: ''                         // empty = the general schedule
            },
            includeExtensions: [],               // only these extensions (empty = all), lowercase with the dot
            excludeExtensions: ['.tmp', '.log'],
            maxSizeBytes: 0,                     // skip files larger than this (0 = no limit)
            excludeHidden: true,                 // skip any path segment starting with "."
            excludeSystem: true,                 // skip System Volume Information, $RECYCLE.BIN, desktop.ini, Thumbs.db
            excludeNames: ['node_modules']       // skip any file or folder with exactly these names
        }
    ]
};
```

`to` is an array, and each destination is processed separately. Filters apply in folder mode only. In file mode the list is used as it is, because the inspect step has already filtered it.

## Logs

The name of `logs/sync-YYYYMMDD-HHMMSS.log` uses local time. The `Timestamp:` line inside the file is in UTC. Logs and generated configs are never overwritten: when two runs finish in the same second, the second file gets a `-2` suffix (`-3`, ...). Each sync log contains:

- A header with who started it (`Triggered By:` for scheduled runs), the config used, the dry-run, allow-remove and hash flags, the time tolerance and (for folder configs) which mappings ran. Interrupted runs also have a `Status: INTERRUPTED` line.
- `HASH ERRORS`
- `ALREADY SYNCED FILES`, one `OK | name | src -> dst` line per file.
- `UPDATED FILES`, one `SYNC | name | src -> dst` line per file. In a dry run, these are the files that would be copied.
- `REMOVED FILES`, one `RM | name | path` line per file.
- `ERRORS`

The **Last backup** card and the **History** table in the web panel show the latest synced files. Without the panel, open the newest `sync-*.log` whose header says `Dry Run: NO`, and read its `UPDATED FILES` section.

**Old logs are removed by default.** The scheduler removes `sync-*`, `inspect-folders-*` and `scheduler-*` logs older than `settings.logs.keepDays` (30 days) when it starts and once a day. Set `settings.logs.removeOldLogs` to `false` (the panel's **Remove old logs** checkbox) to keep every log. Other files in `logs/` are never removed.
