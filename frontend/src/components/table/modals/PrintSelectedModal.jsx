import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  Zap,
  Package,
  Download,
  CheckCircle2,
  X,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import apiClient, { exportApi } from '../../../services/api';

/**
 * PrintSelectedModal
 *
 * Dedicated modal for "Print Selected" action on approved cards.
 * Provides 2 options:
 *   1. Default (Auto Print): Sends selected data to automated print queue API (mock/static)
 *   2. Manual Print: Downloads a unified ZIP containing DOCX, XLSX, and Photos ZIP,
 *      and automatically moves all selected cards to Printed list.
 */
export default function PrintSelectedModal({
  table,
  tableId,
  selectedIds = [],
  onClose,
  addToast,
  onSuccess,
}) {
  const [printOption, setPrintOption] = useState('default'); // 'default' | 'manual'
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const tid = tableId || table?.id;
  const count = selectedIds.length;

  const handleConfirm = async () => {
    if (!tid || count === 0) {
      addToast?.('No cards selected for print', 'warning');
      return;
    }

    setIsProcessing(true);

    if (printOption === 'default') {
      /* ── 1. Default: Auto Print (Queue / Mock API) ── */
      try {
        setProgress(30);
        setStatusMessage('Connecting to print engine queue...');

        const res = await exportApi.queueAutoPrint(tid, selectedIds);
        setProgress(100);

        addToast?.(
          res.message || `Auto-print job #${res.job_id || 'PRT'} queued for ${count} card(s)`,
          'success'
        );

        onClose();
        if (onSuccess) onSuccess();
      } catch (err) {
        console.error('Auto print error:', err);
        const errMsg = err?.response?.data?.message || 'Failed to queue auto print job. Please try again.';
        addToast?.(errMsg, 'error');
      } finally {
        setIsProcessing(false);
      }
    } else {
      /* ── 2. Manual Print: Master ZIP (DOCX + XLSX + Photos ZIP) & Status Transition ── */
      try {
        setProgress(20);
        setStatusMessage('Building DOCX formatted cards with photos...');

        const response = await exportApi.downloadPrintPackage(tid, selectedIds, 'approved');

        // Check if response is actually a JSON error payload
        const contentType = response.headers?.['content-type'] || response.data?.type || '';
        if (contentType.includes('application/json')) {
          const text = await response.data.text();
          try {
            const json = JSON.parse(text);
            if (!json.success) {
              addToast?.(json.message || 'Failed to generate print package', 'error');
              setIsProcessing(false);
              return;
            }
          } catch (_) {}
        }

        setProgress(70);
        setStatusMessage('Compressing print package (DOCX, XLSX, Photos ZIP)...');

        const blob = new Blob([response.data], { type: 'application/zip' });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;

        // Extract filename from Content-Disposition if present
        let suggestedName = `table_${tid}_Print_Package.zip`;
        const disp = response.headers?.['content-disposition'] || '';
        const match = disp.match(/filename="?([^";]+)"?/i);
        if (match && match[1]) {
          suggestedName = match[1];
        }

        link.download = suggestedName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);

        setProgress(85);
        setStatusMessage('Updating card statuses to Printed...');

        // Transition cards to printed
        await apiClient.post(`/api/table/${tid}/cards/bulk-status/`, {
          card_ids: selectedIds,
          status: 'printed',
        });

        setProgress(100);
        addToast?.(`Downloaded print package and moved ${count} card(s) to Printed list`, 'success');

        onClose();
        if (onSuccess) onSuccess();
      } catch (err) {
        console.error('Manual print package error:', err);
        let errMsg = 'Failed to generate print package. Please try again.';
        if (err?.response?.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            const json = JSON.parse(text);
            if (json.message) errMsg = json.message;
          } catch (_) {}
        } else if (err?.response?.data?.message) {
          errMsg = err.response.data.message;
        }
        addToast?.(errMsg, 'error');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return createPortal(
    <div
      className="center-modal-overlay"
      onWheel={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="center-modal-panel confirm-modal-panel"
        style={{
          width: '580px',
          maxWidth: '92vw',
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'confirmModalPop 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            height: '48px',
            background: '#1e293b',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px',
            flexShrink: 0,
            borderBottom: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Printer size={18} color="#93c5fd" />
            <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.2px' }}>
              Print Selected Cards
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px',
              transition: 'color 0.15s ease',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '20px 22px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Card Summary Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: '6px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>
              Select print mode for the selected items:
            </div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#2563eb',
                background: '#eff6ff',
                padding: '3px 10px',
                borderRadius: '999px',
                border: '1px solid #bfdbfe',
              }}
            >
              {count} {count === 1 ? 'card' : 'cards'} selected
            </div>
          </div>

          {/* Option 1: Default (Auto Print) */}
          <div
            onClick={() => !isProcessing && setPrintOption('default')}
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              border: printOption === 'default' ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: printOption === 'default' ? '#eff6ff' : '#ffffff',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              gap: '14px',
              alignItems: 'flex-start',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="radio"
              name="printOption"
              checked={printOption === 'default'}
              onChange={() => setPrintOption('default')}
              disabled={isProcessing}
              style={{ marginTop: '3px', cursor: 'pointer' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Zap size={16} color="#2563eb" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                  Default (Auto Print)
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    background: '#dbeafe',
                    color: '#1e40af',
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                >
                  Direct Queue
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', lineHeight: 1.45 }}>
                Send card data to the automated background print engine. When the card printing station
                connects, the printing software launches and starts printing automatically.
              </p>
            </div>
          </div>

          {/* Option 2: Manual Print Package */}
          <div
            onClick={() => !isProcessing && setPrintOption('manual')}
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              border: printOption === 'manual' ? '2px solid #10b981' : '1px solid #e2e8f0',
              background: printOption === 'manual' ? '#f0fdf4' : '#ffffff',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              gap: '14px',
              alignItems: 'flex-start',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="radio"
              name="printOption"
              checked={printOption === 'manual'}
              onChange={() => setPrintOption('manual')}
              disabled={isProcessing}
              style={{ marginTop: '3px', cursor: 'pointer' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Package size={16} color="#059669" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                  Manual Print
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    background: '#d1fae5',
                    color: '#065f46',
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                >
                  Full ZIP Package
                </span>
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.45 }}>
                Downloads a single ZIP package consisting of 3 items, and automatically moves all selected
                cards to the <strong>Printed List</strong>:
              </p>

              {/* 3 Package Items Pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: '#e0f2fe',
                    color: '#0369a1',
                  }}
                >
                  <FileText size={12} /> Word document (.docx with photos)
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: '#ecfdf5',
                    color: '#047857',
                  }}
                >
                  <FileSpreadsheet size={12} /> Excel file (.xlsx)
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: '#fef3c7',
                    color: '#b45309',
                  }}
                >
                  <ImageIcon size={12} /> Photos archive (.zip)
                </span>
              </div>
            </div>
          </div>

          {/* Progress / Status display when processing */}
          {isProcessing && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={14} className="spin" /> {statusMessage || 'Processing...'}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb' }}>{progress}%</span>
              </div>
              <div style={{ height: '6px', width: '100%', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    background: printOption === 'manual' ? '#10b981' : '#2563eb',
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            height: '56px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            padding: '0 18px',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            style={{
              padding: '0 14px',
              height: '32px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '5px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isProcessing || count === 0}
            onClick={handleConfirm}
            style={{
              padding: '0 16px',
              height: '32px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '5px',
              border: 'none',
              background: printOption === 'manual' ? '#10b981' : '#2563eb',
              color: '#ffffff',
              cursor: isProcessing || count === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              transition: 'background 0.15s ease',
            }}
          >
            {isProcessing ? (
              <>
                <Loader2 size={14} className="spin" />
                <span>Processing...</span>
              </>
            ) : printOption === 'manual' ? (
              <>
                <Download size={14} />
                <span>Download</span>
              </>
            ) : (
              <>
                <Printer size={14} />
                <span>Auto Print</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
