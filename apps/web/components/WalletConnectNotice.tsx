import { NoticeBox } from "@/components/ui/NoticeBox";
import { isWalletConnectConfigured } from "@/lib/walletConnect";

export function WalletConnectNotice() {
  if (isWalletConnectConfigured()) return null;

  return (
    <NoticeBox variant="info">
      <span className="font-medium">WalletConnect unavailable</span> — no project ID
      configured. Use a browser extension wallet (MetaMask, Rabby) or add{" "}
      <code className="text-xs">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</code> to{" "}
      <code className="text-xs">.env.local</code> (free at{" "}
      <a
        href="https://cloud.walletconnect.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-surface-accent hover:underline"
      >
        cloud.walletconnect.com
      </a>
      ).
    </NoticeBox>
  );
}
