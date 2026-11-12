import React, { useState, useEffect, useCallback } from 'react';
import { Heart, Calendar, Clock, MessageSquare } from 'lucide-react';
import { dashboardApi } from '../../services/api';

/*
  Exact replica of base.html <header class="topbar">:
  - Left: Welcome message + Blue Heart + Live Time & Date Badge
  - Right: Presence pills + Global Search + User Profile Dropdown
*/

export default function Header({
  _activeTab = 'dashboard',
  _searchQuery,
  _setSearchQuery,
  currentUser,
  userRole,
  _onLogout,
  onOpenActionDrawer,
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = time.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = time.toLocaleTimeString('en-US', { hour12: false });

  const fetchUnread = useCallback(async () => {
    try {
      const data = await dashboardApi.getUnreadCount();
      setUnreadCount(data.count ?? data.unread_count ?? 0);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    const t = setInterval(fetchUnread, 60_000);
    return () => clearInterval(t);
  }, [fetchUnread]);

  const displayName =
    currentUser?.org_name ||
    currentUser?.name ||
    currentUser?.full_name ||
    (currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim() : null) ||
    currentUser?.username ||
    (userRole === 'prime_admin' ? 'Prime Admin' : userRole === 'super_admin' ? 'System Admin' : 'User');


  return (
    <header
      className="topbar"
      id="topbar"
      style={{
        height: '50px',
        minHeight: '50px',
        maxHeight: '50px',
        background: '#1e1e2e',
        borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: Welcome + Name */}
      <div className="nav-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 600,
            color: '#f1f5f9',
          }}
        >
          <Heart size={15} fill="#3b82f6" color="#3b82f6" className="heart-pulse-anim" />
          <span style={{ color: '#cbd5e1', fontWeight: 500 }}>Welcome</span>
          <strong style={{ color: '#60a5fa', fontWeight: 800, fontSize: '15px', letterSpacing: '0.01em' }}>{displayName}</strong>
        </div>
      </div>

      {/* Right: Chat Button + Enhanced Live Date & Time Badge */}
      <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
        {/* Chat Button */}
        <button
          type="button"
          onClick={() => onOpenActionDrawer?.('message')}
          className="nav-chat-btn"
          title="Open Messenger / Broadcast Chat"
          style={{
            padding: '0 12px',
            height: '34px',
            borderRadius: '4px',
            border: '1px solid rgba(99, 102, 241, 0.5)',
            background: 'linear-gradient(135deg, #312e81 0%, #1e1b4b 100%)',
            color: '#e0e7ff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            boxSizing: 'border-box',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.9)';
            e.currentTarget.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.4)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
            e.currentTarget.style.color = '#e0e7ff';
          }}
        >
          <MessageSquare size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
          <span>Chat</span>
          {unreadCount > 0 && (
            <span
              style={{
                background: '#ef4444',
                color: '#ffffff',
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>

        {/* Live Date Badge with Dedicated Calendar Icon */}
        <div
          title={`Today is ${formattedDate}`}
          style={{
            padding: '0 12px',
            height: '34px',
            borderRadius: '4px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(15, 23, 42, 0.75)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 600,
            boxSizing: 'border-box',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <Calendar size={12} style={{ color: '#38bdf8', flexShrink: 0 }} />
            <span style={{ color: '#cbd5e1', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>{formattedDate}</span>
          </div>
          <span style={{ width: '1px', height: '14px', background: 'rgba(255, 255, 255, 0.16)' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <Clock size={12} style={{ color: '#38bdf8', flexShrink: 0 }} />
            <span
              style={{
                color: '#ffffff',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"',
                minWidth: '58px',
                textAlign: 'center',
                display: 'inline-block',
                letterSpacing: '0.04em',
              }}
            >
              {formattedTime}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
