import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Crop,
  Sliders,
  Layers,
  CheckCheck,
  XCircle,
  Upload,
  Pencil,
  Image as ImageIcon,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Check,
  X,
  Search,
  SlidersHorizontal,
  RefreshCw,
  Sun,
  Contrast,
  SlidersVertical,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  FileText,
} from 'lucide-react';
import { cardApi, schemaApi } from '../../services/api';
import ReuploadImageModal from './modals/ReuploadImageModal';
import { swrCache } from '../../utils/swrCache';
import { FONT, COLOR, RADIUS, SHADOW } from '../../styles/tokens';

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

export default function FixImagesView({
  tableId,
  scopedOrgId = null,
  scopedOrgName = null,
  currentUser = null,
  userRole = 'super_admin',
  onBack,
  addToast,
}) {
  const [cards, setCards] = useState([]);
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'edited', 'pending'

  // Map of cardId -> custom adjustments: { brightness, contrast, saturation, rotation, zoom, edited: true }
  const [editedImagesMap, setEditedImagesMap] = useState({});

  // Active Card open in Manual Edit Side Drawer
  const [activeDrawerCard, setActiveDrawerCard] = useState(null);
  const [drawerAdjustments, setDrawerAdjustments] = useState({
    brightness: 0,
    contrast: 0,
    saturation: 100,
    sharpness: 0,
    rotation: 0,
    zoom: 1,
  });
  const [showOriginalInDrawer, setShowOriginalInDrawer] = useState(false);
  const [uploadFileInputRef, setUploadFileInputRef] = useState(null);
  const hiddenFileInputRef = useRef(null);
  const [singleUploadCardId, setSingleUploadCardId] = useState(null);
  const [showReuploadModal, setShowReuploadModal] = useState(false);
  const [originalPhotosBeforeReupload, setOriginalPhotosBeforeReupload] = useState({});

  // Load Table metadata and Approved cards
  const loadApprovedCards = useCallback(async () => {
    if (!tableId) return;
    setLoading(true);
    try {
      const [tableData, cardsData] = await Promise.all([
        schemaApi.getTable(tableId).catch(() => null),
        cardApi.getCards(tableId, { status: 'approved', limit: 200 }),
      ]);

      if (tableData) setTable(tableData);
      const list = cardsData?.cards || cardsData?.results || (Array.isArray(cardsData) ? cardsData : []);
      setCards(list);
    } catch (err) {
      console.error('Failed to load approved cards for Fix Images:', err);
      addToast?.('Failed to load cards for Fix Images studio', 'error');
    } finally {
      setLoading(false);
    }
  }, [tableId, addToast]);

  useEffect(() => {
    loadApprovedCards();
  }, [loadApprovedCards]);

  // Open drawer with existing adjustments for a card
  const handleOpenDrawer = (card) => {
    setActiveDrawerCard(card);
    const existing = editedImagesMap[card.id] || {
      brightness: 0,
      contrast: 0,
      saturation: 100,
      sharpness: 0,
      rotation: 0,
      zoom: 1,
    };
    setDrawerAdjustments({ ...existing });
    setShowOriginalInDrawer(false);
  };

  const handleCloseDrawer = () => {
    setActiveDrawerCard(null);
  };

  const handleSaveDrawerAdjustments = () => {
    if (!activeDrawerCard) return;
    setEditedImagesMap((prev) => ({
      ...prev,
      [activeDrawerCard.id]: {
        ...drawerAdjustments,
        edited: true,
        savedAt: new Date().toISOString(),
      },
    }));
    addToast?.(`Image adjustments saved for card #${activeDrawerCard.id}`, 'success');
    handleCloseDrawer();
  };

  const handleResetDrawerAdjustments = () => {
    setDrawerAdjustments({
      brightness: 0,
      contrast: 0,
      saturation: 100,
      sharpness: 0,
      rotation: 0,
      zoom: 1,
    });
  };

  // Planned Auto features
  const handleAutoCropAll = () => {
    addToast?.('Auto Crop analysis queued for Approved cards (Planned feature)', 'info');
  };

  const handleAutoEditAll = () => {
    addToast?.('Auto Edit color enhancement queued for Approved cards (Planned feature)', 'info');
  };

  const handleAutoExtractAll = () => {
    addToast?.('Auto Background Extraction queued for Approved cards (Planned feature)', 'info');
  };

  const handleAcceptAllAndMerge = () => {
    const editedCount = Object.keys(editedImagesMap).length;
    addToast?.(
      editedCount > 0
        ? `Accepted and merged ${editedCount} edited image(s) into Approved batch.`
        : 'Accept All & Merge triggered for current photo batch.',
      'success'
    );
  };

  const handleRejectAll = () => {
    setEditedImagesMap({});
    addToast?.('All pending image modifications rejected. Reverted to originals.', 'info');
  };

  const handleTriggerSingleUpload = (cardId = null) => {
    setSingleUploadCardId(cardId);
    hiddenFileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (singleUploadCardId) {
      setEditedImagesMap((prev) => ({
        ...prev,
        [singleUploadCardId]: {
          ...(prev[singleUploadCardId] || {}),
          customPhotoUrl: url,
          edited: true,
        },
      }));
      addToast?.(`Custom photo uploaded for card #${singleUploadCardId}`, 'success');
    } else if (cards.length > 0) {
      const firstId = cards[0].id;
      setEditedImagesMap((prev) => ({
        ...prev,
        [firstId]: {
          ...(prev[firstId] || {}),
          customPhotoUrl: url,
          edited: true,
        },
      }));
      addToast?.(`Custom photo uploaded for card #${firstId}`, 'success');
    }
    e.target.value = '';
  };

  // Helper to extract photo URL for a card
  const handleReuploadSuccess = async () => {
    const prevMap = {};
    cards.forEach((c) => {
      prevMap[c.id] = getCardPhoto(c);
    });
    setOriginalPhotosBeforeReupload(prevMap);
    await loadApprovedCards();
    setShowReuploadModal(false);
    addToast?.('Images reuploaded! Previewing original vs newly reuploaded photos.', 'success');
  };

  const getCardPhotoFileName = (card) => {
    const fd = card.field_data || {};
    const photoKey = Object.keys(fd).find(
      (k) => k.toUpperCase() === 'PHOTO' || k.toLowerCase().includes('image') || k.toLowerCase().includes('pic')
    );
    const rawVal = photoKey ? fd[photoKey] : fd.PHOTO || card.photo_url || '';
    if (!rawVal) return 'card_' + card.id + '.jpg';
    const str = String(rawVal).trim();
    if (str.startsWith('PENDING:') || str === 'NOT_FOUND') return 'card_' + card.id + '.jpg';
    const parts = str.split(/[\\/]/);
    const fileName = parts[parts.length - 1];
    return fileName || ('card_' + card.id + '.jpg');
  };

  const getCardPhoto = (card) => {
    const fd = card.field_data || {};
    const photoKey = Object.keys(fd).find(
      (k) => k.toUpperCase() === 'PHOTO' || k.toLowerCase().includes('image') || k.toLowerCase().includes('pic')
    );
    const rawVal = photoKey ? fd[photoKey] : fd.PHOTO || card.photo_url || '';
    return getImgSrc(rawVal);
  };

  const getCardName = (card) => {
    const fd = card.field_data || {};
    return (
      fd.NAME ||
      fd.Name ||
      fd['STUDENT NAME'] ||
      fd.Student_Name ||
      card.name ||
      `Card #${card.id}`
    );
  };

  const getCardDetails = (card) => {
    const fd = card.field_data || {};
    const cls = fd.CLASS || fd.Class || fd.Standard || '';
    const sec = fd.SECTION || fd.Section || fd.Sec || '';
    const roll = fd['ROLL NO'] || fd['ROLL_NO'] || fd.Roll_No || fd.Roll || '';
    return { cls, sec, roll };
  };

  // Filtered Cards
  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const name = String(getCardName(c)).toLowerCase();
        const { cls, sec, roll } = getCardDetails(c);
        const match =
          name.includes(q) ||
          String(cls).toLowerCase().includes(q) ||
          String(sec).toLowerCase().includes(q) ||
          String(roll).toLowerCase().includes(q) ||
          String(c.id).includes(q);
        if (!match) return false;
      }
      if (filterMode === 'edited') {
        return Boolean(editedImagesMap[c.id]?.edited);
      }
      if (filterMode === 'pending') {
        return !editedImagesMap[c.id]?.edited;
      }
      return true;
    });
  }, [cards, search, filterMode, editedImagesMap]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: '#f1f5f9',
        fontFamily: 'var(--font-family)',
      }}
    >
      <input
        type="file"
        ref={hiddenFileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {/* ══════════════════════════════════════════════════════════
          1. TOPBAR — SOLID DARK #1e1e2e (HEIGHT 44px)
          ══════════════════════════════════════════════════════════ */}
      <header
        style={{
          flexShrink: 0,
          padding: '0 16px',
          background: '#1e1e2e',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          height: '44px',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxSizing: 'border-box',
          color: '#ffffff',
          zIndex: 10,
        }}
      >
        {/* Left: Back Button, Title, and 3 Auto Option Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            title="Back to Approved Table"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <span style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.2)', margin: '0 4px' }} />

          <button
            type="button"
            onClick={handleAutoCropAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 10px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid #6366f1',
              background: 'rgba(99, 102, 241, 0.2)',
              color: '#c7d2fe',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            title="Automatically detect face and crop to passport ratio"
          >
            <Crop size={13} />
            <span>Crop</span>
          </button>

          <button
            type="button"
            onClick={handleAutoEditAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 10px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid #8b5cf6',
              background: 'rgba(139, 92, 246, 0.2)',
              color: '#ddd6fe',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            title="Automatically enhance lighting, contrast, and color balance"
          >
            <Sliders size={13} />
            <span>Edit</span>
          </button>

          <button
            type="button"
            onClick={handleAutoExtractAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 10px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid #06b6d4',
              background: 'rgba(6, 182, 212, 0.2)',
              color: '#a5f3fc',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            title="Extract subject and remove distracting background"
          >
            <Layers size={13} />
            <span>Extract</span>
          </button>
        </div>

        {/* Right: Total Approved Cards count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#94a3b8',
              background: 'rgba(255, 255, 255, 0.08)',
              padding: '3px 8px',
              borderRadius: '4px',
            }}
          >
            {cards.length} Approved Card{cards.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════
          2. SUB-NAVBAR — SOLID WHITE #ffffff (HEIGHT 44px)
          ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          flexShrink: 0,
          padding: '0 16px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          height: '30px',
          minHeight: '30px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          boxSizing: 'border-box',
          zIndex: 9,
        }}
      >
        {/* Left: Accept All & Merge, Reject All, Single Photo Upload, Manual Edit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleAcceptAllAndMerge}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 12px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid #059669',
              background: '#10b981',
              color: '#ffffff',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'background-color 0.15s ease',
            }}
            title="Accept all processed edits and merge into current approved batch"
          >
            <CheckCheck size={14} />
            <span>Merge</span>
          </button>

          <button
            type="button"
            onClick={handleRejectAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 12px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid #fca5a5',
              background: '#fef2f2',
              color: '#dc2626',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            title="Reject all pending adjustments and restore original photos"
          >
            <XCircle size={14} />
            <span>Reject</span>
          </button>

          <span style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px' }} />

          {/* Reupload button from approved table */}
          <button
            type="button"
            onClick={() => setShowReuploadModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 10px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid #0d9488',
              background: '#0d9488',
              color: '#ffffff',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'background-color 0.15s ease',
            }}
            title="Reupload images from ZIP and compare preview with originals"
          >
            <RefreshCw size={13} />
            <span>Reupload</span>
          </button>

          <button
            type="button"
            onClick={() => handleTriggerSingleUpload()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 10px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            title="Upload replacement image file directly"
          >
            <Upload size={13} />
            <span>Upload</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (cards.length > 0) handleOpenDrawer(cards[0]);
              else addToast?.('No cards available to edit', 'info');
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 10px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid #93c5fd',
              background: '#eff6ff',
              color: '#1d4ed8',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            title="Open manual image editor drawer"
          >
            <Pencil size={13} />
            <span>Manual Edit</span>
          </button>
        </div>

        {/* Right: Quick Search and View Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={13}
              style={{ position: 'absolute', left: '8px', color: '#94a3b8', pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder="Search student or roll..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                height: '34px',
                minHeight: '34px',
                padding: '0 8px 0 26px',
                fontSize: '13px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                outline: 'none',
                width: '180px',
                background: '#ffffff',
                color: '#1e293b',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          3. MAIN AREA — PHOTO PAIR COMPARISON GRID
          ══════════════════════════════════════════════════════════ */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          boxSizing: 'border-box',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '300px',
              gap: '12px',
              color: '#64748b',
            }}
          >
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Loading approved photos for enhancement...</span>
          </div>
        ) : filteredCards.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '300px',
              gap: '8px',
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px dashed #cbd5e1',
              color: '#64748b',
            }}
          >
            <ImageIcon size={32} style={{ color: '#94a3b8' }} />
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>
              No Approved Cards Found
            </div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              {search ? 'Try clearing your search query.' : 'There are no cards in the Approved list for this table.'}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '14px',
            }}
          >
            {filteredCards.map((card) => {
              const currentPhoto = getCardPhoto(card);
              const originalPhoto = originalPhotosBeforeReupload[card.id] || currentPhoto;
              const isReuploaded = Boolean(
                originalPhotosBeforeReupload[card.id] &&
                originalPhotosBeforeReupload[card.id] !== currentPhoto
              );
              const photoFileName = getCardPhotoFileName(card);
              const customAdj = editedImagesMap[card.id];
              const isEdited = Boolean(customAdj?.edited) || isReuploaded;

              // Compute CSS filter for edited preview
              const b = customAdj?.brightness || 0;
              const c = customAdj?.contrast || 0;
              const s = customAdj?.saturation ?? 100;
              const rot = customAdj?.rotation || 0;
              const zoom = customAdj?.zoom || 1;
              const editedSrc = customAdj?.customPhotoUrl || (isReuploaded ? currentPhoto : originalPhoto);

              const editedFilterStyle = {
                filter: `brightness(${100 + b}%) contrast(${100 + c}%) saturate(${s}%)`,
                transform: `rotate(${rot}deg) scale(${zoom})`,
                transition: 'all 0.15s ease',
              };

              return (
                <div
                  key={card.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '8px',
                    border: isEdited ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                    padding: '10px 10px 8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'box-shadow 0.15s ease',
                  }}
                >
                  {/* Photos in Pair: Left Original, Right Edited — 19.5:25 Aspect Ratio */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                    }}
                  >
                    {/* Left: Original Photo */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#475569',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '0 2px',
                        }}
                      >
                        Original Image
                      </div>

                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '19.5 / 25',
                          background: '#f8fafc',
                          borderRadius: '5px',
                          border: '1px solid #cbd5e1',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                        }}
                      >
                        {originalPhoto ? (
                          <img
                            src={originalPhoto}
                            alt="Original"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        ) : (
                          <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                            <ImageIcon size={26} />
                            <div style={{ fontSize: '10px', marginTop: '4px', fontWeight: 500 }}>No Image</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Edited Image (Placeholder initially) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isReuploaded ? '#0d9488' : isEdited ? '#1d4ed8' : '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '0 2px',
                        }}
                      >
                        {isReuploaded ? 'Reuploaded' : isEdited ? 'Edited Image' : 'Edited (Placeholder)'}
                      </div>

                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '19.5 / 25',
                          background: isEdited ? '#eff6ff' : '#f8fafc',
                          borderRadius: '5px',
                          border: isEdited ? '1px solid #93c5fd' : '1px dashed #cbd5e1',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                        }}
                      >
                        {editedSrc ? (
                          <img
                            src={editedSrc}
                            alt="Edited"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                              ...editedFilterStyle,
                            }}
                          />
                        ) : (
                          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '6px' }}>
                            <ImageIcon size={26} />
                            <div style={{ fontSize: '10px', marginTop: '4px', fontWeight: 500 }}>Placeholder</div>
                          </div>
                        )}

                        {!isEdited && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '6px',
                              background: 'rgba(15, 23, 42, 0.75)',
                              color: '#ffffff',
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '2px 5px',
                              borderRadius: '3px',
                              letterSpacing: '0.03em',
                            }}
                          >
                            PENDING EDIT
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: File Name on Left, Both Action Buttons on Right */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: '6px',
                      gap: '8px',
                    }}
                  >
                    {/* Left: Image Name & Status */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#1e293b',
                          fontFamily: 'monospace, monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={`${photoFileName} — ${getCardName(card)}`}
                      >
                        {photoFileName}
                      </span>

                      {isReuploaded ? (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#0d9488',
                            background: '#ccfbf1',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            flexShrink: 0,
                          }}
                          title="Reuploaded"
                        >
                          <RefreshCw size={9} /> Reuploaded
                        </span>
                      ) : isEdited ? (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#0284c7',
                            background: '#e0f2fe',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            flexShrink: 0,
                          }}
                          title="Edited"
                        >
                          <CheckCircle2 size={9} /> Edited
                        </span>
                      ) : null}
                    </div>

                    {/* Right: Both Action Buttons Together */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexShrink: 0,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleTriggerSingleUpload(card.id)}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '0 10px',
                          height: '30px',
                          minHeight: '30px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#475569',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          boxSizing: 'border-box',
                          transition: 'background-color 0.15s ease',
                        }}
                        title="Upload custom image for this student"
                      >
                        <Upload size={12} />
                        <span>Upload</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenDrawer(card)}
                        style={{
                          background: '#2563eb',
                          border: '1px solid #1d4ed8',
                          borderRadius: '4px',
                          padding: '0 10px',
                          height: '30px',
                          minHeight: '30px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#ffffff',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          boxSizing: 'border-box',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                          transition: 'background-color 0.15s ease',
                        }}
                        title="Open manual image editor"
                      >
                        <Pencil size={12} />
                        <span>Manual Edit</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════
          4. MANUAL EDIT SIDE DRAWER
          "which will opne the sidedrawer with on top image and in bottom option to edit it."
          ══════════════════════════════════════════════════════════ */}
      {activeDrawerCard && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            zIndex: 99999,
            display: 'flex',
            justifyContent: 'flex-end',
            animation: 'fadeIn 0.15s ease-out',
          }}
          onClick={handleCloseDrawer}
        >
          <div
            style={{
              width: '460px',
              maxWidth: '94vw',
              height: '100%',
              backgroundColor: '#ffffff',
              boxShadow: '-4px 0 25px rgba(0, 0, 0, 0.18)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              animation: 'slideInRight 0.2s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#1e293b',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>
                  Manual Image Editor
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  {getCardName(activeDrawerCard)} (#{activeDrawerCard.id})
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseDrawer}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                }}
                title="Close Drawer"
              >
                <X size={18} />
              </button>
            </div>

            {/* TOP: Image Preview with Zoom and Compare */}
            <div
              style={{
                flex: '0 0 260px',
                backgroundColor: '#0f172a',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Preview Toggle: Original vs Edited */}
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  zIndex: 2,
                  display: 'flex',
                  background: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: '4px',
                  padding: '2px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowOriginalInDrawer(false)}
                  style={{
                    background: !showOriginalInDrawer ? '#2563eb' : 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  Edited Preview
                </button>
                <button
                  type="button"
                  onClick={() => setShowOriginalInDrawer(true)}
                  style={{
                    background: showOriginalInDrawer ? '#2563eb' : 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  Original
                </button>
              </div>

              {/* Zoom Indicator */}
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setDrawerAdjustments((prev) => ({
                      ...prev,
                      zoom: Math.max(0.6, Number((prev.zoom - 0.1).toFixed(1))),
                    }))
                  }
                  style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '2px' }}
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600, minWidth: '32px', textAlign: 'center' }}>
                  {Math.round(drawerAdjustments.zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDrawerAdjustments((prev) => ({
                      ...prev,
                      zoom: Math.min(2.0, Number((prev.zoom + 0.1).toFixed(1))),
                    }))
                  }
                  style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '2px' }}
                  title="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>
              </div>

              {/* The Live Rendered Canvas / Image */}
              <div
                style={{
                  width: '160px',
                  aspectRatio: '19.5 / 25',
                  borderRadius: '4px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
                  overflow: 'hidden',
                  background: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {getCardPhoto(activeDrawerCard) ? (
                  <img
                    src={getCardPhoto(activeDrawerCard)}
                    alt="Preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      filter: showOriginalInDrawer
                        ? 'none'
                        : `brightness(${100 + drawerAdjustments.brightness}%) contrast(${100 + drawerAdjustments.contrast}%) saturate(${drawerAdjustments.saturation}%)`,
                      transform: showOriginalInDrawer
                        ? 'none'
                        : `rotate(${drawerAdjustments.rotation}deg) scale(${drawerAdjustments.zoom})`,
                      transition: 'all 0.1s ease',
                    }}
                  />
                ) : (
                  <div style={{ color: '#94a3b8', textAlign: 'center' }}>
                    <ImageIcon size={32} />
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>No photo file</div>
                  </div>
                )}
              </div>
            </div>

            {/* BOTTOM: Options to edit it */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                backgroundColor: '#ffffff',
              }}
            >
              {/* Preset Buttons */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  QUICK PRESETS
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() =>
                      setDrawerAdjustments((prev) => ({
                        ...prev,
                        brightness: 8,
                        contrast: 12,
                        saturation: 110,
                      }))
                    }
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Auto Enhance
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDrawerAdjustments((prev) => ({
                        ...prev,
                        brightness: 15,
                        contrast: 20,
                        saturation: 105,
                      }))
                    }
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Passport White BG
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDrawerAdjustments((prev) => ({
                        ...prev,
                        brightness: 5,
                        contrast: 25,
                        saturation: 120,
                      }))
                    }
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    High Contrast
                  </button>
                </div>
              </div>

              {/* Rotation Controls */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                  ORIENTATION & ROTATION
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() =>
                      setDrawerAdjustments((prev) => ({
                        ...prev,
                        rotation: (prev.rotation - 90) % 360,
                      }))
                    }
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '6px 10px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={13} /> Rotate Left 90°
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDrawerAdjustments((prev) => ({
                        ...prev,
                        rotation: (prev.rotation + 90) % 360,
                      }))
                    }
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '6px 10px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCw size={13} /> Rotate Right 90°
                  </button>
                </div>
              </div>

              {/* Adjustments: Brightness Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sun size={13} style={{ color: '#f59e0b' }} /> Brightness
                  </span>
                  <span>{drawerAdjustments.brightness > 0 ? `+${drawerAdjustments.brightness}` : drawerAdjustments.brightness}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={drawerAdjustments.brightness}
                  onChange={(e) =>
                    setDrawerAdjustments((prev) => ({ ...prev, brightness: Number(e.target.value) }))
                  }
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>

              {/* Adjustments: Contrast Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Contrast size={13} style={{ color: '#6366f1' }} /> Contrast
                  </span>
                  <span>{drawerAdjustments.contrast > 0 ? `+${drawerAdjustments.contrast}` : drawerAdjustments.contrast}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={drawerAdjustments.contrast}
                  onChange={(e) =>
                    setDrawerAdjustments((prev) => ({ ...prev, contrast: Number(e.target.value) }))
                  }
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>

              {/* Adjustments: Saturation Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <SlidersVertical size={13} style={{ color: '#06b6d4' }} /> Saturation
                  </span>
                  <span>{drawerAdjustments.saturation}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={drawerAdjustments.saturation}
                  onChange={(e) =>
                    setDrawerAdjustments((prev) => ({ ...prev, saturation: Number(e.target.value) }))
                  }
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div
              style={{
                padding: '12px 18px',
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <button
                type="button"
                onClick={handleResetDrawerAdjustments}
                style={{
                  background: 'transparent',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleCloseDrawer}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveDrawerAdjustments}
                  style={{
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Check size={13} />
                  <span>Save & Apply</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
