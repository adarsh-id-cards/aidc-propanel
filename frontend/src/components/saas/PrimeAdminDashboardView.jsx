import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Building,
  CreditCard,
  TrendingUp,
  Globe,
  Smartphone,
  Shield,
  Plus,
  RefreshCw,
  Key,
  KeyRound,
  Users,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  ChevronRight,
  Sparkles,
  Edit,
  X,
  Copy,
  Eye,
  Clock,
  XCircle,
  Server,
  Activity,
  HardDrive,
  Zap,
  UserCheck,
  Search,
  ChevronDown,
  Sliders,
  Layers,
  FilterX,
  Download,
} from 'lucide-react';
import { saasApi } from '../../services/api';

import Input from '../common/Input';
import CustomSelect from '../common/CustomSelect';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import TenantDetailsDrawer from './TenantDetailsDrawer';
import '../../styles/saas-control-center.css';

const DEFAULT_OPERATOR_PERMS = {
  sales: {
    can_manage_subscriptions: true,
    can_manage_billing: true,
    can_view_directory: true,
    can_impersonate: false,
    can_view_logs: false,
    can_edit_tiers: false,
    can_manage_domains: false,
  },
  dev: {
    can_view_logs: true,
    can_manage_domains: true,
    can_edit_tiers: true,
    can_manage_subscriptions: true,
    can_impersonate: true,
    can_manage_billing: false,
    can_view_directory: true,
  },
  helper: {
    can_view_directory: true,
    can_impersonate: true,
    can_view_logs: false,
    can_manage_billing: false,
    can_manage_subscriptions: false,
    can_edit_tiers: false,
    can_manage_domains: false,
  },
};

