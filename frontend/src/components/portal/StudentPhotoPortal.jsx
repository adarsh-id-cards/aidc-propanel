/**
 * StudentPhotoPortal — Standalone mobile-first student self-upload portal.
 * Designed specifically for mobile phone screens and tablets/laptops.
 * Features:
 * - Public tokenized access (no login required)
 * - Multi-column identity verification (Roll No, Name, etc.)
 * - Camera capture & Gallery picker
 * - Built-in interactive HTML5 canvas cropper (zoom, pan, rotate, 3:4 ID card ratio)
 * - Anti-abuse lockouts: single-submission protection & device lockout
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Lock,
  RotateCw,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  UserCheck,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { photoCollectionApi } from '../../services/api';

// Generate or retrieve persistent anonymous device ID
function getDeviceId() {
  const KEY = 'cardflow_device_fingerprint';
  let devId = localStorage.getItem(KEY);
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    localStorage.setItem(KEY, devId);
  }
  return devId;
}

export default function StudentPhotoPortal({ token }) {
  const deviceId = getDeviceId();

  // Portal metadata & loading state
  const [loading, setLoading] = useState(true);
  const [portalMeta, setPortalMeta] = useState(null);
  const [loadError, setLoadError] = useState('');

  // Step state: 'verify' | 'upload' | 'success' | 'locked'
  const [step, setStep] = useState('verify');

  // Verification form state
  const [formValues, setFormValues] = useState({});
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Verified student record
  const [verifiedStudent, setVerifiedStudent] = useState(null);

  // Photo capture & crop state
  const [selectedFile, setSelectedFile] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [croppedBlob, setCroppedBlob] = useState(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Canvas cropper adjustments
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialOffsetX: 0, initialOffsetY: 0 });
  const canvasRef = useRef(null);
  const imageObjRef = useRef(null);

  // Camera & Gallery file inputs
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // ── Load Portal Configuration ──────────────────────────────────────────────
  useEffect(() => {
    async function fetchMeta() {
      if (!token) {
        setLoadError('No upload token provided.');
        setLoading(false);
        return;
      }

      // Check local submission lock for this token
      const localSubmitted = localStorage.getItem(`cardflow_submitted_${token}`);
      if (localSubmitted) {
        setStep('locked');
      }

      try {
        const res = await photoCollectionApi.getPublicMeta(token);
        if (res.valid) {
          setPortalMeta(res);
          // Initialize verification field values
          const initVals = {};
          (res.verification_fields || []).forEach((f) => {
            initVals[f.name] = '';
          });
          setFormValues(initVals);
        } else {
          setLoadError(res.message || 'Invalid upload link.');
        }
      } catch (err) {
        console.error('Failed to load portal metadata:', err);
        setLoadError(err?.response?.data?.message || 'This upload link is inactive or has expired.');
      } finally {
        setLoading(false);
      }
    }
    fetchMeta();
  }, [token]);

  // ── Step 1: Verify Student Details ─────────────────────────────────────────
  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    setVerifyError('');

    // Ensure all verification fields are filled
    const missing = (portalMeta?.verification_fields || []).filter(
      (f) => !formValues[f.name] || !String(formValues[f.name]).trim()
    );
    if (missing.length > 0) {
      setVerifyError(`Please enter your ${missing.map((m) => m.label).join(', ')}.`);
      return;
    }

    setVerifying(true);
    try {
      const res = await photoCollectionApi.verifyStudent(token, {
        fields: formValues,
        device_id: deviceId,
      });

      if (res.success && res.student) {
        setVerifiedStudent(res.student);
        setStep('upload');
      } else {
        setVerifyError(res.message || 'Details do not match our records. Please try again.');
        if (res.status === 'already_submitted' || res.status === 'device_locked') {
          setStep('locked');
        }
      }
    } catch (err) {
      const status = err?.response?.data?.status;
      const msg = err?.response?.data?.message || 'Verification failed. Please check your details.';
      setVerifyError(msg);
      if (status === 'already_submitted' || status === 'device_locked') {
        setStep('locked');
      }
    } finally {
      setVerifying(false);
    }
  };

  // ── Step 2: Image Selection & Canvas Loading ────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setSubmitError('');
    setCroppedBlob(null);
    setCroppedPreviewUrl(null);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target.result;
      setImageSrc(src);

      const img = new Image();
      img.onload = () => {
        imageObjRef.current = img;
        drawCropper(img, 1, 0, { x: 0, y: 0 });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // ── Interactive HTML5 Canvas Cropper (3:4 ID Photo Ratio) ──────────────────
  const drawCropper = (img, currentZoom, currentRotation, currentOffset) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Viewport dimensions (300 x 400 = 3:4 aspect ratio)
    const cw = 300;
    const ch = 400;
    canvas.width = cw;
    canvas.height = ch;

    // Clear background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    // Move to canvas center
    ctx.translate(cw / 2 + currentOffset.x, ch / 2 + currentOffset.y);
    ctx.rotate((currentRotation * Math.PI) / 180);
    ctx.scale(currentZoom, currentZoom);

    // Calculate base fit (cover)
    const scale = Math.max(cw / img.width, ch / img.height);
    const nw = img.width * scale;
    const nh = img.height * scale;

    ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
    ctx.restore();
  };

  // Redraw when adjustments change
  useEffect(() => {
    if (imageObjRef.current) {
      drawCropper(imageObjRef.current, zoom, rotation, offset);
    }
  }, [zoom, rotation, offset]);

  // Touch & Mouse Drag Handlers for Canvas Panning
  const handlePointerDown = (e) => {
    setIsDragging(true);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      initialOffsetX: offset.x,
      initialOffsetY: offset.y,
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    setOffset({
      x: dragStartRef.current.initialOffsetX + dx,
      y: dragStartRef.current.initialOffsetY + dy,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // ── Confirm Crop & Export High-Res JPEG ─────────────────────────────────────
  const handleConfirmCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create high-res 600x800 output canvas for crisp card printing
    const outCanvas = document.createElement('canvas');
    outCanvas.width = 600;
    outCanvas.height = 800;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return;

    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, 600, 800);

    const img = imageObjRef.current;
    if (!img) return;

    outCtx.save();
    outCtx.translate(300 + offset.x * 2, 400 + offset.y * 2);
    outCtx.rotate((rotation * Math.PI) / 180);
    outCtx.scale(zoom * 2, zoom * 2);

    const scale = Math.max(300 / img.width, 400 / img.height);
    const nw = img.width * scale;
    const nh = img.height * scale;

    outCtx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
    outCtx.restore();

    outCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCroppedBlob(blob);
        const url = URL.createObjectURL(blob);
        setCroppedPreviewUrl(url);
      },
      'image/jpeg',
      0.92
    );
  };

  // ── Step 3: Final Submission to Backend ─────────────────────────────────────
  const handleSubmitPhoto = async () => {
    if (!croppedBlob || !verifiedStudent) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const formData = new FormData();
      formData.append('card_id', verifiedStudent.card_id);
      formData.append('device_id', deviceId);
      formData.append('fields', JSON.stringify(formValues));

      // Append file under media field name(s)
      const primaryMedia = portalMeta?.media_fields?.[0]?.name || 'PHOTO';
      formData.append(`image_${primaryMedia}`, croppedBlob, `photo_${verifiedStudent.card_id}.jpg`);

      const res = await photoCollectionApi.uploadPhoto(token, formData);

      if (res.success) {
        // Lock this portal on this device
        localStorage.setItem(`cardflow_submitted_${token}`, String(verifiedStudent.card_id));
        setStep('success');
      } else {
        setSubmitError(res.message || 'Upload failed. Please try again.');
      }
    } catch (err) {
      console.error('Photo submission error:', err);
      setSubmitError(err?.response?.data?.message || 'Failed to submit photo. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render: Loading State ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div className="portal-spinner" style={spinnerStyle} />
            <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '14px', fontWeight: 500 }}>
              Connecting to verification portal…
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Inactive / Load Error State ─────────────────────────────────────
  if (loadError) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ padding: '36px 24px', textAlign: 'center' }}>
            <div style={{ ...iconCircleStyle, background: '#fee2e2', color: '#ef4444' }}>
              <Lock size={28} />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '14px 0 8px' }}>
              Portal Unavailable
            </h2>
            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
              {loadError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Locked / Already Submitted State ───────────────────────────────
  if (step === 'locked') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ padding: '36px 24px', textAlign: 'center' }}>
            <div style={{ ...iconCircleStyle, background: '#fef3c7', color: '#d97706' }}>
              <ShieldCheck size={32} />
            </div>
            <h2 style={{ fontSize: '19px', fontWeight: 700, color: '#0f172a', margin: '16px 0 8px' }}>
              Submission Locked
            </h2>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.5, marginBottom: '20px' }}>
              {verifyError || 'A photo submission has already been received for this record or device. Further uploads are closed.'}
            </p>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', fontSize: '12.5px', color: '#64748b', textAlign: 'left' }}>
              <strong>Need to make changes?</strong> Please contact your institution or class teacher directly to request a photo update.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Success State ──────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ ...iconCircleStyle, background: '#dcfce7', color: '#16a34a' }}>
              <CheckCircle2 size={36} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '16px 0 8px' }}>
              Photo Submitted Successfully!
            </h2>
            <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.5, marginBottom: '20px' }}>
              Thank you, <strong>{verifiedStudent?.display_name || 'Student'}</strong>. Your photograph has been securely registered to your ID card.
            </p>

            {croppedPreviewUrl && (
              <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
                <img
                  src={croppedPreviewUrl}
                  alt="Submitted ID Card Photo"
                  style={{
                    width: '120px',
                    height: '160px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    border: '3px solid #ffffff',
                  }}
                />
              </div>
            )}

            <div style={{ background: '#f1f5f9', borderRadius: '10px', padding: '12px 16px', fontSize: '12.5px', color: '#475569', lineHeight: 1.45 }}>
              🔒 This verification link is now locked for your record to protect against accidental changes.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Render: Verification or Photo Upload Steps ────────────────────────
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Header Branding */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontWeight: 800, fontSize: '12px' }}>
              CF
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.85)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {portalMeta?.organisation_name || 'Pro Panel Portal'}
            </span>
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
            {portalMeta?.table_name || 'Student ID Card Photo'}
          </h1>
          <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)', margin: '4px 0 0', lineHeight: 1.4 }}>
            Official Student Photo Submission
          </p>
        </div>

        {/* Step 1: Verification Form */}
        {step === 'verify' && (
          <div style={{ padding: '24px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#1e293b' }}>
              <UserCheck size={18} style={{ color: '#2563eb' }} />
              <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Verify Your Student Record</h2>
            </div>

            <p style={{ fontSize: '12.5px', color: '#64748b', lineHeight: 1.45, marginBottom: '18px' }}>
              Please enter your details below exactly as registered with the school/college to confirm your identity.
            </p>

            {verifyError && (
              <div style={alertBoxStyle}>
                <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                <span>{verifyError}</span>
              </div>
            )}

            <form onSubmit={handleVerifySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(portalMeta?.verification_fields || []).map((f) => (
                <div key={f.name}>
                  <label style={labelStyle}>
                    {f.label} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formValues[f.name] || ''}
                    onChange={(e) => setFormValues({ ...formValues, [f.name]: e.target.value })}
                    placeholder={`Enter your ${f.label}`}
                    style={inputStyle}
                    autoComplete="off"
                    required
                  />
                </div>
              ))}

              <button
                type="submit"
                disabled={verifying}
                style={{
                  ...primaryBtnStyle,
                  marginTop: '6px',
                  opacity: verifying ? 0.75 : 1,
                  cursor: verifying ? 'wait' : 'pointer',
                }}
              >
                {verifying ? (
                  <>
                    <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Verifying Record…</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Continue</span>
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </form>

            {portalMeta?.instructions && (
              <div style={{ marginTop: '20px', padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', lineHeight: 1.45 }}>
                <div style={{ fontWeight: 600, color: '#334155', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <HelpCircle size={12} /> Important Notice
                </div>
                {portalMeta.instructions}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Photo Capture & Cropper Screen */}
        {step === 'upload' && (
          <div style={{ padding: '20px' }}>
            {/* Student Verified Identity Card */}
            <div style={verifiedBadgeStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#166534', textTransform: 'uppercase' }}>
                    Identity Confirmed
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {verifiedStudent?.display_name}
                  </div>
                </div>
              </div>
              {verifiedStudent?.summary && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #bbf7d0', display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '11.5px', color: '#15803d' }}>
                  {verifiedStudent.summary.slice(0, 3).map((s) => (
                    <span key={s.label}>
                      <strong>{s.label}:</strong> {s.value}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Hidden File Inputs */}
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="user"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <input
              type="file"
              ref={galleryInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Initial Capture Options */}
            {!imageSrc && (
              <div>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.45, marginBottom: '16px', textAlign: 'center' }}>
                  Choose how you want to provide your photograph:
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    style={actionPickBtnStyle}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={22} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Take Photo</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Use Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    style={actionPickBtnStyle}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Upload size={22} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Upload Photo</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>From Gallery</span>
                  </button>
                </div>

                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                  <strong>Photo Guidelines:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                    <li>Look straight at camera with a neutral expression</li>
                    <li>Ensure good lighting with no heavy shadows</li>
                    <li>Avoid sunglasses, caps, or side angles</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Canvas Cropper View */}
            {imageSrc && !croppedBlob && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Adjust & Crop (3:4 Ratio)
                  </span>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>Drag to center face</span>
                </div>

                {/* Canvas Container */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    background: '#0f172a',
                    borderRadius: '10px',
                    padding: '10px',
                    touchAction: 'none',
                    cursor: isDragging ? 'grabbing' : 'grab',
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                >
                  <canvas
                    ref={canvasRef}
                    style={{
                      borderRadius: '6px',
                      maxWidth: '100%',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>

                {/* Cropper Control Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '12px', padding: '8px 12px', background: '#f1f5f9', borderRadius: '8px' }}>
                  {/* Zoom Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                    <ZoomOut size={15} style={{ color: '#64748b' }} />
                    <input
                      type="range"
                      min="0.6"
                      max="2.5"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: '#2563eb' }}
                    />
                    <ZoomIn size={15} style={{ color: '#64748b' }} />
                  </div>

                  {/* Rotate 90 Button */}
                  <button
                    type="button"
                    onClick={() => setRotation((prev) => (prev + 90) % 360)}
                    title="Rotate 90 degrees"
                    style={cropControlBtnStyle}
                  >
                    <RotateCw size={14} />
                    <span>Rotate</span>
                  </button>
                </div>

                {/* Action Buttons: Confirm Crop or Choose Another Photo */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setImageSrc(null);
                      setSelectedFile(null);
                    }}
                    style={secondaryBtnStyle}
                  >
                    Choose Another
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCrop}
                    style={{ ...primaryBtnStyle, flex: 1.5 }}
                  >
                    Crop & Continue
                  </button>
                </div>
              </div>
            )}

            {/* Final Cropped Preview & Submit */}
            {croppedBlob && croppedPreviewUrl && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Preview ID Card Photo
                  </span>
                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                    <img
                      src={croppedPreviewUrl}
                      alt="Cropped Preview"
                      style={{
                        width: '160px',
                        height: '213px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
                        border: '3px solid #ffffff',
                      }}
                    />
                  </div>
                </div>

                {submitError && (
                  <div style={alertBoxStyle}>
                    <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                    <span>{submitError}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setCroppedBlob(null);
                      setCroppedPreviewUrl(null);
                    }}
                    style={secondaryBtnStyle}
                    disabled={submitting}
                  >
                    Re-crop
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitPhoto}
                    disabled={submitting}
                    style={{
                      ...primaryBtnStyle,
                      flex: 1.5,
                      background: '#16a34a',
                      opacity: submitting ? 0.75 : 1,
                      cursor: submitting ? 'wait' : 'pointer',
                    }}
                  >
                    {submitting ? (
                      <>
                        <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Submitting…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} />
                        <span>Confirm & Submit</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer info */}
        <div style={footerStyle}>
          <span>Secured by Pro Panel ID Management</span>
        </div>
      </div>
    </div>
  );
}

// ── Styles (Mobile-first Vanilla CSS with HSL Tokens) ────────────────────────
const containerStyle = {
  minHeight: '100vh',
  width: '100%',
  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  boxSizing: 'border-box',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const cardStyle = {
  width: '100%',
  maxWidth: '440px',
  background: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle = {
  background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
  padding: '20px',
  color: '#ffffff',
  textAlign: 'left',
};

const verifiedBadgeStyle = {
  background: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: '10px',
  padding: '12px 14px',
  marginBottom: '16px',
};

const labelStyle = {
  display: 'block',
  fontSize: '12.5px',
  fontWeight: 600,
  color: '#334155',
  marginBottom: '5px',
};

const inputStyle = {
  width: '100%',
  height: '40px',
  padding: '0 12px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  fontSize: '14px',
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border 0.15s ease',
};

const primaryBtnStyle = {
  height: '42px',
  borderRadius: '8px',
  background: '#2563eb',
  color: '#ffffff',
  border: 'none',
  fontSize: '14px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  cursor: 'pointer',
  transition: 'background 0.15s ease',
};

const secondaryBtnStyle = {
  height: '42px',
  borderRadius: '8px',
  background: '#f1f5f9',
  color: '#334155',
  border: '1px solid #cbd5e1',
  fontSize: '13px',
  fontWeight: 600,
  padding: '0 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  cursor: 'pointer',
};

const actionPickBtnStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '20px 12px',
  background: '#f8fafc',
  border: '1.5px dashed #cbd5e1',
  borderRadius: '12px',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const cropControlBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#334155',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
};

const alertBoxStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 12px',
  borderRadius: '8px',
  background: '#fef2f2',
  border: '1px solid #fee2e2',
  color: '#b91c1c',
  fontSize: '12.5px',
  marginBottom: '14px',
};

const iconCircleStyle = {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  margin: '0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const spinnerStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  border: '3px solid #e2e8f0',
  borderTopColor: '#2563eb',
  animation: 'spin 1s linear infinite',
  margin: '0 auto',
};

const footerStyle = {
  padding: '10px 16px',
  borderTop: '1px solid #f1f5f9',
  background: '#f8fafc',
  fontSize: '11px',
  color: '#94a3b8',
  textAlign: 'center',
};
