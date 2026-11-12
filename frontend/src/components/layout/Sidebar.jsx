import React from 'react';
import {
  Home,
  UserCog,
  Camera,
  BookOpen,
  LogOut,
  ShieldCheck,
  Building,
} from 'lucide-react';
import ProPanelLogo from '../common/ProPanelLogo';

// Navigation configuration for Pro Panel (Standalone Edition)
const NAV_CONFIG = {
  super_admin: [
    { id: 'dashboard', label: 'Dashboard', Icon: Home },
    { id: 'operators', label: 'Operators', Icon: UserCog },
    { id: 'organisations', label: 'Organisations', Icon: Building },
  ],

  operator: [
    { id: 'dashboard', label: 'Dashboard', Icon: Home },
    { id: 'organisations', label: 'Organisations', Icon: Building },
  ],

  prime_manager: [
    { id: 'dashboard', label: 'Dashboard', Icon: Home },
    { id: 'cards', label: 'Tables', Icon: ShieldCheck },
  ],

  super_manager: [
    { id: 'dashboard', label: 'Dashboard', Icon: Home },
    { id: 'cards', label: 'Tables', Icon: ShieldCheck },
  ],

  manager: [
    { id: 'dashboard', label: 'Dashboard', Icon: Home },
    { id: 'cards', label: 'Tables', Icon: ShieldCheck },
  ],

  assistant: [
    { id: 'dashboard', label: 'Dashboard', Icon: Home },
    { id: 'cards', label: 'Tables', Icon: ShieldCheck },
  ],

  photographer: [
    { id: 'dashboard', label: 'Dashboard', Icon: Home },
    { id: 'cards', label: 'Tables', Icon: Camera },
  ],
};

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  operator: 'Operator',
  prime_manager: 'Client Manager',
  super_manager: 'Manager',
  manager: 'Manager',
  assistant: 'Assistant',
  photographer: 'Photographer',
};

export default function Sidebar({
  activeTab,
  setActiveTab,
  userRole = 'super_admin',
  currentUser,
  _onLogout,
  impersonatedUser,
  onExitImpersonation,
}) {
  const normalizedRole = String(userRole || '').toLowerCase();
  let roleKey = 'super_admin';
  if (normalizedRole === 'operator' || normalizedRole === 'admin_staff') {
    roleKey = 'operator';
  } else if (normalizedRole === 'prime_manager' || normalizedRole === 'client') {
    roleKey = 'prime_manager';
  } else if (normalizedRole === 'super_manager' || normalizedRole === 'manager') {
    roleKey = 'super_manager';
  } else if (normalizedRole === 'assistant' || normalizedRole === 'client_staff') {
    roleKey = 'assistant';
  } else if (normalizedRole === 'photographer') {
    roleKey = 'photographer';
  } else {
    roleKey = 'super_admin';
  }

  const navConfig = NAV_CONFIG[roleKey] || NAV_CONFIG.super_admin;

  const displayName = currentUser?.first_name
    ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim()
    : currentUser?.username || currentUser?.email || 'Super Admin';

  const initials = displayName.slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABELS[roleKey] || 'Super Admin';

  return (
    <aside className="sidebar" id="sidebar">
      {/* ── Header / Logo ── */}
      <div
        className="sidebar-header"
        style={{
          padding: '0 12px',
          height: '50px',
          minHeight: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          background: 'transparent',
          boxShadow: 'none',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <ProPanelLogo size="md" />
      </div>

      {/* ── Navigation ── */}
      <nav aria-label="Main navigation">
        {navConfig.map((item) => {
          const Icon = item.Icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`nav-item${isActive ? ' active' : ''}`}
              id={`nav-item-${item.id}`}
              type="button"
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Sticky Tutorial Button ── */}
      <div
        className="sidebar-tutorial-pinned"
        style={{
          padding: '0 6px 6px 6px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setActiveTab('tutorial')}
          className={`nav-item${activeTab === 'tutorial' ? ' active' : ''}`}
          id="sidebar-tutorial-btn"
          type="button"
          title="Tutorial"
          aria-current={activeTab === 'tutorial' ? 'page' : undefined}
          style={{ width: '100%', boxSizing: 'border-box', margin: '0' }}
        >
          <BookOpen size={15} />
          <span>Tutorial</span>
        </button>
      </div>

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        {/* Impersonation Indicator */}
        {impersonatedUser && (
          <div
            className="sidebar-impersonate-badge"
            title={`Active Impersonation: ${impersonatedUser.name} (${impersonatedUser.role || impersonatedUser.email})`}
          >
            <div className="sidebar-impersonate-content">
              <div className="sidebar-impersonate-label">
                <span className="sidebar-impersonate-dot" />
                <UserCog size={11} />
                <span>IMPERSONATING</span>
              </div>
              <div className="sidebar-impersonate-name">
                {impersonatedUser.name || impersonatedUser.username || 'User'}
              </div>
            </div>
            {onExitImpersonation && (
              <button
                type="button"
                id="sidebar-exit-impersonation-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onExitImpersonation();
                }}
                className="sidebar-impersonate-exit-btn"
                title="Exit Impersonation Session"
              >
                <LogOut size={10} />
                <span>Exit</span>
              </button>
            )}
          </div>
        )}

        {/* User tile — clicking goes to Profile / Settings */}
        <div
          className="sidebar-user"
          onClick={() => setActiveTab('settings')}
          title="Go to Profile / Settings"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setActiveTab('settings')}
          id="sidebar-user-tile"
        >
          {/* Avatar */}
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>

          {/* Name + Role */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#ffffff',
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayName || 'Super Admin'}
            </span>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, display: 'block' }}>{roleLabel}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
