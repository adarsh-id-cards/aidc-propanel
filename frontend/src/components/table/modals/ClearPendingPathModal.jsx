import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eraser, X, Loader2, CheckCircle2 } from 'lucide-react';
import CustomSelect from '../../common/CustomSelect';
import apiClient from '../../../services/api';

const IMAGE_FIELD_TYPES = new Set([
  'photo',
  'image',
  'img',
  'picture',
  'pic',
  'photo_path',
  'rel_photo',
  'mother_photo',
  'father_photo',
  'sign',
  'signature',
  'qr',
  'qrcode',
  'barcode',
]);

const isImageField = (type, name) =>
  IMAGE_FIELD_TYPES.has((type || '').toLowerCase()) ||
  IMAGE_FIELD_TYPES.has((name || '').toLowerCase().replace(/ /g, '_'));

export default function ClearPendingPathModal({ table, status, tableFields, onClose, onSuccess, addToast }) {
  const imageFields = useMemo(() => {
    const fields = (tableFields || []).filter((f) => isImageField(f.type, f.name)).map((f) => f.name.toUpperCase());
    return fields.length > 0 ? fields : ['PHOTO'];
  }, [tableFields]);

  const [column, setColumn] = useState(imageFields[0] || 'PHOTO');
  const [step, setStep] = useState('confirm'); // 'confirm' | 'scanning' | 'result'
  const [resultData, setResultData] = useState(null);

  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig;
    };
  }, []);

  const handleScanAndClear = async () => {
    setStep('scanning');

    try {
      const res = await apiClient.post(`/api/table/${table?.id}/cards/clear-pending-paths/`, {
        column,
        status,
      });

      const clearedCount = res.data?.cleared_count ?? res.data?.cleared ?? 0;
      const scannedCount = res.data?.total_scanned ?? res.data?.scanned ?? 0;

      setResultData({ clearedCount, scannedCount });
      setStep('result');
      addToast?.(`Cleared paths for ${clearedCount} card(s)`, 'success');
      onSuccess?.();
    } catch (err) {
      console.error('Clear pending paths error:', err);
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Failed to clear pending paths.';
      addToast?.(msg, 'error');
      setStep('confirm');
    }
  };

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
            <Eraser size={18} /> Clear Pending Paths
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}>
            <X size={18} />
          </button>
        </div>

        <div
          style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}
        >
          {step === 'confirm' && (
            <>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    minWidth: '48px',
                    borderRadius: '50%',
                    background: '#fef3c7',
                    color: '#d97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Eraser size={24} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                    Scan & Clear Paths
                  </h4>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                    This will scan all cards in the current list and clear the image paths for cards whose image files
                    are missing on disk.
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#d97706', fontWeight: 600 }}>
                    Note: No card data/text will be deleted. Only missing image references will be cleared.
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  padding: '14px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  marginTop: '6px',
                }}
              >
                <label
                  style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}
                >
                  Select Image Column:
                </label>
                <CustomSelect
                  value={column}
                  onChange={(val) => setColumn(val)}
                  options={imageFields.map((f) => ({ value: f, label: f }))}
                />
              </div>
            </>
          )}

          {step === 'scanning' && (
            <div style={{ padding: '24px 10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="skeleton-shimmer" style={{ width: '40px', height: '40px', borderRadius: '8px' }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="skeleton-shimmer" style={{ width: '65%', height: '14px', borderRadius: '4px' }} />
                    <div className="skeleton-shimmer" style={{ width: '40%', height: '10px', borderRadius: '4px' }} />
                  </div>
                </div>
                <div className="skeleton-shimmer" style={{ width: '100%', height: '8px', borderRadius: '4px' }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', textAlign: 'center', marginTop: '4px' }}>
                  Scanning files and clearing paths, please wait...
                </div>
              </div>
            </div>
          )}

          {step === 'result' && (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  minWidth: '48px',
                  borderRadius: '50%',
                  background: '#d1fae5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  Scan Completed!
                </h4>
                <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                  Cleared paths for <strong>{resultData?.clearedCount ?? 0}</strong> card(s) out of{' '}
                  <strong>{resultData?.scannedCount ?? 0}</strong> scanned.
                </p>
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
          {step === 'confirm' && (
            <>
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
              >
                Cancel
              </button>
              <button
                onClick={handleScanAndClear}
                style={{
                  padding: '8px 18px',
                  background: '#f59e0b',
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
                <Eraser size={14} /> Scan & Clear
              </button>
            </>
          )}

          {step === 'result' && (
            <button
              onClick={onClose}
              style={{
                padding: '8px 20px',
                background: '#10b981',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
