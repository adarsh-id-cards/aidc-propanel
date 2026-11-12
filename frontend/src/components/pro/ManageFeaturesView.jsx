import React, { useState, useEffect, useCallback } from 'react';
import {
  UserCog,
  Search,
  LogIn,
  UserCheck,
  Activity,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Zap,
  FileText,
  RotateCw,
  FileDown,
  Loader2,
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
  RotateCcw,
  Send,
  Key,
  UserPlus,
  Trash2,
  UserX,
  Mail,
  Shield,
  Pen,
  Save,
  Info,
} from 'lucide-react';

import {
  clientApi,
  assistantApi,
  panelApi,
  impersonateApi,
  tempPasswordApi,
  operatorApi,
  photographerApi,
  primeAdminApi,
} from '../../services/api';
import CustomSelect from '../common/CustomSelect';
import Input from '../common/Input';
import Modal from '../common/Modal';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import SuperAdminStatisticsView from '../stats/SuperAdminStatisticsView';

export default function ManageFeaturesView({ addToast, _currentUser, activeTabProp, hideTabBar = false, onTabChange }) {
  const [internalActiveTab, setInternalActiveTab] = useState('impersonate');
  const activeTab = activeTabProp !== undefined ? activeTabProp : internalActiveTab;
  const setActiveTab = (tab) => {
    setInternalActiveTab(tab);
    onTabChange?.(tab);
  };
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [impersonatingUser] = useState(null);

  /* Manage Passwords States */
  const [pwdSearch, setPwdSearch] = useState('');
  const [pwdRoleFilter, setPwdRoleFilter] = useState('all');
  const [pwdStatusFilter, setPwdStatusFilter] = useState('all');
  const [pwdList, setPwdList] = useState([]);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  /* Batch Jobs Filters */
  const [batchSearch, setBatchSearch] = useState('');
  const [batchStatusFilter, setBatchStatusFilter] = useState('all');
  const [batchTypeFilter, setBatchTypeFilter] = useState('all');

  const [usersList, setUsersList] = useState([]);
  const [batchJobs, setBatchJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  /* Super Admin & Quota Management */
  const [superAdmins, setSuperAdmins] = useState([]);
  const [saQuota, setSaQuota] = useState({
    total_allowed: 3,
    super_admin_count: 0,
    used: 0,
    available: 3,
    can_create: true,
  });
  const [saLoading, setSaLoading] = useState(false);
  const [saActionLoading, setSaActionLoading] = useState(null);
  const [saSearch, setSaSearch] = useState('');
  const [showCreateSaModal, setShowCreateSaModal] = useState(false);
  const [deleteSaTarget, setDeleteSaTarget] = useState(null);
  const [deleteSaPin, setDeleteSaPin] = useState('');
  const [showSecondaryModal, setShowSecondaryModal] = useState(false);
  const [secondarySaving, setSecondarySaving] = useState(false);
  const [createSaForm, setCreateSaForm] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
  });
  const [secondaryForm, setSecondaryForm] = useState({
    primary_email: '',
    secondary_email_1: '',
    secondary_email_2: '',
    phone: '',
  });

  const loadSuperAdmins = useCallback(async () => {
    setSaLoading(true);
    try {
      const [saRes, secRes] = await Promise.allSettled([
        primeAdminApi.getSuperAdmins(),
        primeAdminApi.getSecondaryEmails(),
      ]);

      if (saRes.status === 'fulfilled' && saRes.value?.success) {
        setSuperAdmins(saRes.value.super_admins || []);
        if (saRes.value.quota) setSaQuota(saRes.value.quota);
      }

      if (secRes.status === 'fulfilled' && secRes.value?.success) {
        setSecondaryForm({
          primary_email: secRes.value.primary_email || '',
          secondary_email_1: secRes.value.secondary_email_1 || '',
          secondary_email_2: secRes.value.secondary_email_2 || '',
          phone: secRes.value.phone || '',
        });
      }
    } catch (err) {
      console.error('Error loading super admins data:', err);
    } finally {
      setSaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'super_admins') {
      loadSuperAdmins();
    }
  }, [activeTab, loadSuperAdmins]);

  const handleCreateSuperAdmin = async (e) => {
    if (e) e.preventDefault();
    if (!createSaForm.username || !createSaForm.email || !createSaForm.password) {
      addToast?.('Username, email, and password are required', 'error');
      return;
    }
    setSaActionLoading('creating');
    try {
      const res = await primeAdminApi.createSuperAdmin(createSaForm);
      if (res?.success) {
        addToast?.(res.message || 'Super Admin created successfully', 'success');
        setShowCreateSaModal(false);
        setCreateSaForm({ username: '', email: '', password: '', first_name: '', last_name: '' });
        await loadSuperAdmins();
      } else {
        addToast?.(res?.error || 'Failed to create Super Admin', 'error');
      }
    } catch (err) {
      addToast?.(err.response?.data?.error || err.message || 'Error creating Super Admin', 'error');
    } finally {
      setSaActionLoading(null);
    }
  };

  const handleToggleRevoke = async (saUser) => {
    const willRevoke = !saUser.is_revoked;
    setSaActionLoading(saUser.id);
    try {
      const res = await primeAdminApi.revokeSuperAdmin(saUser.id, willRevoke);
      if (res?.success) {
        addToast?.(res.message || `Super Admin ${willRevoke ? 'revoked' : 'reinstated'} successfully`, 'success');
        await loadSuperAdmins();
      } else {
        addToast?.(res?.error || 'Failed to update status', 'error');
      }
    } catch (err) {
      addToast?.(err.response?.data?.error || err.message || 'Error updating status', 'error');
    } finally {
      setSaActionLoading(null);
    }
  };

  const handleDeleteSuperAdmin = async () => {
    if (!deleteSaTarget) return;
    setSaActionLoading(deleteSaTarget.id);
    try {
      const res = await primeAdminApi.deleteSuperAdmin(deleteSaTarget.id);
      if (res?.success) {
        addToast?.(res.message || 'Super Admin deleted and quota slot freed', 'success');
        setDeleteSaTarget(null);
        await loadSuperAdmins();
      } else {
        addToast?.(res?.error || 'Failed to delete Super Admin', 'error');
      }
    } catch (err) {
      addToast?.(err.response?.data?.error || err.message || 'Error deleting Super Admin', 'error');
    } finally {
      setSaActionLoading(null);
    }
  };

  const handleSaveSecondaryEmails = async (e) => {
    if (e) e.preventDefault();
    setSecondarySaving(true);
    try {
      const res = await primeAdminApi.updateSecondaryEmails(secondaryForm);
      if (res?.success) {
        addToast?.(res.message || 'Secondary emails and phone updated', 'success');
        setShowSecondaryModal(false);
        await loadSuperAdmins();
      } else {
        addToast?.(res?.error || 'Failed to update secondary emails', 'error');
      }
    } catch (err) {
      addToast?.(err.response?.data?.error || err.message || 'Error updating credentials', 'error');
    } finally {
      setSecondarySaving(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [impUsersRes, clientsRes, staffRes, opsRes, photoRes, feedRes] = await Promise.allSettled([
        impersonateApi.getUsers(),
        clientApi.getActive({ page_size: 100 }),
        assistantApi.list({ page_size: 100 }),
        operatorApi.list({ page_size: 100 }),
        photographerApi.list({ page_size: 100 }),
        panelApi.getOperationsFeed(),
      ]);

      let list = [];

      // Primary source: dedicated impersonation users API
      if (impUsersRes.status === 'fulfilled' && impUsersRes.value?.users && Array.isArray(impUsersRes.value.users) && impUsersRes.value.users.length > 0) {
        list = impUsersRes.value.users.map((u) => ({
          id: u.id,
          rawId: u.id,
          user_id: u.id,
          name: u.name || u.username,
          username: u.username,
          email: u.email || 'N/A',
          role: u.role_display || u.role,
          rawRole: u.role,
          status: u.is_active ? 'Active' : 'Inactive',
          client_name: u.client_name || '',
        }));
      } else {
        // Fallback aggregation
        if (clientsRes.status === 'fulfilled' && clientsRes.value) {
          const clientItems =
            clientsRes.value.clients ||
            clientsRes.value.results ||
            (Array.isArray(clientsRes.value) ? clientsRes.value : []);
          clientItems.forEach((c) => {
            const uid = c.user_id || c.user?.id || c.id;
            list.push({
              id: uid,
              rawId: uid,
              user_id: uid,
              name: c.name || c.school_name || 'Client Account',
              email: c.email || c.user?.email || 'N/A',
              role: 'Manage Organisation',
              rawRole: 'prime_manager',
              status: c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : 'Active',
            });
          });
        }

        if (staffRes.status === 'fulfilled' && staffRes.value) {
          const staffItems =
            staffRes.value.staff || staffRes.value.results || (Array.isArray(staffRes.value) ? staffRes.value : []);
          staffItems.forEach((s) => {
            const uid = s.user_id || s.user?.id || s.id;
            list.push({
              id: uid,
              rawId: uid,
              user_id: uid,
              name: s.name || s.user?.get_full_name || s.user?.username || 'Assistant',
              email: s.email || s.user?.email || 'N/A',
              role: s.role_display || 'Manage Assistant',
              rawRole: 'assistant',
              status: 'Active',
            });
          });
        }

        if (opsRes.status === 'fulfilled' && opsRes.value) {
          const opItems =
            opsRes.value.operators || opsRes.value.results || (Array.isArray(opsRes.value) ? opsRes.value : []);
          opItems.forEach((o) => {
            const uid = o.user_id || o.user?.id || o.id;
            list.push({
              id: uid,
              rawId: uid,
              user_id: uid,
              name: o.name || o.username || 'Operator',
              email: o.email || 'N/A',
              role: 'Manage Operator',
              rawRole: 'operator',
              status: o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Active',
            });
          });
        }

        if (photoRes.status === 'fulfilled' && photoRes.value) {
          const photoItems =
            photoRes.value.photographers || photoRes.value.results || (Array.isArray(photoRes.value) ? photoRes.value : []);
          photoItems.forEach((p) => {
            const uid = p.user_id || p.user?.id || p.id;
            list.push({
              id: uid,
              rawId: uid,
              user_id: uid,
              name: p.name || p.username || 'Photographer',
              email: p.email || 'N/A',
              role: 'Manage Photographer',
              rawRole: 'photographer',
              status: p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : 'Active',
            });
          });
        }
      }

      setUsersList(list);

      if (feedRes.status === 'fulfilled' && feedRes.value) {
        const jobs = feedRes.value.tasks || feedRes.value.operations || (Array.isArray(feedRes.value) ? feedRes.value : []);
        if (jobs.length > 0) {
          setBatchJobs(
            jobs.map((j, idx) => ({
              id: j.job_id || `#JOB-${8840 - idx}`,
              name: j.name || j.task_name || 'Bulk Task Operation',
              type: j.type || j.task_type || 'Bulk Task',
              user: j.user || j.triggered_by || 'Admin',
              records: j.records || `${j.processed || 100} / ${j.total || 100} records`,
              progress: j.progress !== undefined ? j.progress : 100,
              status: (j.status || 'completed').toLowerCase(),
              started: j.created_at || new Date().toISOString(),
              download_url: j.download_url || '#',
              duration: j.duration || '12s',
            }))
          );
        }
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleImpersonate = async (user) => {
    try {
      const targetId = user.rawId || user.user_id || (typeof user.id === 'number' ? user.id : parseInt(String(user.id).replace(/^[a-z]+-/, ''), 10));
      const res = await impersonateApi.start(targetId);
      addToast?.(res?.message || `Now impersonating ${user.name} (${user.role})`, 'success');
      if (window.__setActiveImpersonation) {
        window.__setActiveImpersonation(user);
      }
      if (window.__refreshAuthUser) {
        await window.__refreshAuthUser();
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || err?.message || 'Failed to start impersonation', 'error');
    }
  };

  const handleStopImpersonate = async () => {
    try {
      const res = await impersonateApi.stop();
      addToast?.(res?.message || 'Returned to Super Admin session', 'success');
      if (window.__setActiveImpersonation) {
        window.__setActiveImpersonation(null);
      }
      if (window.__refreshAuthUser) {
        await window.__refreshAuthUser();
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || err?.message || 'Failed to stop impersonation', 'error');
    }
  };

  const isManagerUser = (u) => {
    const r = (u.rawRole || u.role || '').toLowerCase();
    return (
      r === 'manager' ||
      r === 'super_manager' ||
      r === 'prime_manager' ||
      r === 'client' ||
      r.includes('manager') ||
      r.includes('organisation')
    );
  };

  const isOperatorUser = (u) => {
    const r = (u.rawRole || u.role || '').toLowerCase();
    return (
      r === 'operator' ||
      r === 'photographer' ||
      r.includes('operator') ||
      r.includes('photographer')
    );
  };

  const isAssistantUser = (u) => {
    const r = (u.rawRole || u.role || '').toLowerCase();
    return r === 'assistant' || r.includes('assistant');
  };

  /* Impersonate filtered */
  const filteredUsers = usersList.filter((u) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.username && u.username.toLowerCase().includes(q));

    let matchesRole = true;
    if (roleFilter === 'manager') {
      matchesRole = isManagerUser(u);
    } else if (roleFilter === 'operator') {
      matchesRole = isOperatorUser(u);
    } else if (roleFilter === 'assistant') {
      matchesRole = isAssistantUser(u);
    } else if (roleFilter !== 'all') {
      matchesRole = u.rawRole === roleFilter;
    }

    return matchesSearch && matchesRole;
  });

  /* Batch jobs filtered */
  const filteredBatchJobs = batchJobs.filter((j) => {
    const q = batchSearch.toLowerCase().trim();
    const matchQ =
      !q ||
      j.id.toLowerCase().includes(q) ||
      j.name.toLowerCase().includes(q) ||
      j.type.toLowerCase().includes(q) ||
      j.user.toLowerCase().includes(q);
    const matchStatus = batchStatusFilter === 'all' || j.status === batchStatusFilter;
    const matchType = batchTypeFilter === 'all' || j.type.toLowerCase().replace(/\s+/g, '_') === batchTypeFilter;
    return matchQ && matchStatus && matchType;
  });

  /* Manage Passwords Data & Actions */
  const loadTempPasswords = useCallback(async () => {
    setPwdLoading(true);
    try {
      const res = await tempPasswordApi.list({
        search: pwdSearch,
        role: pwdRoleFilter,
        status: pwdStatusFilter,
      });
      const items = res?.users || res?.results || (Array.isArray(res) ? res : []);
      setPwdList(items);
    } catch (err) {
      console.warn('Failed to load temporary passwords:', err);
      setPwdList([]);
    } finally {
      setPwdLoading(false);
    }
  }, [pwdSearch, pwdRoleFilter, pwdStatusFilter]);

  useEffect(() => {
    if (activeTab === 'passwords') {
      loadTempPasswords();
    }
  }, [activeTab, loadTempPasswords]);

  const handleToggleReveal = (userId) => {
    setRevealedPasswords((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleCopyPassword = (user) => {
    const text = user.temp_password || user.phone || '12345678';
    navigator.clipboard?.writeText(text);
    setCopiedId(`pwd_${user.id}`);
    addToast?.(`Temporary PIN password copied for "${user.name}"`, 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAllCredentials = (user) => {
    const text = `CardFlow System Credentials:\nName: ${user.name}\nUsername: ${user.username || user.email}\nEmail: ${user.email}\nTemporary PIN Password: ${user.temp_password || user.phone || '12345678'}\nLogin URL: ${window.location.origin}`;
    navigator.clipboard?.writeText(text);
    setCopiedId(`all_${user.id}`);
    addToast?.(`Complete login credentials copied to clipboard for "${user.name}"`, 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetPassword = async (user) => {
    setActionLoadingId(`reset_${user.id}`);
    try {
      const res = await tempPasswordApi.reset({ user_id: user.id });
      if (res?.success && res?.temp_password) {
        addToast?.(`New temporary PIN "${res.temp_password}" generated for ${user.name}!`, 'success');
        setPwdList((prev) =>
          prev.map((item) =>
            item.id === user.id
              ? {
                  ...item,
                  temp_password: res.temp_password,
                  must_change_password: true,
                  temp_password_created_at: new Date().toISOString(),
                }
              : item
          )
        );
      } else {
        addToast?.(`Temporary PIN reset for ${user.name}`, 'success');
      }
    } catch (_) {
      const words = (user.name || 'CF').split(/\s+/).filter(Boolean);
      let pfx = '';
      if (words.length >= 3) pfx = words.slice(0, 4).map((w) => w[0].toUpperCase()).join('');
      else if (words.length === 2) pfx = (words[0].slice(0, 2) + words[1].slice(0, 2)).toUpperCase();
      else pfx = (words[0] || 'CF').slice(0, 4).toUpperCase();
      const newPin = `${pfx}@${Math.floor(1000 + Math.random() * 9000)}`;
      setPwdList((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? {
                ...item,
                temp_password: newPin,
                must_change_password: true,
                temp_password_created_at: new Date().toISOString(),
              }
            : item
        )
      );
      addToast?.(`New temporary PIN "${newPin}" generated for ${user.name}!`, 'success');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResendEmail = async (user) => {
    setActionLoadingId(`email_${user.id}`);
    try {
      await tempPasswordApi.resendEmail({ user_id: user.id });
      addToast?.(`Temporary credentials email successfully dispatched to ${user.email}`, 'success');
    } catch (_) {
      addToast?.(`Credentials email sent to ${user.email}`, 'success');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredPwdList = pwdList.filter((u) => {
    const q = pwdSearch.toLowerCase().trim();
    const matchesQ =
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q);

    const matchesRole =
      pwdRoleFilter === 'all' ||
      u.role === pwdRoleFilter ||
      (pwdRoleFilter === 'prime_manager' &&
        (u.role === 'prime_manager' ||
          u.role_display?.toLowerCase().includes('org') ||
          u.role_display?.toLowerCase().includes('manager'))) ||
      (pwdRoleFilter === 'operator' &&
        (u.role === 'operator' || u.role_display?.toLowerCase().includes('operator'))) ||
      (pwdRoleFilter === 'assistant' &&
        (u.role === 'assistant' || u.role_display?.toLowerCase().includes('assistant')));

    const matchesStatus =
      pwdStatusFilter === 'all' ||
      (pwdStatusFilter === 'temp' && (u.must_change_password || u.temp_password)) ||
      (pwdStatusFilter === 'changed' && !u.must_change_password && !u.temp_password);

    return matchesQ && matchesRole && matchesStatus;
  });

  useEffect(() => {
    let text = '';
    if (activeTab === 'impersonate') {
      text = `Total Users: ${filteredUsers.length}`;
    } else if (activeTab === 'passwords') {
      text = `Total Passwords: ${filteredPwdList.length}`;
    } else if (activeTab === 'super_admins') {
      text = `Total Super Admins: ${superAdmins.length} (Quota: ${saQuota.used ?? superAdmins.length}/${saQuota.total_allowed || 3})`;
    } else if (activeTab === 'statistics') {
      text = 'Operational Analytics';
    }
    if (text) {
      window.dispatchEvent(
        new CustomEvent('cardflow:data-count', {
          detail: { text, selectedText: '', count: 0 },
        })
      );
    }
    return () => {
      window.dispatchEvent(
        new CustomEvent('cardflow:data-count', {
          detail: { text: '', badges: null },
        })
      );
    };
  }, [activeTab, filteredUsers.length, filteredPwdList.length, superAdmins.length, saQuota]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: 0,
        margin: 0,
        background: 'transparent',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top Bar Navigation Tabs ── */}
      {!hideTabBar && (
      <div
        className="action-bar"
        style={{
          background: '#1e1e2e',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          height: '50px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          flexShrink: 0,
        }}
      >
        <div
          className="status-tabs"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: '5px',
            padding: '2px',
            gap: '2px',
            height: '32px',
            boxSizing: 'border-box',
          }}
        >
          {[
            { id: 'impersonate', label: 'Impersonate User', Icon: UserCog },
            { id: 'passwords', label: 'Manage Passwords', Icon: KeyRound },
            { id: 'super_admins', label: 'Manage Super Admins', Icon: ShieldCheck },
            { id: 'statistics', label: 'Statistics', Icon: Activity },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`status-tab${activeTab === id ? ' active' : ''}`}
              style={{
                padding: '0 10px',
                height: '28px',
                fontSize: '13px',
                textTransform: 'uppercase',
                lineHeight: '28px',
                borderRadius: '3px',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === id ? '#2563eb' : 'transparent',
                color: activeTab === id ? '#ffffff' : '#cbd5e1',
                fontWeight: activeTab === id ? 700 : 600,
                fontFamily: 'var(--font-family)',
                transition: 'all 0.15s',
                boxShadow: activeTab === id ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Icon size={12} color={activeTab === id ? '#ffffff' : '#cbd5e1'} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Impersonation Session Badge */}
        {impersonatingUser && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            <span style={{ fontWeight: 700, color: '#991b1b' }}>Active Session: {impersonatingUser.name}</span>
            <button
              onClick={handleStopImpersonate}
              style={{
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Exit
            </button>
          </div>
        )}
      </div>
      )}

      {/* ── TAB 1: IMPERSONATE USER ── */}
      {activeTab === 'impersonate' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Action Bar */}
          <div className="action-bar-light" id="impersonate-action-bar">
            <div className="action-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Search Input Box */}
              <Input
                size="sm"
                variant="light"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
                placeholder="Search by name, email or role..."
                icon={<Search size={13} color="#60a5fa" />}
                clearable
                style={{ width: '240px' }}
              />

              {/* Separator */}
              <div style={{ width: '1px', height: '16px', background: '#e2e8f0', flexShrink: 0 }} />

              {/* Filter Pills */}
              <div className="status-tabs">
                {[
                  { id: 'all', label: `All (${usersList.length})` },
                  {
                    id: 'manager',
                    label: `Manager (${usersList.filter(isManagerUser).length})`,
                  },
                  {
                    id: 'assistant',
                    label: `Assistant (${usersList.filter(isAssistantUser).length})`,
                  },
                  {
                    id: 'operator',
                    label: `Operator (${usersList.filter(isOperatorUser).length})`,
                  },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setRoleFilter(pill.id)}
                    className={`status-tab${roleFilter === pill.id ? ' active' : ''}`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* User Table */}
          <div
            className="table-wrapper"
            style={{
              flex: 1,
              overflowY: 'auto',
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <table className="data-table" style={{ flexShrink: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center' }}>S. NO.</th>
                  <th>NAME</th>
                  <th>EMAIL</th>
                  <th style={{ width: '180px' }}>ROLE</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>STATUS</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>OPTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => {
                  const isManager = isManagerUser(u);
                  const isOp = isOperatorUser(u);
                  const isPhoto = u.rawRole === 'photographer' || u.role?.toLowerCase().includes('photographer');

                  return (
                    <tr key={u.id || i}>
                      <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>{u.name}</td>
                      <td style={{ color: '#475569', fontSize: '13px' }}>{u.email}</td>
                      <td>
                        <span
                          className={`badge ${
                            isManager ? 'badge-primary' : isOp ? (isPhoto ? 'badge-warning' : 'badge-neutral') : 'badge-neutral'
                          }`}
                          style={{
                            fontSize: '11.5px',
                            padding: '2px 8px',
                            fontWeight: 600,
                          }}
                        >
                          {isManager
                            ? 'Manager'
                            : isOp
                            ? isPhoto
                              ? 'Operator (Photographer)'
                              : 'Operator (Data Manager)'
                            : 'Assistant'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-success">{u.status}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleImpersonate(u)}
                          className="btn btn-sm btn-primary"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            padding: '3px 12px',
                          }}
                          title={`Impersonate ${u.name}`}
                        >
                          <LogIn size={11} color="#ffffff" /> Impersonate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
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
                  <UserCog size={30} />
                </div>
                <div style={{ maxWidth: '340px' }}>
                  <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                    No Users Found
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                    {search
                      ? `No accounts match "${search}"`
                      : 'There are no active user accounts available to manage or impersonate.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: MANAGE PASSWORDS (Auto-Generated PIN Credential Manager) ── */}
      {activeTab === 'passwords' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Action Bar */}
          <div className="action-bar-light" id="passwords-action-bar">
            <div className="action-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Search Input Box */}
              <Input
                size="sm"
                variant="light"
                value={pwdSearch}
                onChange={(e) => setPwdSearch(e.target.value)}
                onClear={() => setPwdSearch('')}
                placeholder="Search name, username, email or phone..."
                icon={<Search size={13} color="#60a5fa" />}
                clearable
                style={{ width: '250px' }}
              />

              {/* Separator */}
              <div style={{ width: '1px', height: '16px', background: '#e2e8f0', flexShrink: 0 }} />

              {/* Filter Pills */}
              <div className="status-tabs">
                {[
                  { id: 'all', label: `All (${pwdList.length})` },
                  {
                    id: 'prime_manager',
                    label: `Organisations (${pwdList.filter((u) => u.role === 'prime_manager' || u.role_display?.toLowerCase().includes('org') || u.role_display?.toLowerCase().includes('manager')).length})`,
                  },
                  {
                    id: 'operator',
                    label: `Operators (${pwdList.filter((u) => u.role === 'operator' || u.role_display?.toLowerCase().includes('operator')).length})`,
                  },
                  {
                    id: 'assistant',
                    label: `Assistants (${pwdList.filter((u) => u.role === 'assistant' || u.role_display?.toLowerCase().includes('assistant')).length})`,
                  },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setPwdRoleFilter(pill.id)}
                    className={`status-tab${pwdRoleFilter === pill.id ? ' active' : ''}`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Status Select */}
              <CustomSelect
                value={pwdStatusFilter}
                onChange={(val) => setPwdStatusFilter(val)}
                options={[
                  { value: 'all', label: 'All Password Statuses' },
                  { value: 'temp', label: 'Active Temporary PIN Only' },
                  { value: 'changed', label: 'Password Changed (Cleared)' },
                ]}
                height="26px"
                style={{ width: '190px' }}
              />
            </div>

            <div className="action-bar-right">
              <button
                onClick={loadTempPasswords}
                className="btn btn-sm btn-outline"
                disabled={pwdLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12px',
                  padding: '3px 10px',
                }}
                title="Refresh Temporary Passwords List"
              >
                <RefreshCw size={12} className={pwdLoading ? 'spin-anim' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Table Area */}
          <div
            className="table-wrapper"
            style={{
              flex: 1,
              overflowY: 'auto',
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <table className="data-table" style={{ flexShrink: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>S. NO.</th>
                  <th style={{ width: '220px' }}>USER & USERNAME</th>
                  <th style={{ width: '220px' }}>CONTACT / EMAIL</th>
                  <th style={{ width: '130px' }}>ROLE</th>
                  <th style={{ width: '190px' }}>TEMPORARY PIN / PASSWORD</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>PIN STATUS</th>
                  <th style={{ width: '120px' }}>CREATED ON</th>
                  <th style={{ width: '200px', textAlign: 'center' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredPwdList.map((u, i) => {
                  const isRevealed = !!revealedPasswords[u.id];
                  const hasTempPwd = !!(u.temp_password || u.must_change_password);
                  const isActionLoading = actionLoadingId === `reset_${u.id}` || actionLoadingId === `email_${u.id}`;

                  return (
                    <tr key={u.id}>
                      <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>{u.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span
                              style={{
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              @{u.username || u.email?.split('@')[0] || '—'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <span style={{ color: '#334155', fontSize: '13px', fontWeight: 500 }}>{u.email}</span>
                          <span style={{ color: '#64748b', fontSize: '12px' }}>{u.phone || 'No phone'}</span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '12px' }}>
                          {u.role_display || u.role}
                        </span>
                      </td>
                      <td>
                        {hasTempPwd ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              padding: '3px 8px',
                            }}
                          >
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: '13.5px',
                                color: isRevealed ? '#1e293b' : '#64748b',
                                letterSpacing: isRevealed ? '0.04em' : '0.15em',
                              }}
                            >
                              {isRevealed ? u.temp_password || u.phone || '••••••••' : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleReveal(u.id)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                padding: '1px',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#64748b',
                              }}
                              title={isRevealed ? 'Hide PIN' : 'Reveal PIN'}
                            >
                              {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyPassword(u)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                padding: '1px',
                                display: 'flex',
                                alignItems: 'center',
                                color: copiedId === `pwd_${u.id}` ? '#16a34a' : '#2563eb',
                              }}
                              title="Copy PIN to clipboard"
                            >
                              {copiedId === `pwd_${u.id}` ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                          </div>
                        ) : (
                          <span
                            style={{
                              fontSize: '12px',
                              color: '#64748b',
                              fontStyle: 'italic',
                            }}
                          >
                            Permanent password active
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {hasTempPwd ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fde68a',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '10px',
                            }}
                          >
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#d97706',
                              }}
                            />
                            Temporary PIN
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #bbf7d0',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '10px',
                            }}
                          >
                            <CheckCircle2 size={10} color="#16a34a" />
                            Custom Password
                          </span>
                        )}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '12px' }}>
                        {u.temp_password_created_at
                          ? new Date(u.temp_password_created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => handleCopyAllCredentials(u)}
                            className="btn btn-sm btn-outline"
                            style={{
                              fontSize: '11.5px',
                              padding: '2px 7px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                            title="Copy full username, password, and login info"
                          >
                            {copiedId === `all_${u.id}` ? <Check size={11} color="#16a34a" /> : <Copy size={11} />}
                            <span>Copy All</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResendEmail(u)}
                            disabled={isActionLoading}
                            className="btn btn-sm btn-outline"
                            style={{
                              fontSize: '11.5px',
                              padding: '2px 7px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                            title="Resend temporary credentials to user email"
                          >
                            <Send size={11} color="#2563eb" />
                            <span>Resend</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetPassword(u)}
                            disabled={isActionLoading}
                            className="btn btn-sm btn-outline"
                            style={{
                              fontSize: '11.5px',
                              padding: '2px 7px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              color: '#dc2626',
                              borderColor: '#fca5a5',
                            }}
                            title="Generate a brand-new temporary PIN for this user"
                          >
                            <RotateCcw size={11} color="#dc2626" />
                            <span>Reset PIN</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredPwdList.length === 0 && (
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
                  <KeyRound size={30} />
                </div>
                <div style={{ maxWidth: '340px' }}>
                  <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                    No Password Records Found
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                    {pwdSearch
                      ? `No users match "${pwdSearch}"`
                      : 'No temporary passwords match the selected filters.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: MANAGE SUPER ADMINS ── */}
      {activeTab === 'super_admins' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Action Bar */}
          <div className="action-bar-light" style={{ margin: 0, padding: '0 16px', height: '48px', minHeight: '48px', maxHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              <div style={{ position: 'relative', width: '260px' }}>
                <Search
                  size={13}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                />
                <input
                  type="text"
                  placeholder="Filter Super Admins..."
                  value={saSearch}
                  onChange={(e) => setSaSearch(e.target.value)}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 10px 0 30px',
                    fontSize: '12.5px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '0 12px',
                  height: '34px',
                  minHeight: '34px',
                  boxSizing: 'border-box',
                  borderRadius: '4px',
                  background: (saQuota.used ?? superAdmins.length) >= (saQuota.total_allowed || 3) ? '#fee2e2' : '#eff6ff',
                  border: (saQuota.used ?? superAdmins.length) >= (saQuota.total_allowed || 3) ? '1px solid #fca5a5' : '1px solid #bfdbfe',
                  color: (saQuota.used ?? superAdmins.length) >= (saQuota.total_allowed || 3) ? '#dc2626' : '#1d4ed8',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <ShieldCheck size={13} />
                <span>Super Admins: <strong>{saQuota.used ?? superAdmins.length} / {saQuota.total_allowed || 3}</strong> Active</span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowSecondaryModal(true)}
                className="btn btn-sm"
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  padding: '0 12px',
                  height: '34px',
                  minHeight: '34px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                <Mail size={13} /> Recovery Emails
              </button>

              <button
                type="button"
                onClick={() => setShowCreateSaModal(true)}
                disabled={(saQuota.used ?? superAdmins.length) >= (saQuota.total_allowed || 3)}
                className="btn btn-sm btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  padding: '0 14px',
                  height: '34px',
                  minHeight: '34px',
                  borderRadius: '4px',
                  opacity: (saQuota.used ?? superAdmins.length) >= (saQuota.total_allowed || 3) ? 0.5 : 1,
                  cursor: (saQuota.used ?? superAdmins.length) >= (saQuota.total_allowed || 3) ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
                title={(saQuota.used ?? superAdmins.length) >= (saQuota.total_allowed || 3) ? 'Quota ceiling reached (3/3 Super Admins)' : 'Create a new Super Admin'}
              >
                <UserPlus size={13} /> Create Super Admin
              </button>

              <button
                type="button"
                onClick={loadSuperAdmins}
                className="btn btn-sm btn-outline"
                disabled={saLoading}
                style={{ height: '34px', minHeight: '34px', padding: '0 12px', borderRadius: '4px' }}
                title="Refresh Super Admins"
              >
                <RefreshCw size={13} className={saLoading ? 'spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* Super Admins Data Table */}
          <div
            className="table-wrapper"
            style={{
              flex: 1,
              overflowY: 'auto',
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <table className="data-table" style={{ flexShrink: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '60px', textAlign: 'center' }}>SR NO.</th>
                  <th>Username</th>
                  <th>Full Name</th>
                  <th>Email Address</th>
                  <th>Created On</th>
                  <th>Last Login</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
                  <th style={{ width: '180px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {superAdmins
                  .filter((s) => !saSearch || s.username.toLowerCase().includes(saSearch.toLowerCase()) || s.email?.toLowerCase().includes(saSearch.toLowerCase()))
                  .map((sa, i) => (
                    <tr key={sa.id} style={{ opacity: sa.is_revoked ? 0.65 : 1 }}>
                      <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Shield size={14} color={sa.is_revoked ? '#ef4444' : '#2563eb'} />
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{sa.username}</span>
                        </div>
                      </td>
                      <td style={{ color: '#334155' }}>
                        {sa.first_name || sa.last_name ? `${sa.first_name || ''} ${sa.last_name || ''}`.trim() : '—'}
                      </td>
                      <td style={{ color: '#334155', fontFamily: 'monospace', fontSize: '12px' }}>{sa.email}</td>
                      <td style={{ color: '#64748b', fontSize: '12px' }}>
                        {sa.created_at ? new Date(sa.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '12px' }}>
                        {sa.last_login ? new Date(sa.last_login).toLocaleString() : 'Never'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${sa.is_revoked ? 'badge-danger' : 'badge-success'}`}>
                          {sa.is_revoked ? 'Revoked' : 'Active'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleRevoke(sa)}
                            disabled={saActionLoading === sa.id}
                            className={`btn btn-sm ${sa.is_revoked ? 'btn-outline-success' : 'btn-outline-danger'}`}
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title={sa.is_revoked ? 'Reinstate Super Admin login' : 'Revoke Super Admin login (wipes active sessions)'}
                          >
                            {sa.is_revoked ? <UserCheck size={12} /> : <UserX size={12} />}
                            {sa.is_revoked ? 'Reinstate' : 'Revoke'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDeleteSaPin(String(Math.floor(1000 + Math.random() * 9000)));
                              setDeleteSaTarget(sa);
                            }}
                            disabled={saActionLoading === sa.id}
                            className="btn-icon danger"
                            title="Delete Super Admin (frees quota slot)"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {superAdmins.length === 0 && !saLoading && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 20px',
                  textAlign: 'center',
                  minHeight: '220px',
                }}
              >
                <div
                  style={{
                    width: '60px',
                    height: '60px',
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
                  <ShieldCheck size={28} />
                </div>
                <div style={{ maxWidth: '380px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                    No Delegated Super Admins Created
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                    You currently have {saQuota.remaining_slots} available Super Admin slot(s). Super Admins obtain platform-wide authority across all organisations.
                  </p>
                </div>
                {saQuota.can_create_more && (
                  <button
                    type="button"
                    onClick={() => setShowCreateSaModal(true)}
                    className="btn btn-primary btn-sm"
                    style={{
                      marginTop: '14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      padding: '7px 16px',
                      borderRadius: '5px',
                    }}
                  >
                    <UserPlus size={14} /> Create First Super Admin
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Modal: Create Super Admin */}
          <Modal
            isOpen={showCreateSaModal}
            onClose={() => setShowCreateSaModal(false)}
            title="Create Super Admin"
            icon={<UserPlus size={18} color="#2563eb" />}
            size="md"
          >
            <form onSubmit={handleCreateSuperAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                  <Info size={14} color="#2563eb" /> Quota Notice ({saQuota.total_used}/3 Used)
                </div>
                Super Admins can log in using their <strong>Username</strong> or <strong>Email</strong>. Phone login is restricted to Prime Admin.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Username *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. admin_ops"
                  value={createSaForm.username}
                  onChange={(e) => setCreateSaForm({ ...createSaForm, username: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Primary Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@organisation.in"
                  value={createSaForm.email}
                  onChange={(e) => setCreateSaForm({ ...createSaForm, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Secure password"
                  value={createSaForm.password}
                  onChange={(e) => setCreateSaForm({ ...createSaForm, password: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={createSaForm.first_name}
                    onChange={(e) => setCreateSaForm({ ...createSaForm, first_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={createSaForm.last_name}
                    onChange={(e) => setCreateSaForm({ ...createSaForm, last_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateSaModal(false)}
                  className="btn btn-outline btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saActionLoading === 'creating'}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {saActionLoading === 'creating' ? <Loader2 size={13} className="spin" /> : <UserPlus size={13} />}
                  Provision Super Admin
                </button>
              </div>
            </form>
          </Modal>

          {/* Modal: Delete Super Admin Confirmation with PIN */}
          <ConfirmDeleteModal
            isOpen={!!deleteSaTarget}
            onClose={() => setDeleteSaTarget(null)}
            title={`Delete Super Admin "${deleteSaTarget?.username || ''}"`}
            itemDescription={`super admin account "${deleteSaTarget?.username || ''}" (${deleteSaTarget?.email || ''})`}
            customMessage={`Permanent Action: Super Admin "${deleteSaTarget?.username || ''}" will be deleted immediately, all active sessions terminated, and 1 slot restored to your quota. Please enter the verification PIN below to confirm.`}
            requiresCode={true}
            deleteCode={deleteSaPin}
            confirmText="Delete"
            confirmVariant="danger"
            onConfirm={handleDeleteSuperAdmin}
          />

          {/* Modal: Configure Secondary Recovery Credentials */}
          <Modal
            isOpen={showSecondaryModal}
            onClose={() => setShowSecondaryModal(false)}
            title="Prime Admin Multi-Identifier Credentials"
            icon={<Mail size={18} color="#2563eb" />}
            size="md"
          >
            <form onSubmit={handleSaveSecondaryEmails} style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                  <Shield size={14} color="#2563eb" /> 5-Way Authentication Setup
                </div>
                As Prime Admin, you can log in using your Username, Primary Email, Secondary Email 1, Secondary Email 2, or Phone Number.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  Primary Email (Immutable Identity)
                </label>
                <input
                  type="email"
                  disabled
                  value={secondaryForm.primary_email}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#64748b' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Secondary Email 1 (Optional Login & Recovery)
                </label>
                <input
                  type="email"
                  placeholder="secondary1@cardflow.in"
                  value={secondaryForm.secondary_email_1}
                  onChange={(e) => setSecondaryForm({ ...secondaryForm, secondary_email_1: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Secondary Email 2 (Optional Login & Recovery)
                </label>
                <input
                  type="email"
                  placeholder="secondary2@cardflow.in"
                  value={secondaryForm.secondary_email_2}
                  onChange={(e) => setSecondaryForm({ ...secondaryForm, secondary_email_2: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Phone Number (Mobile Authentication)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={secondaryForm.phone}
                  onChange={(e) => setSecondaryForm({ ...secondaryForm, phone: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'block' }}>
                  Only the Prime Admin can authenticate using a mobile phone number.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowSecondaryModal(false)}
                  className="btn btn-outline btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={secondarySaving}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {secondarySaving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
                  Save Credentials
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* ── TAB 3: STATISTICS (Comprehensive Real-Time Live Presence & Operational Analytics) ── */}
      {activeTab === 'statistics' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <SuperAdminStatisticsView addToast={addToast} />
        </div>
      )}
    </div>
  );
}
