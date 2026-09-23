/**
 * Whether a real WalletConnect / Reown project ID is configured.
 * Without it, wagmi.ts falls back to "demo" and WC-based wallets fail.
 */
export function isWalletConnectConfigured(): boolean {
  const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (!id) return false;
  if (id === "demo") return false;
  if (id.includes("your_") || id.includes("_here")) return false;
  return true;
}
