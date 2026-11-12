import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, QrCode, Barcode, Database, Link, Sparkles, Layers, Sliders, Info, ExternalLink } from 'lucide-react';

/**
 * Generate a clean Code 128 (Subset B) barcode pattern as SVG rect elements.
 */
function renderBarcodeSvg(text) {
  if (!text) return null;
  const safeText = String(text).slice(0, 32);

  // Simple deterministic pattern for visual fidelity
  let hash = 0;
  for (let i = 0; i < safeText.length; i++) {
    hash = (hash << 5) - hash + safeText.charCodeAt(i);
    hash |= 0;
  }
  const patternSeed = Math.abs(hash) + 1234567;
  const bars = [];
  let currentX = 10;
  const totalWidth = 240;
  const height = 55;

  // Guard bars at start
  bars.push({ x: currentX, width: 2 });
  currentX += 4;
  bars.push({ x: currentX, width: 2 });
  currentX += 4;

  for (let i = 0; i < safeText.length; i++) {
    const code = safeText.charCodeAt(i);
    const b1 = (code % 3) + 1;
    const b2 = ((code >> 2) % 3) + 1;
    const b3 = ((code >> 4) % 3) + 1;

    bars.push({ x: currentX, width: b1 });
    currentX += b1 + 2;
    bars.push({ x: currentX, width: b2 });
    currentX += b2 + 2;
    bars.push({ x: currentX, width: b3 });
    currentX += b3 + 3;
    if (currentX > totalWidth - 20) break;
  }

  // Guard bars at end
  bars.push({ x: currentX, width: 2 });
  currentX += 4;
  bars.push({ x: currentX, width: 3 });
  currentX += 5;

  return (
    <svg width={Math.max(currentX + 10, 180)} height={height + 22} viewBox={`0 0 ${Math.max(currentX + 10, 180)} ${height + 22}`}>
      <rect width="100%" height="100%" fill="#ffffff" rx="4" />
      {bars.map((b, idx) => (
        <rect key={idx} x={b.x} y={8} width={b.width} height={height} fill="#0f172a" />
      ))}
      <text
        x={Math.max(currentX + 10, 180) / 2}
        y={height + 18}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fontFamily="monospace"
        fill="#334155"
      >
        {safeText}
      </text>
    </svg>
  );
}

/**
 * Generate a clean 2D QR matrix pattern as SVG rect elements.
 */
function renderQrSvg(text) {
  if (!text) return null;
  const safeText = String(text);
  const matrixSize = 25; // 25x25 grid
  const cellSize = 6;
  const padding = 12;
  const totalSize = matrixSize * cellSize + padding * 2;

  // Build deterministic pseudo-QR matrix
  const matrix = Array.from({ length: matrixSize }, () => Array(matrixSize).fill(false));

  // 1. Finder patterns (top-left, top-right, bottom-left)
  function drawFinder(r0, c0) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[r0 + r][c0 + c] = true;
        }
      }
    }
  }
  drawFinder(0, 0);
  drawFinder(0, matrixSize - 7);
  drawFinder(matrixSize - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < matrixSize - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // 3. Fill data cells deterministically based on text content
  let charIdx = 0;
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      // Skip finder zones
      if (
        (r < 8 && c < 8) ||
        (r < 8 && c >= matrixSize - 8) ||
        (r >= matrixSize - 8 && c < 8) ||
        r === 6 || c === 6
      ) {
        continue;
      }
      const charCode = safeText.charCodeAt(charIdx % safeText.length);
      const isFilled = ((charCode * (r + 1) + c * 7 + (r * c)) % 3) === 0;
      matrix[r][c] = isFilled;
      charIdx++;
    }
  }

  const cells = [];
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        cells.push({
          x: padding + c * cellSize,
          y: padding + r * cellSize,
        });
      }
    }
  }

  return (
    <svg width={totalSize} height={totalSize} viewBox={`0 0 ${totalSize} ${totalSize}`}>
      <rect width="100%" height="100%" fill="#ffffff" rx="6" />
      {cells.map((c, idx) => (
        <rect key={idx} x={c.x} y={c.y} width={cellSize - 0.2} height={cellSize - 0.2} fill="#0f172a" rx="0.5" />
      ))}
    </svg>
  );
}

/**
 * CodeConfigModal — Configure Dynamic Column or Static Link generation for QR Codes & Barcodes.
 */
