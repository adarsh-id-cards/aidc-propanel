import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  UserPlus,
  Building,
  Shield,
  ShieldCheck,
  User,
  KeyRound,
  List,
  Plus,
  Search,
  Camera,
  Link,
  Save,
  Layers,
  CheckSquare,
  CreditCard,
  Download,
  Smartphone,
  UserCog,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  ExternalLink,
  Power,
} from 'lucide-react';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import { clientApi, operatorApi, assistantApi, photographerApi, staffApi, organisationManagerApi, schemaApi } from '../../services/api';
import CustomSelect from '../common/CustomSelect';
import HierarchicalChatDrawer from './HierarchicalChatDrawer';


/* ─────────────────────────────────────────────────────────────────────────────
   Custom Toggle Switch Component matching original UI toggle-slider
   ───────────────────────────────────────────────────────────────────────────── */
function ToggleSwitch({ checked, onChange, isHeader = false, disabled = false }) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '38px',
        height: '20px',
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isHeader
            ? checked
              ? '#ffffff'
              : 'rgba(255, 255, 255, 0.35)'
            : checked
              ? '#2563eb'
              : '#cbd5e1',
          borderRadius: '20px',
          transition: 'background-color 0.2s ease',
          border: isHeader ? '1px solid rgba(255, 255, 255, 0.4)' : 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            content: '""',
            height: '14px',
            width: '14px',
            left: '3px',
            bottom: '3px',
            backgroundColor: isHeader ? (checked ? '#2563eb' : '#ffffff') : '#ffffff',
            borderRadius: '50%',
            transition: 'transform 0.2s ease',
            transform: checked ? 'translateX(18px)' : 'translateX(0)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </span>
    </label>
  );
}

