import type { ReprocessJob } from "../types/signing-request";

const KEY = "reprocess_jobs";

export function getJobs(): ReprocessJob[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveJob(job: ReprocessJob): void {
  const jobs = getJobs();
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) jobs[idx] = job;
  else jobs.push(job);
  localStorage.setItem(KEY, JSON.stringify(jobs));
}

export function getJob(id: string): ReprocessJob | null {
  return getJobs().find((j) => j.id === id) ?? null;
}
