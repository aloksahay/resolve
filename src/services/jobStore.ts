interface JobEntry {
  marketId: number;
  deadline: number;
}

const jobs = new Map<string, JobEntry>();

export function addJob(jobId: string, marketId: number, deadline: number): void {
  jobs.set(jobId, { marketId, deadline });
}

export function getMarketId(jobId: string): number | undefined {
  return jobs.get(jobId)?.marketId;
}

export function removeJob(jobId: string): void {
  jobs.delete(jobId);
}

export function getExpiredJobs(nowSeconds: number): Array<{ jobId: string; marketId: number }> {
  const expired: Array<{ jobId: string; marketId: number }> = [];
  for (const [jobId, entry] of jobs.entries()) {
    if (entry.deadline <= nowSeconds) {
      expired.push({ jobId, marketId: entry.marketId });
    }
  }
  return expired;
}

export function getAllJobs(): Map<string, JobEntry> {
  return jobs;
}
