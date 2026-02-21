import { config } from "../config";

export async function startLiveMonitor(
  streamUrl: string,
  condition: string,
  webhookUrl: string,
  intervalSeconds = 10
): Promise<string> {
  const response = await fetch(`${config.machineFiBaseUrl}/live-monitor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.machineFiApiKey}`,
    },
    body: JSON.stringify({
      stream_url: streamUrl,
      condition,
      webhook_url: webhookUrl,
      interval_seconds: intervalSeconds,
      input_mode: "clip",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MachineFi startLiveMonitor failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { job_id?: string; id?: string };
  const jobId = data.job_id ?? data.id;
  if (!jobId) {
    throw new Error(`MachineFi returned no job_id: ${JSON.stringify(data)}`);
  }
  return jobId;
}

export async function stopJob(jobId: string): Promise<void> {
  const response = await fetch(`${config.machineFiBaseUrl}/jobs/${jobId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.machineFiApiKey}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`MachineFi stopJob failed (${response.status}): ${text}`);
  }
}
