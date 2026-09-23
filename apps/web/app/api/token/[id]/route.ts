/**
 * GET /api/token/[id]
 * ERC-721 metadata JSON for Chainfolio soulbound tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { METADATA_DISCLAIMER } from "@/lib/core/constants";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://chainfolio.vercel.app";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tokenId = parseInt(id, 10);

  if (isNaN(tokenId) || tokenId < 1) {
    return NextResponse.json({ error: "Invalid token ID" }, { status: 400 });
  }

  const metadata = {
    name: `Chainfolio #${tokenId}`,
    description:
      "An on-chain activity profile reflecting smart contract deployment history. " +
      "This is NOT a skill certification. " +
      METADATA_DISCLAIMER,
    image: `${APP_URL}/api/token/${tokenId}/image`,
    timestamp: Math.floor(Date.now() / 1000),
    attributes: [
      { trait_type: "Token ID", value: tokenId },
      { trait_type: "Profile Type", value: "On-Chain Activity" },
      { trait_type: "Transferable", value: "No (Soulbound)" },
      { trait_type: "Network", value: "Sepolia" },
    ],
    disclaimer: METADATA_DISCLAIMER,
    external_url: APP_URL,
  };

  return NextResponse.json(metadata, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
