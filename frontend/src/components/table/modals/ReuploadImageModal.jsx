import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X, Image as ImageIcon } from 'lucide-react';
import apiClient from '../../../services/api';

const ID_CARD_STATUS_LIST = [
  { key: 'pending', label: 'Pending', bg: '#f59e0b', bgLight: '#fef3c7', color: '#d97706' },
  { key: 'verified', label: 'Verified', bg: '#10b981', bgLight: '#d1fae5', color: '#059669' },
  { key: 'approved', label: 'Approved', bg: '#3b82f6', bgLight: '#dbeafe', color: '#2563eb' },
  { key: 'printed', label: 'Printed', bg: '#64748b', bgLight: '#f1f5f9', color: '#475569' },
  { key: 'deleted', label: 'Deleted', bg: '#ef4444', bgLight: '#fee2e2', color: '#dc2626' },
];

const REPRINT_STATUS_LIST = [
  { key: 'reprint', label: 'Reprinting', bg: '#06b6d4', bgLight: '#cff4fc', color: '#0891b2' },
  { key: 'request', label: 'Requested', bg: '#a855f7', bgLight: '#f3e8ff', color: '#9333ea' },
  { key: 'confirm', label: 'Confirmed', bg: '#10b981', bgLight: '#d1fae5', color: '#059669' },
];

const STATUS_LIST = [...ID_CARD_STATUS_LIST, ...REPRINT_STATUS_LIST];

export default function ReuploadImageModal({ table, status, cardCount, onClose, onSuccess, addToast }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig;
    };
  }, []);

  const handleUpload = async () => {
    if (!file || !table?.id) return;
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append('photos_zip', file);
      fd.append('zip_file', file);
      fd.append('status', status || 'pending');

      await apiClient.post(`/api/table/${table.id}/cards/reupload-images/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      addToast?.('Images reuploaded & matched successfully', 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Reupload images error:', err);
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Failed to reupload & match images.';
      addToast?.(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const statusLabel = STATUS_LIST.find((s) => s.key === status)?.label || 'Current List';

  return createPortal(
    <div
      className="center-modal-overlay"
      onWheel={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div className="center-modal-panel modal-md" style={{ width: 'var(--modal-width-md, 580px)', minWidth: 'min(460px, 92vw)', minHeight: 'min(360px, 80vh)', height: 'auto', maxHeight: '90vh' }}>
        <div
          style={{
            background: '#1e293b',
            color: '#fff',
            height: '48px',
            minHeight: '48px',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 700,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#fff',
            }}
          >
            <RefreshCw size={16} style={{ color: '#0d9488' }} /> Reupload Images
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
            <X size={18} />
          </button>
        </div>

        <div
          style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}
        >
          <div
            style={{
              display: 'flex',
              gap: '16px',
              background: '#f8fafc',
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
            }}
          >
            <div>
              List: <strong style={{ color: '#0f172a' }}>{statusLabel}</strong>
            </div>
            <div>
              Cards: <strong style={{ color: '#0f172a' }}>{cardCount}</strong>
            </div>
          </div>

          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Upload a ZIP file containing photo/signature images. Filenames will be matched automatically against the
            cards in this list.
          </p>

          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed #0d9488',
              borderRadius: '8px',
              padding: '32px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: '#f0fdfa',
              transition: 'all 0.15s ease',
            }}
          >
            <ImageIcon size={36} style={{ color: '#0d9488', margin: '0 auto 10px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#134e4a' }}>
              {file ? file.name : 'Click or drag & drop a ZIP file'}
            </div>
            <div style={{ fontSize: '12px', color: '#0f766e', marginTop: '4px' }}>Accepts .zip archives</div>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>

          {uploading && (
            <div style={{ background: '#f0fdfa', padding: '12px', borderRadius: '6px', border: '1px solid #99f6e4' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f766e', marginBottom: '6px' }}>
                Uploading and matching images...
              </div>
              <div style={{ height: '6px', background: '#ccfbf1', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '80%', background: '#0d9488', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              color: '#475569',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '13px',
            }}
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{
              padding: '8px 18px',
              background: '#0d9488',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={14} /> {uploading ? 'Matching...' : 'Upload & Match'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
