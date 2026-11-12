import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  X,
  Image as ImageIcon,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Tag,
  Maximize2,
  FileArchive,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import CustomCheckbox from '../../common/CustomCheckbox';
import CustomSelect from '../../common/CustomSelect';
import apiClient, { exportApi } from '../../../services/api';

export default function DownloadDataModal({ table, tableId, status, cardCount, onClose, addToast }) {
  // Format tabs: 'images' | 'xlsx' | 'pdf'
  const [type, setType] = useState('images');

  // Images wizard step: 1: Mode | 2: Base | 3: Details | 4: Compress
  const [imgWizardStep, setImgWizardStep] = useState(1);

  // Excel options
  const [includeImagesZipWithXlsx, setIncludeImagesZipWithXlsx] = useState(false);

  // PDF options
  const [shortenTitles, setShortenTitles] = useState(true);
  const [pdfTemplate, setPdfTemplate] = useState('');
  const [pdfBreakMode, setPdfBreakMode] = useState('class_section'); // 'class_section' | 'class_only'
  const [templatesList, setTemplatesList] = useState([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // Images options — default is 'all' (Original Filenames)
  const [imageMode, setImageMode] = useState('all'); // 'all' | 'rename' | 'generate'
  const [imageFormat, setImageFormat] = useState('zip'); // 'zip' | 'pdf_zip'
  const [photoColumn, setPhotoColumn] = useState('PHOTO');
  const [selectedNameFields, setSelectedNameFields] = useState([]);
  const [passportSize, setPassportSize] = useState('size_23x34'); // 'size_23x34' | 'size_37x53'
  const [passportNameField, setPassportNameField] = useState('');
  const [detailMode, setDetailMode] = useState('none');
  const [customDate, setCustomDate] = useState('');

  // Compression
  const [compressEnabled, setCompressEnabled] = useState(false);
  const [targetSizeKb, setTargetSizeKb] = useState(40);

  // Processing, progress & async polling
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Preparing export...');
  const pollTimerRef = useRef(null);

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

  const fields = useMemo(() => table?.fields || [], [table?.fields]);
  const isDenseTable = fields.length > 15;

  // Filter text & image fields
  const imageFields = useMemo(() => {
    const detected = fields
      .filter((f) => {
        const t = (f.type || '').toLowerCase();
        const n = (f.name || '').toLowerCase();
        return (
          t.includes('photo') ||
          t.includes('image') ||
          t.includes('sign') ||
          n.includes('photo') ||
          n.includes('pic') ||
          n.includes('sign')
        );
      })
      .map((f) => ({ value: f.name, label: `${f.name} (${f.type || 'image'})` }));

    return detected.length > 0
      ? detected
      : [
          { value: 'PHOTO', label: 'PHOTO (Main Photo)' },
          { value: 'FATHER_PHOTO', label: 'FATHER_PHOTO' },
          { value: 'MOTHER_PHOTO', label: 'MOTHER_PHOTO' },
          { value: 'SIGN', label: 'SIGN (Signature)' },
        ];
  }, [fields]);

  const textFields = useMemo(() => {
    return fields.filter((f) => {
      const t = (f.type || '').toLowerCase();
      const n = (f.name || '').toLowerCase();
      return (
        !t.includes('photo') &&
        !t.includes('image') &&
        !t.includes('sign') &&
        !n.includes('photo') &&
        !n.includes('sign')
      );
    });
  }, [fields]);

  // Set default photo column and default name fields
  useEffect(() => {
    if (imageFields.length > 0 && !photoColumn) {
      setPhotoColumn(imageFields[0].value);
    }
    if (textFields.length > 0 && selectedNameFields.length === 0) {
      // Find candidate name field
      const candidate = textFields.find((f) =>
        ['name', 'full name', 'student name', 'candidate name'].includes(f.name.toLowerCase())
      ) || textFields[0];
      if (candidate) {
        setSelectedNameFields([candidate.name]);
        setPassportNameField(candidate.name);
      }
    }
  }, [imageFields, textFields, photoColumn, selectedNameFields.length]);

  // Load export templates
  useEffect(() => {
    let isMounted = true;
    const loadTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const data = await exportApi.getExportTemplates();
        if (isMounted && data && Array.isArray(data.templates)) {
          setTemplatesList(data.templates);
          const defTpl = data.templates.find((t) => t.is_default);
          if (defTpl) setPdfTemplate(String(defTpl.id));
        }
      } catch (err) {
        console.warn('Could not load templates:', err);
      } finally {
        if (isMounted) setIsLoadingTemplates(false);
      }
    };
    loadTemplates();
    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
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

  // Live filename preview for rename mode
  const renamePreview = useMemo(() => {
    if (selectedNameFields.length === 0) return 'original_filename.jpg';
    return `${selectedNameFields.join('_')}.jpg`;
  }, [selectedNameFields]);

  const toggleNameField = (fieldName) => {
    setSelectedNameFields((prev) =>
      prev.includes(fieldName) ? prev.filter((f) => f !== fieldName) : [...prev, fieldName]
    );
  };

  // Helper to trigger direct browser download from Blob
  const triggerBlobDownload = (blobData, filename) => {
    let mimeType = 'application/octet-stream';
    if (filename.endsWith('.xlsx')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';
    else if (filename.endsWith('.csv')) mimeType = 'text/csv;charset=utf-8;';
    else if (filename.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (filename.endsWith('.zip')) mimeType = 'application/zip';
    const blob = blobData instanceof Blob ? blobData : new Blob([blobData], { type: mimeType });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', filename);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    }, 150);
  };

  // Poll background async task
  const pollTaskStatus = (taskId, filename, successMessage) => {
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await exportApi.getExportStatus(taskId);
        if (res.state === 'completed' && res.download_url) {
          clearInterval(pollTimerRef.current);
          setProgress(100);
          setStatusText('Download ready!');
          const link = document.createElement('a');
          link.href = res.download_url;
          link.setAttribute('download', filename);
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            link.remove();
          }, 150);
          addToast?.(successMessage, 'success');
          setIsProcessing(false);
          onClose();
        } else if (res.state === 'failed') {
          clearInterval(pollTimerRef.current);
          setIsProcessing(false);
          addToast?.(res.message || 'Background export failed', 'error');
        } else {
          // Progress update
          const pct = Math.max(20, Math.min(95, res.progress_percentage || res.progress || attempts * 2));
          setProgress(pct);
          setStatusText(res.message || 'Processing dataset...');
        }
      } catch (pollErr) {
        if (attempts >= maxAttempts) {
          clearInterval(pollTimerRef.current);
          setIsProcessing(false);
          addToast?.('Export timed out. Please try with fewer cards.', 'error');
        }
      }
    }, 1500);
  };

  const handleDownloadData = async () => {
    const tid = table?.id || tableId;
    if (!tid) {
      addToast?.('Table not found', 'error');
      return;
    }

    setIsProcessing(true);
    setProgress(20);
    setStatusText(`Starting ${type.toUpperCase()} export...`);

    try {
      if (type === 'xlsx') {
        // Excel (.xlsx) Download
        const endpoint = `/api/table/${tid}/cards/download-xlsx/`;
        const payload = {
          status: status || 'pending',
          include_images: includeImagesZipWithXlsx,
        };

        const response = await apiClient.post(endpoint, payload, { responseType: 'blob' });

        // Check if JSON error
        const contentType = response.headers?.['content-type'] || response.data?.type || '';
        if (contentType.includes('application/json')) {
          const text = await response.data.text();
          try {
            const json = JSON.parse(text);
            if (json.async && json.task_id) {
              setStatusText('Dataset routed to background generator...');
              pollTaskStatus(json.task_id, `table_${tid}_cards.xlsx`, `Excel spreadsheet ready (${cardCount} cards)`);
              return;
            }
            if (!json.success) {
              addToast?.(json.message || 'Failed to generate Excel export', 'error');
              setIsProcessing(false);
              return;
            }
          } catch (_) {}
        }

        triggerBlobDownload(response.data, `table_${tid}_cards.xlsx`);
        setProgress(100);
        addToast?.(`Exported Excel data file (${cardCount} cards)`, 'success');

        // If also images ZIP was requested, trigger images export sequentially
        if (includeImagesZipWithXlsx) {
          setTimeout(async () => {
            try {
              const imgRes = await apiClient.post(
                `/api/table/${tid}/cards/download-images/?download=1`,
                { status: status || 'pending', download: 1 },
                { responseType: 'blob' }
              );
              triggerBlobDownload(imgRes.data, `table_${tid}_images.zip`);
              addToast?.('Exported accompanying Images ZIP archive', 'info');
            } catch (imgErr) {
              console.warn('Could not bundle images zip with xlsx:', imgErr);
            }
          }, 1000);
        }

        onClose();
      } else if (type === 'pdf') {
        // PDF Document Download
        const endpoint = `/api/table/${tid}/cards/download-pdf/`;
        const payload = {
          status: status || 'pending',
          template_id: pdfTemplate ? Number(pdfTemplate) : undefined,
          shorten_titles: shortenTitles,
          break_mode: pdfBreakMode,
        };

        const response = await apiClient.post(endpoint, payload, { responseType: 'blob' });

        const contentType = response.headers?.['content-type'] || response.data?.type || '';
        if (contentType.includes('application/json')) {
          const text = await response.data.text();
          try {
            const json = JSON.parse(text);
            if (json.async && json.task_id) {
              setStatusText('Large PDF dataset routed to background generator...');
              pollTaskStatus(json.task_id, `table_${tid}_cards.pdf`, `PDF Document ready (${cardCount} cards)`);
              return;
            }
            if (!json.success) {
              addToast?.(json.message || 'Failed to generate PDF document', 'error');
              setIsProcessing(false);
              return;
            }
          } catch (_) {}
        }

        triggerBlobDownload(response.data, `table_${tid}_cards.pdf`);
        setProgress(100);
        addToast?.(`Exported PDF document (${cardCount} cards)`, 'success');
        onClose();
      } else {
        // Images (ZIP) Download
        const endpoint = `/api/table/${tid}/cards/download-images/?download=1`;
        const payload = {
          status: status || 'pending',
          photo_field: photoColumn,
          name_field: selectedNameFields.join(','),
          mode: imageMode,
          output_format: imageFormat,
          detail_mode: imageMode === 'generate' ? detailMode : 'none',
          custom_date: customDate,
          size_preset: passportSize,
          compress_enabled: compressEnabled,
          target_size_kb: Number(targetSizeKb) || 40,
          download: 1,
        };

        const response = await apiClient.post(endpoint, payload, { responseType: 'blob' });

        const contentType = response.headers?.['content-type'] || response.data?.type || '';
        if (contentType.includes('application/json')) {
          const text = await response.data.text();
          try {
            const json = JSON.parse(text);
            if (!json.success) {
              addToast?.(json.message || 'No images found or export failed', 'error');
              setIsProcessing(false);
              return;
            }
          } catch (_) {}
        }

        const ext = imageFormat === 'pdf_zip' ? 'pdf_zip.zip' : 'images.zip';
        triggerBlobDownload(response.data, `table_${tid}_${ext}`);
        setProgress(100);
        addToast?.(`Exported image archive (${cardCount} cards)`, 'success');
        onClose();
      }
    } catch (err) {
      console.error('Download export error:', err);
      let errMsg = 'Failed to export data file. Please try again.';
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
            <Download size={16} style={{ color: '#7c3aed' }} /> Download Data Export
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Format Navigation Tabs (Tabs, NOT Step 1) */}
        <div className="download-modal-format-tabs">
          <button
            type="button"
            className={`download-modal-format-tab ${type === 'images' ? 'is-active-images' : ''}`}
            onClick={() => setType('images')}
          >
            <ImageIcon size={16} /> Images (ZIP)
          </button>
          <button
            type="button"
            className={`download-modal-format-tab ${type === 'xlsx' ? 'is-active-xlsx' : ''}`}
            onClick={() => setType('xlsx')}
          >
            <FileSpreadsheet size={16} /> Excel (.xlsx)
          </button>
          <button
            type="button"
            className={`download-modal-format-tab ${type === 'pdf' ? 'is-active-pdf' : ''}`}
            onClick={() => setType('pdf')}
          >
            <FileText size={16} /> PDF Document
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            padding: '18px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto',
          }}
        >
          {/* Context Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: '#f1f5f9',
              borderRadius: '6px',
              fontSize: '12.5px',
              color: '#475569',
              flexShrink: 0,
            }}
          >
            <span>
              List: <strong style={{ color: '#0f172a' }}>{table?.name || 'Current Table'}</strong>
            </span>
            <span>
              Status: <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{status || 'Pending'}</strong>
            </span>
            <span>
              Cards: <strong style={{ color: '#0f172a' }}>{cardCount}</strong>
            </span>
          </div>

          {/* ══════════ OPTION PANEL FOR IMAGES (ZIP) - STEP BY STEP WIZARD ══════════ */}
          {type === 'images' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '10px' }}>
              {/* Stepper Progress Indicator */}
              <div className="download-img-wizard-progress">
                <button
                  type="button"
                  className={`download-img-wizard-chip ${imgWizardStep === 1 ? 'is-active' : ''} ${imgWizardStep > 1 ? 'is-complete' : ''}`}
                  onClick={() => setImgWizardStep(1)}
                >
                  <span className="download-img-wizard-chip-index">{imgWizardStep > 1 ? '✓' : '1'}</span>
                  <span className="download-img-wizard-chip-label">Mode</span>
                </button>
                <button
                  type="button"
                  className={`download-img-wizard-chip ${imgWizardStep === 2 ? 'is-active' : ''} ${imgWizardStep > 2 ? 'is-complete' : ''}`}
                  onClick={() => setImgWizardStep(2)}
                >
                  <span className="download-img-wizard-chip-index">{imgWizardStep > 2 ? '✓' : '2'}</span>
                  <span className="download-img-wizard-chip-label">Base</span>
                </button>
                <button
                  type="button"
                  className={`download-img-wizard-chip ${imgWizardStep === 3 ? 'is-active' : ''} ${imgWizardStep > 3 ? 'is-complete' : ''}`}
                  onClick={() => setImgWizardStep(3)}
                >
                  <span className="download-img-wizard-chip-index">{imgWizardStep > 3 ? '✓' : '3'}</span>
                  <span className="download-img-wizard-chip-label">Details</span>
                </button>
                <button
                  type="button"
                  className={`download-img-wizard-chip ${imgWizardStep === 4 ? 'is-active' : ''}`}
                  onClick={() => setImgWizardStep(4)}
                >
                  <span className="download-img-wizard-chip-index">4</span>
                  <span className="download-img-wizard-chip-label">Compress</span>
                </button>
              </div>

              {/* ── STEP 1: PHOTO PROCESSING MODE ── */}
              {imgWizardStep === 1 && (
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                        Step 1: Choose Photo Processing Mode
                      </h4>
                      {imageMode === 'all' && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                          Default: Original Filenames
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                      By default, photos are bundled with their exact original filenames and zero re-encoding. Select an option below to customize:
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                    {/* Mode 1: Rename by Fields */}
                    <div
                      onClick={() => setImageMode((prev) => (prev === 'rename' ? 'all' : 'rename'))}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '6px',
                        border: imageMode === 'rename' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                        background: imageMode === 'rename' ? '#f5f3ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          background: imageMode === 'rename' ? '#7c3aed' : '#f1f5f9',
                          color: imageMode === 'rename' ? '#ffffff' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Tag size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: imageMode === 'rename' ? '#5b21b6' : '#1e293b' }}>
                            Rename By Fields
                          </span>
                          {imageMode === 'rename' && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '2px 6px', borderRadius: '4px' }}>
                              Selected
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0 0', lineHeight: 1.4 }}>
                          Rename photo files using card fields (e.g. <code>NAME_CLASS.jpg</code>). Best for student record directories.
                        </p>
                      </div>
                    </div>

                    {/* Mode 2: Passport Photo (Border) */}
                    <div
                      onClick={() => setImageMode((prev) => (prev === 'generate' ? 'all' : 'generate'))}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '6px',
                        border: imageMode === 'generate' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                        background: imageMode === 'generate' ? '#f5f3ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          background: imageMode === 'generate' ? '#7c3aed' : '#f1f5f9',
                          color: imageMode === 'generate' ? '#ffffff' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Maximize2 size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: imageMode === 'generate' ? '#5b21b6' : '#1e293b' }}>
                            Passport Photo (Border)
                          </span>
                          {imageMode === 'generate' && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '2px 6px', borderRadius: '4px' }}>
                              Selected
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0 0', lineHeight: 1.4 }}>
                          Generate print-standard photos with a crisp border, preset dimensions (23x34mm / 37x53mm), and student name caption.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 2: BASE SETTINGS (SOURCE COLUMN & ARCHIVE FORMAT) ── */}
              {imgWizardStep === 2 && (
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                      Step 2: Source Column &amp; Archive Format
                    </h4>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                      Select which image column to export and how the archive should be packaged:
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Photo Column To Download
                      </label>
                      <CustomSelect
                        value={photoColumn}
                        onChange={(val) => setPhotoColumn(val)}
                        options={imageFields}
                      />
                      <span style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'block' }}>
                        Source image column from which card photos are extracted.
                      </span>
                    </div>

                    <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Archive Format
                      </label>
                      <CustomSelect
                        value={imageFormat}
                        onChange={(val) => setImageFormat(val)}
                        options={[
                          { value: 'zip', label: 'ZIP (Individual JPG Images)' },
                          { value: 'pdf_zip', label: 'PDF ZIP (One PDF per column)' },
                        ]}
                      />
                      <span style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'block' }}>
                        Choose individual JPEG files or single-page PDF collection.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 3: DETAILS (MODE-SPECIFIC) ── */}
              {imgWizardStep === 3 && (
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {/* Mode = Rename */}
                  {imageMode === 'rename' && (
                    <>
                      <div>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                          Step 3: Configure Filename Pattern
                        </h4>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                          Click one or more card fields below. Values will be joined with an underscore (_):
                        </p>
                      </div>

                      <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                          {textFields.map((f) => {
                            const isSelected = selectedNameFields.includes(f.name);
                            return (
                              <button
                                key={f.name}
                                type="button"
                                onClick={() => toggleNameField(f.name)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '5px',
                                  border: isSelected ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                                  background: isSelected ? '#f5f3ff' : '#f8fafc',
                                  color: isSelected ? '#6d28d9' : '#475569',
                                  fontSize: '12px',
                                  fontWeight: isSelected ? 700 : 500,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  transition: 'all 0.1s ease',
                                }}
                              >
                                <Tag size={12} /> {f.name}
                                {isSelected && <span style={{ fontSize: '10px', color: '#7c3aed' }}>✓</span>}
                              </button>
                            );
                          })}
                        </div>

                        <div
                          style={{
                            fontSize: '12.5px',
                            color: '#475569',
                            background: '#f1f5f9',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            border: '1px dashed #cbd5e1',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <span>Filename Preview:</span>
                          <strong style={{ color: '#7c3aed', fontFamily: 'monospace', fontSize: '13px' }}>
                            {renamePreview}
                          </strong>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Mode = Passport Photo (Generate) */}
                  {imageMode === 'generate' && (
                    <>
                      <div>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                          Step 3: Passport Photo Layout &amp; Details
                        </h4>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                          Configure photo print dimensions, student name field, and optional second line caption:
                        </p>
                      </div>

                      <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                              Photo Print Size Preset
                            </label>
                            <CustomSelect
                              value={passportSize}
                              onChange={(val) => setPassportSize(val)}
                              options={[
                                { value: 'size_23x34', label: '23 mm x 34 mm (Standard Small)' },
                                { value: 'size_37x53', label: '37 mm x 53 mm (Standard Large)' },
                              ]}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                              Student Name Field
                            </label>
                            <CustomSelect
                              value={passportNameField}
                              onChange={(val) => setPassportNameField(val)}
                              options={textFields.map((f) => ({ value: f.name, label: f.name }))}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: detailMode === 'custom_date' ? '1fr 1fr' : '1fr', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                              2nd Line Label Text
                            </label>
                            <CustomSelect
                              value={detailMode}
                              onChange={(val) => setDetailMode(val)}
                              options={[
                                { value: 'none', label: 'No 2nd line (Default)' },
                                { value: 'class_only', label: 'Class Only' },
                                { value: 'class_section', label: 'Class + Section' },
                                { value: 'today_date', label: "Today's Date" },
                                { value: 'custom_date', label: 'Custom Date / Text' },
                              ]}
                            />
                          </div>
                          {detailMode === 'custom_date' && (
                            <div>
                              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                Custom Text / Date
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. 2026-2027"
                                value={customDate}
                                onChange={(e) => setCustomDate(e.target.value)}
                                style={{
                                  width: '100%',
                                  height: '32px',
                                  padding: '0 8px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  boxSizing: 'border-box',
                                  outline: 'none',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Mode = Original Filenames */}
                  {imageMode === 'all' && (
                    <>
                      <div>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                          Step 3: Original Archive Configuration
                        </h4>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                          Original Filenames mode packages all files in their untouched original form:
                        </p>
                      </div>

                      <div style={{ background: '#ffffff', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#15803d' }}>
                            <CheckCircle2 size={16} /> Original filenames preserved with zero modification.
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#15803d' }}>
                            <CheckCircle2 size={16} /> Exact binary files extracted directly from column <strong>{photoColumn}</strong>.
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#15803d' }}>
                            <CheckCircle2 size={16} /> Ready for packaging into <strong>{imageFormat === 'zip' ? 'ZIP Archive' : 'PDF ZIP'}</strong>.
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── STEP 4: COMPRESSION & EXPORT REVIEW ── */}
              {imgWizardStep === 4 && (
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>
                      Step 4: Image Compression &amp; Final Export
                    </h4>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                      Optionally optimize file size for print labs or web storage, then proceed to export:
                    </p>
                  </div>

                  {/* Compression Options */}
                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <CustomCheckbox
                      checked={compressEnabled}
                      onChange={(val) => setCompressEnabled(val)}
                      label={
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <strong>Compress Images</strong>
                          {compressEnabled && (
                            <span>
                              Target Size:
                              <input
                                type="number"
                                min="10"
                                max="200"
                                value={targetSizeKb}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setTargetSizeKb(e.target.value)}
                                style={{
                                  width: '50px',
                                  height: '22px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  fontSize: '11.5px',
                                  padding: '0 6px',
                                  marginLeft: '6px',
                                }}
                              />{' '}
                              KB
                            </span>
                          )}
                        </span>
                      }
                      description="Optimizes JPEG quality to stay under target KB size while maintaining crisp print dimensions."
                    />
                  </div>

                  {/* Configuration Summary Card */}
                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Export Summary
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                      <div>
                        Mode:{' '}
                        <strong style={{ color: '#0f172a' }}>
                          {imageMode === 'rename'
                            ? 'Rename By Fields'
                            : imageMode === 'generate'
                            ? 'Passport Photo'
                            : 'Original Filenames'}
                        </strong>
                      </div>
                      <div>
                        Column: <strong style={{ color: '#0f172a' }}>{photoColumn}</strong>
                      </div>
                      <div>
                        Format:{' '}
                        <strong style={{ color: '#0f172a' }}>
                          {imageFormat === 'zip' ? 'ZIP (Images)' : 'PDF ZIP'}
                        </strong>
                      </div>
                      <div>
                        Compression:{' '}
                        <strong style={{ color: compressEnabled ? '#7c3aed' : '#64748b' }}>
                          {compressEnabled ? `${targetSizeKb} KB` : 'Disabled'}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════ OPTION PANEL FOR EXCEL (.xlsx) ══════════ */}
          {type === 'xlsx' && (
            <div
              style={{
                background: '#f8fafc',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
                Export all card data from the <strong style={{ color: '#0f172a' }}>{status || 'current'}</strong> list into an Excel spreadsheet. Header column names will match table schema fields.
              </div>

              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '12px',
                }}
              >
                <CustomCheckbox
                  checked={includeImagesZipWithXlsx}
                  onChange={(val) => setIncludeImagesZipWithXlsx(val)}
                  label={<strong>Also download accompanying Images ZIP</strong>}
                  description="Downloads the Excel spreadsheet and triggers a companion image ZIP archive download in one unified workflow."
                />
              </div>
            </div>
          )}

          {/* ══════════ OPTION PANEL FOR PDF DOCUMENT ══════════ */}
          {type === 'pdf' && (
            <div
              style={{
                background: '#f8fafc',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Dense Column Warning */}
              {isDenseTable && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '8px 12px',
                    background: '#fffbeb',
                    border: '1px solid #fef3c7',
                    borderRadius: '6px',
                    color: '#b45309',
                    fontSize: '12px',
                  }}
                >
                  <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Many Columns Detected ({fields.length} columns)</strong>
                    <div style={{ marginTop: '2px', color: '#92400e' }}>
                      Auto-fit is active. Font sizes and column spacing will adjust automatically for dense layout.
                    </div>
                  </div>
                </div>
              )}

              {/* Template Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Select PDF Print Template:
                </label>
                <CustomSelect
                  value={pdfTemplate}
                  onChange={(val) => setPdfTemplate(val)}
                  options={templateOptions}
                  placeholder={isLoadingTemplates ? 'Loading templates...' : 'Default (No Footer Text)'}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Template determines footer branding printed at bottom of every PDF page.
                </span>
              </div>

              {/* Column Options */}
              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <CustomCheckbox
                  checked={shortenTitles}
                  onChange={(val) => setShortenTitles(val)}
                  label="Shorten Column Titles"
                  description="Abbreviates common headers (e.g. Date of Birth → DOB, Mobile No → Mob.) to optimize landscape fit."
                />
              </div>

              {/* Page Break Options */}
              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                  Page Break Configuration
                </span>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="pdfBreakMode"
                    checked={pdfBreakMode === 'class_section'}
                    onChange={() => setPdfBreakMode('class_section')}
                  />
                  Break Pages By Class + Section
                </label>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="pdfBreakMode"
                    checked={pdfBreakMode === 'class_only'}
                    onChange={() => setPdfBreakMode('class_only')}
                  />
                  Break Pages By Class Only
                </label>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {isProcessing && (
            <div style={{ background: '#f5f3ff', padding: '12px 14px', borderRadius: '6px', border: '1px solid #ddd6fe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#6d28d9' }}>{statusText}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed' }}>{progress}%</span>
              </div>
              <div style={{ height: '6px', background: '#ede9fe', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    background: '#7c3aed',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          {/* Left Action: Cancel */}
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

          {/* Center: Images Wizard Prev & Step Indicator */}
          {type === 'images' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {imgWizardStep > 1 && (
                <button
                  type="button"
                  onClick={() => setImgWizardStep((s) => Math.max(1, s - 1))}
                  style={{
                    padding: '8px 14px',
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    color: '#475569',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  disabled={isProcessing}
                >
                  <ChevronLeft size={14} /> Back
                </button>
              )}

              {imageMode !== 'all' && (
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                  Step {imgWizardStep} of 4
                </span>
              )}
            </div>
          ) : (
            <div />
          )}

          {/* Right Action: Next Button (when customizing steps 1-3) OR Download Primary Button */}
          {type === 'images' && imageMode !== 'all' && imgWizardStep < 4 ? (
            <button
              type="button"
              onClick={() => setImgWizardStep((s) => Math.min(4, s + 1))}
              style={{
                padding: '8px 20px',
                background: '#7c3aed',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              }}
              disabled={isProcessing}
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownloadData}
              style={{
                padding: '8px 20px',
                background: type === 'images' ? '#7c3aed' : type === 'xlsx' ? '#10b981' : '#dc2626',
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
              <Download size={14} />{' '}
              {isProcessing ? 'Exporting...' : `Download ${type.toUpperCase()}`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
