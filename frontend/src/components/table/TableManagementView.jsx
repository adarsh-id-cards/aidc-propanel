import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings,
  Upload,
  Trash2,
  ArrowUp,
  X,
  Loader2,
  FileSpreadsheet,
  Plus,
  ToggleRight,
  School,
  BookOpen,
  Briefcase,
  Settings2,
  FolderKanban,
  FolderInput,
  Sparkles,
  ListFilter,
  Send,
  CheckCircle2,
  Pencil,
  Building,
} from 'lucide-react';

import CreateXlsxModal from '../common/CreateXlsxModal';
import Button from '../common/Button';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import { TableDrawerForm } from '../settings/TableSettingsView';
import { SkeletonTableRows, SkeletonList } from '../common/Skeleton';
import apiClient, { cardApi, schemaApi, clientApi, dataCollectionApi } from '../../services/api';
import { swrCache } from '../../utils/swrCache';


/* ── Table Type metadata ── */
const TABLE_TYPES = [
  {
    value: 'school_student',
    label: 'School Student',
    icon: School,
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
  },
  {
    value: 'college_student',
    label: 'College Student',
    icon: BookOpen,
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
  },
  { value: 'staff', label: 'Staff', icon: Briefcase, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  { value: 'custom', label: 'Custom', icon: Settings2, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
];

function getTableTypeMeta(value) {
  return TABLE_TYPES.find((t) => t.value === value) || TABLE_TYPES[3];
}

function inferTableType(tableName = '', orgName = '') {
  const name = (tableName || '').toLowerCase().trim();
  const org = (orgName || '').toLowerCase().trim();
  const staffRe = /\b(staff|teacher|teachers|employee|employees|emp|faculty|personnel|hr|driver|workers|management)\b/;
  const collegeRe =
    /\b(college|university|institute|polytechnic|degree|btech|mtech|bca|mca|mba|bsc|msc|ba|ma|bcom|mcom|semester|sem|branch|dept|department)\b/;
  const schoolRe = /\b(school|vidyalaya|academy|convent|class|std|standard|grade|section|sec)\b/;

  if (staffRe.test(name)) return 'staff';
  if (collegeRe.test(name)) return 'college_student';
  if (schoolRe.test(name)) return 'school_student';
  if (collegeRe.test(org)) return 'college_student';
  return 'school_student';
}

function getTableCounts(t) {
  if (!t) return { pending: 0, verified: 0, approved: 0, download: 0, pool: 0, rpCnt: 0, reqCnt: 0, confCnt: 0 };
  const pending = Math.max(t.pending_count || 0, t.pending || 0);
  const verified = Math.max(t.verified_count || 0, t.verified || 0);
  const approved = Math.max(t.approved_count || 0, t.approved || 0);
  const download = Math.max(t.download_count || 0, t.downloaded || 0, t.download || 0, t.printed || 0);
  const pool = Math.max(t.pool_count || 0, t.deleted || 0, t.pool || 0);

  const rpCnt = Math.max(t.reprint_count || 0, t.reprint || 0);
  const reqCnt = Math.max(t.reprint_request_count || 0, t.reprint_request || 0, t.request || 0, t.requested || 0);
  const confCnt = Math.max(t.reprint_confirmed_count || 0, t.reprint_confirmed || 0, t.confirmed || 0);

  return { pending, verified, approved, download, pool, rpCnt, reqCnt, confCnt };
}

function getDisplayOrgName(table, fallbackOrg) {
  if (!table) return '';
  const orgName = table.organisation_name || table.client_name || table.school_name || '';
  const ignoreList = ['—', 'Primary Org', 'Default Organisation', 'Default Organization', 'null', 'undefined'];
  if (orgName && !ignoreList.includes(String(orgName).trim())) {
    return String(orgName).trim();
  }
  if (fallbackOrg && !ignoreList.includes(String(fallbackOrg).trim())) {
    return String(fallbackOrg).trim();
  }
  return '';
}

const STATUS_BADGE_CONFIGS = {
  pending: { label: 'Pending', border: '#f97316', color: '#c2410c', bg: '#fff7ed', hoverBg: '#ffedd5', badgeBg: '#ea580c' },
  verified: { label: 'Verified', border: '#10b981', color: '#047857', bg: '#ecfdf5', hoverBg: '#d1fae5', badgeBg: '#059669' },
  approved: { label: 'Approved', border: '#2563eb', color: '#1d4ed8', bg: '#eff6ff', hoverBg: '#dbeafe', badgeBg: '#2563eb' },
  printed: { label: 'Printed', border: '#64748b', color: '#334155', bg: '#f8fafc', hoverBg: '#f1f5f9', badgeBg: '#475569' },
  deleted: { label: 'Deleted', border: '#ef4444', color: '#b91c1c', bg: '#fef2f2', hoverBg: '#fee2e2', badgeBg: '#dc2626' },
  reprint: { label: 'Reprinting', border: '#0891b2', color: '#0891b2', bg: '#ecfeff', hoverBg: '#cffafe', badgeBg: '#0891b2' },
  request: { label: 'Requested', border: '#8b5cf6', color: '#6d28d9', bg: '#f5f3ff', hoverBg: '#ede9fe', badgeBg: '#7c3aed' },
  confirm: { label: 'Confirmed', border: '#059669', color: '#047857', bg: '#ecfdf5', hoverBg: '#d1fae5', badgeBg: '#047857' },
  collection: { label: 'Collection', border: '#0284c7', color: '#0369a1', bg: '#f0f9ff', hoverBg: '#e0f2fe', badgeBg: '#0284c7' },
};

function TableStatusCountBadge({ statusKey, count, onClick, title }) {
  const cfg = STATUS_BADGE_CONFIGS[statusKey] || STATUS_BADGE_CONFIGS.pending;
  const numCount = Number(count) || 0;
  const hasCount = numCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '0 8px',
        height: '28px',
        minHeight: '28px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = cfg.hoverBg;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 3px 6px rgba(0, 0, 0, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = cfg.bg;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      title={title || `View ${cfg.label} List`}
    >
      <span>{cfg.label}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '20px',
          height: '18px',
          padding: '0 5px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 800,
          background: hasCount ? cfg.badgeBg : 'rgba(0, 0, 0, 0.08)',
          color: hasCount ? '#ffffff' : cfg.color,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count}
      </span>
    </button>
  );
}

