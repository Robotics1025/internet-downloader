import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  FolderDown,
  Video,
  Palette,
  AlertTriangle,
  Loader2,
  Minus,
  Plus,
} from "lucide-react";

import { open } from "@tauri-apps/plugin-dialog";

import { useSettings, type Settings, type Quality } from "../hooks/useSettings";
import { useTheme } from "../hooks/useTheme";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { EmptyState } from "../components/EmptyState";

// ── Shimmer skeleton for loading state ──────────────────────────────────────

const SKELETON_STYLE_ID = "dm-settings-skeleton-style";

function ensureSkeletonStyles() {
  if (typeof document !== "undefined" && !document.getElementById(SKELETON_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SKELETON_STYLE_ID;
    style.textContent = `
      @keyframes dm-settings-shimmer {
        0%   { background-position: -600px 0; }
        100% { background-position:  600px 0; }
      }
      .dm-settings-skeleton {
        background-color: var(--dm-color-bg-elevated);
        background-image: linear-gradient(
          105deg,
          transparent 25%,
          rgba(255,255,255,0.03) 50%,
          transparent 75%
        );
        background-size: 1200px 100%;
        background-repeat: no-repeat;
        animation: dm-settings-shimmer 2s linear infinite;
        border-radius: var(--dm-radius-lg);
        border: 1px solid var(--dm-color-border-subtle);
      }
    `;
    document.head.appendChild(style);
  }
}

function SkeletonCard({ height = 120 }: { height?: number }) {
  ensureSkeletonStyles();
  return (
    <div
      className="dm-settings-skeleton"
      style={{ width: "100%", height, flexShrink: 0 }}
    />
  );
}

// ── Section card wrapper ─────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--dm-color-bg-elevated)",
        border: "1px solid var(--dm-color-border-subtle)",
        borderRadius: "var(--dm-radius-lg)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "0",
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <span style={{ color: "var(--dm-color-fg-secondary)", display: "flex", alignItems: "center" }}>
          {icon}
        </span>
        <span
          style={{
            fontSize: "var(--dm-text-md)",
            fontWeight: "var(--dm-weight-semibold)",
            color: "var(--dm-color-fg-primary)",
            lineHeight: "var(--dm-leading-tight)",
          }}
        >
          {title}
        </span>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
        {children}
      </div>
    </div>
  );
}

// ── Setting row ──────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
  isLast = false,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        paddingTop: "12px",
        paddingBottom: isLast ? "0" : "12px",
        borderBottom: isLast
          ? "none"
          : "1px solid var(--dm-color-border-subtle)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: "var(--dm-text-sm)",
            fontWeight: "var(--dm-weight-medium)",
            color: "var(--dm-color-fg-secondary)",
            lineHeight: "var(--dm-leading-tight)",
          }}
        >
          {label}
        </span>
        {description && (
          <span
            style={{
              fontSize: "var(--dm-text-xs)",
              color: "var(--dm-color-fg-tertiary)",
              lineHeight: "1.4",
            }}
          >
            {description}
          </span>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: "36px",
        height: "20px",
        borderRadius: "var(--dm-radius-full)",
        border: "none",
        padding: "2px",
        cursor: "pointer",
        background: value ? "var(--dm-color-accent-primary)" : "var(--dm-color-bg-recessed)",
        transition: `background var(--dm-duration-fast) var(--dm-easing-standard)`,
        display: "flex",
        alignItems: "center",
        justifyContent: value ? "flex-end" : "flex-start",
        boxSizing: "border-box",
        outline: "none",
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = "0 0 0 2px var(--dm-color-border-focus)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: value ? "#ffffff" : "var(--dm-color-bg-app)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          display: "block",
          transition: `background var(--dm-duration-fast) var(--dm-easing-standard)`,
          flexShrink: 0,
        }}
      />
    </button>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [minHover, setMinHover] = useState(false);
  const [plusHover, setPlusHover] = useState(false);

  const stepperBtnStyle = (isHovered: boolean, disabled: boolean): React.CSSProperties => ({
    width: "32px",
    height: "32px",
    borderRadius: "var(--dm-radius-md)",
    border: "1px solid var(--dm-color-border-subtle)",
    background: isHovered && !disabled ? "var(--dm-color-bg-hover)" : "var(--dm-color-bg-recessed)",
    color: disabled ? "var(--dm-color-fg-disabled)" : "var(--dm-color-fg-secondary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "not-allowed" : "pointer",
    outline: "none",
    transition: `background var(--dm-duration-fast) var(--dm-easing-standard), color var(--dm-duration-fast) var(--dm-easing-standard)`,
    flexShrink: 0,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <button
        onClick={() => value > min && onChange(value - 1)}
        disabled={value <= min}
        style={stepperBtnStyle(minHover, value <= min)}
        onMouseEnter={() => setMinHover(true)}
        onMouseLeave={() => setMinHover(false)}
      >
        <Minus size={14} strokeWidth={2} />
      </button>
      <span
        style={{
          width: "32px",
          textAlign: "center",
          fontSize: "var(--dm-text-md)",
          fontWeight: "var(--dm-weight-medium)",
          color: "var(--dm-color-fg-primary)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: "var(--dm-leading-tight)",
        }}
      >
        {value}
      </span>
      <button
        onClick={() => value < max && onChange(value + 1)}
        disabled={value >= max}
        style={stepperBtnStyle(plusHover, value >= max)}
        onMouseEnter={() => setPlusHover(true)}
        onMouseLeave={() => setPlusHover(false)}
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

// ── Quality segmented control ─────────────────────────────────────────────────

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: "best",  label: "Best" },
  { value: "1080p", label: "1080p" },
  { value: "720p",  label: "720p" },
  { value: "480p",  label: "480p" },
  { value: "audio", label: "Audio only" },
];

