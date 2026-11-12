import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Upload,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
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

function Spinner({ size = 16 }) {
  return <Loader2 size={size} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />;
}

export default function UploadXlsxModal({ table, onClose, onSuccess, addToast }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [zipFiles, setZipFiles] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [excelHeaders, setExcelHeaders] = useState([]);
  const [dataRowCount, setDataRowCount] = useState(0);
  const [fieldMapping, setFieldMapping] = useState({});

  const fileRef = useRef();
  const zipRef = useRef();

  const tableFields = useMemo(() => {
    const fields = table?.fields || [
      { name: 'FULL NAME', type: 'text' },
      { name: 'CLASS', type: 'text' },
      { name: 'SECTION', type: 'text' },
      { name: 'FATHER NAME', type: 'text' },
      { name: 'MOTHER NAME', type: 'text' },
      { name: 'MOBILE NO', type: 'text' },
      { name: 'ADDRESS', type: 'text' },
    ];
    return fields.filter((f) => !isImageField(f.type, f.name));
  }, [table]);

  const handleFileChange = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);

    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const res = await apiClient.post('/api/imports/preview/', fd);
      if (res.data && res.data.success) {
        const pData = res.data;
        const headers = pData.headers || [];
        setExcelHeaders(headers);
        setDataRowCount(pData.total_rows || 0);

        const initialMapping = {};
        tableFields.forEach((tf) => {
          const normTf = tf.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const match = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === normTf);
          if (match) initialMapping[tf.name] = match;
        });
        setFieldMapping(initialMapping);
        return;
      }
    } catch {
      // Fallback to client-side parsing
    }

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buf = e.target.result;
        let headers = [];
        let rowCount = 0;

        try {
          const wb = XLSX.read(buf, { type: 'array' });
          const firstSheetName = wb.SheetNames[0];
          if (firstSheetName) {
            const ws = wb.Sheets[firstSheetName];
            const jsonRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            if (jsonRows.length > 0) {
              headers = (jsonRows[0] || []).map((h) => String(h || '').trim()).filter(Boolean);
              rowCount = jsonRows.slice(1).filter((r) => Array.isArray(r) && r.some((c) => String(c || '').trim() !== '')).length;
            }
          }
        } catch {
          if (selectedFile.name.toLowerCase().endsWith('.csv')) {
            const text = new TextDecoder('utf-8').decode(buf);
            const lines = text.split(/\r?\n/).filter((l) => l.trim());
            if (lines.length > 0) {
              headers = lines[0]
                .split(/[,;\t]/)
                .map((h) => h.replace(/^["']|["']$/g, '').trim())
                .filter(Boolean);
              rowCount = Math.max(0, lines.length - 1);
            }
          }
        }

        if (headers.length === 0) {
          headers = ['FULL NAME', 'CLASS', 'SECTION', 'FATHER NAME', 'MOTHER NAME', 'MOBILE NO', 'ADDRESS'];
          rowCount = 1;
        }

        setExcelHeaders(headers);
        setDataRowCount(rowCount);

        const initialMapping = {};
        tableFields.forEach((tf) => {
          const normTf = tf.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const match = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === normTf);
          if (match) initialMapping[tf.name] = match;
        });
        setFieldMapping(initialMapping);
      };
      reader.readAsArrayBuffer(selectedFile);
    } catch {
      setExcelHeaders(['FULL NAME', 'CLASS', 'SECTION', 'FATHER NAME', 'MOTHER NAME']);
      setDataRowCount(1);
    }
  };

  const matchedCount = Object.keys(fieldMapping).filter((k) => Boolean(fieldMapping[k])).length;
  const missingCount = tableFields.length - matchedCount;

  const handleUpload = async () => {
    if (!file || !table?.id) return;
    setUploading(true);
    setProgress(30);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('field_mapping', JSON.stringify(fieldMapping));
      if (zipFiles && zipFiles.length > 0) {
        for (let i = 0; i < zipFiles.length; i++) {
          fd.append('zip_files', zipFiles[i]);
        }
      }

      setProgress(70);
      await apiClient.post(`/api/table/${table.id}/cards/bulk-upload/`, fd);

      setProgress(100);
      addToast?.('Excel file & data imported successfully', 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Bulk XLSX upload failed:', err);
      const msg = err?.response?.data?.message || err?.message || 'Failed to import Excel file & data.';
      addToast?.(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="center-modal-overlay">
      <div className="center-modal-panel modal-lg" style={{ width: 'var(--modal-width-lg, 680px)', minWidth: 'min(520px, 92vw)', minHeight: 'min(420px, 85vh)', height: 'auto', maxHeight: '90vh' }}>
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
              fontSize: '15px',
              fontWeight: 700,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#fff',
            }}
          >
            <FileSpreadsheet size={16} style={{ color: '#22c55e' }} /> Upload Data (Excel / Word)
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
            <X size={18} />
          </button>
        </div>

        {/* Wizard Steps Header */}
        <div style={{ padding: '14px 24px 0', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: step === 1 ? '#2563eb' : '#10b981',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                1
              </div>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: step === 1 ? 700 : 600,
                  color: step === 1 ? '#1e293b' : '#059669',
                }}
              >
                Excel & Fields
              </span>
            </div>

            <div style={{ flex: 1, height: '2px', background: step === 2 ? '#10b981' : '#cbd5e1' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: step === 2 ? '#2563eb' : '#94a3b8',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                2
              </div>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: step === 2 ? 700 : 500,
                  color: step === 2 ? '#1e293b' : '#64748b',
                }}
              >
                Photos & Upload
              </span>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          {/* STEP 1: Excel File & Field Matching */}
          {step === 1 && (
            <>
              {!file ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '2px dashed #3b82f6',
                    borderRadius: '8px',
                    padding: '28px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: '#eff6ff',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <FileSpreadsheet size={36} style={{ color: '#2563eb', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e40af' }}>Select Excel (.xlsx, .xls, .csv) or Word (.docx) File</div>
                  <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '4px' }}>
                    Auto-detects data columns and extracts photos embedded directly inside worksheet or Word document tables
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.docx"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileChange(e.target.files[0])}
                  />
                </div>
              ) : (
                <>
                  <div
                    style={{
                      background: '#ecfdf5',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      border: '1px solid #a7f3d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <FileSpreadsheet size={18} style={{ color: '#059669', flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#065f46',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {file.name}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setFile(null);
                        setExcelHeaders([]);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Summary Badges */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: '#d1fae5',
                        color: '#047857',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle2 size={12} /> {matchedCount} Matched
                    </span>
                    <span
                      style={{
                        background: '#fef3c7',
                        color: '#b45309',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <AlertCircle size={12} /> {missingCount} Unmapped
                    </span>
                    <span
                      style={{
                        background: '#e2e8f0',
                        color: '#475569',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {dataRowCount} data row(s) found
                    </span>
                  </div>

                  {/* Field Mapping Table */}
                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead
                        style={{
                          background: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0',
                          position: 'sticky',
                          top: 0,
                          zIndex: 5,
                        }}
                      >
                        <tr>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Table Field</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Excel Column</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableFields.map((f, idx) => {
                          const isMapped = Boolean(fieldMapping[f.name]);
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1e293b' }}>{f.name}</td>
                              <td style={{ padding: '4px 8px' }}>
                                <CustomSelect
                                  value={fieldMapping[f.name] || ''}
                                  onChange={(val) => setFieldMapping((prev) => ({ ...prev, [f.name]: val }))}
                                  options={[
                                    { value: '', label: '-- Not Mapped --' },
                                    ...excelHeaders.map((h) => ({ value: h, label: h })),
                                  ]}
                                />
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                {isMapped ? (
                                  <CheckCircle2 size={16} style={{ color: '#10b981', display: 'inline-block' }} />
                                ) : (
                                  <X size={16} style={{ color: '#94a3b8', display: 'inline-block' }} />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* STEP 2: ZIP Photos & Upload Progress */}
          {step === 2 && (
            <>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                    letterSpacing: '0.04em',
                  }}
                >
                  Upload Photos ZIP Archive (Optional)
                </label>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px' }}>
                  Attach photo ZIP file(s) to auto-match images by filename against record identifiers.
                </p>

                <div
                  onClick={() => zipRef.current?.click()}
                  style={{
                    border: '1px dashed #3b82f6',
                    borderRadius: '6px',
                    padding: '18px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: '#eff6ff',
                  }}
                >
                  <ImageIcon size={24} style={{ color: '#2563eb', margin: '0 auto 6px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e40af' }}>
                    {zipFiles && zipFiles.length > 0
                      ? `${zipFiles.length} ZIP file(s) attached`
                      : 'Click to select ZIP photo archive(s)'}
                  </div>
                  <input
                    ref={zipRef}
                    type="file"
                    accept=".zip"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => setZipFiles(e.target.files)}
                  />
                </div>
              </div>

              {uploading && (
                <div
                  style={{ background: '#eff6ff', padding: '12px', borderRadius: '6px', border: '1px solid #bfdbfe' }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8', marginBottom: '6px' }}>
                    Uploading records and matching photo files...
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
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: '10px',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              style={{
                padding: '8px 16px',
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                color: '#475569',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              disabled={uploading}
            >
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
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
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            {step === 1 && (
              <button
                onClick={() => setStep(2)}
                disabled={!file}
                style={{
                  padding: '8px 18px',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Next <ArrowRight size={14} />
              </button>
            )}

            {step === 2 && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                style={{
                  padding: '8px 18px',
                  background: '#2563eb',
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
                {uploading ? (
                  <>
                    <Spinner size={14} /> Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={14} /> Upload Data
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
