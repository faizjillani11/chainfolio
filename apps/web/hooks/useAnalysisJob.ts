"use client";

import { useCallback, useRef, useState } from "react";
import { AnalysisResponse, AnalysisStage } from "@/lib/types";

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 60_000;

interface JobPollPayload {
  jobId: string;
  status: "PENDING" | "SUCCESS" | "FAILURE";
  stage?: string | null;
  data?: AnalysisResponse;
  partial?: boolean;
  error?: string;
}

export interface UseAnalysisJobResult {
  stage: AnalysisStage | null;
  elapsedMs: number;
  runAnalysis: (params: {
    address: string;
    network: "mainnet" | "sepolia";
    includeENS: boolean;
  }) => Promise<{
    status: "success" | "partial" | "error";
    data: AnalysisResponse | null;
    error: string | null;
  }>;
  cancel: () => void;
}

export function useAnalysisJob(): UseAnalysisJobResult {
  const [stage, setStage] = useState<AnalysisStage | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runAnalysis = useCallback(
    async (params: {
      address: string;
      network: "mainnet" | "sepolia";
      includeENS: boolean;
    }) => {
      cancel();
      const abort = new AbortController();
      abortRef.current = abort;

      setStage("queued");
      setElapsedMs(0);
      startedAtRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);

      try {
        const enqueueRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: abort.signal,
        });

        const enqueueBody = await enqueueRes.json();
        if (!enqueueRes.ok) {
          throw new Error(enqueueBody.error || "Failed to start analysis");
        }

        const jobId = enqueueBody.jobId as string;
        const deadline = Date.now() + POLL_TIMEOUT_MS;

        while (Date.now() < deadline) {
          if (abort.signal.aborted) {
            return { status: "error" as const, data: null, error: "Cancelled" };
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

          const pollRes = await fetch(`/api/analyze/${jobId}`, {
            signal: abort.signal,
          });
          const poll = (await pollRes.json()) as JobPollPayload;

          if (poll.stage) {
            setStage(poll.stage as AnalysisStage);
          }

          if (poll.status === "SUCCESS" && poll.data) {
            setStage("complete");
            return {
              status: poll.partial ? ("partial" as const) : ("success" as const),
              data: poll.data,
              error: null,
            };
          }

          if (poll.status === "FAILURE") {
            throw new Error(poll.error || "Analysis failed");
          }
        }

        throw new Error("Analysis timed out — worker may still be processing");
      } catch (err) {
        if (abort.signal.aborted) {
          return { status: "error" as const, data: null, error: "Cancelled" };
        }
        return {
          status: "error" as const,
          data: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      } finally {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    },
    [cancel]
  );

  return { stage, elapsedMs, runAnalysis, cancel };
}
