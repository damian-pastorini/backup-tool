/**
 * Example settings and mappings config.
 *
 * Copy this file to configurations/inspect.config.js and replace the example paths with your own folders, or add the
 * mappings from the web panel. The configurations folder is ignored by the app repository, so your local paths are
 * never committed with the app.
 *
 * settings.modifiedTimeThresholdMs: a same-size file only counts as changed when its source is newer by more than this
 * (2000 suits FAT32/exFAT disks, 0 means an exact match). The --modified-time-threshold flag overrides it.
 * settings.schedule: the general schedule (a cron expression), used by the scheduled mappings without a cron of their own.
 * settings.logs: removes logs older than keepDays; set removeOldLogs to false to keep every log.
 * enabled: false keeps a mapping in the file but skips it in full inspections, syncs and schedules.
 * schedule: when enabled, the scheduler inspects the mapping and syncs it when something changed, with its own cron or,
 * if it's empty, the general one.
 */

module.exports = {
    settings: {
        modifiedTimeThresholdMs: 2000,
        schedule: {
            enabled: true,
            cron: '0 3 * * *'
        },
        logs: {
            removeOldLogs: true,
            keepDays: 30
        }
    },
    mappings: [
        {
            from: 'C:\\source\\documents',
            to: ['X:\\backup-1\\documents', 'Y:\\backup-2\\documents'],
            enabled: true,
            schedule: {
                enabled: true,
                cron: ''
            },
            includeExtensions: [],
            excludeExtensions: ['.tmp', '.log'],
            maxSizeBytes: 0,
            excludeHidden: true,
            excludeSystem: true,
            excludeNames: []
        },
        {
            from: 'C:\\source\\photos',
            to: ['Y:\\backup-2\\photos'],
            enabled: true,
            schedule: {
                enabled: true,
                cron: '0 */6 * * *'
            },
            includeExtensions: [],
            excludeExtensions: ['.tmp', '.log'],
            maxSizeBytes: 0,
            excludeHidden: true,
            excludeSystem: true,
            excludeNames: []
        }
    ]
};
