"use client";

import { AnalysisResponse } from "@/lib/types";
import { ScoreCard } from "./ScoreCard";
import { ContractList } from "./ContractList";
import { ENSCard } from "./ENSCard";
import { DataSourceBadge } from "./DataSourceBadge";
import { NoticeBox } from "@/components/ui/NoticeBox";

interface AnalysisDashboardProps {
  analysis: AnalysisResponse;
  network: "mainnet" | "sepolia";
  isPartial?: boolean;
}

export function AnalysisDashboard({
  analysis,
  network,
  isPartial = false,
}: AnalysisDashboardProps) {
  const analyzedDate = new Date(analysis.analyzedAt * 1000).toLocaleString();
  const { profile } = analysis;
  const disclaimer = profile.warnings[profile.warnings.length - 1];

  return (
    <div className="space-y-4">
      <NoticeBox variant="warning">{disclaimer}</NoticeBox>

      {isPartial && (
        <NoticeBox variant="info">
          Some data sources were unavailable. Results may be incomplete — try again later.
        </NoticeBox>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-surface-muted">Analyzed {analyzedDate}</p>
        <DataSourceBadge source={analysis.deploymentSource} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ENSCard ens={analysis.ens} address={analysis.address} included={analysis.includesENS} />
        <ScoreCard profile={profile} />
      </div>

      <ContractList contracts={analysis.contracts} network={network} />
    </div>
  );
}
