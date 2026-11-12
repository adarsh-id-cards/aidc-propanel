import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  FolderInput,
  Sparkles,
  Send,
  Share2,
  Copy,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Search,
  Check,
  X,
  MessageSquare,
  FileEdit,
  History,
  ShieldCheck,
  Users,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { dataCollectionApi } from '../../services/api';

/**
 * DataCollectionView — Dedicated Standalone Ingestion & Deduplication Pipeline
 * 
 * Modeled after the Table Page (TableActionsView):
 * - Topbar (Dark #0f172a): Back button, Table name, Organisation badge on LEFT;
 *                          3 Status Tabs (COLLECTION, CHECKED, CANCELED) on RIGHT.
 * - Action Bar (White #ffffff, 44px): Primary actions (Share Link, Auto-Check, Push to Pending, Batch actions) on LEFT;
 *                                    Search All... input on RIGHT.
 * - Table (Full width below): 38px dark header, 68px row height, universal 2px cell padding, dynamic schema columns.
 * - Modals: Share Portal Link, Structured Cancellation Reason, Duplicate Diff Viewer, Targeted Correction Request, Audit Events Trail.
 */

const COLLECTION_STATUS_LIST = [
  { key: 'collection', label: 'COLLECTION', bg: '#3b82f6', bgLight: '#dbeafe', color: '#1d4ed8' },
  { key: 'checked', label: 'CHECKED', bg: '#10b981', bgLight: '#d1fae5', color: '#047857' },
  { key: 'canceled', label: 'CANCELED', bg: '#ef4444', bgLight: '#fee2e2', color: '#b91c1c' },
];

const CANCELLATION_REASONS = [
  { code: 'DUPLICATE_CONFIRMED', label: 'Confirmed Duplicate (Matching Admission / Roll No)' },
  { code: 'DUPLICATE_SUSPECTED', label: 'Suspected Duplicate (Matching Name & Class)' },
  { code: 'IDENTITY_CONFLICT', label: 'Identity Conflict (Conflicting Name for Same Roll No)' },
  { code: 'WRONG_INSTITUTION', label: 'Wrong Institution / Class' },
  { code: 'INVALID_DATA', label: 'Invalid or Incomplete Data' },
  { code: 'SPAM', label: 'Spam or Automated Submission' },
  { code: 'ADMIN_CANCELED', label: 'Administrative Decision' },
];

