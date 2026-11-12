import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Building,
  Key,
  Copy,
  CheckCircle2,
  Users,
  Palette,
  DollarSign,
  Sparkles,
  ExternalLink,
  Smartphone,
  Printer,
  FileText,
  Sliders,
  Check,
  Plus,
  Globe,
  UserCheck,
} from 'lucide-react';
import { saasApi } from '../../services/api';

export default function TenantDetailsDrawer({
  isOpen,
  onClose,
  subscription,
  onSubscriptionUpdated,
  addToast,
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'super_admins' | 'tier_billing' | 'domains' | 'mobile_app' | 'branding' | 'features'
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [superAdmins, setSuperAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Editable form state initialized from subscription
  const [formData, setFormData] = useState({
    name: '',
    tier: 'pro',
    status: 'active',
    max_cards: 25000,
    max_organisations: 500,
    custom_domain: '',
    custom_subdomain: '',
    brand_name: '',
    brand_logo_url: '',
    panel_color_theme: '#3b82f6',
    panel_accent_theme: '#1d4ed8',
    website_template: 'modern_minimal',
    billing_plan: 'split',
    installments_paid: 0,
    installments_total: 10,
    auto_print_active: false,
    auto_print_credits: 0,
    auto_type_active: false,
    auto_type_credits: 0,
    auto_edit_active: false,
    auto_edit_credits: 0,
    mobile_app_enabled: true,
    custom_app_requested: false,
    app_name: '',
    package_name: '',
    app_version: '1.1.00',
    notes: '',
  });

  // Payment settlement state when changing tier
  const [recordPayment, setRecordPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: 749,
    method: 'bank_transfer',
    reference_number: '',
    notes: 'Tier change settlement',
    is_verified: true,
  });

  // New Super Admin form state
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
  });
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  useEffect(() => {
    if (subscription) {
      setFormData({
        name: subscription.name || '',
        tier: subscription.tier || 'pro',
        status: subscription.status || 'active',
        max_cards: subscription.max_cards || 10000,
        max_organisations: subscription.max_organisations || (subscription.tier === 'lite' ? 100 : subscription.tier === 'pro' ? 500 : 2000),
        custom_domain: subscription.custom_domain || '',
        custom_subdomain: subscription.custom_subdomain || subscription.slug || '',
        brand_name: subscription.brand_name || subscription.name || 'CardFlow',
        brand_logo_url: subscription.brand_logo_url || '',
        panel_color_theme: subscription.panel_color_theme || '#3b82f6',
        panel_accent_theme: subscription.panel_accent_theme || '#1d4ed8',
        website_template: subscription.website_template || 'modern_minimal',
        billing_plan: subscription.billing_plan || 'split',
        installments_paid: subscription.installments_paid ?? 0,
        installments_total: subscription.installments_total ?? 10,
        auto_print_active: Boolean(subscription.auto_print_active),
        auto_print_credits: subscription.auto_print_credits || 0,
        auto_type_active: Boolean(subscription.auto_type_active),
        auto_type_credits: subscription.auto_type_credits || 0,
        auto_edit_active: Boolean(subscription.auto_edit_active),
        auto_edit_credits: subscription.auto_edit_credits || 0,
        mobile_app_enabled: subscription.mobile_app_config?.is_enabled ?? true,
        custom_app_requested: subscription.mobile_app_config?.custom_app_requested ?? false,
        app_name: subscription.mobile_app_config?.app_name || subscription.name || '',
        package_name: subscription.mobile_app_config?.package_name || `com.cardflow.${subscription.slug || 'app'}`,
        app_version: subscription.mobile_app_config?.version || '1.1.00',
        notes: subscription.notes || '',
      });
      setSuperAdmins(subscription.super_admins || []);
      setRecordPayment(false);
      setShowAddAdminForm(false);
    }
  }, [subscription]);

  // Load super admins for this subscription
  const fetchSuperAdmins = React.useCallback(async () => {
    if (!subscription?.id) return;
    setLoadingAdmins(true);
    try {
      const res = await saasApi.getSuperAdmins(subscription.id);
      if (res?.super_admins) {
        setSuperAdmins(res.super_admins);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingAdmins(false);
    }
  }, [subscription?.id]);

  useEffect(() => {
    if (isOpen && subscription?.id) {
      fetchSuperAdmins();
    }
  }, [isOpen, subscription?.id, fetchSuperAdmins]);

  if (!isOpen || !subscription) return null;

  const handleCopyKey = () => {
    if (subscription.license_key) {
      navigator.clipboard?.writeText(subscription.license_key);
      setCopiedKey(true);
      addToast?.('License key copied to clipboard!', 'success');
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleEnterAccount = async () => {
    try {
      const res = await saasApi.enterAccount(subscription.id);
      addToast?.(res?.message || `Impersonating ${subscription.name}...`, 'success');
      try {
        localStorage.removeItem('cf_auth_user');
        sessionStorage.removeItem('cf_auth_user');
      } catch (_) {}
      if (window.__setActiveImpersonation && res?.target_user) {
        window.__setActiveImpersonation(res.target_user);
      }
      if (window.__refreshAuthUser) {
        await window.__refreshAuthUser();
      }
      onClose?.();
      window.location.href = '/';
    } catch (err) {
      addToast?.(err?.response?.data?.error || err?.response?.data?.message || 'Failed to initialize impersonation session', 'error');
    }
  };

  const handleCreateSuperAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminForm.username.trim() || !newAdminForm.password.trim()) {
      addToast?.('Username and password are required', 'warning');
      return;
    }
    setCreatingAdmin(true);
    try {
      const res = await saasApi.createSuperAdmin(subscription.id, {
        username: newAdminForm.username.trim(),
        email: newAdminForm.email.trim() || `${newAdminForm.username.trim()}@${subscription.slug}.cardflow.io`,
        phone: newAdminForm.phone.trim(),
        password: newAdminForm.password.trim(),
      });
      addToast?.(res?.message || 'Super Admin created successfully!', 'success');
      setNewAdminForm({ username: '', email: '', phone: '', password: '' });
      setShowAddAdminForm(false);
      fetchSuperAdmins();
      onSubscriptionUpdated?.();
    } catch (err) {
      addToast?.(err?.response?.data?.error || 'Failed to create Super Admin account', 'error');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        tier: formData.tier,
        status: formData.status,
        max_cards: parseInt(formData.max_cards, 10),
        max_organisations: parseInt(formData.max_organisations, 10),
        custom_domain: formData.custom_domain.trim() || null,
        custom_subdomain: formData.custom_subdomain.trim() || null,
        brand_name: formData.brand_name.trim(),
        brand_logo_url: formData.brand_logo_url.trim(),
        panel_color_theme: formData.panel_color_theme,
        panel_accent_theme: formData.panel_accent_theme,
        website_template: formData.website_template,
        billing_plan: formData.billing_plan,
        installments_paid: parseInt(formData.installments_paid, 10),
        installments_total: parseInt(formData.installments_total, 10),
        auto_print_active: formData.auto_print_active,
        auto_print_credits: parseInt(formData.auto_print_credits, 10),
        auto_type_active: formData.auto_type_active,
        auto_type_credits: parseInt(formData.auto_type_credits, 10),
        auto_edit_active: formData.auto_edit_active,
        auto_edit_credits: parseInt(formData.auto_edit_credits, 10),
        mobile_app_config: {
          is_enabled: formData.mobile_app_enabled,
          custom_app_requested: formData.custom_app_requested,
          app_name: formData.app_name?.trim() || formData.name,
          package_name: formData.package_name?.trim() || `com.cardflow.${formData.slug || subscription.slug}`,
          version: formData.app_version || '1.1.00',
          brand_color: formData.panel_color_theme,
          logo_url: formData.brand_logo_url,
        },
        notes: formData.notes,
      };

      if (recordPayment && paymentForm.amount > 0) {
        payload.record_payment = {
          amount: parseFloat(paymentForm.amount),
          method: paymentForm.method,
          reference_number: paymentForm.reference_number.trim() || `DRAWER-${Date.now()}`,
          notes: paymentForm.notes.trim(),
          is_verified: paymentForm.is_verified,
        };
      }

      await saasApi.updateSubscription(subscription.id, payload);
      addToast?.(`Tenant '${formData.name}' successfully updated!`, 'success');
      onSubscriptionUpdated?.();
      onClose();
    } catch (err) {
      addToast?.(err?.response?.data?.error || err?.message || 'Failed to update tenant', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cardsUsed = subscription.telemetry?.total_cards_used || 0;
  const cardsLimit = formData.max_cards || 25000;
  const cardPct = Math.min(100, Math.round((cardsUsed / Math.max(cardsLimit, 1)) * 100));

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="drawer-overlay-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 99999998,
        }}
      />

      {/* Slide-Over Drawer Container */}
      <div
        className="side-drawer-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '640px',
          maxWidth: '95vw',
          height: '100vh',
          background: '#ffffff',
          boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.35)',
          zIndex: 99999999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'drawerSlideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* 1. Header (Navy Gradient) */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#fff',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: formData.tier === 'max' ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : formData.tier === 'pro' ? 'linear-gradient(135deg, #2563eb, #06b6d4)' : 'linear-gradient(135deg, #10b981, #059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '18px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              }}
            >
              {formData.name ? formData.name.charAt(0).toUpperCase() : 'T'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  {formData.name || 'Tenant Details'}
                </h2>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: formData.tier === 'max' ? '#8b5cf6' : formData.tier === 'pro' ? '#2563eb' : '#10b981',
                    color: '#fff',
                  }}
                >
                  {formData.tier.toUpperCase()} TIER
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'capitalize',
                    background: formData.status === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: formData.status === 'active' ? '#4ade80' : '#f87171',
                    border: formData.status === 'active' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                  }}
                >
                  {formData.status}
                </span>
                {subscription.license_key && (
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    title="Click to copy License Key"
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#93c5fd',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Key size={11} />
                    <span>{subscription.license_key}</span>
                    {copiedKey ? <Check size={11} color="#4ade80" /> : <Copy size={11} />}
                  </button>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Partition: <strong style={{ color: '#cbd5e1' }}>tenants/{subscription.slug}/</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleEnterAccount}
              title="Impersonate this client account"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(37, 99, 235, 0.25)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#93c5fd',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <UserCheck size={13} /> Impersonate
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 2. Drawer Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            padding: '0 12px',
            flexShrink: 0,
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'overview', label: 'Overview & Quota', Icon: Building },
            { id: 'super_admins', label: `Super Admins (${superAdmins.length}/3)`, Icon: Users },
            { id: 'tier_billing', label: 'Tier & Billing', Icon: DollarSign },
            { id: 'domains', label: 'Domains & SSL', Icon: Globe },
            { id: 'mobile_app', label: 'Mobile App', Icon: Smartphone },
            { id: 'branding', label: 'Theme & Logo', Icon: Palette },
            { id: 'features', label: 'Engine Add-Ons', Icon: Sliders },
          ].map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 14px',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  background: 'transparent',
                  color: isActive ? '#2563eb' : '#64748b',
                  fontSize: '13px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* 3. Tab Body Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', minHeight: 0 }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* License Key Card */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Key size={15} style={{ color: '#2563eb' }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Enterprise License Key</span>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: '#dcfce7',
                      color: '#15803d',
                    }}
                  >
                    Active &amp; Enforcing
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '8px 12px',
                  }}
                >
                  <code style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', flex: 1, letterSpacing: '0.04em' }}>
                    {subscription.license_key || 'CF-PRO-XXXX-XXXX-XXXX'}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: copiedKey ? '#16a34a' : '#2563eb',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Quota & Usage Progress */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Card Production Quota</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '4px 0' }}>
                    {cardsUsed.toLocaleString()} / {cardsLimit.toLocaleString()}
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', marginTop: '8px' }}>
                    <div
                      style={{
                        width: `${cardPct}%`,
                        height: '100%',
                        background: cardPct > 90 ? '#ef4444' : cardPct > 70 ? '#f59e0b' : '#10b981',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{cardPct}% utilized</span>
                    <span>{(cardsLimit - cardsUsed).toLocaleString()} remaining</span>
                  </div>
                </div>

                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Organisations (Schools)</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '4px 0' }}>
                    {subscription.telemetry?.total_organisations || 0} (Unlimited)
                  </div>
                  <p style={{ fontSize: '11.5px', color: '#16a34a', margin: '6px 0 0', fontWeight: 600 }}>
                    Unlimited organisations allowed under tenant license.
                  </p>
                </div>
              </div>

              {/* Status Switcher & Core Settings */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 14px', color: '#0f172a' }}>
                  Tenant Status &amp; Profile
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Client / Organization Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Subscription Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        outline: 'none',
                        background: '#ffffff',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="active">Active (Full Access)</option>
                      <option value="trial">Trial (Evaluation Mode)</option>
                      <option value="past_due">Past Due (Payment Pending)</option>
                      <option value="cancelled">Cancelled (Locked)</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Internal Admin Notes
                  </label>
                  <textarea
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Enter sales context, client notes, contract details..."
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SUPER ADMINS */}
          {activeTab === 'super_admins' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    Tenant Super Admin Accounts
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Strict limit of up to 3 Super Admins sharing this tenant DB partition.
                  </p>
                </div>
                {superAdmins.length < 3 && !showAddAdminForm && (
                  <button
                    type="button"
                    onClick={() => setShowAddAdminForm(true)}
                    className="saas-btn saas-btn-primary saas-btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={13} /> Add Super Admin
                  </button>
                )}
              </div>

              {/* Add New Super Admin inline form */}
              {showAddAdminForm && (
                <form
                  onSubmit={handleCreateSuperAdmin}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      New Super Admin Credentials
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddAdminForm(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>Username *</label>
                      <input
                        type="text"
                        required
                        placeholder={`${subscription.slug}.admin2`}
                        value={newAdminForm.username}
                        onChange={(e) => setNewAdminForm({ ...newAdminForm, username: e.target.value })}
                        style={{
                          width: '100%',
                          height: '32px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '0 8px',
                          fontSize: '12.5px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>Password *</label>
                      <input
                        type="text"
                        required
                        placeholder="SecurePass@2026"
                        value={newAdminForm.password}
                        onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
                        style={{
                          width: '100%',
                          height: '32px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '0 8px',
                          fontSize: '12.5px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>Email</label>
                      <input
                        type="email"
                        placeholder="admin@school.com"
                        value={newAdminForm.email}
                        onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                        style={{
                          width: '100%',
                          height: '32px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '0 8px',
                          fontSize: '12.5px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>Phone</label>
                      <input
                        type="text"
                        placeholder="+91 98765 43210"
                        value={newAdminForm.phone}
                        onChange={(e) => setNewAdminForm({ ...newAdminForm, phone: e.target.value })}
                        style={{
                          width: '100%',
                          height: '32px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '0 8px',
                          fontSize: '12.5px',
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddAdminForm(false)}
                      className="saas-btn saas-btn-secondary saas-btn-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingAdmin}
                      className="saas-btn saas-btn-primary saas-btn-sm"
                    >
                      {creatingAdmin ? 'Creating...' : 'Create Account'}
                    </button>
                  </div>
                </form>
              )}

              {/* Super Admins List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {superAdmins.map((admin) => (
                  <div
                    key={admin.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '6px',
                          background: '#eff6ff',
                          color: '#2563eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '14px',
                        }}
                      >
                        {admin.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                          {admin.username}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          {admin.email || 'No email registered'} {admin.phone ? `• ${admin.phone}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: admin.is_active ? '#dcfce7' : '#fee2e2',
                          color: admin.is_active ? '#15803d' : '#b91c1c',
                        }}
                      >
                        {admin.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                ))}
                {superAdmins.length === 0 && !loadingAdmins && (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '13px' }}>
                    No Super Admin accounts linked to this subscription yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CHANGE TIER & BILLING */}
          {activeTab === 'tier_billing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Tier Cards Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                  Select Subscription Tier
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    {
                      id: 'lite',
                      name: 'CardFlow Starter',
                      setup: '₹4,999 One-Time',
                      price: '₹499/mo',
                      cards: '10k base cards',
                      orgs: '100 orgs',
                      desc: 'Primary domain & shared standard app',
                      color: '#10b981',
                      defaultMax: 10000,
                      defaultOrgs: 100,
                    },
                    {
                      id: 'pro',
                      name: 'CardFlow Professional',
                      setup: '₹7,499 One-Time',
                      price: '₹499/mo',
                      cards: '10k base cards',
                      orgs: '500 orgs',
                      desc: '5-Template Static Website (10 req/yr) & Branded App',
                      color: '#2563eb',
                      defaultMax: 10000,
                      defaultOrgs: 500,
                    },
                    {
                      id: 'max',
                      name: 'CardFlow Enterprise',
                      setup: '₹9,999 One-Time',
                      price: '₹499/mo',
                      cards: '10k base cards',
                      orgs: '2,000 orgs',
                      desc: 'Bespoke Dynamic Website + CMS & Custom Animated App',
                      color: '#8b5cf6',
                      defaultMax: 10000,
                      defaultOrgs: 2000,
                    },
                  ].map((t) => {
                    const isSelected = formData.tier === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setFormData({
                            ...formData,
                            tier: t.id,
                            max_cards: t.defaultMax,
                            max_organisations: t.defaultOrgs,
                          });
                          setPaymentForm((prev) => ({
                            ...prev,
                            amount: 499,
                            notes: `Tier switch to ${t.name}`,
                          }));
                        }}
                        style={{
                          border: isSelected ? `2px solid ${t.color}` : '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '14px',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(37, 99, 235, 0.04)' : '#ffffff',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: 700, color: isSelected ? t.color : '#0f172a' }}>
                            {t.name}
                          </span>
                          {isSelected && <CheckCircle2 size={16} color={t.color} />}
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>
                          {t.setup}
                        </div>
                        <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
                          + 2 Mos Free • {t.price}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.3 }}>
                          {t.cards} • {t.orgs}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#475569', marginTop: '3px' }}>
                          {t.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quota Limits Overrides */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Card Production Limit (Quota)
                  </label>
                  <input
                    type="number"
                    value={formData.max_cards}
                    onChange={(e) => setFormData({ ...formData, max_cards: e.target.value })}
                    style={{
                      width: '100%',
                      height: '36px',
                      padding: '0 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Organisations Quota
                  </label>
                  <input
                    type="text"
                    value="Unlimited"
                    disabled
                    style={{
                      width: '100%',
                      height: '36px',
                      padding: '0 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      background: '#f1f5f9',
                      color: '#16a34a',
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              {/* Payment Settlement Recording Option */}
              <div
                style={{
                  background: '#f8fafc',
                  border: recordPayment ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      Record Payment for this Tier Change / Settlement
                    </span>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                      Automatically inserts a verified ledger entry in the Billing ledger.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={recordPayment}
                    onChange={(e) => setRecordPayment(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                {recordPayment && (
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>Amount (₹)</label>
                        <input
                          type="number"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                          style={{
                            width: '100%',
                            height: '32px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '0 8px',
                            fontSize: '13px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>Payment Method</label>
                        <select
                          value={paymentForm.method}
                          onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                          style={{
                            width: '100%',
                            height: '32px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '0 8px',
                            fontSize: '13px',
                            background: '#fff',
                            boxSizing: 'border-box',
                          }}
                        >
                          <option value="bank_transfer">Bank Transfer (NEFT/RTGS)</option>
                          <option value="upi">UPI / QR Code</option>
                          <option value="razorpay">Razorpay Gateway</option>
                          <option value="cash">Direct Cash / Office</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>
                          Reference / UTR / Tx ID
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. UTR-982183182"
                          value={paymentForm.reference_number}
                          onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                          style={{
                            width: '100%',
                            height: '32px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '0 8px',
                            fontSize: '12.5px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>Verification</label>
                        <select
                          value={paymentForm.is_verified ? 'verified' : 'pending'}
                          onChange={(e) => setPaymentForm({ ...paymentForm, is_verified: e.target.value === 'verified' })}
                          style={{
                            width: '100%',
                            height: '32px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '0 8px',
                            fontSize: '13px',
                            background: '#fff',
                            boxSizing: 'border-box',
                          }}
                        >
                          <option value="verified">Verified (Mark Paid)</option>
                          <option value="pending">Pending Verification</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Installment Plan details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Billing Structure
                  </label>
                  <select
                    value={formData.billing_plan}
                    onChange={(e) => setFormData({ ...formData, billing_plan: e.target.value })}
                    style={{
                      width: '100%',
                      height: '36px',
                      padding: '0 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13px',
                      background: '#fff',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="split">2-Step Split Plan (Setup + 10 Mos)</option>
                    <option value="one_time">One-Go Full Year Upfront</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Installments Settled
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      min={0}
                      max={12}
                      value={formData.installments_paid}
                      onChange={(e) => setFormData({ ...formData, installments_paid: e.target.value })}
                      style={{
                        width: '80px',
                        height: '36px',
                        padding: '0 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <span style={{ fontSize: '13px', color: '#64748b' }}>of {formData.installments_total} total</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: THEME & LOGO BRANDING */}
          {activeTab === 'branding' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  White-Label Brand Name
                </label>
                <input
                  type="text"
                  value={formData.brand_name}
                  onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                  placeholder="e.g. ApexID, SchoolFlow"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', display: 'block' }}>
                  Replaces 'CardFlow' across navigation and headers for this tenant.
                </span>
              </div>

              {/* Brand Logo URL & Preview */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Custom Logo URL
                </label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={formData.brand_logo_url}
                    onChange={(e) => setFormData({ ...formData, brand_logo_url: e.target.value })}
                    placeholder="https://example.com/logo.png"
                    style={{
                      flex: 1,
                      height: '36px',
                      padding: '0 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                  {formData.brand_logo_url && (
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={formData.brand_logo_url}
                        alt="Logo Preview"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Theme Colors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Panel Primary Color
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="color"
                      value={formData.panel_color_theme}
                      onChange={(e) => setFormData({ ...formData, panel_color_theme: e.target.value })}
                      style={{ width: '40px', height: '36px', border: 'none', background: 'none', cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={formData.panel_color_theme}
                      onChange={(e) => setFormData({ ...formData, panel_color_theme: e.target.value })}
                      style={{
                        flex: 1,
                        height: '36px',
                        padding: '0 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Panel Accent Color
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="color"
                      value={formData.panel_accent_theme}
                      onChange={(e) => setFormData({ ...formData, panel_accent_theme: e.target.value })}
                      style={{ width: '40px', height: '36px', border: 'none', background: 'none', cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={formData.panel_accent_theme}
                      onChange={(e) => setFormData({ ...formData, panel_accent_theme: e.target.value })}
                      style={{
                        flex: 1,
                        height: '36px',
                        padding: '0 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: CUSTOM DOMAINS & SUBDOMAINS */}
          {activeTab === 'domains' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                Tenant Domain Architecture &amp; SSL Configuration
              </div>

              {/* 1. Primary Subdomain Card */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                    Standard Cloud Subdomain
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', marginTop: '4px' }}>
                    https://{subscription.slug}.cardflow.io
                  </div>
                  <div style={{ fontSize: '12px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                    <CheckCircle2 size={13} /> Active &amp; SSL Secured
                  </div>
                </div>

                <a
                  href={`https://${subscription.slug}.cardflow.io`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="saas-btn saas-btn-secondary saas-btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={13} /> Open Domain
                </a>
              </div>

              {/* 2. Custom Domain Setup */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  Custom White-Label Domain
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Custom Fully-Qualified Domain (FQDN)
                    </label>
                    <input
                      type="text"
                      value={formData.custom_domain}
                      onChange={(e) => setFormData({ ...formData, custom_domain: e.target.value })}
                      placeholder="e.g. cards.institution.edu"
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      Enter your branded institutional domain name.
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Custom Subdomain Override
                    </label>
                    <input
                      type="text"
                      value={formData.custom_subdomain}
                      onChange={(e) => setFormData({ ...formData, custom_subdomain: e.target.value })}
                      placeholder="e.g. portal"
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      Slug override for client portal routing.
                    </span>
                  </div>
                </div>

                {/* DNS Instructions Box */}
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    DNS Setup Instructions (Add this record in your domain registrar):
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 140px 1fr 80px', gap: '8px', fontSize: '11.5px', fontFamily: 'monospace', color: '#475569' }}>
                    <div><strong>Type:</strong> CNAME</div>
                    <div><strong>Host:</strong> {formData.custom_domain ? formData.custom_domain.split('.')[0] : 'cards'}</div>
                    <div><strong>Target:</strong> cname.cardflow.io</div>
                    <div><strong>TTL:</strong> 300s</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MOBILE COMPANION APP */}
          {activeTab === 'mobile_app' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                Field Photo Capture &amp; Mobile Companion App
              </div>

              {/* Status Header Banner */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: formData.custom_app_requested ? '#eff6ff' : '#f8fafc',
                      color: formData.custom_app_requested ? '#2563eb' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Smartphone size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                      {formData.app_name || subscription.name || 'CardFlow'} Mobile
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {formData.custom_app_requested ? 'Custom Dedicated Android Build' : 'Standard CardFlow APK'} • Version {formData.app_version || '1.1.00'}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: formData.mobile_app_enabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: formData.mobile_app_enabled ? '#16a34a' : '#ef4444',
                    border: formData.mobile_app_enabled ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {formData.mobile_app_enabled ? 'Mobile Access Enabled' : 'Access Disabled'}
                </span>
              </div>

              {/* App Configuration Settings */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      Enable Mobile Companion App
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Allow staff, photographers, and operators to ingest live camera photos via Android companion.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.mobile_app_enabled}
                    onChange={(e) => setFormData({ ...formData, mobile_app_enabled: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      Custom Branded Build (On-Demand / Choice)
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      White-label Android APK with dedicated app icon, splash screen, and package namespace.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.custom_app_requested}
                    onChange={(e) => setFormData({ ...formData, custom_app_requested: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      App Display Name
                    </label>
                    <input
                      type="text"
                      value={formData.app_name}
                      onChange={(e) => setFormData({ ...formData, app_name: e.target.value })}
                      placeholder="e.g. Apex Card Companion"
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Android Package Identifier
                    </label>
                    <input
                      type="text"
                      value={formData.package_name}
                      onChange={(e) => setFormData({ ...formData, package_name: e.target.value })}
                      placeholder="e.g. com.cardflow.apex"
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 10px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: FEATURE TOGGLES & ADD-ONS */}
          {activeTab === 'features' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                Paid Add-On Engines &amp; Feature Overrides
              </div>

              {/* 1. Auto Print Engine */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '6px',
                      background: '#f0fdf4',
                      color: '#16a34a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Printer size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                      Auto Print Direct Engine (₹499 / 10k)
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Enables 1-click direct thermal batch spooling without PDF downloading.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="number"
                    placeholder="Credits"
                    title="Allocated Credits"
                    value={formData.auto_print_credits}
                    onChange={(e) => setFormData({ ...formData, auto_print_credits: e.target.value })}
                    style={{ width: '75px', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px' }}
                  />
                  <input
                    type="checkbox"
                    checked={formData.auto_print_active}
                    onChange={(e) => setFormData({ ...formData, auto_print_active: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* 2. Auto Type Engine */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '6px',
                      background: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileText size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                      Auto Type OCR Engine (₹2,499 / 10k)
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Automated table ingestion from scanned registers, PDFs, and paper forms.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="number"
                    placeholder="Credits"
                    title="Allocated Credits"
                    value={formData.auto_type_credits}
                    onChange={(e) => setFormData({ ...formData, auto_type_credits: e.target.value })}
                    style={{ width: '75px', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px' }}
                  />
                  <input
                    type="checkbox"
                    checked={formData.auto_type_active}
                    onChange={(e) => setFormData({ ...formData, auto_type_active: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* 3. Auto Edit Engine */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '6px',
                      background: '#fdf4ff',
                      color: '#c026d3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                      Auto Edit AI Enhancer (₹1,499 / 10k)
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Automatic face cropping, lighting balance, and background removal.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="number"
                    placeholder="Credits"
                    title="Allocated Credits"
                    value={formData.auto_edit_credits}
                    onChange={(e) => setFormData({ ...formData, auto_edit_credits: e.target.value })}
                    style={{ width: '75px', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px' }}
                  />
                  <input
                    type="checkbox"
                    checked={formData.auto_edit_active}
                    onChange={(e) => setFormData({ ...formData, auto_edit_active: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Fixed Bottom Action Footer */}
        <div
          style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Changes will take effect across the platform immediately.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="saas-btn saas-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="saas-btn saas-btn-primary"
            >
              {saving ? 'Saving Changes...' : 'Save & Update Tenant'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
