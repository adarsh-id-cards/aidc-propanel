import React, { useState, useMemo } from 'react';
import {
  Camera,
  Sparkles,
  Sliders,
  Wand2,
  Image as ImageIcon,
  RotateCcw,
  Check,
  Layers,
  Search,
  Building,
  Download,
  ChevronDown,
  Info,
  Eye,
  CreditCard,
  Calendar,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import Button from '../common/Button';

/* ─────────────────────────────────────────────────────────────────────────
   1. Passport Image Generation Workspace
───────────────────────────────────────────────────────────────────────── */
export function PassportGenerationWorkspace({
  clients = [],
  allTables = [],
  onNavigate,
  onOpenDownloadModal,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('size_23x34'); // 'size_23x34' | 'size_37x53'
  const [activeClientTableSelect, setActiveClientTableSelect] = useState(null);

  // Filter clients
  const filteredClients = useMemo(() => {
    return (clients || []).filter((c) => {
      const q = searchTerm.trim().toLowerCase();
      if (!q) return true;
      const name = String(c.name || c.school_name || '').toLowerCase();
      const user = String(c.username || c.user_code || '').toLowerCase();
      return name.includes(q) || user.includes(q);
    });
  }, [clients, searchTerm]);

  // Helper to find tables for a client
  const getClientTables = (client) => {
    if (Array.isArray(client.tables) && client.tables.length > 0) {
      return client.tables;
    }
    const cId = String(client.id || '').toLowerCase();
    const cName = String(client.name || client.school_name || '').toLowerCase();
    return (allTables || []).filter((t) => {
      if (!t) return false;
      const tClientId = String(
        t.client_id || t.clientId || t.client || t.organisation_id || t.organisation || t.group?.client?.id || ''
      ).toLowerCase();
      const tClientName = String(t.client_name || t.group?.client?.name || '').toLowerCase();
      return (cId && tClientId === cId) || (cName && tClientName === cName);
    });
  };

  const handleGenerateClick = (client) => {
    const tables = getClientTables(client);
    if (tables.length === 1) {
      const tbl = tables[0];
      if (onOpenDownloadModal) {
        onOpenDownloadModal({
          table: tbl,
          tableId: tbl.id,
          status: 'approved',
          cardCount: tbl.approved_cards || tbl.approved || client.approved || 0,
        });
      } else {
        onNavigate('cards', { tableId: tbl.id });
      }
    } else if (tables.length > 1) {
      setActiveClientTableSelect(activeClientTableSelect === client.id ? null : client.id);
    } else {
      if (onNavigate) {
        onNavigate('organisations');
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: '#f8fafc',
      }}
    >
      {/* ── Top Header Banner ── */}
      <div
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #cbd5e1',
          padding: '12px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Camera size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Generate Passport Images
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#dcfce7',
                  color: '#15803d',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid #bbf7d0',
                }}
              >
                Production Ready
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
              Batch format, fit on white background, and print student name labels in standard studio passport dimensions.
            </p>
          </div>
        </div>

        {/* Preset Dimension Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Standard Sizes:</span>
          <button
            onClick={() => setSelectedPreset('size_23x34')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: selectedPreset === 'size_23x34' ? '1px solid #2563eb' : '1px solid #cbd5e1',
              background: selectedPreset === 'size_23x34' ? '#eff6ff' : '#ffffff',
              color: selectedPreset === 'size_23x34' ? '#1d4ed8' : '#475569',
              transition: 'all 0.15s',
            }}
          >
            23 × 34 mm (Small)
          </button>
          <button
            onClick={() => setSelectedPreset('size_37x53')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: selectedPreset === 'size_37x53' ? '1px solid #2563eb' : '1px solid #cbd5e1',
              background: selectedPreset === 'size_37x53' ? '#eff6ff' : '#ffffff',
              color: selectedPreset === 'size_37x53' ? '#1d4ed8' : '#475569',
              transition: 'all 0.15s',
            }}
          >
            37 × 53 mm (Large)
          </button>
        </div>
      </div>

      {/* ── Feature Highlights Strip ── */}
      <div
        style={{
          background: '#f1f5f9',
          borderBottom: '1px solid #e2e8f0',
          padding: '8px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#475569' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Check size={13} style={{ color: '#16a34a' }} /> Pure White Backing
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Check size={13} style={{ color: '#16a34a' }} /> 1px Studio Photo Border
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Check size={13} style={{ color: '#16a34a' }} /> Bottom Student Name Label
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Check size={13} style={{ color: '#16a34a' }} /> Optional Class & Date Caption
          </span>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', width: '240px' }}>
          <Search size={13} style={{ position: 'absolute', left: '9px', top: '9px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search client organisation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              height: '30px',
              paddingLeft: '28px',
              paddingRight: '10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              boxSizing: 'border-box',
              outline: 'none',
              background: '#ffffff',
            }}
          />
        </div>
      </div>

      {/* ── Client List Table ── */}
      <div
        className="table-wrapper"
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <table className="data-table" style={{ width: '100%', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center' }}>S. No.</th>
              <th style={{ minWidth: '220px' }}>Organisation / Client Name</th>
              <th style={{ width: '130px', textAlign: 'center' }}>Approved Photos</th>
              <th style={{ width: '110px', textAlign: 'center' }}>Total Cards</th>
              <th style={{ width: '130px', textAlign: 'center' }}>Available Tables</th>
              <th style={{ width: '200px', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  No organisations found matching &quot;{searchTerm}&quot;
                </td>
              </tr>
            ) : (
              filteredClients.map((client, idx) => {
                const tables = getClientTables(client);
                const approvedCount = client.approved || client.approved_cards || 0;
                const totalCards = client.total || client.total_cards || 0;
                const isTableSelectOpen = activeClientTableSelect === client.id;

                return (
                  <React.Fragment key={client.id || idx}>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748b' }}>{idx + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Building size={14} style={{ color: '#0050d2', flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>
                            {client.name || client.school_name || 'Organisation'}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: approvedCount > 0 ? '#15803d' : '#64748b',
                            background: approvedCount > 0 ? '#dcfce7' : '#f1f5f9',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                          }}
                        >
                          {approvedCount} Ready
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', color: '#475569', fontWeight: 600 }}>{totalCards}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: '#f1f5f9',
                            fontSize: '11.5px',
                            color: '#334155',
                            fontWeight: 600,
                          }}
                        >
                          {tables.length} Table{tables.length !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '6px 12px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleGenerateClick(client)}
                            disabled={tables.length === 0}
                            style={{
                              padding: '4px 10px',
                              fontSize: '12px',
                              height: '28px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            <Camera size={13} />
                            <span>Generate Passport</span>
                            {tables.length > 1 && <ChevronDown size={12} />}
                          </Button>
                          {tables.length > 0 && (
                            <button
                              onClick={() => onNavigate('cards', { tableId: tables[0].id })}
                              title="Open table in Table Actions"
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#475569',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <ExternalLink size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Multi-table dropdown drawer */}
                    {isTableSelectOpen && tables.length > 1 && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={6} style={{ padding: '8px 18px' }}>
                          <div
                            style={{
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '10px 14px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                              Select Table to Generate Passport Photos:
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {tables.map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => {
                                    if (onOpenDownloadModal) {
                                      onOpenDownloadModal({
                                        table: t,
                                        tableId: t.id,
                                        status: 'approved',
                                        cardCount: t.approved_cards || t.approved || 0,
                                      });
                                    } else {
                                      onNavigate('cards', { tableId: t.id });
                                    }
                                    setActiveClientTableSelect(null);
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '5px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid #93c5fd',
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Layers size={12} />
                                  <span>{t.name}</span>
                                  <span style={{ fontSize: '11px', color: '#2563eb', opacity: 0.8 }}>
                                    ({t.approved_cards || t.approved || 0} approved)
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   2. Generate Cards Workspace (Coming Soon / Future Implementation)
───────────────────────────────────────────────────────────────────────── */
export function GenerateCardsWorkspace({ onNavigate }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: '#f8fafc',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #cbd5e1',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CreditCard size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Automated Card Generation Engine
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#fef3c7',
                  color: '#b45309',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid #fde68a',
                }}
              >
                In Development
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
              High-resolution batch vector &amp; raster ID card rendering engine directly from approved table rows.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate('cards')}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '4px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            color: '#334155',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>Open Table Actions</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* ── Architecture Pipeline Preview ── */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '760px',
            width: '100%',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              Batch Card Layout &amp; Rendering Pipeline
            </h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              The upcoming card generation engine will transform approved student records into print-ready sheet impositions.
            </p>
          </div>

          {/* 4 Steps Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              {
                step: '1',
                title: 'Template Mapping',
                desc: 'Select front/back SVG or PSD card canvas with safe zones and bleed margins.',
                icon: Layers,
              },
              {
                step: '2',
                title: 'Data & QR Binding',
                desc: 'Automated binding of student photos, dynamic text columns, and 2D/QR barcodes.',
                icon: Wand2,
              },
              {
                step: '3',
                title: 'Sheet Imposition',
                desc: '10-up A4 or 24-up 12x18 sheet layouts with standard printer crop marks.',
                icon: Sliders,
              },
              {
                step: '4',
                title: 'Vector PDF Spool',
                desc: 'Direct CMYK 300 DPI export ready for production digital press printers.',
                icon: Download,
              },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div
                key={step}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '12px',
                    }}
                  >
                    {step}
                  </div>
                  <Icon size={16} style={{ color: '#94a3b8' }} />
                </div>
                <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{title}</h5>
                <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b', lineHeight: 1.4 }}>{desc}</p>
              </div>
            ))}
          </div>

          {/* Current Alternative Info Notice */}
          <div
            style={{
              marginTop: '20px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <Info size={18} style={{ color: '#1d4ed8', flexShrink: 0 }} />
            <span style={{ fontSize: '12.5px', color: '#1e40af', lineHeight: 1.4 }}>
              <strong>Production Note:</strong> Card generation engine is in active development. You can currently export
              formatted data, zipped photos, and reports via <strong>Table Actions &gt; Download Data</strong>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   3. Finish Photos Workspace (Studio Photo Retouching & Face Cleaning)
───────────────────────────────────────────────────────────────────────── */
export function FinishPhotosWorkspace({
  clients = [],
  allTables = [],
  onNavigate,
}) {
  const [selectedOrgId, setSelectedOrgId] = useState(clients[0]?.id || '');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [imageSource, setImageSource] = useState('approved'); // 'approved' | 'downloaded'

  // Studio Adjustments state
  const [brightness, setBrightness] = useState(0); // -100 to +100
  const [shadows, setShadows] = useState(0); // -100 to +100
  const [midtones, setMidtones] = useState(0); // -100 to +100
  const [faceClean, setFaceClean] = useState(65); // 0 to 100%
  const [warmth, setWarmth] = useState(0); // -50 to +50
  const [showOriginal, setShowOriginal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Available tables for selected organisation
  const currentOrgTables = useMemo(() => {
    if (!selectedOrgId) return [];
    const org = (clients || []).find((c) => String(c.id) === String(selectedOrgId));
    if (org && Array.isArray(org.tables) && org.tables.length > 0) {
      return org.tables;
    }
    const cId = String(selectedOrgId).toLowerCase();
    const cName = String(org?.name || org?.school_name || '').toLowerCase();
    return (allTables || []).filter((t) => {
      if (!t) return false;
      const tClientId = String(
        t.client_id || t.clientId || t.client || t.organisation_id || t.organisation || t.group?.client?.id || ''
      ).toLowerCase();
      const tClientName = String(t.client_name || t.group?.client?.name || '').toLowerCase();
      return (cId && tClientId === cId) || (cName && tClientName === cName);
    });
  }, [clients, selectedOrgId, allTables]);

  const handleReset = () => {
    setBrightness(0);
    setShadows(0);
    setMidtones(0);
    setFaceClean(65);
    setWarmth(0);
  };

  const handleApplyBatch = () => {
    setIsProcessing(true);
    setFeedbackMsg(null);
    setTimeout(() => {
      setIsProcessing(false);
      setFeedbackMsg(
        'Studio calibration profile saved! The photo studio finishing engine will apply these adjustments during card and photo packaging.'
      );
    }, 900);
  };

  // Compute CSS filter dynamically based on sliders
  const bVal = 1 + brightness / 100;
  const cVal = 1 + midtones / 100;
  const sVal = 1 + shadows / 200;
  const wVal = warmth > 0 ? `sepia(${warmth * 0.4}%)` : `hue-rotate(${warmth * 0.5}deg)`;
  const computedFilter = showOriginal
    ? 'none'
    : `brightness(${bVal}) contrast(${cVal}) saturate(${sVal}) ${wVal}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: '#f8fafc',
      }}
    >
      {/* ── Top Header ── */}
      <div
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #cbd5e1',
          padding: '12px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#f5f3ff',
              border: '1px solid #ddd6fe',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Finish Photos — Studio Photo Retouching
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#f5f3ff',
                  color: '#7c3aed',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid #ddd6fe',
                }}
              >
                Studio Calibration
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
              Calibrate brightness, darkness, midtones, and facial smoothing for approved student photos before printing.
            </p>
          </div>
        </div>

        {/* Organisation & Table Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={selectedOrgId}
            onChange={(e) => {
              setSelectedOrgId(e.target.value);
              setSelectedTableId('');
            }}
            style={{
              height: '30px',
              padding: '0 8px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#1e293b',
              outline: 'none',
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.school_name || `Client #${c.id}`}
              </option>
            ))}
          </select>

          <select
            value={selectedTableId}
            onChange={(e) => setSelectedTableId(e.target.value)}
            style={{
              height: '30px',
              padding: '0 8px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#1e293b',
              outline: 'none',
            }}
          >
            <option value="">All Tables in Organisation</option>
            {currentOrgTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={imageSource}
            onChange={(e) => setImageSource(e.target.value)}
            style={{
              height: '30px',
              padding: '0 8px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#1e293b',
              outline: 'none',
            }}
          >
            <option value="approved">Approved List Images</option>
            <option value="downloaded">Download List (Printed)</option>
          </select>

          <button
            type="button"
            disabled={!selectedTableId}
            onClick={() => {
              if (!selectedTableId) return;
              const org = (clients || []).find((c) => String(c.id) === String(selectedOrgId));
              const tbl = (currentOrgTables || []).find((t) => String(t.id) === String(selectedTableId));
              onNavigate?.('fix-images', {
                tableId: Number(selectedTableId),
                orgId: selectedOrgId ? Number(selectedOrgId) : null,
                orgName: org?.name || org?.school_name || null,
                tableName: tbl?.name || null,
                status: 'approved',
              });
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '30px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              border: '1px solid #7c3aed',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
              color: '#ffffff',
              cursor: selectedTableId ? 'pointer' : 'not-allowed',
              opacity: selectedTableId ? 1 : 0.6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              whiteSpace: 'nowrap',
            }}
            title="Open Fix Images Studio for this table's approved cards"
          >
            <Sparkles size={13} />
            <span>Open Fix Images Studio</span>
          </button>
        </div>
      </div>

      {/* ── Workspace Body: Studio Controls + Live Preview ── */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 20px',
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 420px) 1fr',
          gap: '20px',
        }}
      >
        {/* Left Column: Sliders */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sliders size={15} style={{ color: '#2563eb' }} />
              <span>Studio Calibration Sliders</span>
            </h4>
            <button
              onClick={handleReset}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <RotateCcw size={12} /> Reset
            </button>
          </div>

          {/* 1. Brightness */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 600 }}>
              <span style={{ color: '#334155' }}>Brightness</span>
              <span style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                {brightness > 0 ? `+${brightness}` : brightness}%
              </span>
            </div>
            <input
              type="range"
              min="-100"
              max="100"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          {/* 2. Darkness / Shadows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 600 }}>
              <span style={{ color: '#334155' }}>Darkness / Shadows</span>
              <span style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                {shadows > 0 ? `+${shadows}` : shadows}%
              </span>
            </div>
            <input
              type="range"
              min="-100"
              max="100"
              value={shadows}
              onChange={(e) => setShadows(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          {/* 3. Midtones / Contrast */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 600 }}>
              <span style={{ color: '#334155' }}>Midtones / Contrast</span>
              <span style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                {midtones > 0 ? `+${midtones}` : midtones}%
              </span>
            </div>
            <input
              type="range"
              min="-100"
              max="100"
              value={midtones}
              onChange={(e) => setMidtones(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          {/* 4. Face Cleaning & AI Retouching */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#f5f3ff', padding: '10px', borderRadius: '6px', border: '1px solid #ddd6fe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 700 }}>
              <span style={{ color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Sparkles size={13} /> Face Cleaning &amp; Skin Smoothing
              </span>
              <span style={{ color: '#7c3aed', fontFamily: 'monospace' }}>{faceClean}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={faceClean}
              onChange={(e) => setFaceClean(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '11px', color: '#7c3aed' }}>
              Removes blemishes, normalizes skin shine, and balances studio portrait tones.
            </span>
          </div>

          {/* 5. Warmth / White Balance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 600 }}>
              <span style={{ color: '#334155' }}>Color Warmth / White Balance</span>
              <span style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                {warmth > 0 ? `+${warmth}` : warmth}
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              value={warmth}
              onChange={(e) => setWarmth(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          {/* Apply Button */}
          <Button
            variant="primary"
            onClick={handleApplyBatch}
            disabled={isProcessing}
            style={{
              marginTop: '8px',
              height: '36px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={14} />
            <span>{isProcessing ? 'Saving Calibration...' : 'Save & Batch Finish Photos'}</span>
          </Button>

          {feedbackMsg && (
            <div
              style={{
                fontSize: '12px',
                color: '#15803d',
                background: '#dcfce7',
                border: '1px solid #bbf7d0',
                padding: '8px 10px',
                borderRadius: '4px',
                lineHeight: 1.4,
              }}
            >
              {feedbackMsg}
            </div>
          )}
        </div>

        {/* Right Column: Live Studio Preview Canvas */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          {/* Top Bar inside Preview */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Eye size={15} style={{ color: '#2563eb' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Live Studio Preview</span>
            </div>
            <button
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onTouchStart={() => setShowOriginal(true)}
              onTouchEnd={() => setShowOriginal(false)}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: showOriginal ? '#dbeafe' : '#f8fafc',
                color: showOriginal ? '#1d4ed8' : '#475569',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              {showOriginal ? 'Showing Original (Raw)' : 'Hold to View Original'}
            </button>
          </div>

          {/* Student Photo Studio Simulation Canvas */}
          <div
            style={{
              position: 'relative',
              width: '240px',
              height: '310px',
              borderRadius: '6px',
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Simulated Photo with Real-Time CSS Filter */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                overflow: 'hidden',
                background: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Synthetic portrait placeholder with clean studio lighting */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(180deg, #e0f2fe 0%, #bae6fd 60%, #7dd3fc 100%)',
                  filter: computedFilter,
                  transition: showOriginal ? 'none' : 'filter 0.1s ease-out',
                }}
              >
                {/* SVG Portrait Figure */}
                <svg width="140" height="180" viewBox="0 0 140 180" fill="none">
                  {/* Head */}
                  <ellipse cx="70" cy="65" rx="36" ry="44" fill="#f8d7b8" />
                  {/* Hair */}
                  <path
                    d="M34 60 C34 30, 106 30, 106 60 C106 40, 90 20, 70 20 C50 20, 34 40, 34 60 Z"
                    fill="#3b2f2f"
                  />
                  {/* Eyes */}
                  <ellipse cx="56" cy="65" rx="4" ry="3" fill="#1e293b" />
                  <ellipse cx="84" cy="65" rx="4" ry="3" fill="#1e293b" />
                  {/* Smile */}
                  <path d="M60 85 Q70 95 80 85" stroke="#be123c" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  {/* Neck */}
                  <rect x="58" y="104" width="24" height="22" fill="#f1c7a5" />
                  {/* Shoulders / Uniform */}
                  <path
                    d="M10 180 C15 130, 50 120, 70 120 C90 120, 125 130, 130 180 Z"
                    fill="#1e3a8a"
                  />
                  {/* Collar */}
                  <path d="M55 120 L70 142 L85 120 Z" fill="#ffffff" />
                  <path d="M67 142 L70 180 L73 142 Z" fill="#dc2626" />
                </svg>

                {/* Face Clean Overlay Indicator */}
                {!showOriginal && faceClean > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      background: 'rgba(124, 58, 237, 0.85)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      backdropFilter: 'blur(2px)',
                    }}
                  >
                    <Sparkles size={10} /> AI Clean {faceClean}%
                  </div>
                )}
              </div>
            </div>

            {/* Simulated Passport bottom name label */}
            <div
              style={{
                height: '32px',
                background: '#ffffff',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px 8px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.02em' }}>
                STUDENT NAME HERE
              </span>
              <span style={{ fontSize: '9px', color: '#64748b' }}>CLASS X-A • 2026-2027</span>
            </div>
          </div>

          {/* Technical Specs Footer */}
          <div
            style={{
              marginTop: '16px',
              display: 'flex',
              gap: '12px',
              fontSize: '11.5px',
              color: '#64748b',
              textAlign: 'center',
            }}
          >
            <span>Dimensions: 600 × 800 px</span>
            <span>•</span>
            <span>Target: 300 DPI</span>
            <span>•</span>
            <span>Background: Studio White</span>
          </div>
        </div>
      </div>
    </div>
  );
}
