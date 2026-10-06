class PanelStatus
{

    constructor()
    {
        this.data = false;
    }

    isJobRunning()
    {
        return !!(this.data && this.data.job && this.data.job.running);
    }

    setJob(job)
    {
        if(this.data){
            this.data.job = job;
        }
    }

}
