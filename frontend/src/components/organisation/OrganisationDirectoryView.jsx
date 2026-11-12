import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pen,
  Eye,
  EyeOff,
  Users,
  UsersRound,
  Trash2,
  ToggleRight,
  ToggleLeft,
  Building,
  CreditCard,
  Search,
  X,
  Save,
  Mail,
  Phone,
  Shield,
  CheckCircle2,
  User,
  History,
  ExternalLink,
} from 'lucide-react';

import { SkeletonTableRows, SkeletonList } from '../common/Skeleton';
import CustomSelect from '../common/CustomSelect';
import Button from '../common/Button';
import Input from '../common/Input';
import OrgActivityDrawer from './OrgActivityDrawer';
import { clientApi, managerApi, assistantApi, schemaApi } from '../../services/api';
import { STATUS_TABS } from '../../utils/constants';

export default function ClientDirectoryView({ addToast, onOpenActionDrawer, onNavigate, onOpenDeleteModal }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('All');
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [_total, setTotal] = useState(0);
  const [showOrgLogDrawer, setShowOrgLogDrawer] = useState(false);
  const [logOrg, setLogOrg] = useState(null);


  /* Dispatch footer data count & selection */
  useEffect(() => {
    let selectedText = '';
    if (selected) {
      const match = clients.find((c) => String(c.id) === String(selected));
      if (match) {
        const orgName = match.name || match.school_name || match.username || 'Organisation';
        selectedText = `Selected: ${orgName}`;
      }
    }
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: `Total Organisations: ${clients.length}`,
          selectedText,
          count: clients.length,
        },
      })
    );
  }, [clients, selected]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await clientApi.getActive({
        page,
        search,
        status: statusTab !== 'All' ? statusTab.toLowerCase() : '',
        page_size: pageSize,
      });
      const list = Array.isArray(data?.clients)
        ? data.clients
        : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data)
            ? data
            : [];
      setClients(list);
      setTotal(data?.total || data?.count || list.length);
    } catch (err) {
      console.error('Load client directory error:', err);
      setClients([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusTab, pageSize]);

  useEffect(() => {
    load();
    window.__reloadClientDirectory = load;
    window.__reloadClients = load;
    return () => {
      if (window.__reloadClientDirectory === load) delete window.__reloadClientDirectory;
      if (window.__reloadClients === load) delete window.__reloadClients;
    };
  }, [load]);

  const selClient = clients.find((c) => c.id === selected);

  const handleToggleStatus = async (clientToToggle = null) => {
    const target = clientToToggle && clientToToggle.id ? clientToToggle : selClient;
    const targetId = target?.id || selected;
    if (!targetId) return;

    try {
      await clientApi.toggleStatus(targetId);
      addToast?.(`Status toggled for ${target?.name || 'organisation'}`, 'success');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to toggle status';
      addToast?.(msg, 'error');
    } finally {
      load();
      window.__reloadDashboard?.();
    }
  };

  const [showManagersDrawer, setShowManagersDrawer] = useState(false);
  const [showAssistantsDrawer, setShowAssistantsDrawer] = useState(false);
  const [editingManager, setEditingManager] = useState(null); // null | 'new' | managerObj
  const [editingAssistant, setEditingAssistant] = useState(null); // null | 'new' | assistantObj
  const [orgManagers, setOrgManagers] = useState([]);
  const [orgAssistants, setOrgAssistants] = useState([]);
  const [orgTables, setOrgTables] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const getManagerCount = useCallback((org) => {
    if (!org) return 1;
    return org.managers_count ?? org.manager_count ?? 1;
  }, []);

  const getAssistantCount = useCallback((org) => {
    if (!org) return 0;
    return org.assistants_count ?? org.assistant_count ?? 0;
  }, []);

  const loadOrgTables = useCallback(async (org) => {
    if (!org?.id) return;
    try {
      const data = await schemaApi.getSchemas({ client_id: org.id });
      const tbls = data?.tables || data?.results || (Array.isArray(data) ? data : []);
      setOrgTables(tbls);
    } catch {
      try {
        const data = await clientApi.getClientTables(org.id);
        const tbls = data?.tables || data?.results || (Array.isArray(data) ? data : []);
        setOrgTables(tbls);
      } catch {
        setOrgTables([]);
      }
    }
  }, []);

  const loadOrgManagers = useCallback(async (org) => {
    if (!org?.id) return;
    setDrawerLoading(true);
    try {
      const data = await managerApi.list({ organisation_id: org.id });
      setOrgManagers(data?.managers || data?.data?.managers || (Array.isArray(data) ? data : []));
    } catch (err) {
      console.error('Load managers error:', err);
      setOrgManagers([]);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const loadOrgAssistants = useCallback(async (org) => {
    if (!org?.id) return;
    setDrawerLoading(true);
    try {
      const data = await assistantApi.list({ client_id: org.id });
      const list = data?.data?.staff || data?.staff || data?.results || (Array.isArray(data) ? data : []);
      setOrgAssistants(list);
    } catch (err) {
      console.error('Load assistants error:', err);
      setOrgAssistants([]);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showManagersDrawer && selClient) {
      loadOrgManagers(selClient);
      loadOrgTables(selClient);
    }
  }, [showManagersDrawer, selClient, loadOrgManagers, loadOrgTables]);

  useEffect(() => {
    if (showAssistantsDrawer && selClient) {
      loadOrgAssistants(selClient);
    }
  }, [showAssistantsDrawer, selClient, loadOrgAssistants]);

  const handleOpenManagersDrawer = (client) => {
    setSelected(client.id);
    loadOrgManagers(client);
    loadOrgTables(client);
    setShowManagersDrawer(true);
    setShowAssistantsDrawer(false);
  };

  const handleOpenAssistantsDrawer = (client) => {
    setSelected(client.id);
    loadOrgAssistants(client);
    setShowAssistantsDrawer(true);
    setShowManagersDrawer(false);
  };

  const handleToggleManagerStatus = async (manager) => {
    if (!manager?.id) return;
    const currentlyActive = manager.status !== 'inactive' && manager.is_active !== false;
    const nextActive = !currentlyActive;
    try {
      await managerApi.update(manager.id, { is_active: nextActive });
      addToast?.(`Manager "${manager.name || 'User'}" is now ${nextActive ? 'Active' : 'Inactive'}`, 'success');
      if (selClient) loadOrgManagers(selClient);
    } catch (err) {
      console.error('Toggle manager status error:', err);
      addToast?.(err?.response?.data?.message || 'Failed to update manager status', 'error');
    }
  };

  const handleToggleAssistantStatus = async (assistant) => {
    if (!assistant?.id) return;
    try {
      await assistantApi.toggleStatus(assistant.id);
      addToast?.(`Status updated for assistant "${assistant.name || assistant.username || 'Account'}"`, 'success');
      if (selClient) loadOrgAssistants(selClient);
    } catch (err) {
      console.error('Toggle assistant status error:', err);
      addToast?.(err?.response?.data?.message || err?.message || 'Failed to update assistant status', 'error');
    }
  };

  const handleDeleteManager = (manager) => {
    if (!manager?.id) return;
    const isPrimary = manager.is_default || manager.client_type === 'primary' || manager.manager_type === 'prime_manager' || manager.is_owner;
    if (isPrimary) {
      addToast?.('Primary Manager cannot be deleted.', 'warning');
      return;
    }
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    if (onOpenDeleteModal) {
      onOpenDeleteModal({
        title: `Delete Manager "${manager.name || 'Account'}"`,
        itemDescription: `manager "${manager.name || 'Account'}"`,
        requiresCode: true,
        deleteCode: pin,
        confirmText: 'Delete',
        confirmVariant: 'danger',
        onConfirm: async () => {
          try {
            await managerApi.delete(manager.id);
            addToast?.(`Manager "${manager.name || 'Account'}" deleted successfully`, 'success');
            if (selClient) loadOrgManagers(selClient);
          } catch (err) {
            console.error('Delete manager error:', err);
            addToast?.(err?.response?.data?.message || 'Failed to delete manager', 'error');
          }
        },
      });
    }
  };

  const handleDeleteAssistant = (assistant) => {
    if (!assistant?.id) return;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    if (onOpenDeleteModal) {
      onOpenDeleteModal({
        title: `Delete Assistant "${assistant.name || assistant.username || 'Account'}"`,
        itemDescription: `assistant "${assistant.name || assistant.username || 'Account'}"`,
        requiresCode: true,
        deleteCode: pin,
        confirmText: 'Delete',
        confirmVariant: 'danger',
        onConfirm: async () => {
          try {
            await assistantApi.delete(assistant.id);
            addToast?.(`Assistant "${assistant.name || assistant.username || 'Account'}" deleted successfully`, 'success');
            if (selClient) loadOrgAssistants(selClient);
          } catch (err) {
            console.error('Delete assistant error:', err);
            addToast?.(err?.response?.data?.message || 'Failed to delete assistant', 'error');
          }
        },
      });
    }
  };

  const handleSaveManagerInline = async (mgrData) => {
    try {
      if (mgrData.id && !String(mgrData.id).startsWith('mgr_') && !String(mgrData.id).startsWith('prime_')) {
        await managerApi.update(mgrData.id, mgrData);
      } else {
        await managerApi.create({
          ...mgrData,
          organisation_id: selClient?.id,
        });
      }
      addToast?.(`Manager ${mgrData.name || ''} saved successfully!`, 'success');
      setEditingManager(null);
      if (selClient) loadOrgManagers(selClient);
    } catch (err) {
      console.error('Save manager error:', err);
      addToast?.(err?.response?.data?.message || 'Failed to save manager', 'error');
    }
  };

  const handleSaveAssistantInline = async (astData) => {
    try {
      if (astData.id) {
        await assistantApi.update(astData.id, astData);
      } else {
        await assistantApi.create({
          ...astData,
          client_id: selClient?.id,
          client: selClient?.id,
          organisation_id: selClient?.id,
          role: 'assistant',
        });
      }
      addToast?.(`Assistant ${astData.name || ''} saved successfully!`, 'success');
      setEditingAssistant(null);
      if (selClient) loadOrgAssistants(selClient);
    } catch (err) {
      console.error('Save assistant error:', err);
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to save assistant';
      addToast?.(msg, 'error');
    }
  };

  return (
    <div
      className="view-container"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      {/* ── ACTION BAR ── */}
      <div
        className="action-bar"
        id="client-action-bar"
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
          <div
            className="status-tabs"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '6px',
              padding: '2px',
              gap: '3px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              boxSizing: 'border-box',
            }}
          >
            {STATUS_TABS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setStatusTab(t);
                  setPage(1);
                }}
                className={`status-tab${statusTab === t ? ' active' : ''}`}
                style={{
                  padding: '0 10px',
                  height: '28px',
                  minHeight: '28px',
                  maxHeight: '28px',
                  fontSize: '13px',
                  lineHeight: '28px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  borderRadius: '5px',
                  border: 'none',
                  cursor: 'pointer',
                  background: statusTab === t ? '#2563eb' : 'transparent',
                  color: statusTab === t ? '#ffffff' : '#cbd5e1',
                  fontWeight: statusTab === t ? 700 : 600,
                  fontFamily: 'var(--font-family)',
                  transition: 'all 0.15s',
                  boxShadow: statusTab === t ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {t}
              </button>
            ))}
          </div>

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
            placeholder="Search All..."
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
                onClick={() => onOpenActionDrawer?.('add-client')}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant={selected ? 'primary' : 'neutral'}
                disabled={!selected}
                icon={<Pen size={13} style={{ color: selected ? '#ffffff' : '#38bdf8' }} />}
                onClick={() => selClient && onOpenActionDrawer?.('edit-client', selClient)}
              >
                Edit
              </Button>

            </div>

            <div
              className="btn-separator"
              style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }}
            />

            <div className="btn-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Button
                size="sm"
                variant={selected ? 'primary' : 'neutral'}
                disabled={!selected}
                icon={<CreditCard size={13} style={{ color: selected ? '#ffffff' : '#60a5fa' }} />}
                onClick={() => selClient && onNavigate?.('cards', { clientId: selClient.id, clientName: selClient.name || selClient.school_name, org: selClient })}
                title="View Tables"
              >
                Tables
              </Button>
              <Button
                size="sm"
                variant={selected ? 'primary' : 'neutral'}
                active={showManagersDrawer}
                disabled={!selected}
                icon={<Users size={13} style={{ color: selected ? '#ffffff' : '#c084fc' }} />}
                onClick={() => {
                  const nextState = !showManagersDrawer;
                  if (nextState && selClient) {
                    loadOrgManagers(selClient);
                  }
                  setShowManagersDrawer(nextState);
                  setShowAssistantsDrawer(false);
                }}
                title="Manage Managers"
              >
                Managers
              </Button>
              <Button
                size="sm"
                variant={selected ? 'primary' : 'neutral'}
                active={showAssistantsDrawer}
                disabled={!selected}
                icon={<UsersRound size={13} style={{ color: selected ? '#ffffff' : '#4ade80' }} />}
                onClick={() => {
                  const nextState = !showAssistantsDrawer;
                  if (nextState && selClient) {
                    loadOrgAssistants(selClient);
                  }
                  setShowAssistantsDrawer(nextState);
                  setShowManagersDrawer(false);
                }}
                title="Manage Assistants"
              >
                Assistants
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
        <table className="data-table" id="clientsTable" style={{ flexShrink: 0, minWidth: '780px', width: '100%', fontSize: '13px' }}>
          <thead>
            <tr style={{ fontSize: '12.5px' }}>
              <th style={{ width: '42px', minWidth: '42px', textAlign: 'center', padding: '8px' }}>S. No.</th>
              <th style={{ minWidth: '220px', width: 'auto', textAlign: 'left', padding: '8px' }}>Name</th>
              <th style={{ width: '150px', minWidth: '130px', maxWidth: '170px', textAlign: 'center', padding: '8px' }}>Username</th>
              <th style={{ width: '70px', minWidth: '65px', textAlign: 'center', padding: '8px' }}>Status</th>
              <th style={{ width: '64px', minWidth: '60px', textAlign: 'center', padding: '8px' }}>Managers</th>
              <th style={{ width: '64px', minWidth: '60px', textAlign: 'center', padding: '8px' }}>Assistants</th>
              <th style={{ width: '60px', minWidth: '58px', textAlign: 'center', padding: '8px' }}>Tables</th>
              <th style={{ width: '74px', minWidth: '70px', textAlign: 'center', padding: '8px' }}>Total Cards</th>
              <th style={{ width: '40px', minWidth: '40px', textAlign: 'center', padding: '8px' }} title="Log">
                Log
              </th>
            </tr>
          </thead>
          <tbody id="client-table-body">
            {loading ? (
              <SkeletonTableRows count={12} cols={9} dark={false} />
            ) : (
              clients.map((c, idx) => {
                const statusStr = String(
                  c.status || (c.is_active !== undefined ? (c.is_active ? 'active' : 'inactive') : 'active')
                ).toLowerCase();
                const isActive = statusStr === 'active' || statusStr === 'true' || c.is_active === true;
                const isSel = c.id === selected;
                return (
                  <tr
                    key={c.id}
                    className={isSel ? 'selected' : ''}
                    onClick={() => setSelected(isSel ? null : c.id)}
                    onDoubleClick={() => onNavigate?.('cards', { clientId: c.id, clientName: c.name || c.school_name, org: c })}
                    data-client-id={c.id}
                    style={{ fontSize: '13px', cursor: 'pointer' }}
                    title="Single-click to select | Double-click to open Tables"
                  >
                    <td
                      className="text-center"
                      style={{
                        width: '44px',
                        minWidth: '44px',
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#475569',
                        fontSize: '12.5px',
                        padding: '2px',
                        height: '44px',
                        minHeight: '44px',
                        boxSizing: 'border-box',
                        verticalAlign: 'middle',
                      }}
                    >
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td style={{ minWidth: '240px', width: 'auto', textAlign: 'left', padding: '2px 6px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <div className="client-name-cell" style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px', letterSpacing: '-0.01em' }}>
                          {c.name || c.school_name || '—'}
                        </span>
                      </div>
                    </td>
                    <td
                      style={{
                        width: '140px',
                        minWidth: '130px',
                        maxWidth: '160px',
                        color: '#1d4ed8',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        textAlign: 'center',
                        padding: '2px',
                        height: '44px',
                        minHeight: '44px',
                        boxSizing: 'border-box',
                        verticalAlign: 'middle',
                      }}
                      title={(() => {
                        const rawUser = String(c.username || c.user?.username || c.user_code || (c.name ? c.name.toLowerCase().replace(/[^a-z0-9]/g, '') : '')).replace(/^@/, '');
                        return rawUser ? `@${rawUser}` : '';
                      })()}
                    >
                      <span
                        title={(() => {
                          const rawUser = String(c.username || c.user?.username || c.user_code || (c.name ? c.name.toLowerCase().replace(/[^a-z0-9]/g, '') : '')).replace(/^@/, '');
                          return rawUser ? `@${rawUser}` : '';
                        })()}
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
                      >
                        {(() => {
                          const rawUser = String(c.username || c.user?.username || c.user_code || (c.name ? c.name.toLowerCase().replace(/[^a-z0-9]/g, '') : '')).replace(/^@/, '');
                          const cleanUser = rawUser.length > 10 ? rawUser.slice(0, 10) : rawUser;
                          return cleanUser ? `@${cleanUser}` : '—';
                        })()}
                      </span>
                    </td>
                    <td className="text-center" style={{ width: '85px', minWidth: '80px', textAlign: 'center', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
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
                          userSelect: 'none',
                        }}
                        title={isActive ? 'Organisation is Active' : 'Organisation is Inactive'}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-center" style={{ width: '75px', minWidth: '70px', textAlign: 'center', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenManagersDrawer(c);
                        }}
                        title={`Click to view/manage ${getManagerCount(c)} Manager(s) for ${c.name || 'Organisation'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          minWidth: '44px',
                          height: '24px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: '#f3e8ff',
                          color: '#6b21a8',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          border: '1.5px solid #d8b4fe',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxSizing: 'border-box',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#e9d5ff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#f3e8ff';
                        }}
                      >
                        {getManagerCount(c)}
                      </span>
                    </td>
                    <td className="text-center" style={{ width: '75px', minWidth: '70px', textAlign: 'center', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAssistantsDrawer(c);
                        }}
                        title={`Click to view/manage ${getAssistantCount(c)} Assistant(s) for ${c.name || 'Organisation'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          minWidth: '44px',
                          height: '24px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: '#ecfdf5',
                          color: '#047857',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          border: '1.5px solid #a7f3d0',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxSizing: 'border-box',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#bbf7d0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#ecfdf5';
                        }}
                      >
                        {getAssistantCount(c)}
                      </span>
                    </td>
                    <td className="text-center" style={{ width: '70px', minWidth: '65px', textAlign: 'center', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(c.id);
                          onNavigate?.('cards', { clientId: c.id, clientName: c.name || c.school_name, org: c });
                        }}
                        title={`Click to view Tables for ${c.name || 'Organisation'}`}
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
                          e.currentTarget.style.background = '#bfdbfe';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#eff6ff';
                        }}
                      >
                        {c.table_count || c.tables_count || 0}
                      </span>
                    </td>
                    <td className="text-center" style={{ width: '90px', minWidth: '85px', textAlign: 'center', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(c.id);
                          onNavigate?.('cards', { clientId: c.id, clientName: c.name || c.school_name, org: c });
                        }}
                        title={`Total Cards across all tables for ${c.name || 'Organisation'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          minWidth: '44px',
                          height: '24px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: '#ecfeff',
                          color: '#0e7490',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          border: '1.5px solid #a5f3fc',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxSizing: 'border-box',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#cffafe';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#ecfeff';
                        }}
                      >
                        {Number(c.total_cards ?? c.cards_count ?? 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="text-center" style={{ width: '44px', minWidth: '44px', textAlign: 'center', padding: '2px', height: '44px', minHeight: '44px', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                      <button
                        className="client-history-trigger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLogOrg(c);
                          setShowOrgLogDrawer(true);
                        }}
                        title={`View activity & transaction log for ${c.name || 'Organisation'}`}
                        style={{
                          width: '24px',
                          height: '24px',
                          border: 'none',
                          borderRadius: '4px',
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
        {!loading && clients.length === 0 && (
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
              <Building size={30} />
            </div>
            <div style={{ maxWidth: '340px' }}>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                No Organisations Found
              </h4>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                {search
                  ? `No organisations match "${search}"`
                  : 'There are no organisations registered in the system yet.'}
              </p>
            </div>
            {!search && (
              <Button
                variant="primary"
                size="md"
                onClick={() => onOpenActionDrawer?.('add-client')}
                icon={<Plus size={14} />}
                style={{ marginTop: '14px' }}
              >
                Add First Organisation
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── BACKDROP OVERLAY WITH BLUR (No onClick -> closed by close buttons only) ── */}
      {(showManagersDrawer || showAssistantsDrawer) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 999,
            animation: 'fadeIn 0.15s ease-out',
          }}
        />
      )}

      {/* ── MANAGERS SLIDE-OVER DRAWER ── */}
      {showManagersDrawer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '620px',
            minWidth: '600px',
            maxWidth: '95vw',
            background: '#ffffff',
            boxShadow: '-8px 0 25px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
              color: '#fff',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
                <Users size={18} />
                <span>Managers</span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#bfdbfe' }}>
                Primary owner & extra manager accounts with assigned table access
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowManagersDrawer(false);
                  setEditingManager(null);
                  onNavigate?.('managers', {
                    clientId: selClient?.id,
                    clientName: selClient?.name,
                    org: selClient,
                  });
                }}
                title="Open separate full page for Managers"
                style={{
                  background: 'rgba(255, 255, 255, 0.16)',
                  border: '1px solid rgba(255, 255, 255, 0.32)',
                  borderRadius: '5px',
                  color: '#ffffff',
                  padding: '5px 11px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                <ExternalLink size={13} />
                <span>Full Page</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowManagersDrawer(false);
                  setEditingManager(null);
                }}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Close Drawer"
              >
                <X size={18} />
              </button>
            </div>
          </div>


          {editingManager ? (
            <ManagerInlineForm
              manager={editingManager === 'new' ? null : editingManager}
              orgName={selClient?.name || 'Organisation'}
              availableTables={orgTables}
              onSave={handleSaveManagerInline}
              onCancel={() => setEditingManager(null)}
            />
          ) : (
            <>
              {/* Action Row */}
              <div
                style={{
                  padding: '12px 20px',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                  Total Managers: {orgManagers.length}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => setEditingManager('new')}
                    style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Plus size={12} /> Add Manager Account
                  </button>
                </div>
              </div>

              {/* Manager Cards List */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  background: '#f8fafc',
                }}
              >
                {drawerLoading ? (
                  <SkeletonList count={4} hasAvatar={true} hasAction={true} />
                ) : orgManagers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    <Users size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
                    <h4 style={{ margin: 0, fontSize: '15px', color: '#334155' }}>No Managers Found</h4>
                    <p style={{ fontSize: '13px', margin: '4px 0 14px 0' }}>
                      There are no managers created for this organisation yet.
                    </p>
                    <button className="btn btn-sm btn-primary" onClick={() => setEditingManager('new')}>
                      <Plus size={12} /> Add Manager Account
                    </button>
                  </div>
                ) : (
                  orgManagers.map((m, idx) => {
                    const isPrimary = Boolean(m.is_default || m.client_type === 'primary' || m.manager_type === 'prime_manager' || m.is_owner);
                    const isActive = m.status !== 'inactive' && m.is_active !== false;
                    const assignedList = Array.isArray(m.assigned_tables) ? m.assigned_tables : ['All Tables'];

                    return (
                      <div
                        key={m.id || idx}
                        style={{
                          position: 'relative',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          background: '#ffffff',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                          overflow: 'hidden',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {/* Accent Bar */}
                        <div
                          style={{
                            height: '4px',
                            background: isPrimary
                              ? 'linear-gradient(90deg, #2563eb 0%, #3b82f6 100%)'
                              : 'linear-gradient(90deg, #7c3aed 0%, #a855f7 100%)',
                          }}
                        />

                        <div style={{ padding: '16px 18px' }}>
                          {/* Top Header Row */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              justifyContent: 'space-between',
                              gap: '12px',
                              marginBottom: '14px',
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                  {m.name || m.username || 'Unnamed Manager'}
                                </h4>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    background: isPrimary ? '#eff6ff' : '#faf5ff',
                                    color: isPrimary ? '#1d4ed8' : '#7c3aed',
                                    border: isPrimary ? '1px solid #bfdbfe' : '1px solid #e9d5ff',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <Shield size={10} />
                                  {isPrimary ? 'Primary Owner' : (m.role_title || 'Super Manager')}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                @{m.username || 'user'} {m.department ? `• ${m.department}` : ''} {m.designation ? `(${m.designation})` : ''}
                              </div>
                            </div>

                            {/* Status Badge */}
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                padding: '3px 8px',
                                borderRadius: '4px',
                                background: isActive ? '#ecfdf5' : '#fff1f2',
                                color: isActive ? '#059669' : '#e11d48',
                                border: isActive ? '1px solid #a7f3d0' : '1px solid #fecdd3',
                                flexShrink: 0,
                              }}
                            >
                              <span
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: isActive ? '#10b981' : '#f43f5e',
                                  boxShadow: isActive ? '0 0 0 2px rgba(16,185,129,0.2)' : 'none',
                                }}
                              />
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          {/* Contact Info Box */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                              gap: '10px',
                              padding: '10px 14px',
                              borderRadius: '8px',
                              background: '#f8fafc',
                              border: '1px solid #f1f5f9',
                              fontSize: '12px',
                              color: '#475569',
                              marginBottom: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                              <Mail size={13} style={{ color: '#64748b', flexShrink: 0 }} />
                              <span
                                title={m.email || '—'}
                                style={{
                                  fontWeight: 500,
                                  color: '#334155',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {m.email || '—'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Phone size={13} style={{ color: '#64748b', flexShrink: 0 }} />
                              <span style={{ fontWeight: 500, color: '#334155' }}>
                                {m.phone || '—'}
                              </span>
                            </div>
                          </div>

                          {/* Assigned Tables */}
                          <div style={{ marginBottom: '14px' }}>
                            <div
                              style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#334155',
                                marginBottom: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <CreditCard size={13} style={{ color: '#2563eb' }} />
                              <span>Assigned Tables ({assignedList.length}):</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {assignedList.map((tbl, tIdx) => (
                                <span
                                  key={tIdx}
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '3px 9px',
                                    borderRadius: '6px',
                                    background: isPrimary ? '#eff6ff' : '#f8fafc',
                                    color: isPrimary ? '#1e40af' : '#334155',
                                    border: isPrimary ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                                  }}
                                >
                                  {tbl}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Card Actions Footer */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '8px',
                              paddingTop: '12px',
                              borderTop: '1px solid #f1f5f9',
                            }}
                          >
                            <button
                              className="btn btn-xs"
                              onClick={() => setEditingManager(m)}
                              style={{
                                fontSize: '12px',
                                padding: '5px 12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                color: '#334155',
                                fontWeight: 600,
                                borderRadius: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              <Pen size={12} /> Edit
                            </button>
                            <button
                              className="btn btn-xs"
                              onClick={() => handleToggleManagerStatus(m)}
                              style={{
                                fontSize: '12px',
                                padding: '5px 12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: isActive ? '#fff7ed' : '#f0fdf4',
                                border: isActive ? '1px solid #fed7aa' : '1px solid #bbf7d0',
                                color: isActive ? '#c2410c' : '#15803d',
                                fontWeight: 600,
                                borderRadius: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              {isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                              {isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            {!isPrimary && (
                              <button
                                className="btn btn-xs"
                                onClick={() => handleDeleteManager(m)}
                                style={{
                                  fontSize: '12px',
                                  padding: '5px 12px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  background: '#fff1f2',
                                  border: '1px solid #fecdd3',
                                  color: '#be123c',
                                  fontWeight: 600,
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ASSISTANTS SLIDE-OVER DRAWER ── */}
      {showAssistantsDrawer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '620px',
            minWidth: '600px',
            maxWidth: '95vw',
            background: '#ffffff',
            boxShadow: '-8px 0 25px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
              color: '#fff',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
                <UsersRound size={18} />
                <span>Assistants</span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#dcfce7' }}>
                Assigned assistant accounts & permission settings
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowAssistantsDrawer(false);
                  setEditingAssistant(null);
                  onNavigate?.('assistants', {
                    clientId: selClient?.id,
                    clientName: selClient?.name,
                    org: selClient,
                  });
                }}
                title="Open separate full page for Assistants"
                style={{
                  background: 'rgba(255, 255, 255, 0.16)',
                  border: '1px solid rgba(255, 255, 255, 0.32)',
                  borderRadius: '5px',
                  color: '#ffffff',
                  padding: '5px 11px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                <ExternalLink size={13} />
                <span>Full Page</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAssistantsDrawer(false);
                  setEditingAssistant(null);
                }}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Close Drawer"
              >
                <X size={18} />
              </button>
            </div>
          </div>


          {editingAssistant ? (
            <AssistantInlineForm
              assistant={editingAssistant === 'new' ? null : editingAssistant}
              orgName={selClient?.name || 'Organisation'}
              onSave={handleSaveAssistantInline}
              onCancel={() => setEditingAssistant(null)}
            />
          ) : (
            <>
              {/* Action Row */}
              <div
                style={{
                  padding: '12px 20px',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                  Total Assistants: {orgAssistants.length}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => setEditingAssistant('new')}
                    style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Plus size={12} /> Add Assistant Account
                  </button>
                </div>
              </div>

              {/* Assistant Cards List */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  background: '#f8fafc',
                }}
              >
                {drawerLoading ? (
                  <SkeletonList count={4} hasAvatar={true} hasAction={true} />
                ) : orgAssistants.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    <UsersRound size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
                    <h4 style={{ margin: 0, fontSize: '15px', color: '#334155' }}>No Assistants Found</h4>
                    <p style={{ fontSize: '13px', margin: '4px 0 14px 0' }}>
                      There are no assistants created for this organisation yet.
                    </p>
                    <button className="btn btn-sm btn-primary" onClick={() => setEditingAssistant('new')}>
                      <Plus size={12} /> Add Assistant Account
                    </button>
                  </div>
                ) : (
                  orgAssistants.map((a, idx) => {
                    const isActive = a.status !== 'inactive' && a.is_active !== false;
                    return (
                      <div
                        key={a.id || idx}
                        style={{
                          position: 'relative',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          background: '#ffffff',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                          overflow: 'hidden',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {/* Accent Line Header */}
                        <div
                          style={{ height: '4px', background: 'linear-gradient(90deg, #15803d 0%, #22c55e 100%)' }}
                        />

                        <div style={{ padding: '16px 18px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div
                                style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '8px',
                                  background: 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)',
                                  color: '#ffffff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: '0 3px 8px rgba(22,128,61,0.25)',
                                }}
                              >
                                <UsersRound size={18} />
                              </div>
                              <div>
                                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                  {a.name}
                                </h4>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    border: '1px solid #bbf7d0',
                                    marginTop: '3px',
                                    display: 'inline-block',
                                  }}
                                >
                                  Assistant Account
                                </span>
                              </div>
                            </div>

                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '12px',
                                fontWeight: 600,
                                padding: '3px 9px',
                                borderRadius: '4px',
                                background: isActive ? '#f0fdf4' : '#fff1f2',
                                color: isActive ? '#15803d' : '#be123c',
                                border: isActive ? '1px solid #bbf7d0' : '1px solid #fecdd3',
                              }}
                            >
                              <span
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: isActive ? '#22c55e' : '#e11d48',
                                }}
                              />
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '10px',
                              padding: '10px 12px',
                              borderRadius: '8px',
                              background: '#f8fafc',
                              border: '1px solid #f1f5f9',
                              fontSize: '12px',
                              color: '#475569',
                              marginBottom: '14px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                              <Mail size={13} style={{ color: '#64748b', flexShrink: 0 }} />
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: '#334155',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {a.username || a.email || '—'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Phone size={13} style={{ color: '#64748b', flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, color: '#334155' }}>{a.phone || '—'}</span>
                            </div>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '8px',
                              paddingTop: '10px',
                              borderTop: '1px solid #f1f5f9',
                            }}
                          >
                            <button
                              className="btn btn-xs btn-neutral"
                              onClick={() => setEditingAssistant(a)}
                              style={{
                                fontSize: '12px',
                                padding: '5px 12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                              }}
                            >
                              <Pen size={12} /> Edit Assistant
                            </button>
                            <button
                              className="btn btn-xs"
                              onClick={() => handleToggleAssistantStatus(a)}
                              style={{
                                fontSize: '12px',
                                padding: '5px 12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: isActive ? '#fff7ed' : '#f0fdf4',
                                border: isActive ? '1px solid #fed7aa' : '1px solid #bbf7d0',
                                color: isActive ? '#c2410c' : '#15803d',
                                fontWeight: 600,
                                borderRadius: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              {isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                              {isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              className="btn btn-xs"
                              onClick={() => handleDeleteAssistant(a)}
                              style={{
                                fontSize: '12px',
                                padding: '5px 12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: '#fff1f2',
                                border: '1px solid #fecdd3',
                                color: '#be123c',
                                fontWeight: 600,
                                borderRadius: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}
      {/* ── ORGANISATION ACTIVITY & TRANSACTION DRAWER ── */}
      <OrgActivityDrawer
        isOpen={showOrgLogDrawer}
        onClose={() => {
          setShowOrgLogDrawer(false);
          setLogOrg(null);
        }}
        org={logOrg}
        addToast={addToast}
      />
    </div>
  );
}



/* ── INLINE EDIT/ADD FORM FOR MANAGERS ── */
function ManagerInlineForm({ manager, orgName, availableTables: propTables, onSave, onCancel }) {
  const [name, setName] = useState(manager?.name || '');
  const [username, setUsername] = useState(manager?.username || '');
  const [email, setEmail] = useState(manager?.email || '');
  const [phone, setPhone] = useState(manager?.phone || '');
  const [status, setStatus] = useState(manager?.status || 'active');
  const [passwordOption, setPasswordOption] = useState('custom');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [assignedTables, setAssignedTables] = useState(manager?.assigned_tables || ['All Tables']);

  const isEditing = Boolean(manager && manager.id);
  const isPrimary = Boolean(manager && (manager.is_default || manager.client_type === 'primary'));

  const availableTables = propTables && propTables.length > 0
    ? ['All Tables', ...propTables.map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean)]
    : [
        'All Tables',
        'Staff & Teachers',
      ];

  const toggleTable = (tbl) => {
    if (tbl === 'All Tables') {
      setAssignedTables(['All Tables']);
      return;
    }
    let updated = assignedTables.filter((t) => t !== 'All Tables');
    if (updated.includes(tbl)) {
      updated = updated.filter((t) => t !== tbl);
    } else {
      updated.push(tbl);
    }
    if (updated.length === 0) updated = ['All Tables'];
    setAssignedTables(updated);
  };

  const handleEmailChange = (val) => {
    setEmail(val);
    if (!username && val.includes('@')) {
      setUsername(val.split('@')[0]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const finalUsername =
      username.trim() ||
      (email.trim()
        ? email.trim().split('@')[0]
        : name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ''));
    onSave({
      ...(manager || {}),
      name: name.trim(),
      username: finalUsername,
      email: email.trim(),
      phone: phone.trim(),
      status,
      password_option: passwordOption,
      password: passwordOption === 'custom' ? password : phone.trim() || '12345678',
      assigned_tables: assignedTables,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: '#f8fafc',
        flex: 1,
        overflowY: 'auto',
      }}
    >
      {/* Form Header Banner */}
      <div
        style={{
          padding: '14px 16px',
          borderRadius: '8px',
          background: isPrimary
            ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
            : 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
          border: isPrimary ? '1px solid #bfdbfe' : '1px solid #e9d5ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: isPrimary ? '#2563eb' : '#9333ea',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <User size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
              {isEditing
                ? isPrimary
                  ? 'Edit Primary Owner Account'
                  : 'Edit Manager Account'
                : 'Add Manager Account'}
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              {isPrimary
                ? 'Update primary owner account credentials & permissions'
                : 'Set manager details, login credentials and assigned table groups below'}
            </p>
          </div>
        </div>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '4px',
            background: isPrimary ? '#2563eb' : '#9333ea',
            color: '#ffffff',
          }}
        >
          {isPrimary ? 'Primary Owner' : 'Manager'}
        </span>
      </div>

      <div
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Manager Name *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username_code (derived from email if empty)"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="manager@domain.com"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Mobile Phone
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Account Status
            </label>
            <CustomSelect
              value={status}
              onChange={(val) => setStatus(val)}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              height="34px"
            />
          </div>

          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Password Option
            </label>
            <CustomSelect
              value={passwordOption}
              onChange={(val) => setPasswordOption(val)}
              options={[
                { value: 'custom', label: 'Custom Password' },
                { value: 'auto', label: 'Use Phone Number / Auto Generate' },
              ]}
              height="34px"
            />
          </div>
        </div>

        {passwordOption === 'custom' && (
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Password *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter account password"
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 36px 0 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '5px',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Assigned Tables */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <CreditCard size={14} style={{ color: '#2563eb' }} />
          <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Assign Tables:</label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {availableTables.map((tbl) => {
            const isSel = assignedTables.includes(tbl);
            return (
              <button
                key={tbl}
                type="button"
                onClick={() => toggleTable(tbl)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: isSel ? '1px solid #2563eb' : '1px solid #cbd5e1',
                  background: isSel ? '#eff6ff' : '#ffffff',
                  color: isSel ? '#1d4ed8' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                {isSel && <CheckCircle2 size={12} style={{ color: '#2563eb' }} />}
                <span>{tbl}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form Buttons */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: '16px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-md btn-neutral"
          style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="submit"
          className="btn btn-md btn-primary"
          style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Save size={14} /> <span>{isEditing ? 'Save Changes' : 'Create Manager Account'}</span>
        </button>
      </div>
    </form>
  );
}

/* ── INLINE EDIT/ADD FORM FOR ASSISTANTS ── */
function AssistantInlineForm({ assistant, orgName, onSave, onCancel }) {
  const [name, setName] = useState(assistant?.name || '');
  const [username, setUsername] = useState(assistant?.username || '');
  const [email, setEmail] = useState(assistant?.email || '');
  const [phone, setPhone] = useState(assistant?.phone || '');
  const [status, setStatus] = useState(assistant?.status || (assistant?.is_active === false ? 'inactive' : 'active'));
  const [passwordOption, setPasswordOption] = useState('custom');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isEditing = Boolean(assistant && assistant.id);

  const handleEmailChange = (val) => {
    setEmail(val);
    if (!username && val.includes('@')) {
      setUsername(val.split('@')[0]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (passwordOption === 'custom' && !isEditing && !password.trim()) {
      alert('Password is required when Custom Password option is selected.');
      return;
    }
    const finalUsername =
      username.trim() ||
      (email.trim()
        ? email.trim().split('@')[0]
        : name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ''));
    const payload = {
      ...(assistant || {}),
      name: name.trim(),
      username: finalUsername,
      email: email.trim(),
      phone: phone.trim(),
      status,
      password_option: passwordOption,
      is_active: status === 'active',
    };
    if (passwordOption === 'custom') {
      if (password.trim()) {
        payload.password = password.trim();
      }
    } else {
      payload.password = phone.trim() || '12345678';
    }
    onSave(payload);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: '#f8fafc',
        flex: 1,
        overflowY: 'auto',
      }}
    >
      {/* Form Header Banner */}
      <div
        style={{
          padding: '14px 16px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          border: '1px solid #bbf7d0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: '#16a34a',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UsersRound size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#14532d' }}>
              {isEditing ? 'Edit Assistant Account' : 'Add New Assistant Account'}
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#15803d' }}>
              Assistant credentials, password settings & permissions for organisation data entry
            </p>
          </div>
        </div>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '4px',
            background: '#16a34a',
            color: '#ffffff',
          }}
        >
          Assistant
        </span>
      </div>

      <div
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Assistant Name *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="assistant_code (derived from email if empty)"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="assistant@domain.com"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Mobile Phone
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Account Status
            </label>
            <CustomSelect
              value={status}
              onChange={(val) => setStatus(val)}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              height="34px"
            />
          </div>

          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Password Option
            </label>
            <CustomSelect
              value={passwordOption}
              onChange={(val) => setPasswordOption(val)}
              options={[
                { value: 'custom', label: 'Custom Password' },
                { value: 'auto', label: 'Use Phone Number / Auto Generate' },
              ]}
              height="34px"
            />
          </div>
        </div>

        {passwordOption === 'custom' && (
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}
            >
              Password *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter account password"
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 36px 0 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '5px',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form Buttons */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: '16px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-md btn-neutral"
          style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="submit"
          className="btn btn-md btn-primary"
          style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Save size={14} /> <span>{isEditing ? 'Save Changes' : 'Create Assistant Account'}</span>
        </button>
      </div>
    </form>
  );
}

export { ClientDirectoryView as OrganisationDirectoryView };
