/**
 * Sync Results
 *
 * What a sync run did, for the log: the files already in sync, copied and removed, and the errors. No dependencies.
 */

class SyncResults
{

    constructor()
    {
        this.errors = [];
        this.hashErrors = [];
        this.alreadySyncedFiles = [];
        this.syncedFiles = [];
        this.removedFiles = [];
    }

}

module.exports.SyncResults = SyncResults;
