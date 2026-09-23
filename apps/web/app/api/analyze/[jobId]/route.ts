/**
 * GET /api/analyze/[jobId] — poll analysis job status.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAnalysisJob } from "@/lib/api/analyzeController";
import { handleApiError } from "@/lib/errors/errorHandler";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await getAnalysisJob(jobId);

    if (job.status === "SUCCESS" && job.data) {
      return NextResponse.json(job, { status: job.partial ? 206 : 200 });
    }

    if (job.status === "FAILURE") {
      return NextResponse.json(job, { status: 500 });
    }

    return NextResponse.json(job, { status: 202 });
  } catch (err) {
    return handleApiError(err);
  }
}
