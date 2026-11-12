import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Users,
  DollarSign,
  TrendingUp,
  Building,
  CreditCard,
  Layers,
  Server,
  Clock,
  Sparkles,
  Smartphone,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { saasApi, statsApi } from '../../services/api';

export default function PrimeAdminStatisticsView({ addToast }) {
  const [range, setRange] = useState('hourly');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [rosterSearch, setRosterSearch] = useState('');

  const fetchPrimeStats = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, statsRes, subRes] = await Promise.allSettled([
        saasApi.getOverview(),
        statsApi.getStatisticsData(range),
        saasApi.getSubscriptions(),
      ]);

      if (ovRes.status === 'fulfilled' && ovRes.value?.overview) {
        setOverview(ovRes.value.overview);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setStatsData(statsRes.value);
      }
      if (subRes.status === 'fulfilled' && subRes.value) {
        setSubscriptions(subRes.value.subscriptions || subRes.value || []);
      }
    } catch (err) {
      console.error('Failed to load Prime Admin statistics:', err);
      addToast?.('Failed to load some platform statistics', 'error');
    } finally {
      setLoading(false);
    }
  }, [range, addToast]);

  useEffect(() => {
    fetchPrimeStats();
  }, [fetchPrimeStats]);

  const summary = statsData?.summary || {};
  const workSummary = statsData?.work_summary || {};
  const liveRoster = useMemo(() => {
    return Array.isArray(statsData?.live_users_roster) ? statsData.live_users_roster : [];
  }, [statsData?.live_users_roster]);
  const tierBreakdown = overview?.tier_breakdown || { lite: 0, pro: 0, max: 0 };
  const totalTenants = overview?.total_tenants ?? subscriptions.length;
  const activeTenants = overview?.active_tenants ?? subscriptions.filter((s) => s.status === 'active').length;
  const mrr = overview?.mrr ?? 0;
  const totalRevenue = overview?.total_revenue ?? 0;
  const totalCards = overview?.total_cards ?? workSummary.total_cards_ever ?? 0;
  const totalOrgs = overview?.total_organisations ?? 0;
  const totalTables = overview?.total_tables ?? 0;
  const totalStaff = (overview?.total_super_admins ?? 0) + (overview?.total_prime_operators ?? 0);

  // Filter roster
  const filteredRoster = useMemo(() => {
    if (!rosterSearch.trim()) return liveRoster;
    const q = rosterSearch.toLowerCase();
    return liveRoster.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.role_display || u.role || '').toLowerCase().includes(q) ||
        (u.org_name || '').toLowerCase().includes(q) ||
        (u.last_action || '').toLowerCase().includes(q)
    );
  }, [liveRoster, rosterSearch]);

  const chartLabels = Array.isArray(statsData?.labels) ? statsData.labels : [];
  const chartCards = Array.isArray(statsData?.cards_created) ? statsData.cards_created : [];
  const chartUsers = Array.isArray(statsData?.all_user_activity) ? statsData.all_user_activity : [];
  const maxChartVal = Math.max(1, ...chartCards, ...chartUsers);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
        overflowY: 'auto',
        background: '#ffffff',
        fontFamily: 'var(--font-family, system-ui, sans-serif)',
        padding: 0,
        margin: 0,
        gap: 0,
        boxSizing: 'border-box',
      }}
    >
      {/* ── TOP STICKY CONTROL SUB-BAR (MATCHES SAAS SUB-BAR) ── */}
      <div
        style={{
          height: '42px',
          minHeight: '42px',
          background: '#1e293b',
          color: '#ffffff',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #334155',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 35,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={15} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#ffffff' }}>
            Platform Global Analytics
          </span>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              padding: '1px 7px',
              borderRadius: '4px',
              background: '#0284c7',
              color: '#ffffff',
              marginLeft: '4px',
            }}
          >
            Prime Admin
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Health status */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
            <span>All Systems Operational</span>
          </div>

          {/* Time range selector tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {[
              { id: 'hourly', label: '24 Hours' },
              { id: 'daily', label: '30 Days' },
              { id: 'weekly', label: '12 Weeks' },
              { id: 'monthly', label: '12 Months' },
            ].map((btn) => {
              const isActive = range === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setRange(btn.id)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: isActive ? '#2563eb' : 'rgba(255, 255, 255, 0.08)',
                    color: isActive ? '#ffffff' : '#cbd5e1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchPrimeStats}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 9px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── ROW 1: CONTIGUOUS FINANCIAL & TENANT KPIS (DIVIDER-BASED) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0,
          background: '#ffffff',
          borderBottom: '1px solid #cbd5e1',
          flexShrink: 0,
        }}
      >
        {/* MRR */}
        <div
          style={{
            padding: '10px 16px',
            height: '66px',
            boxSizing: 'border-box',
            borderRight: '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.15 }}>
              ₹{Number(mrr).toLocaleString('en-IN')}{' '}
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>/ mo</span>
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155', marginTop: '3px' }}>
              Monthly Recurring Revenue
            </div>
            <div style={{ fontSize: '10.5px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
              <TrendingUp size={11} />
              <span>{activeTenants} active paying tenants</span>
            </div>
          </div>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              background: '#10b981',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <DollarSign size={18} />
          </div>
        </div>

        {/* Total Ledger Revenue */}
        <div
          style={{
            padding: '10px 16px',
            height: '66px',
            boxSizing: 'border-box',
            borderRight: '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.15 }}>
              ₹{Number(totalRevenue).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155', marginTop: '3px' }}>
              Total Ledger Revenue
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '1px' }}>
              All verified payment entries
            </div>
          </div>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              background: '#6366f1',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CreditCard size={18} />
          </div>
        </div>

        {/* Total Platform Tenants */}
        <div
          style={{
            padding: '10px 16px',
            height: '66px',
            boxSizing: 'border-box',
            borderRight: '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.15 }}>
              {totalTenants}{' '}
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#16a34a' }}>({activeTenants} Active)</span>
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155', marginTop: '3px' }}>
              Platform Tenants
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '1px' }}>
              {overview?.trial_tenants ?? 0} on free trial
            </div>
          </div>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              background: '#0284c7',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Building size={18} />
          </div>
        </div>

        {/* Client Super Admins */}
        <div
          style={{
            padding: '10px 16px',
            height: '66px',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.15 }}>
              {subscriptions.reduce((acc, s) => acc + (s.super_admins?.length || 1), 0) || totalTenants || 1}
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155', marginTop: '3px' }}>
              Client Super Admins
            </div>
            <div style={{ fontSize: '10.5px', color: '#16a34a', marginTop: '1px' }}>
              {activeTenants} active tenant accounts
            </div>
          </div>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              background: '#2563eb',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={18} />
          </div>
        </div>
      </div>

      {/* ── ROW 2: WORKLOAD FOOTPRINT STRIP (FLAT DIVIDERS) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0,
          background: '#f8fafc',
          borderBottom: '1px solid #cbd5e1',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '8px 16px', borderRight: '1px solid #cbd5e1' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Total Platform Cards</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>
            {totalCards.toLocaleString()}
          </div>
          <div style={{ fontSize: '10.5px', color: '#16a34a' }}>Across all tenant schools</div>
        </div>
        <div style={{ padding: '8px 16px', borderRight: '1px solid #cbd5e1' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Total Organisations</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>
            {totalOrgs}
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748b' }}>Institutions & companies</div>
        </div>
        <div style={{ padding: '8px 16px', borderRight: '1px solid #cbd5e1' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Card Tables & Groups</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>
            {totalTables}
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748b' }}>Active database tables</div>
        </div>
        <div style={{ padding: '8px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Platform Staff</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>
            {totalStaff}
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748b' }}>Admins & operators</div>
        </div>
      </div>

      {/* ── ROW 3: SUBSCRIPTION TIER DISTRIBUTION & CONCURRENT LOAD (2 FLUSH COLUMNS) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 0,
          borderBottom: '1px solid #cbd5e1',
          background: '#ffffff',
          flexShrink: 0,
        }}
      >
        {/* Tier Distribution Column */}
        <div style={{ borderRight: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              height: '36px',
              background: '#1e293b',
              color: '#ffffff',
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderBottom: '1px solid #334155',
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            <Layers size={13} style={{ color: '#38bdf8' }} /> Subscription Plan Distribution
          </div>
          <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div
              style={{
                height: '7px',
                borderRadius: '3px',
                overflow: 'hidden',
                display: 'flex',
                background: '#e2e8f0',
                marginBottom: '12px',
              }}
            >
              {totalTenants > 0 ? (
                <>
                  <div
                    style={{
                      width: `${((tierBreakdown.lite || 0) / totalTenants) * 100}%`,
                      background: '#94a3b8',
                    }}
                    title={`Lite: ${tierBreakdown.lite || 0}`}
                  />
                  <div
                    style={{
                      width: `${((tierBreakdown.pro || 0) / totalTenants) * 100}%`,
                      background: '#2563eb',
                    }}
                    title={`Pro: ${tierBreakdown.pro || 0}`}
                  />
                  <div
                    style={{
                      width: `${((tierBreakdown.max || 0) / totalTenants) * 100}%`,
                      background: '#8b5cf6',
                    }}
                    title={`Enterprise/Max: ${tierBreakdown.max || 0}`}
                  />
                </>
              ) : (
                <div style={{ width: '100%', background: '#cbd5e1' }} />
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, border: '1px solid #cbd5e1' }}>
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderRight: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Lite Plan</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#334155', marginTop: '2px' }}>
                  {tierBreakdown.lite || 0}
                </div>
              </div>
              <div style={{ padding: '8px 12px', background: '#eff6ff', borderRight: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8' }}>Pro Plan</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                  {tierBreakdown.pro || 0}
                </div>
              </div>
              <div style={{ padding: '8px 12px', background: '#faf5ff' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed' }}>Enterprise / Max</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#8b5cf6', marginTop: '2px' }}>
                  {tierBreakdown.max || 0}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Concurrent Load Column */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              height: '36px',
              background: '#1e293b',
              color: '#ffffff',
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderBottom: '1px solid #334155',
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            <Activity size={13} style={{ color: '#10b981' }} /> Live Platform Traffic & Surface Split
          </div>
          <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, border: '1px solid #cbd5e1' }}>
              <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRight: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803d' }}>Live Online</div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
                  {summary.current_active_users ?? 0}
                </div>
              </div>
              <div style={{ padding: '8px 12px', background: '#eff6ff', borderRight: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8' }}>Web Sessions</div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                  {summary.live_desktop_users ?? 0}
                </div>
              </div>
              <div style={{ padding: '8px 12px', background: '#ecfeff' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#0e7490' }}>Mobile App</div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#0891b2', marginTop: '2px' }}>
                  {summary.live_mobile_users ?? 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 4: ACTIVITY THROUGHPUT CHART (FLAT HEADER & BASELINE) ── */}
      <div style={{ borderBottom: '1px solid #cbd5e1', background: '#ffffff', flexShrink: 0 }}>
        <div
          style={{
            height: '36px',
            background: '#1e293b',
            color: '#ffffff',
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={13} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Platform Production Velocity ({range.toUpperCase()})
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11.5px', fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#7dd3fc' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#38bdf8' }} />
              Cards Created
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#6ee7b7' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }} />
              Active Users
            </span>
          </div>
        </div>

        <div style={{ padding: '16px 20px', background: '#ffffff' }}>
          {chartLabels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '12.5px' }}>
              No platform activity data points in this timeframe.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px',
                height: '130px',
                paddingTop: '16px',
                overflowX: 'auto',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              {chartLabels.map((lbl, idx) => {
                const cardsVal = chartCards[idx] || 0;
                const usersVal = chartUsers[idx] || 0;
                const cardH = Math.max(4, (cardsVal / maxChartVal) * 100);
                const userH = Math.max(4, (usersVal / maxChartVal) * 100);

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
                    title={`${lbl}: ${cardsVal} cards, ${usersVal} users`}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '100px' }}>
                      <div
                        style={{
                          width: '8px',
                          height: `${cardH}px`,
                          background: '#0284c7',
                          borderRadius: '2px 2px 0 0',
                          transition: 'height 0.25s ease',
                        }}
                      />
                      <div
                        style={{
                          width: '8px',
                          height: `${userH}px`,
                          background: '#10b981',
                          borderRadius: '2px 2px 0 0',
                          transition: 'height 0.25s ease',
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
                        maxWidth: '36px',
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
      </div>

      {/* ── ROW 5: LIVE PLATFORM USERS ROSTER (EDGE-TO-EDGE TABLE) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#ffffff' }}>
        <div
          style={{
            height: '38px',
            background: '#1e293b',
            color: '#ffffff',
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={14} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Platform Active Users Roster ({filteredRoster.length})
            </span>
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search user, tenant, role..."
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              style={{
                height: '24px',
                padding: '0 10px 0 24px',
                fontSize: '11.5px',
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#ffffff',
                borderRadius: '4px',
                width: '200px',
                fontFamily: 'var(--font-family)',
              }}
            />
            <Search size={11} style={{ position: 'absolute', left: '7px', color: '#94a3b8' }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowX: 'auto', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ height: '34px', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#334155', fontWeight: 700 }}>
                <th style={{ padding: '6px 14px', width: '22%' }}>User</th>
                <th style={{ padding: '6px 12px', width: '15%' }}>Role</th>
                <th style={{ padding: '6px 14px', width: '25%' }}>Tenant / Organisation</th>
                <th style={{ padding: '6px 12px', width: '15%' }}>Device</th>
                <th style={{ padding: '6px 14px', width: '13%' }}>Current Activity</th>
                <th style={{ padding: '6px 14px', textAlign: 'right', width: '10%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '36px 16px', textAlign: 'center', color: '#94a3b8' }}>
                    No active platform users found.
                  </td>
                </tr>
              ) : (
                filteredRoster.map((u, i) => {
                  const isWorking = u.is_working || u.status === 'Active Working';
                  return (
                    <tr
                      key={u.user_id || i}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        transition: 'background 0.15s ease',
                        height: '38px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '6px 14px', fontWeight: 700, color: '#0f172a' }}>
                        {u.name || u.username}
                      </td>
                      <td style={{ padding: '6px 12px' }}>
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#e0f2fe',
                            color: '#0369a1',
                            border: '1px solid #bae6fd',
                          }}
                        >
                          {u.role_display || u.role || 'User'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 14px', color: '#334155', fontWeight: 500 }}>
                        {u.org_name || 'Global SaaS'}
                      </td>
                      <td style={{ padding: '6px 12px', color: '#64748b' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {u.device_type === 'mobile' ? <Smartphone size={12} /> : <Server size={12} />}
                          {u.device_type === 'mobile' ? 'Mobile App' : 'Web Browser'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 14px', color: '#475569' }}>
                        {u.last_action || 'Online'}
                      </td>
                      <td style={{ padding: '6px 14px', textAlign: 'right' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: '3px',
                            background: isWorking ? '#ecfdf5' : '#f1f5f9',
                            color: isWorking ? '#059669' : '#64748b',
                            border: isWorking ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                          }}
                        >
                          <span
                            style={{
                              width: '5px',
                              height: '5px',
                              borderRadius: '50%',
                              background: isWorking ? '#10b981' : '#94a3b8',
                            }}
                          />
                          {isWorking ? 'Working' : 'Idle'}
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
