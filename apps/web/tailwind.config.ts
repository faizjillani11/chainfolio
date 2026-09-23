import type { Config } from "tailwindcss";
import { createRequire } from "module";
import defaultTheme from "tailwindcss/defaultTheme";
import plugin from "tailwindcss/plugin";

const require = createRequire(import.meta.url);

type SourceBucket = "app" | "components" | "hooks" | "lib";

const SOURCE_EXTENSIONS = ["js", "ts", "jsx", "tsx", "mdx"] as const;
const SOURCE_BUCKETS: readonly SourceBucket[] = ["app", "components", "hooks", "lib"];

const joinExtensions = (extensions: readonly string[]) => extensions.join(",");

const makeGlob = (bucket: SourceBucket) =>
  `./${bucket}/**/*.{${joinExtensions(SOURCE_EXTENSIONS)}}`;

const contentGlobs = SOURCE_BUCKETS.map((bucket) => makeGlob(bucket));

const surfacePalette = {
  background: "var(--background)",
  surface: "var(--surface)",
  raised: "var(--surface-raised)",
  border: "var(--border)",
  subtle: "var(--border-subtle)",
  foreground: "var(--foreground)",
  muted: "var(--muted)",
  accent: "var(--accent)",
  "accent-hover": "var(--accent-hover)",
} as const;

const semanticBoxShadow = {
  panel: "0 8px 30px rgba(2, 6, 23, 0.28)",
  focus: "0 0 0 1px rgba(99, 102, 241, 0.45), 0 0 0 4px rgba(99, 102, 241, 0.12)",
} as const;

const semanticKeyframes = {
  fadeInUp: {
    from: { opacity: "0", transform: "translateY(12px)" },
    to: { opacity: "1", transform: "translateY(0)" },
  },
  growWidth: {
    from: { width: "0%" },
    to: { width: "var(--target-width)" },
  },
  shimmer: {
    "0%": { backgroundPosition: "-200% 0" },
    "100%": { backgroundPosition: "200% 0" },
  },
} as const;

const semanticAnimation = {
  "fade-in-up": "fadeInUp 0.35s ease both",
  "progress-grow": "growWidth 0.8s cubic-bezier(0.4, 0, 0.2, 1) both",
  shimmer: "shimmer 1.5s infinite",
} as const;

const stateUtilities = plugin(({ addUtilities }) => {
  addUtilities({
    ".text-balance-pretty": { textWrap: "pretty" },
    ".surface-panel": {
      backgroundColor: surfacePalette.surface,
      borderColor: surfacePalette.border,
      boxShadow: semanticBoxShadow.panel,
    },
  });
});

const config = {
  content: contentGlobs,
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        surface: surfacePalette,
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
      },
      boxShadow: semanticBoxShadow,
      keyframes: semanticKeyframes,
      animation: semanticAnimation,
      transitionTimingFunction: {
        productive: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [
    stateUtilities,
    require('animatecss-tailwind-bridge')({
      animations: [
        'fadeIn', 'fadeOut',
        'fadeInUp', 'fadeInDown',
        'fadeOutUp', 'fadeOutDown',
        'slideInUp', 'slideInDown',
        'slideOutUp', 'slideOutDown',
        'pulse', 'shakeX', 'shakeY', 'headShake',
        'zoomIn', 'zoomOut',
        'rotateIn', 'rotateOut',
        'flipInX', 'flipInY',
      ],
      duration: '500ms',
      delay: '1s',
      iterationCount: '6',
    })
  ],
} satisfies Config;

export default config;
