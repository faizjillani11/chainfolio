"use client";

import { useState } from "react";
import { WorkerStatus } from "@/components/WorkerStatus";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { AnalysisDashboard } from "@/components/AnalysisDashboard";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { HardwareWalletNotice } from "@/components/HardwareWalletNotice";
import { WalletConnectNotice } from "@/components/WalletConnectNotice";
import { NoticeBox } from "@/components/ui/NoticeBox";
import { Spinner } from "@/components/ui/Spinner";
import { useAppReady } from "@/hooks/useAppReady";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import { AnalysisState } from "@/lib/types";
import { layout, panel, text, button, chip } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { ready } = useAppReady(1500);
  const { stage, elapsedMs, runAnalysis } = useAnalysisJob();
  const [network, setNetwork] = useState<"mainnet" | "sepolia">("mainnet");
  const [includeENS, setIncludeENS] = useState(false);
  const [state, setState] = useState<AnalysisState>({
    status: "idle",
    data: null,
    error: null,
    jobId: null,
    stage: null,
  });

  if (!ready) return <AppLoadingScreen />;

  async function analyzeWallet() {
    if (!address) return;
    setState({
      status: "loading",
      data: null,
      error: null,
      jobId: null,
      stage: "queued",
    });

    const result = await runAnalysis({ address, network, includeENS });

    if (result.status === "error") {
      setState({
        status: "error",
        data: null,
        error: result.error,
        jobId: null,
        stage: null,
      });
      return;
    }

    setState({
      status: result.status,
      data: result.data,
      error: null,
      jobId: null,
      stage: "complete",
    });
  }

  const isLoading = state.status === "loading";
  const hasResults = state.status === "success" || state.status === "partial";

  return (
    <div className={layout.page}>
      <header className={layout.header}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🏅</span>
              <span className={cn(text.heading, "text-sm sm:text-base")}>
                Chainfolio
              </span>
            </div>
            <p className="text-xs text-surface-muted hidden sm:block">
              On-chain developer activity profile
            </p>
          </div>
          <div className="flex items-center gap-4">
            <WorkerStatus />
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className={layout.main}>
        {!hasResults && (
          <div className="text-center mb-10">
            <div className={cn(chip.accent, "mb-5")}>
              <span className="w-1.5 h-1.5 rounded-full bg-surface-accent animate-pulse" />
              Transparent · Privacy-first · No data stored
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-surface-foreground mb-3 tracking-tight">
              On-Chain Activity Profile
            </h1>
            <p className={cn(text.body, "text-base sm:text-lg max-w-lg mx-auto leading-relaxed")}>
              Analyze your smart contract deployments and generate a transparent,
              explainable activity profile.
            </p>
            <p className="text-surface-muted/70 text-sm mt-2">
              Not a skill test — just your verifiable on-chain history.
            </p>
          </div>
        )}

        {!isConnected ? (
          <ConnectPrompt />
        ) : (
          <div className="space-y-6">
            <div className={cn(panel.base, "p-6 space-y-5")}>
              <div className="flex flex-col sm:flex-row gap-5">
                <div className="flex-1">
                  <FieldLabel>Network</FieldLabel>
                  <div className="flex gap-2">
                    {(["mainnet", "sepolia"] as const).map((net) => (
                      <button
                        key={net}
                        onClick={() => setNetwork(net)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                          network === net ? button.segmentActive : button.segmentIdle
                        )}
                      >
                        {net === "mainnet" ? "Ethereum" : "Sepolia"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <FieldLabel>Wallet</FieldLabel>
                  <p className={cn(text.mono, panel.raised, "px-3 py-2 truncate")}>
                    {address}
                  </p>
                </div>
              </div>

              <div className={cn(panel.raised, "p-4")}>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={includeENS}
                      onChange={(e) => setIncludeENS(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                        includeENS
                          ? "bg-surface-accent border-surface-accent"
                          : "border-surface-muted/40 group-hover:border-surface-muted"
                      )}
                    >
                      {includeENS && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                          <path
                            d="M1 4l3 3 5-6"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-foreground">
                      Include ENS data in analysis
                    </p>
                    <p className="text-xs text-surface-muted mt-0.5 leading-relaxed">
                      Resolves your ENS name and fetches public records (avatar, website,
                      GitHub). Optional — leave unchecked to skip.
                    </p>
                  </div>
                </label>
              </div>

              <p className="text-xs text-surface-muted/70 flex items-center gap-1.5">
                <span>🔒</span>
                We analyze your public on-chain activity. The UI does not store results; the worker may cache them if MongoDB is running.
              </p>

              <button
                onClick={analyzeWallet}
                disabled={isLoading}
                className={cn(
                  button.primary,
                  "w-full py-3 px-4 text-sm flex items-center justify-center gap-2"
                )}
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <span>🔍</span>
                    Analyze My Wallet
                  </>
                )}
              </button>
            </div>

            {isLoading && (
              <AnalysisProgress
                stage={stage}
                elapsedMs={elapsedMs}
                includesENS={includeENS}
              />
            )}

            {state.status === "error" && (
              <div className="animate-fade-in-up">
                <NoticeBox variant="error">
                  <div className="space-y-2">
                    <p className="font-medium">Unable to fetch full data</p>
                    <p className="text-surface-muted">{state.error}</p>
                    <button
                      onClick={analyzeWallet}
                      className="mt-1 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium rounded-lg transition-colors border border-red-500/20"
                    >
                      Try Again
                    </button>
                  </div>
                </NoticeBox>
              </div>
            )}

            {hasResults && state.data && (
              <AnalysisDashboard
                analysis={state.data}
                network={network}
                isPartial={state.status === "partial"}
              />
            )}
          </div>
        )}
      </main>

      <footer className={layout.footer}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-surface-muted/60">
          <p>Chainfolio · Powered by Alchemy & Etherscan</p>
          <p>Activity-based only · Does not measure developer skill</p>
        </div>
      </footer>
    </div>
  );
}

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
      <div className="w-16 h-16 rounded-2xl bg-surface-accent/10 border border-surface-accent/20 flex items-center justify-center text-3xl mb-5">
        🔗
      </div>
      <h2 className={cn(text.heading, "text-lg mb-2")}>Connect your wallet</h2>
      <p className={cn(text.body, "text-sm max-w-xs mb-6 leading-relaxed")}>
        Connect with MetaMask or WalletConnect to analyze your on-chain developer activity.
      </p>

      <div className="w-full max-w-md mb-4 text-left">
        <WalletConnectNotice />
      </div>

      <div className="w-full max-w-md mb-6">
        <HardwareWalletNotice />
      </div>

      <ConnectButton label="Connect Wallet" />

      <p className="text-xs text-surface-muted/50 mt-4">
        Read-only analysis · No transactions required to analyze
      </p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className={cn(text.label, "block mb-2")}>{children}</label>;
}