export default function DataCollectionView({
  tableId = null,
  campaignId = null,
  scopedOrgId = null,
  scopedOrgName = null,
  currentUser = null,
  userRole = 'super_admin',
  addToast,
  onBack,
  onNavigate,
}) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [counts, setCounts] = useState({ collection: 0, checked: 0, canceled: 0, total: 0, promoted: 0 });
  const [activeTab, setActiveTab] = useState('collection'); // 'collection' | 'checked' | 'canceled'
  const [tableMeta, setTableMeta] = useState(null);
  const [config, setConfig] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [resColumns, setResColumns] = useState([]);
  const [search, setSearch] = useState('');

  // Dual-Workflow Table Creation Wizard Modal State (Workflow A)
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [wizardTableName, setWizardTableName] = useState('');
  const [wizardDescription, setWizardDescription] = useState('');
  const [previewMappings, setPreviewMappings] = useState([]);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [createdTableSuccess, setCreatedTableSuccess] = useState(null);

  // Dual-Workflow Sync Modal State (Workflow B)
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncPolicy, setSyncPolicy] = useState('update_blank_only');
  const [syncScope, setSyncScope] = useState('all_checked');
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total_count: 0, num_pages: 1 });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [actionInProgress, setActionInProgress] = useState(false);

  // Modals state
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);

  // Cancellation Modal
  const [cancelModalRecordIds, setCancelModalRecordIds] = useState(null);
  const [cancelReasonCode, setCancelReasonCode] = useState('DUPLICATE_SUSPECTED');
  const [cancelNotes, setCancelNotes] = useState('');

  // Diff / Candidate Comparison Modal
  const [diffRecord, setDiffRecord] = useState(null);

  // Correction Request Modal
  const [correctionRecord, setCorrectionRecord] = useState(null);
  const [correctionFields, setCorrectionFields] = useState([]);
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [generatedCorrectionUrl, setGeneratedCorrectionUrl] = useState('');

  // Audit Events Modal
  const [auditRecord, setAuditRecord] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const orgId = scopedOrgId || tableMeta?.organisation_id || tableMeta?.client_id || campaign?.organisation_id;
  const activeCampaignId = campaignId || campaign?.id;
  const isStandalone = (campaign?.destination_type === 'NEW_TABLE' && !campaign?.table_id) || (!tableId && !campaign?.table_id);

  // ── Load Records (Unified Campaign & Table Engine) ────────────────────────
  const fetchRecords = useCallback(
    async (status = activeTab, targetPage = page, searchTerm = search) => {
      setLoading(true);
      try {
        let res;
        if (activeCampaignId) {
          res = await dataCollectionApi.getCampaignRecords(activeCampaignId, {
            status,
            page: targetPage,
            pageSize: 50,
            search: searchTerm,
          });
        } else if (tableId) {
          res = await dataCollectionApi.getRecords(tableId, {
            status,
            page: targetPage,
            pageSize: 50,
            search: searchTerm,
          });
        } else {
          setLoading(false);
          return;
        }

        if (res.success) {
          setRecords(res.records || []);
          setCounts(res.counts || { collection: 0, checked: 0, canceled: 0, total: 0, promoted: 0 });
          setPagination(res.pagination || { total_count: 0, num_pages: 1 });
          if (res.campaign) setCampaign(res.campaign);
          if (res.table_meta) setTableMeta(res.table_meta);
          if (res.config) setConfig(res.config);
          if (res.columns) setResColumns(res.columns);
        } else {
          addToast?.(res.message || 'Failed to load records', 'error');
        }
      } catch (err) {
        addToast?.(err?.response?.data?.message || err.message || 'Network error loading records', 'error');
      } finally {
        setLoading(false);
      }
    },
    [tableId, activeCampaignId, activeTab, page, search, addToast]
  );

  useEffect(() => {
    fetchRecords(activeTab, page, search);
    setSelectedIds(new Set());
  }, [fetchRecords, activeTab, page, search]);

  // ── Auto-Check (Scan for duplicates / auto-verify) ────────────────────────
  const handleAutoCheck = async () => {
    if (actionInProgress) return;
    setActionInProgress(true);
    addToast?.('Running duplicate & conflict scanner on collection records...', 'info');
    try {
      const res = await dataCollectionApi.autoCheck(tableId);
      if (res.success) {
        addToast?.(
          `Auto-check complete: ${res.details?.checked_count ?? 0} moved to Checked, ${res.details?.canceled_count ?? 0} quarantined to Canceled.`,
          'success'
        );
        fetchRecords(activeTab, page, search);
      } else {
        addToast?.(res.message || 'Auto-check completed with warnings', 'warning');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || err.message || 'Auto-check failed', 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  // ── Promote Checked to Live Pending ID Cards ──────────────────────────────
  const handlePromote = async (specificIds = null) => {
    if (actionInProgress) return;
    const idsToPromote = specificIds || (selectedIds.size > 0 ? Array.from(selectedIds) : null);
    
    const countToPromote = idsToPromote ? idsToPromote.length : counts.checked;
    if (countToPromote === 0) {
      addToast?.('No checked records to promote', 'warning');
      return;
    }

    const confirmMsg = idsToPromote
      ? `Promote ${idsToPromote.length} checked submission(s) into live Pending ID cards?`
      : `Promote ALL ${counts.checked} checked submissions into live Pending ID cards?`;

    if (!window.confirm(confirmMsg)) return;

    setActionInProgress(true);
    try {
      const res = await dataCollectionApi.promoteToPending(tableId, idsToPromote);
      if (res.success) {
        const details = res.details || {};
        const promoted = details.promoted_count ?? res.promoted_count ?? 0;
        const failed = details.failed_count ?? 0;
        if (failed > 0) {
          addToast?.(`Promoted ${promoted} record(s). ${failed} record(s) flagged due to duplicate conflicts.`, 'warning');
        } else {
          addToast?.(`Successfully promoted ${promoted} record(s) directly into table's Pending ID cards!`, 'success');
        }
        setSelectedIds(new Set());
        fetchRecords(activeTab, page, search);
      } else {
        addToast?.(res.message || 'Promotion failed', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || err.message || 'Promotion request failed', 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  // ── Status Transition Handlers ───────────────────────────────────────────
  const handleStatusChange = async (recordIds, newStatus, flagCode = null, reason = null) => {
    if (!recordIds || recordIds.length === 0) return;
    try {
      const res = await dataCollectionApi.changeStatus(tableId, {
        recordIds,
        newStatus,
        flagCode,
        reason,
      });
      if (res.success) {
        addToast?.(`Updated ${res.updated_count} record(s) to ${newStatus.toUpperCase()}`, 'success');
        setSelectedIds(new Set());
        setCancelModalRecordIds(null);
        fetchRecords(activeTab, page, search);
      } else {
        addToast?.(res.message || 'Status update failed', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || err.message || 'Status change request failed', 'error');
    }
  };

  // ── Targeted Correction Request ──────────────────────────────────────────
  const handleOpenCorrectionModal = (record) => {
    setCorrectionRecord(record);
    setCorrectionFields(['STUDENT NAME']);
    setCorrectionNotes('');
    setGeneratedCorrectionUrl('');
  };

  const handleSendCorrectionRequest = async () => {
    if (!correctionRecord || correctionFields.length === 0) {
      addToast?.('Please select at least one field to request correction for', 'warning');
      return;
    }

    try {
      const res = await dataCollectionApi.requestCorrection(tableId, {
        recordId: correctionRecord.id,
        requestedFields: correctionFields,
        notes: correctionNotes,
      });
      if (res.success) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const fullUrl = `${origin}${res.correction_url}`;
        setGeneratedCorrectionUrl(fullUrl);
        addToast?.(`Correction link generated for Record #${correctionRecord.id}`, 'success');
        fetchRecords(activeTab, page, search);
      } else {
        addToast?.(res.message || 'Failed to request correction', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || 'Error generating correction link', 'error');
    }
  };

  // ── View Audit Events ────────────────────────────────────────────────────
  const handleViewAuditEvents = async (record) => {
    setAuditRecord(record);
    setLoadingEvents(true);
    setAuditEvents([]);
    try {
      const res = await dataCollectionApi.getEvents(tableId, record.id);
      if (res.success) {
        setAuditEvents(res.events || []);
      } else {
        addToast?.('Unable to load audit history', 'error');
      }
    } catch (err) {
      addToast?.('Failed to fetch event history', 'error');
    } finally {
      setLoadingEvents(false);
    }
  };

  // ── Selection Handlers ────────────────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // ── Share Link Helpers ────────────────────────────────────────────────────
  const portalUrl = useMemo(() => {
    if (!config?.token) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/portal/collect/${config.token}`;
  }, [config]);

  const handleCopyLink = () => {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    setCopiedLink(true);
    addToast?.('Portal link copied to clipboard!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyWhatsapp = () => {
    if (!portalUrl) return;
    const msg = `📢 *Official Student Data & Photo Collection*
    
Dear Student / Parent,
Please submit your official student demographic details and passport photograph for your ID card using the secure institutional portal below:

🔗 ${portalUrl}

*Instructions:*
1. Enter student name, roll number, class, and family contact details.
2. Capture or choose your formal photograph and align it in the 3:4 portrait cropper.
3. If submitting for multiple children (siblings), click "+ Add Another Child" after each submission.

_Pro Panel Automated ID System_`;

    navigator.clipboard.writeText(msg);
    setCopiedWhatsapp(true);
    addToast?.('WhatsApp message copied! Paste it in your group or broadcast.', 'success');
    setTimeout(() => setCopiedWhatsapp(false), 2000);
  };

  // Dynamic table schema columns to display
  const displayFields = useMemo(() => {
    if (resColumns && resColumns.length > 0) {
      return resColumns.filter((c) => !['photo', 'rel_photo', 'signature'].includes(String(c).toLowerCase())).slice(0, 6);
    }
    if (!tableMeta?.fields) {
      if (campaign?.form_schema?.fields) {
        return campaign.form_schema.fields
          .filter((f) => !['photo', 'rel_photo', 'signature'].includes(String(f.type || '').toLowerCase()))
          .map((f) => f.name || f.label)
          .slice(0, 6);
      }
      return ['NAME', 'ROLL NO', 'CLASS', 'FATHER NAME', 'PHONE'];
    }
    const cols = [];
    for (const f of tableMeta.fields) {
      const fn = str(f.name || '');
      const ft = str(f.type || '').toLowerCase();
      if (ft in { photo: 1, rel_photo: 1, signature: 1 }) continue;
      cols.push(fn);
      if (cols.length >= 6) break;
    }
    return cols;
  }, [resColumns, tableMeta, campaign]);

  function str(v) {
    return v === null || v === undefined ? '' : String(v);
  }

  const buttonStyle = (bg, disabled = false) => ({
    background: disabled ? '#f1f5f9' : bg,
    color: disabled ? '#94a3b8' : '#ffffff',
    border: disabled ? '1px solid #cbd5e1' : `1px solid ${bg}`,
    borderRadius: '4px',
    padding: '0 12px',
    height: '32px',
    minHeight: '32px',
    maxHeight: '32px',
    fontSize: '13px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    boxSizing: 'border-box',
    boxShadow: disabled ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
    transition: 'all 0.15s ease',
  });

  return (
    <div
      className="data-collection-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '100vh',
        background: '#f8fafc',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* ══════════════════════════════════════════════════════════════════
          1. TOP NAVIGATION HEADER (Matching Table Page Header)
          ══════════════════════════════════════════════════════════════════ */}
      <header
        className="unified-nav-header"
        style={{
          background: '#0f172a',
          color: '#ffffff',
          height: '46px',
          minHeight: '46px',
          maxHeight: '46px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          boxSizing: 'border-box',
        }}
      >
        {/* Left: Back + Table Title / Org Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              if (onBack) onBack();
              else window.history.back();
            }}
            className="unified-nav-back-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '0 10px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            <ChevronLeft size={16} />
            <span>BACK</span>
          </button>

          <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {tableMeta?.name || campaign?.campaign_name || (activeCampaignId ? `CAMPAIGN #${activeCampaignId}` : `TABLE #${tableId}`)}
          </span>

          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              background: isStandalone ? 'rgba(168, 85, 247, 0.25)' : 'rgba(59, 130, 246, 0.2)',
              color: isStandalone ? '#e9d5ff' : '#bfdbfe',
              padding: '2px 8px',
              borderRadius: '4px',
              border: isStandalone ? '1px solid rgba(192, 132, 252, 0.35)' : '1px solid rgba(96, 165, 250, 0.3)',
            }}
          >
            {isStandalone ? 'PRE-TABLE COLLECTION' : (scopedOrgName || tableMeta?.organisation_name || 'TABLE COLLECTION')}
          </span>
        </div>

        {/* Right: Colored Status List Tabs (COLLECTION, CHECKED, CANCELED) */}
        <div className="status-tabs" id="table-status-tabs" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {COLLECTION_STATUS_LIST.map((s) => {
            const count = counts[s.key] ?? 0;
            const isActive = activeTab === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setActiveTab(s.key);
                  setPage(1);
                }}
                className={`status-tab status-tab-${s.key} ${isActive ? `active active-${s.key}` : ''}`}
                title={`Switch to ${s.label}`}
                id={`status-tab-${s.key}`}
                style={{
                  height: '28px',
                  minHeight: '28px',
                  maxHeight: '28px',
                  padding: '0 10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  lineHeight: '28px',
                  borderRadius: '5px',
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? s.bg : 'transparent',
                  color: isActive ? '#ffffff' : '#cbd5e1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                  transition: 'all 0.15s ease',
                  textTransform: 'uppercase',
                }}
              >
                <span>{s.label}</span>
                <span
                  className="status-tab-count"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    minWidth: '18px',
                    height: '18px',
                    lineHeight: '18px',
                    padding: '0 5px',
                    borderRadius: '4px',
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
                    color: '#ffffff',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          2. ACTION BAR (Matching Table Page Action Bar)
          ══════════════════════════════════════════════════════════════════ */}
      <div
        className="action-bar"
        style={{
          flexShrink: 0,
          padding: '0 16px',
          background: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          minHeight: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          position: 'relative',
          zIndex: 100,
          boxSizing: 'border-box',
        }}
      >
        {/* Left Side: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            style={buttonStyle('#2563eb')}
            title="Configure and share student data & photo collection portal link"
          >
            <Share2 size={14} /> <span>SHARE LINK</span>
          </button>

          <button
            type="button"
            disabled={actionInProgress}
            onClick={handleAutoCheck}
            style={buttonStyle('#0d9488', actionInProgress)}
            title="Scan Collection records for duplicate Roll Nos / Phone / Names"
          >
            <Sparkles size={14} /> <span>AUTO-CHECK</span>
          </button>

          {/* Dual-Workflow CTA: Create Table (Workflow A) vs Sync / Push to Pending (Workflow B) */}
          {isStandalone ? (
            <button
              type="button"
              disabled={actionInProgress || (counts.checked === 0 && counts.collection === 0)}
              onClick={async () => {
                setWizardTableName(campaign?.campaign_name || 'STUDENT DATA TABLE');
                setWizardDescription('Created from Data Collection Campaign');
                setCreatedTableSuccess(null);
                setShowCreateTableModal(true);
                if (activeCampaignId) {
                  setWizardLoading(true);
                  try {
                    const res = await dataCollectionApi.getMappingPreview(activeCampaignId);
                    if (res.success && res.preview?.mappings) {
                      setPreviewMappings(res.preview.mappings);
                    }
                  } catch (e) {
                    console.error('Mapping preview load error:', e);
                  } finally {
                    setWizardLoading(false);
                  }
                }
              }}
              style={buttonStyle('#7c3aed', actionInProgress || (counts.checked === 0 && counts.collection === 0))}
              title="Launch Table Creation Wizard to generate a new Table and promote verified submissions"
            >
              <Sparkles size={14} /> <span>CREATE TABLE FROM COLLECTION ({counts.checked})</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={actionInProgress || counts.checked === 0}
              onClick={() => {
                setSyncPolicy('update_blank_only');
                setSyncScope(selectedIds.size > 0 ? 'selected' : 'all_checked');
                setShowSyncModal(true);
              }}
              style={buttonStyle('#10b981', actionInProgress || counts.checked === 0)}
              title="Synchronize checked submissions into live Pending ID Cards"
            >
              <Send size={14} /> <span>SYNC / PUSH TO PENDING ({counts.checked})</span>
            </button>
          )}

          <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

          {/* Bulk Selection Actions */}
          {selectedIds.size > 0 && (
            <>
              {activeTab === 'collection' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(Array.from(selectedIds), 'checked')}
                  style={buttonStyle('#10b981')}
                  title="Move selected to Checked"
                >
                  <CheckCircle2 size={14} /> <span>MARK CHECKED ({selectedIds.size})</span>
                </button>
              )}

              {activeTab !== 'canceled' && (
                <button
                  type="button"
                  onClick={() => setCancelModalRecordIds(Array.from(selectedIds))}
                  style={buttonStyle('#ef4444')}
                  title="Cancel selected with structured reason"
                >
                  <XCircle size={14} /> <span>CANCEL SELECTED ({selectedIds.size})</span>
                </button>
              )}

              {activeTab === 'canceled' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(Array.from(selectedIds), 'collection')}
                  style={buttonStyle('#2563eb')}
                  title="Restore selected back to Collection"
                >
                  <RotateCcw size={14} /> <span>RESTORE TO COLLECTION ({selectedIds.size})</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Right Side: Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search Submissions..."
              style={{
                width: '100%',
                height: '30px',
                padding: '0 10px 0 32px',
                fontSize: '13px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#1e293b',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'var(--font-family)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          3. MAIN TABLE OF SUBMISSIONS (Universal 2px Padding & Calibrated Layout)
          ══════════════════════════════════════════════════════════════════ */}
      <div
        className="table-content-area"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '0',
          position: 'relative',
        }}
      >
        {loading && records.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid #cbd5e1',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                margin: '0 auto 12px',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Loading {activeTab.toUpperCase()} records...</p>
          </div>
        ) : records.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              textAlign: 'center',
              color: '#64748b',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
                color: '#94a3b8',
              }}
            >
              <FolderInput size={28} />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#334155' }}>
              No {activeTab.toUpperCase()} Submissions Found
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', maxWidth: '420px', lineHeight: 1.5 }}>
              {activeTab === 'collection' &&
                'Share the public collection link with parents or students to start gathering data and portrait photos.'}
              {activeTab === 'checked' &&
                'Run AUTO-CHECK on the Collection tab to verify submissions and automatically move clean records here.'}
              {activeTab === 'canceled' &&
                'Duplicate or suspicious submissions will appear here with full conflict reasons. They are never deleted.'}
            </p>
            {activeTab === 'collection' && (
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                style={buttonStyle('#2563eb')}
              >
                <Share2 size={13} />
                <span>SHARE COLLECTION LINK</span>
              </button>
            )}
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              background: '#ffffff',
              fontSize: '13px',
              fontFamily: 'var(--font-family)',
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#1e1e2e',
                  color: '#ffffff',
                  height: '38px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                }}
              >
                <th style={{ width: '38px', padding: '2px 8px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === records.length && records.length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ width: '48px', padding: '2px 8px', textAlign: 'center' }}>SR</th>
                <th style={{ width: '64px', padding: '2px 8px', textAlign: 'center' }}>PHOTO</th>
                <th style={{ width: '110px', padding: '2px 8px', textAlign: 'center' }}>MATCH</th>
                {displayFields.map((col) => (
                  <th key={col} style={{ padding: '2px 10px', textAlign: 'left', minWidth: '120px' }}>
                    {col}
                  </th>
                ))}
                <th style={{ width: '130px', padding: '2px 10px', textAlign: 'left' }}>SUBMITTER</th>
                {activeTab === 'canceled' && (
                  <th style={{ padding: '2px 10px', textAlign: 'left', minWidth: '220px', color: '#fca5a5' }}>
                    FLAG REASON
                  </th>
                )}
                {activeTab === 'checked' && (
                  <th style={{ padding: '2px 10px', textAlign: 'center', width: '110px' }}>PROMOTED</th>
                )}
                <th style={{ padding: '2px 10px', textAlign: 'center', width: '110px' }}>STATUS</th>
                <th style={{ padding: '2px 10px', textAlign: 'center', width: '180px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => {
                const isSelected = selectedIds.has(r.id);
                const fieldData = r.field_data || {};
                const photoSrc = r.photo_file ? `/media/${r.photo_file}` : null;
                const matchStatus = r.match_status || 'NO_MATCH';

                return (
                  <tr
                    key={r.id}
                    style={{
                      height: '68px',
                      borderBottom: '1px solid #e2e8f0',
                      background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#fcfcfd',
                      transition: 'background-color 0.12s ease',
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: '2px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(r.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>

                    {/* Serial Number */}
                    <td style={{ padding: '2px 8px', textAlign: 'center', color: '#64748b', fontWeight: 600, verticalAlign: 'middle' }}>
                      {(page - 1) * 50 + idx + 1}
                    </td>

                    {/* Photo Thumbnail */}
                    <td style={{ padding: '2px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                      {photoSrc ? (
                        <img
                          src={photoSrc}
                          alt="Student Portrait"
                          style={{
                            width: '42px',
                            height: '52px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            display: 'inline-block',
                            verticalAlign: 'middle',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '42px',
                            height: '52px',
                            background: '#f1f5f9',
                            border: '1px dashed #cbd5e1',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            color: '#94a3b8',
                            margin: '0 auto',
                          }}
                        >
                          No Pic
                        </div>
                      )}
                    </td>

                    {/* Match Status Badge */}
                    <td style={{ padding: '2px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <span
                        onClick={() => r.match_details?.matched_target && setDiffRecord(r)}
                        title={r.flag_reason || 'Click to view comparison'}
                        style={{
                          display: 'inline-block',
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          cursor: r.match_details?.matched_target ? 'pointer' : 'default',
                          textTransform: 'uppercase',
                          background:
                            matchStatus === 'NO_MATCH'
                              ? '#dcfce7'
                              : matchStatus === 'POSSIBLE_MATCH'
                              ? '#fef3c7'
                              : '#fee2e2',
                          color:
                            matchStatus === 'NO_MATCH'
                              ? '#15803d'
                              : matchStatus === 'POSSIBLE_MATCH'
                              ? '#b45309'
                              : '#b91c1c',
                          border: `1px solid ${
                            matchStatus === 'NO_MATCH'
                              ? '#86efac'
                              : matchStatus === 'POSSIBLE_MATCH'
                              ? '#fde68a'
                              : '#fca5a5'
                          }`,
                        }}
                      >
                        {matchStatus === 'NO_MATCH' ? 'CLEAN' : matchStatus === 'POSSIBLE_MATCH' ? 'SUSPECTED' : 'CONFLICT'}
                      </span>
                    </td>

                    {/* Demographic Schema Fields */}
                    {displayFields.map((col) => {
                      const val = fieldData[col] || fieldData[col.toLowerCase()] || fieldData[col.toUpperCase()] || '—';
                      return (
                        <td
                          key={col}
                          style={{
                            padding: '2px 10px',
                            fontWeight: col.toUpperCase().includes('NAME') ? 700 : 500,
                            color: col.toUpperCase().includes('NAME') ? '#0f172a' : '#334155',
                            verticalAlign: 'middle',
                            textTransform: 'uppercase',
                          }}
                        >
                          {String(val)}
                        </td>
                      );
                    })}

                    {/* Submitter Role & Contact */}
                    <td style={{ padding: '2px 10px', verticalAlign: 'middle', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', textTransform: 'capitalize' }}>
                        {r.submitter_role || 'Student'}
                      </div>
                      {r.submitter_phone && (
                        <div style={{ color: '#64748b', fontSize: '11px' }}>{r.submitter_phone}</div>
                      )}
                    </td>

                    {/* Flag Reason (Canceled tab only) */}
                    {activeTab === 'canceled' && (
                      <td style={{ padding: '2px 10px', color: '#dc2626', fontSize: '12px', fontWeight: 600, verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                          <span>{r.flag_reason || 'Quarantined candidate'}</span>
                        </div>
                      </td>
                    )}

                    {/* Promoted Card Info (Checked tab only) */}
                    {activeTab === 'checked' && (
                      <td style={{ padding: '2px 10px', textAlign: 'center', fontSize: '12px', verticalAlign: 'middle' }}>
                        {r.promoted ? (
                          <span style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                            CARD #{r.promoted_card_id}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>READY</span>
                        )}
                      </td>
                    )}

                    {/* Status Badge */}
                    <td style={{ padding: '2px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background:
                            r.status === 'checked'
                              ? '#dcfce7'
                              : r.status === 'canceled'
                              ? '#fee2e2'
                              : '#dbeafe',
                          color:
                            r.status === 'checked'
                              ? '#166534'
                              : r.status === 'canceled'
                              ? '#991b1b'
                              : '#1e40af',
                          border: `1px solid ${
                            r.status === 'checked'
                              ? '#86efac'
                              : r.status === 'canceled'
                              ? '#fca5a5'
                              : '#93c5fd'
                          }`,
                          textTransform: 'uppercase',
                        }}
                      >
                        {r.status}
                      </span>
                    </td>

                    {/* Row Action Buttons */}
                    <td style={{ padding: '2px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        {/* Audit Log Icon */}
                        <button
                          type="button"
                          onClick={() => handleViewAuditEvents(r)}
                          title="View complete event history and audit trail"
                          style={{
                            padding: '4px 6px',
                            background: '#f1f5f9',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <History size={13} />
                        </button>

                        {/* Request Correction Button */}
                        {!r.promoted && (
                          <button
                            type="button"
                            onClick={() => handleOpenCorrectionModal(r)}
                            title="Request student or parent targeted correction"
                            style={{
                              padding: '4px 6px',
                              background: '#fef3c7',
                              color: '#b45309',
                              border: '1px solid #fde68a',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            <FileEdit size={13} />
                          </button>
                        )}

                        {/* Lifecycle Tab-Specific Actions */}
                        {r.status === 'collection' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStatusChange([r.id], 'checked')}
                              title="Mark verified and move to Checked"
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              VERIFY
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelModalRecordIds([r.id])}
                              title="Flag and move to Canceled"
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: '#ef4444',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              CANCEL
                            </button>
                          </>
                        )}

                        {r.status === 'checked' && (
                          <>
                            {!r.promoted && (
                              <button
                                type="button"
                                onClick={() => handlePromote([r.id])}
                                title="Promote to live Pending ID Card"
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: '#10b981',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              >
                                PUSH
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleStatusChange([r.id], 'collection')}
                              title="Move back to Collection"
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: '#64748b',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              REVERT
                            </button>
                          </>
                        )}

                        {r.status === 'canceled' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange([r.id], 'collection', null, 'Restored by manager')}
                            title="Restore record back to Collection"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: '#3b82f6',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            RESTORE
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          4. PAGINATION FOOTER (Standard 36px)
          ══════════════════════════════════════════════════════════════════ */}
      {pagination.num_pages > 1 && (
        <div
          style={{
            height: '36px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            fontSize: '12.5px',
            color: '#64748b',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
          <span>
            Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, pagination.total_count)} of {pagination.total_count} records
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '3px 10px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: page <= 1 ? '#f8fafc' : '#ffffff',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Previous
            </button>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>
              {page} / {pagination.num_pages}
            </span>
            <button
              type="button"
              disabled={page >= pagination.num_pages}
              onClick={() => setPage((p) => Math.min(pagination.num_pages, p + 1))}
              style={{
                padding: '3px 10px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: page >= pagination.num_pages ? '#f8fafc' : '#ffffff',
                cursor: page >= pagination.num_pages ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          5. STRUCTURED CANCELLATION MODAL
          ══════════════════════════════════════════════════════════════════ */}
      {cancelModalRecordIds && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setCancelModalRecordIds(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div style={{ background: '#ffffff', borderRadius: '8px', width: '480px', maxWidth: '92vw', overflow: 'hidden' }}>
            <div style={{ background: '#1e1e2e', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>Cancel Submission ({cancelModalRecordIds.length} selected)</span>
              <button type="button" onClick={() => setCancelModalRecordIds(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.4 }}>
                Quarantining records moves them to the <strong>CANCELED</strong> tab. They are preserved in the database per the Zero-Deletion policy.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Cancellation Reason Code:
                </label>
                <select
                  value={cancelReasonCode}
                  onChange={(e) => setCancelReasonCode(e.target.value)}
                  style={{ width: '100%', height: '36px', padding: '0 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none' }}
                >
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Additional Notes (Optional):
                </label>
                <textarea
                  value={cancelNotes}
                  onChange={(e) => setCancelNotes(e.target.value)}
                  placeholder="Explain why this record is being canceled..."
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setCancelModalRecordIds(null)} style={{ padding: '0 14px', height: '32px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer' }}>
                Abort
              </button>
              <button
                type="button"
                onClick={() => {
                  const reasonLabel = CANCELLATION_REASONS.find((c) => c.code === cancelReasonCode)?.label || cancelReasonCode;
                  const fullReason = cancelNotes ? `${reasonLabel} — ${cancelNotes}` : reasonLabel;
                  handleStatusChange(cancelModalRecordIds, 'canceled', cancelReasonCode, fullReason);
                }}
                style={{ padding: '0 16px', height: '32px', fontSize: '13px', fontWeight: 700, borderRadius: '4px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          6. TARGETED CORRECTION REQUEST MODAL
          ══════════════════════════════════════════════════════════════════ */}
      {correctionRecord && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setCorrectionRecord(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div style={{ background: '#ffffff', borderRadius: '8px', width: '500px', maxWidth: '92vw', overflow: 'hidden' }}>
            <div style={{ background: '#1e1e2e', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>Request Field Correction (Record #{correctionRecord.id})</span>
              <button type="button" onClick={() => setCorrectionRecord(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.4 }}>
                Select fields requiring correction by the student/parent. The correction portal will highlight them.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Select Fields to Correct:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                  {Object.keys(correctionRecord.field_data || {}).map((f) => (
                    <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={correctionFields.includes(f)}
                        onChange={(e) => {
                          if (e.target.checked) setCorrectionFields([...correctionFields, f]);
                          else setCorrectionFields(correctionFields.filter((item) => item !== f));
                        }}
                      />
                      <span>{f}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Instructions for Student / Parent:
                </label>
                <input
                  type="text"
                  value={correctionNotes}
                  onChange={(e) => setCorrectionNotes(e.target.value)}
                  placeholder="e.g. Please verify student name spelling and upload a clearer photo."
                  style={{ width: '100%', height: '36px', padding: '0 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {generatedCorrectionUrl && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>Correction Link Generated:</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input type="text" readOnly value={generatedCorrectionUrl} style={{ flex: 1, height: '30px', padding: '0 8px', fontSize: '12px', border: '1px solid #86efac', borderRadius: '4px' }} />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedCorrectionUrl);
                        addToast?.('Correction link copied!', 'success');
                      }}
                      style={{ padding: '0 10px', height: '30px', fontSize: '12px', fontWeight: 700, background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setCorrectionRecord(null)} style={{ padding: '0 14px', height: '32px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer' }}>
                Close
              </button>
              {!generatedCorrectionUrl && (
                <button
                  type="button"
                  onClick={handleSendCorrectionRequest}
                  style={{ padding: '0 16px', height: '32px', fontSize: '13px', fontWeight: 700, borderRadius: '4px', border: 'none', background: '#d97706', color: '#fff', cursor: 'pointer' }}
                >
                  Generate Link
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          7. AUDIT EVENTS TIMELINE MODAL
          ══════════════════════════════════════════════════════════════════ */}
      {auditRecord && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setAuditRecord(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div style={{ background: '#ffffff', borderRadius: '8px', width: '560px', maxWidth: '92vw', overflow: 'hidden' }}>
            <div style={{ background: '#1e1e2e', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={16} color="#60a5fa" />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Audit History (Record #{auditRecord.id})</span>
              </div>
              <button type="button" onClick={() => setAuditRecord(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '20px', maxHeight: '400px', overflowY: 'auto' }}>
              {loadingEvents ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Loading event timeline...</div>
              ) : auditEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>No recorded events found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {auditEvents.map((ev) => (
                    <div key={ev.id} style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '12px', position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>
                          {ev.event_type}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '2px' }}>
                        {ev.notes || 'Status updated'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Actor: {ev.actor}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setAuditRecord(null)} style={{ padding: '0 16px', height: '32px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          8. SHARE COLLECTION LINK MODAL
          ══════════════════════════════════════════════════════════════════ */}
      {showShareModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShareModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
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
              width: '520px',
              maxWidth: '92vw',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.1)',
              overflow: 'hidden',
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
                <Share2 size={16} style={{ color: '#60a5fa' }} />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Share Student Data & Photo Collection Link</span>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                Share this secure link with students, parents, or staff. Submissions arrive directly into your{' '}
                <strong style={{ color: '#2563eb' }}>COLLECTION</strong> queue for review and auto-verification.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Public Portal Link
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    value={portalUrl}
                    style={{
                      flex: 1,
                      height: '36px',
                      padding: '0 10px',
                      fontSize: '12.5px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    style={{
                      height: '36px',
                      padding: '0 14px',
                      fontSize: '13px',
                      fontWeight: 700,
                      background: copiedLink ? '#10b981' : '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'background 0.2s',
                    }}
                  >
                    {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* WhatsApp Broadcast Template */}
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageSquare size={14} /> WhatsApp Broadcast Message
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyWhatsapp}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#15803d',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {copiedWhatsapp ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedWhatsapp ? 'Copied!' : 'Copy Template'}</span>
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#14532d', lineHeight: 1.4 }}>
                  Includes pre-composed student instructions, ID guidelines, and the direct self-service portal link.
                </p>
              </div>

              {/* Direct Open Link */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '12.5px',
                    color: '#2563eb',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  <ExternalLink size={13} />
                  <span>Preview Portal in New Tab</span>
                </a>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                style={{
                  padding: '0 16px',
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════════════
          TABLE CREATION WIZARD MODAL (WORKFLOW A: PRE-TABLE COLLECTION)
          ══════════════════════════════════════════════════════════════════ */}
      {showCreateTableModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !wizardLoading) setShowCreateTableModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
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
              width: '640px',
              maxWidth: '94vw',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'var(--font-family)',
              maxHeight: '90vh',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                background: '#4c1d95',
                color: '#ffffff',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} style={{ color: '#c084fc' }} />
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Table Creation Wizard
                  </span>
                  <span style={{ display: 'block', fontSize: '11px', color: '#e9d5ff' }}>
                    Synthesize live data table from collected submissions
                  </span>
                </div>
              </div>
              {!wizardLoading && (
                <button
                  type="button"
                  onClick={() => setShowCreateTableModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#e9d5ff',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
              {createdTableSuccess ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '20px 0', gap: '12px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={28} />
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
                      Table Created Successfully!
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                      Table <strong>{createdTableSuccess.table?.name}</strong> has been created with <strong>{createdTableSuccess.promoted_count}</strong> live Pending ID cards.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateTableModal(false);
                        if (onNavigate && createdTableSuccess.table?.id) {
                          onNavigate('idcard-actions', {
                            tableId: createdTableSuccess.table.id,
                            orgId,
                            tableName: createdTableSuccess.table.name,
                            status: 'pending',
                          });
                        }
                      }}
                      style={{
                        padding: '0 18px',
                        height: '36px',
                        fontSize: '13px',
                        fontWeight: 700,
                        borderRadius: '4px',
                        border: '1px solid #16a34a',
                        background: '#16a34a',
                        color: '#ffffff',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        textTransform: 'uppercase',
                      }}
                    >
                      <FolderInput size={15} /> Open Created Table
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateTableModal(false);
                        fetchRecords(activeTab, page, search);
                      }}
                      style={{
                        padding: '0 14px',
                        height: '36px',
                        fontSize: '13px',
                        fontWeight: 600,
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#475569',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                      }}
                    >
                      Stay in Collection
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '6px', padding: '10px 12px' }}>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#5b21b6', lineHeight: 1.4 }}>
                      Pro Panel will atomically generate a new table schema matching your collected fields, link this collection campaign to the new table, and promote all <strong>{counts.checked} checked submissions</strong> directly into the <strong>Pending ID Card Queue</strong>.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Table Name
                    </label>
                    <input
                      type="text"
                      value={wizardTableName}
                      onChange={(e) => setWizardTableName(e.target.value)}
                      placeholder="e.g. All Students 2026-27"
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 10px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#1e293b',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={wizardDescription}
                      onChange={(e) => setWizardDescription(e.target.value)}
                      placeholder="e.g. Generated from student data collection portal"
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 10px',
                        fontSize: '12.5px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#1e293b',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Schema & Field Mapping Preview */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                        Schema & Field Mapping Preview ({previewMappings.length} fields)
                      </label>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        Auto-normalized by FieldMappingService
                      </span>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden', maxHeight: '180px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Collected Field</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Target Column</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Type</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>Match Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewMappings.length === 0 ? (
                            <tr>
                              <td colSpan="4" style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>
                                Loading field mappings...
                              </td>
                            </tr>
                          ) : (
                            previewMappings.map((m, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1e293b' }}>
                                  {m.source_field}
                                </td>
                                <td style={{ padding: '6px 10px', color: '#475569' }}>
                                  <code style={{ background: '#f1f5f9', padding: '2px 5px', borderRadius: '3px' }}>
                                    {m.destination_column || m.target_column || m.source_field}
                                  </code>
                                </td>
                                <td style={{ padding: '6px 10px', color: '#64748b', textTransform: 'uppercase', fontSize: '11px' }}>
                                  {m.type || m.data_type || 'text'}
                                </td>
                                <td style={{ padding: '6px 10px' }}>
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      background: m.match_type === 'EXACT' ? '#dcfce7' : '#e0e7ff',
                                      color: m.match_type === 'EXACT' ? '#15803d' : '#4338ca',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    {m.match_type || 'AUTO'}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            {!createdTableSuccess && (
              <div
                style={{
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  disabled={wizardLoading}
                  onClick={() => setShowCreateTableModal(false)}
                  style={{
                    padding: '0 14px',
                    height: '32px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    cursor: wizardLoading ? 'not-allowed' : 'pointer',
                    textTransform: 'uppercase',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={wizardLoading || !wizardTableName.trim()}
                  onClick={async () => {
                    if (!activeCampaignId || !wizardTableName.trim()) return;
                    setWizardLoading(true);
                    try {
                      const res = await dataCollectionApi.createTableFromCollection(activeCampaignId, {
                        tableName: wizardTableName.trim(),
                        description: wizardDescription.trim(),
                        fieldMappings: previewMappings,
                      });
                      if (res.success) {
                        setCreatedTableSuccess(res);
                        addToast?.(res.message || 'Table created successfully!', 'success');
                      } else {
                        addToast?.(res.message || 'Failed to create table', 'error');
                      }
                    } catch (err) {
                      addToast?.(err?.response?.data?.message || err.message || 'Error creating table', 'error');
                    } finally {
                      setWizardLoading(false);
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0 18px',
                    height: '32px',
                    fontSize: '13px',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid #7c3aed',
                    background: wizardTableName.trim() && !wizardLoading ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' : '#cbd5e1',
                    color: '#ffffff',
                    cursor: wizardTableName.trim() && !wizardLoading ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                  }}
                >
                  <Sparkles size={14} />
                  {wizardLoading ? 'Creating Table...' : 'Create Table & Promote Cards'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SYNC TO EXISTING TABLE MODAL (WORKFLOW B)
          ══════════════════════════════════════════════════════════════════ */}
      {showSyncModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !syncing) setShowSyncModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
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
              width: '520px',
              maxWidth: '94vw',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'var(--font-family)',
            }}
          >
            {/* Header */}
            <div
              style={{
                background: '#047857',
                color: '#ffffff',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={18} style={{ color: '#6ee7b7' }} />
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Sync Submissions to Table
                  </span>
                  <span style={{ display: 'block', fontSize: '11px', color: '#a7f3d0' }}>
                    {tableMeta?.name || 'Target Table'}
                  </span>
                </div>
              </div>
              {!syncing && (
                <button
                  type="button"
                  onClick={() => setShowSyncModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#a7f3d0',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '10px 12px' }}>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#065f46', lineHeight: 1.4 }}>
                  Select the synchronization policy to merge student submissions into live ID cards. Existing card lifecycle statuses are strictly preserved.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Synchronization Policy
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    {
                      id: 'update_blank_only',
                      title: 'Update Blank Only (Safest & Recommended)',
                      desc: 'Only populates empty/blank fields in existing cards. Never overwrites existing operator data.',
                    },
                    {
                      id: 'replace_all',
                      title: 'Replace All Demographic Data',
                      desc: 'Overwrites existing demographic fields with latest submitted data. Preserves card status.',
                    },
                    {
                      id: 'photo_only',
                      title: 'Photo Only',
                      desc: 'Only updates the student photograph. Leaves all demographic text fields unchanged.',
                    },
                    {
                      id: 'create_missing',
                      title: 'Match Existing & Create Missing',
                      desc: 'Updates matching cards and automatically creates a new card if student is not found.',
                    },
                  ].map((p) => (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: syncPolicy === p.id ? '2px solid #059669' : '1px solid #e2e8f0',
                        background: syncPolicy === p.id ? '#f0fdf4' : '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="syncPolicy"
                        value={p.id}
                        checked={syncPolicy === p.id}
                        onChange={(e) => setSyncPolicy(e.target.value)}
                        style={{ marginTop: '2px' }}
                      />
                      <div>
                        <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                          {p.title}
                        </span>
                        <span style={{ display: 'block', fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                          {p.desc}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {selectedIds.size > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Record Scope
                  </label>
                  <div style={{ display: 'flex', gap: '14px', fontSize: '13px', color: '#334155' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="syncScope"
                        value="all_checked"
                        checked={syncScope === 'all_checked'}
                        onChange={() => setSyncScope('all_checked')}
                      />
                      <span>All Checked ({counts.checked})</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="syncScope"
                        value="selected"
                        checked={syncScope === 'selected'}
                        onChange={() => setSyncScope('selected')}
                      />
                      <span>Selected Only ({selectedIds.size})</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                disabled={syncing}
                onClick={() => setShowSyncModal(false)}
                style={{
                  padding: '0 14px',
                  height: '32px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const targetTableId = campaign?.table_id || tableId;
                    const res = await dataCollectionApi.syncCampaignToTable(activeCampaignId || targetTableId, {
                      tableId: targetTableId,
                      syncPolicy,
                      recordIds: syncScope === 'selected' ? Array.from(selectedIds) : null,
                    });
                    if (res.success) {
                      setShowSyncModal(false);
                      const msg = `Sync complete: Updated ${res.updated_count ?? 0}, Created ${res.created_count ?? 0}.`;
                      addToast?.(msg, 'success');
                      if (res.conflicts_count > 0) {
                        addToast?.(`Note: ${res.conflicts_count} record(s) had concurrent modification conflicts and were quarantined.`, 'warning');
                      }
                      setSelectedIds(new Set());
                      fetchRecords(activeTab, page, search);
                    } else {
                      addToast?.(res.message || 'Sync failed', 'error');
                    }
                  } catch (err) {
                    addToast?.(err?.response?.data?.message || err.message || 'Sync error', 'error');
                  } finally {
                    setSyncing(false);
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 18px',
                  height: '32px',
                  fontSize: '13px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  border: '1px solid #059669',
                  background: syncing ? '#cbd5e1' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  color: '#ffffff',
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                <Send size={14} />
                {syncing ? 'Synchronizing...' : 'Execute Sync'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}