function QualityPicker({
  value,
  onChange,
}: {
  value: Quality;
  onChange: (q: Quality) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Default quality"
      style={{
        display: "flex",
        alignItems: "center",
        background: "var(--dm-color-bg-recessed)",
        border: "1px solid var(--dm-color-border-subtle)",
        borderRadius: "var(--dm-radius-md)",
        padding: "3px",
        gap: "2px",
      }}
    >
      {QUALITY_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            style={{
              padding: "5px 10px",
              borderRadius: "var(--dm-radius-sm)",
              border: "none",
              cursor: "pointer",
              fontSize: "var(--dm-text-xs)",
              fontWeight: active ? "var(--dm-weight-medium)" : "var(--dm-weight-regular)",
              background: active ? "var(--dm-color-bg-elevated)" : "transparent",
              color: active ? "var(--dm-color-fg-primary)" : "var(--dm-color-fg-tertiary)",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
              transition: "all var(--dm-duration-fast) var(--dm-easing-standard)",
              outline: "none",
              whiteSpace: "nowrap",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Save bar ──────────────────────────────────────────────────────────────────

function SaveBar({
  dirty,
  saving,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (dirty) {
      // slight delay to let user finish typing before bar slides in
      const t = setTimeout(() => setVisible(true), 80);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [dirty]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: `translateX(-50%) translateY(${visible ? "0" : "16px"})`,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity var(--dm-duration-normal) var(--dm-easing-standard), transform var(--dm-duration-normal) var(--dm-easing-standard)",
        maxWidth: "480px",
        width: "calc(100% - 64px)",
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 8px 8px 16px",
          background: "var(--dm-color-bg-elevated)",
          border: "1px solid var(--dm-color-border-default)",
          borderRadius: "var(--dm-radius-full)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)",
          gap: "12px",
        }}
      >
        <span
          style={{
            fontSize: "var(--dm-text-sm)",
            color: "var(--dm-color-fg-secondary)",
            whiteSpace: "nowrap",
          }}
        >
          Unsaved changes
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--dm-radius-full)",
              border: "1px solid var(--dm-color-border-subtle)",
              background: "transparent",
              color: saving ? "var(--dm-color-fg-disabled)" : "var(--dm-color-fg-secondary)",
              fontSize: "var(--dm-text-sm)",
              fontWeight: "var(--dm-weight-medium)",
              cursor: saving ? "not-allowed" : "pointer",
              transition: "all var(--dm-duration-fast) var(--dm-easing-standard)",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.color = "var(--dm-color-fg-primary)";
            }}
            onMouseLeave={(e) => {
              if (!saving) e.currentTarget.style.color = "var(--dm-color-fg-secondary)";
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--dm-radius-md)",
              border: "none",
              background: saving
                ? "var(--dm-color-accent-primary)"
                : "var(--dm-color-accent-primary)",
              color: "#ffffff",
              fontSize: "var(--dm-text-sm)",
              fontWeight: "var(--dm-weight-semibold)",
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              opacity: saving ? 0.8 : 1,
              transition: "opacity var(--dm-duration-fast) var(--dm-easing-standard), background var(--dm-duration-fast) var(--dm-easing-standard)",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = "var(--dm-color-accent-primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--dm-color-accent-primary)";
            }}
          >
            {saving && <Loader2 size={13} strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }} />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Spinner keyframe injection ────────────────────────────────────────────────

const SPIN_STYLE_ID = "dm-settings-spin-style";
function ensureSpinStyles() {
  if (typeof document !== "undefined" && !document.getElementById(SPIN_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SPIN_STYLE_ID;
    style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }
}

// ── Main component ────────────────────────────────────────────────────────────

type SettingsScreenProps = {
  onClose: () => void;
};

export function SettingsScreen({ onClose }: SettingsScreenProps) {
  ensureSpinStyles();

  const { data, loading, error, update, refetch } = useSettings();
  const [theme, setTheme] = useTheme();

  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [backHover, setBackHover] = useState(false);

  // Initialise draft when data arrives (or re-arrive after refetch)
  useEffect(() => {
    if (data && !draft) {
      setDraft(data);
    }
  }, [data, draft]);

  const dirty = draft !== null && data !== null && (
    draft.download_dir !== data.download_dir ||
    draft.max_parallel !== data.max_parallel ||
    draft.default_quality !== data.default_quality ||
    draft.theme !== data.theme ||
    draft.language !== data.language ||
    draft.auto_start_downloads !== data.auto_start_downloads
  );

  const patch = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    await update(draft);
    setSaving(false);
  }, [draft, update]);

  const handleCancel = useCallback(() => {
    setDraft(data);
  }, [data]);

  const handleThemeChange = useCallback(
    (t: "light" | "dark" | "system") => {
      setTheme(t);
      patch("theme", t);
    },
    [setTheme, patch],
  );

  const handleBrowseDir = useCallback(async () => {
    const current = draft?.download_dir ?? "";
    // Browser dev server (not inside Tauri): keep the typed-path fallback.
    if (!("__TAURI_INTERNALS__" in window)) {
      const next = window.prompt("Enter download directory path:", current);
      if (next !== null) {
        patch("download_dir", next.trim());
      }
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: current || undefined,
    });
    if (typeof selected === "string") {
      patch("download_dir", selected);
    }
  }, [draft, patch]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: "var(--dm-color-bg-recessed)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <PageHeader onClose={onClose} backHover={backHover} setBackHover={setBackHover} />
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 32px 80px",
          }}
        >
          <div
            style={{
              maxWidth: "720px",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            <SkeletonCard height={138} />
            <SkeletonCard height={96} />
            <SkeletonCard height={120} />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !draft) {
    return (
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: "var(--dm-color-bg-recessed)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <PageHeader onClose={onClose} backHover={backHover} setBackHover={setBackHover} />
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load settings"
          body={error?.message ?? "An unknown error occurred. Please try again."}
          cta={{ label: "Retry", onClick: refetch }}
        />
      </div>
    );
  }

  // ── Main content ───────────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1,
        background: "var(--dm-color-bg-recessed)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <PageHeader onClose={onClose} backHover={backHover} setBackHover={setBackHover} />

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 32px 100px",
        }}
      >
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >

          {/* ── Downloads section ── */}
          <SectionCard icon={<FolderDown size={18} strokeWidth={1.8} />} title="Downloads">
            <SettingRow label="Download directory">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    fontSize: "var(--dm-text-sm)",
                    fontFamily: "var(--dm-font-mono)",
                    color: draft.download_dir
                      ? "var(--dm-color-fg-primary)"
                      : "var(--dm-color-fg-tertiary)",
                    maxWidth: "220px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {draft.download_dir || "Default (~/Downloads/DownloadMgr)"}
                </span>
                <button
                  onClick={handleBrowseDir}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--dm-radius-md)",
                    border: "1px solid var(--dm-color-border-subtle)",
                    background: "transparent",
                    color: "var(--dm-color-fg-secondary)",
                    fontSize: "var(--dm-text-xs)",
                    fontWeight: "var(--dm-weight-medium)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all var(--dm-duration-fast) var(--dm-easing-standard)",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--dm-color-bg-hover)";
                    e.currentTarget.style.color = "var(--dm-color-fg-primary)";
                    e.currentTarget.style.borderColor = "var(--dm-color-border-default)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--dm-color-fg-secondary)";
                    e.currentTarget.style.borderColor = "var(--dm-color-border-subtle)";
                  }}
                >
                  Browse…
                </button>
              </div>
            </SettingRow>

            <SettingRow label="Concurrent downloads">
              <Stepper
                value={draft.max_parallel}
                min={1}
                max={10}
                onChange={(v) => patch("max_parallel", v)}
              />
            </SettingRow>

            <SettingRow label="Start downloads automatically" isLast>
              <Toggle
                value={draft.auto_start_downloads}
                onChange={(v) => patch("auto_start_downloads", v)}
              />
            </SettingRow>
          </SectionCard>

          {/* ── Quality section ── */}
          <SectionCard icon={<Video size={18} strokeWidth={1.8} />} title="Quality">
            <SettingRow label="Default quality" isLast>
              <QualityPicker
                value={draft.default_quality}
                onChange={(q) => patch("default_quality", q)}
              />
            </SettingRow>
          </SectionCard>

          {/* ── Appearance section ── */}
          <SectionCard icon={<Palette size={18} strokeWidth={1.8} />} title="Appearance">
            <SettingRow label="Theme">
              <ThemeSwitcher theme={theme} onChange={handleThemeChange} />
            </SettingRow>

            <SettingRow
              label="Language"
              description="More languages coming soon"
              isLast
            >
              <select
                disabled
                value="en"
                style={{
                  padding: "6px 10px",
                  borderRadius: "var(--dm-radius-md)",
                  border: "1px solid var(--dm-color-border-subtle)",
                  background: "var(--dm-color-bg-recessed)",
                  color: "var(--dm-color-fg-disabled)",
                  fontSize: "var(--dm-text-sm)",
                  cursor: "not-allowed",
                  outline: "none",
                  fontFamily: "var(--dm-font-family)",
                  minWidth: "120px",
                }}
              >
                <option value="en">English</option>
              </select>
            </SettingRow>
          </SectionCard>

        </div>
      </div>

      {/* Floating save bar */}
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}

