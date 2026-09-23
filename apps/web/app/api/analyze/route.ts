/**
 * POST /api/analyze — enqueue an analysis job (returns immediately).
 */

import { NextRequest, NextResponse } from "next/server";
import { startAnalysis } from "@/lib/api/analyzeController";
import { handleApiError } from "@/lib/errors/errorHandler";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId } = await startAnalysis(body);
    return NextResponse.json({ jobId, status: "PENDING" }, { status: 202 });
  } catch (err) {
    return handleApiError(err);
  }
}
