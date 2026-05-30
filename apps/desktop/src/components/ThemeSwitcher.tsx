import { Sun, Monitor, Moon } from "lucide-react";

type Theme = "light" | "dark" | "system";

interface ThemeSwitcherProps {
  theme: Theme;
  onChange: (t: Theme) => void;
}

const OPTIONS: { value: Theme; icon: React.ReactNode; label: string }[] = [
  { value: "light", icon: <Sun size={13} strokeWidth={2} />, label: "Light" },
  { value: "system", icon: <Monitor size={13} strokeWidth={2} />, label: "System" },
  { value: "dark", icon: <Moon size={13} strokeWidth={2} />, label: "Dark" },
];

export function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Theme switcher"
      style={{
        display: "flex",
        alignItems: "center",
        background: "var(--dm-color-bg-recessed)",
        border: "1px solid var(--dm-color-border-subtle)",
        borderRadius: "var(--dm-radius-full)",
        padding: "2px",
        gap: "1px",
      }}
    >
      {OPTIONS.map(({ value, icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            title={label}
            aria-pressed={active}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "24px",
              borderRadius: "var(--dm-radius-full)",
              border: "none",
              cursor: "pointer",
              transition: "all 120ms ease",
              background: active ? "var(--dm-color-bg-elevated)" : "transparent",
              color: active
                ? "var(--dm-color-fg-primary)"
                : "var(--dm-color-fg-tertiary)",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,.2)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.color = "var(--dm-color-fg-secondary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.color = "var(--dm-color-fg-tertiary)";
              }
            }}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
