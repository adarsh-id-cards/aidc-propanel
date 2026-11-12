import React from 'react';
import {
  Clock,
  CheckCircle2,
  ThumbsUp,
  Printer,
  RotateCcw,
  Trash2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

const STATUS_CONFIGS = {
  pending: {
    label: 'Pending',
    badgeBg: '#fef3c7',
    badgeColor: '#b45309',
    borderColor: '#fde68a',
    accent: '#d97706',
    pillBg: '#fffbeb',
    icon: Clock,
  },
  verified: {
    label: 'Verified',
    badgeBg: '#d1fae5',
    badgeColor: '#047857',
    borderColor: '#a7f3d0',
    accent: '#059669',
    pillBg: '#ecfdf5',
    icon: CheckCircle2,
  },
  approved: {
    label: 'Approved',
    badgeBg: '#dbeafe',
    badgeColor: '#1d4ed8',
    borderColor: '#bfdbfe',
    accent: '#2563eb',
    pillBg: '#eff6ff',
    icon: ThumbsUp,
  },
  printed: {
    label: 'Printed',
    badgeBg: '#ede9fe',
    badgeColor: '#6d28d9',
    borderColor: '#ddd6fe',
    accent: '#7c3aed',
    pillBg: '#f5f3ff',
    icon: Printer,
  },
  download: {
    label: 'Printed',
    badgeBg: '#ede9fe',
    badgeColor: '#6d28d9',
    borderColor: '#ddd6fe',
    accent: '#7c3aed',
    pillBg: '#f5f3ff',
    icon: Printer,
  },
  pool: {
    label: 'Deleted Pool',
    badgeBg: '#fee2e2',
    badgeColor: '#b91c1c',
    borderColor: '#fecaca',
    accent: '#dc2626',
    pillBg: '#fef2f2',
    icon: Trash2,
  },
  deleted: {
    label: 'Deleted Pool',
    badgeBg: '#fee2e2',
    badgeColor: '#b91c1c',
    borderColor: '#fecaca',
    accent: '#dc2626',
    pillBg: '#fef2f2',
    icon: Trash2,
  },
  reprint: {
    label: 'Reprinting',
    badgeBg: '#cffafe',
    badgeColor: '#0e7490',
    borderColor: '#a5f3fc',
    accent: '#0891b2',
    pillBg: '#ecfeff',
    icon: RotateCcw,
  },
};

const PIPELINE_ORDER = ['pending', 'verified', 'approved', 'printed'];

export default function StatusTransitionFlow({
  fromStatus = 'pending',
  toStatus = 'verified',
  count = 1,
  isSingle = false,
}) {
  const normFrom = String(fromStatus || 'pending').toLowerCase();
  const normTo = String(toStatus || 'verified').toLowerCase();

  const fromCfg = STATUS_CONFIGS[normFrom] || STATUS_CONFIGS.pending;
  const toCfg = STATUS_CONFIGS[normTo] || STATUS_CONFIGS.verified;

  const FromIcon = fromCfg.icon || Clock;
  const ToIcon = toCfg.icon || CheckCircle2;

  const fromStepIdx = PIPELINE_ORDER.indexOf(normFrom);
  const toStepIdx = PIPELINE_ORDER.indexOf(normTo);
  const isReversing = fromStepIdx !== -1 && toStepIdx !== -1 && toStepIdx < fromStepIdx;

  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '4px',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
      }}
    >
      {/* FROM Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: fromCfg.pillBg,
          border: `1px solid ${fromCfg.borderColor}`,
          borderRadius: '4px',
          padding: '8px 12px',
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            background: fromCfg.badgeBg,
            color: fromCfg.badgeColor,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <FromIcon size={14} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            style={{
              fontSize: '10px',
              color: '#64748b',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            From
          </span>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#1e293b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {fromCfg.label}
          </span>
        </div>
      </div>

      {/* Moving Center Connector */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          flexShrink: 0,
          padding: '0 4px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: toCfg.badgeBg,
            color: toCfg.badgeColor,
            border: `1px solid ${toCfg.borderColor}`,
            padding: '3px 9px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          <span>{isSingle ? '1 Card' : `${count} Cards`}</span>
          {isReversing ? <ArrowLeft size={11} /> : <ArrowRight size={11} />}
        </div>
        <span
          style={{
            fontSize: '10px',
            color: '#94a3b8',
            fontWeight: 600,
          }}
        >
          Moving
        </span>
      </div>

      {/* TO Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: toCfg.pillBg,
          border: `1.5px solid ${toCfg.accent}`,
          borderRadius: '4px',
          padding: '8px 12px',
          flex: 1,
          minWidth: 0,
          boxShadow: `0 2px 5px -1px ${toCfg.badgeBg}`,
        }}
      >
        <span
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            background: toCfg.accent,
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ToIcon size={14} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            style={{
              fontSize: '10px',
              color: toCfg.badgeColor,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            To
          </span>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: toCfg.badgeColor,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {toCfg.label}
          </span>
        </div>
      </div>
    </div>
  );
}
