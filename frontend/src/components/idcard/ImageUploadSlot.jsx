import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, RotateCcw, RotateCw, Trash2, Image as ImageIcon, Check, FileText } from 'lucide-react';
import { cardApi } from '../../services/api';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';

const getImgSrc = (path) => {
  if (!path) return '';
  let s = String(path).trim();
  if (s.startsWith('PENDING:')) return '';
  if (!s || s === 'NOT_FOUND') return '';
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('blob:')) {
    return s;
  }
  if (s.startsWith('/media/')) return s;
  if (s.startsWith('media/')) return `/${s}`;
  if (s.startsWith('/')) return `/media${s}`;
  return `/media/${s}`;
};

export default function ImageUploadSlot({
  cardId,
  fieldName,
  currentPath,
  onUpdate,
  isSuperAdmin: isSuperAdminProp,
}) {
  const [loading, setLoading] = useState(false);
  const [imagePath, setImagePath] = useState(currentPath || '');
  const [imgError, setImgError] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: 'undo',
    pin: '',
  });
  const fileInputRef = useRef(null);

  const isSuperAdmin = useMemo(() => {
    if (isSuperAdminProp !== undefined) return Boolean(isSuperAdminProp);
    try {
      const cached = localStorage.getItem('cf_auth_user') || sessionStorage.getItem('cf_auth_user');
      if (cached) {
        const u = JSON.parse(cached);
        const r = String(u.role || '').toLowerCase();
        return ['super_admin', 'prime_admin'].includes(r) || Boolean(u.is_superuser);
      }
    } catch (_) {}
    return false;
  }, [isSuperAdminProp]);

  useEffect(() => {
    setImagePath(currentPath || '');
    setImgError(false);
  }, [currentPath]);

  const updatePath = (newPath) => {
    setImagePath(newPath);
    setImgError(false);
    if (onUpdate) onUpdate(fieldName, newPath);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        updatePath(dataUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemove = () => {
    updatePath('');
  };

  const promptRemove = () => {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setConfirmModal({
      isOpen: true,
      type: 'remove',
      pin,
    });
  };

  const promptUndo = () => {
    if (!isSuperAdmin || !cardId) return;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setConfirmModal({
      isOpen: true,
      type: 'undo',
      pin,
    });
  };

  const promptRedo = () => {
    if (!isSuperAdmin || !cardId) return;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setConfirmModal({
      isOpen: true,
      type: 'redo',
      pin,
    });
  };

  const handleUndo = async () => {
    if (!cardId || !isSuperAdmin) return;
    setLoading(true);
    try {
      const res = await cardApi.undoImage(cardId, fieldName);
      if (res?.success && res?.restored_path) {
        updatePath(res.restored_path);
      } else if (res?.message) {
        alert(res.message);
      }
    } catch (err) {
      console.error('Error undoing image:', err);
      alert(err.response?.data?.message || 'Failed to undo image version.');
    } finally {
      setLoading(false);
    }
  };

  const handleRedo = async () => {
    if (!cardId || !isSuperAdmin) return;
    setLoading(true);
    try {
      const res = await cardApi.redoImage(cardId, fieldName);
      if (res?.success && res?.restored_path) {
        updatePath(res.restored_path);
      } else if (res?.message) {
        alert(res.message);
      }
    } catch (err) {
      console.error('Error redoing image:', err);
      alert(err.response?.data?.message || 'Failed to redo image version.');
    } finally {
      setLoading(false);
    }
  };

  const isSig = (fieldName || '').toLowerCase().includes('sign');
  const isQr = (fieldName || '').toLowerCase().includes('qr');
  const isBar = (fieldName || '').toLowerCase().includes('bar');

  // Uniform thumbnail preview dimensions matching photo cards
  const thumbW = isSig ? '95px' : isQr || isBar ? '75px' : '75px';
  const thumbH = isSig ? '70px' : isQr || isBar ? '75px' : '85px';

  const hasPath = Boolean(imagePath && imagePath.trim() !== '');
  const isDataUrl = hasPath && imagePath.startsWith('data:');
  const isLoaded = hasPath && (!imgError || isDataUrl);
  const isPathOnly = hasPath && imgError && !isDataUrl;

  const imgSrc = getImgSrc(imagePath);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        background: '#ffffff',
        width: '100%',
        boxSizing: 'border-box',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
      }}
    >
      {/* Sleek Dark Banner Header */}
      <div
        style={{
          background: '#1e293b',
          color: '#ffffff',
          padding: '7px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #334155',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: '#ffffff',
          }}
        >
          {fieldName}
        </span>

        {/* Status Badge */}
        {isLoaded ? (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#4ade80',
              background: 'rgba(74, 222, 128, 0.15)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              padding: '1px 7px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            <Check size={10} /> Loaded
          </span>
        ) : isPathOnly ? (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#fbbf24',
              background: 'rgba(251, 191, 36, 0.15)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              padding: '1px 7px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            <FileText size={10} /> Path Set
          </span>
        ) : (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#94a3b8',
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '1px 7px',
              borderRadius: '10px',
            }}
          >
            Empty
          </span>
        )}
      </div>

      {/* Main Body: Thumbnail + Grouped Action Buttons */}
      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#f8fafc',
          flex: 1,
        }}
      >
        {/* Thumbnail Preview Box */}
        <div
          style={{
            width: thumbW,
            height: thumbH,
            minWidth: thumbW,
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
            position: 'relative',
            margin: '0 auto',
          }}
        >
          {hasPath && !imgError ? (
            <img
              src={imgSrc}
              alt={fieldName}
              style={{ width: '100%', height: '100%', objectFit: isSig || isQr || isBar ? 'contain' : 'cover' }}
              onError={() => setImgError(true)}
            />
          ) : isPathOnly ? (
            <div style={{ textAlign: 'center', padding: '4px', color: '#d97706' }}>
              <FileText size={20} style={{ margin: '0 auto 2px' }} />
              <div style={{ fontSize: '10px', fontWeight: 700, lineHeight: 1 }}>PATH ONLY</div>
            </div>
          ) : (
            <ImageIcon size={22} style={{ color: '#cbd5e1' }} />
          )}
        </div>

        {/* Grouped Action Buttons */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
          {/* Primary Action Pair: Upload + Remove */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="img-slot-btn img-slot-upload-btn"
              title="Upload photo from device"
            >
              <Upload size={12} />
              <span>Upload</span>
            </button>

            {hasPath && (
              <button
                type="button"
                onClick={promptRemove}
                className="img-slot-btn img-slot-remove-btn"
                title="Remove photo"
              >
                <Trash2 size={12} />
                <span>Remove</span>
              </button>
            )}
          </div>

          {/* History Action Pair: Undo + Redo together (Super Admin Only) */}
          {isSuperAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={promptUndo}
                disabled={loading || !cardId}
                className="img-slot-btn"
                title="Undo image version"
              >
                <RotateCcw size={11} />
                <span>Undo</span>
              </button>

              <button
                type="button"
                onClick={promptRedo}
                disabled={loading || !cardId}
                className="img-slot-btn"
                title="Redo image version"
              >
                <RotateCw size={11} />
                <span>Redo</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Path Input Footer */}
      <div style={{ padding: '6px 12px 10px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
        <input
          type="text"
          className="img-slot-path-input"
          value={imagePath}
          placeholder="Enter image filename or path (e.g., photo.jpg)..."
          onChange={(e) => updatePath(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {confirmModal.isOpen && (
        <ConfirmDeleteModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          onConfirm={() => {
            if (confirmModal.type === 'undo') {
              handleUndo();
            } else if (confirmModal.type === 'redo') {
              handleRedo();
            } else {
              handleRemove();
            }
          }}
          title={
            confirmModal.type === 'undo'
              ? 'Confirm Undo Image Change'
              : confirmModal.type === 'redo'
              ? 'Confirm Redo Image Change'
              : `Confirm Remove ${fieldName || 'Photo'}`
          }
          customMessage={
            confirmModal.type === 'undo'
              ? `Do you really want to undo the image for "${fieldName}"? The previous image (retained for up to 30 days) will be restored.`
              : confirmModal.type === 'redo'
              ? `Do you really want to redo the image change for "${fieldName}"? Please enter the verification PIN below to confirm.`
              : `Are you sure you want to permanently remove the image for "${fieldName}"? Please enter the verification PIN below to confirm.`
          }
          requiresCode={true}
          deleteCode={confirmModal.pin}
          confirmText={confirmModal.type === 'undo' ? 'Undo' : confirmModal.type === 'redo' ? 'Redo' : 'Remove'}
          confirmVariant={confirmModal.type === 'remove' ? 'danger' : 'primary'}
          icon={
            confirmModal.type === 'remove' ? (
              <Trash2 size={24} style={{ color: '#ef4444' }} />
            ) : confirmModal.type === 'redo' ? (
              <RotateCw size={24} style={{ color: '#2563eb' }} />
            ) : (
              <RotateCcw size={24} style={{ color: '#2563eb' }} />
            )
          }
        />
      )}
    </div>
  );
}
