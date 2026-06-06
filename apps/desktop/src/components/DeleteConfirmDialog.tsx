import React from 'react';
import type { Download } from '../types';

interface Props {
  download: Download;
  onCancel: () => void;
  onConfirm: (deleteFile: boolean) => void;
}

/** Shown when deleting a COMPLETED download: choose whether to also remove the
 *  file from disk. Non-completed deletes don't use this (no finished file). */
export function DeleteConfirmDialog({ download, onCancel, onConfirm }: Props) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '380px', maxWidth: 'calc(100% - 48px)',
          background: 'var(--dm-color-bg-elevated)',
          border: '1px solid var(--dm-color-border-default)',
          borderRadius: 'var(--dm-radius-lg)',
          padding: '20px', boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: 'var(--dm-text-lg)', fontWeight: 'var(--dm-weight-semibold)', color: 'var(--dm-color-fg-primary)' }}>
          Delete download
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 'var(--dm-text-sm)', color: 'var(--dm-color-fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {download.file_name}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => onConfirm(false)}
            style={btn('var(--dm-color-bg-recessed)', 'var(--dm-color-fg-primary)')}
          >
            Remove from list (keep file)
          </button>
          <button
            onClick={() => onConfirm(true)}
            style={btn('var(--dm-color-status-danger-surface)', 'var(--dm-color-status-danger-text)')}
          >
            Delete file from disk too
          </button>
          <button
            onClick={onCancel}
            style={{ ...btn('transparent', 'var(--dm-color-fg-tertiary)'), border: 'none' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(bg: string, fg: string): React.CSSProperties {
  return {
    width: '100%', padding: '10px 12px', borderRadius: 'var(--dm-radius-md)',
    border: '1px solid var(--dm-color-border-subtle)', background: bg, color: fg,
    fontSize: 'var(--dm-text-sm)', fontWeight: 'var(--dm-weight-medium)', cursor: 'pointer',
    textAlign: 'center',
  };
}