export default function CardTableView({
  addToast,
  onNavigate,
  currentUser,
  userRole = 'super_admin',
  selectedClientId = null,
  selectedClientOrg = null,
  _onClearSelectedClient = null,
  onOrgResolved = null,
}) {
  const role = String(currentUser?.role || userRole || '').toLowerCase();
  const isAssistant = role === 'assistant';
  const isAdminOrOperator = ['prime_admin', 'super_admin', 'pro_user', 'operator'].includes(role);
  const isPrimeManager = ['prime_manager', 'client'].includes(role);
  const canCreateTable = isAdminOrOperator || isPrimeManager;

  const initialOrgId = selectedClientId ? String(selectedClientId) : null;
  const initialCached = initialOrgId ? swrCache.get(`tables_org_${initialOrgId}`) : null;

  const [tables, setTables] = useState(() => initialCached || []);
  const [loading, setLoading] = useState(() => !initialCached || initialCached.length === 0);
  const [filterOrgId, setFilterOrgId] = useState(initialOrgId);
  const [allOrganisations, setAllOrganisations] = useState([]);
  const [showCreateXlsxModal, setShowCreateXlsxModal] = useState(false);
  const [showDataCollectionPickerModal, setShowDataCollectionPickerModal] = useState(false);
  const [dataCollectionTableId, setDataCollectionTableId] = useState('');
  const [dcModalTab, setDcModalTab] = useState('existing_table'); // 'existing_table' | 'new_collection' | 'active_campaigns'
  const [newCampaignName, setNewCampaignName] = useState('');
  const [allowedClasses, setAllowedClasses] = useState('NURSERY, LKG, UKG, 1ST, 2ND, 3RD, 4TH, 5TH, 6TH, 7TH, 8TH, 9TH, 10TH, 11TH, 12TH');
  const [allowParentSubmission, setAllowParentSubmission] = useState(true);
  const [singleSubmissionOnly, setSingleSubmissionOnly] = useState(true);
  const [orgCampaigns, setOrgCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  /* Table selection in main view (Default to NULL so buttons are only active when selected!) */
  const [selectedTableId, setSelectedTableId] = useState(() => (initialCached && initialCached.length === 1 ? initialCached[0].id : null));

  /* Table Setting Drawers & Modals */
  const [showAddEditDrawer, setShowAddEditDrawer] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [groupId, setGroupId] = useState(1);


  /* Modal states for bulk actions */
  const [activeModal, setActiveModal] = useState(null);
  const [tableToDelete, setTableToDelete] = useState(null);
  const [tableDeleteCode, setTableDeleteCode] = useState('');

  /* Sync with selectedClientId prop */
  useEffect(() => {
    if (selectedClientId) {
      setFilterOrgId(String(selectedClientId));
    }
  }, [selectedClientId]);

  /* Load all organisations (Admin only) */
  useEffect(() => {
    (async () => {
      try {
        const data = await clientApi.getAllForAssignment?.();
        const clients = data?.clients || data?.results || (Array.isArray(data) ? data : []);
        setAllOrganisations(clients);
        if (clients.length > 0) {
          setGroupId((prev) => (!prev || prev === 1 ? (clients[0].group_id || clients[0].id || 1) : prev));
        }
      } catch {
        /* fallback */
      }
    })();
  }, []);

  /* Redirect if no organisation is scoped */
  useEffect(() => {
    if (!selectedClientId && (!filterOrgId || filterOrgId === 'all')) {
      onNavigate?.('organisations');
    }
  }, [selectedClientId, filterOrgId, onNavigate]);

  /* Load tables list strictly scoped to organisation */
  const loadTables = useCallback(async () => {
    const orgId = selectedClientId || (filterOrgId && filterOrgId !== 'all' ? filterOrgId : null);
    if (!orgId) {
      setTables([]);
      setSelectedTableId(null);
      setLoading(false);
      return;
    }
    const cached = swrCache.get(`tables_org_${orgId}`);
    if (cached && cached.length > 0) {
      setTables(cached);
      if (cached.length === 1) {
        setSelectedTableId(cached[0].id);
      }
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await schemaApi.getSchemas({ client_id: orgId });
      const list = data?.tables || data?.results || (Array.isArray(data) ? data : []);
      setTables(list);
      swrCache.set(`tables_org_${orgId}`, list, 3 * 60 * 1000);
      // Auto-select if organisation has exactly 1 table, otherwise unselect all
      if (list.length === 1) {
        setSelectedTableId(list[0].id);
      } else {
        setSelectedTableId(null);
      }
    } catch (err) {
      console.error('Load tables error:', err);
      if (!cached || cached.length === 0) {
        setTables([]);
        setSelectedTableId(null);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedClientId, filterOrgId]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const activeScopedOrg = useMemo(() => {
    const orgId = selectedClientId || (filterOrgId && filterOrgId !== 'all' ? filterOrgId : null);
    if (!orgId) return null;
    return allOrganisations.find((o) => String(o.id) === String(orgId)) || selectedClientOrg || null;
  }, [selectedClientId, filterOrgId, allOrganisations, selectedClientOrg]);

  useEffect(() => {
    if (activeScopedOrg && onOrgResolved) {
      onOrgResolved(activeScopedOrg);
    }
  }, [activeScopedOrg, onOrgResolved]);

  const selectedTable = useMemo(
    () => tables.find((t) => String(t.id) === String(selectedTableId)),
    [tables, selectedTableId]
  );

  /* Dispatch footer data count & selection */
  useEffect(() => {
    let selectedText = '';
    if (selectedTable) {
      selectedText = `Selected: ${selectedTable.name || 'Table'}`;
    }
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: `TOTAL TABLES: ${tables.length}`,
          selectedText,
          count: tables.length,
        },
      })
    );
  }, [tables.length, selectedTable]);

  /* Toggle Row Selection */
  const handleSelectRow = (tableId) => {
    setSelectedTableId((prev) => (String(prev) === String(tableId) ? null : tableId));
  };

  /* Toggle Table Status */
  const handleToggleStatus = async (tableToToggle) => {
    const target = tableToToggle || selectedTable;
    if (!target) return;
    try {
      await schemaApi.toggleTableStatus(target.id);
      addToast?.(`Status updated for "${target.name}"`, 'success');
      loadTables();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Error updating table status';
      addToast?.(msg, 'error');
    }
  };

  /* Delete Table with Confirmation Modal & PIN */
  const requestDeleteTable = (tableToDel) => {
    const target = tableToDel || selectedTable;
    if (!target) return;
    setTableToDelete(target);
    setTableDeleteCode(String(Math.floor(1000 + Math.random() * 9000)));
  };

  const filteredTables = useMemo(() => {
    return tables.filter(Boolean);
  }, [tables]);

  /* Open Data Collection Modal (Dual-Workflow: Pre-Table and Post-Table) */
  const handleOpenDataCollection = useCallback(async () => {
    const orgId = activeScopedOrg?.id || selectedClientId || (tables && tables[0]?.organisation_id);
    const availableTables = Array.isArray(filteredTables) && filteredTables.length > 0
      ? filteredTables
      : (Array.isArray(tables) ? tables : []);

    if (availableTables.length > 0) {
      setDataCollectionTableId(String(availableTables[0].id));
      setDcModalTab('existing_table');
    } else {
      setDcModalTab('new_collection');
    }

    setNewCampaignName(activeScopedOrg?.name ? `${activeScopedOrg.name} Collection` : 'Student Data Collection');
    setShowDataCollectionPickerModal(true);

    if (orgId) {
      setLoadingCampaigns(true);
      try {
        const res = await dataCollectionApi.listCampaigns(orgId);
        if (res.success) {
          setOrgCampaigns(res.campaigns || []);
        }
      } catch (err) {
        console.error('Failed to load campaigns:', err);
      } finally {
        setLoadingCampaigns(false);
      }
    }
  }, [activeScopedOrg, selectedClientId, filteredTables, tables]);

  const handleCreateStandaloneCampaign = async () => {
    const orgId = activeScopedOrg?.id || selectedClientId || (tables && tables[0]?.organisation_id);
    if (!orgId) {
      addToast?.('Please select an organisation first', 'warning');
      return;
    }
    if (!newCampaignName.trim()) {
      addToast?.('Please enter a collection name', 'warning');
      return;
    }
    setCreatingCampaign(true);
    try {
      const res = await dataCollectionApi.createCampaign(orgId, {
        campaign_name: newCampaignName.trim(),
        destination_type: 'NEW_TABLE',
        allowed_classes: allowedClasses.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        allow_parent_submission: allowParentSubmission,
        single_submission_only: singleSubmissionOnly,
      });
      if (res.success && res.campaign) {
        setShowDataCollectionPickerModal(false);
        addToast?.('Standalone collection campaign created successfully!', 'success');
        if (onNavigate) {
          onNavigate('data-collection', {
            campaignId: res.campaign.id,
            orgId,
            campaignName: res.campaign.campaign_name,
          });
        }
      } else {
        addToast?.(res.message || 'Failed to create collection', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || err.message || 'Error creating collection', 'error');
    } finally {
      setCreatingCampaign(false);
    }
  };

  const openIDCardActions = (table, status = 'pending') => {
    if (onNavigate) {
      const orgId = table?.organisation_id || table?.client_id || (activeScopedOrg ? activeScopedOrg.id : null);
      const orgName = table?.organisation_name || table?.client_name || (activeScopedOrg ? (activeScopedOrg.name || activeScopedOrg.school_name) : null);
      onNavigate('idcard-actions', {
        tableId: table.id,
        status,
        orgId,
        orgName,
        tableName: table.name,
      });
    }
  };

  return (
    <div
      className="view-container"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* ── ACTION BAR / TOPBAR ── */}
      <div
        className="action-bar"
        id="idcard-group-action-bar"
        style={{
          background: '#1e293b',
          borderBottom: '1px solid #0f172a',
          height: '46px',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}
      >
        {/* Left Side: Status Filters | 4 Table Action Buttons | 2 XLSX Buttons */}
        <div className="action-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Section 1: Table Action Buttons (Hidden for Assistant) */}
          {!isAssistant && (
            <>
              <div className="btn-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* 1. Add Button */}
                {canCreateTable && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setEditingTable(null);
                      setShowAddEditDrawer(true);
                    }}
                    icon={<Plus size={14} />}
                    title="Add New Table"
                  >
                    Add
                  </Button>
                )}

                {/* 2. Edit Button */}
                <Button
                  size="sm"
                  variant={selectedTable ? 'primary' : 'neutral'}
                  disabled={!selectedTable}
                  onClick={() => {
                    setEditingTable(selectedTable);
                    setShowAddEditDrawer(true);
                  }}
                  title={!selectedTable ? 'Select a table row to edit' : `Edit ${selectedTable.name}`}
                  icon={<Pencil size={14} style={{ color: selectedTable ? '#ffffff' : '#38bdf8' }} />}
                >
                  Edit
                </Button>
              </div>
            </>
          )}

          {/* | Divider */}
          <span style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.2)', margin: '0 4px' }} />

          {/* Section 3: XLSX Buttons */}
          <div className="btn-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {canCreateTable && (
              <Button
                size="sm"
                variant="success"
                onClick={() => setShowCreateXlsxModal(true)}
                title="Create table directly from an XLSX file"
                icon={<FileSpreadsheet size={14} />}
              >
                Create with Data
              </Button>
            )}

            <Button
              size="sm"
              variant="primary"
              onClick={handleOpenDataCollection}
              title="Collect demographic data and photos for this organisation"
              icon={<FolderInput size={14} />}
            >
              Data Collection
            </Button>
          </div>
        </div>

        {/* Right Side: Bulk Actions for Selected Table */}
        <div className="action-bar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="btn-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Button
                size="sm"
                variant={selectedTable ? 'warning' : 'neutral'}
                disabled={!selectedTable}
                onClick={() => setActiveModal('reupload')}
                title={!selectedTable ? 'Select a table row first' : `Reupload Images for ${selectedTable.name}`}
                icon={<Upload size={14} style={{ color: selectedTable ? '#ffffff' : '#fbbf24' }} />}
              >
                Reupload Image
              </Button>

              <Button
                size="sm"
                variant={selectedTable ? 'success' : 'neutral'}
                disabled={!selectedTable}
                onClick={() => setActiveModal('upgrade')}
                title={!selectedTable ? 'Select a table row first' : `Upgrade All Class for ${selectedTable.name}`}
                icon={<ArrowUp size={14} style={{ color: selectedTable ? '#ffffff' : '#4ade80' }} />}
              >
                Upgrade All Class
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN TABLE GROUP DATA TABLE ── */}
      <div
        id="gs-table-container"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
      >
        <div className="table-wrapper" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <table className="data-table" style={{ width: '100%', minWidth: '1020px', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                  boxShadow: '0 -4px 0 0 #1e293b, 0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                  borderBottom: '2px solid #0f172a',
                }}
              >
                <tr style={{ height: '30px', minHeight: '30px' }}>
                  <th
                    style={{
                      width: '55px',
                      minWidth: '55px',
                      textAlign: 'center',
                      padding: '4px 6px',
                      color: '#f8fafc',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      letterSpacing: '0.04em',
                      background: 'transparent',
                      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                      boxSizing: 'border-box',
                    }}
                  >
                    S. NO.
                  </th>
                  <th
                    style={{
                      width: '240px',
                      minWidth: '220px',
                      textAlign: 'left',
                      padding: '4px 10px',
                      color: '#f8fafc',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      letterSpacing: '0.04em',
                      background: 'transparent',
                      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                      boxSizing: 'border-box',
                    }}
                  >
                    NAME
                  </th>
                  <th
                    colSpan={isAssistant ? "3" : "5"}
                    style={{
                      textAlign: 'center',
                      padding: '4px 8px',
                      color: '#f8fafc',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      letterSpacing: '0.04em',
                      background: 'transparent',
                      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                      boxSizing: 'border-box',
                    }}
                  >
                    ID CARD LISTS
                  </th>
                  {!isAssistant && (
                    <th
                      colSpan="3"
                      style={{
                        textAlign: 'center',
                        padding: '4px 8px',
                        color: '#f8fafc',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        letterSpacing: '0.04em',
                        background: 'transparent',
                        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                        boxSizing: 'border-box',
                      }}
                    >
                      REPRINT CARD LISTS
                    </th>
                  )}
                  <th
                    style={{
                      width: '95px',
                      minWidth: '90px',
                      textAlign: 'center',
                      padding: '4px 6px',
                      color: '#f8fafc',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      letterSpacing: '0.04em',
                      background: 'transparent',
                      borderRight: isAdminOrOperator ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    STATUS
                  </th>
                  {isAdminOrOperator && (
                    <th
                      style={{
                        width: '85px',
                        minWidth: '80px',
                        textAlign: 'center',
                        padding: '4px 6px',
                        color: '#f8fafc',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        letterSpacing: '0.04em',
                        background: 'transparent',
                        borderRight: 'none',
                        boxSizing: 'border-box',
                      }}
                    >
                      EDIT
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows count={8} cols={isAdminOrOperator ? 10 : 9} rowHeight="44px" />
                ) : filteredTables.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdminOrOperator ? 10 : 9}
                      style={{
                        padding: '60px 20px',
                        textAlign: 'center',
                        border: 'none',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <FolderKanban size={40} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                        <h4 style={{ margin: '0 0 6px', color: '#334155', fontSize: '16px', fontWeight: 600 }}>
                          No Tables Found
                        </h4>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
                          Click <strong>Add</strong> or <strong>Create with XLSX</strong> to create your first table.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTables.map((t, idx) => {
                  const isSel = String(t.id) === String(selectedTableId);
                  const counts = getTableCounts(t);
                  const isActive = t.is_active !== false;

                  return (
                    <tr
                      key={t.id}
                      onClick={() => handleSelectRow(t.id)}
                      style={{
                        background: isSel ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        cursor: 'pointer',
                        transition: 'background-color 0.12s ease-in-out',
                      }}
                      className={isSel ? 'selected' : ''}
                      onMouseEnter={(e) => {
                        if (!isSel) e.currentTarget.style.backgroundColor = '#f1f5f9';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSel) e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                      }}
                    >
                      {/* S. NO. Column */}
                      <td
                        style={{
                          padding: '4px 6px',
                          textAlign: 'center',
                          fontWeight: 600,
                          color: '#64748b',
                          fontSize: '13px',
                          borderLeft: isSel ? '3px solid #2563eb' : 'none',
                          borderRight: '1px solid #f1f5f9',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {idx + 1}
                      </td>

                      {/* NAME Column */}
                      <td style={{ padding: '4px 10px', textAlign: 'left', minWidth: '220px', borderRight: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#2563eb',
                              flexShrink: 0,
                            }}
                          >
                            <FolderKanban size={14} />
                          </div>
                          <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '14px' }}>{t.name}</span>
                        </div>
                      </td>

                      {/* ID CARD LISTS Badges */}
                      <td colSpan={isAssistant ? "3" : "5"} style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                          <TableStatusCountBadge
                            statusKey="collection"
                            count={counts.collection || 0}
                            title="Open Data & Photo Collection queue"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigate) {
                                onNavigate('data-collection', {
                                  tableId: t.id,
                                  orgId: activeScopedOrg?.id || t.organisation_id || t.client_id,
                                  tableName: t.name,
                                });
                              }
                            }}
                          />
                          <TableStatusCountBadge
                            statusKey="pending"
                            count={counts.pending}
                            onClick={(e) => {
                              e.stopPropagation();
                              openIDCardActions(t, 'pending');
                            }}
                          />
                          <TableStatusCountBadge
                            statusKey="verified"
                            count={counts.verified}
                            onClick={(e) => {
                              e.stopPropagation();
                              openIDCardActions(t, 'verified');
                            }}
                          />
                          {!isAssistant && (
                            <>
                              <TableStatusCountBadge
                                statusKey="approved"
                                count={counts.approved}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openIDCardActions(t, 'approved');
                                }}
                              />
                              <TableStatusCountBadge
                                statusKey="printed"
                                count={counts.download}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openIDCardActions(t, 'printed');
                                }}
                              />
                            </>
                          )}
                          <TableStatusCountBadge
                            statusKey="deleted"
                            count={counts.pool}
                            onClick={(e) => {
                              e.stopPropagation();
                              openIDCardActions(t, 'deleted');
                            }}
                          />
                        </div>
                      </td>

                      {/* REPRINT CARD LISTS */}
                      {!isAssistant && (
                        <td colSpan="3" style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                            <TableStatusCountBadge
                              statusKey="reprint"
                              count={counts.rpCnt}
                              onClick={(e) => {
                                e.stopPropagation();
                                openIDCardActions(t, 'reprint');
                              }}
                            />
                            <TableStatusCountBadge
                              statusKey="request"
                              count={counts.reqCnt}
                              onClick={(e) => {
                                e.stopPropagation();
                                openIDCardActions(t, 'request');
                              }}
                            />
                            <TableStatusCountBadge
                              statusKey="confirm"
                              count={counts.confCnt}
                              onClick={(e) => {
                                e.stopPropagation();
                                openIDCardActions(t, 'confirm');
                              }}
                            />
                          </div>
                        </td>
                      )}

                      {/* STATUS Column — Read-only indicator */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', width: '95px', minWidth: '90px', borderRight: isAdminOrOperator ? '1px solid #f1f5f9' : 'none' }}>
                        <span
                          style={{
                            padding: '0 12px',
                            height: '24px',
                            minHeight: '24px',
                            borderRadius: '4px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            background: isActive ? '#ecfdf5' : '#fef2f2',
                            color: isActive ? '#047857' : '#b91c1c',
                            border: isActive ? '1px solid #a7f3d0' : '1px solid #fecaca',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                            userSelect: 'none',
                            boxSizing: 'border-box',
                          }}
                          title={isActive ? 'Table is Active' : 'Table is Inactive'}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: isActive ? '#10b981' : '#ef4444',
                              display: 'inline-block',
                            }}
                          />
                          <span>{isActive ? 'Active' : 'Inactive'}</span>
                        </span>
                      </td>

                      {/* EDIT Column (Visible for Super Admin, Pro User, Admin, Operator — Hidden for Org roles) */}
                      {isAdminOrOperator && (
                        <td style={{ padding: '6px 8px', textAlign: 'center', width: '85px', minWidth: '80px' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTableId(t.id);
                              setEditingTable(t);
                              setShowAddEditDrawer(true);
                            }}
                            style={{
                              padding: '0 12px',
                              height: '26px',
                              minHeight: '26px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: '#eff6ff',
                              color: '#2563eb',
                              border: '1px solid #bfdbfe',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                              boxShadow: '0 1px 2px rgba(37, 99, 235, 0.05)',
                              transition: 'all 0.15s ease-in-out',
                              userSelect: 'none',
                              boxSizing: 'border-box',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#2563eb';
                              e.currentTarget.style.color = '#ffffff';
                              e.currentTarget.style.borderColor = '#1d4ed8';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#eff6ff';
                              e.currentTarget.style.color = '#2563eb';
                              e.currentTarget.style.borderColor = '#bfdbfe';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                            title={`Edit ${t.name}`}
                          >
                            <Pencil size={12} />
                            <span>Edit</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                }))}
              </tbody>
            </table>
        </div>
      </div>

      {/* ── MODALS & DRAWERS ── */}

      
            {/* Data Collection Dual-Workflow Modal */}
      {showDataCollectionPickerModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDataCollectionPickerModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
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
              width: '540px',
              maxWidth: '94vw',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'var(--font-family)',
            }}
          >
            {/* Header */}
            <div
              style={{
                background: '#0f172a',
                color: '#ffffff',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderInput size={18} style={{ color: '#38bdf8' }} />
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Data & Photo Collection
                  </span>
                  <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8' }}>
                    {activeScopedOrg?.name || 'Organisation Workspace'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDataCollectionPickerModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Workflow Mode Switch Tabs */}
            <div
              style={{
                display: 'flex',
                background: '#f1f5f9',
                borderBottom: '1px solid #e2e8f0',
                padding: '0 8px',
                gap: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => setDcModalTab('existing_table')}
                style={{
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  border: 'none',
                  background: dcModalTab === 'existing_table' ? '#ffffff' : 'transparent',
                  color: dcModalTab === 'existing_table' ? '#0284c7' : '#64748b',
                  borderBottom: dcModalTab === 'existing_table' ? '2px solid #0284c7' : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FolderInput size={14} />
                <span>Existing Table</span>
              </button>
              <button
                type="button"
                onClick={() => setDcModalTab('new_collection')}
                style={{
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  border: 'none',
                  background: dcModalTab === 'new_collection' ? '#ffffff' : 'transparent',
                  color: dcModalTab === 'new_collection' ? '#7c3aed' : '#64748b',
                  borderBottom: dcModalTab === 'new_collection' ? '2px solid #7c3aed' : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Sparkles size={14} />
                <span>Start New Collection (Pre-Table)</span>
              </button>
              <button
                type="button"
                onClick={() => setDcModalTab('active_campaigns')}
                style={{
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  border: 'none',
                  background: dcModalTab === 'active_campaigns' ? '#ffffff' : 'transparent',
                  color: dcModalTab === 'active_campaigns' ? '#0f172a' : '#64748b',
                  borderBottom: dcModalTab === 'active_campaigns' ? '2px solid #0f172a' : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <ListFilter size={14} />
                <span>Active ({orgCampaigns.length})</span>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '60vh', overflowY: 'auto' }}>
              {/* TAB 1: Existing Table (Workflow B) */}
              {dcModalTab === 'existing_table' && (
                <>
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '10px 12px' }}>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#0369a1', lineHeight: 1.4 }}>
                      <strong>Workflow B — Post-Table Collection:</strong> Collect student data and photos directly into an existing table. Submissions will be verified in the Checked queue and synchronized into live ID Cards.
                    </p>
                  </div>

                  {Array.isArray(tables) && tables.length > 0 ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Select Target Table
                      </label>
                      <select
                        value={dataCollectionTableId}
                        onChange={(e) => setDataCollectionTableId(e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '0 10px',
                          fontSize: '13px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#1e293b',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {(filteredTables || tables || []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 10px 0' }}>
                        No tables created yet in this organisation.
                      </p>
                      <button
                        type="button"
                        onClick={() => setDcModalTab('new_collection')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '0 14px',
                          height: '32px',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          borderRadius: '4px',
                          border: '1px solid #7c3aed',
                          background: '#7c3aed',
                          color: '#ffffff',
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                        }}
                      >
                        <Sparkles size={14} /> Start New Collection Instead
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: New Standalone Collection (Workflow A) */}
              {dcModalTab === 'new_collection' && (
                <>
                  <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '6px', padding: '10px 12px' }}>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#6b21a8', lineHeight: 1.4 }}>
                      <strong>Workflow A — Pre-Table Collection:</strong> Collect student data and photos before creating a table. Once parents and students submit their details, you can launch the Table Creation Wizard to generate a live table.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Collection / Campaign Name
                    </label>
                    <input
                      type="text"
                      value={newCampaignName}
                      onChange={(e) => setNewCampaignName(e.target.value)}
                      placeholder="e.g. Student Admissions 2026-27"
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
                      Allowed Classes (Comma-Separated)
                    </label>
                    <input
                      type="text"
                      value={allowedClasses}
                      onChange={(e) => setAllowedClasses(e.target.value)}
                      style={{
                        width: '100%',
                        height: '36px',
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={allowParentSubmission}
                        onChange={(e) => setAllowParentSubmission(e.target.checked)}
                      />
                      <span>Allow Parent / Guardian submissions with multi-child support</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={singleSubmissionOnly}
                        onChange={(e) => setSingleSubmissionOnly(e.target.checked)}
                      />
                      <span>Single submission per student (quarantine duplicate Roll Nos)</span>
                    </label>
                  </div>
                </>
              )}

              {/* TAB 3: Active Campaigns List */}
              {dcModalTab === 'active_campaigns' && (
                <>
                  {loadingCampaigns ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
                      Loading campaigns...
                    </div>
                  ) : orgCampaigns.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: '13px' }}>
                      No collection campaigns found for this organisation.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {orgCampaigns.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                                {c.campaign_name}
                              </span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: c.destination_type === 'NEW_TABLE' ? '#f3e8ff' : '#e0f2fe',
                                  color: c.destination_type === 'NEW_TABLE' ? '#7e22ce' : '#0369a1',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {c.destination_type === 'NEW_TABLE' ? 'Pre-Table' : 'Table-Bound'}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              State: {c.campaign_state} • {c.submissions_count || 0} Submissions
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowDataCollectionPickerModal(false);
                              if (onNavigate) {
                                onNavigate('data-collection', {
                                  campaignId: c.id,
                                  orgId: activeScopedOrg?.id,
                                  campaignName: c.campaign_name,
                                  tableId: c.table_id,
                                });
                              }
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '0 12px',
                              height: '28px',
                              fontSize: '12px',
                              fontWeight: 700,
                              borderRadius: '4px',
                              border: '1px solid #0284c7',
                              background: '#0284c7',
                              color: '#ffffff',
                              cursor: 'pointer',
                              textTransform: 'uppercase',
                            }}
                          >
                            Open
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
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
                onClick={() => setShowDataCollectionPickerModal(false)}
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
                  textTransform: 'uppercase',
                }}
              >
                Cancel
              </button>

              {dcModalTab === 'existing_table' && (
                <button
                  type="button"
                  disabled={!dataCollectionTableId}
                  onClick={() => {
                    if (!dataCollectionTableId) return;
                    const chosenTable = (filteredTables || tables || []).find((t) => String(t.id) === String(dataCollectionTableId));
                    if (onNavigate) {
                      onNavigate('data-collection', {
                        tableId: Number(dataCollectionTableId),
                        orgId: activeScopedOrg?.id || chosenTable?.organisation_id || chosenTable?.client_id,
                        tableName: chosenTable?.name,
                      });
                    }
                    setShowDataCollectionPickerModal(false);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0 16px',
                    height: '32px',
                    fontSize: '13px',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid #0284c7',
                    background: dataCollectionTableId ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#cbd5e1',
                    color: '#ffffff',
                    cursor: dataCollectionTableId ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                  }}
                >
                  <FolderInput size={14} />
                  Open Table Collection
                </button>
              )}

              {dcModalTab === 'new_collection' && (
                <button
                  type="button"
                  disabled={creatingCampaign || !newCampaignName.trim()}
                  onClick={handleCreateStandaloneCampaign}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0 16px',
                    height: '32px',
                    fontSize: '13px',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid #7c3aed',
                    background: newCampaignName.trim() ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' : '#cbd5e1',
                    color: '#ffffff',
                    cursor: newCampaignName.trim() ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                  }}
                >
                  <Sparkles size={14} />
                  {creatingCampaign ? 'Creating...' : 'Create & Launch Collection'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
{/* 3-Step Create Table from XLSX Modal */}
      {showCreateXlsxModal && (
        <CreateXlsxModal
          groupId={activeScopedOrg?.id || selectedClientId || (filterOrgId && filterOrgId !== 'all' ? filterOrgId : null) || groupId || 1}
          onClose={() => setShowCreateXlsxModal(false)}
          onSuccess={() => loadTables()}
          addToast={addToast}
        />
      )}

      {/* Add / Edit Table Drawer */}
      {showAddEditDrawer && (
        <TableDrawerForm
          editingTable={editingTable}
          groupId={activeScopedOrg?.id || selectedClientId || (filterOrgId && filterOrgId !== 'all' ? filterOrgId : null) || groupId || 1}
          orgName={activeScopedOrg?.name || selectedTable?.client_name || selectedClientOrg?.name || ''}
          onClose={() => setShowAddEditDrawer(false)}
          onSave={() => {
            setShowAddEditDrawer(false);
            loadTables();
          }}
          onDeleteTable={(tbl) => {
            setShowAddEditDrawer(false);
            requestDeleteTable(tbl);
          }}
          addToast={addToast}
        />
      )}

      {/* ── Table Deletion Confirmation Modal with PIN ── */}
      <ConfirmDeleteModal
        isOpen={Boolean(tableToDelete)}
        onClose={() => setTableToDelete(null)}
        title={`Delete Table "${tableToDelete?.name || ''}"`}
        headline={`Delete Table "${tableToDelete?.name || ''}"`}
        itemDescription={`table "${tableToDelete?.name || ''}" and all its ID cards`}
        customMessage={`Are you sure you want to permanently delete table "${tableToDelete?.name || ''}" and all associated ID cards? Please enter the verification PIN below to confirm.`}
        note="Note: This action is permanent and cannot be undone."
        requiresCode={true}
        deleteCode={tableDeleteCode}
        confirmText="Delete"
        confirmVariant="danger"
        icon={<Trash2 size={24} style={{ color: '#ef4444' }} />}
        onConfirm={async () => {
          if (!tableToDelete) return;
          try {
            await schemaApi.deleteTable(tableToDelete.id);
            addToast?.(`Table "${tableToDelete.name}" deleted successfully`, 'success');
            if (selectedTableId === tableToDelete.id) setSelectedTableId(null);
            setTableToDelete(null);
            loadTables();
          } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Error deleting table';
            addToast?.(msg, 'error');
          }
        }}
      />
    </div>
  );
}
