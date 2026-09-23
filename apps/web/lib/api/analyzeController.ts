/**
 * Analysis controller — validates requests and delegates to the worker API.
 */

import { validateAnalysisRequest } from "@/lib/core/validation";
import { enqueueWorkerJob, pollWorkerJob } from "@/lib/api/analyzeWorkerClient";
import { AppError } from "@/lib/errors/AppError";
import { AnalysisResponse } from "@/lib/types";

function parseRequest(body: unknown) {
  try {
    return validateAnalysisRequest(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid request";
    if (msg.startsWith("INVALID_ADDRESS")) throw AppError.invalidAddress(msg);
    throw AppError.invalidRequest(msg);
  }
}

export async function startAnalysis(body: unknown): Promise<{ jobId: string }> {
  const request = parseRequest(body);
  const jobId = await enqueueWorkerJob(request);
  return { jobId };
}

export async function getAnalysisJob(jobId: string): Promise<{
  jobId: string;
  status: "PENDING" | "SUCCESS" | "FAILURE";
  stage?: string | null;
  data?: AnalysisResponse;
  partial?: boolean;
  error?: string;
}> {
  const poll = await pollWorkerJob(jobId);

  if (poll.status === "SUCCESS" && poll.result) {
    return {
      jobId,
      status: "SUCCESS",
      stage: poll.stage ?? "complete",
      data: poll.result,
      partial: poll.result.isPartial === true,
    };
  }

  if (poll.status === "FAILURE") {
    return {
      jobId,
      status: "FAILURE",
      stage: poll.stage,
      error: poll.error ?? "Worker job failed",
    };
  }

  return {
    jobId,
    status: "PENDING",
    stage: poll.stage ?? "queued",
  };
}
