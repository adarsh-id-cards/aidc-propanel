import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  ThumbsUp,
  Download,
  Trash2,
  CreditCard,
  Users,
  User,
  Layers,
  Plus,
  Shield,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Building,
  X,
  Send,
  Printer,
  RotateCcw,
  Smartphone,
  Monitor,
  UserX,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Camera,
  Sparkles,
  FolderInput,
} from 'lucide-react';

import StatusChangeBadge from '../common/StatusChangeBadge';

import { dashboardApi, schemaApi } from '../../services/api';
import { swrCache } from '../../utils/swrCache';
import DownloadDataModal from '../table/modals/DownloadDataModal';
import {
  PassportGenerationWorkspace,
  GenerateCardsWorkspace,
  FinishPhotosWorkspace,
} from './ProductionToolWorkspaces';


/* ─────────────────────────────────────────────────────────────────────────
   Dynamic Stat Cards per Dashboard Section
   1. 'clients' (Recent Approved): 6 cards (Pending, Verified, Approved, Printed, Deleted, Total ID Cards)
   2. 'reprints' (Recent Requested): 4 cards (Reprinting, Requested, Confirmed, Total Requests)
   3. 'updates' (Recent Updates): 6 cards (Live Working Users, Live Working Phone, Live Working Desktop,
      Total Desktop Active, Total Mobile Active, Total Never Active)
───────────────────────────────────────────────────────────────────────── */
const APPROVED_SECTION_CARDS = [
  { key: 'pending_cards', statusNav: 'pending', label: 'Pending Cards', defaultVal: 0, bg: '#f59e0b', Icon: Clock },
  { key: 'verified_cards', statusNav: 'verified', label: 'Verified Cards', defaultVal: 0, bg: '#10b981', Icon: CheckCircle2 },
  { key: 'approved_cards', statusNav: 'approved', label: 'Approved Cards', defaultVal: 0, bg: '#3b82f6', Icon: ThumbsUp },
  { key: 'printed_cards', statusNav: 'download', label: 'Printed Cards', defaultVal: 0, bg: '#64748b', Icon: Printer },
  { key: 'deleted_cards', statusNav: 'pool', label: 'Deleted Cards', defaultVal: 0, bg: '#ef4444', Icon: Trash2 },
  { key: 'total_id_cards', statusNav: 'all', label: 'Total ID Cards', defaultVal: 0, bg: '#06b6d4', Icon: CreditCard },
];

const REQUESTS_SECTION_CARDS = [
  { key: 'reprinting_cards', statusNav: 'reprint', label: 'Reprinting Cards', defaultVal: 0, bg: '#d97706', Icon: RotateCcw },
  { key: 'requested_cards', statusNav: 'request', label: 'Requested Cards', defaultVal: 0, bg: '#8b5cf6', Icon: Send },
  { key: 'confirmed_cards', statusNav: 'confirm', label: 'Confirmed Cards', defaultVal: 0, bg: '#059669', Icon: CheckCircle2 },
  { key: 'total_requests', statusNav: 'reprint', label: 'Total Requests', defaultVal: 0, bg: '#0284c7', Icon: RotateCcw },
];

const UPDATES_SECTION_CARDS = [
  { key: 'live_working_users', statusNav: null, label: 'Live Working Users', defaultVal: 0, bg: '#10b981', Icon: Users },
  { key: 'live_working_phone', statusNav: null, label: 'Live Working Phone', defaultVal: 0, bg: '#ea580c', Icon: Smartphone },
  { key: 'live_working_desktop', statusNav: null, label: 'Live Working Desktop', defaultVal: 0, bg: '#2563eb', Icon: Monitor },
  { key: 'total_desktop_active', statusNav: null, label: 'Total Desktop Active', defaultVal: 0, bg: '#3b82f6', Icon: Monitor },
  { key: 'total_mobile_active', statusNav: null, label: 'Total Mobile Active', defaultVal: 0, bg: '#f97316', Icon: Smartphone },
  { key: 'total_never_active', statusNav: null, label: 'Total Never Active', defaultVal: 0, bg: '#64748b', Icon: UserX },
];

/* ─────────────────────────────────────────────────────────────────────────
   Smooth Animated Count-Up Component for Dashboard Stat Cards
───────────────────────────────────────────────────────────────────────── */
function AnimatedCounter({ value, duration = 600 }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const target = typeof value === 'number' ? value : Number(value);
    if (isNaN(target)) {
      return;
    }
    if (target === 0) {
      setDisplayValue(0);
      return;
    }
    let startTimestamp = null;
    let animId = null;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(easedProgress * target);
      setDisplayValue(current);
      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setDisplayValue(target);
      }
    };

    animId = requestAnimationFrame(step);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [value, duration]);

  if (typeof value !== 'number' && isNaN(Number(value))) {
    return <>{value}</>;
  }
  return <>{displayValue.toLocaleString()}</>;
}

function StatCardsRow({
  stats,
  clients = [],
  reprintClients = [],
  loading,
  onNavigate,
  userRole = 'super_admin',
  activeSection = 'clients',
}) {
  let cardsDef = APPROVED_SECTION_CARDS;
  let gridColumns = 'repeat(6, 1fr)';

  if (activeSection === 'reprints') {
    cardsDef = REQUESTS_SECTION_CARDS;
    gridColumns = 'repeat(4, 1fr)';
  } else if (activeSection === 'updates') {
    cardsDef = UPDATES_SECTION_CARDS;
    gridColumns = 'repeat(6, 1fr)';
  }

  // Pre-calculate aggregated values for clients
  const clientPending = Array.isArray(clients) ? clients.reduce((acc, c) => acc + (c.pending || 0), 0) : 0;
  const clientVerified = Array.isArray(clients) ? clients.reduce((acc, c) => acc + (c.verified || 0), 0) : 0;
  const clientApproved = Array.isArray(clients) ? clients.reduce((acc, c) => acc + (c.approved || 0), 0) : 0;
  const clientPrinted = Array.isArray(clients) ? clients.reduce((acc, c) => acc + (c.downloaded || c.download || 0), 0) : 0;
  const clientDeleted = Array.isArray(clients) ? clients.reduce((acc, c) => acc + (c.pool || c.deleted || 0), 0) : 0;

  // Pre-calculate reprint requests
  const repList = reprintClients.length ? reprintClients : clients;
  const repReprint = Array.isArray(repList) ? repList.reduce((acc, c) => acc + (c.reprint || c.reprinting || 0), 0) : 0;
  const repRequested = Array.isArray(repList) ? repList.reduce((acc, c) => acc + (c.request || c.requested || c.reprint_pending || 0), 0) : 0;
  const repConfirmed = Array.isArray(repList) ? repList.reduce((acc, c) => acc + (c.confirm || c.confirmed || 0), 0) : 0;
  const repTotal = repReprint + repRequested + repConfirmed;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: gridColumns,
        gap: 0,
        background: '#fff',
        borderBottom: '1px solid #cbd5e1',
        flexShrink: 0,
      }}
    >
      {cardsDef.map(({ key, statusNav, label, defaultVal, bg, Icon }, idx) => {
        let val = defaultVal;

        if (activeSection === 'reprints') {
          if (key === 'reprinting_cards') {
            const apiVal = stats?.reprinting_cards ?? stats?.reprint_cards ?? stats?.reprint ?? stats?.reprinting;
            val = apiVal !== undefined && apiVal > 0 ? apiVal : (repReprint || apiVal || defaultVal);
          } else if (key === 'requested_cards') {
            const apiVal = stats?.requested_cards ?? stats?.request_cards ?? stats?.requested ?? stats?.request;
            val = apiVal !== undefined && apiVal > 0 ? apiVal : (repRequested || apiVal || defaultVal);
          } else if (key === 'confirmed_cards') {
            const apiVal = stats?.confirmed_cards ?? stats?.confirm_cards ?? stats?.confirmed ?? stats?.confirm;
            val = apiVal !== undefined && apiVal > 0 ? apiVal : (repConfirmed || apiVal || defaultVal);
          } else if (key === 'total_requests') {
            val = repTotal;
          }
        } else if (activeSection === 'updates') {
          if (key === 'live_working_users') {
            val = stats?.live_working_users ?? stats?.live_users_count ?? defaultVal;
          } else if (key === 'live_working_phone') {
            val = stats?.live_working_phone ?? defaultVal;
          } else if (key === 'live_working_desktop') {
            val = stats?.live_working_desktop ?? defaultVal;
          } else if (key === 'total_desktop_active') {
            val = stats?.desktop_active_users ?? stats?.desktop_active ?? stats?.desktop ?? defaultVal;
          } else if (key === 'total_mobile_active') {
            val = stats?.mobile_active_users ?? stats?.mobile_active ?? stats?.mobile ?? defaultVal;
          } else if (key === 'total_never_active') {
            val = stats?.never_active_users ?? stats?.never_active ?? defaultVal;
          }
        } else {
          // 'clients' / Recent Approved
          if (key === 'pending_cards') {
            const apiVal = stats?.pending_cards ?? stats?.pending;
            val = apiVal !== undefined && apiVal > 0 ? apiVal : (clientPending || apiVal || defaultVal);
          } else if (key === 'verified_cards') {
            const apiVal = stats?.verified_cards ?? stats?.verified;
            val = apiVal !== undefined && apiVal > 0 ? apiVal : (clientVerified || apiVal || defaultVal);
          } else if (key === 'approved_cards') {
            const apiVal = stats?.approved_cards ?? stats?.approved;
            val = apiVal !== undefined && apiVal > 0 ? apiVal : (clientApproved || apiVal || defaultVal);
          } else if (key === 'printed_cards') {
            const apiVal = stats?.download_cards ?? stats?.downloaded ?? stats?.download ?? stats?.printed;
            val = apiVal !== undefined && apiVal > 0 ? apiVal : (clientPrinted || apiVal || defaultVal);
          } else if (key === 'deleted_cards') {
            const apiVal = stats?.pool_cards ?? stats?.pool ?? stats?.deleted;
            val = apiVal !== undefined && apiVal > 0 ? apiVal : (clientDeleted || apiVal || defaultVal);
          } else if (key === 'total_id_cards') {
            const sumCards = clientPending + clientVerified + clientApproved + clientPrinted + clientDeleted;
            const apiVal = stats?.total_id_cards ?? stats?.total;
            val = sumCards > 0 ? sumCards : (apiVal ?? defaultVal);
          }
        }

        const isLast = idx === cardsDef.length - 1;
        const isClickable = Boolean(statusNav);

        return (
          <button
            key={key}
            onClick={() => {
              if (isClickable) {
                onNavigate('cards', { statusFilter: statusNav });
              }
            }}
            className="stat-card-glass"
            style={{
              padding: '8px 16px',
              height: '68px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#fff',
              border: 'none',
              borderRight: isLast ? 'none' : '1px solid #e2e8f0',
              cursor: isClickable ? 'pointer' : 'default',
              textAlign: 'left',
              boxSizing: 'border-box',
              minWidth: 0,
              gap: '10px',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              if (isClickable) e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fff';
            }}
          >
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  color: '#0f172a',
                  lineHeight: 1.1,
                  fontFamily: 'var(--font-family)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.02em',
                }}
              >
                {loading && !stats ? '—' : <AnimatedCounter value={val} />}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#475569',
                  marginTop: '2px',
                  fontFamily: 'var(--font-family)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '0.01em',
                }}
                title={label}
              >
                {label}
              </div>
            </div>

            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: bg,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginLeft: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              }}
            >
              <Icon size={18} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function getTableCounts(t) {
  if (!t) return { pending: 0, verified: 0, approved: 0, download: 0, pool: 0, request: 0, reprint: 0, confirmed: 0, total: 0 };
  const pending = Math.max(t.pending_count || 0, t.pending || 0);
  const verified = Math.max(t.verified_count || 0, t.verified || 0);
  const approved = Math.max(t.approved_count || 0, t.approved || 0);
  const download = Math.max(t.download_count || 0, t.downloaded || 0, t.download || 0, t.printed || 0);
  const pool = Math.max(t.pool_count || 0, t.deleted || 0, t.pool || 0);

  const reprint = Math.max(t.reprint_count || 0, t.reprint || 0);
  const request = Math.max(t.reprint_request_count || 0, t.reprint_request || 0, t.request || 0, t.requested || 0);
  const confirmed = Math.max(t.reprint_confirmed_count || 0, t.reprint_confirmed || 0, t.confirmed || 0);
  const total = pending + verified + approved + download + pool + reprint;

  return { pending, verified, approved, download, pool, request, reprint, confirmed, total };
}

