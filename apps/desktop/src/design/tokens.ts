/**
 * DownloadMgr Design Tokens — TypeScript mirror
 *
 * Each value is a CSS var() reference. Use these for inline styles or
 * style-object APIs. For className-based styles, reference the CSS directly.
 *
 * Token shape: tokens.color.bg.app → "var(--dm-color-bg-app)"
 */
export const tokens = {
  color: {
    bg: {
      app:      "var(--dm-color-bg-app)",
      elevated: "var(--dm-color-bg-elevated)",
      recessed: "var(--dm-color-bg-recessed)",
      hover:    "var(--dm-color-bg-hover)",
      selected: "var(--dm-color-bg-selected)",
    },
    fg: {
      primary:   "var(--dm-color-fg-primary)",
      secondary: "var(--dm-color-fg-secondary)",
      tertiary:  "var(--dm-color-fg-tertiary)",
      disabled:  "var(--dm-color-fg-disabled)",
    },
    border: {
      subtle:  "var(--dm-color-border-subtle)",
      default: "var(--dm-color-border-default)",
      strong:  "var(--dm-color-border-strong)",
      focus:   "var(--dm-color-border-focus)",
    },
    accent: {
      primary:      "var(--dm-color-accent-primary)",
      primaryHover: "var(--dm-color-accent-primary-hover)",
      subtle:       "var(--dm-color-accent-subtle)",
    },
    status: {
      success: {
        surface: "var(--dm-color-status-success-surface)",
        text:    "var(--dm-color-status-success-text)",
      },
      warning: {
        surface: "var(--dm-color-status-warning-surface)",
        text:    "var(--dm-color-status-warning-text)",
      },
      danger: {
        surface: "var(--dm-color-status-danger-surface)",
        text:    "var(--dm-color-status-danger-text)",
      },
      info: {
        surface: "var(--dm-color-status-info-surface)",
        text:    "var(--dm-color-status-info-text)",
      },
    },
  },

  space: {
    1:  "var(--dm-space-1)",
    2:  "var(--dm-space-2)",
    3:  "var(--dm-space-3)",
    4:  "var(--dm-space-4)",
    5:  "var(--dm-space-5)",
    6:  "var(--dm-space-6)",
    7:  "var(--dm-space-7)",
    8:  "var(--dm-space-8)",
    9:  "var(--dm-space-9)",
    10: "var(--dm-space-10)",
  },

  text: {
    xs:   "var(--dm-text-xs)",
    sm:   "var(--dm-text-sm)",
    md:   "var(--dm-text-md)",
    lg:   "var(--dm-text-lg)",
    xl:   "var(--dm-text-xl)",
    "2xl": "var(--dm-text-2xl)",
  },

  weight: {
    regular:  "var(--dm-weight-regular)",
    medium:   "var(--dm-weight-medium)",
    semibold: "var(--dm-weight-semibold)",
  },

  leading: {
    tight:  "var(--dm-leading-tight)",
    normal: "var(--dm-leading-normal)",
  },

  font: {
    sans: "var(--dm-font-family)",
    mono: "var(--dm-font-mono)",
  },

  tracking: {
    tight:   "var(--dm-tracking-tight)",
    normal:  "var(--dm-tracking-normal)",
    wide:    "var(--dm-tracking-wide)",
    widest:  "var(--dm-tracking-widest)",
  },

  radius: {
    sm:   "var(--dm-radius-sm)",
    md:   "var(--dm-radius-md)",
    lg:   "var(--dm-radius-lg)",
    full: "var(--dm-radius-full)",
  },

  motion: {
    fast:      "var(--dm-duration-fast)",
    normal:    "var(--dm-duration-normal)",
    slow:      "var(--dm-duration-slow)",
    easing:    "var(--dm-easing-standard)",
    easingIn:  "var(--dm-easing-in)",
    easingOut: "var(--dm-easing-out)",
  },
} as const;

/** Convenience type for any token leaf value */
export type TokenValue = string;
