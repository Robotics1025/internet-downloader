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
        {/* Icon with glassmorphic tile and glow */}
        <div className="animate-fade-slide" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', animationDuration: '0.5s' }}>
          {/* Glow circle */}
          <div
            className="animate-pulse-glow"
            style={{
              position: 'absolute',
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--dm-color-accent-primary), rgba(168, 85, 247, 0.6))',
              opacity: 0.15,
              filter: 'blur(28px)',
              pointerEvents: 'none',
            }}
          />
          {/* Glass tile */}
          <div
            style={{
              position: 'relative',
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dm-color-accent-primary)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <Icon size={32} />
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
              padding: '10px 24px',
              borderRadius: 'var(--dm-radius-lg)',
              background: 'linear-gradient(135deg, var(--dm-color-accent-primary), var(--dm-color-accent-primary-hover))',
              color: '#fff',
              fontSize: 'var(--dm-text-sm)',
              fontWeight: 'var(--dm-weight-semibold)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 16px var(--dm-color-accent-subtle)',
              cursor: 'pointer',
              transition: `all var(--dm-duration-normal) var(--dm-easing-standard)`,
              fontFamily: 'var(--dm-font-family)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px var(--dm-color-accent-subtle)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px var(--dm-color-accent-subtle)';
            }}
          >
            {cta.label}
          </button>
        )}
      </div>
    </div>
  );
}