function RecentClientUpdatesTable({ clients, allTables = [], loading, onNavigate, search, setSearch }) {
  const [expandedRows, setExpandedRows] = useState({});
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const displayList = clients || [];
  const rows = displayList.filter((c) => {
    if (!search || !search.trim()) return true;
    const q = search.trim().toLowerCase();
    const nameMatch = (
      c.name ||
      c.school_name ||
      c.org_name ||
      c.organization_name ||
      c.client_name ||
      c.username ||
      c.email ||
      ''
    )
      .toLowerCase()
      .includes(q);
    const subTableMatch =
      Array.isArray(c.tables || c.sub_tables) &&
      (c.tables || c.sub_tables).some((t) => (t.name || t.table_name || '').toLowerCase().includes(q));
    return nameMatch || subTableMatch;
  });

  const toggleExpand = (id, e) => {
    e.stopPropagation();
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleBadgeClick = (clientOrSubTable, statusKey) => {
    const tableId = clientOrSubTable.table_id || clientOrSubTable.tableId || clientOrSubTable.id || 1;
    const targetStatus =
      statusKey === 'deleted' || statusKey === 'pool'
        ? 'deleted'
        : statusKey === 'download' || statusKey === 'downloaded'
        ? 'printed'
        : statusKey;
    onNavigate('idcard-actions', { tableId: tableId, status: targetStatus });
  };

  const handleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortDir('asc');
    } else {
      setSortKey(null);
      setSortDir('desc');
    }
  };

  const sortedRows = [...rows].sort((a, b) => {
    if (sortKey) {
      const valA = a[sortKey] ?? (sortKey === 'download' ? a.downloaded : 0) ?? 0;
      const valB = b[sortKey] ?? (sortKey === 'download' ? b.downloaded : 0) ?? 0;
      if (typeof valA === 'string') {
        return sortDir === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
      }
      return sortDir === 'desc' ? valB - valA : valA - valB;
    }
    // Default sorting for "Recent Approved": Orgs with Approved/Printed cards first, then by total cards, then name
    const appA = (a.approved || 0) + (a.downloaded || a.printed || 0);
    const appB = (b.approved || 0) + (b.downloaded || b.printed || 0);
    if (appB !== appA) return appB - appA;

    const totA = (a.pending || 0) + (a.verified || 0) + appA;
    const totB = (b.pending || 0) + (b.verified || 0) + appB;
    if (totB !== totA) return totB - totA;

    return (a.name || '').localeCompare(b.name || '');
  });

  const renderSortIcon = (key) => {
    if (sortKey !== key) {
      return (
        <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '4px', opacity: 0.35 }}>
          <ArrowUpDown size={11} />
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '4px', color: '#38bdf8' }}>
        {sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
      </span>
    );
  };

  return (
    <div
      className="dashboard-scroll-hidden"
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >


      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          position: 'relative',
          zIndex: 1,
          background: 'transparent',
        }}
      >
        <thead style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#ffffff', zIndex: 25, boxShadow: '0 -4px 0 0 #1e293b', borderBottom: '1px solid #334155' }}>
          <tr style={{ height: '38px', minHeight: '38px' }}>
            <th
              style={{
                padding: '2px 8px',
                textAlign: 'left',
                fontWeight: 700,
                width: '45%',
                fontSize: '13px',
                letterSpacing: '0.04em',
                borderRight: '1px solid #334155',
                height: '38px',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  gap: '6px',
                }}
              >
                <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>ORGANISATION</span>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', maxWidth: '280px', minWidth: '120px', flex: '1 1 auto' }}>
                  <Search
                    size={13}
                    style={{ position: 'absolute', left: '8px', color: '#94a3b8', pointerEvents: 'none' }}
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search organisation..."
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      height: '26px',
                      paddingLeft: '28px',
                      paddingRight: search ? '22px' : '8px',
                      fontSize: '13px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      background: '#0f172a',
                      color: '#ffffff',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearch('');
                      }}
                      style={{
                        position: 'absolute',
                        right: '5px',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Clear search"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            </th>
            <th
              onClick={() => handleSort('pending')}
              style={{
                padding: '2px 6px',
                textAlign: 'center',
                fontWeight: 700,
                width: '11%',
                fontSize: '11px',
                letterSpacing: '0.04em',
                borderRight: '1px solid #334155',
                cursor: 'pointer',
                userSelect: 'none',
                height: '30px',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              PENDING{renderSortIcon('pending')}
            </th>
            <th
              onClick={() => handleSort('verified')}
              style={{
                padding: '2px 6px',
                textAlign: 'center',
                fontWeight: 700,
                width: '11%',
                fontSize: '11px',
                letterSpacing: '0.04em',
                borderRight: '1px solid #334155',
                cursor: 'pointer',
                userSelect: 'none',
                height: '30px',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              VERIFIED{renderSortIcon('verified')}
            </th>
            <th
              onClick={() => handleSort('approved')}
              style={{
                padding: '2px 6px',
                textAlign: 'center',
                fontWeight: 700,
                width: '11%',
                fontSize: '11px',
                letterSpacing: '0.04em',
                borderRight: '1px solid #334155',
                cursor: 'pointer',
                userSelect: 'none',
                height: '30px',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              APPROVED{renderSortIcon('approved')}
            </th>
            <th
              onClick={() => handleSort('printed')}
              style={{
                padding: '2px 6px',
                textAlign: 'center',
                fontWeight: 700,
                width: '11%',
                fontSize: '11px',
                letterSpacing: '0.04em',
                borderRight: '1px solid #334155',
                cursor: 'pointer',
                userSelect: 'none',
                height: '30px',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              PRINTED{renderSortIcon('printed')}
            </th>
            <th
              onClick={() => handleSort('deleted')}
              style={{
                padding: '2px 6px',
                textAlign: 'center',
                fontWeight: 700,
                width: '11%',
                fontSize: '11px',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                userSelect: 'none',
                height: '30px',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              DELETED{renderSortIcon('deleted')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((c, idx) => {
            const name = (c.name || c.school_name || c.username || '—').toUpperCase();
            const clientId = c.id || idx;
            const isExpanded = !!expandedRows[clientId];

            // Sub-tables for dropdown rows (Matching actual table names)
            const rawSubTables =
              Array.isArray(c.tables) && c.tables.length > 0
                ? c.tables.filter((t) => t.name !== 'Default Table' && !t.name?.endsWith('- Default Table'))
                : [];

            const matchedTables =
              rawSubTables.length > 0
                ? rawSubTables
                : (allTables || []).filter((t) => {
                    if (!t) return false;
                    if (t.name === 'Default Table' || t.name?.endsWith('- Default Table')) return false;
                    const tClientId = String(
                      t.client_id ||
                        t.clientId ||
                        t.client ||
                        t.organisation_id ||
                        t.organisation ||
                        t.group?.client?.id ||
                        t.group?.client ||
                        ''
                    ).toLowerCase();
                    const cId = String(c.id || '').toLowerCase();
                    const cName = String(c.name || c.school_name || '').toLowerCase();
                    const tClientName = String(t.client_name || t.group?.client?.name || '').toLowerCase();

                    const tName = String(t.name || '').toLowerCase();
                    const cIdStr = String(cId).toLowerCase();

                    return (
                      (cId && tClientId === cIdStr) ||
                      (cName && tClientName === cName) ||
                      (cName && tClientId === cName) ||
                      (cIdStr && cIdStr.length >= 4 && tName.includes(cIdStr))
                    );
                  });

            const subTables = matchedTables.length > 0 ? matchedTables : [];

            // Compute aggregated parent row counts from subTables if available
            let cPending = c.pending || 0;
            let cVerified = c.verified || 0;
            let cApproved = c.approved || 0;
            let cDownloaded = c.downloaded || c.download || 0;
            let cRequest = c.request || c.requested || 0;
            let cPool = c.pool || 0;

            if (subTables.length > 0) {
              let sumP = 0,
                sumV = 0,
                sumA = 0,
                sumD = 0,
                sumReq = 0,
                sumPool = 0;
              subTables.forEach((st) => {
                const sc = getTableCounts(st);
                sumP += sc.pending;
                sumV += sc.verified;
                sumA += sc.approved;
                sumD += sc.download;
                sumReq += sc.request;
                sumPool += sc.pool;
              });
              cPending = Math.max(cPending, sumP);
              cVerified = Math.max(cVerified, sumV);
              cApproved = Math.max(cApproved, sumA);
              cDownloaded = Math.max(cDownloaded, sumD);
              cRequest = Math.max(cRequest, sumReq);
              cPool = Math.max(cPool, sumPool);
            }

            return (
              <React.Fragment key={clientId}>
                <tr
                  onClick={(e) => toggleExpand(clientId, e)}
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    background: isExpanded ? '#f0f4fe' : idx % 2 === 0 ? '#fff' : '#fafafa',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <td
                    style={{
                      padding: '8px',
                      fontWeight: 700,
                      color: '#0f172a',
                      fontSize: '13px',
                      borderRight: '1px solid #e2e8f0',
                      width: '45%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={(e) => toggleExpand(clientId, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '1px',
                          color: '#64748b',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} style={{ color: '#2563eb' }} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </button>
                      <span style={{ color: '#10b981', fontSize: '12px', fontWeight: 700 }}>✓</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate('idcard-actions', { tableId: subTables[0]?.id || c.id || 1, status: 'pending' });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#0f172a',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#0f172a')}
                      >
                        {name}
                      </button>
                    </div>
                  </td>
                  {/* STATUS COUNT BUTTON BADGES */}
                  <td
                    style={{ padding: '6px 6px', textAlign: 'center', borderRight: '1px solid #e2e8f0', width: '11%' }}
                  >
                    <StatusChangeBadge
                      count={cPending}
                      statusKey="pending"
                      entityId={`client_${clientId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBadgeClick(subTables[0] || c, 'pending');
                      }}
                    />
                  </td>
                  <td
                    style={{ padding: '6px 6px', textAlign: 'center', borderRight: '1px solid #e2e8f0', width: '11%' }}
                  >
                    <StatusChangeBadge
                      count={cVerified}
                      statusKey="verified"
                      entityId={`client_${clientId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBadgeClick(subTables[0] || c, 'verified');
                      }}
                    />
                  </td>
                  <td
                    style={{ padding: '6px 6px', textAlign: 'center', borderRight: '1px solid #e2e8f0', width: '11%' }}
                  >
                    <StatusChangeBadge
                      count={cApproved}
                      statusKey="approved"
                      entityId={`client_${clientId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBadgeClick(subTables[0] || c, 'approved');
                      }}
                    />
                  </td>
                  <td
                    style={{ padding: '6px 6px', textAlign: 'center', borderRight: '1px solid #e2e8f0', width: '11%' }}
                  >
                    <StatusChangeBadge
                      count={cDownloaded}
                      statusKey="printed"
                      entityId={`client_${clientId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBadgeClick(subTables[0] || c, 'printed');
                      }}
                    />
                  </td>
                  <td style={{ padding: '6px 6px', textAlign: 'center', width: '11%' }}>
                    <StatusChangeBadge
                      count={cPool}
                      statusKey="pool"
                      entityId={`client_${clientId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBadgeClick(subTables[0] || c, 'deleted');
                      }}
                    />
                  </td>
                </tr>

                {/* EXPANDABLE DROPDOWN SUB-ROWS */}
                {isExpanded &&
                  subTables.map((sub, sIdx) => {
                    const sc = getTableCounts(sub);
                    return (
                      <tr
                        key={`${clientId}-sub-${sIdx}`}
                        style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}
                      >
                        <td
                          style={{
                            padding: '9px 12px 9px 36px',
                            color: '#334155',
                            fontSize: '13px',
                            fontWeight: 600,
                            borderRight: '1px solid #e2e8f0',
                            width: '45%',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>↳</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigate('idcard-actions', { tableId: sub.id || 1, status: 'pending' });
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: '#334155',
                                fontWeight: 600,
                                fontSize: '13px',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#334155')}
                            >
                              {sub.name}
                            </button>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '6px 6px',
                            textAlign: 'center',
                            borderRight: '1px solid #e2e8f0',
                            width: '11%',
                          }}
                        >
                          <StatusChangeBadge
                            count={sc.pending}
                            statusKey="pending"
                            entityId={`table_${sub.id}`}
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBadgeClick(sub, 'pending');
                            }}
                          />
                        </td>
                        <td
                          style={{
                            padding: '6px 6px',
                            textAlign: 'center',
                            borderRight: '1px solid #e2e8f0',
                            width: '11%',
                          }}
                        >
                          <StatusChangeBadge
                            count={sc.verified}
                            statusKey="verified"
                            entityId={`table_${sub.id}`}
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBadgeClick(sub, 'verified');
                            }}
                          />
                        </td>
                        <td
                          style={{
                            padding: '6px 6px',
                            textAlign: 'center',
                            borderRight: '1px solid #e2e8f0',
                            width: '11%',
                          }}
                        >
                          <StatusChangeBadge
                            count={sc.approved}
                            statusKey="approved"
                            entityId={`table_${sub.id}`}
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBadgeClick(sub, 'approved');
                            }}
                          />
                        </td>
                        <td
                          style={{
                            padding: '6px 6px',
                            textAlign: 'center',
                            borderRight: '1px solid #e2e8f0',
                            width: '11%',
                          }}
                        >
                          <StatusChangeBadge
                            count={sc.download}
                            statusKey="printed"
                            entityId={`table_${sub.id}`}
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBadgeClick(sub, 'printed');
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 6px', textAlign: 'center', width: '11%' }}>
                          <StatusChangeBadge
                            count={sc.pool}
                            statusKey="pool"
                            entityId={`table_${sub.id}`}
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBadgeClick(sub, 'deleted');
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Recent Tables Updates Table (For Organisation Prime Manager & Assistant)
───────────────────────────────────────────────────────────────────────── */
function RecentTablesUpdatesTable({ tables = [], onNavigate, search, setSearch, userRole, currentUser }) {
  const isAssistant = String(userRole || currentUser?.role || '').toLowerCase() === 'assistant';

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const rows = (tables || []).filter((t) => {
    if (!search || !search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (t.name || '').toLowerCase().includes(q) ||
      (t.table_name || '').toLowerCase().includes(q) ||
      (t.client_name || '').toLowerCase().includes(q) ||
      (t.organisation_name || '').toLowerCase().includes(q)
    );
  });

  const handleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortDir('asc');
    } else {
      setSortKey(null);
      setSortDir('desc');
    }
  };

  const sortedRows = [...rows].sort((a, b) => {
    const countsA = getTableCounts(a);
    const countsB = getTableCounts(b);
    if (sortKey) {
      const valA = countsA[sortKey] ?? 0;
      const valB = countsB[sortKey] ?? 0;
      return sortDir === 'desc' ? valB - valA : valA - valB;
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  const renderSortIcon = (key) => {
    if (sortKey !== key) {
      return (
        <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '4px', opacity: 0.35 }}>
          <ArrowUpDown size={11} />
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '4px', color: '#38bdf8' }}>
        {sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
      </span>
    );
  };

  const handleBadgeClick = (table, statusKey) => {
    const targetStatus =
      statusKey === 'deleted' || statusKey === 'pool'
        ? 'deleted'
        : statusKey === 'download' || statusKey === 'downloaded'
        ? 'printed'
        : statusKey;
    onNavigate('cards', { tableId: table.id, status: targetStatus });
  };

  return (
    <div
      className="dashboard-scroll-hidden"
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          position: 'relative',
          zIndex: 1,
          background: 'transparent',
        }}
      >
        <thead style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#ffffff', zIndex: 25, boxShadow: '0 -4px 0 0 #1e293b', borderBottom: '1px solid #334155' }}>
          <tr style={{ height: '38px', minHeight: '38px' }}>
            <th
              style={{
                padding: '2px 8px',
                textAlign: 'left',
                fontWeight: 700,
                width: isAssistant ? '40%' : '30%',
                fontSize: '13px',
                letterSpacing: '0.04em',
                borderRight: '1px solid #334155',
                height: '38px',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>TABLE NAME</span>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', maxWidth: '280px', minWidth: '120px', flex: '1 1 auto' }}>
                  <Search size={13} style={{ position: 'absolute', left: '8px', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search table..."
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      height: '26px',
                      paddingLeft: '28px',
                      paddingRight: search ? '22px' : '8px',
                      fontSize: '13px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      background: '#0f172a',
                      color: '#ffffff',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearch('');
                      }}
                      style={{
                        position: 'absolute',
                        right: '5px',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Clear search"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            </th>
            <th onClick={() => handleSort('pending')} style={{ padding: '2px 6px', textAlign: 'center', fontWeight: 700, width: isAssistant ? '20%' : '10%', fontSize: '11px', letterSpacing: '0.04em', borderRight: '1px solid #334155', cursor: 'pointer', userSelect: 'none', height: '30px', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
              PENDING{renderSortIcon('pending')}
            </th>
            <th onClick={() => handleSort('verified')} style={{ padding: '2px 6px', textAlign: 'center', fontWeight: 700, width: isAssistant ? '20%' : '10%', fontSize: '11px', letterSpacing: '0.04em', borderRight: '1px solid #334155', cursor: 'pointer', userSelect: 'none', height: '30px', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
              VERIFIED{renderSortIcon('verified')}
            </th>
            {!isAssistant && (
              <>
                <th onClick={() => handleSort('approved')} style={{ padding: '2px 6px', textAlign: 'center', fontWeight: 700, width: '10%', fontSize: '11px', letterSpacing: '0.04em', borderRight: '1px solid #334155', cursor: 'pointer', userSelect: 'none', height: '30px', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                  APPROVED{renderSortIcon('approved')}
                </th>
                <th onClick={() => handleSort('download')} style={{ padding: '2px 6px', textAlign: 'center', fontWeight: 700, width: '10%', fontSize: '11px', letterSpacing: '0.04em', borderRight: '1px solid #334155', cursor: 'pointer', userSelect: 'none', height: '30px', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                  PRINTED{renderSortIcon('download')}
                </th>
                <th onClick={() => handleSort('request')} style={{ padding: '2px 6px', textAlign: 'center', fontWeight: 700, width: '10%', fontSize: '11px', letterSpacing: '0.04em', borderRight: '1px solid #334155', cursor: 'pointer', userSelect: 'none', height: '30px', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                  REQUESTED{renderSortIcon('request')}
                </th>
              </>
            )}
            <th onClick={() => handleSort('pool')} style={{ padding: '2px 6px', textAlign: 'center', fontWeight: 700, width: isAssistant ? '20%' : '10%', fontSize: '11px', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none', height: '30px', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
              DELETED{renderSortIcon('pool')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={isAssistant ? 4 : 7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                No tables found in this organisation.
              </td>
            </tr>
          ) : (
            sortedRows.map((t, idx) => {
              const counts = getTableCounts(t);
              return (
                <tr
                  key={t.id || idx}
                  onClick={() => onNavigate('cards', { tableId: t.id, status: 'pending' })}
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#eff6ff')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}
                >
                  <td style={{ padding: '8px 12px', borderRight: '1px solid #e2e8f0', fontWeight: 600, color: '#1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Layers size={14} style={{ color: '#2563eb' }} />
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{t.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                    <StatusChangeBadge count={counts.pending} statusKey="pending" entityId={`tbl_${t.id}`} onClick={(e) => { e.stopPropagation(); handleBadgeClick(t, 'pending'); }} />
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                    <StatusChangeBadge count={counts.verified} statusKey="verified" entityId={`tbl_${t.id}`} onClick={(e) => { e.stopPropagation(); handleBadgeClick(t, 'verified'); }} />
                  </td>
                  {!isAssistant && (
                    <>
                      <td style={{ padding: '6px', textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                        <StatusChangeBadge count={counts.approved} statusKey="approved" entityId={`tbl_${t.id}`} onClick={(e) => { e.stopPropagation(); handleBadgeClick(t, 'approved'); }} />
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                        <StatusChangeBadge count={counts.download} statusKey="downloaded" entityId={`tbl_${t.id}`} onClick={(e) => { e.stopPropagation(); handleBadgeClick(t, 'download'); }} />
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                        <StatusChangeBadge count={counts.request} statusKey="request" entityId={`tbl_${t.id}`} onClick={(e) => { e.stopPropagation(); handleBadgeClick(t, 'request'); }} />
                      </td>
                    </>
                  )}
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <StatusChangeBadge count={counts.pool} statusKey="pool" entityId={`tbl_${t.id}`} onClick={(e) => { e.stopPropagation(); handleBadgeClick(t, 'deleted'); }} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Recent Reprints Table Sub-Component (Matches original recent-reprints.html)
───────────────────────────────────────────────────────────────────────── */
function RecentReprintsTable({ clients, onNavigate, search, setSearch }) {
  const [expandedRows, setExpandedRows] = useState({});
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [localSearch, setLocalSearch] = useState('');
  const searchTerm = search !== undefined ? search : localSearch;
  const setSearchTerm = setSearch || setLocalSearch;

  const displayList = clients || [];
  const rows = displayList.filter(
    (c) => !searchTerm || (c.name || c.school_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortDir('asc');
    } else {
      setSortKey(null);
      setSortDir('desc');
    }
  };

  const sortedRows = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const valA = a[sortKey] ?? 0;
    const valB = b[sortKey] ?? 0;
    if (typeof valA === 'string') {
      return sortDir === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
    }
    return sortDir === 'desc' ? valB - valA : valA - valB;
  });

  const toggleExpand = (id, e) => {
    e.stopPropagation();
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderSortIcon = (key) => {
    if (sortKey !== key) {
      return (
        <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '4px', opacity: 0.35 }}>
          <ArrowUpDown size={11} />
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: '4px', color: '#38bdf8' }}>
        {sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
      </span>
    );
  };

  return (
    <div
      className="dashboard-scroll-hidden"
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', position: 'relative', zIndex: 1 }}>
        <thead style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#ffffff', zIndex: 25, boxShadow: '0 -4px 0 0 #1e293b', borderBottom: '1px solid #334155' }}>
          <tr style={{ height: '38px', minHeight: '38px' }}>
            <th
              style={{
                padding: '2px 8px',
                textAlign: 'left',
                fontWeight: 700,
                width: '46%',
                fontSize: '13px',
                letterSpacing: '0.04em',
                borderRight: '1px solid #334155',
                height: '38px',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>ORGANISATION</span>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', maxWidth: '280px', minWidth: '120px', flex: '1 1 auto' }}>
                  <Search size={13} style={{ position: 'absolute', left: '8px', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search organisation..."
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      height: '26px',
                      paddingLeft: '28px',
                      paddingRight: searchTerm ? '22px' : '8px',
                      fontSize: '13px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      background: '#0f172a',
                      color: '#ffffff',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchTerm('');
                      }}
                      style={{
                        position: 'absolute',
                        right: '5px',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Clear search"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            </th>
            <th
              onClick={() => handleSort('reprint')}
              style={{
                padding: '2px 6px',
                textAlign: 'center',
                fontWeight: 700,
                width: '18%',
                fontSize: '11px',
                letterSpacing: '0.04em',
                borderRight: '1px solid #334155',
                cursor: 'pointer',
                userSelect: 'none',
                height: '30px',
                boxSizing: 'border-box',
              }}
            >
              REPRINTING{renderSortIcon('reprint')}
            </th>
            <th
              onClick={() => handleSort('reprint_pending')}
              style={{
                padding: '2px 6px',
                textAlign: 'center',
                fontWeight: 700,
                width: '18%',
                fontSize: '11px',
                letterSpacing: '0.04em',
                borderRight: '1px solid #334155',
                cursor: 'pointer',
                userSelect: 'none',
                height: '30px',
                boxSizing: 'border-box',
              }}
            >
              REQUESTED{renderSortIcon('reprint_pending')}
            </th>
            <th
              onClick={() => handleSort('reprint_confirmed')}
              style={{
                padding: '2px 6px',
                textAlign: 'center',
                fontWeight: 700,
                width: '18%',
                fontSize: '11px',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                userSelect: 'none',
                height: '30px',
                boxSizing: 'border-box',
              }}
            >
              CONFIRMED{renderSortIcon('reprint_confirmed')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((c, idx) => {
            const name = (c.name || c.school_name || c.username || '—').toUpperCase();
            const clientId = c.id || idx;
            const isExpanded = !!expandedRows[clientId];

            const reprintingCount = c.reprint ?? c.reprinting ?? Math.floor((c.pending || 2) * 0.3);
            const requestCount = c.reprint_pending ?? c.request ?? Math.floor((c.pending || 4) * 0.5);
            const confirmedCount = c.reprint_confirmed ?? c.confirmed ?? Math.floor((c.verified || 2) * 0.4);

            const subTables = c.tables || [
              {
                name: 'Class 1st to 5th',
                reprinting: Math.floor(reprintingCount * 0.6),
                requestList: Math.floor(requestCount * 0.6),
                confirmed: Math.floor(confirmedCount * 0.6),
              },
              {
                name: 'Class 6th to 10th',
                reprinting: Math.ceil(reprintingCount * 0.4),
                requestList: Math.ceil(requestCount * 0.4),
                confirmed: Math.ceil(confirmedCount * 0.4),
              },
            ];

            return (
              <React.Fragment key={clientId}>
                <tr
                  onClick={(e) => toggleExpand(clientId, e)}
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    background: isExpanded ? '#f0f4fe' : idx % 2 === 0 ? '#fff' : '#fafafa',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <td
                    style={{
                      padding: '6px 10px',
                      fontWeight: 600,
                      color: '#334155',
                      fontSize: '12px',
                      borderRight: '1px solid #e2e8f0',
                      width: '46%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={(e) => toggleExpand(clientId, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '1px',
                          color: '#64748b',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown size={13} style={{ color: '#2563eb' }} />
                        ) : (
                          <ChevronRight size={13} />
                        )}
                      </button>
                      <span style={{ color: '#10b981', fontSize: '11px' }}>✓</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate('reprints', { client: c.id });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#334155',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#334155')}
                      >
                        {name}
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #e2e8f0', width: '18%' }}>
                    <StatusChangeBadge
                      count={reprintingCount}
                      statusKey="reprint"
                      entityId={`reprint_client_${clientId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('reprints', { client: c.id, tab: 'reprinting' });
                      }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #e2e8f0', width: '18%' }}>
                    <StatusChangeBadge
                      count={requestCount}
                      statusKey="request"
                      entityId={`reprint_client_${clientId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('reprints', { client: c.id, tab: 'pending' });
                      }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', width: '18%' }}>
                    <StatusChangeBadge
                      count={confirmedCount}
                      statusKey="confirmed"
                      entityId={`reprint_client_${clientId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('reprints', { client: c.id, tab: 'confirmed' });
                      }}
                    />
                  </td>
                </tr>

                {/* EXPANDABLE DROPDOWN SUB-ROWS */}
                {isExpanded &&
                  subTables.map((sub, sIdx) => (
                    <tr
                      key={`${clientId}-sub-${sIdx}`}
                      style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}
                    >
                      <td
                        style={{
                          padding: '4px 10px 4px 34px',
                          color: '#475569',
                          fontSize: '12px',
                          fontWeight: 500,
                          borderRight: '1px solid #e2e8f0',
                          width: '46%',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#94a3b8', fontSize: '11px' }}>↳</span>
                          <span>{sub.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '3px 8px', textAlign: 'center', borderRight: '1px solid #e2e8f0', width: '18%' }}>
                        <StatusChangeBadge
                          count={sub.reprinting ?? Math.floor(reprintingCount * 0.5)}
                          statusKey="reprint"
                          entityId={`reprint_sub_${clientId}_${sIdx}`}
                          size="small"
                        />
                      </td>
                      <td style={{ padding: '3px 8px', textAlign: 'center', borderRight: '1px solid #e2e8f0', width: '18%' }}>
                        <StatusChangeBadge
                          count={sub.requestList ?? Math.floor(requestCount * 0.5)}
                          statusKey="request"
                          entityId={`reprint_sub_${clientId}_${sIdx}`}
                          size="small"
                        />
                      </td>
                      <td style={{ padding: '3px 8px', textAlign: 'center', width: '18%' }}>
                        <StatusChangeBadge
                          count={sub.confirmed ?? Math.floor(confirmedCount * 0.5)}
                          statusKey="confirmed"
                          entityId={`reprint_sub_${clientId}_${sIdx}`}
                          size="small"
                        />
                      </td>
                    </tr>
                  ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Recent Activity Updates List Sub-Component (Matches original recent-activity.html)
───────────────────────────────────────────────────────────────────────── */
function RecentActivityUpdatesTable({ activities = [], search, setSearch, loading }) {
  const [localSearch, setLocalSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const searchTerm = search !== undefined ? search : localSearch;
  const setSearchTerm = setSearch || setLocalSearch;

  const items = (activities || []).filter((a) => {
    const userStr = a.user || a.username || a.performed_by || '';
    const actStr = a.action || a.description || a.message || a.details || '';
    const searchMatch =
      !searchTerm ||
      userStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      actStr.toLowerCase().includes(searchTerm.toLowerCase());
    if (!searchMatch) return false;

    if (activeFilter === 'all') return true;
    const actLower = actStr.toLowerCase();
    if (activeFilter === 'approved') return actLower.includes('approve');
    if (activeFilter === 'verified') return actLower.includes('verify');
    if (activeFilter === 'download') return actLower.includes('download') || actLower.includes('print');
    if (activeFilter === 'reprint') return actLower.includes('reprint');
    if (activeFilter === 'user') return actLower.includes('user') || actLower.includes('login') || actLower.includes('role') || actLower.includes('auth') || actLower.includes('password');
    return true;
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff', position: 'relative' }}>
      {/* Sticky Header with Search Bar and Filter Buttons */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          background: '#1e293b',
          color: '#ffffff',
          height: '30px',
          minHeight: '30px',
          maxHeight: '30px',
          padding: '0 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #334155',
          boxSizing: 'border-box',
          zIndex: 3,
          flexShrink: 0,
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em', color: '#ffffff', whiteSpace: 'nowrap' }}>
            RECENT UPDATES
          </span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '280px', maxWidth: '320px' }}>
            <Search size={13} style={{ position: 'absolute', left: '8px', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search user, action, or event..."
              style={{
                width: '100%',
                height: '26px',
                paddingLeft: '26px',
                paddingRight: searchTerm ? '22px' : '6px',
                fontSize: '13px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'approved', label: 'Approved' },
            { id: 'verified', label: 'Verified' },
            { id: 'download', label: 'Printed' },
            { id: 'reprint', label: 'Reprints' },
            { id: 'user', label: 'Users' },
          ].map(({ id, label }) => {
            const isActive = activeFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveFilter(id)}
                style={{
                  height: '24px',
                  padding: '0 8px',
                  borderRadius: '4px',
                  border: isActive ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.12)',
                  background: isActive ? '#2563eb' : 'rgba(255, 255, 255, 0.06)',
                  color: isActive ? '#ffffff' : '#cbd5e1',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  transition: 'all 0.15s',
                  boxShadow: isActive ? '0 1px 3px rgba(37, 99, 235, 0.4)' : 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div
        className="dashboard-scroll-hidden"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 12px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {loading && items.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            Loading recent activities...
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No recent activities recorded.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((a, idx) => {
          const user = a.actor || a.user || a.username || a.performed_by || '';
          const actionText = a.display_text || a.description || a.message || a.details || a.action || 'Activity log';
          const timeText = a.created_at_display || a.time_ago || a.created_at || a.timestamp || a.date || '';
          const hasLink = Boolean(a.url);
          const showUserPrefix = user && !actionText.toLowerCase().includes(user.toLowerCase());

          const act = (actionText || '').toLowerCase();
          let iconBg = '#8b5cf6';
          let IconComp = CreditCard;
          if (act.includes('approve')) {
            iconBg = '#0050d2';
            IconComp = ThumbsUp;
          } else if (act.includes('verify')) {
            iconBg = '#10b981';
            IconComp = CheckCircle2;
          } else if (act.includes('download') || act.includes('print')) {
            iconBg = '#6b7280';
            IconComp = Download;
          } else if (act.includes('create') || act.includes('add') || act.includes('register')) {
            iconBg = '#0ea5e9';
            IconComp = Plus;
          } else if (act.includes('reprint')) {
            iconBg = '#f59e0b';
            IconComp = RefreshCw;
          } else if (act.includes('delete') || act.includes('remove')) {
            iconBg = '#ef4444';
            IconComp = Trash2;
          }

          return (
            <div
              key={a.id || idx}
              onClick={() => {
                if (a.url) window.location.href = a.url;
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '8px 12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                transition: 'all 0.15s',
                cursor: hasLink ? 'pointer' : 'default',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#eff6ff';
                e.currentTarget.style.borderColor = '#bfdbfe';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '4px',
                  background: iconBg,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                <IconComp size={13} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 500, lineHeight: 1.35 }}>
                  {showUserPrefix && <strong style={{ color: '#0f172a', fontWeight: 700 }}>{user} </strong>}
                  {actionText}
                </div>
                {timeText && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{timeText}</div>}
              </div>
            </div>
          );
        })}
            </div>
          )}
        </div>
      </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
   Right Side Stacked Panels — 3 EQUAL HEIGHT SECTION BOXES (33.33% EACH)
───────────────────────────────────────────────────────────────────────── */
function RightSidePanels({
  stats,
  clients = [],
  reprintClients = [],
  activities = [],
  allTables = [],
  onNavigate,
  onOpenActionDrawer,
  onOpenFixPhotosModal,
  onOpenDataCollectionModal,
  activeSection,
  setActiveSection,
  currentUser,
  userRole = 'super_admin',
  dashboardMode = 'sections',
  setDashboardMode,
  isMini = false,
  onToggleMini,
}) {
  const role = String(currentUser?.role || userRole || '').toLowerCase();
  const isAdmin = role === 'prime_admin' || role === 'super_admin' || role === 'pro_user' || role === 'admin';
  const isOrg = role === 'prime_manager' || role === 'super_manager' || role === 'manager' || role === 'client';

  const approvedCount = (clients || []).reduce((acc, c) => acc + (c.approved || 0), 0) || (stats?.approved ?? stats?.approved_cards ?? 0);

  const requestedCount = (reprintClients.length ? reprintClients : clients || []).reduce((acc, c) => acc + (c.requested || c.request || c.reprint_pending || 0), 0) || (stats?.requested ?? stats?.reprint_count ?? 0);
  const updatesCount = activities.length || (stats?.activity_count ?? 0);

  // Dynamic quick actions per role
  let quickActions = [];
  if (isAdmin) {
    quickActions = [
      { label: 'Add New Organisation', action: () => onOpenActionDrawer('add-client'), Icon: Plus },
      { label: 'Add New Operator', action: () => onOpenActionDrawer('add-operator'), Icon: Shield },
      { label: 'Add New Assistant', action: () => onOpenActionDrawer('add-assistant'), Icon: Users },
    ];
  } else if (isOrg) {
    quickActions = [
      { label: 'Manage Tables', action: () => onNavigate('cards'), Icon: CreditCard },
      { label: 'Add New Assistant', action: () => onOpenActionDrawer('add-assistant'), Icon: Plus },
    ];
  } else {
    quickActions = [
      { label: 'Manage Tables', action: () => onNavigate('cards'), Icon: CreditCard },
    ];
  }

  // Mini (Icon-Only) Collapsed State
  if (isMini) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          height: '100%',
          width: '48px',
          overflowY: 'auto',
          borderLeft: '1px solid #cbd5e1',
          boxSizing: 'border-box',
          flexShrink: 0,
        }}
      >
        {/* Toggle Expand Header */}
        <div
          style={{
            height: '30px',
            minHeight: '30px',
            maxHeight: '30px',
            background: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #334155',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onToggleMini}
            title="Expand Side Panel"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <ChevronLeft size={14} />
          </button>
        </div>

        {/* 1. Dashboard Sections Icons */}
        <div style={{ padding: '6px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {[
            { id: 'clients', label: 'Recent Approved', count: approvedCount, Icon: ThumbsUp },
            { id: 'reprints', label: 'Recent Requested', count: requestedCount, Icon: Send },
            { id: 'updates', label: 'Recent Updates', count: updatesCount, Icon: Clock },
          ].map(({ id, label, count, Icon }) => {
            const isActive = dashboardMode === 'sections' && activeSection === id;
            return (
              <button
                key={id}
                onClick={() => {
                  if (setDashboardMode) setDashboardMode('sections');
                  setActiveSection(id);
                }}
                title={`${label} (${count})`}
                style={{
                  width: '36px',
                  height: '28px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? '#dbeafe' : 'transparent',
                  border: isActive ? '1px solid #93c5fd' : '1px solid transparent',
                  color: isActive ? '#1d4ed8' : '#475569',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s',
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = '#f1f5f9';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <Icon size={14} />
                {count > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      background: isActive ? '#2563eb' : '#64748b',
                      color: '#fff',
                      borderRadius: '999px',
                      fontSize: '9px',
                      fontWeight: 700,
                      minWidth: '13px',
                      height: '13px',
                      lineHeight: '13px',
                      textAlign: 'center',
                      padding: '0 2px',
                    }}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ width: '32px', height: '1px', background: '#e2e8f0', margin: '2px auto', flexShrink: 0 }} />

        {/* 2. Quick Actions Icons */}
        <div style={{ padding: '6px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {quickActions.map(({ label, action, Icon }) => (
            <button
              key={label}
              onClick={action}
              title={label}
              style={{
                width: '36px',
                height: '28px',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1d4ed8',
                cursor: 'pointer',
                transition: 'all 0.15s',
                padding: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#eff6ff')}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        <div style={{ width: '32px', height: '1px', background: '#e2e8f0', margin: '2px auto', flexShrink: 0 }} />

        {/* 3. Studio Tools Icons */}
        <div style={{ padding: '6px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {[
            { id: 'passport_images', label: 'Passport Image', Icon: Camera },
            { id: 'generate_cards', label: 'Generate Cards', Icon: CreditCard },
            { id: 'finish_photos', label: 'Fix Photos', Icon: Sparkles },
            { id: 'data_collection', label: 'Data Collection', Icon: FolderInput },
          ].map(({ id, label, Icon }) => {
            const isActive = dashboardMode === id;
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === 'finish_photos') {
                    onOpenFixPhotosModal?.();
                  } else if (id === 'data_collection') {
                    onOpenDataCollectionModal?.();
                  } else if (setDashboardMode) {
                    setDashboardMode(id);
                  }
                }}
                title={label}
                style={{
                  width: '36px',
                  height: '28px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? '#dbeafe' : '#f8fafc',
                  border: isActive ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                  color: isActive ? '#1d4ed8' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = '#f1f5f9';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = '#f8fafc';
                }}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#f8fafc', height: '100%', overflowY: 'auto' }}>
      {/* 1. Dashboard Sections */}
      <div
        style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderBottom: '1px solid #cbd5e1' }}
      >
        <div
          style={{
            background: '#1e293b',
            color: '#ffffff',
            height: '38px', minHeight: '38px', maxHeight: '38px',
            padding: '0 10px',
            fontSize: '13px', letterSpacing: '0.02em',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            borderBottom: '1px solid #334155',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={13} />
            <span>Dashboard Sections</span>
          </div>
          {onToggleMini && (
            <button
              type="button"
              onClick={onToggleMini}
              title="Collapse to icon-only bar"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#94a3b8';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>
        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[
            {
              id: 'clients',
              label: 'Recent Approved',
              count: approvedCount,
              Icon: ThumbsUp,
            },
            {
              id: 'reprints',
              label: 'Recent Requested',
              count: requestedCount,
              Icon: Send,
            },
            { id: 'updates', label: 'Recent Updates', count: updatesCount, Icon: Clock },
          ].map(({ id, label, count, Icon }) => {
            const isActive = dashboardMode === 'sections' && activeSection === id;
            return (
              <button
                key={id}
                onClick={() => {
                  if (setDashboardMode) setDashboardMode('sections');
                  setActiveSection(id);
                }}
                style={{
                  width: '100%',
                  padding: '0 8px',
                  height: '30px',
                  boxSizing: 'border-box',
                  background: isActive ? '#eff6ff' : '#ffffff',
                  border: isActive ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                  borderLeft: isActive ? '3px solid #2563eb' : '1px solid #e2e8f0',
                  borderRadius: '4px',
                  color: isActive ? '#1d4ed8' : '#475569',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-family)',
                  transition: 'all 0.15s',
                  boxShadow: isActive ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = '#ffffff';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      background: isActive ? '#dbeafe' : '#eff6ff',
                      color: isActive ? '#1d4ed8' : '#3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={12} />
                  </div>
                  <span>{label}</span>
                </div>
                <span
                  style={{
                    fontWeight: 700,
                    color: isActive ? '#1d4ed8' : '#0f172a',
                    background: isActive ? '#dbeafe' : '#f1f5f9',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    fontSize: '11.5px',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Quick Actions */}
      <div
        style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderBottom: '1px solid #cbd5e1' }}
      >
        <div
          style={{
            background: '#1e293b',
            color: '#ffffff',
            height: '38px', minHeight: '38px', maxHeight: '38px',
            padding: '0 10px',
            fontSize: '13px', letterSpacing: '0.02em',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxSizing: 'border-box',
            borderBottom: '1px solid #334155',
            flexShrink: 0,
          }}
        >
          <Plus size={13} /> Quick Actions
        </div>
        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {quickActions.map(({ label, action, Icon }) => (
            <button
              key={label}
              onClick={action}
              style={{
                width: '100%',
                padding: '0 8px',
                height: '30px',
                boxSizing: 'border-box',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '4px',
                color: '#1d4ed8',
                fontSize: '12.5px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontFamily: 'var(--font-family)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#eff6ff')}
            >
              <Icon size={13} /> <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Studio Tools */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div
          style={{
            background: '#1e293b',
            color: '#ffffff',
            height: '38px', minHeight: '38px', maxHeight: '38px',
            padding: '0 10px',
            fontSize: '13px', letterSpacing: '0.02em',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxSizing: 'border-box',
            borderBottom: '1px solid #334155',
            flexShrink: 0,
          }}
        >
          <Sparkles size={13} /> Studio Tools
        </div>

        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[
            {
              id: 'passport_images',
              label: 'Passport Image',
              Icon: Camera,
            },
            {
              id: 'generate_cards',
              label: 'Generate Cards',
              Icon: CreditCard,
            },
            {
              id: 'finish_photos',
              label: 'Fix Photos',
              Icon: Sparkles,
            },
            {
              id: 'data_collection',
              label: 'Data Collection',
              Icon: FolderInput,
            },
          ].map(({ id, label, Icon }) => {
            const isActive = dashboardMode === id;
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === 'finish_photos') {
                    onOpenFixPhotosModal?.();
                  } else if (id === 'data_collection') {
                    onOpenDataCollectionModal?.();
                  } else if (setDashboardMode) {
                    setDashboardMode(id);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0 8px',
                  height: '30px',
                  boxSizing: 'border-box',
                  background: isActive ? '#eff6ff' : '#ffffff',
                  border: isActive ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                  borderLeft: isActive ? '3px solid #2563eb' : '1px solid #e2e8f0',
                  borderRadius: '4px',
                  color: isActive ? '#1d4ed8' : '#475569',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-family)',
                  transition: 'all 0.15s',
                  boxShadow: isActive ? '0 1px 2px rgba(37,99,235,0.08)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = '#ffffff';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      background: isActive ? '#dbeafe' : '#eff6ff',
                      color: isActive ? '#1d4ed8' : '#3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={12} />
                  </div>
                  <span>{label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Main DashboardView Assembly
───────────────────────────────────────────────────────────────────────── */
export default function DashboardView({ onNavigate, currentUser, onOpenActionDrawer, userRole = 'super_admin' }) {
  const cachedDashboard = swrCache.get('dashboard_data') || {};
  const [stats, setStats] = useState(() => cachedDashboard.stats || null);
  const [clients, setClients] = useState(() => cachedDashboard.clients || []);
  const [allTables, setAllTables] = useState(() => cachedDashboard.allTables || []);
  const [reprintClients, setReprintClients] = useState(() => cachedDashboard.reprintClients || []);
  const [activities, setActivities] = useState(() => cachedDashboard.activities || []);
  const [loading, setLoading] = useState(() => !cachedDashboard.stats);
  const [activeSection, setActiveSection] = useState('clients'); // 'clients' | 'reprints' | 'updates'
  const [dashboardMode, setDashboardMode] = useState('sections'); // 'sections' | 'passport_images' | 'generate_cards' | 'finish_photos'
  const [activeDownloadModal, setActiveDownloadModal] = useState(null);
  const [showFixPhotosModal, setShowFixPhotosModal] = useState(false);
  const [fixPhotosOrgId, setFixPhotosOrgId] = useState('');
  const [fixPhotosTableId, setFixPhotosTableId] = useState('');
  const [showDataCollectionModal, setShowDataCollectionModal] = useState(false);
  const [dataCollectionOrgId, setDataCollectionOrgId] = useState('');
  const [dataCollectionTableId, setDataCollectionTableId] = useState('');
  const [search, setSearch] = useState('');

  const getTablesForOrg = useCallback((orgId) => {
    if (!orgId) return [];
    const org = (clients || []).find((c) => String(c.id) === String(orgId));
    if (org && Array.isArray(org.tables) && org.tables.length > 0) {
      return org.tables;
    }
    const cId = String(orgId).toLowerCase();
    const cName = String(org?.name || org?.school_name || '').toLowerCase();
    return (allTables || []).filter((t) => {
      if (!t) return false;
      const tClientId = String(
        t.client_id || t.clientId || t.client || t.organisation_id || t.organisation || t.group?.client?.id || ''
      ).toLowerCase();
      const tClientName = String(t.client_name || t.group?.client?.name || '').toLowerCase();
      return (cId && tClientId === cId) || (cName && tClientName === cName);
    });
  }, [clients, allTables]);

  const handleOpenFixPhotosModal = useCallback(() => {
    const firstOrgId = clients[0]?.id ? String(clients[0].id) : '';
    setFixPhotosOrgId(firstOrgId);
    if (firstOrgId) {
      const orgTables = getTablesForOrg(firstOrgId);
      setFixPhotosTableId(orgTables[0]?.id ? String(orgTables[0].id) : '');
    } else {
      setFixPhotosTableId('');
    }
    setShowFixPhotosModal(true);
  }, [clients, getTablesForOrg]);

  const handleOpenDataCollectionModal = useCallback(() => {
    const firstOrgId = clients[0]?.id ? String(clients[0].id) : '';
    setDataCollectionOrgId(firstOrgId);
    if (firstOrgId) {
      const orgTables = getTablesForOrg(firstOrgId);
      setDataCollectionTableId(orgTables[0]?.id ? String(orgTables[0].id) : '');
    } else {
      setDataCollectionTableId('');
    }
    setShowDataCollectionModal(true);
  }, [clients, getTablesForOrg]);

  const load = useCallback(
    async (isInitial = false) => {
      const hasCached = Boolean(swrCache.get('dashboard_data')?.stats);
      if (isInitial && !hasCached) {
        setLoading(true);
      }
      try {
        const [schemaRes, statsRes, clientRes, reprintRes, actRes] = await Promise.allSettled([
          schemaApi.getSchemas(),
          dashboardApi.getStats(),
          dashboardApi.getRecentClientUpdates(),
          dashboardApi.getReprintOverview(),
          dashboardApi.getRecentActivity(50),
        ]);

        let loadedTables = null;
        if (schemaRes.status === 'fulfilled' && schemaRes.value) {
          loadedTables =
            schemaRes.value.tables ||
            schemaRes.value.results ||
            (Array.isArray(schemaRes.value) ? schemaRes.value : []);
          setAllTables(loadedTables);
        }

        let apiStats = null;
        if (statsRes.status === 'fulfilled' && statsRes.value) {
          apiStats = statsRes.value.stats || statsRes.value;
          if (apiStats) {
            setStats(apiStats);
          }
        }

        let loadedClients = null;
        if (clientRes.status === 'fulfilled' && clientRes.value) {
          loadedClients =
            clientRes.value.clients ||
            clientRes.value.results ||
            (Array.isArray(clientRes.value) ? clientRes.value : []);
          setClients(loadedClients);
        }

        let loadedReprints = null;
        if (reprintRes.status === 'fulfilled' && reprintRes.value) {
          loadedReprints =
            reprintRes.value.clients ||
            reprintRes.value.results ||
            reprintRes.value ||
            [];
          setReprintClients(loadedReprints);
        }

        let loadedActivities = null;
        if (actRes.status === 'fulfilled' && actRes.value) {
          loadedActivities =
            actRes.value.activities ||
            actRes.value.results ||
            actRes.value ||
            [];
          setActivities(loadedActivities);
        }

        swrCache.set(
          'dashboard_data',
          {
            stats: apiStats || swrCache.get('dashboard_data')?.stats || null,
            clients: loadedClients || swrCache.get('dashboard_data')?.clients || [],
            allTables: loadedTables || swrCache.get('dashboard_data')?.allTables || [],
            reprintClients: loadedReprints || swrCache.get('dashboard_data')?.reprintClients || [],
            activities: loadedActivities || swrCache.get('dashboard_data')?.activities || [],
          },
          5 * 60 * 1000
        );
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (window.location.pathname.includes('/login')) return;

    load(true);
    window.__reloadDashboard = () => load(false);
    const interval = setInterval(() => {
      if (!window.location.pathname.includes('/login')) {
        load(false);
      }
    }, 30000);
    return () => {
      clearInterval(interval);
      if (window.__reloadDashboard === load) delete window.__reloadDashboard;
    };
  }, [load]);

  const currentRole = String(currentUser?.role || userRole || '').toLowerCase();
  const isOrg = currentRole === 'prime_manager' || currentRole === 'super_manager' || currentRole === 'manager' || currentRole === 'client';
  const isAssistant = currentRole === 'assistant' || currentRole === 'client_staff';

  // Right rail panel state: expanded (260px) on desktop, icon-only mini bar (48px) on small screens (<1200px)
  const [isRightRailMini, setIsRightRailMini] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1200;
    }
    return false;
  });

  // Auto-collapse right rail to icon-only bar if screen becomes small (<1200px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1200) {
        setIsRightRailMini(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      className="dashboard-view-container dashboard-scroll-hidden"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f8fafc' }}
    >
      {/* 1. Dynamic Stat Cards Row synchronized with active section */}
      <StatCardsRow
        stats={stats}
        clients={clients}
        reprintClients={reprintClients}
        loading={loading}
        onNavigate={onNavigate}
        userRole={currentUser?.role || userRole}
        activeSection={activeSection}
      />

      {/* 3. Main Dashboard Body: Dynamic Left Section + Right Stacked Panels */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: isRightRailMini ? '1fr 48px' : '1fr 260px',
          gap: 0,
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
          transition: 'grid-template-columns 0.15s ease-in-out',
        }}
      >
        {/* Left Container */}
        <div
          style={{
            background: '#fff',
            borderRight: '1px solid #cbd5e1',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {/* Production Tool Workspaces */}
          {dashboardMode === 'passport_images' && (
            <PassportGenerationWorkspace
              clients={clients}
              allTables={allTables}
              onNavigate={onNavigate}
              onOpenDownloadModal={(modalProps) => setActiveDownloadModal(modalProps)}
            />
          )}

          {dashboardMode === 'generate_cards' && (
            <GenerateCardsWorkspace onNavigate={onNavigate} />
          )}

          {dashboardMode === 'finish_photos' && (
            <FinishPhotosWorkspace
              clients={clients}
              allTables={allTables}
              onNavigate={onNavigate}
            />
          )}

          {/* Dynamic Table Body for Sections */}
          {dashboardMode === 'sections' && activeSection === 'clients' && (
            (isOrg || isAssistant) ? (
              <RecentTablesUpdatesTable
                tables={allTables}
                loading={loading}
                onNavigate={onNavigate}
                search={search}
                setSearch={setSearch}
                userRole={currentUser?.role || userRole}
                currentUser={currentUser}
              />
            ) : (
              <RecentClientUpdatesTable
                clients={clients}
                allTables={allTables}
                loading={loading}
                onNavigate={onNavigate}
                search={search}
                setSearch={setSearch}
              />
            )
          )}

          {dashboardMode === 'sections' && activeSection === 'reprints' && (
            <RecentReprintsTable
              clients={reprintClients.length ? reprintClients : clients}
              onNavigate={onNavigate}
              search={search}
              setSearch={setSearch}
            />
          )}

          {dashboardMode === 'sections' && activeSection === 'updates' && (
            <RecentActivityUpdatesTable activities={activities} search={search} setSearch={setSearch} loading={loading} />
          )}
        </div>

        {/* Right Side Panels (Icon-only mini bar when isRightRailMini, full 260px when expanded) */}
        <RightSidePanels
          stats={stats}
          clients={clients}
          reprintClients={reprintClients}
          activities={activities}
          allTables={allTables}
          onNavigate={onNavigate}
          onOpenActionDrawer={onOpenActionDrawer}
          onOpenFixPhotosModal={handleOpenFixPhotosModal}
          onOpenDataCollectionModal={handleOpenDataCollectionModal}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          currentUser={currentUser}
          userRole={currentUser?.role || userRole}
          dashboardMode={dashboardMode}
          setDashboardMode={setDashboardMode}
          isMini={isRightRailMini}
          onToggleMini={() => setIsRightRailMini((prev) => !prev)}
        />
      </div>

      {/* 4. Active Passport / Data Download Modal */}
      {activeDownloadModal && (
        <DownloadDataModal
          table={activeDownloadModal.table}
          tableId={activeDownloadModal.tableId}
          status={activeDownloadModal.status || 'approved'}
          cardCount={activeDownloadModal.cardCount || 0}
          onClose={() => setActiveDownloadModal(null)}
        />
      )}

      {/* 5. Fix Photos Modal (Organisation & Table Picker) */}
      {/* 6. Data Collection Modal (Organisation & Table Picker) */}
      {showDataCollectionModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDataCollectionModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              width: '460px',
              maxWidth: '92vw',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'var(--font-family)',
            }}
          >
            {/* Header */}
            <div
              style={{
                background: '#1e1e2e',
                color: '#ffffff',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderInput size={16} style={{ color: '#38bdf8' }} />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Data Collection — Select Table</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDataCollectionModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.4 }}>
                Choose an organisation and table to manage incoming student demographic data and portrait photos.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Organisation / Client
                </label>
                <select
                  value={dataCollectionOrgId}
                  onChange={(e) => {
                    const nextOrgId = e.target.value;
                    setDataCollectionOrgId(nextOrgId);
                    const orgTables = getTablesForOrg(nextOrgId);
                    setDataCollectionTableId(orgTables[0]?.id ? String(orgTables[0].id) : '');
                  }}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#1e293b',
                    outline: 'none',
                  }}
                >
                  <option value="">-- Choose Organisation --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.school_name || `Org #${c.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Table
                </label>
                <select
                  value={dataCollectionTableId}
                  onChange={(e) => setDataCollectionTableId(e.target.value)}
                  disabled={!dataCollectionOrgId}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: dataCollectionOrgId ? '#ffffff' : '#f8fafc',
                    color: '#1e293b',
                    outline: 'none',
                    cursor: dataCollectionOrgId ? 'pointer' : 'not-allowed',
                  }}
                >
                  <option value="">-- Choose Table --</option>
                  {getTablesForOrg(dataCollectionOrgId).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {dataCollectionOrgId && getTablesForOrg(dataCollectionOrgId).length === 0 && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                    No tables found for this organisation.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                onClick={() => setShowDataCollectionModal(false)}
                style={{
                  padding: '0 14px',
                  height: '32px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!dataCollectionTableId}
                onClick={() => {
                  if (!dataCollectionTableId) return;
                  const chosenOrg = clients.find((c) => String(c.id) === String(dataCollectionOrgId));
                  const orgTables = getTablesForOrg(dataCollectionOrgId);
                  const chosenTable = orgTables.find((t) => String(t.id) === String(dataCollectionTableId));
                  onNavigate?.('data-collection', {
                    tableId: Number(dataCollectionTableId),
                    orgId: dataCollectionOrgId ? Number(dataCollectionOrgId) : null,
                    orgName: chosenOrg?.name || chosenOrg?.school_name || null,
                    tableName: chosenTable?.name || null,
                  });
                  setShowDataCollectionModal(false);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 16px',
                  height: '32px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid #0284c7',
                  background: dataCollectionTableId ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#cbd5e1',
                  color: '#ffffff',
                  cursor: dataCollectionTableId ? 'pointer' : 'not-allowed',
                }}
              >
                <FolderInput size={14} />
                Open Data Collection
              </button>
            </div>
          </div>
        </div>
      )}

      {showFixPhotosModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFixPhotosModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              width: '460px',
              maxWidth: '92vw',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'var(--font-family)',
            }}
          >
            {/* Header */}
            <div
              style={{
                background: '#1e1e2e',
                color: '#ffffff',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} style={{ color: '#a78bfa' }} />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Fix Photos — Select Table</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFixPhotosModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.4 }}>
                Choose an organisation and table to open its approved card photos in the Fix Images Studio.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Organisation / Client
                </label>
                <select
                  value={fixPhotosOrgId}
                  onChange={(e) => {
                    const nextOrgId = e.target.value;
                    setFixPhotosOrgId(nextOrgId);
                    const orgTables = getTablesForOrg(nextOrgId);
                    setFixPhotosTableId(orgTables[0]?.id ? String(orgTables[0].id) : '');
                  }}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#1e293b',
                    outline: 'none',
                  }}
                >
                  <option value="">-- Choose Organisation --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.school_name || `Org #${c.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Table
                </label>
                <select
                  value={fixPhotosTableId}
                  onChange={(e) => setFixPhotosTableId(e.target.value)}
                  disabled={!fixPhotosOrgId}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: fixPhotosOrgId ? '#ffffff' : '#f8fafc',
                    color: '#1e293b',
                    outline: 'none',
                    cursor: fixPhotosOrgId ? 'pointer' : 'not-allowed',
                  }}
                >
                  <option value="">-- Choose Table --</option>
                  {getTablesForOrg(fixPhotosOrgId).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {fixPhotosOrgId && getTablesForOrg(fixPhotosOrgId).length === 0 && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                    No tables found for this organisation.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                onClick={() => setShowFixPhotosModal(false)}
                style={{
                  padding: '0 14px',
                  height: '32px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!fixPhotosTableId}
                onClick={() => {
                  if (!fixPhotosTableId) return;
                  const chosenOrg = clients.find((c) => String(c.id) === String(fixPhotosOrgId));
                  const orgTables = getTablesForOrg(fixPhotosOrgId);
                  const chosenTable = orgTables.find((t) => String(t.id) === String(fixPhotosTableId));
                  onNavigate?.('fix-images', {
                    tableId: Number(fixPhotosTableId),
                    orgId: fixPhotosOrgId ? Number(fixPhotosOrgId) : null,
                    orgName: chosenOrg?.name || chosenOrg?.school_name || null,
                    tableName: chosenTable?.name || null,
                    status: 'approved',
                  });
                  setShowFixPhotosModal(false);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 16px',
                  height: '32px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid #7c3aed',
                  background: fixPhotosTableId ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' : '#cbd5e1',
                  color: '#ffffff',
                  cursor: fixPhotosTableId ? 'pointer' : 'not-allowed',
                  boxShadow: fixPhotosTableId ? '0 1px 3px rgba(124,58,237,0.3)' : 'none',
                }}
              >
                <Sparkles size={14} />
                <span>Open Fix Images</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
