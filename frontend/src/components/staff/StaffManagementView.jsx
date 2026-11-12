import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pen,
  ToggleRight,
  Link,
  Users,
  UsersRound,
  UserCog,
  Camera,
  Building2,
  Search,
  History,
  Building,
  Shield,
  ArrowLeft,
} from 'lucide-react';

import { SkeletonTableRows } from '../common/Skeleton';
import Button from '../common/Button';
import Input from '../common/Input';
import { operatorApi, assistantApi, photographerApi, managerApi } from '../../services/api';
import { STATUS_TABS } from '../../utils/constants';
import OrgActivityDrawer from '../organisation/OrgActivityDrawer';

export default function StaffManagementView({
  addToast,
  staffType = 'operator',
  scopedClientId,
  scopedClientOrg,
  onClearOrgScope,
  onOpenActionDrawer,
  onNavigate,
  onOpenDeleteModal,
}) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('All');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [_total, setTotal] = useState(0);
  const [pageSize] = useState(25);
  const [drawerStaff, setDrawerStaff] = useState(null);

  const isAssistant = staffType === 'assistant';
  const isPhotographer = staffType === 'photographer';
  const isManager = staffType === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      let apiItems = [];
      let totalCount = 0;
      const queryParams = {
        page,
        search,
        status: isAssistant && statusTab !== 'All' ? statusTab.toLowerCase() : '',
        page_size: pageSize,
      };

      if (isManager) {
        const res = await managerApi.list({
          organisation_id: scopedClientId || 'all',
          search,
          page,
          page_size: pageSize,
        });
        const raw = res?.managers || res?.data?.managers || (Array.isArray(res) ? res : []);
        apiItems = Array.isArray(raw) ? raw : [];
        totalCount = res?.total || res?.count || apiItems.length;
      } else if (isAssistant) {
        const res = await assistantApi.list({
          organisation_id: scopedClientId || 'all',
          client_id: scopedClientId || 'all',
          ...queryParams,
        });
        const raw = res?.data?.staff || res?.staff || res?.assistants || res?.results || (Array.isArray(res) ? res : []);
        apiItems = Array.isArray(raw) ? raw : [];
        totalCount = res?.total || res?.count || apiItems.length;
      } else if (isPhotographer) {
        const res = await photographerApi.list(queryParams);
        const raw = res?.photographers || res?.data?.photographers || res?.staff || res?.results || (Array.isArray(res) ? res : []);
        apiItems = Array.isArray(raw) ? raw : [];
        totalCount = res?.total || res?.count || apiItems.length;
      } else {
        const res = await operatorApi.list(queryParams);
        const raw = res?.operators || res?.results || res?.staff || (Array.isArray(res) ? res : []);
        apiItems = Array.isArray(raw) ? raw : [];
        totalCount = res?.total || res?.count || apiItems.length;
      }
      setStaffList(apiItems);
      setTotal(totalCount);
    } catch (err) {
      console.error('Load staff list API error:', err);
      setError(true);
      setStaffList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusTab, pageSize, isAssistant, isPhotographer, isManager, scopedClientId]);

  useEffect(() => {
    load();
    window.__reloadStaffList = load;
    return () => {
      if (window.__reloadStaffList === load) delete window.__reloadStaffList;
    };
  }, [load]);

  const filtered = React.useMemo(() => {
    if (!Array.isArray(staffList)) return [];
    return staffList.filter((s) => {
      if (!s || typeof s !== 'object') return false;
      const q = (search || '').toLowerCase().trim();
      const name = String(s.name || s.full_name || s.user?.get_full_name || '');
      const username = String(s.username || s.user?.username || '');
      const phone = String(s.phone || s.user?.phone || '');
      const email = String(s.email || s.user?.email || '');
      const orgName = String(s.organisation_name || s.client_name || s.organisation?.name || s.client?.name || '');
      const matchSearch =
        !q ||
        name.toLowerCase().includes(q) ||
        username.toLowerCase().includes(q) ||
        phone.includes(q) ||
        email.toLowerCase().includes(q) ||
        orgName.toLowerCase().includes(q);

      const statusStr = String(
        s.status ||
          (s.user?.is_active !== undefined
            ? s.user.is_active
              ? 'active'
              : 'inactive'
            : s.is_active !== undefined
              ? s.is_active
                ? 'active'
                : 'inactive'
              : 'active')
      ).toLowerCase();
      const isActive = statusStr === 'active' || statusStr === 'true' || s.is_active === true;
      const matchStatus = !isAssistant || statusTab === 'All' || (statusTab === 'Active' ? isActive : !isActive);

      const opType = String(
        s.operator_type ||
        s.role ||
        (s.designation && s.designation.toLowerCase().includes('photographer') ? 'photographer' : '') ||
        'data_manager'
      ).toLowerCase();

      const isPrime = Boolean(s.manager_type === 'prime_manager' || s.is_owner || s.role_title === 'Prime Manager');

      const matchRole =
        isAssistant ||
        (isManager
          ? roleFilter === 'all' ||
            (roleFilter === 'prime_manager' ? isPrime : !isPrime)
          : roleFilter === 'all' ||
            (roleFilter === 'photographer' ? opType === 'photographer' : opType !== 'photographer'));

      return matchSearch && matchStatus && matchRole;
    });
  }, [staffList, search, statusTab, roleFilter, isAssistant, isManager]);

  /* Dispatch footer data count & selection */
  useEffect(() => {
    let label = isManager ? 'Total Managers' : isAssistant ? 'Total Assistants' : 'Total Operators';
    if (isManager) {
      if (roleFilter === 'prime_manager') label = 'Total Prime Managers';
      else if (roleFilter === 'super_manager') label = 'Total Super Managers';
    } else if (!isAssistant) {
      if (roleFilter === 'photographer') label = 'Total Photographers';
      else if (roleFilter === 'data_manager') label = 'Total Data Managers';
    }
    let selectedText = '';
    if (selected) {
      const selStaff = staffList.find((s) => String(s.id) === String(selected));
      if (selStaff) {
        const staffName = selStaff.name || selStaff.full_name || selStaff.username || `Staff #${selected}`;
        if (isManager) {
          const rTitle = selStaff.role_title || (selStaff.manager_type === 'prime_manager' ? 'Prime Manager' : 'Super Manager');
          selectedText = `Selected: ${staffName} (${rTitle})`;
        } else if (isAssistant) {
          selectedText = `Selected: ${staffName} (Assistant)`;
        } else {
          const opType = String(
            selStaff.operator_type ||
            selStaff.role ||
            (selStaff.designation && selStaff.designation.toLowerCase().includes('photographer') ? 'photographer' : '') ||
            'data_manager'
          ).toLowerCase();
          const rTitle = opType === 'photographer' ? 'Photographer' : 'Data Manager';
          selectedText = `Selected: ${staffName} (${rTitle})`;
        }
      }
    }
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: `${label}: ${filtered.length}`,
          selectedText,
          count: filtered.length,
        },
      })
    );
  }, [staffList, filtered.length, selected, isAssistant, isManager, roleFilter]);

  const handleToggleStatus = async () => {
    if (!selected) return;
    const selStaff = staffList.find((s) => s.id === selected);

    try {
      if (isManager) {
        const currentlyActive = selStaff?.status !== 'inactive' && selStaff?.is_active !== false;
        await managerApi.update(selected, { is_active: !currentlyActive });
      } else if (isAssistant) {
        await assistantApi.toggleStatus(selected);
      } else if (isPhotographer) {
        await photographerApi.toggleStatus(selected);
      } else {
        await operatorApi.toggleStatus(selected);
      }
      addToast?.(`Status for "${selStaff?.name || 'user'}" updated successfully`, 'success');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update status';
      addToast?.(msg, 'error');
    } finally {
      load();
      window.__reloadDashboard?.();
    }
  };



  const selStaff = staffList.find((s) => s.id === selected);

  return (
    <div
      className="view-container"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* ── ACTION BAR ── */}
      <div
        className="action-bar"
        id="staff-action-bar"
        style={{
          background: '#1e1e2e',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          height: '42px',
          minHeight: '42px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}
      >
        {/* Left */}
        <div className="action-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isAssistant && (
            <div className="status-tabs">
              {STATUS_TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setStatusTab(t);
                    setPage(1);
                  }}
                  className={`status-tab${statusTab === t ? ' active' : ''}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {!isAssistant && !isManager && (
            <div className="status-tabs" style={{ display: 'flex', gap: '3px' }}>
              {[
                { id: 'all', label: 'All Roles' },
                { id: 'data_manager', label: 'Data Managers', icon: UserCog },
                { id: 'photographer', label: 'Photographers', icon: Camera },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setRoleFilter(id);
                    setPage(1);
                  }}
                  className={`status-tab${roleFilter === id ? ' active' : ''}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    padding: '0 10px',
                    height: '28px',
                    minHeight: '28px',
                    maxHeight: '28px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    fontWeight: roleFilter === id ? 700 : 600,
                  }}
                >
                  {Icon && <Icon size={12} />}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}

          {isManager && (
            <>
              <div
                className="action-divider"
                style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }}
              />
              <div className="status-tabs" style={{ display: 'flex', gap: '3px' }}>
                {[
                  { id: 'all', label: 'All Managers' },
                  { id: 'prime_manager', label: 'Prime Managers', icon: Shield },
                  { id: 'super_manager', label: 'Super Managers', icon: Users },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setRoleFilter(id);
                      setPage(1);
                    }}
                    className={`status-tab${roleFilter === id ? ' active' : ''}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      padding: '0 10px',
                      height: '28px',
                      minHeight: '28px',
                      maxHeight: '28px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      fontWeight: roleFilter === id ? 700 : 600,
                    }}
                  >
                    {Icon && <Icon size={12} />}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}





          <div
            className="action-divider"
            style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }}
          />

          <Input
            size="sm"
            variant="dark"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            onClear={() => {
              setSearch('');
              setPage(1);
            }}
            placeholder={`Search ${isManager ? 'managers' : isAssistant ? 'assistants' : roleFilter === 'photographer' ? 'photographers' : roleFilter === 'data_manager' ? 'data managers' : 'operators'}...`}
            icon={<Search size={12} />}
            clearable
            style={{ width: '220px' }}
          />
        </div>

        {/* Right */}
        <div className="action-bar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="btn-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Button
                size="sm"
                variant="primary"
                icon={<Plus size={13} />}
                onClick={() => {
                  if (isManager) {
                    onOpenActionDrawer?.('add-manager', scopedClientId ? { organisation_id: scopedClientId } : undefined);
                  } else if (isAssistant) {
                    onOpenActionDrawer?.('add-assistant', scopedClientId ? { client: scopedClientId } : undefined);
                  } else {
                    onOpenActionDrawer?.('add-operator', {
                      operator_type: roleFilter === 'photographer' ? 'photographer' : 'data_manager',
                    });
                  }
                }}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant={selected ? 'primary' : 'neutral'}
                disabled={!selected}
                icon={<Pen size={13} style={{ color: selected ? '#ffffff' : '#38bdf8' }} />}
                onClick={() => {
                  if (!selStaff) return;
                  if (isManager) {
                    onOpenActionDrawer?.('edit-manager', selStaff);
                  } else if (isAssistant) {
                    onOpenActionDrawer?.('edit-assistant', selStaff);
                  } else {
                    onOpenActionDrawer?.('edit-operator', selStaff);
                  }
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant={selected ? 'primary' : 'neutral'}
                disabled={!selected}
                icon={<Link size={13} style={{ color: selected ? '#ffffff' : '#60a5fa' }} />}
                onClick={() => {
                  if (!selStaff) return;
                  if (isManager) {
                    onOpenActionDrawer?.('edit-manager', selStaff);
                  } else if (isAssistant) {
                    onOpenActionDrawer?.('assign-assistant', selStaff);
                  } else {
                    onOpenActionDrawer?.('assign-operator', selStaff);
                  }
                }}
                title={isManager ? 'Assign Tables' : isAssistant ? 'Assign Groups / Classes' : 'Assign Organisations'}
              >
                Assign
              </Button>

            </div>
          </div>
        </div>
      </div>

      {/* ── TABLE CONTAINER ── */}
      <div
        className="table-wrapper"
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          position: 'relative',
        }}
      >
        <table className="data-table" id="staff-table" style={{ flexShrink: 0, minWidth: '920px', width: '100%', fontSize: '13px', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 25 }}>
            <tr style={{ height: '38px', minHeight: '38px', fontSize: '12.5px' }}>
              <th style={{ width: '44px', minWidth: '44px', textAlign: 'center', padding: '2px 3px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>S. No.</th>
              {(isAssistant || isManager) && (
                <th style={{ width: '180px', minWidth: '160px', textAlign: 'left', padding: '2px 6px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>Organisation</th>
              )}
              <th style={{ minWidth: '200px', width: 'auto', textAlign: 'left', padding: '2px 6px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>Name</th>
              <th style={{ width: '140px', minWidth: '130px', textAlign: 'center', padding: '2px 3px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>Username</th>
              {!isAssistant && (
                <th style={{ width: '140px', minWidth: '130px', textAlign: 'center', padding: '2px 3px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>Role</th>
              )}
              {!isAssistant && !isManager && (
                <th style={{ width: '75px', minWidth: '70px', textAlign: 'center', padding: '2px 3px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>Orgs</th>
              )}
              {isManager && (
                <th style={{ minWidth: '160px', textAlign: 'center', padding: '2px 3px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>Assigned Tables</th>
              )}
              {isAssistant && (
                <th style={{ minWidth: '160px', textAlign: 'center', padding: '2px 3px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>Assigned Scopes</th>
              )}
              <th style={{ width: '120px', minWidth: '110px', textAlign: 'center', padding: '2px 3px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>Phone</th>
              {isAssistant && (
                <th style={{ width: '85px', minWidth: '80px', textAlign: 'center', padding: '2px 3px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }}>Status</th>
              )}
              <th style={{ width: '44px', minWidth: '44px', textAlign: 'center', padding: '2px 3px', height: '38px', minHeight: '38px', boxSizing: 'border-box' }} title="Log">
                Log
              </th>
            </tr>
          </thead>
          <tbody id="staff-table-body">
            {loading ? (
              <SkeletonTableRows count={12} cols={isAssistant || isManager ? 9 : 7} dark={false} />
            ) : (
              filtered.map((s, idx) => {
                const rawUsername = String(s.username || s.user?.username || (s.email ? s.email.split('@')[0] : '') || '').replace(/^@/, '');
                const cleanUsername = rawUsername.length > 10 ? rawUsername.slice(0, 10) : rawUsername;
                const displayUsername = cleanUsername ? `@${cleanUsername}` : '—';
                const fullUsername = rawUsername ? `@${rawUsername}` : '';
                const displayName =
                  s.name ||
                  s.full_name ||
                  s.user?.get_full_name ||
                  `${isManager ? 'Manager' : isAssistant ? 'Assistant' : 'Operator'} #${s.id || idx + 1}`;
                const phone = s.phone || s.user?.phone || '—';
                const statusStr = String(
                  s.status ||
                    (s.user?.is_active !== undefined
                      ? s.user.is_active
                        ? 'active'
                        : 'inactive'
                      : s.is_active !== undefined
                        ? s.is_active
                          ? 'active'
                          : 'inactive'
                        : 'active')
                ).toLowerCase();
                const isActive = statusStr === 'active' || statusStr === 'true' || s.is_active === true;
                const isSel = s.id === selected;

                const orgName = s.organisation_name || s.client_name || s.organisation?.name || s.client?.name || '—';

                const opType = String(
                  s.operator_type ||
                  s.role ||
                  (s.designation && s.designation.toLowerCase().includes('photographer') ? 'photographer' : '') ||
                  'data_manager'
                ).toLowerCase();
                const isPhoto = opType === 'photographer';
                const isPrime = Boolean(s.manager_type === 'prime_manager' || s.is_owner || s.role_title === 'Prime Manager');

                // Compute assigned scopes text for assistants
                let assistantScopeText = 'All Tables';
                if (isAssistant) {
                  const parts = [];
                  if (s.allowed_classes && s.allowed_classes.length > 0) {
                    parts.push(`Cls: ${s.allowed_classes.join(', ')}`);
                  }
                  if (s.allowed_sections && s.allowed_sections.length > 0) {
                    parts.push(`Sec: ${s.allowed_sections.join(', ')}`);
                  }
                  if (s.allowed_branches && s.allowed_branches.length > 0) {
                    parts.push(`Br: ${s.allowed_branches.join(', ')}`);
                  }
                  if (parts.length > 0) {
                    assistantScopeText = parts.join(' | ');
                  } else if (Array.isArray(s.assignment_scopes) && s.assignment_scopes.length > 0) {
                    assistantScopeText = `${s.assignment_scopes.length} Scoped Rule(s)`;
                  } else if (s.assigned_table_ids && s.assigned_table_ids.length > 0) {
                    assistantScopeText = `${s.assigned_table_ids.length} Table(s)`;
                  }
                }

                // Compute assigned tables text for managers
                let managerTablesText = 'All Tables';
                if (isManager) {
                  if (Array.isArray(s.assigned_tables) && s.assigned_tables.length > 0) {
                    managerTablesText = s.assigned_tables.join(', ');
                  } else if (isPrime) {
                    managerTablesText = 'All Tables (Primary)';
                  }
                }

                return (
                  <tr
                    key={s.id || idx}
                    className={isSel ? 'selected' : ''}
                    onClick={() => setSelected(isSel ? null : s.id)}
                    data-staff-id={s.id}
                    style={{ height: '44px', minHeight: '44px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    <td
                      className="text-center"
                      style={{
                        width: '44px',
                        minWidth: '44px',
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#64748b',
                        fontSize: '12px',
                        padding: '2px',
                        height: '44px',
                        minHeight: '44px',
                        boxSizing: 'border-box',
                        verticalAlign: 'middle',
                      }}
                    >
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    {(isAssistant || isManager) && (
                      <td style={{ width: '180px', minWidth: '160px', padding: '2px 6px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: '12.5px', color: '#1e293b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                            {orgName}
                          </span>
                        </span>
                      </td>
                    )}
                    <td style={{ minWidth: '200px', width: 'auto', padding: '2px 6px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>{displayName}</span>
                    </td>
                    <td style={{ width: '140px', minWidth: '130px', textAlign: 'center', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }} title={fullUsername}>
                      {displayUsername !== '—' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            width: '120px',
                            boxSizing: 'border-box',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            letterSpacing: '0.01em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={fullUsername}
                        >
                          {displayUsername}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    {!isAssistant && (
                      <td className="text-center" style={{ width: '140px', minWidth: '130px', textAlign: 'center', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                        {isManager ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              height: '24px',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: isPrime ? '#eff6ff' : '#faf5ff',
                              color: isPrime ? '#1d4ed8' : '#7c3aed',
                              border: isPrime ? '1px solid #bfdbfe' : '1px solid #e9d5ff',
                            }}
                          >
                            {isPrime ? 'Prime Manager' : (s.role_title || 'Super Manager')}
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '5px',
                              height: '24px',
                              padding: '2px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                              background: isPhoto ? 'rgba(124, 58, 237, 0.1)' : 'rgba(37, 99, 235, 0.1)',
                              color: isPhoto ? '#7c3aed' : '#2563eb',
                              border: isPhoto ? '1.5px solid rgba(124, 58, 237, 0.3)' : '1.5px solid rgba(37, 99, 235, 0.3)',
                              boxSizing: 'border-box',
                            }}
                          >
                            {isPhoto ? 'Photographer' : 'Data Manager'}
                          </span>
                        )}
                      </td>
                    )}
                    {isManager && (
                      <td className="text-center" style={{ minWidth: '140px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '5px',
                            background: '#f8fafc',
                            color: '#475569',
                            border: '1px solid #e2e8f0',
                            display: 'inline-block',
                            maxWidth: '140px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={managerTablesText}
                        >
                          {managerTablesText}
                        </span>
                      </td>
                    )}
                    {isAssistant && (
                      <td className="text-center" style={{ minWidth: '140px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '5px',
                            background: '#f0fdf4',
                            color: '#15803d',
                            border: '1px solid #bbf7d0',
                            display: 'inline-block',
                            maxWidth: '140px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={assistantScopeText}
                        >
                          {assistantScopeText}
                        </span>
                      </td>
                    )}
                    {!isAssistant && !isManager && (
                      <td className="text-center" style={{ width: '75px', minWidth: '70px', textAlign: 'center', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(s.id);
                            onOpenActionDrawer?.('assign-operator', s);
                          }}
                          title={`Click to view/assign organisations for ${displayName}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            minWidth: '44px',
                            height: '24px',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: '#eff6ff',
                            color: '#1e40af',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            border: '1.5px solid #93c5fd',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxSizing: 'border-box',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#dbeafe';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#eff6ff';
                          }}
                        >
                          {s.assigned_organisations_count ?? s.assigned_clients_count ?? (Array.isArray(s.assigned_organisations) ? s.assigned_organisations.length : (Array.isArray(s.assigned_clients) ? s.assigned_clients.length : 0))}
                        </span>
                      </td>
                    )}
                    <td className="text-center" style={{ width: '120px', minWidth: '110px', color: '#334155', fontSize: '12.5px', fontWeight: 500, padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      {phone !== '—' && phone !== '-' ? phone : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    {isAssistant && (
                      <td className="text-center" style={{ width: '85px', minWidth: '80px', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '58px',
                            height: '24px',
                            padding: '2px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                            background: isActive ? '#dcfce7' : '#f1f5f9',
                            color: isActive ? '#15803d' : '#64748b',
                            border: isActive ? '1.5px solid #86efac' : '1.5px solid #cbd5e1',
                            boxSizing: 'border-box',
                          }}
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    )}
                    <td className="text-center" style={{ width: '44px', minWidth: '44px', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <button
                        className="client-history-trigger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawerStaff(s);
                        }}
                        title="View staff activity log"
                        style={{
                          width: '22px',
                          height: '22px',
                          border: 'none',
                          borderRadius: '3px',
                          background: 'rgba(37,99,235,0.1)',
                          color: '#2563eb',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <History size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Empty state — sibling to table so flex:1 fills remaining height */}
        {!loading && filtered.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              textAlign: 'center',
              minHeight: '240px',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(37,99,235,0.12)',
                border: '1px solid #bfdbfe',
                marginBottom: '12px',
              }}
            >
              {isManager ? <Users size={30} /> : isAssistant ? <UsersRound size={30} /> : roleFilter === 'photographer' ? <Camera size={30} /> : <UserCog size={30} />}
            </div>
            <div style={{ maxWidth: '340px' }}>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                {isManager
                  ? 'No Manager Accounts Found'
                  : isAssistant
                  ? 'No Assistant Accounts Found'
                  : roleFilter === 'photographer'
                  ? 'No Photographer Accounts Found'
                  : roleFilter === 'data_manager'
                  ? 'No Data Manager Accounts Found'
                  : 'No Operator Accounts Found'}
              </h4>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                {search
                  ? `No records match "${search}"`
                  : `There are no ${isManager ? 'manager' : isAssistant ? 'assistant' : roleFilter === 'photographer' ? 'photographer' : roleFilter === 'data_manager' ? 'data manager' : 'operator'} accounts registered yet.`}
              </p>
            </div>
            {!search && (
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  if (isManager) {
                    onOpenActionDrawer?.('add-manager', scopedClientId ? { organisation_id: scopedClientId } : undefined);
                  } else if (isAssistant) {
                    onOpenActionDrawer?.('add-assistant', scopedClientId ? { client: scopedClientId } : undefined);
                  } else {
                    onOpenActionDrawer?.('add-operator', {
                      operator_type: roleFilter === 'photographer' ? 'photographer' : 'data_manager',
                    });
                  }
                }}
                icon={<Plus size={14} />}
                style={{ marginTop: '14px' }}
              >
                Add First {isManager ? 'Manager' : isAssistant ? 'Assistant' : roleFilter === 'photographer' ? 'Photographer' : 'Operator'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Staff Activity & Audit Drawer */}
      <OrgActivityDrawer
        isOpen={Boolean(drawerStaff)}
        onClose={() => setDrawerStaff(null)}
        staff={drawerStaff}
        addToast={addToast}
      />
    </div>
  );
}

export {
  StaffManagementView as OperatorManagementView,
  StaffManagementView as AssistantManagementView,
  StaffManagementView as PhotographerManagementView,
  StaffManagementView as ManagerManagementView,
};
