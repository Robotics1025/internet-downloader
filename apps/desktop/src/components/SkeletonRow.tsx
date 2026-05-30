// Shimmer keyframes injected once into the document head
const SHIMMER_STYLE_ID = 'dm-skeleton-shimmer-style';

function ensureShimmerStyles() {
  if (typeof document !== 'undefined' && !document.getElementById(SHIMMER_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = SHIMMER_STYLE_ID;
    style.textContent = `
      @keyframes dm-skeleton-shimmer {
        0%   { background-position: -400px 0; }
        100% { background-position:  400px 0; }
      }
      .dm-skeleton-bone {
        background-color: var(--dm-color-bg-recessed);
        background-image: linear-gradient(
          105deg,
          transparent 30%,
          rgba(255, 255, 255, 0.04) 50%,
          transparent 70%
        );
        background-size: 800px 100%;
        background-repeat: no-repeat;
        animation: dm-skeleton-shimmer 1.8s linear infinite;
      }
    `;
    document.head.appendChild(style);
  }
}

export function SkeletonRow() {
  ensureShimmerStyles();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        height: '64px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Thumbnail placeholder */}
      <div
        className="dm-skeleton-bone"
        style={{
          flexShrink: 0,
          width: '96px',
          height: '54px',
          borderRadius: 'var(--dm-radius-md)',
        }}
      />

      {/* Text lines placeholder */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          minWidth: 0,
        }}
      >
        {/* Top line ~60% width */}
        <div
          className="dm-skeleton-bone"
          style={{
            width: '60%',
            height: '14px',
            borderRadius: 'var(--dm-radius-sm)',
          }}
        />
        {/* Bottom line ~40% width */}
        <div
          className="dm-skeleton-bone"
          style={{
            width: '40%',
            height: '11px',
            borderRadius: 'var(--dm-radius-sm)',
          }}
        />
      </div>

      {/* Badge / progress placeholder */}
      <div
        className="dm-skeleton-bone"
        style={{
          flexShrink: 0,
          width: '64px',
          height: '24px',
          borderRadius: 'var(--dm-radius-sm)',
        }}
      />
    </div>
  );
}
