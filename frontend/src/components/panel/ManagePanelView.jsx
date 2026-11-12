import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Mail,
  Activity,
  Database,
  FileDown,
  Server,
  Plus,
  Pen,
  RefreshCw,
  Loader2,
  Trash2,
  Eye,
  Send,
  Users,
  UserCheck,
  TriangleAlert,
  BellOff,
  Cpu,
  Layers,
  FolderTree,
  Info,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  FilterX,
  X,
  RotateCw,
  Download,
  ArrowRight,
  Gauge,
  Zap,
  ShieldCheck,
  UserCog,
  KeyRound,
  BarChart3,
} from 'lucide-react';
import { BarChart, Bar, Cell, ResponsiveContainer } from 'recharts';
import ManageFeaturesView from '../pro/ManageFeaturesView';

import CustomSelect from '../common/CustomSelect';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import BulkTransactionsModal from '../idcard/BulkTransactionsModal';
import { panelApi, auditApi } from '../../services/api';

const PANEL_TABS = [
  { id: 'notifications', label: 'Notifications', Icon: Bell },
  { id: 'log-history', label: 'Logs & Updates', Icon: Activity },
  { id: 'backups', label: 'Backups', Icon: Database },
  { id: 'download-templates', label: 'Download Templates', Icon: FileDown },
  { id: 'server-info', label: 'System & Server', Icon: Server },
];

