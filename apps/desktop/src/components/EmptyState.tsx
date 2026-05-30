import React from 'react';

interface CTAProps {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  body: string;
  cta?: CTAProps;
}

export function EmptyState({ icon: Icon, title, body, cta }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '48px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '360px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Icon with radial glow */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Glow circle */}
          <div
            style={{
              position: 'absolute',
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              background: 'var(--dm-color-accent-subtle)',
              opacity: 0.3,
              filter: 'blur(24px)',
              pointerEvents: 'none',
            }}
          />
          {/* Icon */}
          <div
            style={{
              position: 'relative',
              width: '48px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dm-color-fg-tertiary)',
            }}
          >
            <Icon size={48} />
          </div>
        </div>

        {/* Title */}
        <p
          style={{
            marginTop: '20px',
            fontSize: 'var(--dm-text-lg)',
            fontWeight: 'var(--dm-weight-semibold)',
            color: 'var(--dm-color-fg-primary)',
            lineHeight: 'var(--dm-leading-tight)',
            letterSpacing: 'var(--dm-tracking-tight)',
          }}
        >
          {title}
        </p>

        {/* Body */}
        <p
          style={{
            marginTop: '8px',
            fontSize: 'var(--dm-text-sm)',
            color: 'var(--dm-color-fg-tertiary)',
            lineHeight: 1.5,
            maxHeight: '3em',        /* ~2 lines */
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {body}
        </p>

        {/* CTA */}
        {cta && (
          <button
            onClick={cta.onClick}
            style={{
              marginTop: '24px',
              padding: '8px 16px',
              borderRadius: 'var(--dm-radius-md)',
              background: 'var(--dm-color-accent-primary)',
              color: '#ffffff',
              fontSize: 'var(--dm-text-sm)',
              fontWeight: 'var(--dm-weight-medium)',
              border: 'none',
              cursor: 'pointer',
              transition: `background var(--dm-duration-fast) var(--dm-easing-standard)`,
              fontFamily: 'var(--dm-font-family)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--dm-color-accent-primary-hover)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--dm-color-accent-primary)';
            }}
          >
            {cta.label}
          </button>
        )}
      </div>
    </div>
  );
}
