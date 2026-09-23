/**
 * GET /api/profile/[address] — public profile snapshot (proxies worker API).
 * Query: ?network=mainnet|sepolia
 */

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors/errorHandler";
import { AppError } from "@/lib/errors/AppError";

export const runtime = "nodejs";

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8000";
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!ETH_ADDRESS_RE.test(address)) {
      throw AppError.invalidAddress("Invalid Ethereum address");
    }

    const network = req.nextUrl.searchParams.get("network");
    const url = new URL(`${WORKER_URL}/profile/${address}`);
    if (network) url.searchParams.set("network", network);

    let res: Response;
    try {
      res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    } catch {
      throw AppError.workerUnavailable();
    }

    const body = await res.json();

    if (res.status === 404) {
      return NextResponse.json(body, { status: 404 });
    }

    if (!res.ok) {
      throw AppError.internal(
        typeof body.error === "string" ? body.error : "Failed to fetch profile"
      );
    }

    return NextResponse.json(body);
  } catch (err) {
    return handleApiError(err);
  }
}