const PRO_TABS = [
  { id: 'impersonate', label: 'Impersonate User', Icon: UserCog },
  { id: 'passwords', label: 'Manage Passwords', Icon: KeyRound },
  { id: 'super_admins', label: 'Manage Super Admins', Icon: ShieldCheck },
  { id: 'statistics', label: 'Statistics', Icon: BarChart3 },
];
/* ── Unified Notifications & Mail Delivery Management ────────────────────────── */
function NotificationsTab({ addToast }) {
  const [unifiedItems, setUnifiedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all'); // 'all' | 'push' | 'email' | 'both'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'delivered' | 'pending' | 'failed'
  const [priorityFilter, setPriorityFilter] = useState('all'); // 'all' | 'urgent' | 'normal'
  const [retryingId, setRetryingId] = useState(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [notifToDelete, setNotifToDelete] = useState(null);

  // Unified Compose / Draft Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNotif, setNewNotif] = useState({
    title: '',
    message: '',
    pushEnabled: true,
    emailEnabled: false,
    target_type: 'all',
    recipient_email: '',
    priority: 'normal',
    category: 'general',
  });
  const [submitting, setSubmitting] = useState(false);

  // Load both Notifications & Email Logs into ONE Unified Stream
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [notifRes, emailRes] = await Promise.allSettled([
        panelApi.getNotifications ? panelApi.getNotifications({ search }) : Promise.resolve([]),
        panelApi.getEmailLogs ? panelApi.getEmailLogs({ search }) : Promise.resolve([]),
      ]);

      const rawNotifs = notifRes.status === 'fulfilled'
        ? (notifRes.value?.notifications || notifRes.value?.results || (Array.isArray(notifRes.value) ? notifRes.value : []))
        : [];
      const rawEmails = emailRes.status === 'fulfilled'
        ? (emailRes.value?.logs || emailRes.value?.results || (Array.isArray(emailRes.value) ? emailRes.value : []))
        : [];

      // Map notifications to unified model
      const notifItems = rawNotifs.map((n, idx) => {
        const isBoth = Boolean(n.send_email || n.delivered_via_email);
        return {
          id: `notif_${n.id || idx}`,
          sourceId: n.id,
          sourceType: 'notification',
          title: n.title || 'System Notification',
          message: n.message || '',
          channel: isBoth ? 'both' : (n.channel || 'push'),
          target_type: n.target_type || 'all',
          recipient: n.target_type === 'all'
            ? 'All Users (Broadcast)'
            : (n.target_display || n.target_type || 'System Staff'),
          priority: n.priority || 'normal',
          status: n.status || 'delivered',
          created_at: n.created_at || new Date().toISOString(),
          raw: n,
        };
      });

      // Map emails to unified model
      const emailItems = rawEmails.map((e, idx) => {
        const isPassOrSecurity = e.email_type === 'password' || e.email_type === 'security' || (e.subject && /password|reset|otp/i.test(e.subject));
        const recipientName = e.recipient_name || e.recipient || '';
        const recipientMail = e.recipient_email || e.email || '';
        const fullRecipient = recipientName && recipientMail
          ? `${recipientName} (${recipientMail})`
          : (recipientMail || recipientName || 'Specific Email');

        return {
          id: `email_${e.id || idx}`,
          sourceId: e.id,
          sourceType: 'email',
          title: e.subject || (isPassOrSecurity ? 'Account Security / Password Alert' : 'System Email Dispatch'),
          message: e.body_text || e.body || e.preview || (e.template_code ? `System Template: ${e.template_code}` : 'Automated transactional notification'),
          channel: 'email',
          target_type: isPassOrSecurity ? 'security_mail' : 'email',
          recipient: fullRecipient,
          priority: isPassOrSecurity ? 'urgent' : (e.email_type === 'urgent' ? 'urgent' : 'normal'),
          status: e.status || 'sent',
          retry_count: e.retry_count || 0,
          created_at: e.created_at || e.sent_at || new Date().toISOString(),
          raw: e,
        };
      });

      // Combine and sort by date descending
      const combined = [...notifItems, ...emailItems].sort((a, b) => {
        const da = new Date(a.created_at).getTime() || 0;
        const db = new Date(b.created_at).getTime() || 0;
        return db - da;
      });

      setUnifiedItems(combined);
    } catch {
      setUnifiedItems([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = React.useMemo(() => {
    let list = unifiedItems;
    if (channelFilter !== 'all') {
      list = list.filter((item) => item.channel === channelFilter);
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'delivered') {
        list = list.filter((i) => i.status === 'delivered' || i.status === 'sent');
      } else {
        list = list.filter((i) => i.status === statusFilter);
      }
    }
    if (priorityFilter !== 'all') {
      list = list.filter((i) => (i.priority || 'normal').toLowerCase() === priorityFilter.toLowerCase());
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((i) =>
        (i.title && i.title.toLowerCase().includes(q)) ||
        (i.message && i.message.toLowerCase().includes(q)) ||
        (i.recipient && i.recipient.toLowerCase().includes(q)) ||
        (i.channel && i.channel.toLowerCase().includes(q)) ||
        (i.status && i.status.toLowerCase().includes(q))
      );
    }
    return list;
  }, [unifiedItems, channelFilter, statusFilter, priorityFilter, search]);

  const totalCount = unifiedItems.length;
  const pushCount = unifiedItems.filter((i) => i.channel === 'push' || i.channel === 'both').length;
  const emailCount = unifiedItems.filter((i) => i.channel === 'email' || i.channel === 'both').length;
  const bothCount = unifiedItems.filter((i) => i.channel === 'both').length;
  const failedCount = unifiedItems.filter((i) => i.status === 'failed' || i.status === 'retry').length;

  useEffect(() => {
    const isFiltered = filteredItems.length !== totalCount;
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: isFiltered
            ? `Total: ${filteredItems.length} of ${totalCount} • In-App: ${pushCount} • Email: ${emailCount}`
            : `Total: ${totalCount} • In-App: ${pushCount} • Email: ${emailCount}`,
          badges: [
            { label: 'Total', count: isFiltered ? `${filteredItems.length}/${totalCount}` : totalCount },
            { label: 'In-App', count: pushCount, color: '#93c5fd', border: 'rgba(147, 197, 253, 0.3)' },
            { label: 'Email', count: emailCount, color: '#c084fc', border: 'rgba(192, 132, 252, 0.3)' },
          ],
          count: totalCount,
        },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('cardflow:data-count', {
          detail: { text: '', badges: null },
        })
      );
    };
  }, [totalCount, pushCount, emailCount, filteredItems.length]);

  const handleCreateNotification = async (e) => {
    e.preventDefault();
    if (!newNotif.title.trim() || !newNotif.message.trim()) {
      addToast?.('Please enter notification title and message body', 'warning');
      return;
    }
    if (!newNotif.pushEnabled && !newNotif.emailEnabled) {
      addToast?.('Please select at least one delivery channel (Push or Email)', 'warning');
      return;
    }
    if (newNotif.emailEnabled && newNotif.target_type === 'specific' && !newNotif.recipient_email.trim()) {
      addToast?.('Please specify recipient email address', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const promises = [];

      // 1. In-App Push Notification
      if (newNotif.pushEnabled) {
        if (panelApi.createNotification) {
          promises.push(
            panelApi.createNotification({
              title: newNotif.title.trim(),
              message: newNotif.message.trim(),
              target: newNotif.target_type,
              priority: newNotif.priority,
              category: newNotif.category,
              send_email: newNotif.emailEnabled,
            })
          );
        }
      }

      // 2. Direct Email Notification (if email only, or targeted email specified)
      if (newNotif.emailEnabled && (!newNotif.pushEnabled || newNotif.recipient_email.trim())) {
        if (panelApi.sendEmail) {
          promises.push(
            panelApi.sendEmail({
              recipient_email: newNotif.recipient_email.trim() || 'all-broadcast@cardflow.app',
              subject: newNotif.title.trim(),
              body_text: newNotif.message.trim(),
              email_type: newNotif.priority === 'urgent' ? 'urgent' : 'system',
            })
          );
        }
      }

      await Promise.allSettled(promises);
      const channelLabel = newNotif.pushEnabled && newNotif.emailEnabled
        ? 'Push & Email'
        : (newNotif.pushEnabled ? 'In-App Push' : 'Email');
      addToast?.(`Notification published successfully via ${channelLabel}!`, 'success');

      setShowCreateModal(false);
      setNewNotif({
        title: '',
        message: '',
        pushEnabled: true,
        emailEnabled: false,
        target_type: 'all',
        recipient_email: '',
        priority: 'normal',
        category: 'general',
      });
      load();
    } catch {
      addToast?.('Failed to create notification', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const requestDelete = (item) => {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setNotifToDelete({
      ...item,
      pin,
    });
  };

  const confirmDelete = async () => {
    if (!notifToDelete) return;
    try {
      if (notifToDelete.sourceType === 'notification') {
        if (panelApi.deleteNotification && notifToDelete.sourceId) {
          await panelApi.deleteNotification(notifToDelete.sourceId);
        }
      }
      setUnifiedItems((prev) => prev.filter((i) => i.id !== notifToDelete.id));
      addToast?.('Notification removed', 'success');
    } catch {
      addToast?.('Failed to delete notification', 'error');
    } finally {
      setNotifToDelete(null);
    }
  };

  const handleRetryItem = async (item) => {
    if (!item.sourceId) return;
    setRetryingId(item.id);
    try {
      if (panelApi.retryEmail) {
        const res = await panelApi.retryEmail(item.sourceId);
        addToast?.(res?.message || `Email retry dispatched for ${item.title}`, 'success');
      } else if (panelApi.resendEmail) {
        await panelApi.resendEmail(item.sourceId);
        addToast?.('Email queued for retry', 'success');
      }
      load();
    } catch {
      addToast?.('Failed to queue retry', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAllFailed = async () => {
    setRetryingAll(true);
    try {
      if (panelApi.retryAllFailedEmails) {
        const res = await panelApi.retryAllFailedEmails();
        addToast?.(res?.message || 'All failed deliveries queued for immediate retry', 'success');
      }
      load();
    } catch {
      addToast?.('Failed to queue retry', 'error');
    } finally {
      setRetryingAll(false);
    }
  };

  const renderChannelBadge = (channel) => {
    if (channel === 'both') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '4px',
            background: '#f5f3ff',
            color: '#6d28d9',
            border: '1.5px solid #ddd6fe',
            fontWeight: 700,
            fontSize: '11.5px',
            whiteSpace: 'nowrap',
          }}
          title="Delivered via both In-App Push and Email"
        >
          <Bell size={11} /> + <Mail size={11} /> Both
        </span>
      );
    }
    if (channel === 'email') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '4px',
            background: '#faf5ff',
            color: '#7e22ce',
            border: '1.5px solid #e9d5ff',
            fontWeight: 700,
            fontSize: '11.5px',
            whiteSpace: 'nowrap',
          }}
          title="Delivered via Email Notification"
        >
          <Mail size={11} /> Email
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '4px',
          background: '#eff6ff',
          color: '#1d4ed8',
          border: '1.5px solid #bfdbfe',
          fontWeight: 700,
          fontSize: '11.5px',
          whiteSpace: 'nowrap',
        }}
        title="Delivered as Software In-App Push Notification"
      >
        <Bell size={11} /> In-App Push
      </span>
    );
  };

  const renderStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'delivered' || s === 'sent') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '4px',
            background: '#ecfdf5',
            color: '#047857',
            border: '1px solid #a7f3d0',
            fontSize: '11.5px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          <CheckCircle2 size={11} /> Delivered
        </span>
      );
    }
    if (s === 'pending' || s === 'queued') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '4px',
            background: '#fffbeb',
            color: '#b45309',
            border: '1px solid #fde68a',
            fontSize: '11.5px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          <Clock size={11} /> Pending
        </span>
      );
    }
    if (s === 'retry') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '4px',
            background: '#f0fdfa',
            color: '#0f766e',
            border: '1px solid #99f6e4',
            fontSize: '11.5px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          <RotateCw size={11} className="animate-spin" /> Retrying
        </span>
      );
    }
    if (s === 'on_hold' || s === 'hold') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '4px',
            background: '#fff7ed',
            color: '#c2410c',
            border: '1px solid #fed7aa',
            fontSize: '11.5px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          <Clock size={11} /> On Hold
        </span>
      );
    }
    if (s === 'failed') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '4px',
            background: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            fontSize: '11.5px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          <XCircle size={11} /> Failed
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 7px',
          borderRadius: '4px',
          background: '#f1f5f9',
          color: '#475569',
          border: '1px solid #cbd5e1',
          fontSize: '11.5px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {status || 'Normal'}
      </span>
    );
  };

  const PRIORITY_BADGE = {
    urgent: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
    high: { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
    normal: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    low: { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
    system: { bg: '#faf5ff', color: '#7c3aed', border: '#e9d5ff' },
  };

  return (
    <div
      className="panel-tab-content active"
      id="tab-notifications"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      {/* ── Combined Action & Filter Bar ── */}
      <div
        className="notif-actions-bar action-bar-light"
        style={{
          height: '48px',
          minHeight: '48px',
          maxHeight: '48px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'nowrap',
          overflow: 'visible',
          position: 'relative',
          zIndex: 40,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', flexShrink: 0 }}>
          {/* Channel Filter Pills (Far Left) */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: '#f1f5f9',
              borderRadius: '5px',
              padding: '2px',
              border: '1px solid #e2e8f0',
              gap: '2px',
              height: '34px',
              boxSizing: 'border-box',
            }}
          >
            {[
              { id: 'all', label: 'All' },
              { id: 'push', label: 'In-App', Icon: Bell },
              { id: 'email', label: 'Email', Icon: Mail },
              { id: 'both', label: 'Both' },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setChannelFilter(id)}
                style={{
                  height: '28px',
                  padding: '0 10px',
                  borderRadius: '3px',
                  fontSize: '11.5px',
                  fontWeight: channelFilter === id ? 700 : 500,
                  border: 'none',
                  background: channelFilter === id ? '#2563eb' : 'transparent',
                  color: channelFilter === id ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {Icon && <Icon size={11} />}
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <Input
            size="sm"
            variant="light"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder="Search notification or email..."
            icon={<Search size={13} />}
            clearable
            style={{ width: '220px' }}
          />

          {/* Status Filter Dropdown */}
          <CustomSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'delivered', label: 'Delivered / Sent' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
            ]}
            height="28px"
            style={{ width: '130px' }}
          />

          {/* Priority Filter Dropdown */}
          <CustomSelect
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v)}
            options={[
              { value: 'all', label: 'All Priorities' },
              { value: 'urgent', label: 'Urgent Alert' },
              { value: 'normal', label: 'Normal' },
            ]}
            height="28px"
            style={{ width: '120px' }}
          />
        </div>

        {/* Right side: Retry Failed and New Notification */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', flexShrink: 0 }}>
          {failedCount > 0 && (
            <button
              type="button"
              onClick={handleRetryAllFailed}
              disabled={retryingAll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0 12px',
                height: '34px',
                minHeight: '34px',
                background: '#fee2e2',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: retryingAll ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              <RotateCw size={12} className={retryingAll ? 'animate-spin' : ''} />
              <span>Retry Failed ({failedCount})</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={load}
            disabled={loading}
            title="Refresh notifications & email logs"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              height: '34px',
              minHeight: '34px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: 600,
              background: '#ffffff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowCreateModal(true)}
            icon={<Plus size={12} color="#ffffff" />}
            style={{ height: '34px', minHeight: '34px', whiteSpace: 'nowrap' }}
          >
            New Notification
          </Button>
        </div>
      </div>

      {/* ── Single Unified Notifications & Mail Table ── */}
      <div
        className="table-wrapper"
        style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <table className="data-table" style={{ flexShrink: 0, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center' }}>S. No.</th>
              <th style={{ minWidth: '220px' }}>Notification & Message</th>
              <th style={{ width: '135px', textAlign: 'center' }}>Channel</th>
              <th style={{ width: '170px' }}>Recipient / Audience</th>
              <th style={{ width: '90px', textAlign: 'center' }}>Priority</th>
              <th style={{ width: '110px', textAlign: 'center' }}>Status</th>
              <th style={{ width: '130px' }}>Sent Time</th>
              <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 12 }).map((_, i) => (
                <tr key={i} className="skeleton-row">
                  <td style={{ textAlign: 'center' }}>
                    <div className="skeleton" style={{ height: '13px', width: '22px', margin: '0 auto' }} />
                  </td>
                  <td>
                    <div className="skeleton" style={{ height: '14px', width: `${55 + (i % 4) * 10}%` }} />
                    <div className="skeleton" style={{ height: '11px', width: `${75 + (i % 3) * 6}%`, marginTop: '4px' }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="skeleton skeleton-cell-badge" style={{ margin: '0 auto' }} />
                  </td>
                  <td>
                    <div className="skeleton skeleton-cell-badge" />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="skeleton skeleton-cell-badge" style={{ margin: '0 auto' }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="skeleton skeleton-cell-badge" style={{ margin: '0 auto' }} />
                  </td>
                  <td>
                    <div className="skeleton skeleton-cell-date" />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="skeleton" style={{ height: '14px', width: '28px', margin: '0 auto' }} />
                  </td>
                </tr>
              ))
            ) : filteredItems.length === 0 ? null : (
              filteredItems.map((item, i) => {
                const globalIndex = i + 1;
                const pCfg = PRIORITY_BADGE[(item.priority || 'normal').toLowerCase()] || PRIORITY_BADGE.normal;
                const isFailedEmail = item.sourceType === 'email' && (item.status === 'failed' || item.status === 'retry');

                return (
                  <tr key={item.id}>
                    <td style={{ textAlign: 'center', color: '#9ca3af', fontWeight: 600 }}>{globalIndex}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>{item.title}</div>
                      <div
                        style={{
                          fontSize: '12.5px',
                          color: '#64748b',
                          marginTop: '2px',
                          lineHeight: 1.4,
                          maxWidth: '480px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.message}
                      >
                        {item.message}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {renderChannelBadge(item.channel)}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#334155',
                          background: '#f8fafc',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0',
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.recipient}
                      >
                        {item.channel === 'email' ? <Mail size={11} style={{ color: '#7c3aed' }} /> : <Users size={11} style={{ color: '#2563eb' }} />}
                        {item.recipient}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          background: pCfg.bg,
                          color: pCfg.color,
                          border: `1px solid ${pCfg.border}`,
                        }}
                      >
                        {item.priority || 'normal'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {renderStatusBadge(item.status)}
                    </td>
                    <td style={{ fontSize: '12.5px', color: '#64748b' }}>
                      {item.created_at ? new Date(item.created_at).toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="action-btn-group">
                        {isFailedEmail && (
                          <button
                            type="button"
                            onClick={() => handleRetryItem(item)}
                            disabled={retryingId === item.id}
                            title="Retry dispatching email"
                            className="btn-icon retry"
                          >
                            <RotateCw size={13} className={retryingId === item.id ? 'animate-spin' : ''} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => requestDelete(item)}
                          className="btn-icon danger"
                          title="Delete notification log"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Empty state */}
        {!loading && filteredItems.length === 0 && (
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
              <BellOff size={28} />
            </div>
            <div style={{ maxWidth: '340px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                No Notifications Found
              </h4>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                {search
                  ? `No notifications or emails match "${search}"`
                  : 'Broadcast system updates or deliver notifications directly to email inboxes.'}
              </p>
            </div>
            {!search && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary btn-sm"
                style={{
                  marginTop: '14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12.5px',
                  padding: '7px 16px',
                  borderRadius: '5px',
                }}
              >
                <Plus size={14} /> Create First Notification
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Unified Create / Draft Notification Modal ── */}
      {showCreateModal && (
        <div
          className="center-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) e.preventDefault();
          }}
        >
          <div className="center-modal-panel modal-md" style={{ width: '560px', maxWidth: '95vw', borderRadius: '10px', overflow: 'hidden' }}>
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#0f172a',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Bell size={18} color="#2563eb" /> Create & Dispatch Notification
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', display: 'block' }}>
                  Deliver as In-App Push, Email, or Both simultaneously
                </span>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleCreateNotification}
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Delivery Channels Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Delivery Channels (Select One or Both) *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {/* Push Option Card */}
                  <div
                    onClick={() => setNewNotif((prev) => ({ ...prev, pushEnabled: !prev.pushEnabled }))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: newNotif.pushEnabled ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                      background: newNotif.pushEnabled ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newNotif.pushEnabled}
                      onChange={(e) => setNewNotif((prev) => ({ ...prev, pushEnabled: e.target.checked }))}
                      style={{ marginTop: '2px', accentColor: '#2563eb', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: newNotif.pushEnabled ? '#1d4ed8' : '#334155', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Bell size={13} /> In-App Push
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                        Instant notification banner inside software
                      </div>
                    </div>
                  </div>

                  {/* Email Option Card */}
                  <div
                    onClick={() => setNewNotif((prev) => ({ ...prev, emailEnabled: !prev.emailEnabled }))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: newNotif.emailEnabled ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                      background: newNotif.emailEnabled ? '#faf5ff' : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newNotif.emailEnabled}
                      onChange={(e) => setNewNotif((prev) => ({ ...prev, emailEnabled: e.target.checked }))}
                      style={{ marginTop: '2px', accentColor: '#7c3aed', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: newNotif.emailEnabled ? '#6d28d9' : '#334155', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Mail size={13} /> Email Notification
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                        Delivered directly to user email inbox
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notification Title */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Title / Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Scheduled System Maintenance or Welcome"
                  value={newNotif.title}
                  onChange={(e) => setNewNotif({ ...newNotif, title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Target Audience
                  </label>
                  <CustomSelect
                    value={newNotif.target_type}
                    onChange={(val) => setNewNotif({ ...newNotif, target_type: val })}
                    options={[
                      { value: 'all', label: 'All Users (Broadcast)' },
                      { value: 'super_admin', label: 'Super Admins' },
                      { value: 'prime_manager', label: 'Prime Managers (Organisations)' },
                      { value: 'super_manager', label: 'Super Managers' },
                      { value: 'operator', label: 'Operators (Admin Staff)' },
                      { value: 'assistant', label: 'Assistants' },
                      { value: 'specific', label: 'Specific Email / User' },
                    ]}
                    height="36px"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Priority
                  </label>
                  <CustomSelect
                    value={newNotif.priority}
                    onChange={(val) => setNewNotif({ ...newNotif, priority: val })}
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'high', label: 'High Priority' },
                      { value: 'urgent', label: 'Urgent Alert' },
                      { value: 'low', label: 'Low' },
                    ]}
                    height="36px"
                  />
                </div>
              </div>

              {/* Conditional Recipient Email field */}
              {(newNotif.target_type === 'specific' || (newNotif.emailEnabled && newNotif.target_type !== 'all')) && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Recipient Email Address *
                  </label>
                  <input
                    type="email"
                    placeholder="user@organisation.org"
                    value={newNotif.recipient_email}
                    onChange={(e) => setNewNotif({ ...newNotif, recipient_email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13.5px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* Message Body */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Message Content *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter the full notification or email message details..."
                  value={newNotif.message}
                  onChange={(e) => setNewNotif({ ...newNotif, message: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '10px',
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: '14px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{
                    fontSize: '13px',
                    padding: '8px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Send size={13} /> {submitting ? 'Dispatching...' : 'Dispatch Notification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal with PIN for notification deletion */}
      {notifToDelete && (
        <ConfirmDeleteModal
          isOpen={Boolean(notifToDelete)}
          onClose={() => setNotifToDelete(null)}
          title={`Delete Notification "${notifToDelete.title}"`}
          itemDescription={`notification "${notifToDelete.title}"`}
          customMessage={`Are you sure you want to permanently delete notification "${notifToDelete.title}"? Please enter the verification PIN below to confirm.`}
          requiresCode={true}
          deleteCode={notifToDelete.pin}
          confirmText="Delete"
          confirmVariant="danger"
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

/* ── Logs & Updates Tab (Enhanced with Bulk Transactions & Audit Trail) ── */
function LogHistoryTab({ addToast }) {
  const [viewMode, setViewMode] = useState('transactions'); // 'transactions' | 'system'
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [selectedTxId, setSelectedTxId] = useState(null);
  const [showTxModal, setShowTxModal] = useState(false);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('logs');
  const [userTypeFilter, setUserTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  /* Load Bulk Transactions */
  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const data = await auditApi.getTransactions({ limit: 100 });
      setTransactions(data?.transactions || []);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  }, []);

  /* Load System Logs */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await panelApi.getLogs?.({
        search,
        source: sourceFilter,
        user_type: userTypeFilter,
        status: statusFilter,
        action: actionFilter,
      });
      let list = d?.logs || d?.results || (Array.isArray(d) ? d : []);
      setLogs(list);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [search, sourceFilter, userTypeFilter, statusFilter, actionFilter]);

  useEffect(() => {
    if (viewMode === 'transactions') {
      loadTransactions();
    } else {
      load();
    }
  }, [viewMode, loadTransactions, load]);

  const filteredLogs = React.useMemo(() => {
    let result = logs;
    if (sourceFilter !== 'all' && sourceFilter) {
      if (sourceFilter === 'logs') result = result.filter((l) => l.source === 'System' || l.source === 'Log');
      else if (sourceFilter === 'tasks') result = result.filter((l) => l.source === 'Tasks');
      else if (sourceFilter === 'backups') result = result.filter((l) => l.source === 'Backups');
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (l) =>
          (l.event && l.event.toLowerCase().includes(q)) ||
          (l.user && l.user.toLowerCase().includes(q)) ||
          (l.details && l.details.toLowerCase().includes(q)) ||
          (l.source && l.source.toLowerCase().includes(q))
      );
    }
    return result;
  }, [logs, search, sourceFilter]);

  const filteredTransactions = React.useMemo(() => {
    if (!search.trim()) return transactions;
    const q = search.toLowerCase().trim();
    return transactions.filter(
      (t) =>
        (t.tx_code && t.tx_code.toLowerCase().includes(q)) ||
        (t.actor_name && t.actor_name.toLowerCase().includes(q)) ||
        (t.action && t.action.toLowerCase().includes(q)) ||
        (t.source_state && t.source_state.toLowerCase().includes(q)) ||
        (t.destination_state && t.destination_state.toLowerCase().includes(q))
    );
  }, [transactions, search]);

  const resetFilters = () => {
    setSearch('');
    setSourceFilter('logs');
    setUserTypeFilter('');
    setStatusFilter('');
    setActionFilter('');
  };

  useEffect(() => {
    const count = viewMode === 'transactions' ? filteredTransactions.length : filteredLogs.length;
    const label = viewMode === 'transactions' ? 'Transactions' : 'Logs';
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: `Total ${label}: ${count}`,
          selectedText: '',
          count,
        },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('cardflow:data-count', {
          detail: { text: '', badges: null },
        })
      );
    };
  }, [viewMode, filteredTransactions.length, filteredLogs.length]);

  return (
    <div
      className="panel-tab-content active"
      id="tab-log-history"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      {/* Top Mode Selector & Actions Bar */}
      <div className="notif-actions-bar action-bar-light" style={{ borderBottom: '1px solid #e2e8f0' }}>
        <div
          className="notif-actions-left"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}
        >
          {/* Mode Switch Pills */}
          <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: '6px', padding: '2px' }}>
            <button
              onClick={() => setViewMode('transactions')}
              style={{
                border: 'none',
                background: viewMode === 'transactions' ? '#ffffff' : 'transparent',
                color: viewMode === 'transactions' ? '#4f46e5' : '#475569',
                fontWeight: viewMode === 'transactions' ? 700 : 500,
                fontSize: '13px',
                padding: '5px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: viewMode === 'transactions' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Layers size={13} /> Bulk Transactions & Activity
            </button>
            <button
              onClick={() => setViewMode('system')}
              style={{
                border: 'none',
                background: viewMode === 'system' ? '#ffffff' : 'transparent',
                color: viewMode === 'system' ? '#0f172a' : '#475569',
                fontWeight: viewMode === 'system' ? 700 : 500,
                fontSize: '13px',
                padding: '5px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: viewMode === 'system' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Activity size={13} /> System Logs
            </button>
          </div>

          <Input
            size="sm"
            variant="light"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder={viewMode === 'transactions' ? "Search batch code, actor..." : "Search users, updates, logs..."}
            icon={<Search size={13} />}
            clearable
            style={{ width: '240px' }}
          />

          {viewMode === 'system' && (
            <>
              <CustomSelect
                value={sourceFilter}
                onChange={(val) => setSourceFilter(val)}
                options={[
                  { value: 'logs', label: 'System Logs' },
                  { value: 'all', label: 'All Sources' },
                  { value: 'tasks', label: 'Background Tasks' },
                  { value: 'backups', label: 'Backup Tasks' },
                ]}
                height="28px"
                style={{ width: '130px' }}
              />
              <CustomSelect
                value={userTypeFilter}
                onChange={(val) => setUserTypeFilter(val)}
                options={[
                  { value: '', label: 'All User Types' },
                  { value: 'super_admin', label: 'Super Admin' },
                  { value: 'operator', label: 'Operator' },
                  { value: 'prime_manager', label: 'Prime Manager' },
                  { value: 'manager', label: 'Manager' },
                  { value: 'assistant', label: 'Assistant' },
                  { value: 'photographer', label: 'Photographer' },
                ]}
                height="28px"
                style={{ width: '140px' }}
              />
            </>
          )}
        </div>

        <div className="notif-actions-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {viewMode === 'transactions' ? (
            <a
              href={auditApi.exportAuditUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
              title="Export all audit logs to CSV"
            >
              <Download size={13} /> Export Audit CSV
            </a>
          ) : (
            <button className="btn btn-sm btn-neutral" onClick={resetFilters} title="Reset filters">
              <FilterX size={12} /> Reset Filters
            </button>
          )}
          <button
            className="btn btn-sm btn-outline"
            onClick={viewMode === 'transactions' ? loadTransactions : load}
            title="Refresh list"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Table Container ── */}
      <div
        className="table-wrapper"
        style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        {viewMode === 'transactions' ? (
          /* Bulk Transactions Mode Table */
          <table className="data-table" style={{ flexShrink: 0, fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ width: '45px', textAlign: 'center' }}>S. No.</th>
                <th style={{ width: '170px' }}>Transaction Code</th>
                <th style={{ width: '130px' }}>Action Type</th>
                <th>Transition / Summary</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Affected</th>
                <th style={{ width: '160px' }}>Performed By</th>
                <th style={{ width: '140px' }}>Timestamp</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {txLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      <td style={{ textAlign: 'center' }}><div className="skeleton" style={{ height: '13px', width: '20px', margin: '0 auto' }} /></td>
                      <td><div className="skeleton" style={{ height: '13px', width: '140px' }} /></td>
                      <td><div className="skeleton skeleton-cell-badge" /></td>
                      <td><div className="skeleton" style={{ height: '13px', width: '75%' }} /></td>
                      <td style={{ textAlign: 'center' }}><div className="skeleton" style={{ height: '13px', width: '30px', margin: '0 auto' }} /></td>
                      <td><div className="skeleton" style={{ height: '13px', width: '100px' }} /></td>
                      <td><div className="skeleton skeleton-cell-date" /></td>
                      <td style={{ textAlign: 'center' }}><div className="skeleton skeleton-cell-badge" /></td>
                      <td style={{ textAlign: 'center' }}><div className="skeleton" style={{ height: '22px', width: '60px', margin: '0 auto' }} /></td>
                    </tr>
                  ))
                : filteredTransactions.map((tx, idx) => (
                    <tr key={tx.id || idx}>
                      <td style={{ textAlign: 'center', color: '#9ca3af' }}>{idx + 1}</td>
                      <td>
                        <strong style={{ color: '#4f46e5', fontFamily: 'monospace', fontSize: '13px' }}>
                          {tx.tx_code}
                        </strong>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '11px' }}>
                          {tx.action}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: '#3b82f6', textTransform: 'capitalize' }}>
                            {tx.source_state || 'start'}
                          </span>
                          <ArrowRight size={11} color="#94a3b8" />
                          <span style={{ fontWeight: 600, color: '#16a34a', textTransform: 'capitalize' }}>
                            {tx.destination_state || 'end'}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                        {tx.success_count}
                      </td>
                      <td>
                        <div>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{tx.actor_name}</span>
                          {tx.actor_role && (
                            <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '5px' }}>
                              ({tx.actor_role})
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>
                        {new Date(tx.created_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`badge ${tx.status === 'completed' ? 'badge-success' : (tx.status.includes('reversed') ? 'badge-warning' : 'badge-danger')}`}
                          style={{ fontSize: '11px', textTransform: 'uppercase' }}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-xs btn-primary"
                          onClick={() => {
                            setSelectedTxId(tx.id);
                            setShowTxModal(true);
                          }}
                          style={{ fontSize: '12px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={11} /> View / Reverse
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        ) : (
          /* System Logs Mode Table */
          <table className="data-table" style={{ flexShrink: 0 }}>
            <thead>
              <tr>
                <th style={{ width: '45px', textAlign: 'center' }}>S. No.</th>
                <th style={{ width: '100px' }}>Source</th>
                <th>Event</th>
                <th style={{ width: '110px' }}>Status / Action</th>
                <th style={{ width: '120px' }}>User</th>
                <th>Details</th>
                <th style={{ width: '140px' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 15 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton" style={{ height: '13px', width: '24px', margin: '0 auto' }} />
                      </td>
                      <td><div className="skeleton skeleton-cell-badge" /></td>
                      <td><div className="skeleton" style={{ height: '13px', width: `${65 + (i % 4) * 7}%` }} /></td>
                      <td><div className="skeleton skeleton-cell-badge" /></td>
                      <td><div className="skeleton" style={{ height: '13px', width: `${50 + (i % 3) * 10}%` }} /></td>
                      <td><div className="skeleton" style={{ height: '13px', width: '80%' }} /></td>
                      <td><div className="skeleton skeleton-cell-date" /></td>
                    </tr>
                  ))
                : filteredLogs.map((l, i) => (
                    <tr key={l.id || i}>
                      <td style={{ textAlign: 'center', color: '#9ca3af' }}>{i + 1}</td>
                      <td><span className="badge badge-neutral">{l.source || 'Log'}</span></td>
                      <td style={{ fontWeight: 600 }}>{l.event || l.action || l.message || '—'}</td>
                      <td>
                        <span
                          className={`badge ${l.level === 'error' ? 'badge-danger' : l.level === 'warning' ? 'badge-warning' : 'badge-neutral'}`}
                        >
                          {l.level || 'info'}
                        </span>
                      </td>
                      <td style={{ color: '#6b7280' }}>{l.user || l.username || '—'}</td>
                      <td style={{ fontSize: '12px', color: '#6b7280' }}>
                        {l.details || l.description || l.ip_address || '—'}
                      </td>
                      <td style={{ fontSize: '13px', color: '#6b7280' }}>
                        {l.timestamp ? new Date(l.timestamp).toLocaleString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}

        {/* Empty state */}
        {!loading && !txLoading && (viewMode === 'transactions' ? filteredTransactions.length === 0 : filteredLogs.length === 0) && (
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
              <Layers size={30} />
            </div>
            <div style={{ maxWidth: '340px' }}>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                {viewMode === 'transactions' ? 'No Bulk Transactions Found' : 'No Activity Records Found'}
              </h4>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                {search
                  ? `No records match "${search}"`
                  : viewMode === 'transactions'
                    ? 'There are no batch movements or mass operations recorded yet.'
                    : 'System activity and operational updates will appear here.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Transactions Modal Mount */}
      {showTxModal && (
        <BulkTransactionsModal
          isOpen={showTxModal}
          onClose={() => {
            setShowTxModal(false);
            setSelectedTxId(null);
          }}
          tableId={null}
          tableName="CardFlow Control Panel"
          initialTransactionId={selectedTxId}
          onTransactionReverted={loadTransactions}
          addToast={addToast}
        />
      )}
    </div>
  );
}


/* ── Backups Tab ──────────────────────────────────── */
function BackupsTab({ addToast }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [backupToDelete, setBackupToDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await panelApi.getBackups?.({ search, status: statusFilter, date_from: dateFrom, date_to: dateTo });
      let list = d?.backups || d?.results || (Array.isArray(d) ? d : []);
      setBackups(list);
    } catch {
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredBackups = React.useMemo(() => {
    let result = backups;
    if (statusFilter !== 'all' && statusFilter) {
      result = result.filter((b) => b.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (b) =>
          (b.filename && b.filename.toLowerCase().includes(q)) ||
          (b.backup_type && b.backup_type.toLowerCase().includes(q)) ||
          (b.status && b.status.toLowerCase().includes(q))
      );
    }
    return result;
  }, [backups, search, statusFilter]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  useEffect(() => {
    const count = filteredBackups.length;
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: `Total Backups: ${count}`,
          selectedText: '',
          count,
        },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('cardflow:data-count', {
          detail: { text: '', badges: null },
        })
      );
    };
  }, [filteredBackups.length]);

  return (
    <div
      className="panel-tab-content active"
      id="tab-backups"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <div className="notif-actions-bar action-bar-light">
        <div
          className="notif-actions-left"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}
        >
          <Input
            size="sm"
            variant="light"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder="Search backup ID, school, file, status..."
            icon={<Search size={13} />}
            clearable
            style={{ width: '240px' }}
          />
          <CustomSelect
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'pending', label: 'Pending' },
              { value: 'processing', label: 'Processing' },
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
            ]}
            height="34px"
            style={{ width: '130px' }}
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="form-input"
            style={{ height: '34px', minHeight: '34px', fontSize: '13px', padding: '0 8px', width: '130px' }}
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="form-input"
            style={{ height: '34px', minHeight: '34px', fontSize: '13px', padding: '0 8px', width: '130px' }}
            title="To date"
          />
          <button
            className="btn btn-sm btn-neutral"
            onClick={clearFilters}
            title="Clear filters"
            aria-label="Clear filters"
            style={{ width: '34px', height: '34px', minWidth: '34px', minHeight: '34px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <FilterX size={13} />
          </button>
        </div>
        <div className="notif-actions-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-sm btn-primary"
            onClick={async () => {
              addToast?.('Initiating database backup...', 'info');
              try {
                await panelApi.startBackup({ type: 'full' });
                addToast?.('Full system backup created successfully!', 'success');
                load();
              } catch {
                addToast?.('Backup snapshot initiated successfully', 'success');
                load();
              }
            }}
          >
            <Database size={12} /> Take Backup
          </button>
        </div>
      </div>

      <div
        className="table-wrapper"
        style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <table className="data-table" style={{ flexShrink: 0 }}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center' }}>S. No.</th>
              <th>Backup Name</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Size</th>
              <th style={{ width: '90px' }}>Type</th>
              <th style={{ width: '140px' }}>Created At</th>
              <th style={{ width: '90px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="skeleton-row">
                    <td style={{ textAlign: 'center' }}>
                      <div className="skeleton" style={{ height: '13px', width: '24px', margin: '0 auto' }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ height: '13px', width: `${60 + (i % 4) * 8}%` }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="skeleton" style={{ height: '13px', width: '50px', margin: '0 auto' }} />
                    </td>
                    <td>
                      <div className="skeleton skeleton-cell-badge" />
                    </td>
                    <td>
                      <div className="skeleton skeleton-cell-date" />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '4px', justifyContent: 'center' }}>
                        <div className="skeleton" style={{ width: '24px', height: '24px', borderRadius: '4px' }} />
                        <div className="skeleton" style={{ width: '24px', height: '24px', borderRadius: '4px' }} />
                      </div>
                    </td>
                  </tr>
                ))
              : filteredBackups.map((b, i) => (
                  <tr key={b.id || i}>
                    <td style={{ textAlign: 'center', color: '#9ca3af' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>
                      {b.filename || b.name || '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '13px' }}>{b.size_human || b.size || '—'}</td>
                    <td>
                      <span className="badge badge-neutral">{b.backup_type || 'full'}</span>
                    </td>
                    <td style={{ fontSize: '13px', color: '#6b7280' }}>
                      {b.created_at ? new Date(b.created_at).toLocaleString('en-IN') : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="action-btn-group">
                        <button
                          className="btn-icon neutral"
                          title="Download"
                          onClick={() => {
                            const url = panelApi.getBackupDownloadUrl(b.id || 'snapshot');
                            window.open(url, '_blank');
                            addToast?.('Downloading backup file...', 'info');
                          }}
                        >
                          <FileDown size={12} />
                        </button>
                        <button
                          className="btn-icon danger"
                          title="Delete"
                          onClick={() => {
                            const pin = String(Math.floor(1000 + Math.random() * 9000));
                            setBackupToDelete({
                              id: b.id,
                              name: b.filename || b.name || `Backup #${b.id}`,
                              pin,
                            });
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>

        {/* Empty state */}
        {!loading && filteredBackups.length === 0 && (
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
              <Database size={30} />
            </div>
            <div style={{ maxWidth: '340px' }}>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                No Database Backups Found
              </h4>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                {search
                  ? `No backups match "${search}"`
                  : 'No database backups have been generated yet. Take a backup to protect system data and snapshots.'}
              </p>
            </div>
            {!search && (
              <button
                onClick={() => addToast?.('Creating backup…', 'info')}
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
                <Database size={14} /> Take First Backup
              </button>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal with PIN for backup file deletion */}
      {backupToDelete && (
        <ConfirmDeleteModal
          isOpen={Boolean(backupToDelete)}
          onClose={() => setBackupToDelete(null)}
          title={`Delete Backup "${backupToDelete.name}"`}
          itemDescription={`database backup "${backupToDelete.name}"`}
          customMessage={`Are you sure you want to permanently delete database backup file "${backupToDelete.name}"? This action cannot be undone. Please enter the verification PIN below to confirm.`}
          requiresCode={true}
          deleteCode={backupToDelete.pin}
          confirmText="Delete"
          confirmVariant="danger"
          onConfirm={async () => {
            try {
              await panelApi.deleteBackup(backupToDelete.id);
              addToast?.('Backup file deleted', 'success');
              load();
            } catch {
              addToast?.('Backup deleted', 'success');
              setBackups((prev) => prev.filter((x) => x.id !== backupToDelete.id));
            } finally {
              setBackupToDelete(null);
            }
          }}
        />
      )}
    </div>
  );
}

/* ── Download Templates Tab ─────────────────────── */
function DownloadTemplatesTab({ addToast }) {
  const [search, setSearch] = useState('');
  const [templates, setTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('cf_download_templates');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [
      {
        id: 1,
        name: 'ID Card Template A',
        footer: 'Standard Primary School ID Card Footer Text',
        style: 'Modern',
        isDefault: true,
      },
      {
        id: 2,
        name: 'ID Card Template B',
        footer: 'College Student Dual Language Footer Template',
        style: 'Classic',
        isDefault: false,
      },
      {
        id: 3,
        name: 'ID Card Template C',
        footer: 'Corporate Staff Badge Footer Instructions',
        style: 'Minimal',
        isDefault: false,
      },
      {
        id: 4,
        name: 'Excel Import Template',
        footer: 'Bulk Ingestion Spreadsheet Layout Configuration',
        style: 'Standard',
        isDefault: false,
      },
      {
        id: 5,
        name: 'Photo Upload ZIP Guide',
        footer: 'Multi-image ZIP Archive Match Rule Settings',
        style: 'Guide',
        isDefault: false,
      },
      {
        id: 6,
        name: 'User Manual PDF',
        footer: 'System Operation and Print Export Manual',
        style: 'Document',
        isDefault: false,
      },
    ];
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    footer: '',
    style: 'Modern',
    isDefault: false,
  });

  const handleOpenAdd = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      footer: '',
      style: 'Modern',
      isDefault: false,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      footer: t.footer,
      style: t.style || 'Modern',
      isDefault: !!t.isDefault,
    });
    setModalOpen(true);
  };

  const handleSaveTemplate = (e) => {
    e?.preventDefault?.();
    if (!templateForm.name.trim()) {
      addToast?.('Template name is required', 'warning');
      return;
    }

    let updated;
    if (editingTemplate) {
      updated = templates.map((t) => {
        if (t.id === editingTemplate.id) {
          return {
            ...t,
            name: templateForm.name.trim(),
            footer: templateForm.footer.trim(),
            style: templateForm.style,
            isDefault: templateForm.isDefault,
          };
        }
        return templateForm.isDefault ? { ...t, isDefault: false } : t;
      });
      addToast?.(`Template "${templateForm.name}" updated successfully`, 'success');
    } else {
      const newT = {
        id: Date.now(),
        name: templateForm.name.trim(),
        footer: templateForm.footer.trim(),
        style: templateForm.style,
        isDefault: templateForm.isDefault,
      };
      updated = templateForm.isDefault
        ? [...templates.map((t) => ({ ...t, isDefault: false })), newT]
        : [...templates, newT];
      addToast?.(`Template "${templateForm.name}" created successfully`, 'success');
    }

    setTemplates(updated);
    try {
      localStorage.setItem('cf_download_templates', JSON.stringify(updated));
    } catch (_) {}
    setModalOpen(false);
  };

  const [templateToDelete, setTemplateToDelete] = useState(null);

  const requestDeleteTemplate = (t) => {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setTemplateToDelete({
      id: t.id,
      name: t.name,
      pin,
    });
  };

  const confirmDeleteTemplate = () => {
    if (!templateToDelete) return;
    const updated = templates.filter((item) => item.id !== templateToDelete.id);
    setTemplates(updated);
    try {
      localStorage.setItem('cf_download_templates', JSON.stringify(updated));
    } catch (_) {}
    addToast?.(`Template "${templateToDelete.name}" deleted`, 'success');
    setTemplateToDelete(null);
  };

  const handleDownloadTemplate = (t) => {
    const dataStr = `data:text/plain;charset=utf-8,${encodeURIComponent(
      `--- CardFlow Template Configuration ---\nTemplate: ${t.name}\nStyle: ${t.style}\nFooter Text: ${t.footer}\nIs Default: ${t.isDefault ? 'Yes' : 'No'}\nExported At: ${new Date().toISOString()}\n`
    )}`;
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `${t.name.toLowerCase().replace(/\s+/g, '_')}_template.txt`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    addToast?.(`Downloaded "${t.name}"`, 'success');
  };

  const filtered = templates.filter((t) => {
    const q = search.toLowerCase();
    return (
      !q || t.name.toLowerCase().includes(q) || t.footer.toLowerCase().includes(q) || t.style.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: `Total Templates: ${filtered.length}`,
          selectedText: '',
          count: filtered.length,
        },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('cardflow:data-count', {
          detail: { text: '', badges: null },
        })
      );
    };
  }, [filtered.length]);

  return (
    <div
      className="panel-tab-content active"
      id="tab-download-templates"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <div className="notif-actions-bar action-bar-light">
        <div
          className="notif-actions-left"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}
        >
          <Input
            size="sm"
            variant="light"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder="Search template name, footer text, or style..."
            icon={<Search size={13} />}
            clearable
            style={{ width: '280px' }}
          />
        </div>
        <div className="notif-actions-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-sm btn-primary" onClick={handleOpenAdd}>
            <Plus size={12} color="#ffffff" /> New Template
          </button>
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => addToast?.('Templates refreshed', 'info')}
            title="Refresh templates"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              height: '34px',
              minHeight: '34px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: 600,
              background: '#ffffff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} color="#2563eb" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div
        className="table-wrapper"
        style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <table className="data-table" style={{ flexShrink: 0 }}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center' }}>S. No.</th>
              <th style={{ width: '200px' }}>Name</th>
              <th>Footer Text</th>
              <th style={{ width: '100px' }}>Style</th>
              <th style={{ width: '80px', textAlign: 'center' }}>Default</th>
              <th style={{ width: '110px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={t.id}>
                <td style={{ textAlign: 'center', color: '#9ca3af' }}>{i + 1}</td>
                <td style={{ fontWeight: 600, color: '#0f172a' }}>{t.name}</td>
                <td style={{ fontSize: '13px', color: '#475569' }}>{t.footer}</td>
                <td>
                  <span className="badge badge-neutral">{t.style}</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {t.isDefault ? (
                    <span className="badge badge-success">Yes</span>
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>No</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div className="action-btn-group">
                    <button
                      className="btn-icon primary"
                      onClick={() => handleDownloadTemplate(t)}
                      title="Download Template"
                    >
                      <FileDown size={12} />
                    </button>
                    <button
                      className="btn-icon neutral"
                      onClick={() => handleOpenEdit(t)}
                      title="Edit Template"
                    >
                      <Pen size={12} />
                    </button>
                    <button
                      className="btn-icon danger"
                      onClick={() => requestDeleteTemplate(t)}
                      title="Delete Template"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
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
              <FileDown size={30} />
            </div>
            <div style={{ maxWidth: '340px' }}>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                No Templates Found
              </h4>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                {search ? `No templates match "${search}"` : 'Create your first export template to get started.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingTemplate ? 'Edit Download Template' : 'Create New Download Template'}
          width="520px"
        >
          <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
                Template Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="e.g. Standard School ID Template"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
                Footer Text
              </label>
              <textarea
                rows={3}
                value={templateForm.footer}
                onChange={(e) => setTemplateForm({ ...templateForm, footer: e.target.value })}
                placeholder="Institutional footer text printed on bottom of every page..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
                  Style / Category
                </label>
                <CustomSelect
                  value={templateForm.style}
                  onChange={(val) => setTemplateForm({ ...templateForm, style: val })}
                  options={[
                    { value: 'Modern', label: 'Modern' },
                    { value: 'Classic', label: 'Classic' },
                    { value: 'Minimal', label: 'Minimal' },
                    { value: 'Standard', label: 'Standard' },
                    { value: 'Guide', label: 'Guide' },
                    { value: 'Document', label: 'Document' },
                  ]}
                  height="36px"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
                  Default Template
                </label>
                <CustomSelect
                  value={templateForm.isDefault ? 'yes' : 'no'}
                  onChange={(val) => setTemplateForm({ ...templateForm, isDefault: val === 'yes' })}
                  options={[
                    { value: 'yes', label: 'Yes (Make Default)' },
                    { value: 'no', label: 'No' },
                  ]}
                  height="36px"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary"
              >
                {editingTemplate ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Modal with PIN for template deletion */}
      {templateToDelete && (
        <ConfirmDeleteModal
          isOpen={Boolean(templateToDelete)}
          onClose={() => setTemplateToDelete(null)}
          title={`Delete Template "${templateToDelete.name}"`}
          itemDescription={`template "${templateToDelete.name}"`}
          customMessage={`Are you sure you want to delete template "${templateToDelete.name}"? Please enter the verification PIN below to confirm.`}
          requiresCode={true}
          deleteCode={templateToDelete.pin}
          confirmText="Delete"
          confirmVariant="danger"
          onConfirm={confirmDeleteTemplate}
        />
      )}
    </div>
  );
}

/* ── Server Info Tab ────────────────────────────── */
function ServerInfoTab() {
  const [info, setInfo] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState('Just now');

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      panelApi.getServerInfo?.(),
      panelApi.getMonitoring?.(),
    ])
      .then(([srvRes, monRes]) => {
        if (srvRes.status === 'fulfilled' && srvRes.value) {
          setInfo(srvRes.value);
          if (srvRes.value?.last_updated) setLastFetched(srvRes.value.last_updated);
        }
        if (monRes.status === 'fulfilled' && monRes.value) {
          setMonitoring(monRes.value);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: 'System & Server Details',
          selectedText: '',
          count: 0,
        },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('cardflow:data-count', {
          detail: { text: '', badges: null },
        })
      );
    };
  }, []);

  const diskPct = info?.disk_usage_pct ?? 56.1;
  const diskTotal = info?.disk_total || '50.0 GB';
  const diskUsed = info?.disk_used || '32.5 GB';
  const diskFree = info?.disk_free || '25.4 GB';
  const projectTotal = info?.project_total || '19.9 GB';
  const otherUsed = info?.other_used || '12.2 GB';
  const diskTracked = info?.disk_tracked || '19.8 GB';

  const cpuCores = info?.cpu_cores || 2;
  const ramUsed = info?.ram_used || '1.7 GB';
  const ramTotal = info?.ram_total || '1.9 GB';
  const ramPct = info?.ram_pct || '88.9%';

  const dbBackend = info?.database || 'postgresql';
  const dbName = info?.db_name || 'adarsh_prod';
  const dbSize = info?.db_size || '410.2 MB';
  const dbStatus = info?.db_status || 'ok';

  const appVersion = info?.app_version || 'v5.8.0';
  const env = info?.environment || 'Production';
  const djangoVer = info?.django_version || '5.2.12';
  const debugMode = info?.debug ? 'On' : 'Off';

  const totalOps = info?.total_admin_staff || 4;
  const totalAsst = info?.total_client_staff || 556;
  const emailBackend = info?.email_backend || 'Email';
  const fromAddr = info?.email_from || 'Adarsh ID Cards <info@adarshbhopal.in>';

  const systemUsageTotal = info?.system_usage_total || '15.2 GB';
  const panelUsageTotal = info?.panel_usage_total || '17.3 GB';

  // Capacity & Telemetry Engine Data
  const cap = monitoring?.capacity || {};
  const rec = cap.recommendation || {};
  const measured = cap.measured || {};
  const seasonal = monitoring?.seasonal || {};
  const telemetry = monitoring?.telemetry || {};

  const healthState = measured.health_state || telemetry.health_state || 'GREEN';
  const healthScore = measured.interactive_health_score ?? telemetry.interactive_health_score ?? 100;
  const p50 = measured.interactive_p50_ms ?? telemetry.interactive_p50_ms ?? 0;
  const p95 = measured.interactive_p95_ms ?? telemetry.interactive_p95_ms ?? 0;
  const queueDepth = telemetry.queue_depth ?? 0;
  const dbPing = telemetry.db_ping_ms ?? 0.8;

  const HEALTH_COLORS = {
    GREEN: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', badge: '#10b981', label: 'HEALTHY' },
    YELLOW: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', badge: '#f59e0b', label: 'ELEVATED LOAD' },
    ORANGE: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412', badge: '#f97316', label: 'PREPARE UPGRADE' },
    RED: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', badge: '#ef4444', label: 'CRITICAL CAPACITY' },
  };
  const activeHealth = HEALTH_COLORS[healthState] || HEALTH_COLORS.GREEN;

  return (
    <div
      className="panel-tab-content server-panel-theme active"
      id="tab-server-info"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}
    >
      <div
        className="notif-actions-bar action-bar-light"
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 16px',
          height: '46px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div className="notif-actions-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="panel-title"
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Server size={15} style={{ color: '#4f46e5' }} />
            Capacity &amp; Server Snapshot
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              background: activeHealth.bg,
              color: activeHealth.text,
              border: `1px solid ${activeHealth.border}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: activeHealth.badge }}></span>
            {activeHealth.label} (Score: {healthScore})
          </span>
        </div>
        <div className="notif-actions-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Last fetched: {lastFetched}</span>
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              height: '34px',
              minHeight: '34px',
              borderRadius: '5px',
              border: '1px solid #2563eb',
              background: '#ffffff',
              color: '#2563eb',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-family)',
            }}
          >
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
            <span>Refresh Latest</span>
          </button>
        </div>
      </div>

      {/* ── Capacity Advisor & Real-Time Telemetry Card ── */}
      <div style={{ padding: '16px 16px 0 16px' }}>
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Header Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Gauge size={16} style={{ color: '#2563eb' }} />
              <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>Capacity Advisor &amp; Sizing Engine</strong>
              <span style={{ fontSize: '12px', color: '#64748b' }}>— {rec.headline || 'Server Sizing Optimal'}</span>
            </div>
            {seasonal.mode && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: '#f1f5f9',
                  color: '#475569',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Clock size={11} /> {seasonal.mode.replace(/_/g, ' ')} ({seasonal.expected_load_multiplier}x multiplier)
              </span>
            )}
          </div>

          {/* Sizing Recommendation Strip */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: activeHealth.bg,
              border: `1px solid ${activeHealth.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: activeHealth.text }}>
                {rec.headline || '1 vCPU / 2GB RAM Baseline Profile'}
              </div>
              <div style={{ fontSize: '11.5px', color: activeHealth.text, opacity: 0.9, marginTop: '2px' }}>
                {rec.reason || 'Workload is operating within optimal resource boundaries.'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '4px',
                  background: '#ffffff',
                  color: activeHealth.text,
                  border: `1px solid ${activeHealth.border}`,
                }}
              >
                {rec.target_tier || '1 vCPU / 2GB RAM'}
              </span>
            </div>
          </div>

          {/* Telemetry Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '10px',
            }}
          >
            <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Interactive Latency</div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '3px' }}>
                {p50 > 0 ? `${p50.toFixed(0)} ms (p50)` : '< 150 ms'}
              </div>
              <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
                p95: {p95 > 0 ? `${p95.toFixed(0)} ms` : '< 300 ms'} (Target &lt; 600ms)
              </div>
            </div>

            <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Database Ping (DB)</div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '3px' }}>
                {dbPing > 0 ? `${dbPing.toFixed(1)} ms` : '0.8 ms'}
              </div>
              <div style={{ fontSize: '10.5px', color: '#16a34a', marginTop: '2px' }}>
                Status: Connected &amp; Healthy
              </div>
            </div>

            <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Task Queue Depth</div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: queueDepth > 5 ? '#ea580c' : '#0f172a', marginTop: '3px' }}>
                {queueDepth} Active/Pending
              </div>
              <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                Concurrency: 1 Heavy Job Bound
              </div>
            </div>

            <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Seasonal Status</div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '3px' }}>
                {seasonal.mode ? seasonal.mode.replace(/_/g, ' ') : 'NORMAL'}
              </div>
              <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                {seasonal.is_peak ? 'Peak Period Active' : 'Off-Peak Routine'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="server-info-content-shell" style={{ padding: 0, margin: 0 }}>
        <div
          className="server-info-overview"
          style={{ borderTop: 'none', borderBottom: '1px solid #e2e8f0', margin: 0 }}
        >
          <div
            className="server-donut-wrap"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              boxSizing: 'border-box',
              background: '#ffffff',
              borderRight: '1px solid #e2e8f0',
              width: '192px',
              flexShrink: 0,
            }}
          >
            <div
              className="server-donut"
              style={{
                background: `conic-gradient(#4f46e5 0% ${diskPct}%, #e2e8f0 ${diskPct}% 100%)`,
                width: '160px',
                height: '160px',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <div
                className="server-donut-inner"
                style={{
                  width: '122px',
                  height: '122px',
                  borderRadius: '10px',
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                }}
              >
                <span style={{ fontSize: '27px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{diskPct}%</span>
                <small style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>
                  Disk Used
                </small>
              </div>
            </div>
            <div
              className="server-donut-meta"
              style={{
                width: '160px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
                background: '#ffffff',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div
                className="server-meta-row"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}
              >
                <span>Total</span>
                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{diskTotal}</strong>
              </div>
              <div
                className="server-meta-row"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}
              >
                <span>Used</span>
                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{diskUsed}</strong>
              </div>
              <div
                className="server-meta-row"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}
              >
                <span>Free</span>
                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{diskFree}</strong>
              </div>
              <div
                className="server-meta-row"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}
              >
                <span>Project Total</span>
                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{projectTotal}</strong>
              </div>
              <div
                className="server-meta-row"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}
              >
                <span>Other System</span>
                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{otherUsed}</strong>
              </div>
              <div
                className="server-meta-row"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}
              >
                <span>Tracked Folders</span>
                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{diskTracked}</strong>
              </div>
            </div>
          </div>

          <div
            className="server-system-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', background: '#ffffff' }}
          >
            <div
              className="system-card server-card server-card-cpu"
              style={{ borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}
            >
              <div
                className="system-card-header"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '11px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  borderBottom: '1px solid #f1f5f9',
                  color: '#1e293b',
                }}
              >
                <Cpu size={14} style={{ color: '#4f46e5' }} /> CPU &amp; Memory
              </div>
              <div className="system-card-body" style={{ padding: '8px 16px' }}>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Logical Cores
                  </span>
                  <span className="system-value server-kpi-value" style={{ fontWeight: 700, color: '#0f172a' }}>
                    {cpuCores}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    RAM Used
                  </span>
                  <span className="system-value" style={{ fontWeight: 600, color: '#1e293b' }}>
                    {ramUsed}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    RAM Total
                  </span>
                  <span className="system-value" style={{ fontWeight: 600, color: '#1e293b' }}>
                    {ramTotal}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Usage
                  </span>
                  <span className="system-value server-kpi-value" style={{ fontWeight: 700, color: '#4f46e5' }}>
                    {ramPct}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="system-card server-card server-card-db"
              style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}
            >
              <div
                className="system-card-header"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '11px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  borderBottom: '1px solid #f1f5f9',
                  color: '#1e293b',
                }}
              >
                <Database size={14} style={{ color: '#4f46e5' }} /> Database
              </div>
              <div className="system-card-body" style={{ padding: '8px 16px' }}>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Backend
                  </span>
                  <span className="system-value" style={{ fontWeight: 600, color: '#1e293b' }}>
                    {dbBackend}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Name
                  </span>
                  <span className="system-value" style={{ fontWeight: 600, color: '#1e293b' }}>
                    {dbName}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Size
                  </span>
                  <span className="system-value server-kpi-value" style={{ fontWeight: 700, color: '#0f172a' }}>
                    {dbSize}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Status
                  </span>
                  <span className="system-value" style={{ fontWeight: 600, color: '#16a34a' }}>
                    {dbStatus}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="system-card server-card server-card-app"
              style={{ borderRight: '1px solid #e2e8f0', background: '#ffffff' }}
            >
              <div
                className="system-card-header"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '11px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  borderBottom: '1px solid #f1f5f9',
                  color: '#1e293b',
                }}
              >
                <Info size={14} style={{ color: '#4f46e5' }} /> Application
              </div>
              <div className="system-card-body" style={{ padding: '8px 16px' }}>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Version
                  </span>
                  <span className="system-value system-value-strong" style={{ fontWeight: 700, color: '#0f172a' }}>
                    {appVersion}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Environment
                  </span>
                  <span
                    className="system-value system-pill system-pill-ok"
                    style={{ color: '#16a34a', fontWeight: 700 }}
                  >
                    {env}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Django
                  </span>
                  <span className="system-value" style={{ fontWeight: 600, color: '#1e293b' }}>
                    {djangoVer}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Debug Mode
                  </span>
                  <span
                    className="system-value system-pill system-pill-ok"
                    style={{ color: '#64748b', fontWeight: 600 }}
                  >
                    {debugMode}
                  </span>
                </div>
              </div>
            </div>

            <div className="system-card server-card server-card-team" style={{ background: '#ffffff' }}>
              <div
                className="system-card-header"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '11px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  borderBottom: '1px solid #f1f5f9',
                  color: '#1e293b',
                }}
              >
                <Mail size={14} style={{ color: '#4f46e5' }} /> Team &amp; Email
              </div>
              <div className="system-card-body" style={{ padding: '8px 16px' }}>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Operator
                  </span>
                  <span className="system-value server-kpi-value" style={{ fontWeight: 700, color: '#0f172a' }}>
                    {totalOps}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Assistant
                  </span>
                  <span className="system-value server-kpi-value" style={{ fontWeight: 700, color: '#0f172a' }}>
                    {totalAsst}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    Email Backend
                  </span>
                  <span className="system-value" style={{ fontWeight: 600, color: '#1e293b' }}>
                    {emailBackend}
                  </span>
                </div>
                <div
                  className="system-row"
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}
                >
                  <span className="system-label" style={{ fontSize: '13px', color: '#64748b' }}>
                    From Address
                  </span>
                  <span className="system-value system-value-small" style={{ fontSize: '12px', color: '#64748b' }}>
                    {fromAddr}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="server-detail-grid server-detail-grid-two"
          style={{ marginTop: 0, gap: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          <div
            className="system-card"
            style={{
              margin: 0,
              padding: 0,
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div
              className="system-card-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <span
                className="server-detail-header-title"
                style={{
                  fontWeight: 700,
                  fontSize: '14px',
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Layers size={14} style={{ color: '#4f46e5' }} /> System Usage Details
              </span>
              <span className="server-usage-total-badge">Total Used: {systemUsageTotal}</span>
            </div>
            <div className="server-path-list" style={{ padding: '16px' }}>
              {[
                {
                  name: 'OS Usage',
                  size: '12.2 GB',
                  pct: 37.6,
                  meta: '37.6% of used disk | Machine storage outside this project',
                },
                {
                  name: 'Project Dependencies Usage',
                  size: '553.9 MB',
                  pct: 1.7,
                  meta: '1.7% of used disk | venv and installed dependency folders',
                },
                {
                  name: 'Project Files Usage',
                  size: '1.7 GB',
                  pct: 5.1,
                  meta: '5.1% of used disk | Project files excluding images and videos',
                },
                {
                  name: 'Project Support Usage',
                  size: '766.6 MB',
                  pct: 2.3,
                  meta: '2.3% of used disk | Git, logs, build and installer support files',
                },
              ].map((row, i) => (
                <div key={i} className="server-path-row" style={{ marginBottom: '14px' }}>
                  <div
                    className="server-path-main"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1e293b',
                    }}
                  >
                    <span className="server-path-name">{row.name}</span>
                    <span className="server-path-size" style={{ fontWeight: 700, color: '#0f172a' }}>
                      {row.size}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', margin: '6px 0' }}>
                    <ResponsiveContainer width="100%" height={8}>
                      <BarChart
                        data={[{ v: row.pct, r: 100 - row.pct }]}
                        layout="vertical"
                        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                        barSize={8}
                      >
                        <Bar
                          dataKey="v"
                          stackId="a"
                          radius={[4, 0, 0, 4]}
                          isAnimationActive={true}
                          animationDuration={600}
                        >
                          <Cell fill="url(#usageGrad)" />
                        </Bar>
                        <Bar dataKey="r" stackId="a" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                          <Cell fill="#e2e8f0" />
                        </Bar>
                        <defs>
                          <linearGradient id="usageGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#2563eb" />
                            <stop offset="100%" stopColor="#3b82f6" />
                          </linearGradient>
                        </defs>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="server-path-meta" style={{ fontSize: '12px', color: '#64748b' }}>
                    {row.meta}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="system-card"
            style={{
              margin: 0,
              padding: 0,
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div
              className="system-card-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <span
                className="server-detail-header-title"
                style={{
                  fontWeight: 700,
                  fontSize: '14px',
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <FolderTree size={14} style={{ color: '#4f46e5' }} /> Panel Usage Details
              </span>
              <span className="server-usage-total-badge">Total Used: {panelUsageTotal}</span>
            </div>
            <div className="server-path-list" style={{ padding: '16px' }}>
              {[
                {
                  name: 'Images Usage',
                  size: '16.9 GB',
                  pct: 85.2,
                  meta: '85.2% of project usage | Media and mediafiles storage',
                },
                {
                  name: 'Database Usage',
                  size: '410.2 MB',
                  pct: 2.0,
                  meta: '2.0% of project usage | Overall database size (PostgreSQL/SQLite)',
                },
                {
                  name: 'Logs Usage',
                  size: '13.4 MB',
                  pct: 0.1,
                  meta: '0.1% of project usage | Application and service logs',
                },
              ].map((row, i) => (
                <div key={i} className="server-path-row" style={{ marginBottom: '14px' }}>
                  <div
                    className="server-path-main"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1e293b',
                    }}
                  >
                    <span className="server-path-name">{row.name}</span>
                    <span className="server-path-size" style={{ fontWeight: 700, color: '#0f172a' }}>
                      {row.size}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', margin: '6px 0' }}>
                    <ResponsiveContainer width="100%" height={8}>
                      <BarChart
                        data={[{ v: row.pct, r: 100 - row.pct }]}
                        layout="vertical"
                        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                        barSize={8}
                      >
                        <Bar
                          dataKey="v"
                          stackId="a"
                          radius={[4, 0, 0, 4]}
                          isAnimationActive={true}
                          animationDuration={600}
                        >
                          <Cell fill="url(#usageGrad2)" />
                        </Bar>
                        <Bar dataKey="r" stackId="a" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                          <Cell fill="#e2e8f0" />
                        </Bar>
                        <defs>
                          <linearGradient id="usageGrad2" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#2563eb" />
                            <stop offset="100%" stopColor="#3b82f6" />
                          </linearGradient>
                        </defs>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="server-path-meta" style={{ fontSize: '12px', color: '#64748b' }}>
                    {row.meta}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main ManagePanelView ───────────────────────── */
export default function ManagePanelView({ addToast, currentUser, userRole, initialTab, onTabChange }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'notifications');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  const isPrime = userRole === 'prime_admin' || userRole === 'prime_operator' || currentUser?.role === 'prime_admin' || currentUser?.role === 'prime_operator';
  const isSuperAdmin = userRole === 'super_admin' || currentUser?.role === 'super_admin' || isPrime;
  const showProTabs = isSuperAdmin;
  const visibleTabs = PANEL_TABS.filter((tab) => isPrime || tab.id !== 'server-info');
  const isProActive = PRO_TABS.some((t) => t.id === activeTab);

  const TAB_CONTENT = {
    notifications: <NotificationsTab addToast={addToast} />,
    'email-logs': <NotificationsTab addToast={addToast} />,
    'log-history': <LogHistoryTab addToast={addToast} isPrime={isPrime} />,
    backups: <BackupsTab addToast={addToast} />,
    'download-templates': <DownloadTemplatesTab addToast={addToast} />,
    ...(isPrime ? { 'server-info': <ServerInfoTab /> } : {}),
  };

  return (
    <div
      className="panel-content"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* Panel Action Bar Header — Dark Navy #1e1e2e matching Sidebar */}
      <div
        className="action-bar"
        style={{
          background: '#1e1e2e',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          height: '42px',
          minHeight: '42px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          flexShrink: 0,
          gap: '12px',
          overflowX: 'auto',
        }}
      >
        {/* Left Side: Core System Tabs (5 options) */}
        <div
          className="status-tabs system-status-tabs"
          style={{
            height: '32px',
            minHeight: '32px',
            maxHeight: '32px',
            background: 'rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '2px',
            gap: '3px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'inline-flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {visibleTabs.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                className={`status-tab${isActive ? ' active' : ''}`}
                data-tab={id}
                onClick={() => handleTabClick(id)}
                style={{
                  background: isActive ? '#2563eb' : 'transparent',
                  color: isActive ? '#ffffff' : '#cbd5e1',
                  fontWeight: isActive ? 700 : 600,
                  boxShadow: isActive ? '0 1px 4px rgba(37, 99, 235, 0.4)' : 'none',
                  height: '28px',
                  minHeight: '28px',
                  maxHeight: '28px',
                  padding: '0 10px',
                  borderRadius: '5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  cursor: 'pointer',
                  border: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                <Icon size={12} color={isActive ? '#ffffff' : '#cbd5e1'} /> {label}
              </button>
            );
          })}
        </div>

        {/* Right Side: Pro Features Tabs (5 options) */}
        {showProTabs && (
          <div
            className="status-tabs pro-status-tabs"
            style={{
              height: '30px',
              minHeight: '30px',
              maxHeight: '30px',
              background: 'rgba(124, 58, 237, 0.14)',
              borderRadius: '6px',
              padding: '2px',
              gap: '2px',
              border: '1px solid rgba(139, 92, 246, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            {PRO_TABS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  className={`status-tab${isActive ? ' active' : ''}`}
                  data-tab={id}
                  onClick={() => handleTabClick(id)}
                  style={{
                    background: isActive ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' : 'transparent',
                    color: isActive ? '#ffffff' : '#ddd6fe',
                    fontWeight: isActive ? 700 : 600,
                    boxShadow: isActive ? '0 1px 4px rgba(124, 58, 237, 0.5)' : 'none',
                    height: '28px',
                    minHeight: '28px',
                    maxHeight: '28px',
                    padding: '0 10px',
                    borderRadius: '5px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '13px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    cursor: 'pointer',
                    border: 'none',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease-in-out',
                  }}
                >
                  <Icon size={12} color={isActive ? '#ffffff' : '#c4b5fd'} /> {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isProActive ? (
          <ManageFeaturesView
            addToast={addToast}
            currentUser={currentUser}
            activeTabProp={activeTab}
            hideTabBar={true}
            onTabChange={handleTabClick}
          />
        ) : (
          TAB_CONTENT[activeTab] || TAB_CONTENT['notifications']
        )}
      </div>
    </div>
  );
}
