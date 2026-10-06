/**
 * Folder Change Inspection Script
 *
 * Detects which folders have changes between source and destination.
 * Reports folder-level differences without syncing.
 *
 * USAGE:
 * 1. Copy inspect.config.dist.js to configurations/inspect.config.js and set your folders
 * 2. Run: node run-inspect-folders.js
 * 3. Optional: node run-inspect-folders.js --with-hash (enable hash comparison)
 * 4. Optional: node run-inspect-folders.js --modified-time-threshold=2s (how much newer the source must be to count
 *    as changed, in milliseconds or with an "s"/"ms" suffix; overrides settings.modifiedTimeThresholdMs from the
 *    config; default 2s, for FAT32/exFAT disks that keep 2 second times)
 * 5. Optional: node run-inspect-folders.js --mapping=2 (or --mapping=1,3) inspects only those mappings, numbered from 1
 *    in the config order. Without it, every mapping except the ones with "enabled: false" is inspected.
 * 6. Optional: --triggered-by="schedule: general schedule" (written in the log header, used by the scheduler)
 *
 * Generated configs and logs are never overwritten: when two runs finish in the same second, the second one gets
 * a "-2" suffix (for example 2026-01-01-03-00-00-2-sync-config-files.js).
 *
 * CONFIGURATION (configurations/inspect.config.js):
 * module.exports = {
 *     settings: {modifiedTimeThresholdMs: 2000},
 *     mappings: [{from: '...', to: ['...'], enabled: true, ...filters}]
 * };
 *
 * OUTPUT:
 * - configurations/[TIMESTAMP]-sync.config.js: Config with folders needing sync ({settings, mappings})
 * - configurations/[TIMESTAMP]-sync-config-files.js: Config with individual files to sync
 *   ({settings, files: {source: [destinations]}}), plus remove: {destination: source} for the mappings with
 *   "allowRemove: true" whose destinations have copies of deleted source files
 * - logs/inspect-folders-[timestamp].log: Detailed log of all detected changes
 * The generated configs keep the modified time threshold used here, so the sync compares files the same way.
 *
 * STOPPING:
 * - Ctrl+C, closing the console window, or the "stop" IPC message when started with child_process.fork()
 *   (used by the web tool).
 * - All of them save the log and the configs collected so far before exiting.
 */

const { RunInspectFolders } = require('./lib/inspect/run-inspect-folders');

let inspector = new RunInspectFolders({args: process.argv.slice(2), rootPath: process.cwd()});
inspector.run().catch((e) => {
    console.error('Fatal: '+e.message);
    process.exit(1);
});
