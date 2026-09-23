/**
 * Design tokens — semantic Tailwind class bundles.
 * Source of truth for colors: app/globals.css CSS variables.
 */

export const layout = {
  page: "min-h-screen bg-surface-background flex flex-col",
  header:
    "sticky top-0 z-30 border-b border-surface-border/80 bg-surface-background/90 backdrop-blur-md",
  main: "flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10",
  footer: "border-t border-surface-border/60 py-6 mt-10",
} as const;

export const panel = {
  base: "bg-surface-surface border border-surface-border rounded-2xl",
  raised: "bg-surface-raised/40 border border-surface-border rounded-xl",
  interactive:
    "bg-surface-surface border border-surface-border rounded-2xl hover:border-surface-muted/30 transition-colors",
} as const;

export const text = {
  heading: "text-surface-foreground font-semibold",
  body: "text-surface-muted",
  label:
    "text-xs font-semibold text-surface-muted uppercase tracking-widest",
  mono: "text-sm font-mono text-surface-foreground/90",
} as const;

export const button = {
  primary:
    "bg-surface-accent hover:bg-surface-accent-hover disabled:bg-surface-raised disabled:text-surface-muted disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-900/20",
  secondary:
    "bg-surface-raised text-surface-muted hover:text-surface-foreground hover:bg-surface-border rounded-lg text-sm font-medium transition-all",
  segmentActive:
    "bg-surface-accent text-white shadow-lg shadow-indigo-900/30",
  segmentIdle:
    "bg-surface-raised text-surface-muted hover:bg-surface-border hover:text-surface-foreground",
} as const;

export const chip = {
  accent:
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-accent/10 border border-surface-accent/20 text-surface-accent text-xs font-medium",
} as const;
