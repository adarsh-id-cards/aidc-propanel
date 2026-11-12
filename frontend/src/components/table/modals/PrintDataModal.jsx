import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText, FileSpreadsheet, AlertTriangle, CheckSquare, Square } from 'lucide-react';
import CustomSelect from '../../common/CustomSelect';
import CustomCheckbox from '../../common/CustomCheckbox';
import apiClient, { exportApi } from '../../../services/api';

export default function PrintDataModal({
  table,
  tableId,
  status,
  cardCount,
  availableClasses = [],
  onClose,
  addToast,
  onStatusTransition,
}) {
  const [format, setFormat] = useState('docx'); // 'docx' | 'xlsx'
  const [template, setTemplate] = useState('');
  const [templatesList, setTemplatesList] = useState([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // Page break settings
  const [breakClassSection, setBreakClassSection] = useState(true);
  const [breakClassOnly, setBreakClassOnly] = useState(false);
  const [customBreak, setCustomBreak] = useState(false);
  const [customBreakPages, setCustomBreakPages] = useState(10);

  // Custom class filtering for Word export
  const [classFilterEnabled, setClassFilterEnabled] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState([]);

  // Processing & progress
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Preparing print export...');

  const fields = useMemo(() => table?.fields || [], [table?.fields]);
  const isDenseTable = fields.length > 15;

  // Body scroll lock on mount
  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, []);

  // Escape key handler
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isProcessing]);

  // Extract unique classes from availableClasses prop or table cards
  const uniqueClasses = useMemo(() => {
    const raw = Array.isArray(availableClasses) ? availableClasses : [];
    const valid = raw.map((c) => String(c).trim()).filter(Boolean);
    return Array.from(new Set(valid)).sort();
  }, [availableClasses]);

  // Load export templates from backend
  useEffect(() => {
    let isMounted = true;
    const fetchTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const data = await exportApi.getExportTemplates();
        if (isMounted && data && Array.isArray(data.templates)) {
          setTemplatesList(data.templates);
          // Auto-select default template if configured
          const defTpl = data.templates.find((t) => t.is_default);
          if (defTpl) {
            setTemplate(String(defTpl.id));
          }
        }
      } catch (err) {
        console.warn('Failed to load export templates:', err);
      } finally {
        if (isMounted) setIsLoadingTemplates(false);
      }
    };
    fetchTemplates();
    return () => {
      isMounted = false;
    };
  }, []);

  const templateOptions = useMemo(() => {
    const opts = [{ value: '', label: 'Default (No Footer Text)' }];
    templatesList.forEach((t) => {
      opts.push({
        value: String(t.id),
        label: `${t.name}${t.is_default ? ' (Default)' : ''}`,
      });
    });
    return opts;
  }, [templatesList]);

  // Toggle class selection
  const handleToggleClass = (cls) => {
    setSelectedClasses((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  };

  const handleSelectAllClasses = () => {
    setSelectedClasses([...uniqueClasses]);
  };

  const handleClearAllClasses = () => {
    setSelectedClasses([]);
  };

  const handlePrintDownload = async () => {
    const tid = table?.id || tableId;
    if (!tid) {
      addToast?.('Table not found', 'error');
      return;
    }

    if (classFilterEnabled && selectedClasses.length === 0) {
      addToast?.('Please select at least one class to download, or uncheck "Download By Custom Class"', 'warning');
      return;
    }

    setIsProcessing(true);
    setProgress(20);
    setStatusMessage(`Preparing ${format.toUpperCase()} export...`);

    try {
      const endpoint = format === 'docx' ? `/api/table/${tid}/cards/download-docx/` : `/api/table/${tid}/cards/download-xlsx/`;
      const payload = {
        status: status || 'approved',
        template: template || undefined,
        template_id: template ? Number(template) : undefined,
        breakClassSection,
        breakClassOnly,
        customBreak,
        customBreakPages: Number(customBreakPages) || 10,
        break_mode: breakClassSection ? 'class_section' : breakClassOnly ? 'class_only' : 'none',
        break_enabled: breakClassSection || breakClassOnly || customBreak,
        break_pages: customBreak ? Number(customBreakPages) || 10 : 0,
        class_filter_enabled: classFilterEnabled,
        selected_classes: classFilterEnabled ? selectedClasses : [],
      };

      setProgress(45);
      setStatusMessage(`Rendering ${format.toUpperCase()} document...`);

      const response = await apiClient.post(endpoint, payload, { responseType: 'blob' });

      // Check if response is actually a JSON error payload
      const contentType = response.headers?.['content-type'] || response.data?.type || '';
      if (contentType.includes('application/json')) {
        const text = await response.data.text();
        try {
          const json = JSON.parse(text);
          if (!json.success) {
            addToast?.(json.message || `Failed to export ${format.toUpperCase()}`, 'error');
            setIsProcessing(false);
            return;
          }
        } catch (_) {}
      }

      setProgress(85);
      setStatusMessage('Finalizing file download...');

      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `table_${tid}_cards.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setProgress(100);
      addToast?.(`Generated ${format.toUpperCase()} print file (${cardCount} cards)`, 'success');

      if (status === 'approved' && onStatusTransition) {
        onStatusTransition('printed');
        addToast?.('Cards moved to Printed list', 'info');
      }

      onClose();
    } catch (err) {
      console.error('Print download error:', err);
      // Attempt to decode error message if response was a Blob
      let errMsg = 'Failed to generate print file. Please try again.';
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
  };

  return createPortal(
    <div
      className="center-modal-overlay"
      onWheel={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="center-modal-panel modal-md"
        style={{
          width: 'var(--modal-width-md, 580px)',
          minWidth: 'min(480px, 92vw)',
          minHeight: 'min(400px, 82vh)',
          height: 'auto',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
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
              fontSize: '14px',
              fontWeight: 700,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#fff',
            }}
          >
            <Printer size={16} style={{ color: '#f59e0b' }} /> Print Data Export
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Format Navigation Tabs */}
        <div className="download-modal-format-tabs">
          <button
            type="button"
            className={`download-modal-format-tab ${format === 'docx' ? 'is-active-docx' : ''}`}
            onClick={() => setFormat('docx')}
          >
            <FileText size={16} /> Word (.docx)
          </button>
          <button
            type="button"
            className={`download-modal-format-tab ${format === 'xlsx' ? 'is-active-xlsx' : ''}`}
            onClick={() => setFormat('xlsx')}
          >
            <FileSpreadsheet size={16} /> Excel (.xlsx)
          </button>
        </div>

        {/* Body Area */}
        <div
          style={{
            flex: 1,
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            overflowY: 'auto',
          }}
        >
          {/* Dense Column Warning (if > 15 columns) */}
          {isDenseTable && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 14px',
                background: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: '6px',
                color: '#b45309',
                fontSize: '12.5px',
              }}
            >
              <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Many Columns Detected ({fields.length} columns)</strong>
                <div style={{ marginTop: '2px', color: '#92400e', fontSize: '12px' }}>
                  Auto-fit column balancing is active. Table margins and text scaling will optimize automatically for print layout.
                </div>
              </div>
            </div>
          )}

          {/* Options Panel */}
          <div
            style={{
              background: '#f8fafc',
              padding: '14px 16px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  margin: 0,
                }}
              >
                Print &amp; Page Layout Options ({cardCount} cards)
              </label>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Status: <strong style={{ color: '#1e293b', textTransform: 'capitalize' }}>{status || 'Approved'}</strong>
              </span>
            </div>

            {/* Template Selector */}
            <div>
              <label
                style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}
              >
                Print Footer Template:
              </label>
              <CustomSelect
                value={template}
                onChange={(val) => setTemplate(val)}
                options={templateOptions}
                placeholder={isLoadingTemplates ? 'Loading templates...' : 'Default (No Footer Text)'}
              />
              <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                Template determines institutional footer text printed on bottom of every page.
              </span>
            </div>

            {/* Custom Class Filter (for Word .docx) */}
            {format === 'docx' && uniqueClasses.length > 0 && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <CustomCheckbox
                    checked={classFilterEnabled}
                    onChange={(val) => {
                      setClassFilterEnabled(val);
                      if (val && selectedClasses.length === 0) {
                        setSelectedClasses([...uniqueClasses]);
                      }
                    }}
                    label={<strong style={{ color: '#1e293b' }}>Download By Custom Class</strong>}
                    description="Select specific classes to download. Cards from other classes will be excluded."
                  />
                  {classFilterEnabled && (
                    <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                      <button
                        type="button"
                        onClick={handleSelectAllClasses}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563eb',
                          cursor: 'pointer',
                          fontWeight: 600,
                          padding: '0',
                        }}
                      >
                        Select All
                      </button>
                      <span style={{ color: '#cbd5e1' }}>|</span>
                      <button
                        type="button"
                        onClick={handleClearAllClasses}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          fontWeight: 600,
                          padding: '0',
                        }}
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>

                {classFilterEnabled && (
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                      gap: '8px',
                      maxHeight: '140px',
                      overflowY: 'auto',
                      padding: '8px',
                      background: '#f8fafc',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    {uniqueClasses.map((cls) => {
                      const isSelected = selectedClasses.includes(cls);
                      return (
                        <label
                          key={cls}
                          onClick={() => handleToggleClass(cls)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            fontWeight: isSelected ? 600 : 500,
                            color: isSelected ? '#1e40af' : '#475569',
                            background: isSelected ? '#eff6ff' : '#ffffff',
                            border: isSelected ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          {isSelected ? (
                            <CheckSquare size={13} style={{ color: '#2563eb' }} />
                          ) : (
                            <Square size={13} style={{ color: '#94a3b8' }} />
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cls}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Page Break Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <CustomCheckbox
                checked={breakClassSection}
                onChange={(val) => {
                  setBreakClassSection(val);
                  if (val) setBreakClassOnly(false);
                }}
                label="Break Pages By Class + Section"
                description="Starts a new printed page when class or section changes."
              />

              <CustomCheckbox
                checked={breakClassOnly}
                onChange={(val) => {
                  setBreakClassOnly(val);
                  if (val) setBreakClassSection(false);
                }}
                label="Break Pages By Class Only"
                description="Starts a new printed page only when class changes."
              />

              <CustomCheckbox
                checked={customBreak}
                onChange={(val) => setCustomBreak(val)}
                label={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span>Custom Page Break (split large files after N pages):</span>
                    {customBreak && (
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={customBreakPages}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setCustomBreakPages(e.target.value)}
                        style={{
                          width: '56px',
                          height: '24px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '12px',
                          padding: '0 6px',
                          outline: 'none',
                        }}
                      />
                    )}
                  </span>
                }
              />
            </div>
          </div>

          {/* Progress Indicator */}
          {isProcessing && (
            <div style={{ background: '#eff6ff', padding: '12px 14px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8' }}>
                  {statusMessage}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af' }}>{progress}%</span>
              </div>
              <div style={{ height: '6px', background: '#dbeafe', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    background: '#2563eb',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
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
            type="button"
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
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrintDownload}
            style={{
              padding: '8px 20px',
              background: '#f59e0b',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              fontWeight: 700,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            }}
            disabled={isProcessing}
          >
            <Printer size={15} /> {isProcessing ? 'Generating...' : `Generate & Print ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