export default function PrimeAdminDashboardView({ currentUser, userRole, initialTab = 'overview', addToast, onNavigate }) {
  const [activeSubTab, setActiveSubTab] = useState(
    ['domains_landing', 'mobile_app', 'feature_matrix', 'platform_settings'].includes(initialTab)
      ? 'platform_settings'
      : initialTab
  );
  const [loading, setLoading] = useState(false);

  // SaaS Platform Data
  const [overview, setOverview] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [primeOperators, setPrimeOperators] = useState([]);
  const [tierMatrix, setTierMatrix] = useState({});

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Drawer & Overview states
  const [drawerTenant, setDrawerTenant] = useState(null);
  const [overviewSection, setOverviewSection] = useState('clients'); // 'clients' | 'engine'
  const [overviewTierFilter, setOverviewTierFilter] = useState('all'); // 'all' | 'lite' | 'pro' | 'max'
  const [expandedTenants, setExpandedTenants] = useState({});
  const [overviewSearch, setOverviewSearch] = useState('');

  // Prime Operators management states (SuperAdmin table style)
  const [selectedOperatorId, setSelectedOperatorId] = useState(null);
  const [operatorStatusFilter, setOperatorStatusFilter] = useState('All');
  const [operatorRoleFilter, setOperatorRoleFilter] = useState('all');
  const [operatorSearch, setOperatorSearch] = useState('');
  const [showEditOperatorModal, setShowEditOperatorModal] = useState(null);
  const [editOperatorForm, setEditOperatorForm] = useState({
    id: null,
    username: '',
    email: '',
    phone: '',
    prime_operator_role: 'sales',
    is_active: true,
    password: '',
    operator_permissions: {},
    effective_permissions: {},
  });
  const [showDeleteOperatorModal, setShowDeleteOperatorModal] = useState(null);
  const [deleteOperatorCode, setDeleteOperatorCode] = useState('');
  const [licenseRegenTarget, setLicenseRegenTarget] = useState(null);

  // Tier Plan editing states (Prime Admin capability)
  const [editingTier, setEditingTier] = useState(null);
  const [tierEditForm, setTierEditForm] = useState({
    tier: 'lite',
    display_name: '',
    price_monthly: 499,
    max_cards: 10000,
    max_organisations: 100,
    max_super_admins: 3,
    description: '',
    features: {},
  });

  // Payment Verification & Ledger states
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [previewProofModal, setPreviewProofModal] = useState(null);
  const [rejectingPayment, setRejectingPayment] = useState(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [verifyingPaymentId, setVerifyingPaymentId] = useState(null);

  // Logs & Telemetry states
  const [logs, setLogs] = useState([]);
  const [logStats, setLogStats] = useState(null);
  const [logCategoryFilter, setLogCategoryFilter] = useState('all');
  const [logLevelFilter, setLogLevelFilter] = useState('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Modals
  const [showCreateSubModal, setShowCreateSubModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showCreateOperatorModal, setShowCreateOperatorModal] = useState(false);


  // Forms
  const [subForm, setSubForm] = useState({
    name: '',
    slug: '',
    tier: 'pro',
    status: 'active',
    custom_domain: '',
    custom_subdomain: '',
    max_organisations: 25,
    max_cards: 25000,
    renews_at: '',
    notes: '',
    initial_admin_username: '',
    initial_admin_email: '',
    initial_admin_password: '',
  });

  const [paymentForm, setPaymentForm] = useState({
    subscription_id: '',
    amount: '',
    currency: 'USD',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'stripe',
    invoice_number: '',
    status: 'completed',
    next_renewal_date: '',
    notes: '',
  });

  const [operatorForm, setOperatorForm] = useState({
    username: '',
    email: '',
    password: '',
    phone: '',
    prime_operator_role: 'sales',
    operator_permissions: DEFAULT_OPERATOR_PERMS.sales,
  });

  // Check sub-role permissions
  const isPrimeAdmin = userRole === 'prime_admin' || currentUser?.role === 'prime_admin';
  const opRole = currentUser?.prime_operator_role || '';
  const canAccessSales = isPrimeAdmin || opRole === 'sales';
  const canAccessDev = isPrimeAdmin || opRole === 'dev';

  // ── Data Fetching ──────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, subRes, payRes, featRes] = await Promise.all([
        saasApi.getOverview().catch(() => ({ overview: null })),
        saasApi.getSubscriptions().catch(() => ({ subscriptions: [] })),
        canAccessSales ? saasApi.getPayments().catch(() => ({ payments: [] })) : Promise.resolve({ payments: [] }),
        saasApi.getTierFeatures().catch(() => ({ matrix: {} })),
      ]);

      if (ovRes?.overview) setOverview(ovRes.overview);
      if (subRes?.subscriptions) setSubscriptions(subRes.subscriptions);
      if (payRes?.payments) setPayments(payRes.payments);
      if (featRes?.matrix) setTierMatrix(featRes.matrix);

      if (isPrimeAdmin) {
        const opRes = await saasApi.getPrimeOperators().catch(() => ({ prime_operators: [] }));
        if (opRes?.prime_operators) setPrimeOperators(opRes.prime_operators);
      }
    } catch (err) {
      addToast?.('Failed to fetch SaaS platform data', 'error');
    } finally {
      setLoading(false);
    }
  }, [canAccessSales, isPrimeAdmin, addToast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Synchronize active subtab when navigation changes via sidebar
  useEffect(() => {
    if (initialTab) {
      if (['domains_landing', 'mobile_app', 'feature_matrix', 'platform_settings'].includes(initialTab)) {
        setActiveSubTab('platform_settings');
      } else {
        setActiveSubTab(initialTab);
      }
    }
  }, [initialTab]);

  const handleTabClick = (tabKey) => {
    setActiveSubTab(tabKey);
    if (onNavigate) {
      const sidebarMap = {
        overview: 'dashboard',
        subscriptions: 'saas_subscriptions',
        payments: 'saas_payments',
        prime_operators: 'saas_prime_operators',
        platform_settings: 'saas_settings',
        domains_landing: 'saas_settings',
        mobile_app: 'saas_settings',
        feature_matrix: 'saas_settings',
        logs: 'saas_logs',
      };
      if (sidebarMap[tabKey]) {
        onNavigate(sidebarMap[tabKey]);
      }
    }
  };

  // Global Escape key listener to close active modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowCreateSubModal(false);
        setShowRecordPaymentModal(false);
        setShowCreateOperatorModal(false);
        setPreviewProofModal(null);
        setRejectingPayment(null);
        setEditingTier(null);
        setShowEditOperatorModal(null);
        setShowDeleteOperatorModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleCreateSubscription = async (e) => {
    e.preventDefault();
    if (!subForm.name.trim()) {
      addToast?.('Subscription name is required', 'error');
      return;
    }
    try {
      const payload = {
        name: subForm.name,
        slug: subForm.slug || undefined,
        tier: subForm.tier,
        status: subForm.status,
        custom_domain: subForm.custom_domain || undefined,
        custom_subdomain: subForm.custom_subdomain || undefined,
        max_organisations: Number(subForm.max_organisations) || 25,
        max_cards: Number(subForm.max_cards) || 25000,
        renews_at: subForm.renews_at || undefined,
        notes: subForm.notes,
      };
      if (subForm.initial_admin_username) {
        payload.initial_super_admin = {
          username: subForm.initial_admin_username,
          email: subForm.initial_admin_email,
          password: subForm.initial_admin_password,
        };
      }
      const res = await saasApi.createSubscription(payload);
      const adminInfo = res?.initial_admin || res?.data?.initial_admin;
      if (adminInfo?.username && adminInfo?.password) {
        addToast?.(
          `Subscription '${subForm.name}' created! Super Admin: ${adminInfo.username} / Password: ${adminInfo.password}`,
          'success'
        );
      } else {
        addToast?.(`Subscription '${subForm.name}' created!`, 'success');
      }
      setShowCreateSubModal(false);
      setSubForm({
        name: '', slug: '', tier: 'pro', status: 'active',
        custom_domain: '', custom_subdomain: '',
        max_organisations: 25, max_cards: 25000,
        renews_at: '', notes: '',
        initial_admin_username: '', initial_admin_email: '', initial_admin_password: '',
      });
      fetchAllData();
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to create subscription', 'error');
    }
  };

  const handleEnterAccount = async (sub) => {
    try {
      const res = await saasApi.enterAccount(sub.id);
      addToast?.(res.message || `Impersonating ${sub.name}...`, 'success');
      try {
        localStorage.removeItem('cf_auth_user');
        sessionStorage.removeItem('cf_auth_user');
      } catch (_) {}
      if (window.__setActiveImpersonation && res.target_user) {
        window.__setActiveImpersonation(res.target_user);
      }
      if (window.__refreshAuthUser) {
        await window.__refreshAuthUser();
      }
      window.location.href = '/';
    } catch (err) {
      addToast?.(err?.response?.data?.error || err?.response?.data?.message || 'Failed to enter account', 'error');
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.subscription_id || !paymentForm.amount) {
      addToast?.('Select a client and enter amount', 'error');
      return;
    }
    try {
      await saasApi.recordPayment(paymentForm);
      addToast?.(`Payment of $${paymentForm.amount} recorded!`, 'success');
      setShowRecordPaymentModal(false);
      setPaymentForm({
        subscription_id: '', amount: '', currency: 'USD',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'stripe', invoice_number: '', status: 'completed',
        next_renewal_date: '', notes: '',
      });
      fetchAllData();
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to record payment', 'error');
    }
  };

  const handleApprovePayment = async (paymentId) => {
    setVerifyingPaymentId(paymentId);
    try {
      const res = await saasApi.verifyPayment(paymentId, { action: 'approve' });
      addToast?.(res.message || 'Payment verified & subscription activated!', 'success');
      fetchAllData();
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to verify payment', 'error');
    } finally {
      setVerifyingPaymentId(null);
    }
  };

  const handleConfirmRejectPayment = async () => {
    if (!rejectingPayment) return;
    setVerifyingPaymentId(rejectingPayment.id);
    try {
      const res = await saasApi.verifyPayment(rejectingPayment.id, {
        action: 'reject',
        rejection_reason: rejectionReasonInput.trim(),
      });
      addToast?.(res.message || 'Payment marked as rejected', 'success');
      setRejectingPayment(null);
      setRejectionReasonInput('');
      fetchAllData();
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to reject payment', 'error');
    } finally {
      setVerifyingPaymentId(null);
    }
  };

  const handleCreateOperator = async (e) => {
    e.preventDefault();
    if (!operatorForm.username || !operatorForm.password) {
      addToast?.('Username and password are required', 'error');
      return;
    }
    try {
      const payload = {
        ...operatorForm,
        operator_permissions: operatorForm.operator_permissions || DEFAULT_OPERATOR_PERMS[operatorForm.prime_operator_role] || {},
      };
      await saasApi.createPrimeOperator(payload);
      addToast?.(`Prime Operator '${operatorForm.username}' created!`, 'success');
      setShowCreateOperatorModal(false);
      setOperatorForm({
        username: '',
        email: '',
        password: '',
        phone: '',
        prime_operator_role: 'sales',
        operator_permissions: DEFAULT_OPERATOR_PERMS.sales,
      });
      fetchAllData();
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to create operator', 'error');
    }
  };

  const handleTogglePrimeOperatorStatus = async (operator) => {
    if (!operator) return;
    try {
      const nextActive = !operator.is_active;
      await saasApi.updatePrimeOperator(operator.id, { is_active: nextActive });
      setPrimeOperators((prev) =>
        prev.map((op) => (op.id === operator.id ? { ...op, is_active: nextActive } : op))
      );
      addToast?.(`Operator '${operator.username}' status set to ${nextActive ? 'Active' : 'Disabled'}`, 'success');
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to update operator status', 'error');
    }
  };

  const handleDeletePrimeOperator = async () => {
    if (!showDeleteOperatorModal) return;
    try {
      await saasApi.deletePrimeOperator(showDeleteOperatorModal.id);
      addToast?.(`Prime Operator '${showDeleteOperatorModal.username}' removed`, 'success');
      setShowDeleteOperatorModal(null);
      if (selectedOperatorId === showDeleteOperatorModal.id) {
        setSelectedOperatorId(null);
      }
      fetchAllData();
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to delete operator', 'error');
    }
  };

  const handleUpdatePrimeOperator = async (e) => {
    e.preventDefault();
    if (!editOperatorForm?.id) return;
    try {
      const payload = {
        prime_operator_role: editOperatorForm.prime_operator_role,
        phone: editOperatorForm.phone,
        is_active: editOperatorForm.is_active,
        operator_permissions: editOperatorForm.operator_permissions || {},
      };
      if (editOperatorForm.password) {
        payload.password = editOperatorForm.password;
      }
      await saasApi.updatePrimeOperator(editOperatorForm.id, payload);
      addToast?.(`Prime Operator '${editOperatorForm.username}' updated!`, 'success');
      setShowEditOperatorModal(null);
      fetchAllData();
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to update operator', 'error');
    }
  };

  const handleOpenEditTierModal = (tierKey) => {
    const matrix = tierMatrix[tierKey] || {};
    const defaultPrices = { lite: 499, pro: 499, max: 499 };
    const defaultLimits = {
      lite: { max_cards: 10000, max_organisations: 'Unlimited', max_super_admins: 3 },
      pro: { max_cards: 10000, max_organisations: 'Unlimited', max_super_admins: 3 },
      max: { max_cards: 10000, max_organisations: 'Unlimited', max_super_admins: 3 },
    };
    const defaultDescs = {
      lite: 'CardFlow Starter: Primary domain, shared standard app (Play Store listing add-on available), 10k cards base, all features active',
      pro: 'CardFlow Professional: Customizable static website (5 templates, 10 changes/yr) & branded dedicated app (logo, icon, colors)',
      max: 'CardFlow Enterprise: Bespoke dynamic custom website + CMS dashboard & fully customized animated app (10 app updates/yr)',
    };
    const defaultNames = {
      lite: 'CardFlow Starter',
      pro: 'CardFlow Professional',
      max: 'CardFlow Enterprise',
    };

    setTierEditForm({
      tier: tierKey,
      display_name: matrix.display_name || defaultNames[tierKey] || `CardFlow ${tierKey.toUpperCase()}`,
      price_monthly: matrix.price_monthly || defaultPrices[tierKey],
      max_cards: matrix.limits?.max_cards || defaultLimits[tierKey].max_cards,
      max_organisations: matrix.limits?.max_organisations || defaultLimits[tierKey].max_organisations,
      max_super_admins: matrix.limits?.max_super_admins || defaultLimits[tierKey].max_super_admins,
      description: matrix.description || defaultDescs[tierKey],
      features: {
        bulk_docx_xlsx_embedded: matrix.features?.bulk_docx_xlsx_embedded !== undefined ? !!matrix.features.bulk_docx_xlsx_embedded : true,
        custom_branding_export: matrix.features?.custom_branding_export !== undefined ? !!matrix.features.custom_branding_export : true,
        reprint_suite: matrix.features?.reprint_suite !== undefined ? !!matrix.features.reprint_suite : true,
        high_throughput_worker: matrix.features?.high_throughput_worker !== undefined ? !!matrix.features.high_throughput_worker : true,
        audit_logs_telemetry: matrix.features?.audit_logs_telemetry !== undefined ? !!matrix.features.audit_logs_telemetry : true,
        priority_rendering: matrix.features?.priority_rendering !== undefined ? !!matrix.features.priority_rendering : true,
      },
    });
    setEditingTier(tierKey);
  };

  const handleSaveTierConfiguration = async (e) => {
    e.preventDefault();
    if (!editingTier) return;
    try {
      const payload = {
        tier: tierEditForm.tier,
        display_name: tierEditForm.display_name,
        price_monthly: parseFloat(tierEditForm.price_monthly) || 0,
        limits: {
          max_cards: parseInt(tierEditForm.max_cards, 10) || 10000,
          max_organisations: parseInt(tierEditForm.max_organisations, 10) || 100,
          max_super_admins: parseInt(tierEditForm.max_super_admins, 10) || 3,
        },
        features: {
          ...(tierEditForm.features || {}),
        },
      };
      await saasApi.updateTierFeatures(payload);
      addToast?.(`Tier '${tierEditForm.tier.toUpperCase()}' settings saved successfully!`, 'success');
      setTierMatrix((prev) => ({
        ...prev,
        [tierEditForm.tier]: {
          ...prev[tierEditForm.tier],
          display_name: tierEditForm.display_name,
          price_monthly: parseFloat(tierEditForm.price_monthly) || 0,
          limits: {
            ...prev[tierEditForm.tier]?.limits,
            ...payload.limits,
          },
          features: {
            ...prev[tierEditForm.tier]?.features,
            ...payload.features,
          },
        },
      }));
      setEditingTier(null);
      fetchAllData();
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to update tier settings', 'error');
    }
  };

  const handleToggleTierFeature = async (tier, featureKey, currentValue) => {
    try {
      const updated = !currentValue;
      const featurePayload = { [featureKey]: updated };
      await saasApi.updateTierFeatures({
        tier,
        features: featurePayload,
      });
      setTierMatrix((prev) => ({
        ...prev,
        [tier]: {
          ...prev[tier],
          features: {
            ...prev[tier]?.features,
            ...featurePayload,
          },
        },
      }));
      addToast?.(`Updated ${tier.toUpperCase()} feature: ${featureKey} → ${updated ? 'ON' : 'OFF'}`, 'success');
    } catch (err) {
      addToast?.('Failed to update tier feature', 'error');
    }
  };

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await saasApi.getPlatformLogs({
        category: logCategoryFilter !== 'all' ? logCategoryFilter : undefined,
        level: logLevelFilter !== 'all' ? logLevelFilter : undefined,
        search: logSearchQuery.trim() || undefined,
      });
      if (res?.logs) {
        setLogs(res.logs);
        if (res.stats) setLogStats(res.stats);
      } else if (Array.isArray(res)) {
        setLogs(res);
      }
    } catch (err) {
      console.warn('Failed to load platform logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [logCategoryFilter, logLevelFilter, logSearchQuery]);

  useEffect(() => {
    if (activeSubTab === 'logs') {
      fetchLogs();
    }
  }, [activeSubTab, fetchLogs]);

  // Filtered subscriptions
  const filteredSubscriptions = subscriptions.filter((s) => {
    if (tierFilter && s.tier !== tierFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q) || (s.custom_domain && s.custom_domain.toLowerCase().includes(q));
    }
    return true;
  });

  // Synchronize live data counts to the global footer bar
  useEffect(() => {
    let text = '';
    if (activeSubTab === 'overview') {
      if (overviewSection === 'clients') {
        const total = subscriptions.length;
        const filtered = subscriptions.filter((s) => {
          if (overviewTierFilter !== 'all' && s.tier !== overviewTierFilter) return false;
          if (overviewSearch.trim()) {
            const q = overviewSearch.trim().toLowerCase();
            const nameMatch = String(s.name || '').toLowerCase().includes(q);
            const slugMatch = String(s.slug || '').toLowerCase().includes(q);
            const domainMatch = String(s.custom_domain || s.custom_subdomain || '').toLowerCase().includes(q);
            if (!nameMatch && !slugMatch && !domainMatch) return false;
          }
          return true;
        }).length;
        text = filtered === total ? `${total} Subscriptions` : `${filtered} of ${total} Subscriptions`;
      } else {
        text = `${subscriptions.length} Node Clusters`;
      }
    } else if (activeSubTab === 'subscriptions') {
      const total = subscriptions.length;
      const filtered = filteredSubscriptions.length;
      text = filtered === total ? `${total} Subscriptions` : `${filtered} of ${total} Subscriptions`;
    } else if (activeSubTab === 'payments') {
      text = `${payments.length} Payments & Invoices`;
    } else if (activeSubTab === 'prime_operators') {
      text = `${primeOperators.length} Operators`;
    } else if (activeSubTab === 'logs') {
      const total = logStats?.total_platform_events ?? logs.length;
      text = `${total} Platform Logs`;
    } else if (activeSubTab === 'platform_settings' || activeSubTab === 'feature_matrix') {
      text = '3 Subscription Tiers';
    }

    if (text) {
      window.dispatchEvent(
        new CustomEvent('cardflow:data-count', {
          detail: { text, selectedText: '' },
        })
      );
    }

    return () => {
      window.dispatchEvent(
        new CustomEvent('cardflow:data-count', {
          detail: { text: '', selectedText: '' },
        })
      );
    };
  }, [
    activeSubTab,
    overviewSection,
    overviewTierFilter,
    overviewSearch,
    subscriptions,
    filteredSubscriptions.length,
    payments.length,
    primeOperators.length,
    logs.length,
    logStats,
  ]);

  const handleRegenerateLicense = (sub) => {
    setLicenseRegenTarget(sub);
  };

  const executeRegenerateLicense = async () => {
    if (!licenseRegenTarget) return;
    const sub = licenseRegenTarget;
    setLicenseRegenTarget(null);
    try {
      const res = await saasApi.regenerateLicense(sub.id);
      if (res?.success) {
        addToast?.(`Enterprise license for ${sub.name} reissued: ${res.license_key}`, 'success');
        fetchAllData();
      } else {
        addToast?.(res?.error || 'Failed to reissue license', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to reissue license', 'error');
    }
  };


  const pendingPaymentsCount = payments.filter((p) => p.status === 'pending_verification').length;
  const activeSubsCount = subscriptions.filter((s) => s.status === 'active').length;
  const totalTenantsCount = overview?.total_tenants || subscriptions.length || 0;
  const mrrDisplay = overview?.mrr ? `$${overview.mrr.toLocaleString()}` : '$0';
  const totalCardsDisplay = overview?.total_cards ? overview.total_cards.toLocaleString() : '0';

  const STAT_CARDS = [
    {
      key: 'tenants',
      label: 'Total Tenants',
      val: totalTenantsCount,
      Icon: Building,
      bg: '#0284c7',
      tab: 'subscriptions',
    },
    {
      key: 'active_subs',
      label: 'Active Subscriptions',
      val: activeSubsCount,
      Icon: CheckCircle2,
      bg: '#10b981',
      tab: 'subscriptions',
    },
    {
      key: 'mrr',
      label: 'Monthly MRR',
      val: mrrDisplay,
      Icon: TrendingUp,
      bg: '#8b5cf6',
      tab: 'payments',
    },
    {
      key: 'pending_pay',
      label: 'Pending Verification',
      val: pendingPaymentsCount,
      Icon: Clock,
      bg: '#f59e0b',
      tab: 'payments',
    },
    {
      key: 'cards_processed',
      label: 'Cards Processed',
      val: totalCardsDisplay,
      Icon: CreditCard,
      bg: '#2563eb',
      tab: 'overview',
    },
  ];

  return (
    <div className="saas-container" id="saas-control-center">
      {/* 1. 56px StatCardsRow (Clickable metric tiles) - Shown on Overview */}
      {activeSubTab === 'overview' && (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 0,
          background: '#fff',
          borderBottom: '1px solid #cbd5e1',
          flexShrink: 0,
        }}
      >
        {STAT_CARDS.map(({ key, label, val, Icon, bg, tab }, idx) => {
          const isLast = idx === STAT_CARDS.length - 1;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleTabClick(tab)}
              className="stat-card-glass"
              style={{
                padding: '6px 12px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#fff',
                border: 'none',
                borderRight: isLast ? 'none' : '1px solid #cbd5e1',
                cursor: 'pointer',
                textAlign: 'left',
                boxSizing: 'border-box',
                minWidth: 0,
                gap: '8px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              title={`Switch to ${label}`}
            >
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: '19px',
                    fontWeight: 700,
                    color: '#0f172a',
                    lineHeight: 1.15,
                    fontFamily: 'var(--font-family)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {loading && !overview ? '—' : val}
                </div>
                <div
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: '#64748b',
                    marginTop: '3px',
                    fontFamily: 'var(--font-family)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {label}
                </div>
              </div>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '7px',
                  background: bg,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginLeft: '4px',
                }}
              >
                <Icon size={16} />
              </div>
            </button>
          );
        })}
      </div>
      )}

      {/* Edge-to-Edge Desktop Container for Active Section Content (Sidebar Driven) */}
      <div className="saas-tab-view">

      {/* ── TAB 1: OVERVIEW — EXECUTIVE PLATFORM COMMAND CENTER (SUPER ADMIN DASHBOARD INSPIRED) ── */}
      {activeSubTab === 'overview' && (() => {
        // Filter subscriptions for overview
        const filteredSubs = subscriptions.filter((s) => {
          if (overviewTierFilter !== 'all' && s.tier !== overviewTierFilter) return false;
          if (overviewSearch.trim()) {
            const q = overviewSearch.trim().toLowerCase();
            const nameMatch = String(s.name || '').toLowerCase().includes(q);
            const slugMatch = String(s.slug || '').toLowerCase().includes(q);
            const domainMatch = String(s.custom_domain || s.custom_subdomain || '').toLowerCase().includes(q);
            const adminMatch = Array.isArray(s.super_admins) && s.super_admins.some(
              (adm) => String(adm.username || adm.email || '').toLowerCase().includes(q)
            );
            if (!nameMatch && !slugMatch && !domainMatch && !adminMatch) return false;
          }
          return true;
        });

        const toggleTenantExpand = (id) => {
          setExpandedTenants((prev) => ({ ...prev, [id]: !prev[id] }));
        };

        const activeClientsCount = subscriptions.filter((s) => s.status === 'active').length;
        const pendingPaymentsCount = payments.filter((p) => p.verification_status === 'pending_verification').length;
        const totalCardsDone = overview?.cards_processed?.toLocaleString() || subscriptions.reduce((acc, s) => acc + (s.telemetry?.total_cards || 0), 0).toLocaleString();

        return (
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr 260px',
              gap: 0,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* ── Left Column: Dynamic Interactive Section ── */}
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
              {/* Header Bar with Tier Tabs & Search */}
              <div
                style={{
                  height: '42px',
                  minHeight: '42px',
                  background: '#1e293b',
                  color: '#ffffff',
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #334155',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}
              >
                {/* Left: Section Title & Tier filter tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {overviewSection === 'clients' && <Building size={14} style={{ color: '#38bdf8' }} />}
                    {overviewSection === 'engine' && <Activity size={14} style={{ color: '#10b981' }} />}
                    {overviewSection === 'clients' ? 'Tenants & Super Admins' : 'Engine Telemetry'}
                  </span>

                  {overviewSection === 'clients' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                      {[
                        { key: 'all', label: 'All Tiers' },
                        { key: 'lite', label: 'Starter' },
                        { key: 'pro', label: 'Professional' },
                        { key: 'max', label: 'Enterprise' },
                      ].map(({ key, label }) => {
                        const isActive = overviewTierFilter === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setOverviewTierFilter(key)}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: 'none',
                              background: isActive ? '#2563eb' : 'rgba(255,255,255,0.08)',
                              color: isActive ? '#ffffff' : '#cbd5e1',
                              display: 'inline-flex',
                              alignItems: 'center',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Search box */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={overviewSearch}
                      onChange={(e) => setOverviewSearch(e.target.value)}
                      placeholder={
                        overviewSection === 'clients'
                          ? 'Search tenants, domains, admins...'
                          : 'Filter telemetry...'
                      }
                      style={{
                        height: '26px',
                        padding: '0 24px 0 26px',
                        fontSize: '12px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        color: '#ffffff',
                        borderRadius: '4px',
                        width: '210px',
                        fontFamily: 'var(--font-family)',
                      }}
                    />
                    <Search size={12} style={{ position: 'absolute', left: '8px', color: '#94a3b8' }} />
                    {overviewSearch && (
                      <button
                        type="button"
                        onClick={() => setOverviewSearch('')}
                        style={{
                          position: 'absolute',
                          right: '6px',
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic Table Body */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative' }}>


                {/* 1. CLIENTS / SUPER ADMINS TABLE */}
                {overviewSection === 'clients' && (
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12.5px',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    <thead style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#ffffff', zIndex: 2 }}>
                      <tr style={{ height: '38px', minHeight: '38px' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', width: '30%' }}>
                          Tenant / Organisation
                        </th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', width: '13%' }}>
                          Tier Plan
                        </th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', width: '12%' }}>
                          Status
                        </th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', width: '13%' }}>
                          Admins Quota
                        </th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', width: '17%' }}>
                          Cards Usage
                        </th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', width: '15%' }}>
                          Quick Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubs.map((s) => {
                        const isExpanded = !!expandedTenants[s.id];
                        const adminCount = s.super_admins?.length || 0;
                        const cardUsed = s.telemetry?.total_cards || 0;
                        const cardLimit = s.max_cards || 10000;
                        const cardPct = Math.min(100, Math.round((cardUsed / (cardLimit || 1)) * 100));

                        return (
                          <React.Fragment key={s.id}>
                            <tr
                              onClick={() => toggleTenantExpand(s.id)}
                              style={{
                                borderBottom: '1px solid #e2e8f0',
                                cursor: 'pointer',
                                background: isExpanded ? '#f0f9ff' : 'transparent',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={(e) => {
                                if (!isExpanded) e.currentTarget.style.background = '#f8fafc';
                              }}
                              onMouseLeave={(e) => {
                                if (!isExpanded) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              {/* Tenant Name & Domain */}
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTenantExpand(s.id);
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      cursor: 'pointer',
                                      color: '#64748b',
                                      display: 'flex',
                                      alignItems: 'center',
                                    }}
                                  >
                                    {isExpanded ? <ChevronDown size={15} color="#2563eb" /> : <ChevronRight size={15} />}
                                  </button>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                                      {s.name}
                                    </div>
                                    {s.custom_domain && (
                                      <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600, marginTop: '2px' }}>
                                        🌐 {s.custom_domain}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Tier Plan */}
                              <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                <span className={`saas-tier-badge saas-tier-${s.tier}`}>
                                  {s.tier_display || s.tier.toUpperCase()}
                                </span>
                              </td>

                              {/* Status */}
                              <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                <span className={`saas-status-badge saas-status-${s.status}`}>
                                  <span className="saas-status-dot" /> {s.status_display || s.status}
                                </span>
                              </td>

                              {/* Admins Quota */}
                              <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                  <span style={{ fontWeight: 700, fontSize: '12px', color: adminCount >= 3 ? '#ea580c' : '#0f172a' }}>
                                    {adminCount} / 3
                                  </span>
                                  <div style={{ width: '48px', height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div
                                      style={{
                                        width: `${(adminCount / 3) * 100}%`,
                                        height: '100%',
                                        background: adminCount >= 3 ? '#ea580c' : '#2563eb',
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* Cards Usage */}
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                                  {cardUsed.toLocaleString()} <span style={{ color: '#64748b', fontWeight: 400 }}>/ {cardLimit.toLocaleString()}</span>
                                </div>
                                <div style={{ width: '100%', maxWidth: '120px', height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', marginTop: '3px' }}>
                                  <div
                                    style={{
                                      width: `${cardPct}%`,
                                      height: '100%',
                                      background: cardPct > 90 ? '#ef4444' : cardPct > 70 ? '#f59e0b' : '#10b981',
                                      borderRadius: '3px',
                                    }}
                                  />
                                </div>
                              </td>

                              {/* Actions */}
                              <td style={{ padding: '8px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    className="saas-btn saas-btn-success saas-btn-sm"
                                    style={{ padding: '3px 8px', fontSize: '11px' }}
                                    onClick={() => handleEnterAccount(s)}
                                    title="Impersonate client account"
                                  >
                                    <UserCheck size={11} /> Impersonate
                                  </button>
                                  <button
                                    type="button"
                                    className="saas-btn saas-btn-primary saas-btn-sm"
                                    style={{ padding: '3px 8px', fontSize: '11px' }}
                                    onClick={() => setDrawerTenant(s)}
                                    title="Open Tenant Management Drawer"
                                  >
                                    <Sliders size={11} /> Configure
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expandable Sub-Row */}
                            {isExpanded && (
                              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                                <td colSpan={6} style={{ padding: '12px 16px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                                    {/* Left Sub-Box: Super Admins */}
                                    <div style={{ background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '10px 12px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                          <Users size={13} style={{ color: '#2563eb' }} /> Super Admins ({adminCount} / 3 Quota)
                                        </span>
                                        <button
                                          type="button"
                                          className="saas-btn saas-btn-secondary saas-btn-sm"
                                          style={{ padding: '2px 8px', fontSize: '10.5px' }}
                                          onClick={() => setDrawerTenant(s)}
                                        >
                                          <Plus size={11} /> Add / Manage
                                        </button>
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {(s.super_admins || []).map((adm, aIdx) => (
                                          <div
                                            key={adm.id || aIdx}
                                            style={{
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              padding: '6px 8px',
                                              background: '#f8fafc',
                                              borderRadius: '4px',
                                              border: '1px solid #e2e8f0',
                                              fontSize: '11.5px',
                                            }}
                                          >
                                            <div>
                                              <strong style={{ color: '#0f172a' }}>{adm.username}</strong>
                                              <span style={{ color: '#64748b', marginLeft: '6px' }}>{adm.email || 'No email'}</span>
                                            </div>
                                            <span style={{ fontSize: '10.5px', background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>
                                              {aIdx === 0 ? 'Primary' : 'Super Admin'}
                                            </span>
                                          </div>
                                        ))}
                                        {adminCount === 0 && (
                                          <div style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>
                                            No super admin account created yet.
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Right Sub-Box: License Key & Branding */}
                                    <div style={{ background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '10px 12px' }}>
                                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <Key size={13} style={{ color: '#059669' }} /> License &amp; Domain Details
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <span style={{ color: '#64748b' }}>License Key:</span>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '3px' }}>
                                              {s.license_key ? `${s.license_key.slice(0, 14)}...` : 'Generating...'}
                                            </code>
                                            {s.license_key && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  navigator.clipboard.writeText(s.license_key);
                                                  addToast?.('License key copied to clipboard!', 'success');
                                                }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: 0 }}
                                                title="Copy full license key"
                                              >
                                                <Copy size={12} />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <span style={{ color: '#64748b' }}>Portal Subdomain:</span>
                                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{s.slug}.cardflow.io</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <span style={{ color: '#64748b' }}>Custom Domain:</span>
                                          <span style={{ fontWeight: 600, color: s.custom_domain ? '#0284c7' : '#94a3b8' }}>
                                            {s.custom_domain || 'Not configured'}
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <span style={{ color: '#64748b' }}>Organisations:</span>
                                          <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                            {s.telemetry?.organisations_count || 0} orgs (Unlimited)
                                          </span>
                                        </div>
                                        <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'flex-end' }}>
                                          <button
                                            type="button"
                                            className="saas-btn saas-btn-secondary saas-btn-sm"
                                            style={{ padding: '3px 10px', fontSize: '11px' }}
                                            onClick={() => setDrawerTenant(s)}
                                          >
                                            <Sliders size={12} /> Open Full Tenant Drawer
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {filteredSubs.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                            No client subscriptions found matching your filter criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}

                {/* 2. ENGINE TELEMETRY SECTION */}
                {overviewSection === 'engine' && (
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Health Cards Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      {[
                        { title: 'REST API Gateway', status: 'Online', latency: '38ms', Icon: Server, color: '#2563eb' },
                        { title: 'Media Storage Partitions', status: 'Healthy', latency: 'Isolated', Icon: HardDrive, color: '#10b981' },
                        { title: 'Background Workers', status: 'Active', latency: 'P3 Bounded', Icon: Zap, color: '#f59e0b' },
                        { title: 'License Key Engine', status: 'Enforcing', latency: 'Crypto HMAC', Icon: Key, color: '#8b5cf6' },
                      ].map((item) => (
                        <div
                          key={item.title}
                          style={{
                            background: '#f8fafc',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            padding: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <item.Icon size={16} color={item.color} />
                            <span style={{ fontSize: '10.5px', background: '#dcfce7', color: '#15803d', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>
                              {item.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{item.title}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{item.latency}</div>
                        </div>
                      ))}
                    </div>

                    {/* Live Stream Logs */}
                    <div style={{ background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Clock size={14} style={{ color: '#2563eb' }} /> Live System Audit Stream
                        </span>
                        <button
                          type="button"
                          className="saas-btn saas-btn-secondary saas-btn-sm"
                          onClick={() => handleTabClick('logs')}
                        >
                          View Full Logs <ChevronRight size={12} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {logs.slice(0, 5).map((log) => (
                          <div
                            key={log.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 10px',
                              background: '#f8fafc',
                              borderRadius: '4px',
                              border: '1px solid #e2e8f0',
                              fontSize: '11.5px',
                            }}
                          >
                            <div>
                              <strong style={{ color: '#0f172a' }}>{log.title}</strong>
                              <span style={{ color: '#64748b', marginLeft: '6px' }}>
                                {log.actor_name || 'System'} • {log.action}
                              </span>
                            </div>
                            <span className={`saas-log-level-badge saas-log-level-${log.level}`}>
                              {log.level}
                            </span>
                          </div>
                        ))}
                        {logs.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '12px' }}>
                            No audit events in stream.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right Column: 260px Panel (Dashboard Sections + Quick Actions + Overview) ── */}
            <div
              style={{
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
            >
              {/* 1. Dashboard Sections Switcher */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, borderBottom: '1px solid #cbd5e1' }}>
                <div
                  style={{
                    background: '#1e293b',
                    color: '#ffffff',
                    height: '38px',
                    minHeight: '38px',
                    padding: '0 10px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderBottom: '1px solid #334155',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                  }}
                >
                  <Layers size={13} /> Dashboard Sections
                </div>
                <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { key: 'clients', label: 'Tenants & Admins', count: subscriptions.length, Icon: Building },
                    { key: 'engine', label: 'Engine Telemetry', count: 'Online', Icon: Activity },
                  ].map(({ key, label, count, Icon }) => {
                    const isActive = overviewSection === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setOverviewSection(key)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          height: '34px',
                          boxSizing: 'border-box',
                          background: isActive ? '#eff6ff' : '#ffffff',
                          border: isActive ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                          borderRadius: '4px',
                          color: isActive ? '#1d4ed8' : '#334155',
                          fontSize: '12px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-family)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Icon size={13} style={{ color: isActive ? '#2563eb' : '#64748b' }} />
                          <span>{label}</span>
                        </div>
                        <span
                          style={{
                            fontWeight: 700,
                            color: isActive ? '#1d4ed8' : '#0f172a',
                            background: isActive ? '#dbeafe' : '#f1f5f9',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontSize: '11px',
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
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, borderBottom: '1px solid #cbd5e1' }}>
                <div
                  style={{
                    background: '#1e293b',
                    color: '#ffffff',
                    height: '38px',
                    minHeight: '38px',
                    padding: '0 10px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderBottom: '1px solid #334155',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                  }}
                >
                  <Plus size={13} /> Quick Actions
                </div>
                <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {canAccessSales && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowCreateSubModal(true)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          height: '32px',
                          boxSizing: 'border-box',
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '4px',
                          color: '#1d4ed8',
                          fontSize: '12px',
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
                        <Plus size={13} /> <span>Onboard Tenant</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRecordPaymentModal(true)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          height: '32px',
                          boxSizing: 'border-box',
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '4px',
                          color: '#1d4ed8',
                          fontSize: '12px',
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
                        <DollarSign size={13} /> <span>Record Payment</span>
                      </button>
                    </>
                  )}
                  {isPrimeAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowCreateOperatorModal(true)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        height: '32px',
                        boxSizing: 'border-box',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '4px',
                        color: '#1d4ed8',
                        fontSize: '12px',
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
                      <UserCheck size={13} /> <span>Add Operator</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={fetchAllData}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      height: '32px',
                      boxSizing: 'border-box',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                      color: '#475569',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-family)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                  >
                    <RefreshCw size={13} className={loading ? 'spinning' : ''} /> <span>Refresh Telemetry</span>
                  </button>
                </div>
              </div>

              {/* 3. Platform Overview 2x2 Mini Stat Boxes */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div
                  style={{
                    background: '#1e293b',
                    color: '#ffffff',
                    height: '38px',
                    minHeight: '38px',
                    padding: '0 10px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderBottom: '1px solid #334155',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                  }}
                >
                  <Shield size={13} /> Platform Overview
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: '8px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '6px',
                    alignContent: 'start',
                  }}
                >
                  {[
                    { label: 'Active Clients', count: activeClientsCount, Icon: Building, color: '#2563eb', bg: '#eff6ff', tab: 'subscriptions' },
                    { label: 'Monthly MRR', count: mrrDisplay, Icon: TrendingUp, color: '#16a34a', bg: '#f0fdf4', tab: 'overview' },
                    { label: 'Cards Processed', count: totalCardsDone, Icon: CreditCard, color: '#8b5cf6', bg: '#f5f3ff', tab: 'overview' },
                    { label: 'Pending Verif.', count: pendingPaymentsCount, Icon: Clock, color: '#ea580c', bg: '#fff7ed', tab: 'payments' },
                  ].map(({ label, count, Icon, color, bg, tab }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => handleTabClick(tab)}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '4px',
                        padding: '8px 6px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-family)',
                        transition: 'all 0.15s ease',
                        textAlign: 'center',
                        boxSizing: 'border-box',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = color;
                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: bg,
                          color: color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: '3px',
                        }}
                      >
                        <Icon size={12} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>{count}</span>
                      <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── TAB 2: SUBSCRIPTIONS & CLIENTS ─────────────────────────────────── */}
      {activeSubTab === 'subscriptions' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="saas-sub-bar">
            <div className="saas-sub-bar-left">
              <input
                type="text"
                placeholder="Search clients, domains, slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="saas-form-input"
                style={{ width: '220px', height: '28px', padding: '0 8px', fontSize: '12px' }}
              />

              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="saas-form-select"
                style={{ height: '28px', padding: '0 8px', fontSize: '12px' }}
              >
                <option value="">All Tiers</option>
                <option value="lite">Starter</option>
                <option value="pro">Professional</option>
                <option value="max">Enterprise</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="saas-form-select"
                style={{ height: '28px', padding: '0 8px', fontSize: '12px' }}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="past_due">Past Due</option>
              </select>
            </div>

            <div className="saas-sub-bar-right">
              <button
                type="button"
                className="saas-btn saas-btn-secondary saas-btn-sm"
                onClick={fetchAllData}
                disabled={loading}
                title="Refresh subscriptions"
              >
                <RefreshCw size={13} className={loading ? 'spinning' : ''} /> Refresh
              </button>

              {canAccessSales && (
                <button
                  type="button"
                  className="saas-btn saas-btn-primary saas-btn-sm"
                  onClick={() => setShowCreateSubModal(true)}
                >
                  <Plus size={13} /> Add Subscription
                </button>
              )}
            </div>
          </div>

          <div className="table-wrapper" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '1080px', flexShrink: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center' }}>S. No.</th>
                  <th>Client / Tenant</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Super Admins (Max 3)</th>
                  <th>Data Volume (Cards)</th>
                  <th>Next Renewal</th>
                  <th style={{ textAlign: 'center', width: '260px', minWidth: '260px', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscriptions.map((s, idx) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>{s.name}</div>
                      {s.custom_domain ? (
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Globe size={11} style={{ color: '#2563eb' }} />
                          <span>{s.custom_domain}</span>
                        </div>
                      ) : s.custom_subdomain ? (
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                          {s.custom_subdomain}.cardflow.io
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`saas-tier-badge saas-tier-${s.tier}`}>
                        {s.tier_display}
                      </span>
                    </td>
                    <td>
                      <span className={`saas-status-badge saas-status-${s.status}`}>
                        <span className="saas-status-dot" /> {s.status_display}
                      </span>
                    </td>
                    <td>
                      <div className="saas-quota-meter">
                        <span>{s.super_admins?.length || 0} / 3</span>
                        <div className="saas-quota-bar">
                          <div className="saas-quota-fill" style={{ width: `${((s.super_admins?.length || 0) / 3) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}>
                        {s.telemetry?.total_cards?.toLocaleString() || 0} / {s.max_cards?.toLocaleString()} cards
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {s.telemetry?.organisations_count || 0} orgs • {s.telemetry?.tables_count || 0} tables
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: s.renews_at ? '#0f172a' : '#64748b' }}>
                        {s.renews_at || 'Perpetual'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center', flexWrap: 'nowrap' }}>
                        <button
                          type="button"
                          className="saas-btn saas-btn-success saas-btn-sm"
                          onClick={() => handleEnterAccount(s)}
                          title="Impersonate client account"
                        >
                          <UserCheck size={11} /> Impersonate
                        </button>
                        <button
                          type="button"
                          className="saas-btn saas-btn-primary saas-btn-sm"
                          onClick={() => setDrawerTenant(s)}
                          title="Open Tenant Management Drawer (Admins, Quotas, Billing, Branding, Features)"
                        >
                          <Sliders size={11} /> Configure
                        </button>
                        {canAccessDev && (
                          <button
                            type="button"
                            className="saas-btn saas-btn-secondary saas-btn-sm"
                            onClick={() => handleRegenerateLicense(s)}
                            title="Reissue Enterprise License Key"
                            style={{ color: '#d97706' }}
                          >
                            Reissue Key
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSubscriptions.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      No subscriptions match the selected criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 5: PAYMENTS & BILLING LEDGER ───────────────────────────────── */}
      {activeSubTab === 'payments' && (() => {
        const pendingPayments = payments.filter((p) => p.status === 'pending_verification');
        const completedPayments = payments.filter((p) => p.status === 'completed');
        const rejectedPayments = payments.filter((p) => p.status === 'rejected');

        const displayPayments = payments.filter((p) => {
          if (paymentFilter === 'all') return true;
          return p.status === paymentFilter;
        });

        return (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="saas-sub-bar">
              <div className="saas-sub-bar-left">
                <span className="saas-sub-bar-title">
                  <DollarSign size={15} style={{ color: '#16a34a' }} /> Billing & Payments Ledger
                </span>
                <div style={{ display: 'inline-flex', gap: '4px', marginLeft: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setPaymentFilter('all')}
                    style={{
                      padding: '3px 9px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      background: paymentFilter === 'all' ? '#2563eb' : '#fff',
                      color: paymentFilter === 'all' ? '#fff' : '#475569',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    All ({payments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentFilter('pending_verification')}
                    style={{
                      padding: '3px 9px',
                      borderRadius: '4px',
                      border: '1px solid #fde68a',
                      background: paymentFilter === 'pending_verification' ? '#d97706' : '#fff',
                      color: paymentFilter === 'pending_verification' ? '#fff' : '#b45309',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Pending ({pendingPayments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentFilter('completed')}
                    style={{
                      padding: '3px 9px',
                      borderRadius: '4px',
                      border: '1px solid #bbf7d0',
                      background: paymentFilter === 'completed' ? '#16a34a' : '#fff',
                      color: paymentFilter === 'completed' ? '#fff' : '#15803d',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Completed ({completedPayments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentFilter('rejected')}
                    style={{
                      padding: '3px 9px',
                      borderRadius: '4px',
                      border: '1px solid #fecaca',
                      background: paymentFilter === 'rejected' ? '#dc2626' : '#fff',
                      color: paymentFilter === 'rejected' ? '#fff' : '#b91c1c',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Rejected ({rejectedPayments.length})
                  </button>
                </div>
              </div>

              <div className="saas-sub-bar-right">
                <button
                  type="button"
                  className="saas-btn saas-btn-secondary saas-btn-sm"
                  onClick={fetchAllData}
                  disabled={loading}
                  title="Refresh payments"
                >
                  <RefreshCw size={13} className={loading ? 'spinning' : ''} /> Refresh
                </button>
                <button
                  type="button"
                  className="saas-btn saas-btn-primary saas-btn-sm"
                  onClick={() => setShowRecordPaymentModal(true)}
                >
                  <Plus size={13} /> Record Manual Payment
                </button>
              </div>
            </div>

            {pendingPayments.length > 0 && (
              <div
                style={{
                  margin: '12px 16px 0',
                  padding: '12px 16px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                    {pendingPayments.length} payment proof submission{pendingPayments.length > 1 ? 's' : ''} awaiting UTR / bank verification.
                  </span>
                </div>
                <button
                  type="button"
                  className="saas-btn saas-btn-sm"
                  style={{ background: '#d97706', color: '#fff', border: 'none' }}
                  onClick={() => setPaymentFilter('pending_verification')}
                >
                  Review Pending Queue ({pendingPayments.length})
                </button>
              </div>
            )}

            <div className="table-wrapper" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
              <table className="data-table" style={{ width: '100%', flexShrink: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>S. No.</th>
                    <th>Invoice / ID</th>
                    <th>Tenant Subscription</th>
                    <th>Purpose / Plan</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>UTR / Reference</th>
                    <th>Proof</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Verification Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayPayments.map((p, idx) => {
                    const getPlanLabel = (type) => {
                      switch (type) {
                        case 'split_step1': return '2-Step Setup (2 Mos Free)';
                        case 'split_installment': return 'Monthly Installment';
                        case 'one_time_annual': return 'One-Time Upfront Annual';
                        case 'extra_cards': return 'Extra Cards Pack';
                        case 'addon': return 'Add-on License / Usage';
                        default: return type || 'Payment';
                      }
                    };

                    const isPending = p.status === 'pending_verification';

                    return (
                      <tr key={p.id}>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td><code>{p.invoice_number || `CF-PAY-${p.id}`}</code></td>
                        <td><strong style={{ color: '#0f172a' }}>{p.subscription_name}</strong></td>
                        <td>
                          <span style={{ fontSize: '12px', color: '#475569' }}>
                            {getPlanLabel(p.payment_plan_type)}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: '#16a34a', fontSize: '13.5px' }}>
                            ₹{Number(p.amount)?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </strong>
                        </td>
                        <td>
                          <span className="saas-tier-badge saas-tier-lite" style={{ textTransform: 'uppercase' }}>
                            {p.payment_method_display || p.payment_method}
                          </span>
                        </td>
                        <td>
                          {p.utr_number ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <code style={{ color: '#0284c7', fontSize: '12px' }}>{p.utr_number}</code>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(p.utr_number);
                                  addToast?.('Copied UTR to clipboard!', 'success');
                                }}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                                title="Copy UTR"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td>
                          {p.screenshot_url ? (
                            <button
                              type="button"
                              onClick={() => setPreviewProofModal(p.screenshot_url)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1d4ed8',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Eye size={12} /> View Proof
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>No image</span>
                          )}
                        </td>
                        <td style={{ fontSize: '12px' }}>{p.payment_date || (p.created_at ? new Date(p.created_at).toLocaleDateString() : '—')}</td>
                        <td>
                          <span className={`saas-status-badge saas-status-${p.status}`}>
                            <span className="saas-status-dot" />
                            {p.status === 'pending_verification'
                              ? 'Pending Review'
                              : p.status === 'completed'
                              ? 'Verified'
                              : p.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isPending ? (
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                type="button"
                                disabled={verifyingPaymentId === p.id}
                                onClick={() => handleApprovePayment(p.id)}
                                style={{
                                  padding: '4px 9px',
                                  borderRadius: '4px',
                                  background: '#16a34a',
                                  border: 'none',
                                  color: '#ffffff',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  cursor: verifyingPaymentId === p.id ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                {verifyingPaymentId === p.id ? <RefreshCw size={11} className="spinning" /> : <CheckCircle2 size={12} />}
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                disabled={verifyingPaymentId === p.id}
                                onClick={() => {
                                  setRejectingPayment(p);
                                  setRejectionReasonInput('');
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  background: '#fee2e2',
                                  border: '1px solid #fca5a5',
                                  color: '#b91c1c',
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  cursor: verifyingPaymentId === p.id ? 'not-allowed' : 'pointer',
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                              {p.verified_at ? `Verified ${new Date(p.verified_at).toLocaleDateString()}` : p.rejection_reason || '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {displayPayments.length === 0 && (
                    <tr>
                      <td colSpan="11" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        No payments found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── TAB 7: PRIME OPERATORS TEAM DIRECTORY (SUPER ADMIN TABLE STYLE) ── */}
      {activeSubTab === 'prime_operators' && isPrimeAdmin && (() => {
        const roleColors = {
          sales: { bg: '#0284c7', label: 'SALES', desc: 'Subscriptions, Billing ledger & Manual payments' },
          dev: { bg: '#10b981', label: 'DEV', desc: 'Custom domain SSL, Landing pages & Mobile studio' },
          helper: { bg: '#7c3aed', label: 'HELPER', desc: 'Support Mode impersonation & Troubleshooting' },
        };

        const filteredOperators = primeOperators.filter((op) => {
          // Status filter
          const isActive = !!op.is_active;
          if (operatorStatusFilter === 'Active' && !isActive) return false;
          if (operatorStatusFilter === 'Inactive' && isActive) return false;

          // Role filter
          if (operatorRoleFilter !== 'all' && op.prime_operator_role !== operatorRoleFilter) return false;

          // Search
          if (operatorSearch.trim()) {
            const q = operatorSearch.toLowerCase();
            const uname = String(op.username || '').toLowerCase();
            const email = String(op.email || '').toLowerCase();
            const phone = String(op.phone || '').toLowerCase();
            if (!uname.includes(q) && !email.includes(q) && !phone.includes(q)) return false;
          }
          return true;
        });

        const selectedOperator = primeOperators.find((op) => op.id === selectedOperatorId) || null;

        return (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Action Bar matching SuperAdmin Staff management */}
            <div className="action-bar" style={{ background: '#1e1e2e', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', minHeight: '50px', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="status-tabs">
                  {['All', 'Active', 'Inactive'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOperatorStatusFilter(t)}
                      className={`status-tab${operatorStatusFilter === t ? ' active' : ''}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }} />

                <select
                  value={operatorRoleFilter}
                  onChange={(e) => setOperatorRoleFilter(e.target.value)}
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    fontSize: '13px',
                    background: '#111827',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#ffffff',
                    borderRadius: '4px',
                  }}
                >
                  <option value="all">All Roles</option>
                  <option value="sales">Sales Operators</option>
                  <option value="dev">Dev Operators</option>
                  <option value="helper">Helper Operators</option>
                </select>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={operatorSearch}
                    onChange={(e) => setOperatorSearch(e.target.value)}
                    placeholder="Search operators..."
                    style={{
                      height: '28px',
                      padding: '0 8px 0 26px',
                      fontSize: '12px',
                      background: '#111827',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      borderRadius: '4px',
                      width: '180px',
                    }}
                  />
                  <Search size={12} style={{ position: 'absolute', left: '8px', color: '#94a3b8' }} />
                  {operatorSearch && (
                    <button
                      type="button"
                      onClick={() => setOperatorSearch('')}
                      style={{ position: 'absolute', right: '6px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="saas-btn saas-btn-primary saas-btn-sm"
                  onClick={() => setShowCreateOperatorModal(true)}
                >
                  Add Operator
                </button>
                <button
                  type="button"
                  className="saas-btn saas-btn-secondary saas-btn-sm"
                  disabled={!selectedOperator}
                  onClick={() => {
                    if (selectedOperator) {
                      setEditOperatorForm({
                        id: selectedOperator.id,
                        username: selectedOperator.username,
                        email: selectedOperator.email || '',
                        phone: selectedOperator.phone || '',
                        prime_operator_role: selectedOperator.prime_operator_role || 'sales',
                        is_active: selectedOperator.is_active,
                        password: '',
                        operator_permissions: selectedOperator.operator_permissions || {},
                        effective_permissions: selectedOperator.effective_permissions || selectedOperator.operator_permissions || DEFAULT_OPERATOR_PERMS[selectedOperator.prime_operator_role] || {},
                      });
                      setShowEditOperatorModal(selectedOperator);
                    }
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="saas-btn saas-btn-secondary saas-btn-sm"
                  disabled={!selectedOperator}
                  onClick={() => selectedOperator && handleTogglePrimeOperatorStatus(selectedOperator)}
                >
                  Toggle Active
                </button>
                <button
                  type="button"
                  className="saas-btn saas-btn-secondary saas-btn-sm"
                  disabled={!selectedOperator}
                  style={{ color: selectedOperator ? '#ef4444' : undefined }}
                  onClick={() => {
                    if (selectedOperator) {
                      setShowDeleteOperatorModal(selectedOperator);
                      setDeleteOperatorCode(String(Math.floor(1000 + Math.random() * 9000)));
                    }
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="saas-btn saas-btn-secondary saas-btn-sm"
                  onClick={fetchAllData}
                  disabled={loading}
                  title="Refresh operators list"
                >
                  <RefreshCw size={13} className={loading ? 'spinning' : ''} /> Refresh
                </button>
              </div>
            </div>

            {/* Operator Data Table */}
            <div className="table-wrapper" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
              <table className="data-table" style={{ width: '100%', minWidth: '1080px', flexShrink: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>S. No.</th>
                    <th style={{ width: '140px' }}>Username</th>
                    <th>Operator Name</th>
                    <th style={{ width: '120px' }}>Phone</th>
                    <th style={{ textAlign: 'center', width: '90px' }}>Role</th>
                    <th>Permissions & Scope</th>
                    <th style={{ textAlign: 'center', width: '85px' }}>Status</th>
                    <th style={{ textAlign: 'center', width: '165px' }}>Timeline</th>
                    <th style={{ textAlign: 'center', width: '200px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOperators.map((op, idx) => {
                    const info = roleColors[op.prime_operator_role] || roleColors.helper;
                    const isSelected = selectedOperatorId === op.id;

                    return (
                      <tr
                        key={op.id}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelectedOperatorId(isSelected ? null : op.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ width: '140px' }}>
                          <span
                            style={{
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#0284c7',
                              background: '#f0f9ff',
                              border: '1px solid #bae6fd',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              display: 'inline-block',
                              maxWidth: '130px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={`@${op.username}`}
                          >
                            @{op.username}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                background: info.bg,
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {(op.name || op.username || 'OP').slice(0, 2).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{op.name || op.full_name || op.username}</span>
                          </div>
                        </td>
                        <td style={{ color: '#475569', fontSize: '12px', fontWeight: 500 }}>{op.phone || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="saas-tier-badge"
                            style={{
                              background: `${info.bg}18`,
                              color: info.bg,
                              borderColor: `${info.bg}40`,
                            }}
                          >
                            {info.label}
                          </span>
                        </td>
                        <td style={{ fontSize: '11.5px', color: '#475569' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', maxWidth: '320px' }}>
                            {(() => {
                              const perms = op.effective_permissions || op.operator_permissions || DEFAULT_OPERATOR_PERMS[op.prime_operator_role] || {};
                              const labels = [
                                { key: 'can_manage_billing', name: 'Billing' },
                                { key: 'can_manage_subscriptions', name: 'Subscriptions' },
                                                                { key: 'can_impersonate', name: 'Support' },
                                { key: 'can_view_logs', name: 'Logs' },
                                { key: 'can_edit_tiers', name: 'Tiers' },
                                { key: 'can_manage_domains', name: 'Domains' },
                                { key: 'can_view_directory', name: 'Directory' },
                              ];
                              const activeLabels = labels.filter((l) => perms[l.key]);
                              if (!activeLabels.length) return <span style={{ color: '#94a3b8' }}>None</span>;
                              return activeLabels.map((l) => (
                                <span
                                  key={l.key}
                                  style={{
                                    background: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '3px',
                                    padding: '1px 5px',
                                    fontSize: '10.5px',
                                    color: '#334155',
                                    fontWeight: 600,
                                  }}
                                >
                                  {l.name}
                                </span>
                              ));
                            })()}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`saas-status-badge ${op.is_active ? 'saas-status-active' : 'saas-status-past_due'}`}>
                            <span className="saas-status-dot" /> {op.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td style={{ width: '165px', padding: '6px 10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', lineHeight: 1.3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#0f172a' }}>
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: '#059669',
                                  background: '#ecfdf5',
                                  border: '1px solid #a7f3d0',
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  letterSpacing: '0.02em',
                                  textTransform: 'uppercase',
                                  flexShrink: 0,
                                }}
                              >
                                Created
                              </span>
                              <span style={{ fontWeight: 500, color: '#334155' }}>
                                {op.created_at ? new Date(op.created_at).toLocaleDateString() : '—'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b' }}>
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: '#4f46e5',
                                  background: '#eef2ff',
                                  border: '1px solid #c7d2fe',
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  letterSpacing: '0.02em',
                                  textTransform: 'uppercase',
                                  flexShrink: 0,
                                }}
                              >
                                Updated
                              </span>
                              <span style={{ fontWeight: 500, color: '#64748b' }}>
                                {op.updated_at ? new Date(op.updated_at).toLocaleDateString() : (op.created_at ? new Date(op.created_at).toLocaleDateString() : '—')}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="saas-btn saas-btn-secondary saas-btn-sm"
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                              onClick={() => {
                                setEditOperatorForm({
                                  id: op.id,
                                  username: op.username,
                                  email: op.email || '',
                                  phone: op.phone || '',
                                  prime_operator_role: op.prime_operator_role || 'sales',
                                  is_active: op.is_active,
                                  password: '',
                                  operator_permissions: op.operator_permissions || {},
                                  effective_permissions: op.effective_permissions || op.operator_permissions || DEFAULT_OPERATOR_PERMS[op.prime_operator_role] || {},
                                });
                                setShowEditOperatorModal(op);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="saas-btn saas-btn-secondary saas-btn-sm"
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                              onClick={() => handleTogglePrimeOperatorStatus(op)}
                            >
                              {op.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              className="saas-btn saas-btn-secondary saas-btn-sm"
                              style={{ padding: '2px 8px', fontSize: '11px', color: '#ef4444' }}
                              onClick={() => {
                                setShowDeleteOperatorModal(op);
                                setDeleteOperatorCode(String(Math.floor(1000 + Math.random() * 9000)));
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredOperators.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        No prime operators found matching the criteria. Click "Add Operator" to onboard internal team staff.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── TAB 8: TIER FEATURE MATRIX ──────────────────────────────────────── */}
      {['platform_settings', 'feature_matrix'].includes(activeSubTab) && isPrimeAdmin && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', position: 'relative' }}>
          <div className="saas-sub-bar" style={{ position: 'sticky', top: 0, zIndex: 40, background: '#f8fafc' }}>
            <div className="saas-sub-bar-left">
              <span className="saas-sub-bar-title">
                <Sparkles size={15} style={{ color: '#2563eb' }} /> Subscription Tier Architecture
              </span>
            </div>
            <div className="saas-sub-bar-right">
              <button
                type="button"
                className="saas-btn saas-btn-secondary saas-btn-sm"
                onClick={fetchAllData}
                disabled={loading}
                title="Refresh platform data"
              >
                <RefreshCw size={13} className={loading ? 'spinning' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* 3 Tier Pricing & Architecture Cards */}
          <div className="saas-tier-cards-row" style={{ marginBottom: '20px' }}>
            {/* STARTER TIER */}
            <div className="saas-tier-plan-card tier-starter">
              {/* Header Badge & Action */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="saas-tier-badge saas-tier-lite" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px', fontSize: '11px', fontWeight: 700 }}>
                    <Zap size={13} style={{ color: '#059669' }} /> STARTER
                  </span>
                </div>
                <button
                  type="button"
                  className="saas-btn saas-btn-secondary saas-btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', fontSize: '11.5px', fontWeight: 600 }}
                  onClick={() => handleOpenEditTierModal('lite')}
                >
                  <Edit size={12} /> Configure
                </button>
              </div>

              {/* Price Hero */}
              <div style={{ padding: '2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>₹4,999</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>One-Time Setup</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                    <CheckCircle2 size={12} /> 2 Mos Free Validity
                  </span>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                    Then ₹499 <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b' }}>/ mo</span>
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                {tierMatrix.lite?.description || 'Primary cloud subdomain with shared companion app and full platform engine feature access.'}
              </div>

              {/* Website & App Rights Box */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Website &amp; Mobile App Delivery
                </div>
                <div style={{ fontSize: '12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Globe size={13} style={{ color: '#2563eb', flexShrink: 0 }} />
                  <span>Primary Domain: <code>yourbrand.cardflow.io</code></span>
                </div>
                <div style={{ fontSize: '12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Smartphone size={13} style={{ color: '#059669', flexShrink: 0 }} />
                  <span>Shared Companion App (Play Store add-on available)</span>
                </div>
              </div>

              {/* Card Quota & Add-ons inside Plan */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CreditCard size={13} style={{ color: '#16a34a' }} />
                    Base: <strong>10,000 Cards Default</strong>
                  </span>
                  <span style={{ color: '#16a34a', fontSize: '10.5px', fontWeight: 600 }}>Top-ups</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+5k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹49<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+10k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹79<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+25k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹149<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+50k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹249<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                </div>
              </div>

              {/* Flexible Prepay Cycles inside Plan */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={13} style={{ color: '#2563eb' }} />
                    Prepay Validity Cycles:
                  </span>
                  <span style={{ color: '#2563eb', fontSize: '10.5px', fontWeight: 600 }}>Save ₹989</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>Monthly</div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '11px' }}>₹499</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>Quarterly</div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '11px' }}>₹1,399</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>6 Months</div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '11px' }}>₹2,599</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>1 Year</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>₹4,999</div>
                  </div>
                </div>
              </div>

              {/* Core Limits list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11.5px', color: '#334155', marginTop: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <span><strong>Unlimited Organisations</strong> • Universal <strong>3 Super Admins</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <span>All Platform Engine Core Features Active by Default</span>
                </div>
              </div>
            </div>

            {/* PROFESSIONAL TIER */}
            <div className="saas-tier-plan-card tier-pro featured">
              {/* Header Badge & Action */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="saas-tier-badge saas-tier-pro" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px', fontSize: '11px', fontWeight: 700 }}>
                    <Sparkles size={13} style={{ color: '#1d4ed8' }} /> PROFESSIONAL
                  </span>
                  <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                    MOST POPULAR
                  </span>
                </div>
                <button
                  type="button"
                  className="saas-btn saas-btn-secondary saas-btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', fontSize: '11.5px', fontWeight: 600 }}
                  onClick={() => handleOpenEditTierModal('pro')}
                >
                  <Edit size={12} /> Configure
                </button>
              </div>

              {/* Price Hero */}
              <div style={{ padding: '2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>₹7,499</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>One-Time Setup</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                    <CheckCircle2 size={12} /> 2 Mos Free Validity
                  </span>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                    Then ₹499 <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b' }}>/ mo</span>
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                {tierMatrix.pro?.description || 'Customizable static website (5 templates, 10 changes/yr) and branded dedicated app on Play Store.'}
              </div>

              {/* Website & App Rights Box */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Website &amp; Mobile App Delivery
                </div>
                <div style={{ fontSize: '12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Globe size={13} style={{ color: '#2563eb', flexShrink: 0 }} />
                  <span>Customizable Website: <strong>5 Templates • 10 Changes/Yr</strong></span>
                </div>
                <div style={{ fontSize: '12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Smartphone size={13} style={{ color: '#059669', flexShrink: 0 }} />
                  <span>Dedicated Android App: <strong>Client Play Store Name &amp; Icon</strong></span>
                </div>
              </div>

              {/* Card Quota & Add-ons inside Plan */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CreditCard size={13} style={{ color: '#16a34a' }} />
                    Base: <strong>10,000 Cards Default</strong>
                  </span>
                  <span style={{ color: '#16a34a', fontSize: '10.5px', fontWeight: 600 }}>Top-ups</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+5k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹49<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+10k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹79<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+25k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹149<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+50k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹249<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                </div>
              </div>

              {/* Flexible Prepay Cycles inside Plan */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={13} style={{ color: '#2563eb' }} />
                    Prepay Validity Cycles:
                  </span>
                  <span style={{ color: '#2563eb', fontSize: '10.5px', fontWeight: 600 }}>Save ₹989</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>Monthly</div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '11px' }}>₹499</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>Quarterly</div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '11px' }}>₹1,399</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>6 Months</div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '11px' }}>₹2,599</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>1 Year</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>₹4,999</div>
                  </div>
                </div>
              </div>

              {/* Core Limits list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11.5px', color: '#334155', marginTop: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <span><strong>Unlimited Organisations</strong> • Universal <strong>3 Super Admins</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <span>Splash &amp; Header Logo • In-App Brand Theme Colors</span>
                </div>
              </div>
            </div>

            {/* ENTERPRISE TIER */}
            <div className="saas-tier-plan-card tier-enterprise">
              {/* Header Badge & Action */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="saas-tier-badge saas-tier-max" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px', fontSize: '11px', fontWeight: 700 }}>
                    <Shield size={13} style={{ color: '#7c3aed' }} /> ENTERPRISE
                  </span>
                  <span style={{ fontSize: '10px', background: '#f3e8ff', color: '#7e22ce', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                    BESPOKE ARCHITECTURE
                  </span>
                </div>
                <button
                  type="button"
                  className="saas-btn saas-btn-secondary saas-btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', fontSize: '11.5px', fontWeight: 600 }}
                  onClick={() => handleOpenEditTierModal('max')}
                >
                  <Edit size={12} /> Configure
                </button>
              </div>

              {/* Price Hero */}
              <div style={{ padding: '2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>₹9,999</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>One-Time Setup</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                    <CheckCircle2 size={12} /> 2 Mos Free Validity
                  </span>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                    Then ₹499 <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b' }}>/ mo</span>
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                {tierMatrix.max?.description || 'Bespoke dynamic custom website with CMS admin dashboard and fully customized animated app.'}
              </div>

              {/* Website & App Rights Box */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Website &amp; Mobile App Delivery
                </div>
                <div style={{ fontSize: '12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Globe size={13} style={{ color: '#2563eb', flexShrink: 0 }} />
                  <span>Bespoke Dynamic Website: <strong>Unique Build + CMS Control Dashboard</strong></span>
                </div>
                <div style={{ fontSize: '12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Smartphone size={13} style={{ color: '#059669', flexShrink: 0 }} />
                  <span>Custom App: <strong>Animated Splash, Social Links, 10 Updates/Yr</strong></span>
                </div>
              </div>

              {/* Card Quota & Add-ons inside Plan */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CreditCard size={13} style={{ color: '#16a34a' }} />
                    Base: <strong>10,000 Cards Default</strong>
                  </span>
                  <span style={{ color: '#16a34a', fontSize: '10.5px', fontWeight: 600 }}>Top-ups</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+5k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹49<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+10k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹79<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+25k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹149<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>+50k</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>+₹249<span style={{ fontSize: '9px', fontWeight: 500 }}>/mo</span></div>
                  </div>
                </div>
              </div>

              {/* Flexible Prepay Cycles inside Plan */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={13} style={{ color: '#2563eb' }} />
                    Prepay Validity Cycles:
                  </span>
                  <span style={{ color: '#2563eb', fontSize: '10.5px', fontWeight: 600 }}>Save ₹989</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>Monthly</div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '11px' }}>₹499</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>Quarterly</div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '11px' }}>₹1,399</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>6 Months</div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '11px' }}>₹2,599</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '5px', padding: '4px 2px' }}>
                    <div style={{ color: '#64748b', fontSize: '10px' }}>1 Year</div>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>₹4,999</div>
                  </div>
                </div>
              </div>

              {/* Core Limits list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11.5px', color: '#334155', marginTop: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <span><strong>Unlimited Organisations</strong> • Universal <strong>3 Super Admins</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <span>VIP Priority Rendering Queue &amp; Cryptographic Offline Licenses</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ overflow: "visible", position: "relative", margin: 0, width: "100%", borderTop: "1px solid #cbd5e1" }}>
            <table className="data-table" style={{ width: '100%', flexShrink: 0, borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead style={{ position: 'sticky', top: 44, zIndex: 30 }}>
                <tr>
                  <th style={{ width: '38%', position: 'sticky', top: 44, zIndex: 30, background: '#1e293b', color: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>Platform Engine Feature</th>
                  <th style={{ textAlign: 'center', width: '20%', position: 'sticky', top: 44, zIndex: 30, background: '#1e293b', color: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>Starter (₹4,999 Setup • ₹499/mo)</th>
                  <th style={{ textAlign: 'center', width: '20%', position: 'sticky', top: 44, zIndex: 30, background: '#1e293b', color: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>Professional (₹7,499 Setup • ₹499/mo)</th>
                  <th style={{ textAlign: 'center', width: '22%', position: 'sticky', top: 44, zIndex: 30, background: '#1e293b', color: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>Enterprise (₹9,999 Setup • ₹499/mo)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'bulk_docx_xlsx_embedded', title: 'Bulk Embedded Photo Ingestion', desc: 'Auto-extract photos directly from DOCX and XLSX cells' },
                  { key: 'custom_branding_export', title: 'Custom Branding on Exports', desc: 'White-label header/footer on PDF and ZIP archives' },
                  { key: 'reprint_suite', title: 'Reprint Lifecycle & Badges', desc: 'Reprint queue with in-place badge mutation' },
                  { key: 'high_throughput_worker', title: 'Async Background Worker', desc: 'Heavy background task streaming under bounded memory' },
                  { key: 'audit_logs_telemetry', title: 'Audit Logs & Telemetry', desc: 'Detailed user audit log tracking and analytics' },
                  { key: 'priority_rendering', title: 'VIP Priority Rendering', desc: 'Instant rendering lane bypassing general queues' },
                ].map((feat) => (
                  <tr key={feat.key}>
                    <td>
                      <strong style={{ color: '#0f172a', fontSize: '13px' }}>{feat.title}</strong>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>{feat.desc}</div>
                    </td>
                    {['lite', 'pro', 'max'].map((tier) => {
                      const isEnabled = !!tierMatrix[tier]?.features?.[feat.key];
                      const btnLabel = isEnabled ? 'Included' : 'Locked';

                      return (
                        <td key={`${tier}-${feat.key}`} style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleTierFeature(tier, feat.key, isEnabled)}
                            style={{
                              background: isEnabled ? '#dcfce7' : '#fee2e2',
                              color: isEnabled ? '#15803d' : '#b91c1c',
                              border: `1px solid ${isEnabled ? '#bbf7d0' : '#fecaca'}`,
                              borderRadius: '4px',
                              padding: '3px 10px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isEnabled ? <CheckCircle2 size={12} /> : <X size={12} />}
                            {btnLabel}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong style={{ color: '#0f172a' }}>Super Admins Quota</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Universal limit per subscription</div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{tierMatrix.lite?.limits?.max_super_admins ?? 3} Super Admins</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{tierMatrix.pro?.limits?.max_super_admins ?? 3} Super Admins</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{tierMatrix.max?.limits?.max_super_admins ?? 3} Super Admins</td>
                </tr>
                <tr>
                  <td>
                    <strong style={{ color: '#0f172a' }}>Organisations Quota</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Institutions allowed under tenant</div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} /> Unlimited Orgs
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} /> Unlimited Orgs
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} /> Unlimited Orgs
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong style={{ color: '#0f172a' }}>Base Card Capacity</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Default cards included with license</div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>{Number(tierMatrix.lite?.limits?.max_cards ?? 10000).toLocaleString()} Cards</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>{Number(tierMatrix.pro?.limits?.max_cards ?? 10000).toLocaleString()} Cards</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>{Number(tierMatrix.max?.limits?.max_cards ?? 10000).toLocaleString()} Cards</td>
                </tr>
                <tr>
                  <td>
                    <strong style={{ color: '#0f172a' }}>Flexible Prepay Billing Options</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Renew monthly or prepay with discounted validity</div>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '12px', color: '#334155' }}>Monthly ₹499 • Qtr ₹1,399 • 6M ₹2,599 • 1Y ₹4,999</td>
                  <td style={{ textAlign: 'center', fontSize: '12px', color: '#334155' }}>Monthly ₹499 • Qtr ₹1,399 • 6M ₹2,599 • 1Y ₹4,999</td>
                  <td style={{ textAlign: 'center', fontSize: '12px', color: '#334155' }}>Monthly ₹499 • Qtr ₹1,399 • 6M ₹2,599 • 1Y ₹4,999</td>
                </tr>
                <tr>
                  <td>
                    <strong style={{ color: '#0f172a' }}>Card Top-Up Add-on Packs</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Expand beyond 10,000 base capacity seamlessly</div>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>+5k (₹49) • +10k (₹79) • +25k (₹149) • +50k (₹249)</td>
                  <td style={{ textAlign: 'center', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>+5k (₹49) • +10k (₹79) • +25k (₹149) • +50k (₹249)</td>
                  <td style={{ textAlign: 'center', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>+5k (₹49) • +10k (₹79) • +25k (₹149) • +50k (₹249)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 9: AUDIT & TELEMETRY LOGS (PRIME ADMIN & OPERATORS) ───────── */}
      {activeSubTab === 'logs' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top 4 KPI Metrics Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              padding: '12px 16px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              flexShrink: 0,
            }}
          >
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={18} />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Events</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{Number(logStats?.total_platform_events ?? logs.length).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={18} />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Critical Alarms</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#dc2626' }}>{Number(logStats?.critical_alerts ?? logs.filter((l) => l.level === 'critical').length).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={18} />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Security Events</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{Number(logStats?.security_events ?? logs.filter((l) => l.category === 'security').length).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={18} />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Billing &amp; Ledger</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{Number(logStats?.billing_events ?? logs.filter((l) => l.category === 'billing').length).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Light Action Bar with Clearable Search, Category, Severity, and Buttons */}
          <div className="notif-actions-bar action-bar-light" style={{ borderBottom: '1px solid #e2e8f0', padding: '8px 16px' }}>
            <div
              className="notif-actions-left"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}
            >
              <Input
                size="sm"
                variant="light"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                onClear={() => setLogSearchQuery('')}
                placeholder="Search action, title, user, tenant, IP..."
                icon={<Search size={13} />}
                clearable
                style={{ width: '250px' }}
              />

              <CustomSelect
                value={logCategoryFilter}
                onChange={(val) => setLogCategoryFilter(val)}
                options={[
                  { value: 'all', label: 'All Categories' },
                  { value: 'security', label: 'Security & Auth' },
                  { value: 'billing', label: 'Billing & Ledger' },
                  { value: 'license', label: 'License Engine' },
                  { value: 'tenant', label: 'Tenant Lifecycle' },
                  { value: 'operator', label: 'Operator Actions' },
                  { value: 'system', label: 'System Telemetry' },
                  { value: 'impersonation', label: 'Support Impersonation' },
                ]}
                height="28px"
                style={{ width: '150px' }}
              />

              <CustomSelect
                value={logLevelFilter}
                onChange={(val) => setLogLevelFilter(val)}
                options={[
                  { value: 'all', label: 'All Severities' },
                  { value: 'critical', label: 'Critical Alarms' },
                  { value: 'error', label: 'Errors' },
                  { value: 'warning', label: 'Warnings' },
                  { value: 'info', label: 'Info / Normal' },
                ]}
                height="28px"
                style={{ width: '130px' }}
              />
            </div>

            <div className="notif-actions-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-sm btn-neutral"
                onClick={() => {
                  setLogSearchQuery('');
                  setLogCategoryFilter('all');
                  setLogLevelFilter('all');
                }}
                title="Reset log filters"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <FilterX size={12} /> Reset Filters
              </button>

              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={fetchLogs}
                disabled={loadingLogs}
                title="Refresh logs"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  height: '28px',
                  padding: '0 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: '#ffffff',
                  border: '1px solid #bfdbfe',
                  color: '#1d4ed8',
                  borderRadius: '5px',
                  cursor: loadingLogs ? 'not-allowed' : 'pointer',
                }}
              >
                <RefreshCw size={12} className={loadingLogs ? 'spinning' : ''} />
                <span>{loadingLogs ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `cardflow-logs-${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                title="Export logs as JSON file"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Download size={12} /> Export JSON
              </button>
            </div>
          </div>

          {/* Full Audit & Telemetry Data Table */}
          <div className="table-wrapper" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            <table className="data-table" style={{ width: '100%', flexShrink: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>S. No.</th>
                  <th style={{ width: '140px' }}>Timestamp</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>Severity</th>
                  <th style={{ width: '120px' }}>Category</th>
                  <th>Action &amp; Title</th>
                  <th style={{ width: '140px' }}>Actor / Role</th>
                  <th style={{ width: '150px' }}>Tenant Client</th>
                  <th style={{ width: '110px' }}>IP Address</th>
                  
                </tr>
              </thead>
              <tbody>
                {loadingLogs
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="skeleton-row">
                        <td style={{ textAlign: 'center' }}>
                          <div className="skeleton" style={{ height: '13px', width: '20px', margin: '0 auto' }} />
                        </td>
                        <td><div className="skeleton skeleton-cell-date" /></td>
                        <td><div className="skeleton skeleton-cell-badge" /></td>
                        <td><div className="skeleton skeleton-cell-badge" /></td>
                        <td><div className="skeleton" style={{ height: '13px', width: '70%' }} /></td>
                        <td><div className="skeleton" style={{ height: '13px', width: '80px' }} /></td>
                        <td><div className="skeleton" style={{ height: '13px', width: '90px' }} /></td>
                        <td><div className="skeleton" style={{ height: '13px', width: '75px' }} /></td>
                        </tr>
                    ))
                  : logs.map((log, idx) => (
                      <tr key={log.id || idx}>
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11.5px' }}>{idx + 1}</td>
                        <td style={{ fontSize: '11.5px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : 'N/A'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`saas-log-level-badge saas-log-level-${log.level}`}>
                            {log.level}
                          </span>
                        </td>
                        <td>
                          <span className="saas-log-cat-badge">
                            {log.category_display || log.category}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '12.5px' }}>
                            {log.title}
                          </div>
                          {log.description && (
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', lineHeight: '1.4' }}>
                              {log.description}
                            </div>
                          )}
                          {log.action && (
                            <code style={{ fontSize: '10.5px', color: '#0284c7', background: '#f0f9ff', padding: '1px 5px', borderRadius: '3px', marginTop: '3px', display: 'inline-block' }}>
                              {log.action}
                            </code>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '12px' }}>
                            {log.actor_name || log.actor_username || 'System'}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#64748b', textTransform: 'capitalize' }}>
                            {log.actor_role || 'system'}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 500 }}>
                            {log.subscription_name || log.tenant_name || 'Global Platform'}
                          </span>
                        </td>
                        <td>
                          <code style={{ fontSize: '11px', color: '#64748b' }}>
                            {log.ip_address || '127.0.0.1'}
                          </code>
                        </td>
                      </tr>
                    ))}
                {!loadingLogs && logs.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                      <Activity size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>No audit or telemetry logs found</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>Try resetting filters or searching with different criteria.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div> {/* end saas-tab-view */}

      {/* ── MODAL: CREATE SUBSCRIPTION ──────────────────────────────────────── */}
      {showCreateSubModal && (
        <div className="saas-modal-backdrop" onClick={() => setShowCreateSubModal(false)}>
          <div className="saas-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="saas-modal-header">
              <h3>Create Tenant Subscription</h3>
              <button type="button" className="saas-modal-close-btn" onClick={() => setShowCreateSubModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateSubscription}>
              <div className="saas-modal-body">
                <div className="saas-form-group">
                  <label className="saas-form-label">Client / Group Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Academy Group"
                    value={subForm.name}
                    onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
                    className="saas-form-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="saas-form-group">
                    <label className="saas-form-label">Subscription Tier *</label>
                    <select
                      value={subForm.tier}
                      onChange={(e) => setSubForm({ ...subForm, tier: e.target.value })}
                      className="saas-form-select"
                    >
                      <option value="lite">CardFlow Starter (₹4,999 One-Time Setup • 2 Mos Free • ₹499/mo • 10k cards)</option>
                      <option value="pro">CardFlow Professional (₹7,499 One-Time Setup • 2 Mos Free • ₹499/mo • 10k cards)</option>
                      <option value="max">CardFlow Enterprise (₹9,999 One-Time Setup • 2 Mos Free • ₹499/mo • 10k cards)</option>
                    </select>
                  </div>

                  <div className="saas-form-group">
                    <label className="saas-form-label">Status *</label>
                    <select
                      value={subForm.status}
                      onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}
                      className="saas-form-select"
                    >
                      <option value="active">Active</option>
                      <option value="trial">Trial</option>
                      <option value="past_due">Past Due</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="saas-form-group">
                    <label className="saas-form-label">Subdomain Slug (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. apex"
                      value={subForm.slug}
                      onChange={(e) => setSubForm({ ...subForm, slug: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>

                  <div className="saas-form-group">
                    <label className="saas-form-label">Custom Domain (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. cards.apex.edu"
                      value={subForm.custom_domain}
                      onChange={(e) => setSubForm({ ...subForm, custom_domain: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="saas-form-group">
                    <label className="saas-form-label">Organisations Quota</label>
                    <input
                      type="text"
                      value="Unlimited"
                      disabled
                      className="saas-form-input"
                      style={{ background: '#f1f5f9', color: '#16a34a', fontWeight: 600 }}
                    />
                  </div>

                  <div className="saas-form-group">
                    <label className="saas-form-label">Next Renewal Date</label>
                    <input
                      type="date"
                      value={subForm.renews_at}
                      onChange={(e) => setSubForm({ ...subForm, renews_at: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                </div>

                {/* Initial Super Admin Setup */}
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#60a5fa', marginBottom: '8px' }}>
                    Initial Super Admin Account (1 of 3 Allowed)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Admin Username"
                      value={subForm.initial_admin_username}
                      onChange={(e) => setSubForm({ ...subForm, initial_admin_username: e.target.value })}
                      className="saas-form-input"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={subForm.initial_admin_password}
                      onChange={(e) => setSubForm({ ...subForm, initial_admin_password: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                </div>

                <div className="saas-form-group">
                  <label className="saas-form-label">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Client agreements or notes..."
                    value={subForm.notes}
                    onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })}
                    className="saas-form-textarea"
                  />
                </div>
              </div>

              <div className="saas-modal-footer">
                <button type="button" className="saas-btn saas-btn-secondary" onClick={() => setShowCreateSubModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="saas-btn saas-btn-primary">
                  Create Subscription & Storage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: RECORD PAYMENT ───────────────────────────────────────────── */}
      {showRecordPaymentModal && (
        <div className="saas-modal-backdrop" onClick={() => setShowRecordPaymentModal(false)}>
          <div className="saas-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="saas-modal-header">
              <h3>Record Subscription Payment</h3>
              <button type="button" className="saas-modal-close-btn" onClick={() => setShowRecordPaymentModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRecordPayment}>
              <div className="saas-modal-body">
                <div className="saas-form-group">
                  <label className="saas-form-label">Client Subscription *</label>
                  <select
                    required
                    value={paymentForm.subscription_id}
                    onChange={(e) => setPaymentForm({ ...paymentForm, subscription_id: e.target.value })}
                    className="saas-form-select"
                  >
                    <option value="">Select Client...</option>
                    {subscriptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.tier_display})</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="saas-form-group">
                    <label className="saas-form-label">Amount ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="149.00"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>

                  <div className="saas-form-group">
                    <label className="saas-form-label">Payment Date</label>
                    <input
                      type="date"
                      value={paymentForm.payment_date}
                      onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="saas-form-group">
                    <label className="saas-form-label">Payment Method</label>
                    <select
                      value={paymentForm.payment_method}
                      onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                      className="saas-form-select"
                    >
                      <option value="stripe">Stripe / Card</option>
                      <option value="bank_transfer">Bank Wire</option>
                      <option value="upi">UPI / QR Code</option>
                      <option value="cash">Cash / Cheque</option>
                    </select>
                  </div>

                  <div className="saas-form-group">
                    <label className="saas-form-label">Next Renewal Date</label>
                    <input
                      type="date"
                      value={paymentForm.next_renewal_date}
                      onChange={(e) => setPaymentForm({ ...paymentForm, next_renewal_date: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                </div>

                <div className="saas-form-group">
                  <label className="saas-form-label">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Invoice or transaction reference..."
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    className="saas-form-textarea"
                  />
                </div>
              </div>

              <div className="saas-modal-footer">
                <button type="button" className="saas-btn saas-btn-secondary" onClick={() => setShowRecordPaymentModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="saas-btn saas-btn-success">
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE PRIME OPERATOR ────────────────────────────────────── */}
      {showCreateOperatorModal && isPrimeAdmin && (
        <div className="saas-modal-backdrop" onClick={() => setShowCreateOperatorModal(false)}>
          <div className="saas-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="saas-modal-header">
              <h3>Add Prime Operator</h3>
              <button type="button" className="saas-modal-close-btn" onClick={() => setShowCreateOperatorModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateOperator}>
              <div className="saas-modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="saas-form-group">
                    <label className="saas-form-label">Username *</label>
                    <input
                      type="text"
                      required
                      placeholder="operator.sales"
                      value={operatorForm.username}
                      onChange={(e) => setOperatorForm({ ...operatorForm, username: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                  <div className="saas-form-group">
                    <label className="saas-form-label">Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Password"
                      value={operatorForm.password}
                      onChange={(e) => setOperatorForm({ ...operatorForm, password: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                </div>

                <div className="saas-form-group">
                  <label className="saas-form-label">Operator Sub-Role *</label>
                  <select
                    value={operatorForm.prime_operator_role}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      setOperatorForm({
                        ...operatorForm,
                        prime_operator_role: newRole,
                        operator_permissions: DEFAULT_OPERATOR_PERMS[newRole] || {},
                      });
                    }}
                    className="saas-form-select"
                  >
                    <option value="sales">Sales Operator (Subscriptions, Payments, Billing)</option>
                    <option value="dev">Dev Operator (Domains, Landing configs, Mobile apps)</option>
                    <option value="helper">Helper / Support Operator (Support Impersonation & Telemetry)</option>
                  </select>
                </div>

                <div className="saas-form-group">
                  <label className="saas-form-label">Granular Operator Permissions</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    {[
                      { key: 'can_manage_billing', label: 'Manage Billing & Ledger' },
                      { key: 'can_manage_subscriptions', label: 'Manage Subscriptions' },
                      { key: 'can_impersonate', label: 'Support Mode / Impersonate' },
                      { key: 'can_view_logs', label: 'View Engine Telemetry & Logs' },
                      { key: 'can_edit_tiers', label: 'Edit Tier Plans & Pricing' },
                      { key: 'can_manage_domains', label: 'Manage Domains & Landing' },
                      { key: 'can_view_directory', label: 'View Client Directory' },
                    ].map(({ key, label }) => {
                      const isChecked = operatorForm.operator_permissions?.[key] !== undefined
                        ? !!operatorForm.operator_permissions[key]
                        : (DEFAULT_OPERATOR_PERMS[operatorForm.prime_operator_role]?.[key] ?? false);
                      return (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#1e293b' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setOperatorForm((prev) => ({
                                ...prev,
                                operator_permissions: {
                                  ...(prev.operator_permissions || {}),
                                  [key]: e.target.checked,
                                },
                              }));
                            }}
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="saas-form-group">
                    <label className="saas-form-label">Email</label>
                    <input
                      type="email"
                      placeholder="staff@cardflow.io"
                      value={operatorForm.email}
                      onChange={(e) => setOperatorForm({ ...operatorForm, email: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                  <div className="saas-form-group">
                    <label className="saas-form-label">Phone</label>
                    <input
                      type="text"
                      placeholder="+1 (555) 000-0000"
                      value={operatorForm.phone}
                      onChange={(e) => setOperatorForm({ ...operatorForm, phone: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                </div>
              </div>

              <div className="saas-modal-footer">
                <button type="button" className="saas-btn saas-btn-secondary" onClick={() => setShowCreateOperatorModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="saas-btn saas-btn-primary">
                  Create Prime Operator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DRAWER: EDIT PRIME OPERATOR ──────────────────────────────────────── */}
      {showEditOperatorModal && isPrimeAdmin && (
        createPortal(
          <>
            <div className="drawer-overlay-backdrop" />
            <div
              className="side-drawer-panel"
              style={{
                width: '640px',
                maxWidth: '96vw',
                height: '100vh',
                background: '#ffffff',
                boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.35)',
                zIndex: 99999999,
                display: 'flex',
                flexDirection: 'column',
                animation: 'drawerSlideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="drawer-header"
                style={{
                  padding: '18px 24px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={18} style={{ color: '#2563eb' }} />
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                      Edit Prime Operator: {editOperatorForm.username}
                    </h3>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Configure staff sub-role, granular permissions, credentials, and account status.
                  </p>
                </div>
                <button
                  type="button"
                  className="saas-modal-close-btn"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    padding: '6px',
                    borderRadius: '6px',
                  }}
                  onClick={() => setShowEditOperatorModal(null)}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdatePrimeOperator} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div
                  className="drawer-body"
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '22px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px',
                  }}
                >
                  <div className="saas-form-group">
                    <label className="saas-form-label">Operator Sub-Role *</label>
                    <select
                      value={editOperatorForm.prime_operator_role}
                      onChange={(e) => {
                        const newRole = e.target.value;
                        setEditOperatorForm({
                          ...editOperatorForm,
                          prime_operator_role: newRole,
                          operator_permissions: DEFAULT_OPERATOR_PERMS[newRole] || {},
                        });
                      }}
                      className="saas-form-select"
                    >
                      <option value="sales">Sales Operator (Subscriptions, Billing, Payments)</option>
                      <option value="dev">Dev Operator (Domains, Landing pages, Mobile studio)</option>
                      <option value="helper">Helper / Support Operator (Impersonation & Troubleshooting)</option>
                    </select>
                  </div>

                  <div className="saas-form-group">
                    <label className="saas-form-label">Granular Operator Permissions</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      {[
                        { key: 'can_manage_billing', label: 'Manage Billing & Ledger' },
                        { key: 'can_manage_subscriptions', label: 'Manage Subscriptions' },
                        { key: 'can_impersonate', label: 'Support Mode / Impersonate' },
                        { key: 'can_view_logs', label: 'View Engine Telemetry & Logs' },
                        { key: 'can_edit_tiers', label: 'Edit Tier Plans & Pricing' },
                        { key: 'can_manage_domains', label: 'Manage Domains & Landing' },
                        { key: 'can_view_directory', label: 'View Client Directory' },
                      ].map(({ key, label }) => {
                        const isChecked = editOperatorForm.operator_permissions?.[key] !== undefined
                          ? !!editOperatorForm.operator_permissions[key]
                          : (editOperatorForm.effective_permissions?.[key] ?? DEFAULT_OPERATOR_PERMS[editOperatorForm.prime_operator_role]?.[key] ?? false);
                        return (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: '#1e293b', background: '#ffffff', padding: '8px 10px', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                setEditOperatorForm((prev) => ({
                                  ...prev,
                                  operator_permissions: {
                                    ...(prev.operator_permissions || {}),
                                    [key]: e.target.checked,
                                  },
                                }));
                              }}
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="saas-form-group">
                      <label className="saas-form-label">Email</label>
                      <input
                        type="email"
                        disabled
                        value={editOperatorForm.email}
                        className="saas-form-input"
                        style={{ opacity: 0.7, cursor: 'not-allowed' }}
                      />
                    </div>
                    <div className="saas-form-group">
                      <label className="saas-form-label">Phone</label>
                      <input
                        type="text"
                        placeholder="+1 (555) 000-0000"
                        value={editOperatorForm.phone}
                        onChange={(e) => setEditOperatorForm({ ...editOperatorForm, phone: e.target.value })}
                        className="saas-form-input"
                      />
                    </div>
                  </div>

                  <div className="saas-form-group">
                    <label className="saas-form-label">Account Status</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#0f172a' }}>
                      <input
                        type="checkbox"
                        checked={!!editOperatorForm.is_active}
                        onChange={(e) => setEditOperatorForm({ ...editOperatorForm, is_active: e.target.checked })}
                      />
                      <span>Active (Permit staff access to internal control panels)</span>
                    </label>
                  </div>

                  <div className="saas-form-group">
                    <label className="saas-form-label">Reset Password (leave blank to keep unchanged)</label>
                    <input
                      type="password"
                      placeholder="New password (optional)"
                      value={editOperatorForm.password}
                      onChange={(e) => setEditOperatorForm({ ...editOperatorForm, password: e.target.value })}
                      className="saas-form-input"
                    />
                  </div>
                </div>

                <div
                  className="drawer-footer"
                  style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                  }}
                >
                  <button type="button" className="saas-btn saas-btn-secondary" onClick={() => setShowEditOperatorModal(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="saas-btn saas-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} />
                    Save Operator Changes
                  </button>
                </div>
              </form>
            </div>
          </>,
          document.body
        )
      )}

      {/* ── MODAL: DELETE PRIME OPERATOR ────────────────────────────────────── */}
      {showDeleteOperatorModal && isPrimeAdmin && (
        <ConfirmDeleteModal
          isOpen={Boolean(showDeleteOperatorModal)}
          onClose={() => setShowDeleteOperatorModal(null)}
          title={`Delete Prime Operator "${showDeleteOperatorModal.username}"`}
          itemDescription={`prime operator "${showDeleteOperatorModal.username}". This staff member will immediately lose all access to CardFlow's SaaS management`}
          requiresCode={true}
          deleteCode={deleteOperatorCode}
          confirmText="Delete"
          confirmVariant="danger"
          onConfirm={handleDeletePrimeOperator}
        />
      )}

      {/* ── MODAL: REGENERATE LICENSE KEY (WITHOUT PIN) ────────────────────── */}
      {licenseRegenTarget && (
        <ConfirmDeleteModal
          isOpen={Boolean(licenseRegenTarget)}
          onClose={() => setLicenseRegenTarget(null)}
          title={`Reissue License Key for "${licenseRegenTarget.name}"`}
          itemDescription={`enterprise subscription "${licenseRegenTarget.name}"`}
          customMessage={`Are you sure you want to reissue a new cryptographic enterprise license key for "${licenseRegenTarget.name}"? The previous key will be superseded immediately.`}
          requiresCode={false}
          confirmText="Reissue"
          confirmVariant="primary"
          icon={<KeyRound size={24} style={{ color: '#2563eb' }} />}
          onConfirm={executeRegenerateLicense}
        />
      )}

      {/* ── DRAWER: EDIT TIER PLAN CONFIGURATION (PRIME ADMIN) ───────────────── */}
      {editingTier && isPrimeAdmin && (
        createPortal(
          <>
            <div className="drawer-overlay-backdrop" />
            <div
              className="side-drawer-panel"
              style={{
                width: '640px',
                maxWidth: '95vw',
                height: '100vh',
                background: '#ffffff',
                boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.35)',
                zIndex: 99999999,
                display: 'flex',
                flexDirection: 'column',
                animation: 'drawerSlideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="drawer-header"
                style={{
                  padding: '18px 24px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={18} style={{ color: '#2563eb' }} />
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                      Configure {tierEditForm.display_name || editingTier.toUpperCase()} Plan Architecture
                    </h3>
                    <span className={`saas-tier-badge saas-tier-${editingTier}`}>
                      {editingTier.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Configure base quota, monthly subscription, limits, offerings, and platform features.
                  </p>
                </div>
                <button
                  type="button"
                  className="saas-modal-close-btn"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    padding: '6px',
                    borderRadius: '6px',
                  }}
                  onClick={() => setEditingTier(null)}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveTierConfiguration} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div
                  className="drawer-body"
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '22px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px',
                  }}
                >
                  {/* Identity & Recurring Pricing */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <DollarSign size={15} style={{ color: '#2563eb' }} /> Plan Identity & Recurring Subscription
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                      <div className="saas-form-group">
                        <label className="saas-form-label">Display Name *</label>
                        <input
                          type="text"
                          required
                          value={tierEditForm.display_name}
                          onChange={(e) => setTierEditForm({ ...tierEditForm, display_name: e.target.value })}
                          className="saas-form-input"
                        />
                      </div>
                      <div className="saas-form-group">
                        <label className="saas-form-label">Monthly Subscription (₹) *</label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="1"
                          value={tierEditForm.price_monthly}
                          onChange={(e) => setTierEditForm({ ...tierEditForm, price_monthly: e.target.value })}
                          className="saas-form-input"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quotas & Limits */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CreditCard size={15} style={{ color: '#16a34a' }} /> Default Quotas & Platform Ceilings
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div className="saas-form-group">
                        <label className="saas-form-label">Base Cards *</label>
                        <input
                          type="number"
                          required
                          min="100"
                          step="500"
                          value={tierEditForm.max_cards}
                          onChange={(e) => setTierEditForm({ ...tierEditForm, max_cards: e.target.value })}
                          className="saas-form-input"
                        />
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Default 10,000</span>
                      </div>
                      <div className="saas-form-group">
                        <label className="saas-form-label">Organisations Quota</label>
                        <input
                          type="text"
                          value="Unlimited"
                          disabled
                          className="saas-form-input"
                          style={{ background: '#f1f5f9', color: '#16a34a', fontWeight: 600 }}
                        />
                        <span style={{ fontSize: '11px', color: '#16a34a' }}>Unlimited across all tiers</span>
                      </div>
                      <div className="saas-form-group">
                        <label className="saas-form-label">Super Admins *</label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="10"
                          value={tierEditForm.max_super_admins}
                          onChange={(e) => setTierEditForm({ ...tierEditForm, max_super_admins: e.target.value })}
                          className="saas-form-input"
                        />
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Universal 3 Max</span>
                      </div>
                    </div>
                  </div>

                  {/* One-Time Setup Offering & Website/App Specs */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Globe size={15} style={{ color: '#8b5cf6' }} /> Website & Mobile App Offering Specs
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                        <strong>One-Time Setup Fee:</strong> {editingTier === 'lite' ? '₹4,999' : editingTier === 'pro' ? '₹7,499' : '₹9,999'} (Includes 2 Months Free Platform Validity)
                      </div>
                      <div style={{ padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                        <strong>Website Offering:</strong> {editingTier === 'lite' ? 'Primary cloud subdomain (yourbrand.cardflow.io)' : editingTier === 'pro' ? 'Customizable static website (5 templates, custom colors/sections, 10 change requests/year)' : 'Bespoke dynamic custom website (unique build, not from template) + CMS Control Dashboard'}
                      </div>
                      <div style={{ padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                        <strong>Mobile App Offering:</strong> {editingTier === 'lite' ? 'Shared standard CardFlow companion app (Google Play listing add-on available)' : editingTier === 'pro' ? 'Dedicated Android app with client Play Store name & icon, splash logo & name, header logo, and brand theme colors' : 'Fully customized bespoke app with animated startup splash, social links, custom in-app feature colors, and up to 10 app updates/year'}
                      </div>
                    </div>
                  </div>

                  {/* Prepay Cycles & Card Top-up Quick Reference */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={15} style={{ color: '#2563eb' }} /> Prepay Validity Cycles & Card Add-on Packs
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                        <strong style={{ display: 'block', marginBottom: '4px', color: '#0f172a' }}>Prepay Cycles:</strong>
                        <div>• Monthly: ₹499/mo</div>
                        <div>• Quarterly: ₹1,399 (Save ₹98)</div>
                        <div>• Half-Yearly: ₹2,599 (Save ₹395)</div>
                        <div>• 1 Year: ₹4,999 (Save ₹989)</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                        <strong style={{ display: 'block', marginBottom: '4px', color: '#0f172a' }}>Card Expansion Add-ons:</strong>
                        <div>• +5,000 Cards: +₹49/mo (15k)</div>
                        <div>• +10,000 Cards: +₹79/mo (20k)</div>
                        <div>• +25,000 Cards: +₹149/mo (35k)</div>
                        <div>• +50,000 Cards: +₹249/mo (60k)</div>
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="saas-form-group">
                    <label className="saas-form-label">Platform Features Included</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      {[
                        { key: 'bulk_docx_xlsx_embedded', label: 'Bulk Embedded Photo Ingestion' },
                        { key: 'custom_branding_export', label: 'Custom Branding on Exports' },
                        { key: 'reprint_suite', label: 'Reprint Lifecycle & Badges' },
                        { key: 'high_throughput_worker', label: 'Async Background Workers' },
                        { key: 'audit_logs_telemetry', label: 'Audit Logs & Telemetry' },
                        { key: 'priority_rendering', label: 'VIP Priority Rendering Queue' },
                      ].map(({ key, label }) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: '#1e293b', background: '#ffffff', padding: '8px 10px', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
                          <input
                            type="checkbox"
                            checked={!!tierEditForm.features?.[key]}
                            onChange={(e) => {
                              setTierEditForm((prev) => ({
                                ...prev,
                                features: {
                                  ...(prev.features || {}),
                                  [key]: e.target.checked,
                                },
                              }));
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="saas-form-group">
                    <label className="saas-form-label">Marketing Summary / Description</label>
                    <textarea
                      rows={3}
                      value={tierEditForm.description}
                      onChange={(e) => setTierEditForm({ ...tierEditForm, description: e.target.value })}
                      className="saas-form-textarea"
                      placeholder="Brief value proposition and tier offering summary..."
                    />
                  </div>
                </div>

                <div
                  className="drawer-footer"
                  style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                  }}
                >
                  <button type="button" className="saas-btn saas-btn-secondary" onClick={() => setEditingTier(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="saas-btn saas-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} />
                    Save Tier Configuration
                  </button>
                </div>
              </form>
            </div>
          </>,
          document.body
        )
      )}

      {/* ── MODAL: REJECT PAYMENT PROMPT ────────────────────────────────────── */}
      {rejectingPayment && (
        <div className="saas-modal-backdrop" onClick={() => setRejectingPayment(null)}>
          <div className="saas-modal-dialog modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="saas-modal-header">
              <h3 style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <XCircle size={18} /> Reject Payment Verification
              </h3>
              <button type="button" className="saas-modal-close-btn" onClick={() => setRejectingPayment(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="saas-modal-body">
              <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
                Rejecting manual payment of <strong>₹{Number(rejectingPayment.amount)?.toLocaleString('en-IN')}</strong> from <strong>{rejectingPayment.subscription_name}</strong> (UTR: {rejectingPayment.utr_number || 'N/A'}).
              </p>
              <div className="saas-form-group">
                <label className="saas-form-label">Reason for Rejection *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. UTR not found in bank statement, amount mismatch, or illegible receipt."
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  className="saas-form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="saas-modal-footer">
              <button type="button" className="saas-btn saas-btn-secondary" onClick={() => setRejectingPayment(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="saas-btn"
                style={{ background: '#dc2626', color: '#ffffff', border: 'none' }}
                disabled={verifyingPaymentId === rejectingPayment.id}
                onClick={handleConfirmRejectPayment}
              >
                {verifyingPaymentId === rejectingPayment.id ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PROOF SCREENSHOT LIGHTBOX ─────────────────────────────────── */}
      {previewProofModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setPreviewProofModal(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '850px',
              width: '100%',
              background: '#0f172a',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '14px' }}>UTR / Bank Transaction Screenshot</span>
              <button
                type="button"
                onClick={() => setPreviewProofModal(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} color="#ffffff" />
              </button>
            </div>
            <img
              src={previewProofModal}
              alt="Payment Proof"
              style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: '8px' }}
            />
          </div>
        </div>
      )}

      {/* ── SLIDE-OVER TENANT DETAILS DRAWER ─────────────────────────────────── */}
      <TenantDetailsDrawer
        isOpen={!!drawerTenant}
        subscription={drawerTenant}
        onClose={() => setDrawerTenant(null)}
        onSubscriptionUpdated={() => {
          fetchAllData();
        }}
        addToast={addToast}
      />
    </div>
  );
}
