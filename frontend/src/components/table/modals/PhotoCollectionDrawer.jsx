/**
 * PhotoCollectionDrawer — Manager/Operator drawer to configure student photo collection.
 * Lets users select verification columns (e.g., Roll No, Name), media fields to collect,
 * configure single-submission locks, device lockouts, and generate public shareable links.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Share2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Smartphone,
  Lock,
  MessageSquare,
  HelpCircle,
  FileImage,
  AlertTriangle,
} from 'lucide-react';
import { photoCollectionApi } from '../../../services/api';

export default function PhotoCollectionDrawer({
  tableId,
  tableName,
  isOpen,
  onClose,
  addToast,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);

  // Configuration state
  const [config, setConfig] = useState(null);
  const [availableFields, setAvailableFields] = useState([]);
  const [availableMediaFields, setAvailableMediaFields] = useState([]);
  const [stats, setStats] = useState({ total_cards: 0, uploaded_cards: 0, pending_cards: 0 });

  // Form values
  const [isActive, setIsActive] = useState(true);
  const [verificationFields, setVerificationFields] = useState([]);
  const [mediaFields, setMediaFields] = useState([]);
  const [singleSubmissionOnly, setSingleSubmissionOnly] = useState(true);
  const [deviceLockoutEnabled, setDeviceLockoutEnabled] = useState(true);
  const [instructions, setInstructions] = useState('');

  // ── Load configuration on drawer open ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !tableId) return;

    async function loadConfig() {
      setLoading(true);
      try {
        const res = await photoCollectionApi.getConfig(tableId);
        if (res.success) {
          setConfig(res.config);
          setIsActive(res.config.is_active);
          setVerificationFields(res.config.verification_fields || []);
          setMediaFields(res.config.media_fields || []);
          setSingleSubmissionOnly(res.config.single_submission_only);
          setDeviceLockoutEnabled(res.config.device_lockout_enabled);
          setInstructions(res.config.instructions || '');
          setAvailableFields(res.available_fields || []);
          setAvailableMediaFields(res.available_media_fields || []);
          setStats(res.stats || { total_cards: 0, uploaded_cards: 0, pending_cards: 0 });
        }
      } catch (err) {
        console.error('Error loading photo collection config:', err);
        addToast?.(err?.response?.data?.message || 'Failed to load photo collection configuration', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, [isOpen, tableId, addToast]);

  if (!isOpen) return null;

  const fullPortalUrl = config?.token
    ? `${window.location.origin}/portal/upload/${config.token}`
    : '';

  // ── Copy Link to Clipboard ─────────────────────────────────────────────────
  const handleCopyLink = () => {
    if (!fullPortalUrl) return;
    navigator.clipboard.writeText(fullPortalUrl);
    setCopiedLink(true);
    addToast?.('Photo collection link copied to clipboard!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // ── Copy WhatsApp Formatted Message ────────────────────────────────────────
  const handleCopyWhatsapp = () => {
    if (!fullPortalUrl) return;
    const msg = `📢 *Official Student ID Card Photo Submission*

Dear Student/Parent,
Please submit your passport photograph for your official ID card using the link below:

🔗 ${fullPortalUrl}

*Submission Instructions:*
1. Enter your registered verification details to confirm your student record.
2. Capture live using your phone camera or select from gallery.
3. Use the built-in crop tool to align your face.
4. Only one submission is permitted per student.

_CardFlow Automated ID System_`;

    navigator.clipboard.writeText(msg);
    setCopiedWhatsapp(true);
    addToast?.('WhatsApp message copied! Paste it in your group or chat.', 'success');
    setTimeout(() => setCopiedWhatsapp(false), 2000);
  };

  // ── Regenerate Access Token ────────────────────────────────────────────────
  const handleRegenerateToken = async () => {
    if (!window.confirm('Are you sure you want to regenerate this link? The previous link will stop working immediately.')) {
      return;
    }
    setSaving(true);
    try {
      const res = await photoCollectionApi.updateConfig(tableId, { regenerate_token: true });
      if (res.success) {
        setConfig(res.config);
        addToast?.('New link generated successfully! Previous link invalidated.', 'success');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || 'Failed to regenerate link', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle verification field ──────────────────────────────────────────────
  const toggleVerificationField = (fieldName) => {
    setVerificationFields((prev) => {
      if (prev.includes(fieldName)) {
        if (prev.length <= 1) {
          addToast?.('At least one verification column is required', 'warning');
          return prev;
        }
        return prev.filter((f) => f !== fieldName);
      } else {
        return [...prev, fieldName];
      }
    });
  };

  // ── Toggle media field ─────────────────────────────────────────────────────
  const toggleMediaField = (fieldName) => {
    setMediaFields((prev) => {
      if (prev.includes(fieldName)) {
        if (prev.length <= 1) {
          addToast?.('At least one media field is required', 'warning');
          return prev;
        }
        return prev.filter((f) => f !== fieldName);
      } else {
        return [...prev, fieldName];
      }
    });
  };

  // ── Save Configuration ─────────────────────────────────────────────────────
  const handleSaveConfig = async () => {
    if (verificationFields.length === 0) {
      addToast?.('Select at least one verification column', 'warning');
      return;
    }
    if (mediaFields.length === 0) {
      addToast?.('Select at least one media field', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        is_active: isActive,
        verification_fields: verificationFields,
        media_fields: mediaFields,
        single_submission_only: singleSubmissionOnly,
        device_lockout_enabled: deviceLockoutEnabled,
        instructions: instructions.trim(),
      };
      const res = await photoCollectionApi.updateConfig(tableId, payload);
      if (res.success) {
        setConfig(res.config);
        addToast?.('Photo collection configuration saved successfully!', 'success');
        onClose();
      }
    } catch (err) {
      console.error('Save config error:', err);
      addToast?.(err?.response?.data?.message || 'Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <>
      <div className="drawer-overlay-backdrop" onClick={onClose} />
      <aside
        className="side-drawer-panel"
        style={{
          width: '640px',
          maxWidth: '96vw',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          zIndex: 100000,
        }}
      >
        {/* Header */}
        <div
          style={{
            background: '#2563eb',
            color: '#fff',
            height: '48px',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '15px' }}>
            <Share2 size={17} />
            <span>Student Photo Collection Link</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
              <p style={{ margin: 0, fontSize: '13px' }}>Loading link configuration…</p>
            </div>
          ) : (
            <>
              {/* ── SECTION 1: LINK STATUS & SHARING ── */}
              <div style={sectionBoxStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isActive ? '#22c55e' : '#94a3b8' }} />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                      {isActive ? 'Collection Portal Active' : 'Collection Portal Paused'}
                    </span>
                  </div>

                  {/* Active Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    style={{
                      width: '40px',
                      height: '22px',
                      borderRadius: '11px',
                      background: isActive ? '#2563eb' : '#cbd5e1',
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'background 0.15s ease',
                    }}
                    title={isActive ? 'Click to deactivate link' : 'Click to activate link'}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '2px',
                        left: isActive ? '20px' : '2px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: '#ffffff',
                        transition: 'left 0.15s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                    />
                  </button>
                </div>

                {/* Link Input & Quick Actions */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' }}>
                    Unique Mobile Upload URL:
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={fullPortalUrl}
                      style={{
                        flex: 1,
                        height: '34px',
                        padding: '0 10px',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        color: '#334155',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      style={smallActionBtnStyle}
                      title="Copy URL"
                    >
                      {copiedLink ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}
                      <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Sharing Buttons Row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  <button
                    type="button"
                    onClick={handleCopyWhatsapp}
                    style={{
                      ...smallActionBtnStyle,
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      color: '#065f46',
                    }}
                  >
                    {copiedWhatsapp ? <Check size={14} /> : <MessageSquare size={14} />}
                    <span>{copiedWhatsapp ? 'Message Copied!' : 'Copy WhatsApp Message'}</span>
                  </button>

                  <a
                    href={fullPortalUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      ...smallActionBtnStyle,
                      textDecoration: 'none',
                      color: '#2563eb',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    <ExternalLink size={14} />
                    <span>Open in Mobile View</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleRegenerateToken}
                    style={{
                      ...smallActionBtnStyle,
                      color: '#64748b',
                      marginLeft: 'auto',
                    }}
                    title="Generate a new token if the current link was shared by mistake"
                  >
                    <RefreshCw size={13} />
                    <span>Regenerate Link</span>
                  </button>
                </div>

                {/* Progress & Statistics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={statBoxStyle}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Total Cards</div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>{stats.total_cards}</div>
                  </div>
                  <div style={statBoxStyle}>
                    <div style={{ fontSize: '11px', color: '#16a34a' }}>Uploaded</div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#16a34a' }}>{stats.uploaded_cards}</div>
                  </div>
                  <div style={statBoxStyle}>
                    <div style={{ fontSize: '11px', color: '#d97706' }}>Pending</div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#d97706' }}>{stats.pending_cards}</div>
                  </div>
                </div>
              </div>

              {/* ── SECTION 2: VERIFICATION COLUMNS (WHAT STUDENT MUST MATCH) ── */}
              <div style={sectionBoxStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <ShieldCheck size={16} style={{ color: '#2563eb' }} />
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                    Student Verification Columns (To Match)
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                  Select the columns from the table that the student must provide to verify their record. Upload will only unlock if <strong>all selected columns match</strong>.
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {availableFields.map((f) => {
                    const isSelected = verificationFields.includes(f.name);
                    return (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => toggleVerificationField(f.name)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: isSelected ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                          background: isSelected ? '#eff6ff' : '#f8fafc',
                          color: isSelected ? '#1d4ed8' : '#475569',
                          fontSize: '12.5px',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '3px',
                            border: isSelected ? '1.5px solid #2563eb' : '1.5px solid #94a3b8',
                            background: isSelected ? '#2563eb' : '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                          }}
                        >
                          {isSelected && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span>{f.label}</span>
                        {isSelected && (
                          <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1e40af', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                            Match
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── SECTION 3: MEDIA FIELDS TO COLLECT ── */}
              <div style={sectionBoxStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <FileImage size={16} style={{ color: '#2563eb' }} />
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                    Media Fields to Collect
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                  Select the photo/media fields from this table that the student will upload:
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {availableMediaFields.length > 0 ? (
                    availableMediaFields.map((mf) => {
                      const isSelected = mediaFields.includes(mf.name);
                      return (
                        <button
                          key={mf.name}
                          type="button"
                          onClick={() => toggleMediaField(mf.name)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: isSelected ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                            background: isSelected ? '#eff6ff' : '#f8fafc',
                            color: isSelected ? '#1d4ed8' : '#475569',
                            fontSize: '12.5px',
                            fontWeight: isSelected ? 700 : 500,
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '3px',
                              border: isSelected ? '1.5px solid #2563eb' : '1.5px solid #94a3b8',
                              background: isSelected ? '#2563eb' : '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#ffffff',
                            }}
                          >
                            {isSelected && <Check size={11} strokeWidth={3} />}
                          </span>
                          <span>{mf.label}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                      No media/photo fields found in table schema.
                    </div>
                  )}
                </div>
              </div>

              {/* ── SECTION 4: SINGLE-SUBMISSION & DEVICE RESTRICTIONS ── */}
              <div style={sectionBoxStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Lock size={16} style={{ color: '#2563eb' }} />
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                    Submission & Anti-Duplicate Restrictions
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Single Submission Lock */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                        Single Submission Lock (One Student = One Upload)
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>
                        Once a student uploads their photo, their record is locked. Re-opening the link with the same details will block duplicate uploads.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSingleSubmissionOnly(!singleSubmissionOnly)}
                      style={{
                        width: '36px',
                        height: '20px',
                        borderRadius: '10px',
                        background: singleSubmissionOnly ? '#2563eb' : '#cbd5e1',
                        border: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: '2px',
                          left: singleSubmissionOnly ? '18px' : '2px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: '#ffffff',
                          transition: 'left 0.15s ease',
                        }}
                      />
                    </button>
                  </div>

                  {/* Device Lockout */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                        Phone / Device Lockout
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>
                        Marks the student’s phone upon submission and stops repeated submission attempts from the same device.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeviceLockoutEnabled(!deviceLockoutEnabled)}
                      style={{
                        width: '36px',
                        height: '20px',
                        borderRadius: '10px',
                        background: deviceLockoutEnabled ? '#2563eb' : '#cbd5e1',
                        border: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: '2px',
                          left: deviceLockoutEnabled ? '18px' : '2px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: '#ffffff',
                          transition: 'left 0.15s ease',
                        }}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── SECTION 5: CUSTOM STUDENT INSTRUCTIONS ── */}
              <div style={sectionBoxStyle}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                  Student Portal Notice / Instructions:
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g., Please upload a formal passport-size photo in school uniform with plain white background."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    color: '#334155',
                    boxSizing: 'border-box',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #334155',
            background: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              height: '32px',
              padding: '0 16px',
              borderRadius: '6px',
              border: '1px solid #475569',
              background: '#334155',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving || loading}
            style={{
              height: '32px',
              padding: '0 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {saving ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
            <span>{saving ? 'Saving…' : 'Save Configuration'}</span>
          </button>
        </div>
      </aside>
    </>,
    document.body
  );
}

const sectionBoxStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
};

const smallActionBtnStyle = {
  height: '34px',
  padding: '0 12px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  color: '#334155',
  fontSize: '12.5px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'all 0.15s ease',
};

const statBoxStyle = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  padding: '8px 12px',
  textAlign: 'center',
};