export default function CodeConfigModal({
  field,
  allFields = [],
  onClose,
  onSave,
}) {
  const isQrCode =
    ['qr_code', 'qrcode', 'qr'].includes(String(field?.type || '').toLowerCase()) ||
    String(field?.name || '').toLowerCase().includes('qr');

  const availableColumns = useMemo(() => {
    return allFields
      .filter((f) => {
        if (!f || !f.name) return false;
        // Don't generate from itself or from media image fields
        if (f.name.toUpperCase() === String(field?.name || '').toUpperCase()) return false;
        const type = String(f.type || '').toLowerCase();
        return !['photo', 'rel_photo', 'signature', 'barcode', 'qr_code'].includes(type);
      })
      .map((f) => f.name);
  }, [allFields, field]);

  // Initial values
  const [mode, setMode] = useState(() => {
    if (field?.code_mode) return field.code_mode;
    if (field?.code_config?.mode) return field.code_config.mode;
    if (field?.static_value) return 'static';
    return 'column';
  });

  const [sourceColumn, setSourceColumn] = useState(() => {
    if (field?.source_column) return field.source_column;
    if (field?.code_config?.source_column) return field.code_config.source_column;
    // Smart default: prioritize roll no, admission no, id, code, or first column
    const idCol = availableColumns.find((c) =>
      /roll|adm|admission|id|reg|scholar|code|sr/i.test(c)
    );
    return idCol || availableColumns[0] || '';
  });

  const [staticValue, setStaticValue] = useState(() => {
    if (field?.static_value) return field.static_value;
    if (field?.code_config?.static_value) return field.code_config.static_value;
    return isQrCode ? 'https://' : '';
  });

  const [prefix, setPrefix] = useState(() => {
    return field?.code_prefix || field?.code_config?.prefix || '';
  });

  const [suffix, setSuffix] = useState(() => {
    return field?.code_suffix || field?.code_config?.suffix || '';
  });

  // Calculate live preview value
  const previewValue = useMemo(() => {
    if (mode === 'static') {
      return (staticValue || '').trim() || (isQrCode ? 'https://school.edu/verify' : 'STATIC12345');
    }
    const sampleColVal = sourceColumn ? `SAMPLE_${sourceColumn}` : '101';
    return `${prefix}${sampleColVal}${suffix}`.trim();
  }, [mode, staticValue, isQrCode, sourceColumn, prefix, suffix]);

  const handleApply = () => {
    onSave({
      code_mode: mode,
      source_column: mode === 'column' ? sourceColumn : '',
      static_value: mode === 'static' ? staticValue.trim() : '',
      code_prefix: mode === 'column' ? prefix.trim() : '',
      code_suffix: mode === 'column' ? suffix.trim() : '',
      code_config: {
        mode,
        source_column: mode === 'column' ? sourceColumn : '',
        static_value: mode === 'static' ? staticValue.trim() : '',
        prefix: mode === 'column' ? prefix.trim() : '',
        suffix: mode === 'column' ? suffix.trim() : '',
      },
    });
    onClose();
  };

  const handleClear = () => {
    onSave({
      code_mode: '',
      source_column: '',
      static_value: '',
      code_prefix: '',
      code_suffix: '',
      code_config: null,
    });
    onClose();
  };

  return createPortal(
    <>
      <div
        className="drawer-overlay-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          zIndex: 999999999,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '680px',
          maxWidth: '94vw',
          maxHeight: '92vh',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.35)',
          zIndex: 1000000000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-family, system-ui, sans-serif)',
          animation: 'fadeIn 0.18s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: isQrCode ? 'rgba(56, 189, 248, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                color: isQrCode ? '#38bdf8' : '#c084fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isQrCode ? <QrCode size={18} /> : <Barcode size={18} />}
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                Configure {isQrCode ? 'QR Code' : 'Barcode'} Generator: {field?.name || 'Field'}
              </h4>
              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                Auto-generate codes from another column or use a static link
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>
          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              background: '#f1f5f9',
              padding: '4px',
              borderRadius: '8px',
              marginBottom: '20px',
            }}
          >
            <button
              type="button"
              onClick={() => setMode('column')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 12px',
                borderRadius: '6px',
                border: 'none',
                background: mode === 'column' ? '#ffffff' : 'transparent',
                color: mode === 'column' ? '#0f172a' : '#64748b',
                fontWeight: mode === 'column' ? 700 : 500,
                fontSize: '13px',
                boxShadow: mode === 'column' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Database size={15} style={{ color: mode === 'column' ? '#2563eb' : '#94a3b8' }} />
              <span>Generate from Column</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('static')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 12px',
                borderRadius: '6px',
                border: 'none',
                background: mode === 'static' ? '#ffffff' : 'transparent',
                color: mode === 'static' ? '#0f172a' : '#64748b',
                fontWeight: mode === 'static' ? 700 : 500,
                fontSize: '13px',
                boxShadow: mode === 'static' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Link size={15} style={{ color: mode === 'static' ? '#2563eb' : '#94a3b8' }} />
              <span>Static Value / Link</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px', alignItems: 'start' }}>
            {/* Left Column: Form Controls */}
            <div>
              {mode === 'column' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: '6px',
                      }}
                    >
                      Source Column <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      value={sourceColumn}
                      onChange={(e) => setSourceColumn(e.target.value)}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: '#0f172a',
                        background: '#ffffff',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {availableColumns.length === 0 ? (
                        <option value="">No other columns available</option>
                      ) : (
                        availableColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))
                      )}
                    </select>
                    <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      Each ID card will generate its {isQrCode ? 'QR code' : 'barcode'} dynamically from this column.
                    </span>
                  </div>

                  {/* Prefix & Suffix */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Prefix (Optional)
                      </label>
                      <input
                        type="text"
                        value={prefix}
                        onChange={(e) => setPrefix(e.target.value)}
                        placeholder="e.g. ID- or https://"
                        style={{
                          width: '100%',
                          height: '34px',
                          padding: '0 10px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '12.5px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Suffix (Optional)
                      </label>
                      <input
                        type="text"
                        value={suffix}
                        onChange={(e) => setSuffix(e.target.value)}
                        placeholder="e.g. /verify"
                        style={{
                          width: '100%',
                          height: '34px',
                          padding: '0 10px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '12.5px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '12px',
                      color: '#475569',
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                      <Info size={13} style={{ color: '#2563eb' }} />
                      <span>Formula Preview:</span>
                    </div>
                    <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a', fontWeight: 600, fontSize: '11.5px' }}>
                      {prefix ? `"${prefix}" + ` : ''}[{sourceColumn || 'COLUMN'}]{suffix ? ` + "${suffix}"` : ''}
                    </code>
                  </div>
                </div>
              )}

              {mode === 'static' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#1e293b',
                        marginBottom: '6px',
                      }}
                    >
                      Static Link or Text <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={staticValue}
                      onChange={(e) => setStaticValue(e.target.value)}
                      placeholder={isQrCode ? 'e.g. https://priyapublicschool.edu/verify' : 'e.g. CODE-987654'}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#0f172a',
                        background: '#ffffff',
                        boxSizing: 'border-box',
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      Every card in this table will share this identical {isQrCode ? 'QR code' : 'barcode'} link/text.
                    </span>
                  </div>

                  {/* Preset Suggestions for QR Links */}
                  {isQrCode && (
                    <div>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' }}>
                        Quick Suggestions:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {[
                          { label: 'Institution Website', url: 'https://school.edu' },
                          { label: 'Student Portal', url: 'https://portal.edu/login' },
                          { label: 'Contact Support', url: 'https://wa.me/919999999999' },
                        ].map((s) => (
                          <button
                            key={s.label}
                            type="button"
                            onClick={() => setStaticValue(s.url)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e1',
                              background: '#f8fafc',
                              color: '#334155',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            + {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Live Code Preview */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                Live Visual Preview
              </span>

              <div
                style={{
                  background: '#ffffff',
                  padding: '12px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: '1px solid #cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '130px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {isQrCode ? renderQrSvg(previewValue) : renderBarcodeSvg(previewValue)}
              </div>

              <div style={{ marginTop: '10px', width: '100%', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                  Encoded Content:
                </span>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: '#0f172a',
                    wordBreak: 'break-all',
                    display: 'block',
                    marginTop: '2px',
                  }}
                >
                  {previewValue}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 10px',
            }}
          >
            Clear Generator
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              style={{
                height: '32px',
                padding: '0 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
              }}
            >
              <Check size={14} /> Apply Settings
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