// ── Page header (extracted to avoid repetition in loading/error states) ───────

function PageHeader({
  onClose,
  backHover,
  setBackHover,
}: {
  onClose: () => void;
  backHover: boolean;
  setBackHover: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "20px 32px 0",
        marginBottom: "32px",
        flexShrink: 0,
      }}
    >
      {/* Back button */}
      <button
        onClick={onClose}
        onMouseEnter={() => setBackHover(true)}
        onMouseLeave={() => setBackHover(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 10px 6px 8px",
          borderRadius: "var(--dm-radius-md)",
          border: "none",
          background: "transparent",
          color: backHover ? "var(--dm-color-fg-primary)" : "var(--dm-color-fg-tertiary)",
          fontSize: "var(--dm-text-sm)",
          fontWeight: "var(--dm-weight-medium)",
          cursor: "pointer",
          transition: "color var(--dm-duration-fast) var(--dm-easing-standard)",
          outline: "none",
          flexShrink: 0,
        }}
      >
        <ArrowLeft size={15} strokeWidth={2} />
        Back
      </button>

      {/* Divider */}
      <div
        style={{
          width: "1px",
          height: "20px",
          background: "var(--dm-color-border-subtle)",
          flexShrink: 0,
        }}
      />

      {/* Title + subtitle */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <span
          style={{
            fontSize: "var(--dm-text-xl)",
            fontWeight: "var(--dm-weight-semibold)",
            color: "var(--dm-color-fg-primary)",
            lineHeight: "var(--dm-leading-tight)",
            letterSpacing: "var(--dm-tracking-tight)",
          }}
        >
          Settings
        </span>
        <span
          style={{
            fontSize: "var(--dm-text-sm)",
            color: "var(--dm-color-fg-tertiary)",
            lineHeight: "var(--dm-leading-tight)",
          }}
        >
          Configure how DownloadMgr behaves
        </span>
      </div>
    </div>
  );
}
