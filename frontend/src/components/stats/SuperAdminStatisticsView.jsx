import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Users,
  Zap,
  Clock,
  TrendingUp,
  Smartphone,
  RefreshCw,
  Server,
  Search,
} from 'lucide-react';
import { statsApi } from '../../services/api';

export default function SuperAdminStatisticsView({ addToast }) {
  const [range, setRange] = useState('hourly'); // 'hourly' | 'daily' | 'weekly' | 'monthly'
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState(null);
  const [serverLoad, setServerLoad] = useState({ concurrent: 0, alert_level: null });
  const [rosterRoleFilter, setRosterRoleFilter] = useState('all');
  const [rosterSearch, setRosterSearch] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, loadRes] = await Promise.allSettled([
        statsApi.getStatisticsData(range),
        statsApi.checkServerLoad?.() || Promise.resolve(null),
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setStatsData(statsRes.value);
      }
      if (loadRes.status === 'fulfilled' && loadRes.value) {
        setServerLoad(loadRes.value);
      }
    } catch (err) {
      console.error('Failed to load statistics data:', err);
      addToast?.('Failed to load some statistics data', 'error');
    } finally {
      setLoading(false);
    }
  }, [range, addToast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Periodic lightweight live polling every 30 seconds
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const live = await statsApi.getLivePresence();
        if (live?.summary) {
          setStatsData((prev) => (prev ? { ...prev, summary: live.summary, live_users_roster: live.live_users_roster } : prev));
        }
      } catch {
        // silent polling catch
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const summary = statsData?.summary || {};
  const timeSeries = statsData?.time_series || {};
  const liveRoster = useMemo(() => {
    return Array.isArray(statsData?.live_users_roster) ? statsData.live_users_roster : [];
  }, [statsData?.live_users_roster]);


  // Filter roster
  const filteredRoster = useMemo(() => {
    return liveRoster.filter((u) => {
      if (rosterRoleFilter !== 'all') {
        const roleStr = (u.role || u.role_display || '').toLowerCase();
        if (rosterRoleFilter === 'admin' && !roleStr.includes('admin') && !roleStr.includes('operator')) return false;
        if (rosterRoleFilter === 'manager' && !roleStr.includes('manager') && !roleStr.includes('client')) return false;
        if (rosterRoleFilter === 'assistant' && !roleStr.includes('assistant')) return false;
      }
      if (rosterSearch.trim()) {
        const query = rosterSearch.toLowerCase();
        const name = (u.name || '').toLowerCase();
        const role = (u.role_display || u.role || '').toLowerCase();
        const org = (u.org_name || '').toLowerCase();
        const action = (u.last_action || '').toLowerCase();
        return name.includes(query) || role.includes(query) || org.includes(query) || action.includes(query);
      }
      return true;
    });
  }, [liveRoster, rosterRoleFilter, rosterSearch]);

  // Max value in chart for normalization
  const chartLabels = Array.isArray(timeSeries.labels) ? timeSeries.labels : [];
  const chartUsers = Array.isArray(timeSeries.all_user_activity)
    ? timeSeries.all_user_activity
    : Array.isArray(timeSeries.users_active)
    ? timeSeries.users_active
    : [];
  const maxChartVal = Math.max(1, ...chartUsers);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        background: '#f8fafc',
        fontFamily: 'var(--font-family, system-ui, sans-serif)',
        padding: '20px 24px',
        gap: '20px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── TOP CONTROL BAR ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          background: '#ffffff',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
              }}
            >
              <Activity size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                Operational & Activity Statistics
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Live user sessions, production velocity, and workflow throughput
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Server Load Indicator */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              background: serverLoad.alert_level === 'danger'
                ? '#fee2e2'
                : serverLoad.alert_level === 'warning'
                ? '#fef3c7'
                : '#ecfdf5',
              color: serverLoad.alert_level === 'danger'
                ? '#dc2626'
                : serverLoad.alert_level === 'warning'
                ? '#d97706'
                : '#059669',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <Server size={14} />
            <span>
              {serverLoad.alert_level === 'danger'
                ? 'Server Under Heavy Load'
                : serverLoad.alert_level === 'warning'
                ? 'Server Active'
                : 'Server Normal'}
            </span>
          </div>

          {/* Time Range Selector */}
          <div
            style={{
              display: 'flex',
              background: '#f1f5f9',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              gap: '2px',
            }}
          >
            {[
              { id: 'hourly', label: '24 Hours' },
              { id: 'daily', label: '30 Days' },
              { id: 'weekly', label: '12 Weeks' },
              { id: 'monthly', label: '12 Months' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setRange(btn.id)}
                style={{
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: range === btn.id ? 700 : 500,
                  cursor: 'pointer',
                  background: range === btn.id ? '#ffffff' : 'transparent',
                  color: range === btn.id ? '#1e293b' : '#64748b',
                  boxShadow: range === btn.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchStats}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#334155',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── ROW 1: PRIMARY LIVE METRICS (5 CARDS) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
        }}
      >
        {/* Card 1: Live Active Online */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
              {loading ? '…' : (summary.current_active_users ?? 0)}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', margin: '6px 0 2px' }}>
              Live Active Users
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#22c55e',
                  boxShadow: '0 0 6px #22c55e',
                }}
              />
              <span>Online right now</span>
            </div>
          </div>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 8px rgba(99,102,241,0.25)',
            }}
          >
            <Users size={20} />
          </div>
        </div>

        {/* Card 2: Active Working vs Idle */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '26px', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>
                {loading ? '…' : (summary.live_working_users ?? 0)}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
                / {summary.live_idle_users ?? 0} Idle
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', margin: '6px 0 2px' }}>
              Live Working Users
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Zap size={11} style={{ color: '#eab308' }} />
              <span>Mutating cards or files</span>
            </div>
          </div>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 8px rgba(34,197,94,0.25)',
            }}
          >
            <Zap size={20} />
          </div>
        </div>

        {/* Card 3: Today's Peak Active */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
              {loading ? '…' : (summary.peak_active_users ?? summary.current_active_users ?? 0)}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', margin: '6px 0 2px' }}>
              Today's Peak Online
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <TrendingUp size={11} style={{ color: '#22c55e' }} />
              <span>Highest concurrent load</span>
            </div>
          </div>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 8px rgba(16,185,129,0.25)',
            }}
          >
            <TrendingUp size={20} />
          </div>
        </div>

        {/* Card 4: Busiest Interval */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              {loading ? '…' : (summary.busiest_interval || '10:00 - 12:00')}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', margin: '6px 0 2px' }}>
              Peak Traffic Interval
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={11} style={{ color: '#f59e0b' }} />
              <span>Highest-traffic 2h window</span>
            </div>
          </div>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 8px rgba(245,158,11,0.25)',
            }}
          >
            <Clock size={20} />
          </div>
        </div>

        {/* Card 5: Active Surfaces (Web / Mobile) */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              {summary.live_desktop_users ?? 0}{' '}
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Web</span> &nbsp;·&nbsp;{' '}
              {summary.live_mobile_users ?? 0}{' '}
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>App</span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', margin: '6px 0 2px' }}>
              Active Devices
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Smartphone size={11} style={{ color: '#06b6d4' }} />
              <span>Desktop & mobile devices</span>
            </div>
          </div>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 8px rgba(6,182,212,0.25)',
            }}
          >
            <Smartphone size={20} />
          </div>
        </div>
      </div>

      {/* ── ROW 2: USER SESSIONS & TRAFFIC LOAD OVER TIME CHART ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
              User Activity & Traffic Velocity ({range.toUpperCase()})
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Concurrent active users and session volume across the platform
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#10b981' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }} />
              Active Users Online
            </span>
          </div>
        </div>

        {/* Bar visualization */}
        {chartLabels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '13px' }}>
            No activity points recorded in this timeframe yet.
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '8px',
              height: '140px',
              paddingTop: '20px',
              overflowX: 'auto',
            }}
          >
            {chartLabels.map((lbl, idx) => {
              const usersVal = chartUsers[idx] || 0;
              const userH = Math.max(4, (usersVal / maxChartVal) * 110);

              return (
                <div
                  key={idx}
                  style={{
                    flex: '1 0 28px',
                    minWidth: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    height: '100%',
                    justifyContent: 'flex-end',
                  }}
                  title={`${lbl}: ${usersVal} active users`}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '110px', width: '100%' }}>
                    <div
                      style={{
                        width: '12px',
                        height: `${userH}px`,
                        background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#64748b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '40px',
                      textAlign: 'center',
                    }}
                  >
                    {lbl.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ROW 5: LIVE USERS ROSTER ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: '#ffffff',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
              Real-Time Active Users Roster ({filteredRoster.length})
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Staff, managers, and assistants active within the online heartbeat window
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Filter buttons */}
            <div
              style={{
                display: 'flex',
                background: '#f1f5f9',
                padding: '2px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
              }}
            >
              {[
                { id: 'all', label: 'All' },
                { id: 'admin', label: 'Admins & Staff' },
                { id: 'manager', label: 'Managers' },
                { id: 'assistant', label: 'Assistants' },
              ].map((rf) => (
                <button
                  key={rf.id}
                  onClick={() => setRosterRoleFilter(rf.id)}
                  style={{
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: rosterRoleFilter === rf.id ? 700 : 500,
                    cursor: 'pointer',
                    background: rosterRoleFilter === rf.id ? '#ffffff' : 'transparent',
                    color: rosterRoleFilter === rf.id ? '#0f172a' : '#64748b',
                    boxShadow: rosterRoleFilter === rf.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  {rf.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search active user..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                style={{
                  height: '30px',
                  paddingLeft: '30px',
                  paddingRight: '12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* Table of Live Users */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                <th style={{ padding: '10px 16px' }}>User Name</th>
                <th style={{ padding: '10px 16px' }}>Role</th>
                <th style={{ padding: '10px 16px' }}>Organisation / Scope</th>
                <th style={{ padding: '10px 16px' }}>Device</th>
                <th style={{ padding: '10px 16px' }}>Last Mutation / Activity</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '30px 16px', textAlign: 'center', color: '#64748b' }}>
                    No active users match the current filter.
                  </td>
                </tr>
              ) : (
                filteredRoster.map((u, i) => {
                  const isWorking = u.is_working || u.status === 'Active Working';
                  return (
                    <tr
                      key={u.user_id || i}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#0f172a' }}>
                        {u.name || u.username}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: u.role?.includes('admin') ? '#eff6ff' : u.role?.includes('manager') ? '#f5f3ff' : '#f0fdf4',
                            color: u.role?.includes('admin') ? '#1d4ed8' : u.role?.includes('manager') ? '#6d28d9' : '#15803d',
                            border: '1px solid rgba(0,0,0,0.06)',
                          }}
                        >
                          {u.role_display || u.role || 'User'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: '#475569' }}>
                        {u.org_name || 'System Wide'}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#64748b' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {u.device_type === 'mobile' ? <Smartphone size={12} /> : <Server size={12} />}
                          {u.device_type === 'mobile' ? 'Mobile App' : 'Web Browser'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: '#334155' }}>
                        {u.last_action || 'Browsing Dashboard'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: isWorking ? '#ecfdf5' : '#f1f5f9',
                            color: isWorking ? '#059669' : '#64748b',
                            border: isWorking ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: isWorking ? '#10b981' : '#94a3b8',
                            }}
                          />
                          {isWorking ? 'Working' : 'Idle / Open'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
