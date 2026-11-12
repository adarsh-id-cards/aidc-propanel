/**
 * StudentDataPortal — Production-Grade Mobile-First Public Student & Parent Collection Portal.
 * 
 * Capabilities:
 * - Dynamic form generation from table schema (arbitrary columns supported)
 * - True Submitter vs Student identity separation (Student, Father, Mother, Guardian, Staff)
 * - Multi-child family workflow ("+ Add Another Child") preserving submitter contact
 * - Idempotency key tracking to eliminate duplicate submissions
 * - Interactive 3:4 portrait photo cropper (touch/mouse pan, zoom, 90° rotate)
 * - Targeted in-place self-correction mode with highlighted requested fields
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  FolderInput,
  Send,
  User,
  Users,
  ShieldCheck,
  PlusCircle,
  FileEdit,
  Phone,
} from 'lucide-react';
import { dataCollectionApi } from '../../services/api';

function getOrCreateDeviceId() {
  const KEY = 'cardflow_collection_device_id';
  let devId = localStorage.getItem(KEY);
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem(KEY, devId);
  }
  return devId;
}

function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
}

export default function StudentDataPortal({ token, isCorrectionMode = false }) {
  const deviceId = getOrCreateDeviceId();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState('');

  // Submitter state (retained across sibling submissions)
  const [submitterRole, setSubmitterRole] = useState('student');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterPhone, setSubmitterPhone] = useState('');

  // Child / Student demographic form data: { [fieldName]: value }
  const [formData, setFormData] = useState({});
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);

  // Photo cropper state
  const [imageSrc, setImageSrc] = useState(null);
  const [croppedBlob, setCroppedBlob] = useState(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialOffsetX: 0, initialOffsetY: 0 });

  const canvasRef = useRef(null);
  const imageObjRef = useRef(null);
  const fileInputRef = useRef(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [submitError, setSubmitError] = useState('');

  // Sibling submission counter
  const [submittedSiblingsCount, setSubmittedSiblingsCount] = useState(0);

  // ── Load Metadata ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchMetadata() {
      if (!token) {
        setLoadError('No collection token provided.');
        setLoading(false);
        return;
      }

      try {
        if (isCorrectionMode) {
          const res = await dataCollectionApi.getPublicCorrectionMeta(token);
          if (res.valid) {
            setMeta({
              table_name: res.table_name,
              organisation_name: res.organisation_name,
              instructions: 'Please review and correct the highlighted fields below.',
              requested_fields: res.requested_fields || [],
              fields: Object.keys(res.field_data || {}).map((k) => ({
                name: k,
                label: k,
                type: 'text',
                required: false,
              })),
            });
            setFormData(res.field_data || {});
          } else {
            setLoadError(res.message || 'Invalid or expired correction link.');
          }
        } else {
          const res = await dataCollectionApi.getPublicMeta(token);
          if (res.valid) {
            setMeta(res);
            const initial = {};
            (res.fields || []).forEach((f) => {
              initial[f.name] = '';
            });
            setFormData(initial);
          } else {
            setLoadError(res.message || 'Data collection is currently inactive or link is invalid.');
          }
        }
      } catch (err) {
        setLoadError(err?.response?.data?.message || 'Unable to connect to collection portal.');
      } finally {
        setLoading(false);
      }
    }

    fetchMetadata();
  }, [token, isCorrectionMode]);

  const renderCrop = useCallback((img, z, rot, off) => {
    const canvas = canvasRef.current || document.createElement('canvas');
    if (!img) return;

    const ctx = canvas.getContext('2d');
    const targetW = 300;
    const targetH = 400; // 3:4 ID Portrait Ratio
    canvas.width = targetW;
    canvas.height = targetH;

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.save();

    ctx.translate(targetW / 2 + off.x, targetH / 2 + off.y);
    ctx.rotate((rot * Math.PI) / 180);

    const baseScale = Math.max(targetW / img.width, targetH / img.height);
    const scale = baseScale * z;

    ctx.drawImage(
      img,
      (-img.width * scale) / 2,
      (-img.height * scale) / 2,
      img.width * scale,
      img.height * scale
    );

    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCroppedBlob(blob);
          setCroppedPreviewUrl((prevUrl) => {
            if (prevUrl) URL.revokeObjectURL(prevUrl);
            return URL.createObjectURL(blob);
          });
        }
      },
      'image/jpeg',
      0.92
    );
  }, []);

  // Re-render canvas crop when imageSrc mounts or transforms change
  useEffect(() => {
    if (imageSrc && imageObjRef.current && canvasRef.current) {
      renderCrop(imageObjRef.current, zoom, rotation, offset);
    }
  }, [imageSrc, zoom, rotation, offset, renderCrop]);

  // ── Field Change Handlers ──────────────────────────────────────────────────
  const handleInputChange = (fieldName, value) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  // ── Photo Selection & Canvas Cropper ───────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        imageObjRef.current = img;
        setImageSrc(reader.result);
        setZoom(1);
        setRotation(0);
        setOffset({ x: 0, y: 0 });
        renderCrop(img, 1, 0, { x: 0, y: 0 });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX || e.touches?.[0]?.clientX || 0,
      y: e.clientY || e.touches?.[0]?.clientY || 0,
      initialOffsetX: offset.x,
      initialOffsetY: offset.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
    const clientY = e.clientY || e.touches?.[0]?.clientY || 0;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    const newOff = {
      x: dragStartRef.current.initialOffsetX + dx,
      y: dragStartRef.current.initialOffsetY + dy,
    };
    setOffset(newOff);
    if (imageObjRef.current) {
      renderCrop(imageObjRef.current, zoom, rotation, newOff);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const adjustZoom = (delta) => {
    const newZ = Math.max(0.8, Math.min(3, zoom + delta));
    setZoom(newZ);
    if (imageObjRef.current) renderCrop(imageObjRef.current, newZ, rotation, offset);
  };

  const rotate90 = () => {
    const newRot = (rotation + 90) % 360;
    setRotation(newRot);
    if (imageObjRef.current) renderCrop(imageObjRef.current, zoom, newRot, offset);
  };

  // ── Form Submission ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    // Check required fields
    const missing = [];
    (meta?.fields || []).forEach((f) => {
      if (f.required && !formData[f.name]?.trim()) {
        missing.push(f.label || f.name);
      }
    });

    if (missing.length > 0) {
      setSubmitError(`Please fill in required fields: ${missing.join(', ')}`);
      return;
    }

    if (!isCorrectionMode && !croppedBlob) {
      setSubmitError('Please upload and crop your passport photograph.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('fields', JSON.stringify(formData));
      payload.append('submitter_role', submitterRole);
      payload.append('submitter_name', submitterName);
      payload.append('submitter_phone', submitterPhone);
      payload.append('idempotency_key', idempotencyKey);
      payload.append('device_id', deviceId);

      if (croppedBlob) {
        payload.append('photo', croppedBlob, 'student_photo.jpg');
      }

      let res;
      if (isCorrectionMode) {
        res = await dataCollectionApi.submitPublicCorrection(token, payload);
      } else {
        res = await dataCollectionApi.submitPublicData(token, payload);
      }

      if (res.success) {
        setSubmitSuccess(res);
        setSubmittedSiblingsCount((prev) => prev + 1);
      } else {
        setSubmitError(res.message || 'Submission failed.');
      }
    } catch (err) {
      setSubmitError(err?.response?.data?.message || 'Network error submitting application. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Sibling Multi-Child Reset ──────────────────────────────────────────────
  const handleAddAnotherChild = () => {
    // Retain submitter info (parent role, parent name, parent phone)
    // Clear student-specific fields
    const freshFields = {};
    (meta?.fields || []).forEach((f) => {
      freshFields[f.name] = '';
    });
    setFormData(freshFields);

    // Reset photo cropper
    setImageSrc(null);
    setCroppedBlob(null);
    setCroppedPreviewUrl(null);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });

    // Generate fresh idempotency key
    setIdempotencyKey(generateIdempotencyKey());

    // Reset submission state
    setSubmitSuccess(null);
    setSubmitError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Render Error Screen ────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '32px 24px', maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <AlertCircle size={44} color="#f87171" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ color: '#ffffff', fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>PORTAL UNAVAILABLE</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>{loadError}</p>
        </div>
      </div>
    );
  }

  // ── Render Loading Screen ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: '14px', fontWeight: 600 }}>CONNECTING TO SECURE PORTAL...</div>
        </div>
      </div>
    );
  }

  // ── Render Success Receipt Screen (with Add Another Child option) ──────────
  if (submitSuccess) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '32px 24px', maxWidth: '460px', width: '100%', textAlign: 'center' }}>
          <CheckCircle2 size={52} color="#10b981" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ color: '#ffffff', fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>
            SUBMISSION RECORDED!
          </h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '3px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, marginBottom: '14px' }}>
            <ShieldCheck size={14} />
            <span>Reference ID: #{submitSuccess.record_id}</span>
          </div>

          <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
            {submitSuccess.message}
          </p>

          {croppedPreviewUrl && (
            <div style={{ margin: '0 auto 18px', width: '90px', height: '120px', borderRadius: '6px', overflow: 'hidden', border: '2px solid #3b82f6', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
              <img src={croppedPreviewUrl} alt="Submitted portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '12px 14px', textAlign: 'left', marginBottom: '20px', fontSize: '12px' }}>
            <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>SUBMITTED RECORD DETAILS:</div>
            {Object.entries(formData).slice(0, 4).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #1e293b' }}>
                <span style={{ color: '#94a3b8' }}>{k}:</span>
                <span style={{ color: '#f8fafc', fontWeight: 600 }}>{v || '—'}</span>
              </div>
            ))}
          </div>

          {/* Sibling Multi-Child Action Button */}
          {!isCorrectionMode && (
            <button
              type="button"
              onClick={handleAddAnotherChild}
              style={{
                width: '100%',
                height: '42px',
                background: '#047857',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '12px',
                boxShadow: '0 2px 8px rgba(4, 120, 87, 0.4)',
              }}
            >
              <PlusCircle size={16} />
              <span>+ SUBMIT ANOTHER CHILD (FAMILY / SIBLING)</span>
            </button>
          )}

          <div style={{ fontSize: '11px', color: '#64748b' }}>
            Pro Panel Multi-Tier Demographic & Biometric Collection Subsystem
          </div>
        </div>
      </div>
    );
  }

  // ── Render Collection / Correction Portal Form ─────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', padding: '24px 16px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: isCorrectionMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)', border: `1px solid ${isCorrectionMode ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`, borderRadius: '4px', padding: '4px 12px', color: isCorrectionMode ? '#fcd34d' : '#93c5fd', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>
            {isCorrectionMode ? <FileEdit size={14} /> : <FolderInput size={14} />}
            <span>{isCorrectionMode ? 'CORRECTION PORTAL' : 'STUDENT DATA & PHOTO PORTAL'}</span>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: '0 0 6px' }}>
            {meta?.organisation_name || meta?.table_name}
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
            {meta?.instructions}
          </p>
        </div>

        {/* Correction Requested Banner */}
        {isCorrectionMode && meta?.requested_fields?.length > 0 && (
          <div style={{ background: '#78350f', border: '1px solid #b45309', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: '#fef3c7' }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>Requested Corrections:</div>
            <div>Please review and update: <strong>{meta.requested_fields.join(', ')}</strong></div>
          </div>
        )}

        {/* Form Card */}
        <form onSubmit={handleSubmit} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {submitError && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px 12px', color: '#991b1b', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{submitError}</span>
            </div>
          )}

          {/* Section 1: Submitter Role & Family Details */}
          {!isCorrectionMode && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#60a5fa', letterSpacing: '0.04em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={14} />
                <span>1. WHO IS FILLING THIS FORM?</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                    I am the:
                  </label>
                  <select
                    value={submitterRole}
                    onChange={(e) => setSubmitterRole(e.target.value)}
                    style={{
                      width: '100%',
                      height: '36px',
                      padding: '0 10px',
                      fontSize: '13px',
                      background: '#0f172a',
                      color: '#ffffff',
                      border: '1px solid #475569',
                      borderRadius: '6px',
                      outline: 'none',
                    }}
                  >
                    <option value="student">Student (Self)</option>
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="guardian">Guardian</option>
                    <option value="staff">School Staff / Operator</option>
                  </select>
                </div>

                {submitterRole !== 'student' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                        Your Name:
                      </label>
                      <input
                        type="text"
                        value={submitterName}
                        onChange={(e) => setSubmitterName(e.target.value)}
                        placeholder="Parent / Submitter Name"
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '0 10px',
                          fontSize: '13px',
                          background: '#0f172a',
                          color: '#ffffff',
                          border: '1px solid #475569',
                          borderRadius: '6px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                        Contact Phone / WhatsApp:
                      </label>
                      <input
                        type="tel"
                        value={submitterPhone}
                        onChange={(e) => setSubmitterPhone(e.target.value)}
                        placeholder="Mobile Number"
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '0 10px',
                          fontSize: '13px',
                          background: '#0f172a',
                          color: '#ffffff',
                          border: '1px solid #475569',
                          borderRadius: '6px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 2: Student Demographic Fields */}
          <div style={{ borderTop: isCorrectionMode ? 'none' : '1px solid #334155', paddingTop: isCorrectionMode ? 0 : '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#60a5fa', letterSpacing: '0.04em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} />
              <span>{isCorrectionMode ? 'STUDENT DETAILS' : '2. STUDENT DETAILS'}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              {(meta?.fields || []).map((f) => {
                const isRequested = isCorrectionMode && meta?.requested_fields?.includes(f.name);
                return (
                  <div key={f.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: isRequested ? '#fcd34d' : '#cbd5e1' }}>
                        {f.label} {f.required && <span style={{ color: '#f87171' }}>*</span>}
                      </label>
                      {isRequested && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                          CORRECTION REQUESTED
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      required={f.required}
                      value={formData[f.name] || ''}
                      onChange={(e) => handleInputChange(f.name, e.target.value)}
                      placeholder={`Enter ${f.label}...`}
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 12px',
                        fontSize: '13px',
                        background: '#0f172a',
                        color: '#ffffff',
                        border: isRequested ? '2px solid #f59e0b' : '1px solid #475569',
                        borderRadius: '6px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Passport Photo Cropper */}
          <div style={{ borderTop: '1px solid #334155', paddingTop: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#60a5fa', letterSpacing: '0.04em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Camera size={14} />
              <span>{isCorrectionMode ? 'UPDATE PHOTOGRAPH (OPTIONAL)' : '3. PASSPORT PHOTOGRAPH (3:4 RATIO)'}</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {!imageSrc ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #475569',
                  borderRadius: '10px',
                  padding: '24px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: '#0f172a',
                }}
              >
                <Camera size={32} color="#60a5fa" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                  TAKE PHOTO OR CHOOSE FILE
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Formal passport-size photo on a plain background
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onTouchStart={handleMouseDown}
                  onTouchMove={handleMouseMove}
                  onTouchEnd={handleMouseUp}
                  style={{
                    width: '240px',
                    height: '320px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '2px solid #3b82f6',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    position: 'relative',
                    background: '#000',
                    touchAction: 'none',
                  }}
                >
                  <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
                  <div style={{ position: 'absolute', inset: 0, border: '1px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => adjustZoom(0.1)}
                    style={{ height: '30px', padding: '0 10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
                  >
                    <ZoomIn size={14} /> ZOOM IN
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustZoom(-0.1)}
                    style={{ height: '30px', padding: '0 10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
                  >
                    <ZoomOut size={14} /> ZOOM OUT
                  </button>
                  <button
                    type="button"
                    onClick={rotate90}
                    style={{ height: '30px', padding: '0 10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
                  >
                    <RotateCw size={14} /> ROTATE
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ height: '30px', padding: '0 10px', background: '#475569', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                  >
                    CHANGE
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              height: '42px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '4px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)',
            }}
          >
            {submitting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>RECORDING SUBMISSION...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>{isCorrectionMode ? 'SUBMIT CORRECTION' : 'SUBMIT APPLICATION'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
