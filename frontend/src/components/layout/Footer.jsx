/**
 * Footer.jsx
 *
 * Global solid black footer component matching topbar aesthetics.
 * Left: Interactive Breadcrumb Navigation with clickable back steps.
 * Right: Modern Data Count / Stats badge.
 */

import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  Home,
  Layers,
  Table,
  UserCheck,
  Shield,
  Settings,
  Sliders,
  HelpCircle,
  Sparkles,
  Undo2,
  Redo2,
  DollarSign,
  FileText,
  Building,
  Activity,
  Camera,
  UsersRound,
  X,
} from 'lucide-react';

export default function Footer({
  activeTab,
  onNavigate,
  idcardActionsState,
  scopedOrgName,
  scopedOrgId,
  activeTableName,
  userRole,
}) {
  const [dataCountText, setDataCountText] = useState('');
  const [dataCountBadges, setDataCountBadges] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [undoState, setUndoState] = useState({
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
    undoLoading: false,
  });

  // Clear selection and count on tab switch
  useEffect(() => {
    setSelectedText('');
    setDataCountText('');
    setDataCountBadges(null);
  }, [activeTab]);

  // Listen for custom data-count updates from any active view component
  useEffect(() => {
    const handleCountUpdate = (e) => {
      if (e.detail?.text !== undefined) setDataCountText(e.detail.text || '');
      if (e.detail?.badges !== undefined) setDataCountBadges(e.detail.badges || null);
      if (e.detail?.selectedText !== undefined) setSelectedText(e.detail.selectedText || '');
    };
    const handleUndoRedoState = (e) => {
      if (e.detail) setUndoState((prev) => ({ ...prev, ...e.detail }));
    };
    window.addEventListener('cardflow:data-count', handleCountUpdate);
    window.addEventListener('cardflow:undo-redo-state', handleUndoRedoState);
    return () => {
      window.removeEventListener('cardflow:data-count', handleCountUpdate);
      window.removeEventListener('cardflow:undo-redo-state', handleUndoRedoState);
    };
  }, []);

  // Compute breadcrumb segments based on active tab
  const getBreadcrumbs = () => {
    switch (activeTab) {
      case 'dashboard':
        if (userRole === 'prime_admin' || userRole === 'prime_operator') {
          return [
            { label: 'Pro Panel', icon: Home },
            { label: 'Dashboard', isCurrent: true, icon: Shield },
          ];
        }
        return [{ label: 'Pro Panel', isCurrent: true, icon: Home }];
      case 'saas_subscriptions':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Prime Admin', tab: 'dashboard', icon: Shield },
          { label: 'Subscriptions', isCurrent: true, icon: Building },
        ];
      case 'saas_payments':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Prime Admin', tab: 'dashboard', icon: Shield },
          { label: 'Billing', isCurrent: true, icon: DollarSign },
        ];
      case 'saas_prime_operators':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Prime Admin', tab: 'dashboard', icon: Shield },
          { label: 'Operators', isCurrent: true, icon: UserCheck },
        ];
      case 'saas_statistics':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Prime Admin', tab: 'dashboard', icon: Shield },
          { label: 'Statistics', isCurrent: true, icon: Activity },
        ];
      case 'saas_settings':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Prime Admin', tab: 'dashboard', icon: Shield },
          { label: 'Tiers', isCurrent: true, icon: Sparkles },
        ];
      case 'saas_logs':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Prime Admin', tab: 'dashboard', icon: Shield },
          { label: 'Logs', isCurrent: true, icon: FileText },
        ];
      case 'cards':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Organisations', tab: 'organisations', icon: Building },
          { label: 'Tables', isCurrent: true, icon: Layers },
        ];
      case 'idcard-actions': {
        const statusLabel = (idcardActionsState?.status || 'pending').toUpperCase();
        const tableLabel = activeTableName || 'Table Data';
        if (scopedOrgName) {
          return [
            { label: 'Pro Panel', tab: 'dashboard', icon: Home },
            { label: 'Organisations', tab: 'organisations', icon: Building },
            { label: scopedOrgName, tab: 'cards', icon: Layers, params: { orgId: scopedOrgId, orgName: scopedOrgName } },
            {
              label: `${tableLabel} (${statusLabel})`,
              isCurrent: true,
              icon: Table,
            },
          ];
        }
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Organisations', tab: 'organisations', icon: Building },
          { label: 'Tables', tab: 'cards', icon: Layers },
          {
            label: `${tableLabel} (${statusLabel})`,
            isCurrent: true,
            icon: Table,
          },
        ];
      }
      case 'schema':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Tables', isCurrent: true, icon: Layers },
        ];
      case 'organisations':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Organisations', isCurrent: true, icon: Building },
        ];
      case 'operators':
      case 'staff':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Operators', isCurrent: true, icon: UserCheck },
        ];
      case 'managers': {
        const orgLabel = scopedOrgName || (scopedOrgId ? `Organisation #${scopedOrgId}` : '');
        const items = [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Organisations', tab: 'organisations', icon: Building },
        ];
        if (orgLabel) {
          items.push({
            label: orgLabel,
            tab: 'cards',
            icon: Building,
            params: { orgId: scopedOrgId, orgName: scopedOrgName || orgLabel },
          });
        }
        items.push({
          label: 'Managers',
          isCurrent: true,
          icon: UsersRound,
        });
        return items;
      }
      case 'assistants': {
        const orgLabel = scopedOrgName || (scopedOrgId ? `Organisation #${scopedOrgId}` : '');
        const items = [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Organisations', tab: 'organisations', icon: Building },
        ];
        if (orgLabel) {
          items.push({
            label: orgLabel,
            tab: 'cards',
            icon: Building,
            params: { orgId: scopedOrgId, orgName: scopedOrgName || orgLabel },
          });
        }
        items.push({
          label: 'Assistants',
          isCurrent: true,
          icon: UsersRound,
        });
        return items;
      }
      case 'photographers':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Photographers', isCurrent: true, icon: Camera },
        ];
      case 'panel':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Pro System', isCurrent: true, icon: Sliders },
        ];
      case 'pro':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Pro', isCurrent: true, icon: Sparkles },
        ];
      case 'statistics':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Statistics', isCurrent: true, icon: Activity },
        ];
      case 'tutorial':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Tutorial', isCurrent: true, icon: HelpCircle },
        ];
      case 'settings':
      case 'profile':
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: 'Settings', isCurrent: true, icon: Settings },
        ];
      default:
        return [
          { label: 'Pro Panel', tab: 'dashboard', icon: Home },
          { label: activeTab, isCurrent: true },
        ];
    }
  };

  const breadcrumbs = getBreadcrumbs();
  const isSuperAdmin = ['super_admin', 'prime_admin'].includes(String(userRole || '').toLowerCase());

  return (
    <footer
      style={{
        flexShrink: 0,
        height: '36px',
        minHeight: '36px',
        background: '#1e1e2e',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '6px 6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#94a3b8',
        fontSize: '13px',
        boxSizing: 'border-box',
        zIndex: 100,
        gap: '8px',
      }}
    >
      {/* Left: Interactive Breadcrumbs */}
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {breadcrumbs.map((item, idx) => {
          const Icon = item.icon;
          return (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight size={13} style={{ color: '#475569', flexShrink: 0 }} />}
              {item.isCurrent ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    letterSpacing: '0.01em',
                  }}
                >
                  {Icon && <Icon size={12} style={{ color: '#38bdf8' }} />}
                  {item.label}
                </span>
              ) : item.tab ? (
                <button
                  type="button"
                  onClick={() => onNavigate?.(item.tab, item.params)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 4px',
                    color: '#94a3b8',
                    fontWeight: 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#38bdf8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                >
                  {Icon && <Icon size={12} />}
                  {item.label}
                </button>
              ) : (
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>{item.label}</span>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Right: Modern Data Count / System & Selection Badges & Undo/Redo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Undo & Redo Controls */}
        {activeTab === 'idcard-actions' && isSuperAdmin && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <button
              type="button"
              disabled={!undoState.canUndo || undoState.undoLoading}
              onClick={() => window.dispatchEvent(new CustomEvent('cardflow:trigger-undo'))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                height: '24px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                background: undoState.canUndo ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                color: undoState.canUndo ? '#ffffff' : '#64748b',
                cursor: undoState.canUndo ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              title="Undo Operation (Ctrl+Z)"
            >
              <Undo2 size={12} />
              <span>Undo</span>
              {undoState.undoCount > 0 && (
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8' }}>{undoState.undoCount}</span>
              )}
            </button>

            <button
              type="button"
              disabled={!undoState.canRedo || undoState.undoLoading}
              onClick={() => window.dispatchEvent(new CustomEvent('cardflow:trigger-redo'))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                height: '24px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                background: undoState.canRedo ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                color: undoState.canRedo ? '#ffffff' : '#64748b',
                cursor: undoState.canRedo ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              title="Redo Operation (Ctrl+Y)"
            >
              <Redo2 size={12} />
              <span>Redo</span>
              {undoState.redoCount > 0 && (
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8' }}>{undoState.redoCount}</span>
              )}
            </button>
          </div>
        )}

        {selectedText ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              className="footer-selected-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '4px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#38bdf8',
                userSelect: 'none',
                maxWidth: '360px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={selectedText}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#38bdf8', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedText}</span>
            </span>

            {/* Clear Selection Button */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('cardflow:clear-selection'))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                height: '24px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              title="Clear Selection"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = '#cbd5e1';
              }}
            >
              <X size={12} />
              <span>Clear</span>
            </button>
          </div>
        ) : null}

        {dataCountBadges && dataCountBadges.length > 0 ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {dataCountBadges.map((b, idx) => (
              <span
                key={idx}
                className="footer-badge"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  height: '22px',
                  borderRadius: '4px',
                  background: b.bg || 'rgba(255, 255, 255, 0.08)',
                  border: `1px solid ${b.border || 'rgba(255, 255, 255, 0.16)'}`,
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: b.color || '#e2e8f0',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{b.label}:</span>
                <strong style={{ color: b.countColor || '#ffffff', fontWeight: 700 }}>{b.count}</strong>
              </span>
            ))}
          </div>
        ) : dataCountText ? (
          <span
            className="footer-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              fontSize: '13px',
              fontWeight: 600,
              color: '#e2e8f0',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
            {dataCountText}
          </span>
        ) : !selectedText ? (
          <span style={{ fontSize: '13px', color: '#64748b' }}>Pro Panel</span>
        ) : null}
      </div>
    </footer>
  );
}
