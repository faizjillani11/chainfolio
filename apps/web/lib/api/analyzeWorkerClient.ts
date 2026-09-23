/**
 * HTTP client for the worker analysis API.
 */

import { AnalysisResponse } from "@/lib/types";
import { AppError } from "@/lib/errors/AppError";
import { ValidatedAnalysisRequest } from "@/lib/core/validation";
import { logger } from "@/lib/logger";

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8000";

export type AnalysisStage =
  | "queued"
  | "deployments"
  | "verification"
  | "ens"
  | "scoring"
  | "complete";

export interface JobEnqueueResponse {
  job_id: string;
  status: "PENDING";
}

export interface JobPollResponse {
  job_id: string;
  status: "PENDING" | "SUCCESS" | "FAILURE";
  stage?: AnalysisStage | null;
  result?: AnalysisResponse;
  error?: string;
}

export async function enqueueWorkerJob(
  request: ValidatedAnalysisRequest
): Promise<string> {
  const { address, network, includeENS } = request;

  let enqueueRes: Response;
  try {
    enqueueRes = await fetch(`${WORKER_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        network,
        include_ens: includeENS,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.error("[worker-client] Cannot reach worker API", err);
    throw AppError.workerUnavailable();
  }

  if (!enqueueRes.ok) {
    const body = await enqueueRes.json().catch(() => ({}));
    logger.error("[worker-client] Enqueue failed", body);
    throw AppError.workerUnavailable(
      typeof body.error === "string" ? body.error : undefined
    );
  }

  const { job_id: jobId } = (await enqueueRes.json()) as JobEnqueueResponse;
  logger.info("[worker-client] Job enqueued", { jobId, address, network });
  return jobId;
}

export async function pollWorkerJob(jobId: string): Promise<JobPollResponse> {
  let pollRes: Response;
  try {
    pollRes = await fetch(`${WORKER_URL}/result/${jobId}`, {
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    logger.error("[worker-client] Poll failed", err);
    throw AppError.workerUnavailable();
  }

  if (!pollRes.ok) {
    throw AppError.workerUnavailable();
  }

  return (await pollRes.json()) as JobPollResponse;
}
