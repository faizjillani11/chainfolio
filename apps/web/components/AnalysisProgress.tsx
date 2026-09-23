"use client";

import { AnalysisStage } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS: { id: AnalysisStage; label: string }[] = [
  { id: "queued", label: "Queued" },
  { id: "deployments", label: "Fetching deployments" },
  { id: "verification", label: "Checking verification" },
  { id: "ens", label: "Resolving ENS" },
  { id: "scoring", label: "Calculating score" },
  { id: "complete", label: "Complete" },
];

const STAGE_ORDER: AnalysisStage[] = STEPS.map((s) => s.id);

function stageIndex(stage: AnalysisStage | null): number {
  if (!stage) return -1;
  return STAGE_ORDER.indexOf(stage);
}

interface AnalysisProgressProps {
  stage: AnalysisStage | null;
  elapsedMs: number;
  includesENS?: boolean;
}

export function AnalysisProgress({
  stage,
  elapsedMs,
  includesENS = false,
}: AnalysisProgressProps) {
  const current = stageIndex(stage);
  const visibleSteps = includesENS
    ? STEPS
    : STEPS.filter((s) => s.id !== "ens");

  const progressPct =
    current < 0
      ? 5
      : Math.min(100, Math.round(((current + 1) / visibleSteps.length) * 100));

  const elapsedSec = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="surface-panel border border-surface-border rounded-2xl p-6 space-y-5 animate-fade-in-up">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-surface-foreground">
          Analysis in progress
        </p>
        <span className="text-xs text-surface-muted tabular-nums">{elapsedSec}s</span>
      </div>

      <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
        <div
          className="h-full bg-surface-accent transition-all duration-500 ease-productive rounded-full"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol className="space-y-2">
        {visibleSteps.map((step) => {
          const idx = stageIndex(step.id);
          const done = current > idx;
          const active = current === idx;

          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-3 text-sm transition-colors",
                done && "text-surface-muted",
                active && "text-surface-foreground font-medium",
                !done && !active && "text-surface-muted/50"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 border",
                  done && "bg-green-500/15 border-green-500/30 text-green-400",
                  active && "bg-surface-accent/20 border-surface-accent/40 text-surface-accent animate-pulse",
                  !done && !active && "border-surface-border text-surface-muted/40"
                )}
              >
                {done ? "✓" : active ? "…" : ""}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