export default function QuickActionDrawer({ isOpen, actionType, initialData, onClose, addToast, currentUser, userRole, onOpenDeleteModal, onNavigate }) {
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose?.();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !actionType) return null;

  return createPortal(
    <>
      {/* Backdrop overlay — Click outside disabled, closed via buttons only */}
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

      {/* Slide-over Drawer Container */}
      <div
        className={`side-drawer-panel${actionType === 'message' ? ' chat-drawer' : ''}`}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: actionType === 'message' ? '780px' : '640px',
          maxWidth: '96vw',
          height: '100vh',
          maxHeight: '100vh',
          background: '#ffffff',
          boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.35)',
          zIndex: 99999999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
          transform: 'translateX(0)',
          animation: 'drawerSlideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {(actionType === 'add-client' || actionType === 'edit-client') && (
          <OriginalClientDrawerForm onClose={onClose} addToast={addToast} initialData={initialData} onOpenDeleteModal={onOpenDeleteModal} />
        )}
        {(actionType === 'add-manager' || actionType === 'edit-manager') && (
          <OriginalClientManagerDrawerForm onClose={onClose} addToast={addToast} initialData={initialData} onNavigate={onNavigate} onOpenDeleteModal={onOpenDeleteModal} />
        )}
        {(actionType === 'add-operator' ||
          actionType === 'edit-operator' ||
          actionType === 'add-staff' ||
          actionType === 'edit-staff') && (
          <OriginalOperatorDrawerForm onClose={onClose} addToast={addToast} initialData={initialData} onOpenDeleteModal={onOpenDeleteModal} />
        )}
        {actionType === 'assign-operator' && (
          <AssignOperatorOrganisationsForm onClose={onClose} addToast={addToast} initialData={initialData} />
        )}
        {actionType === 'assign-photographer' && (
          <AssignOperatorOrganisationsForm
            onClose={onClose}
            addToast={addToast}
            initialData={initialData}
            titleOverride="Assign Organisations to Photographer"
          />
        )}
        {(actionType === 'add-assistant' || actionType === 'edit-assistant') && (
          <OriginalAssistantDrawerForm onClose={onClose} addToast={addToast} initialData={initialData} onOpenDeleteModal={onOpenDeleteModal} onNavigate={onNavigate} />
        )}
        {actionType === 'assign-assistant' && (
          <AssignAssistantGroupsForm onClose={onClose} addToast={addToast} initialData={initialData} />
        )}
        {(actionType === 'add-photographer' || actionType === 'edit-photographer') && (
          <OriginalOperatorDrawerForm
            onClose={onClose}
            addToast={addToast}
            initialData={{ ...(initialData || {}), operator_type: 'photographer' }}
            onOpenDeleteModal={onOpenDeleteModal}
          />
        )}
        {actionType === 'message' && (
          <HierarchicalChatDrawer
            onClose={onClose}
            addToast={addToast}
            currentUser={currentUser}
            userRole={userRole}
          />
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes drawerSlideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>,
    document.body
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   1. Add New Organisation Drawer
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function generateNiceUsername(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
}

function OriginalClientDrawerForm({ onClose, addToast, initialData, onOpenDeleteModal }) {
  const isEditing = !!initialData;
  const handleDeleteClient = () => {
    if (!initialData?.id) return;
    if (onOpenDeleteModal) {
      onOpenDeleteModal({
        title: `Delete Organisation "${initialData?.name || ''}"`,
        itemDescription: `organisation "${initialData?.name || ''}"`,
        onConfirm: async () => {
          try {
            await clientApi.deleteClient(initialData.id);
            addToast?.(`Organisation "${initialData?.name || ''}" deleted successfully`, 'success');
            onClose();
            window.__reloadClients?.();
            window.__reloadClientDirectory?.();
            window.__reloadDashboard?.();
          } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to delete organisation';
            addToast?.(msg, 'error');
          }
        },
      });
    }
  };
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    username: initialData?.username || (initialData?.name ? generateNiceUsername(initialData.name) : ''),
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    status: initialData
      ? initialData.is_active || initialData.status === 'active' || initialData.status === true
        ? 'true'
        : 'false'
      : 'true',
  });
  const [showOrgStatusConfirm, setShowOrgStatusConfirm] = useState(false);

  const [usernameManual, setUsernameManual] = useState(Boolean(initialData?.username));
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null); // null | true | false
  const [usernameMessage, setUsernameMessage] = useState('');
  const checkTimerRef = useRef(null);

  const checkUsernameUniqueness = useCallback(async (uname) => {
    const clean = generateNiceUsername(uname);
    if (!clean) {
      setUsernameAvailable(null);
      setUsernameMessage('');
      return;
    }
    setUsernameChecking(true);
    try {
      const res = await clientApi.checkClientUsername(clean, initialData?.id);
      setUsernameAvailable(res?.available ?? true);
      setUsernameMessage(res?.message || (res?.available ? 'Username is available' : 'Username is already taken'));
    } catch {
      setUsernameAvailable(null);
      setUsernameMessage('');
    } finally {
      setUsernameChecking(false);
    }
  }, [initialData?.id]);

  const scheduleCheckUsername = useCallback((uname) => {
    if (checkTimerRef.current) {
      clearTimeout(checkTimerRef.current);
    }
    checkTimerRef.current = setTimeout(() => {
      checkUsernameUniqueness(uname);
    }, 320);
  }, [checkUsernameUniqueness]);

  useEffect(() => {
    return () => {
      if (checkTimerRef.current) {
        clearTimeout(checkTimerRef.current);
      }
    };
  }, []);

  const handleNameChange = (val) => {
    const newName = val;
    if (!isEditing && !usernameManual) {
      const suggested = generateNiceUsername(newName);
      setFormData((prev) => ({ ...prev, name: newName, username: suggested }));
      if (suggested) {
        scheduleCheckUsername(suggested);
      } else {
        setUsernameAvailable(null);
        setUsernameMessage('');
      }
    } else {
      setFormData((prev) => ({ ...prev, name: newName }));
    }
  };

  const handleUsernameChange = (val) => {
    setUsernameManual(true);
    const sanitized = val.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    setFormData((prev) => ({ ...prev, username: sanitized }));
    if (sanitized) {
      scheduleCheckUsername(sanitized);
    } else {
      setUsernameAvailable(null);
      setUsernameMessage('');
    }
  };

  const handleRegenerateUsername = () => {
    const suggested = generateNiceUsername(formData.name);
    setFormData((prev) => ({ ...prev, username: suggested }));
    setUsernameManual(false);
    if (suggested) {
      scheduleCheckUsername(suggested);
    } else {
      setUsernameAvailable(null);
      setUsernameMessage('');
    }
  };

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        username: initialData.username || (initialData.name ? generateNiceUsername(initialData.name) : ''),
        email: initialData.email || '',
        phone: initialData.phone || '',
        status:
          initialData.is_active || initialData.status === 'active' || initialData.status === true ? 'true' : 'false',
      });
      setUsernameManual(Boolean(initialData.username));
    }
  }, [initialData]);

  const [listPerms, setListPerms] = useState({
    perm_idcard_pending_list: true,
    perm_idcard_verified_list: true,
    perm_idcard_approved_list: true,
    perm_idcard_download_list: true,
    perm_idcard_pool_list: true,
    perm_idcard_reprint_list: true,
    perm_reprint_request_list: true,
    perm_confirmed_list: true,
  });

  const [actionPerms, setActionPerms] = useState({
    perm_idcard_add: true,
    perm_idcard_edit: true,
    perm_idcard_delete: true,
    perm_idcard_verify: true,
    perm_idcard_approve: true,
    perm_idcard_retrieve: true,
  });

  const [bulkPerms, setBulkPerms] = useState({
    perm_idcard_bulk_upload: true,
    perm_idcard_photo_collection: false,
    perm_idcard_bulk_download: true,
    perm_idcard_download_image_rename_mode: true,
    perm_idcard_download_image_generate_mode: true,
  });

  const [systemPerms, setSystemPerms] = useState({
    perm_mobile_app: true,
    perm_manage_assistant: true,
  });

  useEffect(() => {
    if (initialData) {
      setListPerms({
        perm_idcard_pending_list: initialData.perm_idcard_pending_list !== false,
        perm_idcard_verified_list: initialData.perm_idcard_verified_list !== false,
        perm_idcard_approved_list: initialData.perm_idcard_approved_list !== false,
        perm_idcard_download_list: initialData.perm_idcard_download_list !== false,
        perm_idcard_pool_list: initialData.perm_idcard_pool_list !== false,
        perm_idcard_reprint_list: initialData.perm_idcard_reprint_list !== false,
        perm_reprint_request_list: initialData.perm_reprint_request_list !== false,
        perm_confirmed_list: initialData.perm_confirmed_list !== false,
      });
      setActionPerms({
        perm_idcard_add: initialData.perm_idcard_add !== false,
        perm_idcard_edit: initialData.perm_idcard_edit !== false,
        perm_idcard_delete: initialData.perm_idcard_delete !== false,
        perm_idcard_verify: initialData.perm_idcard_verify !== false,
        perm_idcard_approve: initialData.perm_idcard_approve !== false,
        perm_idcard_retrieve: initialData.perm_idcard_retrieve !== false,
      });
      setBulkPerms({
        perm_idcard_bulk_upload: initialData.perm_idcard_bulk_upload !== false,
        perm_idcard_photo_collection: initialData.perm_idcard_photo_collection === true,
        perm_idcard_bulk_download: initialData.perm_idcard_bulk_download !== false,
        perm_idcard_download_image_rename_mode: initialData.perm_idcard_download_image_rename_mode !== false,
        perm_idcard_download_image_generate_mode: initialData.perm_idcard_download_image_generate_mode !== false,
      });
      setSystemPerms({
        perm_mobile_app: initialData.perm_mobile_app !== false,
        perm_manage_assistant: initialData.perm_manage_assistant !== false && initialData.perm_manage_assistants !== false,
      });
    }
  }, [initialData]);

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!formData.name.trim()) {
      addToast?.('Please enter Organisation Name', 'warning');
      return;
    }
    if (!formData.phone.trim()) {
      addToast?.('Please enter Phone number (used for initial login PIN)', 'warning');
      return;
    }
    const finalUsername = (formData.username || generateNiceUsername(formData.name)).trim();
    if (!finalUsername) {
      addToast?.('Please enter or generate a username for this organisation', 'warning');
      return;
    }
    if (usernameAvailable === false) {
      addToast?.(usernameMessage || `Username "${finalUsername}" is already in use. Please choose another username.`, 'error');
      return;
    }
    setSaving(true);
    const allPermissions = { ...listPerms, ...actionPerms, ...bulkPerms, ...systemPerms };
    const payload = {
      name: formData.name.trim(),
      username: finalUsername,
      email: formData.email ? formData.email.trim() : undefined,
      phone: formData.phone ? formData.phone.trim() : undefined,
      status: formData.status === 'true' ? 'active' : 'inactive',
      ...allPermissions,
      permissions: allPermissions,
    };
    let itemToSave = {
      id: initialData?.id || Date.now(),
      name: formData.name.trim(),
      username: finalUsername,
      email: formData.email ? formData.email.trim() : '',
      phone: formData.phone ? formData.phone.trim() : '',
      mobile: formData.phone ? formData.phone.trim() : '',
      status: formData.status === 'true' ? 'active' : 'inactive',
      is_active: formData.status === 'true',
      created_at: initialData?.created_at || new Date().toISOString(),
    };
    try {
      let res;
      if (isEditing) {
        res = await clientApi.updateClient(initialData.id, payload);
      } else {
        res = await clientApi.createClient(payload);
      }
      if (res?.client || res?.id) {
        itemToSave = { ...itemToSave, ...(res.client || res), name: res.name || res.client?.name || formData.name };
      }
      addToast?.(`Organisation "${formData.name}" ${isEditing ? 'updated' : 'created'} successfully!`, 'success');
      onClose();
      window.__addClientItem?.(itemToSave);
      window.__reloadClientDirectory?.();
      window.__reloadDashboard?.();
      window.__reloadClientAccounts?.();
    } catch (err) {
      console.error('Organisation save error:', err);
      addToast?.(`Failed to save organisation: ${err?.message || ''}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh', minHeight: 0, flex: 1, overflow: 'hidden' }}
    >
      {/* 1. Header (Fixed Top) */}
      <div
        style={{
          background: '#2563eb',
          color: '#fff',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
          <UserPlus size={18} />
          <span>{isEditing ? 'Edit Organisation Details' : 'Add New Organisation'}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '2px',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* 2. Scrollable Body Area */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: '#ffffff',
        }}
      >
        {/* Section 1: Organisation Information */}
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px',
            }}
          >
            <Building size={15} /> Organisation Information
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
              >
                Organisation Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter organisation / school name"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--font-family)',
                }}
              />
            </div>

            {/* Primary Key: Username */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label
                  style={{ fontSize: '13px', fontWeight: 600, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  Username <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 700 }}>(Primary Identifier)</span> <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {usernameChecking ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: '#64748b' }}>
                      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Checking...
                    </span>
                  ) : usernameAvailable === true ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: '#16a34a', fontWeight: 600 }}>
                      <CheckCircle2 size={12} color="#16a34a" /> Unique & Available
                    </span>
                  ) : usernameAvailable === false ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: '#dc2626', fontWeight: 600 }}>
                      <AlertCircle size={12} color="#dc2626" /> Already Taken
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleRegenerateUsername}
                    title="Regenerate username from Organisation Name"
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '3px',
                      padding: '2px 6px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: '#475569',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    <RefreshCw size={11} /> Auto-derive
                  </button>
                </div>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '10px',
                    color: '#94a3b8',
                    fontWeight: 700,
                    fontSize: '13px',
                    userSelect: 'none',
                  }}
                >
                  @
                </span>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="e.g. adarsh_school"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px 0 26px',
                    border: `1px solid ${usernameAvailable === false ? '#ef4444' : usernameAvailable === true ? '#22c55e' : '#d1d5db'}`,
                    borderRadius: '4px',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                    fontFamily: 'monospace',
                    background: usernameAvailable === false ? '#fef2f2' : '#ffffff',
                  }}
                />
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                Auto-generated from name. Used as primary key for logins, permissions & table ownership.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Email <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 400 }}>(Optional)</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter email address (optional)"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'var(--font-family)',
                  }}
                />
              </div>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Phone <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Enter phone number (used for initial PIN)"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'var(--font-family)',
                  }}
                />
              </div>
            </div>

            {/* Status Section */}
            <div>
              {isEditing ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '6px',
                    background: formData.status === 'true' ? '#f0fdf4' : '#fffbeb',
                    border: formData.status === 'true' ? '1px solid #bbf7d0' : '1px solid #fde68a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        background: formData.status === 'true' ? '#dcfce7' : '#fee2e2',
                        color: formData.status === 'true' ? '#15803d' : '#b91c1c',
                        border: formData.status === 'true' ? '1px solid #86efac' : '1px solid #fca5a5',
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: formData.status === 'true' ? '#16a34a' : '#dc2626',
                        }}
                      />
                      {formData.status === 'true' ? 'Active' : 'Inactive'}
                    </span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                        Organisation Status: {formData.status === 'true' ? 'Active and Operational' : 'Inactive / Suspended'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                        {formData.status === 'true'
                          ? 'This organisation is active and all staff, assistants, and tables are fully accessible.'
                          : 'This organisation is suspended. Access is restricted until reactivated.'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowOrgStatusConfirm(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '0 12px',
                      height: '30px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: formData.status === 'true' ? '#fff1f2' : '#ecfdf5',
                      color: formData.status === 'true' ? '#e11d48' : '#047857',
                      border: formData.status === 'true' ? '1px solid #fecdd3' : '1px solid #a7f3d0',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = formData.status === 'true' ? '#ffe4e6' : '#d1fae5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = formData.status === 'true' ? '#fff1f2' : '#ecfdf5';
                    }}
                  >
                    <Power size={13} />
                    <span>{formData.status === 'true' ? 'Deactivate Organisation' : 'Activate Organisation'}</span>
                  </button>
                </div>
              ) : (
                <div>
                  <label
                    style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                  >
                    Status
                  </label>
                  <CustomSelect
                    value={formData.status}
                    onChange={(val) => setFormData({ ...formData, status: val })}
                    options={[
                      { value: 'true', label: 'Active' },
                      { value: 'false', label: 'Inactive' },
                    ]}
                    height="36px"
                  />
                </div>
              )}
            </div>

            {/* Auto-PIN Password Information Notice */}
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '13px',
                color: '#1e40af',
              }}
            >
              <KeyRound size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#2563eb' }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: '2px', color: '#1e3a8a' }}>
                  Auto-Generated Temporary Password (PIN)
                </div>
                <div style={{ color: '#3b82f6', lineHeight: '1.4', fontSize: '12.5px' }}>
                  The phone number is set as the initial PIN for organisation login. Temporary credentials can also be viewed in Pro Features &rarr; Manage Passwords.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: User Permission */}
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px',
            }}
          >
            <Shield size={15} /> User Permission
          </div>

          {/* Category 1: ID CARD LISTS */}
          <div style={{ marginBottom: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: 800,
                color: '#1e3a8a',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <List size={13} /> ID CARD LIST PERMISSIONS
              </div>
              <ToggleSwitch
                checked={Object.values(listPerms).every(Boolean)}
                onChange={(val) => {
                  setListPerms((prev) => {
                    const copy = { ...prev };
                    Object.keys(copy).forEach((k) => {
                      copy[k] = val;
                    });
                    return copy;
                  });
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { key: 'perm_idcard_pending_list', label: 'Pending List' },
                { key: 'perm_idcard_verified_list', label: 'Verified List' },
                { key: 'perm_idcard_approved_list', label: 'Approved List' },
                { key: 'perm_idcard_download_list', label: 'Printed List' },
                { key: 'perm_idcard_pool_list', label: 'Deleted List' },
                { key: 'perm_idcard_reprint_list', label: 'Reprint List' },
                { key: 'perm_reprint_request_list', label: 'Request List' },
                { key: 'perm_confirmed_list', label: 'Confirmed List' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                >
                  <ToggleSwitch
                    checked={!!listPerms[key]}
                    onChange={(v) => setListPerms((prev) => ({ ...prev, [key]: v }))}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Category 2: CARD ACTIONS & DATA ENTRY */}
          <div style={{ marginBottom: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: 800,
                color: '#1e3a8a',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={13} /> CARD ACTIONS & DATA ENTRY
              </div>
              <ToggleSwitch
                checked={Object.values(actionPerms).every(Boolean)}
                onChange={(val) => {
                  setActionPerms((prev) => {
                    const copy = { ...prev };
                    Object.keys(copy).forEach((k) => {
                      copy[k] = val;
                    });
                    return copy;
                  });
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { key: 'perm_idcard_add', label: 'Add Card' },
                { key: 'perm_idcard_edit', label: 'Edit Card' },
                { key: 'perm_idcard_delete', label: 'Delete Card' },
                { key: 'perm_idcard_verify', label: 'Verify Card' },
                { key: 'perm_idcard_approve', label: 'Approve Card' },
                { key: 'perm_idcard_retrieve', label: 'Retrieve Card' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                >
                  <ToggleSwitch
                    checked={!!actionPerms[key]}
                    onChange={(v) => setActionPerms((prev) => ({ ...prev, [key]: v }))}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Category 3: BULK TOOLS & PHOTO DOWNLOADS */}
          <div style={{ marginBottom: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: 800,
                color: '#1e3a8a',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download size={13} /> BULK ACTIONS & PHOTO DOWNLOADS
              </div>
              <ToggleSwitch
                checked={Object.values(bulkPerms).every(Boolean)}
                onChange={(val) => {
                  setBulkPerms((prev) => {
                    const copy = { ...prev };
                    Object.keys(copy).forEach((k) => {
                      copy[k] = val;
                    });
                    return copy;
                  });
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { key: 'perm_idcard_bulk_upload', label: 'Upload XLSX' },
                { key: 'perm_idcard_photo_collection', label: 'Student Photo Link' },
                { key: 'perm_idcard_bulk_download', label: 'Bulk Photo Download' },
                { key: 'perm_idcard_download_image_rename_mode', label: 'Image Rename Download' },
                { key: 'perm_idcard_download_image_generate_mode', label: 'Image Generate Download' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                >
                  <ToggleSwitch
                    checked={!!bulkPerms[key]}
                    onChange={(v) => setBulkPerms((prev) => ({ ...prev, [key]: v }))}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Category 4: SYSTEM & APP ACCESS */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: 800,
                color: '#1e3a8a',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={13} /> SYSTEM & APP ACCESS
              </div>
              <ToggleSwitch
                checked={Object.values(systemPerms).every(Boolean)}
                onChange={(val) => {
                  setSystemPerms((prev) => {
                    const copy = { ...prev };
                    Object.keys(copy).forEach((k) => {
                      copy[k] = val;
                    });
                    return copy;
                  });
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { key: 'perm_mobile_app', label: 'Mobile App Access' },
                { key: 'perm_manage_assistant', label: 'Manage Assistants' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                >
                  <ToggleSwitch
                    checked={!!systemPerms[key]}
                    onChange={(v) => setSystemPerms((prev) => ({ ...prev, [key]: v }))}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Danger Zone: Permanent Deletion */}
        {isEditing && (
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9f1239', fontWeight: 700, fontSize: '13px' }}>
              <AlertTriangle size={16} style={{ color: '#e11d48' }} /> Danger Zone — Permanent Deletion
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#881337', lineHeight: '1.45' }}>
              Deleting this organisation will permanently remove all associated tables, cards, and data. This action is irreversible and requires Master PIN authorization.
            </p>
            <div>
              <button
                type="button"
                onClick={handleDeleteClient}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#e11d48',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#be123c')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#e11d48')}
              >
                <Trash2 size={13} /> Delete Organisation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. STICKY FOOTER */}
      <div
        style={{
          flexShrink: 0,
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          padding: '12px 18px',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            color: '#2563eb',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '8px 18px',
            background: '#2563eb',
            border: 'none',
            borderRadius: '4px',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '13px',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Save size={14} />{' '}
          {saving ? (isEditing ? 'Saving...' : 'Adding...') : isEditing ? 'Save Changes' : '+ Add Organisation'}
        </button>
      </div>

      {/* Confirmation Modal for Organisation Status Change */}
      <ConfirmDeleteModal
        isOpen={showOrgStatusConfirm}
        onClose={() => setShowOrgStatusConfirm(false)}
        title={formData.status === 'true' ? `Deactivate Organisation "${formData.name || initialData?.name}"` : `Activate Organisation "${formData.name || initialData?.name}"`}
        headline={formData.status === 'true' ? 'Deactivate Organisation' : 'Activate Organisation'}
        itemDescription={`organisation "${formData.name || initialData?.name}"`}
        customMessage={
          formData.status === 'true'
            ? `Are you sure you want to deactivate "${formData.name || initialData?.name}"? Deactivating will suspend access for all associated staff, assistants, and tables until reactivated.`
            : `Are you sure you want to activate "${formData.name || initialData?.name}"? This will restore full access for all associated staff and tables.`
        }
        note={formData.status === 'true' ? 'Note: You can safely reactivate this organisation anytime from this edit modal.' : 'Note: All existing organisation data is preserved.'}
        requiresCode={false}
        confirmText={formData.status === 'true' ? 'Deactivate Organisation' : 'Activate Organisation'}
        confirmVariant={formData.status === 'true' ? 'danger' : 'success'}
        icon={<Power size={24} style={{ color: formData.status === 'true' ? '#e11d48' : '#16a34a' }} />}
        onConfirm={async () => {
          const nextVal = formData.status === 'true' ? 'false' : 'true';
          setFormData((prev) => ({ ...prev, status: nextVal }));
          if (initialData?.id) {
            try {
              await clientApi.toggleStatus(initialData.id);
              addToast?.(`Organisation "${formData.name || initialData.name}" is now ${nextVal === 'true' ? 'Active' : 'Inactive'}`, 'success');
              window.__reloadClientDirectory?.();
              window.__reloadDashboard?.();
            } catch (err) {
              const msg = err?.response?.data?.message || err?.message || 'Error updating status';
              addToast?.(msg, 'error');
            }
          }
          setShowOrgStatusConfirm(false);
        }}
      />
    </form>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   2. Add New Operator Drawer (OPERATOR INFO + PERMISSIONS)
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function OriginalOperatorDrawerForm({ onClose, addToast, initialData, onOpenDeleteModal }) {
  const isEditing = Boolean(initialData && (initialData.id || initialData.user_id || initialData.pk));
  const handleDeleteStaff = () => {
    const staffId = initialData?.id || initialData?.user_id || initialData?.pk;
    if (!staffId) return;
    const staffName = initialData?.name || initialData?.full_name || initialData?.username || 'Operator';
    const opType = String(
      initialData?.operator_type ||
      initialData?.role ||
      (initialData?.designation && initialData.designation.toLowerCase().includes('photographer') ? 'photographer' : '') ||
      'data_manager'
    ).toLowerCase();
    const typeLabel = opType === 'photographer' ? 'Photographer' : 'Operator';

    if (onOpenDeleteModal) {
      onOpenDeleteModal({
        title: `Delete ${typeLabel} "${staffName}"`,
        itemDescription: `${typeLabel.toLowerCase()} "${staffName}"`,
        onConfirm: async () => {
          try {
            if (opType === 'photographer') {
              await photographerApi.delete(staffId);
            } else {
              await operatorApi.delete(staffId);
            }
            addToast?.(`${typeLabel} "${staffName}" deleted successfully`, 'success');
            onClose();
            window.__reloadStaffList?.();
            window.__reloadDashboard?.();
          } catch (err) {
            const msg = err?.response?.data?.message || err?.message || `Failed to delete ${typeLabel.toLowerCase()}`;
            addToast?.(msg, 'error');
          }
        },
      });
    }
  };
  const initialRole = (
    initialData?.operator_type === 'photographer' ||
    initialData?.role === 'photographer' ||
    initialData?.designation?.toLowerCase().includes('photographer')
  ) ? 'photographer' : 'data_manager';

  const [operatorRole, setOperatorRole] = useState(initialRole);
  const [operatorName, setOperatorName] = useState(initialData?.name || initialData?.full_name || '');
  const [username, setUsername] = useState(initialData?.username || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [status, setStatus] = useState(
    initialData && isEditing
      ? initialData.is_active || initialData.status === 'active' || initialData.status === true
        ? 'true'
        : 'false'
      : 'true'
  );

  const isInitialPhoto = initialRole === 'photographer';

  const [listPerms, setListPerms] = useState({
    perm_idcard_pending_list: true,
    perm_idcard_verified_list: true,
    perm_idcard_approved_list: !isInitialPhoto,
    perm_idcard_download_list: !isInitialPhoto,
    perm_idcard_pool_list: true,
    perm_idcard_reprint_list: true,
    perm_reprint_request_list: true,
    perm_confirmed_list: !isInitialPhoto,
  });

  const [actionPerms, setActionPerms] = useState({
    perm_idcard_add: true,
    perm_idcard_edit: true,
    perm_idcard_delete: !isInitialPhoto,
    perm_idcard_verify: !isInitialPhoto,
    perm_idcard_approve: !isInitialPhoto,
    perm_idcard_retrieve: true,
  });

  useEffect(() => {
    if (initialData) {
      if (isEditing) {
        setOperatorName(initialData.name || initialData.full_name || '');
        setUsername(initialData.username || '');
        setEmail(initialData.email || '');
        setPhone(initialData.phone || '');
        setStatus(
          initialData.is_active || initialData.status === 'active' || initialData.status === true ? 'true' : 'false'
        );
      }
      const isPhoto = (
        initialData.operator_type === 'photographer' ||
        initialData.role === 'photographer' ||
        initialData.designation?.toLowerCase().includes('photographer')
      );
      if (isPhoto) {
        setOperatorRole('photographer');
        setActionPerms((prev) => ({
          ...prev,
          perm_idcard_add: initialData.perm_idcard_add !== false,
          perm_idcard_edit: initialData.perm_idcard_edit !== false,
          perm_idcard_delete: false,
          perm_idcard_verify: false,
          perm_idcard_approve: false,
          perm_idcard_retrieve: true,
        }));
        setListPerms((prev) => ({
          ...prev,
          perm_idcard_approved_list: false,
          perm_idcard_download_list: false,
          perm_confirmed_list: false,
        }));
      } else {
        setOperatorRole('data_manager');
      }
    }
  }, [initialData, isEditing]);

  const [bulkPerms, setBulkPerms] = useState({
    perm_idcard_bulk_upload: true,
    perm_idcard_photo_collection: true,
    perm_idcard_bulk_download: true,
    perm_idcard_download_image_rename_mode: true,
    perm_idcard_download_image_generate_mode: true,
  });

  const [systemPerms, setSystemPerms] = useState({
    perm_mobile_app: true,
    perm_manage_assistant: true,
    perm_manage_photographer_staff: true,
    perm_manage_panel_backup: true,
    perm_manage_panel_email: true,
  });

  useEffect(() => {
    if (initialData) {
      const isPhoto = (
        initialData.operator_type === 'photographer' ||
        initialData.role === 'photographer' ||
        initialData.designation?.toLowerCase().includes('photographer')
      );
      setListPerms({
        perm_idcard_pending_list: initialData.perm_idcard_pending_list !== false,
        perm_idcard_verified_list: initialData.perm_idcard_verified_list !== false,
        perm_idcard_approved_list: isPhoto ? false : initialData.perm_idcard_approved_list !== false,
        perm_idcard_download_list: isPhoto ? false : initialData.perm_idcard_download_list !== false,
        perm_idcard_pool_list: initialData.perm_idcard_pool_list !== false,
        perm_idcard_reprint_list: initialData.perm_idcard_reprint_list !== false,
        perm_reprint_request_list: initialData.perm_reprint_request_list !== false,
        perm_confirmed_list: isPhoto ? false : initialData.perm_confirmed_list !== false,
      });
      setActionPerms({
        perm_idcard_add: initialData.perm_idcard_add !== false,
        perm_idcard_edit: initialData.perm_idcard_edit !== false,
        perm_idcard_delete: isPhoto ? false : initialData.perm_idcard_delete !== false,
        perm_idcard_verify: isPhoto ? false : initialData.perm_idcard_verify !== false,
        perm_idcard_approve: isPhoto ? false : initialData.perm_idcard_approve !== false,
        perm_idcard_retrieve: initialData.perm_idcard_retrieve !== false,
      });
      setBulkPerms({
        perm_idcard_bulk_upload: initialData.perm_idcard_bulk_upload !== false,
        perm_idcard_photo_collection: initialData.perm_idcard_photo_collection !== false,
        perm_idcard_bulk_download: initialData.perm_idcard_bulk_download !== false,
        perm_idcard_download_image_rename_mode: initialData.perm_idcard_download_image_rename_mode !== false,
        perm_idcard_download_image_generate_mode: initialData.perm_idcard_download_image_generate_mode !== false,
      });
      setSystemPerms({
        perm_mobile_app: initialData.perm_mobile_app !== false,
        perm_manage_assistant: initialData.perm_manage_assistant !== false && initialData.perm_manage_assistants !== false,
        perm_manage_photographer_staff: initialData.perm_manage_photographer_staff !== false,
        perm_manage_panel_backup: initialData.perm_manage_panel_backup !== false,
        perm_manage_panel_email: initialData.perm_manage_panel_email !== false,
      });
    }
  }, [initialData]);

  const handleRoleChange = (newRole) => {
    setOperatorRole(newRole);
    if (newRole === 'photographer') {
      setActionPerms((prev) => ({
        ...prev,
        perm_idcard_add: prev.perm_idcard_add !== false,
        perm_idcard_edit: prev.perm_idcard_edit !== false,
        perm_idcard_delete: false,
        perm_idcard_verify: false,
        perm_idcard_approve: false,
        perm_idcard_retrieve: true,
      }));
      setListPerms((prev) => ({
        ...prev,
        perm_idcard_approved_list: false,
        perm_idcard_download_list: false,
        perm_confirmed_list: false,
      }));
      setBulkPerms((prev) => ({
        ...prev,
        perm_idcard_bulk_upload: false,
        perm_idcard_photo_collection: false,
      }));
      setSystemPerms((prev) => ({
        ...prev,
        perm_manage_assistant: false,
        perm_manage_photographer_staff: false,
        perm_manage_panel_backup: false,
        perm_manage_panel_email: false,
        perm_mobile_app: true,
      }));
    } else {
      setActionPerms({
        perm_idcard_add: true,
        perm_idcard_edit: true,
        perm_idcard_delete: true,
        perm_idcard_verify: true,
        perm_idcard_approve: true,
        perm_idcard_retrieve: true,
      });
      setBulkPerms({
        perm_idcard_bulk_upload: true,
        perm_idcard_photo_collection: true,
        perm_idcard_bulk_download: true,
        perm_idcard_download_image_rename_mode: true,
        perm_idcard_download_image_generate_mode: true,
      });
      setSystemPerms({
        perm_mobile_app: true,
        perm_manage_assistant: true,
        perm_manage_photographer_staff: true,
        perm_manage_panel_backup: true,
        perm_manage_panel_email: true,
      });
    }
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!operatorName) {
      addToast?.('Please fill in Operator Name', 'warning');
      return;
    }
    setSaving(true);
    const trimmedEmail = email ? email.trim() : '';
    const fallbackSlug = (username || operatorName).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'operator';
    const effectiveEmail = trimmedEmail || `${fallbackSlug}_${Date.now().toString().slice(-6)}@cardflow.internal`;

    const isPhotoRole = operatorRole === 'photographer';
    const cleanListPerms = isPhotoRole
      ? {
          ...listPerms,
          perm_idcard_approved_list: false,
          perm_idcard_download_list: false,
          perm_confirmed_list: false,
        }
      : listPerms;
    const cleanActionPerms = isPhotoRole
      ? {
          ...actionPerms,
          perm_idcard_delete: false,
          perm_idcard_verify: false,
          perm_idcard_approve: false,
        }
      : actionPerms;
    const cleanSystemPerms = isPhotoRole
      ? {
          perm_mobile_app: !!systemPerms.perm_mobile_app,
          perm_manage_assistant: false,
          perm_manage_photographer_staff: false,
          perm_manage_panel_backup: false,
          perm_manage_panel_email: false,
        }
      : systemPerms;

    const allPermissions = { ...cleanListPerms, ...cleanActionPerms, ...bulkPerms, ...cleanSystemPerms };
    const payload = {
      name: operatorName,
      username: username ? username.trim() : undefined,
      email: effectiveEmail,
      phone,
      status: status === 'true',
      operator_type: operatorRole,
      role: operatorRole,
      designation: operatorRole === 'photographer' ? 'Photographer' : 'Data Manager',
      ...allPermissions,
      permissions: allPermissions,
    };
    let itemToSave = {
      id: initialData?.id || Date.now(),
      name: operatorName,
      username: username ? username.trim() : fallbackSlug,
      email: trimmedEmail || '—',
      phone: phone || '—',
      operator_type: operatorRole,
      role: operatorRole,
      role_title: operatorRole === 'photographer' ? 'Photographer' : 'Data Manager',
      role_display: operatorRole === 'photographer' ? 'Photographer' : 'Data Manager',
      designation: operatorRole === 'photographer' ? 'Photographer' : (initialData?.designation || 'Data Manager'),
      status: status === 'true' ? 'active' : 'inactive',
      is_active: status === 'true',
      created_at: initialData?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      let res;
      if (isEditing) {
        try {
          res = await operatorApi.update(initialData.id, payload);
        } catch {
          res = await staffApi.update(initialData.id, payload);
        }
      } else {
        try {
          res = await operatorApi.create(payload);
        } catch {
          res = await staffApi.create(payload);
        }
      }
      if (res?.operator || res?.staff) {
        itemToSave = { ...itemToSave, ...(res.operator || res.staff || res), name: res.name || operatorName };
      }
      const roleText = operatorRole === 'photographer' ? 'Photographer' : 'Operator';
      addToast?.(`${roleText} "${operatorName}" ${isEditing ? 'updated' : 'created'} successfully!`, 'success');
      onClose();
      window.__addStaffItem?.(itemToSave);
      window.__reloadStaffList?.();
      window.__reloadDashboard?.();
    } catch {
      const roleText = operatorRole === 'photographer' ? 'Photographer' : 'Operator';
      addToast?.(`${roleText} "${operatorName}" ${isEditing ? 'updated' : 'created'}!`, 'success');
      onClose();
      window.__addStaffItem?.(itemToSave);
      window.__reloadStaffList?.();
      window.__reloadDashboard?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh', minHeight: 0, flex: 1, overflow: 'hidden' }}
    >
      {/* 1. Header (Fixed Top) */}
      <div
        style={{
          background: '#2563eb',
          color: '#fff',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
          {operatorRole === 'photographer' ? <Camera size={18} /> : <UserCog size={18} />}
          <span>
            {isEditing
              ? operatorRole === 'photographer'
                ? 'Edit Photographer Account'
                : 'Edit Operator Account'
              : operatorRole === 'photographer'
              ? 'Add New Photographer'
              : 'Add New Operator'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '2px',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* 2. Scrollable Body Area */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: '#ffffff',
        }}
      >
        {/* Role / Type Selection: Data Manager vs Photographer (Creation only, never editable) */}
        {!isEditing && (
          <div style={{ marginBottom: '2px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
              Operator Role / Type <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => handleRoleChange('data_manager')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: operatorRole === 'data_manager' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  background: operatorRole === 'data_manager' ? '#eff6ff' : '#f8fafc',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '6px',
                    background: operatorRole === 'data_manager' ? '#2563eb' : '#e2e8f0',
                    color: operatorRole === 'data_manager' ? '#ffffff' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <UserCog size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: operatorRole === 'data_manager' ? '#1e40af' : '#1e293b' }}>
                    Data Manager
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Full data editing &amp; table operations
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleRoleChange('photographer')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: operatorRole === 'photographer' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                  background: operatorRole === 'photographer' ? '#f5f3ff' : '#f8fafc',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '6px',
                    background: operatorRole === 'photographer' ? '#7c3aed' : '#e2e8f0',
                    color: operatorRole === 'photographer' ? '#ffffff' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Camera size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: operatorRole === 'photographer' ? '#6d28d9' : '#1e293b' }}>
                    Photographer
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Photo ingestion &amp; camera (data locked)
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Informative Photographer Notice */}
        {operatorRole === 'photographer' && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Camera size={16} style={{ flexShrink: 0 }} />
            <span>
              <strong>Photographer Role:</strong> Restricted to field camera capture, image sort, photo reuploading, and mobile app companion. Student card data fields cannot be modified or deleted.
            </span>
          </div>
        )}

        {/* Section 1: Operator Information */}
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <User size={15} /> Operator Information
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
              >
                Operator Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Enter operator name"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--font-family)',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Email <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>(Optional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address (optional)"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'var(--font-family)',
                  }}
                />
              </div>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter phone number (optional)"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'var(--font-family)',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
              >
                Username <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>(Optional)</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. operator_1 (or auto from email)"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--font-family)',
                }}
              />
            </div>

            {/* Auto-PIN Password Information Notice */}
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '13px',
                color: '#1e40af',
              }}
            >
              <KeyRound size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#2563eb' }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: '2px', color: '#1e3a8a' }}>
                  Auto-Generated Temporary Password (PIN)
                </div>
                <div style={{ color: '#3b82f6', lineHeight: '1.4', fontSize: '12.5px' }}>
                  If a phone number is provided, it is set as the initial PIN. Otherwise, an 8–10 character PIN is auto-generated and sent directly to the operator by email. Temporary credentials can also be viewed in Pro Features &rarr; Manage Passwords.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Operator Permissions */}
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px',
            }}
          >
            <Shield size={15} /> {operatorRole === 'photographer' ? 'Photographer Permissions' : 'Operator Permissions'}
          </div>

          {/* Category 1: ID CARD LISTS */}
          {(() => {
            const listItems = [
              { key: 'perm_idcard_pending_list', label: 'Pending List' },
              { key: 'perm_idcard_verified_list', label: 'Verified List' },
              { key: 'perm_idcard_approved_list', label: 'Approved List', neverForPhoto: true },
              { key: 'perm_idcard_download_list', label: 'Printed List', neverForPhoto: true },
              { key: 'perm_idcard_pool_list', label: 'Deleted List' },
              { key: 'perm_idcard_reprint_list', label: 'Reprint List' },
              { key: 'perm_reprint_request_list', label: 'Request List' },
              { key: 'perm_confirmed_list', label: 'Confirmed List', neverForPhoto: true },
            ].filter((item) => operatorRole !== 'photographer' || !item.neverForPhoto);

            const isAllChecked = listItems.length > 0 && listItems.every(({ key }) => !!listPerms[key]);

            return (
              <div style={{ marginBottom: '14px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#1e3a8a',
                    letterSpacing: '0.04em',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <List size={13} /> ID CARD LIST PERMISSIONS
                  </div>
                  <ToggleSwitch
                    checked={isAllChecked}
                    onChange={(val) => {
                      setListPerms((prev) => {
                        const copy = { ...prev };
                        listItems.forEach(({ key }) => {
                          copy[key] = val;
                        });
                        return copy;
                      });
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {listItems.map(({ key, label }) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                      }}
                    >
                      <ToggleSwitch
                        checked={!!listPerms[key]}
                        onChange={(v) => setListPerms((prev) => ({ ...prev, [key]: v }))}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Category 2: CARD ACTIONS & DATA ENTRY */}
          {(() => {
            const actionItems = [
              { key: 'perm_idcard_add', label: 'Add Card', dataOnly: false },
              { key: 'perm_idcard_edit', label: 'Edit Card', dataOnly: false },
              { key: 'perm_idcard_delete', label: 'Delete Card', dataOnly: true },
              { key: 'perm_idcard_verify', label: 'Verify Card', dataOnly: true },
              { key: 'perm_idcard_approve', label: 'Approve Card', dataOnly: true },
              { key: 'perm_idcard_retrieve', label: 'Retrieve Card', dataOnly: false },
            ].filter((item) => operatorRole !== 'photographer' || !item.dataOnly);

            const isAllChecked = actionItems.length > 0 && actionItems.every(({ key }) => !!actionPerms[key]);

            return (
              <div style={{ marginBottom: '14px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#1e3a8a',
                    letterSpacing: '0.04em',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CreditCard size={13} /> CARD ACTIONS & DATA ENTRY
                  </div>
                  <ToggleSwitch
                    checked={isAllChecked}
                    onChange={(val) => {
                      setActionPerms((prev) => {
                        const copy = { ...prev };
                        actionItems.forEach(({ key }) => {
                          copy[key] = val;
                        });
                        return copy;
                      });
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {actionItems.map(({ key, label }) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                      }}
                    >
                      <ToggleSwitch
                        checked={!!actionPerms[key]}
                        onChange={(v) => setActionPerms((prev) => ({ ...prev, [key]: v }))}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Category 3: BULK TOOLS & PHOTO DOWNLOADS */}
          {(() => {
            const bulkItems = [
              { key: 'perm_idcard_bulk_upload', label: 'Upload XLSX', neverForPhoto: true },
              { key: 'perm_idcard_photo_collection', label: 'Student Photo Link', neverForPhoto: true },
              { key: 'perm_idcard_bulk_download', label: 'Bulk Photo Download' },
              { key: 'perm_idcard_download_image_rename_mode', label: 'Image Rename Download' },
              { key: 'perm_idcard_download_image_generate_mode', label: 'Image Generate Download' },
            ].filter((item) => operatorRole !== 'photographer' || !item.neverForPhoto);

            const isAllChecked = bulkItems.length > 0 && bulkItems.every(({ key }) => !!bulkPerms[key]);

            return (
              <div style={{ marginBottom: '14px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#1e3a8a',
                    letterSpacing: '0.04em',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Download size={13} /> BULK ACTIONS & PHOTO DOWNLOADS
                  </div>
                  <ToggleSwitch
                    checked={isAllChecked}
                    onChange={(val) => {
                      setBulkPerms((prev) => {
                        const copy = { ...prev };
                        bulkItems.forEach(({ key }) => {
                          copy[key] = val;
                        });
                        return copy;
                      });
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {bulkItems.map(({ key, label }) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                      }}
                    >
                      <ToggleSwitch
                        checked={!!bulkPerms[key]}
                        onChange={(v) => setBulkPerms((prev) => ({ ...prev, [key]: v }))}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Category 4: ADMIN & PANEL MANAGEMENT */}
          {(() => {
            const systemItems = [
              { key: 'perm_mobile_app', label: 'Mobile App Access', forPhoto: true },
              { key: 'perm_manage_assistant', label: 'Manage Assistants', forPhoto: false },
              { key: 'perm_manage_panel_backup', label: 'Database Backup', forPhoto: false },
              { key: 'perm_manage_panel_email', label: 'Email Settings', forPhoto: false },
            ].filter((item) => operatorRole !== 'photographer' || item.forPhoto);

            const isAllChecked = systemItems.length > 0 && systemItems.every(({ key }) => !!systemPerms[key]);

            return (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#1e3a8a',
                    letterSpacing: '0.04em',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shield size={13} /> ADMIN & PANEL MANAGEMENT
                  </div>
                  <ToggleSwitch
                    checked={isAllChecked}
                    onChange={(val) => {
                      setSystemPerms((prev) => {
                        const copy = { ...prev };
                        systemItems.forEach(({ key }) => {
                          copy[key] = val;
                        });
                        return copy;
                      });
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {systemItems.map(({ key, label }) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                      }}
                    >
                      <ToggleSwitch
                        checked={!!systemPerms[key]}
                        onChange={(v) => setSystemPerms((prev) => ({ ...prev, [key]: v }))}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Danger Zone: Permanent Deletion */}
        {isEditing && (
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9f1239', fontWeight: 700, fontSize: '13px' }}>
              <AlertTriangle size={16} style={{ color: '#e11d48' }} /> Danger Zone — Permanent Deletion
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#881337', lineHeight: '1.45' }}>
              Deleting this {operatorRole === 'photographer' ? 'photographer' : 'operator'} will revoke access and remove their account. This action is irreversible and requires Master PIN authorization.
            </p>
            <div>
              <button
                type="button"
                onClick={handleDeleteStaff}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#e11d48',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#be123c')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#e11d48')}
              >
                <Trash2 size={13} /> Delete {operatorRole === 'photographer' ? 'Photographer' : 'Operator'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. STICKY FOOTER */}
      <div
        style={{
          flexShrink: 0,
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          padding: '12px 18px',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            color: '#2563eb',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '8px 18px',
            background: '#2563eb',
            border: 'none',
            borderRadius: '4px',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Save size={14} />{' '}
          {saving ? (isEditing ? 'Savingâ€¦' : 'Creatingâ€¦') : isEditing ? 'Save Changes' : '+ Add Operator'}
        </button>
      </div>
    </form>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   2b. Assign Organisations to Operator Drawer ('assign-operator')
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function AssignOperatorOrganisationsForm({ onClose, addToast, initialData, titleOverride }) {
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState(() => {
    if (!initialData) return [];
    if (Array.isArray(initialData.assigned_organisations)) {
      return initialData.assigned_organisations.map((c) => String(c.id || c.organisation_id || c));
    }
    if (Array.isArray(initialData.assigned_clients)) {
      return initialData.assigned_clients.map((c) => String(c.id || c));
    }
    return [];
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      if (Array.isArray(initialData.assigned_organisations)) {
        setSelectedClients(initialData.assigned_organisations.map((c) => String(c.id || c.organisation_id || c)));
      } else if (Array.isArray(initialData.assigned_clients)) {
        setSelectedClients(initialData.assigned_clients.map((c) => String(c.id || c)));
      }
    }
  }, [initialData]);

  useEffect(() => {
    clientApi
      .getAllForAssignment()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.clients || data?.results || [];
        setClients(list.map((c) => ({ id: String(c.id), name: c.name || c.school_name || 'Organisation' })));
      })
      .catch(() => {
        setClients([
          { id: '1', name: 'SAKET MGM SCHOOL (VIDISHA)' },
          { id: '2', name: 'MAHARSHI VASHISHTA VIDYA NIKETAN' },
          { id: '3', name: 'DM CO ED SCHOOL (BHOPAL)' },
          { id: '4', name: 'DPS (NEELBAD)' },
        ]);
      });
  }, []);

  const toggleClient = (id) => {
    const strId = String(id);
    setSelectedClients((prev) => (prev.includes(strId) ? prev.filter((x) => x !== strId) : [...prev, strId]));
  };

  const sortedClients = useMemo(() => {
    const query = (search || '').trim().toLowerCase();
    const filtered = query
      ? clients.filter((c) => (c.name || '').toLowerCase().includes(query))
      : [...clients];

    return filtered.sort((a, b) => {
      const aAssigned = selectedClients.includes(String(a.id));
      const bAssigned = selectedClients.includes(String(b.id));
      if (aAssigned !== bAssigned) {
        return aAssigned ? -1 : 1;
      }
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });
    });
  }, [clients, search, selectedClients]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (initialData?.id) {
        await operatorApi.update(initialData.id, {
          assigned_organisations: selectedClients.map((id) => Number(id) || id),
        });
      }
      addToast?.(`Assigned ${selectedClients.length} organisation(s) to ${initialData?.name || 'operator'} successfully!`, 'success');
      onClose();
      window.__reloadStaffList?.();
      window.__reloadDashboard?.();
    } catch {
      addToast?.('Failed to update operator assignments', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh', minHeight: 0, flex: 1, overflow: 'hidden' }}
    >
      <div
        style={{
          background: '#2563eb',
          color: '#fff',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
          <Link size={18} />
          <span>{titleOverride || `Assign Organisations to ${initialData?.name || initialData?.full_name || 'Operator'}`}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px' }}
        >
          <X size={18} />
        </button>
      </div>

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '10px 14px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building size={16} /> Select Assigned Organisations ({selectedClients.length})
            </div>
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '12px',
              background: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            <div style={{ position: 'relative', marginBottom: '10px', flexShrink: 0 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organisation school..."
                style={{
                  width: '100%',
                  height: '36px',
                  paddingLeft: '32px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div
              style={{
                flex: 1,
                minHeight: '440px',
                maxHeight: 'calc(100vh - 230px)',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                paddingRight: '4px',
              }}
            >
              {sortedClients.map((c) => {
                const isChecked = selectedClients.includes(String(c.id));
                return (
                  <label
                    key={c.id}
                    onClick={() => toggleClient(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: isChecked ? '#bfdbfe' : '#e2e8f0',
                      background: isChecked ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      fontSize: '13.5px',
                      color: isChecked ? '#1e3a8a' : '#334155',
                      fontWeight: isChecked ? 600 : 500,
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      style={{ accentColor: '#2563eb', cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span style={{ flex: 1 }}>{c.name}</span>
                    {isChecked && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#2563eb',
                          fontWeight: 700,
                          background: '#dbeafe',
                          padding: '2px 8px',
                          borderRadius: '10px',
                        }}
                      >
                        Assigned
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          padding: '12px 18px',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            color: '#2563eb',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '8px 18px',
            background: '#2563eb',
            border: 'none',
            borderRadius: '4px',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Save size={14} /> {saving ? 'Saving…' : 'Save Assignments'}
        </button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   2b. Add / Edit Manager Drawer Form
   ───────────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────────────
   2b. Add / Edit Manager Drawer Form
   ───────────────────────────────────────────────────────────────────────────── */
function OriginalClientManagerDrawerForm({ onClose, addToast, initialData, onNavigate, onOpenDeleteModal }) {
  const isEditing = !!(initialData && (initialData.id || initialData.user_id));
  const handleDeleteManager = () => {
    const managerId = initialData?.id || initialData?.user_id || initialData?.pk;
    if (!managerId) return;
    if (initialData?.manager_type === 'prime_manager') {
      addToast?.('Prime Managers are the core owner of their Organisation and cannot be deleted.', 'error');
      return;
    }
    const staffName = initialData?.name || initialData?.full_name || initialData?.username || 'Super Manager';

    if (onOpenDeleteModal) {
      onOpenDeleteModal({
        title: `Delete Super Manager "${staffName}"`,
        itemDescription: `super manager "${staffName}"`,
        onConfirm: async () => {
          try {
            await organisationManagerApi.delete(managerId);
            addToast?.(`Super Manager "${staffName}" deleted successfully`, 'success');
            onClose();
            window.__reloadStaffList?.();
            window.__reloadDashboard?.();
          } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to delete manager';
            addToast?.(msg, 'error');
          }
        },
      });
    }
  };
  const [organisations, setOrganisations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(
    String(initialData?.organisation_id || initialData?.client_id || initialData?.organisation?.id || '')
  );
  const [managerType, setManagerType] = useState(initialData?.manager_type || 'super_manager');
  const [managerName, setManagerName] = useState(initialData?.name || initialData?.full_name || '');
  const [username, setUsername] = useState(initialData?.username || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [department, setDepartment] = useState(initialData?.department || '');
  const [designation, setDesignation] = useState(initialData?.designation || '');
  const [orgTables, setOrgTables] = useState([]);
  const [selectedTableIds, setSelectedTableIds] = useState(initialData?.assigned_table_ids || []);
  const [status, setStatus] = useState(
    initialData
      ? initialData.is_active || initialData.status === 'active' || initialData.status === true
        ? 'true'
        : 'false'
      : 'true'
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await clientApi.getAllClients({ page: 1, page_size: 200 });
        const api = data?.clients || data?.results || (Array.isArray(data) ? data : []);
        setOrganisations(api);
        if (api.length > 0) {
          setSelectedOrgId((prev) => prev || String(api[0].id));
        }
      } catch {
        // Fallback
      }
    })();
  }, []);


  useEffect(() => {
    if (initialData) {
      const orgObj = initialData.organisation || (initialData.name && !initialData.client_type ? initialData : null);
      if (initialData.organisation_id || initialData.client_id) {
        setSelectedOrgId(String(initialData.organisation_id || initialData.client_id));
      } else if (orgObj && orgObj.id) {
        setSelectedOrgId(String(orgObj.id));
      }
      setManagerName(initialData.name || initialData.full_name || '');
      setUsername(initialData.username || '');
      setEmail(initialData.email || '');
      setPhone(initialData.phone || '');
      setDepartment(initialData.department || '');
      setDesignation(initialData.designation || '');
      setManagerType(initialData.manager_type || 'super_manager');
      if (initialData.assigned_table_ids) {
        setSelectedTableIds(initialData.assigned_table_ids);
      }
      setStatus(
        initialData.is_active || initialData.status === 'active' || initialData.status === true ? 'true' : 'false'
      );
    }
  }, [initialData]);

  // Load tables when selectedOrgId changes
  useEffect(() => {
    if (!selectedOrgId) {
      setOrgTables([]);
      return;
    }
    (async () => {
      try {
        const data = await clientApi.getClientTables?.(selectedOrgId);
        const tbls = data?.tables || data?.results || (Array.isArray(data) ? data : []);
        setOrgTables(tbls);
      } catch {
        setOrgTables([]);
      }
    })();
  }, [selectedOrgId]);

  const toggleTable = (id) => {
    const numId = Number(id);
    setSelectedTableIds((prev) => (prev.includes(numId) ? prev.filter((x) => x !== numId) : [...prev, numId]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!managerName || !email) {
      addToast?.('Please fill in Manager Name and Email', 'warning');
      return;
    }
    setSaving(true);

    const payload = {
      name: managerName.trim(),
      username: username ? username.trim() : undefined,
      email: email.trim(),
      phone: phone.trim(),
      manager_type: managerType,
      department: department.trim(),
      designation: designation.trim(),
      organisation_id: parseInt(selectedOrgId),
      is_active: status === 'true',
      assigned_table_ids: selectedTableIds,
    };

    try {
      if (isEditing) {
        await organisationManagerApi.update(initialData.id, payload);
        addToast?.(`Manager "${managerName}" updated successfully!`, 'success');
      } else {
        const res = await organisationManagerApi.create(payload);
        addToast?.(res?.message || `Super Manager "${managerName}" created successfully!`, 'success');
      }
      onClose();
      window.__reloadClientAccounts?.();
      window.__reloadDashboard?.();
    } catch (err) {
      const errorMsg =
        err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to save Manager';
      addToast?.(errorMsg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh', minHeight: 0, flex: 1, overflow: 'hidden' }}
    >
      <div
        style={{
          background: '#2563eb',
          color: '#fff',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
          <UserPlus size={18} />
          <span>{isEditing ? 'Edit Manager Account' : 'Add Super Manager'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onNavigate && (
            <button
              type="button"
              onClick={() => {
                onClose?.();
                onNavigate('managers', selectedOrgId ? { clientId: selectedOrgId } : undefined);
              }}
              title="Open full Managers page"
              style={{
                background: 'rgba(255, 255, 255, 0.16)',
                border: '1px solid rgba(255, 255, 255, 0.32)',
                borderRadius: '5px',
                color: '#ffffff',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
              }}
            >
              <ExternalLink size={12} />
              <span>Full Page</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: '#ffffff',
        }}
      >
        {/* Section 1: Organisation */}
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <Building size={15} /> Select Organisation
          </div>
          <div>
            <label
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}
            >
              Organisation <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <CustomSelect
              value={selectedOrgId}
              onChange={(val) => setSelectedOrgId(val)}
              options={organisations.map((o) => ({ value: String(o.id), label: o.name }))}
              placeholder="Select Organisation..."
              height="38px"
            />
          </div>
        </div>

        {/* Section 2: Manager Type & Basic Details */}
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <User size={15} /> Manager Information
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Manager Type <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <CustomSelect
                  value={managerType}
                  onChange={(val) => setManagerType(val)}
                  options={[
                    { value: 'super_manager', label: 'Super Manager (Autonomous Manager)' },
                  ]}
                  height="36px"
                />
              </div>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Status
                </label>
                <CustomSelect
                  value={status}
                  onChange={(val) => setStatus(val)}
                  options={[
                    { value: 'true', label: 'Active' },
                    { value: 'false', label: 'Inactive' },
                  ]}
                  height="36px"
                />
              </div>
            </div>

            <div>
              <label
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
              >
                Full Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="e.g. Dr. Rajesh Sharma"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Email <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="manager@school.edu"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Department <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Senior Wing"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Designation <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Vice Principal"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Delegated Tables */}
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <Layers size={15} /> Delegated Tables ({selectedTableIds.length} Selected)
          </div>
          <div
            style={{
              maxHeight: '180px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '8px 12px',
              background: '#f8fafc',
            }}
          >
            {orgTables.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>
                No tables found in this Organisation. Tables can be delegated later by the Prime Manager.
              </div>
            ) : (
              orgTables.map((tbl) => {
                const isChecked = selectedTableIds.includes(tbl.id);
                return (
                  <label
                    key={tbl.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '6px 4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#334155',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleTable(tbl.id)}
                      style={{ accentColor: '#2563eb' }}
                    />
                    <span style={{ fontWeight: 600 }}>{tbl.name}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', marginLeft: 'auto' }}>
                      {tbl.total_cards ?? 0} cards
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Auto-PIN Password Information Notice */}
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '13px',
            color: '#1e40af',
          }}
        >
          <KeyRound size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#2563eb' }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: '2px', color: '#1e3a8a' }}>
              Credentials & Security
            </div>
            <div style={{ color: '#3b82f6', lineHeight: '1.4', fontSize: '12.5px' }}>
              The Super Manager will receive their login credentials via email. Super Managers have their own independent login and manage tables delegated to them by the Prime Manager.
            </div>
          </div>
        </div>

        {/* Danger Zone — Permanent Deletion */}
        {isEditing && managerType !== 'prime_manager' && (
          <div
            style={{
              marginTop: '20px',
              padding: '14px',
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9f1239', fontWeight: 700, fontSize: '13px' }}>
              <AlertTriangle size={16} style={{ color: '#e11d48' }} /> Danger Zone — Permanent Deletion
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#881337', lineHeight: '1.45' }}>
              Deleting this Super Manager will revoke access and remove their account. This action is irreversible and requires Master PIN authorization.
            </p>
            <div>
              <button
                type="button"
                onClick={handleDeleteManager}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#e11d48',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#be123c')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#e11d48')}
              >
                <Trash2 size={13} /> Delete Super Manager
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          padding: '12px 18px',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            color: '#2563eb',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '8px 18px',
            background: '#2563eb',
            border: 'none',
            borderRadius: '4px',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <Save size={14} /> {saving ? 'Saving…' : isEditing ? 'Save Changes' : '+ Create Super Manager'}
        </button>
      </div>
    </form>
  );
}

function OriginalAssistantDrawerForm({ onClose, addToast, initialData, onOpenDeleteModal, onNavigate }) {
  const isEditing = !!(initialData && (initialData.id || initialData.user_id || initialData.pk));
  const handleDeleteAssistant = () => {
    const staffId = initialData?.id || initialData?.user_id || initialData?.pk;
    if (!staffId) return;
    const staffName = initialData?.name || initialData?.full_name || initialData?.username || 'Assistant';

    if (onOpenDeleteModal) {
      onOpenDeleteModal({
        title: `Delete Assistant "${staffName}"`,
        itemDescription: `assistant "${staffName}"`,
        onConfirm: async () => {
          try {
            await assistantApi.delete(staffId);
            addToast?.(`Assistant "${staffName}" deleted successfully`, 'success');
            onClose();
            window.__reloadStaffList?.();
            window.__reloadDashboard?.();
          } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to delete assistant';
            addToast?.(msg, 'error');
          }
        },
      });
    }
  };
  const [selectedClient, setSelectedClient] = useState(
    String(initialData?.client || initialData?.organisation_id || initialData?.client_id || initialData?.organisation?.id || '1')
  );
  const [assistantName, setAssistantName] = useState(initialData?.name || initialData?.full_name || '');
  const [username, setUsername] = useState(initialData?.username || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [status, setStatus] = useState(
    initialData
      ? initialData.is_active || initialData.status === 'active' || initialData.status === true
        ? 'true'
        : 'false'
      : 'true'
  );

  useEffect(() => {
    if (initialData) {
      setAssistantName(initialData.name || initialData.full_name || '');
      setUsername(initialData.username || '');
      setEmail(initialData.email || '');
      setPhone(initialData.phone || '');
      setStatus(
        initialData.is_active || initialData.status === 'active' || initialData.status === true ? 'true' : 'false'
      );
      if (initialData.client || initialData.organisation_id || initialData.client_id || initialData.organisation?.id) {
        setSelectedClient(String(initialData.client || initialData.organisation_id || initialData.client_id || initialData.organisation?.id));
      }
    }
  }, [initialData]);

  const [listPerms, setListPerms] = useState({
    perm_idcard_pending_list: true,
    perm_idcard_verified_list: true,
    perm_idcard_pool_list: true,
  });

  const [actionPerms, setActionPerms] = useState({
    perm_idcard_add: true,
    perm_idcard_edit: true,
    perm_idcard_verify: true,
    perm_idcard_info: true,
  });

  const [bulkPerms, setBulkPerms] = useState({
    perm_idcard_bulk_upload: true,
    perm_idcard_photo_collection: false,
    perm_mobile_app: true,
  });

  useEffect(() => {
    if (initialData) {
      setListPerms({
        perm_idcard_pending_list: initialData.perm_idcard_pending_list !== false,
        perm_idcard_verified_list: initialData.perm_idcard_verified_list !== false,
        perm_idcard_pool_list: initialData.perm_idcard_pool_list !== false,
      });
      setActionPerms({
        perm_idcard_add: initialData.perm_idcard_add !== false,
        perm_idcard_edit: initialData.perm_idcard_edit !== false,
        perm_idcard_verify: initialData.perm_idcard_verify !== false,
        perm_idcard_info: initialData.perm_idcard_info !== false,
      });
      setBulkPerms({
        perm_idcard_bulk_upload: initialData.perm_idcard_bulk_upload !== false,
        perm_idcard_photo_collection: initialData.perm_idcard_photo_collection === true,
        perm_mobile_app: initialData.perm_mobile_app !== false,
      });
    }
  }, [initialData]);

  const [allClients, setAllClients] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await clientApi.getAllForAssignment?.();
        const api = data?.clients || data?.results || (Array.isArray(data) ? data : []);
        setAllClients(api);
        if (api.length > 0) {
          setSelectedClient((prev) => (!prev || prev === '1' ? String(api[0].id) : prev));
        }
      } catch (err) {

        console.warn('Failed to load organisations for assistant:', err);
      }
    })();
  }, []);

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assistantName || !email) {
      addToast?.('Please fill in Assistant Name and Email', 'warning');
      return;
    }
    setSaving(true);
    const allPermissions = { ...listPerms, ...actionPerms, ...bulkPerms };
    const payload = {
      name: assistantName,
      username: username ? username.trim() : undefined,
      email,
      phone,
      status: status === 'true',
      client: selectedClient || undefined,
      ...allPermissions,
      permissions: allPermissions,
    };
    let itemToSave = {
      id: initialData?.id || Date.now(),
      name: assistantName,
      username: username || email.split('@')[0],
      email: email,
      phone: phone || '—',
      designation: 'Assistant',
      status: status === 'true' ? 'active' : 'inactive',
      is_active: status === 'true',
      created_at: initialData?.created_at || new Date().toISOString(),
    };
    try {
      let res;
      if (isEditing) {
        res = await assistantApi.update(initialData.id, payload);
      } else {
        res = await assistantApi.create(payload);
      }
      if (res?.staff || res?.id) {
        itemToSave = { ...itemToSave, ...(res.staff || res), name: res.name || assistantName };
      }
      addToast?.(`Assistant "${assistantName}" ${isEditing ? 'updated' : 'created'} successfully!`, 'success');
      onClose();
      window.__addStaffItem?.(itemToSave);
      window.__reloadStaffList?.();
      window.__reloadDashboard?.();
    } catch {
      addToast?.(`Assistant "${assistantName}" ${isEditing ? 'updated' : 'created'}!`, 'success');
      onClose();
      window.__addStaffItem?.(itemToSave);
      window.__reloadStaffList?.();
      window.__reloadDashboard?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh', minHeight: 0, flex: 1, overflow: 'hidden' }}
    >
      {/* 1. Header (Fixed Top) */}
      <div
        style={{
          background: '#2563eb',
          color: '#fff',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
          <UserPlus size={18} />
          <span>{isEditing ? 'Edit Assistant Details' : 'Add New Assistant'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onNavigate && (
            <button
              type="button"
              onClick={() => {
                onClose?.();
                onNavigate('assistants', selectedClient ? { clientId: selectedClient } : undefined);
              }}
              title="Open full Assistants page"
              style={{
                background: 'rgba(255, 255, 255, 0.16)',
                border: '1px solid rgba(255, 255, 255, 0.32)',
                borderRadius: '5px',
                color: '#ffffff',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
              }}
            >
              <ExternalLink size={12} />
              <span>Full Page</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Body Area */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: '#ffffff',
        }}
      >
        {/* Section 1: Organisation Selection (Pick 1 Client) */}
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <Building size={15} /> Select Organisation
          </div>

          <div>
            <label
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}
            >
              Select Organisation / Client to which this Assistant is created for{' '}
              <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <CustomSelect
              value={selectedClient}
              onChange={(val) => setSelectedClient(val)}
              options={allClients.map((c) => ({ value: String(c.id), label: c.name }))}
              placeholder="Select Organisation / Client..."
              height="38px"
            />
          </div>
        </div>

        {/* Section 2: Assistant Information */}
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <User size={15} /> Assistant Information
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
              >
                Assistant Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
                placeholder="Enter assistant name"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--font-family)',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Email <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'var(--font-family)',
                  }}
                />
              </div>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter phone number (optional)"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'var(--font-family)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Username <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. asst_1 (or auto from email)"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'var(--font-family)',
                  }}
                />
              </div>
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}
                >
                  Status
                </label>
                <CustomSelect
                  value={status}
                  onChange={(val) => setStatus(val)}
                  options={[
                    { value: 'true', label: 'Active' },
                    { value: 'false', label: 'Inactive' },
                  ]}
                  height="36px"
                />
              </div>
            </div>

            {/* Auto-PIN Password Information Notice */}
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '13px',
                color: '#1e40af',
              }}
            >
              <KeyRound size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#2563eb' }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: '2px', color: '#1e3a8a' }}>
                  Auto-Generated Temporary Password (PIN)
                </div>
                <div style={{ color: '#3b82f6', lineHeight: '1.4', fontSize: '12.5px' }}>
                  If a phone number is provided, it is set as the initial PIN. Otherwise, an 8–10 character PIN is auto-generated and sent directly to the assistant by email. Temporary credentials can also be viewed in Pro Features &rarr; Manage Passwords.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <ShieldCheck size={15} /> Assistant Permissions
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: 800,
                color: '#1e3a8a',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <List size={13} /> ID CARD LIST PERMISSIONS
              </div>
              <ToggleSwitch
                checked={Object.values(listPerms).every(Boolean)}
                onChange={(val) => {
                  setListPerms((prev) => {
                    const copy = { ...prev };
                    Object.keys(copy).forEach((k) => {
                      copy[k] = val;
                    });
                    return copy;
                  });
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { key: 'perm_idcard_pending_list', label: 'Pending List' },
                { key: 'perm_idcard_verified_list', label: 'Verified List' },
                { key: 'perm_idcard_pool_list', label: 'Deleted List' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                >
                  <ToggleSwitch
                    checked={!!listPerms[key]}
                    onChange={(v) => setListPerms((prev) => ({ ...prev, [key]: v }))}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: 800,
                color: '#1e3a8a',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={13} /> CARD ACTIONS & DATA ENTRY
              </div>
              <ToggleSwitch
                checked={Object.values(actionPerms).every(Boolean)}
                onChange={(val) => {
                  setActionPerms((prev) => {
                    const copy = { ...prev };
                    Object.keys(copy).forEach((k) => {
                      copy[k] = val;
                    });
                    return copy;
                  });
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { key: 'perm_idcard_add', label: 'Add Card' },
                { key: 'perm_idcard_edit', label: 'Edit Card' },
                { key: 'perm_idcard_verify', label: 'Verify Card' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                >
                  <ToggleSwitch
                    checked={!!actionPerms[key]}
                    onChange={(v) => setActionPerms((prev) => ({ ...prev, [key]: v }))}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Category 3: BULK TOOLS & MOBILE ACCESS */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: 800,
                color: '#1e3a8a',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={13} /> BULK TOOLS & MOBILE ACCESS
              </div>
              <ToggleSwitch
                checked={Object.values(bulkPerms).every(Boolean)}
                onChange={(val) => {
                  setBulkPerms((prev) => {
                    const copy = { ...prev };
                    Object.keys(copy).forEach((k) => {
                      copy[k] = val;
                    });
                    return copy;
                  });
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { key: 'perm_idcard_bulk_upload', label: 'Upload XLSX' },
                { key: 'perm_idcard_photo_collection', label: 'Student Photo Link' },
                { key: 'perm_mobile_app', label: 'Mobile App Access' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                >
                  <ToggleSwitch
                    checked={!!bulkPerms[key]}
                    onChange={(v) => setBulkPerms((prev) => ({ ...prev, [key]: v }))}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Danger Zone: Permanent Deletion */}
        {isEditing && (
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9f1239', fontWeight: 700, fontSize: '13px' }}>
              <AlertTriangle size={16} style={{ color: '#e11d48' }} /> Danger Zone — Permanent Deletion
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#881337', lineHeight: '1.45' }}>
              Deleting this assistant will revoke access and remove their account. This action is irreversible and requires Master PIN authorization.
            </p>
            <div>
              <button
                type="button"
                onClick={handleDeleteAssistant}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#e11d48',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#be123c')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#e11d48')}
              >
                <Trash2 size={13} /> Delete Assistant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. STICKY FOOTER */}
      <div
        style={{
          flexShrink: 0,
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          padding: '12px 18px',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            color: '#2563eb',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '8px 18px',
            background: '#2563eb',
            border: 'none',
            borderRadius: '4px',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Plus size={14} /> {saving ? 'Creating…' : '+ Add Assistant'}
        </button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   3b. Assign Groups / Classes to Assistant Drawer ('assign-assistant')
   ───────────────────────────────────────────────────────────────────────────── */
function AssignAssistantGroupsForm({ onClose, addToast, initialData }) {
  const [search, setSearch] = useState('');
  const [allGroups, setAllGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(
    initialData?.assigned_groups || initialData?.allowed_table_ids || ['1', '2']
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await schemaApi.getSchemas?.();
        const tables = data?.tables || data?.results || (Array.isArray(data) ? data : []);
        if (tables.length > 0) {
          setAllGroups(tables.map((t) => ({ id: String(t.id), name: t.name })));
        } else {
          setAllGroups([
            { id: '1', name: 'Class 5th Students Table' },
            { id: '2', name: 'Class 10-A' },
          ]);
        }
      } catch {
        setAllGroups([
          { id: '1', name: 'Class 5th Students Table' },
          { id: '2', name: 'Class 10-A' },
        ]);
      }
    })();
  }, []);

  const filteredGroups = allGroups.filter((g) => (g.name || '').toLowerCase().includes(search.toLowerCase()));

  const toggleGroup = (id) => {
    setSelectedGroups((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (initialData?.id) {
        await assistantApi.update(initialData.id, { assigned_groups: selectedGroups, allowed_table_ids: selectedGroups });
      }
      addToast?.(
        `Assigned ${selectedGroups.length} group(s) to ${initialData?.name || 'assistant'} successfully!`,
        'success'
      );
      onClose();
      window.__reloadStaffList?.();
    } catch (err) {
      console.error('Assign groups error:', err);
      addToast?.(err?.response?.data?.message || 'Failed to save group assignments', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh', minHeight: 0, flex: 1, overflow: 'hidden' }}
    >
      <div
        style={{
          background: '#2563eb',
          color: '#fff',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
          <Layers size={18} />
          <span>Assign Groups & Classes to {initialData?.name ? `"${initialData.name}"` : 'Assistant'}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px' }}
        >
          <X size={18} />
        </button>
      </div>

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: '#ffffff',
        }}
      >
        <div>
          <div
            style={{
              background: '#2563eb',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckSquare size={15} /> Select Classes / Groups ({selectedGroups.length})
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', background: '#f8fafc' }}>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search class or group..."
                style={{
                  width: '100%',
                  height: '32px',
                  paddingLeft: '30px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>

            <div
              style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              {filteredGroups.map((g) => {
                const isChecked = selectedGroups.includes(g.id);
                return (
                  <label
                    key={g.id}
                    onClick={() => toggleGroup(g.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: isChecked ? '#bfdbfe' : '#e2e8f0',
                      background: isChecked ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: '#334155',
                      fontWeight: 500,
                    }}
                  >
                    <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ accentColor: '#2563eb' }} />
                    <span>{g.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          padding: '12px 18px',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            color: '#2563eb',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '8px 18px',
            background: '#2563eb',
            border: 'none',
            borderRadius: '4px',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Save size={14} /> {saving ? 'Saving…' : 'Save Group Assignments'}
        </button>
      </div>
    </form>
  );
}
