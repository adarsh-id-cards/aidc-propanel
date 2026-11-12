/**
 * IDCardActionsView.jsx
 *
 * Full-featured ID card management view — 100% UI consistency with CardFlow system.
 * Replicates the original idcard-actions.html template, button colors, status tabs,
 * search-filter bar, dynamic column widths, photo dimensions, table borders, and standard bottom pagination bar.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  ThumbsUp,
  RotateCcw,
  Download,
  Image as ImageIcon,
  FileSpreadsheet,
  Search,
  X,
  Layers,
  Loader2,
  Eraser,
  SquareCheck,
  Square,
  MinusSquare,
  Clock,
  Printer,
  History,
  XCircle,
  Undo2,
  Redo2,
  AlertTriangle,
  AlertCircle,
  SlidersHorizontal,
  Share2,
  QrCode,
  Snowflake,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

import CustomSelect from '../common/CustomSelect';
import Input from '../common/Input';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import { SkeletonCardTableRows, SkeletonFullTable } from '../common/Skeleton';
import { cardApi, schemaApi, operationsApi, reprintApi } from '../../services/api';
import apiClient from '../../services/api';
import OperationHistoryModal from '../idcard/OperationHistoryModal';
import CardTimelineDrawer from '../idcard/CardTimelineDrawer';
import BulkTransactionsModal from '../idcard/BulkTransactionsModal';
import { isDropdownField, getOptionsForField } from '../../utils/formatPresets';
import { validateCell, findGridDuplicates, getCardIssues, getCardFieldValue, compareClasses } from '../../utils/tableValidation';
import { formatDisplayDateTime } from '../../utils/formatters';
import { swrCache } from '../../utils/swrCache';
import {
  CardSideDrawer,
  UploadXlsxModal,
  ReuploadImageModal,
  ClearPendingPathModal,
  PrintDataModal,
  DownloadDataModal,
  PrintSelectedModal,
  TableFilterModal,
  PhotoCollectionDrawer,
  // Freeze & Movement Filter panels are now integrated inside TableFilterModal
} from './modals';




const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const renderHighlightedText = (text, query) => {
  if (text === null || text === undefined) return '';
  const str = String(text);
  const cleanQ = String(query || '').trim();
  if (!cleanQ || !str) return str.toUpperCase();

  try {
    const escaped = escapeRegExp(cleanQ);
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = str.split(regex);
    if (parts.length === 1) return str.toUpperCase();

    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === cleanQ.toLowerCase() ? (
            <mark
              key={i}
              style={{
                backgroundColor: '#fef08a',
                color: '#854d0e',
                fontWeight: 800,
                padding: '0 2px',
                borderRadius: '2px',
                textTransform: 'uppercase',
              }}
            >
              {part.toUpperCase()}
            </mark>
          ) : (
            part.toUpperCase()
          )
        )}
      </>
    );
  } catch (_) {
    return str.toUpperCase();
  }
};

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

const REPRINT_TABS = [
  { key: 'request', label: 'Requested', bg: '#a855f7', bgLight: '#f3e8ff', color: '#9333ea' },
  { key: 'confirm', label: 'Confirmed', bg: '#10b981', bgLight: '#d1fae5', color: '#059669' },
];

const PRINTED_TAB = [
  { key: 'printed', label: 'Printed', bg: '#64748b', bgLight: '#f1f5f9', color: '#475569' },
];

const IMAGE_FIELD_TYPES = new Set([
  'photo',
  'image',
  'img',
  'picture',
  'pic',
  'rel_photo',
  'mother_photo',
  'father_photo',
  'sign',
  'signature',
  'qr',
  'qrcode',
  'barcode',
]);

const isImageField = (type, name) => {
  if (type === 'text') return false;
  return (
    IMAGE_FIELD_TYPES.has((type || '').toLowerCase()) ||
    IMAGE_FIELD_TYPES.has((name || '').toLowerCase().replace(/ /g, '_'))
  );
};

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

// Table-level column widths & max content lengths cache.
// Preserves calibrated column widths across tab switches (pending, verified, approved, printed, deleted).
const tableColumnMetricsCache = new Map();

function getStoredTableMetrics(tId) {
  if (tableColumnMetricsCache.has(tId)) {
    return tableColumnMetricsCache.get(tId);
  }
  try {
    const raw = localStorage.getItem(`cf_table_${tId}_metrics`);
    if (raw) {
      const parsed = JSON.parse(raw);
      tableColumnMetricsCache.set(tId, parsed);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  const initial = { maxLens: {}, baseWidths: {} };
  tableColumnMetricsCache.set(tId, initial);
  return initial;
}

function persistTableMetrics(tId, data) {
  tableColumnMetricsCache.set(tId, data);
  try {
    localStorage.setItem(`cf_table_${tId}_metrics`, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}


const getThumbnailSrc = (path) => {
  if (!path) return '';
  let s = String(path).trim();
  if (s.startsWith('PENDING:') || !s || s === 'NOT_FOUND') return '';
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('blob:')) {
    return s;
  }
  let clean = s.replace(/\\/g, '/');
  if (clean.startsWith('/media/')) clean = clean.substring(7);
  else if (clean.startsWith('media/')) clean = clean.substring(6);
  else if (clean.startsWith('/')) clean = clean.substring(1);

  const parts = clean.split('/');
  if (parts.length >= 2) {
    const baseFolder = parts[0];
    const rest = parts.slice(1).join('/');
    const dotIdx = rest.lastIndexOf('.');
    const stem = dotIdx > -1 ? rest.substring(0, dotIdx) : rest;
    return getImgSrc(`${baseFolder}/thumbs/${stem}.webp`);
  }
  const dotIdx = clean.lastIndexOf('.');
  const stem = dotIdx > -1 ? clean.substring(0, dotIdx) : clean;
  return getImgSrc(`thumbs/${stem}.webp`);
};

/* Smart Semantic Column Classifier & Width Allocation (Matches FieldClassifier) */
const PhotoTableCell = React.memo(function PhotoTableCell({
  card,
  field,
  spec,
  val,
  width,
  onEdit,
}) {
  const finalColW = width ? (typeof width === 'number' ? `${width}px` : width) : spec.width;
  const [imgFailed, setImgFailed] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    setUseOriginal(false);
    setImgLoaded(false);
  }, [val]);

  const isPhoto = spec.imgType === 'photo';
  const isSig = spec.imgType === 'signature';

  const cleanVal = String(val ?? '').trim();
  const separatePath = String(
    card?.field_data?.PATH ||
    card?.field_data?.Path ||
    card?.field_data?.path ||
    card?.field_data?.[`${field.name} Path`] ||
    card?.field_data?.['Photo Path'] ||
    ''
  ).trim();

  let photoPath = '';
  if (cleanVal && cleanVal !== 'NOT_FOUND') {
    photoPath = cleanVal.startsWith('PENDING:') ? cleanVal.substring(8).trim() : cleanVal;
  } else if (separatePath && separatePath !== 'NOT_FOUND') {
    photoPath = separatePath.startsWith('PENDING:') ? separatePath.substring(8).trim() : separatePath;
  }

  const isExplicitPending =
    cleanVal.startsWith('PENDING:') ||
    separatePath.startsWith('PENDING:') ||
    (cleanVal !== '' && !cleanVal.includes('/') && !cleanVal.includes('\\') && !cleanVal.startsWith('data:') && !cleanVal.startsWith('http'));

  const rawSrc = getImgSrc(val);
  const thumbSrc = getThumbnailSrc(val);
  const activeSrc = useOriginal ? rawSrc : (thumbSrc || rawSrc);
  const canDisplayImg = Boolean(activeSrc && !isExplicitPending && !imgFailed);

  const hasPath = Boolean(photoPath);
  const isComplete = canDisplayImg;
  const isPending = !isComplete && (hasPath || isExplicitPending || imgFailed);

  let displayFilename = '';
  if (photoPath) {
    const norm = photoPath.replace(/\\/g, '/');
    displayFilename = norm.split('/').pop() || norm;
  }

  if (!isPhoto) {
    const imgW = isSig ? '64px' : '38px';
    const imgH = isSig ? '28px' : '38px';
    return (
      <td
        key={field.name}
        style={{
          padding: '2px',
          textAlign: 'center',
          width: finalColW,
          minWidth: finalColW,
          maxWidth: finalColW,
          boxSizing: 'border-box',
          height: '68px',
          borderRight: '1px solid #e2e8f0',
          borderBottom: '1px solid #e2e8f0',
          verticalAlign: 'middle',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
          {canDisplayImg ? (
            <div style={{ position: 'relative', width: imgW, height: imgH, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {!imgLoaded && !imgFailed && (
                <div style={{ position: 'absolute', inset: 0, background: '#f1f5f9', borderRadius: '5px' }} />
              )}
              <img
                src={activeSrc}
                alt={field.name}
                loading="lazy"
                decoding="async"
                onLoad={() => setImgLoaded(true)}
                onError={() => {
                  if (!useOriginal && rawSrc && rawSrc !== activeSrc) {
                    setUseOriginal(true);
                  } else {
                    setImgFailed(true);
                  }
                }}
                style={{
                  width: imgW,
                  height: imgH,
                  objectFit: 'contain',
                  borderRadius: '5px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
                  display: 'block',
                  margin: '0 auto',
                  background: '#ffffff',
                  opacity: imgLoaded ? 1 : 0,
                  transition: 'opacity 0.15s ease',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: imgW,
                height: imgH,
                background: '#f8fafc',
                borderRadius: '5px',
                border: '1.5px dashed #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <ImageIcon size={15} style={{ color: '#94a3b8' }} />
            </div>
          )}
          <button
            type="button"
            onClick={onEdit}
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#2563eb',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '1px 8px',
              lineHeight: 1.2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(37, 99, 235, 0.05)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2563eb';
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.borderColor = '#1d4ed8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#eff6ff';
              e.currentTarget.style.color = '#2563eb';
              e.currentTarget.style.borderColor = '#bfdbfe';
            }}
            title="Edit Card"
          >
            <span>Edit</span>
          </button>
        </div>
      </td>
    );
  }

  return (
    <td
      key={field.name}
      style={{
        padding: '2px',
        textAlign: 'center',
        width: finalColW,
        minWidth: finalColW,
        maxWidth: finalColW,
        boxSizing: 'border-box',
        height: '68px',
        borderRight: '1px solid #e2e8f0',
        borderBottom: '1px solid #e2e8f0',
        verticalAlign: 'middle',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '3px',
          width: '100%',
          height: '100%',
        }}
      >
        {/* Thumbnail or placeholder box */}
        {isComplete ? (
          <div style={{ position: 'relative', width: '38px', height: '46px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {!imgLoaded && !imgFailed && (
              <div style={{ position: 'absolute', inset: 0, background: '#f1f5f9', borderRadius: '6px' }} />
            )}
            <img
              src={activeSrc}
              alt="Photo"
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                if (!useOriginal && rawSrc && rawSrc !== activeSrc) {
                  setUseOriginal(true);
                } else {
                  setImgFailed(true);
                }
              }}
              style={{
                width: '38px',
                height: '46px',
                objectFit: 'cover',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
                display: 'block',
                background: '#ffffff',
                cursor: 'pointer',
                opacity: imgLoaded ? 1 : 0,
                transition: 'opacity 0.15s ease',
              }}
              title={photoPath}
              onClick={onEdit}
            />
          </div>
        ) : isPending ? (
          <div
            style={{
              width: '38px',
              height: '46px',
              background: '#fffbeb',
              borderRadius: '6px',
              border: '1px solid #fde68a',
              boxShadow: '0 1px 2px rgba(245, 158, 11, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#b45309',
              cursor: 'pointer',
              gap: '1px',
            }}
            title={`Photo pending: ${photoPath || 'No file'}`}
            onClick={onEdit}
          >
            <Clock size={13} style={{ marginBottom: '1px' }} />
            <span style={{ fontSize: '9px', fontWeight: 800, lineHeight: 1 }}>PEND</span>
          </div>
        ) : (
          <div
            style={{
              width: '38px',
              height: '46px',
              background: '#f8fafc',
              borderRadius: '6px',
              border: '1.5px dashed #cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="No photo or path"
            onClick={onEdit}
          >
            <ImageIcon size={16} style={{ color: '#94a3b8' }} />
          </div>
        )}

        {/* Edit button */}
        <button
          type="button"
          onClick={onEdit}
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#2563eb',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '1px 8px',
            lineHeight: 1.2,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 2px rgba(37, 99, 235, 0.05)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2563eb';
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.borderColor = '#1d4ed8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#eff6ff';
            e.currentTarget.style.color = '#2563eb';
            e.currentTarget.style.borderColor = '#bfdbfe';
          }}
          title="Edit Card"
        >
          <span>Edit</span>
        </button>
      </div>
    </td>
  );
});

function splitPhoneNumbers(val) {
  if (!val) return [];
  const s = String(val).trim();
  if (!s) return [];

  // 1. Check for standard delimiters: newline, slash, comma, ampersand, semicolon, pipe
  if (/[\n,/;&|]/.test(s)) {
    const parts = s
      .split(/[\n,/;&|]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return parts;
    }
  }

  // 2. Check for two numbers separated by spaces (e.g. "9876543210 9876543211" or "+91 9876543210 +91 9876543211")
  const spaceMatch = s.match(/^((?:\+?\d{1,3}\s*)?\d{9,11})\s+((?:\+?\d{1,3}\s*)?\d{9,11})$/);
  if (spaceMatch) {
    return [spaceMatch[1].trim(), spaceMatch[2].trim()];
  }

  return [s];
}

function getColumnSpec(fieldName, fieldType) {
  const rawName = String(fieldName || '').trim();
  const name = rawName
    .toLowerCase()
    .replace(/[_.'"()/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const type = String(fieldType || '')
    .toLowerCase()
    .trim();

  // ── Images ──────────────────────────────────────────────────────────────
  if (isImageField(type, rawName)) {
    let imgType = 'photo';
    if (name.includes('sign') || type.includes('sign')) imgType = 'signature';
    else if (name.includes('qr') || type.includes('qr') || name.includes('bar') || type.includes('bar')) imgType = 'qr';

    // photo: portrait with filename & status badge — 100px wide
    // signature: landscape — 72px wide × 28px tall
    // qr: square — 48px × 38px
    const w = imgType === 'signature' ? '72px' : imgType === 'qr' ? '48px' : '58px';
    const minW = imgType === 'signature' ? '64px' : imgType === 'qr' ? '48px' : '58px';
    return { width: w, minWidth: minW, maxWidth: w, align: 'center', isImage: true, isFixed: true, imgType };
  }

  // ── Section / Sec / Div / Division (Compact — tight to header) ───────────
  if (/^section$|^sec$|^div$|^division$/i.test(name)) {
    const isShortSec = /^sec$/i.test(name);
    const w = isShortSec ? '58px' : '76px';
    return { minWidth: w, width: w, maxWidth: isShortSec ? '68px' : '90px', align: 'center', isFixed: true };
  }

  // ── Class / Cls (Sized to fit "CLASS 10", "CLASS 9", "CLASS 12-A" without wrapping) ──
  if (/^class$|^cls$/i.test(name)) {
    return { minWidth: '84px', width: '90px', maxWidth: '110px', align: 'center', isFixed: true };
  }

  // ── Serial / Roll (Sized to fit up to 5-digit roll numbers without wrapping) ───────
  if (/^sr\s*no|^s\s*no|^sl\s*no|^serial|^sno$|^slno$|^roll/.test(name)) {
    return { minWidth: '78px', width: '84px', maxWidth: '100px', align: 'center', isFixed: true };
  }

  // ── Blood Group (Sized to fit header "BLOOD GROUP" and badges on one line) ────────
  if (/blo?o?d\s*gr|blo?o?d\s*gro?u?p|^bg$|^bgroup$|^bld\s*gr/.test(name)) {
    return { minWidth: '86px', width: '92px', maxWidth: '108px', align: 'center', isFixed: true };
  }

  // ── Gender / Age / Short codes ────────────────────────────────────────────
  if (/^gender$|^sex$|^age$|^mode$/.test(name)) {
    return { minWidth: '72px', width: '78px', maxWidth: '90px', align: 'center', isFixed: true };
  }

  // ── Transport / Bus / Route / Stop / House ────────────────────────────────
  if (/transport|bus|route|stop|house/.test(name)) {
    return { minWidth: '95px', align: 'center' };
  }

  // ── Dates (DOB, DOJ, Date of Birth - Sized to fit YYYY-MM-DD on single line) ─────
  if (/d\.?\s*o\.?\s*b\.?|date\s*of\s*birth|birth\s*date|\bdate\b|\bdt\b/.test(name)) {
    return { minWidth: '106px', width: '112px', maxWidth: '128px', align: 'center', isDate: true, isFixed: true };
  }

  // ── Phone / Contact / Mobile / Emergency No ──────────────────────────────
  if (
    /\b(?:mob|mobile|phone|ph|cell|tel|whatsapp|contact|emerg|emergency|eme)\b|mob|phone|contact|emerg|eme.?\s*no/i.test(
      name
    )
  ) {
    return { minWidth: '136px', width: '142px', maxWidth: '165px', align: 'center', isPhone: true, isFixed: true };
  }

  // ── ID Numbers (Aadhar, Scholar No, Reg No, Roll No, UID) ───────────────
  if (/a+dh?a+r|scholar|roll\s*no|admis?si?on|reg\s*no|id\s*card|uid|pan|epic|voter|dl\s*no/.test(name)) {
    return { minWidth: '100px', align: 'center' };
  }

  // ── Names (Full Name, Father Name, Mother Name, Student Name) ────────────
  if (name.includes('name') || name.includes('student') || name.includes('father') || name.includes('mother') || name.includes('guardian')) {
    return { minWidth: '150px', align: 'left', isName: true, weight: 3 };
  }

  // -- Address / Location / Locality (Prioritized as biggest/widest column) ----
  if (/\b(?:address|addr|location|locality|residence)\b|address|addr|residence/i.test(name)) {
    return { minWidth: '260px', align: 'left', isAddress: true, weight: 5 };
  }

  // -- City / State --------------------------------------------------------
  if (/^(?:city|state)$/i.test(name)) {
    return { minWidth: '96px', align: 'left' };
  }

  // -- Remarks / Notes / Email / Designation / Path -------------------------
  if (/email|mail|remark|note|designation|path|company/i.test(name)) {
    return { minWidth: '130px', align: 'left', weight: 2 };
  }


  // ── Default fallback (divides remaining table space dynamically) ─────────
  return { minWidth: '98px', align: 'left', weight: 1 };
}

function getHeaderMinWidth(fieldName, specMinWidth, specWidth) {
  const raw = String(fieldName || '').trim();
  const rawLower = raw.toLowerCase();
  if (/^sec$/i.test(rawLower)) return '58px';
  if (/^class$/i.test(rawLower)) return '84px';
  if (/^section$/i.test(rawLower)) return '76px';

  const baseMin = parseInt(specMinWidth || specWidth || '60', 10);
  const words = raw.split(/[\s_.-]+/);
  const longestWordLen = Math.max(...words.map((w) => w.length), 0);
  // Estimate minimum pixels needed for longest single word + 16px padding
  const longestWordMin = Math.ceil(longestWordLen * 8.8) + 16;
  return `${Math.max(baseMin, longestWordMin)}px`;
}

/* ── Standardized Table Row Action Button Component ── */
function RowActionButton({ variant = 'primary', onClick, title, children }) {
  const configs = {
    danger: {
      bg: 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)',
      border: '#b91c1c',
      hover: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 100%)',
      shadow: 'rgba(239, 68, 68, 0.25)',
    },
    primary: {
      bg: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
      border: '#1d4ed8',
      hover: 'linear-gradient(180deg, #2563eb 0%, #1e40af 100%)',
      shadow: 'rgba(37, 99, 235, 0.25)',
    },
    success: {
      bg: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
      border: '#047857',
      hover: 'linear-gradient(180deg, #059669 0%, #047857 100%)',
      shadow: 'rgba(16, 185, 129, 0.25)',
    },
    warning: {
      bg: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',
      border: '#b45309',
      hover: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)',
      shadow: 'rgba(245, 158, 11, 0.25)',
    },
    cyan: {
      bg: 'linear-gradient(180deg, #06b6d4 0%, #0891b2 100%)',
      border: '#0e7490',
      hover: 'linear-gradient(180deg, #0891b2 0%, #155e75 100%)',
      shadow: 'rgba(6, 182, 212, 0.25)',
    },
  };
  const cfg = configs[variant] || configs.primary;

  // Icon mapping
  let icon = null;
  const label = typeof children === 'string' ? children.trim().toLowerCase() : '';
  if (label === 'verify') icon = <CheckCircle2 size={12} strokeWidth={2.5} />;
  else if (label === 'delete') icon = <Trash2 size={12} strokeWidth={2.2} />;
  else if (label === 'approve') icon = <ThumbsUp size={12} strokeWidth={2.2} />;
  else if (label === 'unverify' || label === 'disapprove' || label === 'retrieve') icon = <RotateCcw size={12} strokeWidth={2.2} />;
  else if (label === 'download') icon = <Download size={12} strokeWidth={2.2} />;
  else if (label === 'reprint') icon = <Printer size={12} strokeWidth={2.2} />;
  else if (label === 'confirm') icon = <CheckCircle2 size={12} strokeWidth={2.5} />;
  else if (label === 'reject') icon = <XCircle size={12} strokeWidth={2.2} />;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: '0 8px',
        fontSize: '12px',
        height: '25px',
        minHeight: '25px',
        border: `1px solid ${cfg.border}`,
        borderRadius: '5px',
        background: cfg.bg,
        color: '#ffffff',
        fontWeight: 600,
        letterSpacing: '0.02em',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        whiteSpace: 'nowrap',
        width: '100%',
        boxSizing: 'border-box',
        boxShadow: `0 1px 2px ${cfg.shadow}`,
        fontFamily: 'var(--font-family)',
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = cfg.hover;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = `0 3px 6px ${cfg.shadow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = cfg.bg;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = `0 1px 2px ${cfg.shadow}`;
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function Spinner({ size = 16 }) {
  return <Loader2 size={size} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />;
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

function normalizeCardStatus(raw) {
  if (!raw) return 'pending';
  const s = String(raw).toLowerCase().trim();
  if (s === 'download' || s === 'downloaded' || s === 'printed' || s === 'print') return 'printed';
  if (s === 'pool' || s === 'deleted' || s === 'trash') return 'deleted';
  if (s === 'request' || s === 'requested') return 'request';
  if (s === 'reprint' || s === 'reprinting') return 'reprint';
  if (s === 'confirm' || s === 'confirmed') return 'confirm';
  if (s === 'verify' || s === 'verified') return 'verified';
  if (s === 'approve' || s === 'approved') return 'approved';
  if (s === 'pend' || s === 'pending') return 'pending';
  return s;
}

export default function IDCardActionsView({
  tableId,
  initialStatus = 'pending',
  onBack,
  onNavigate,
  onStatusChange,
  onTableLoaded,
  scopedOrgId,
  scopedOrgName,
  addToast,
  currentUser,
  userRole = 'super_admin',
}) {
  const role = String(currentUser?.role || userRole || '').toLowerCase();
  const isSuperAdmin = ['super_admin', 'prime_admin'].includes(role) || Boolean(currentUser?.is_superuser);
  const isOperator = ['operator', 'prime_operator'].includes(role) || role.includes('operator');
  const isAdminOrOperator = isSuperAdmin || isOperator;
  const isAssistant = role === 'assistant';
  const isPhotographer = role === 'photographer' || currentUser?.operator_type === 'photographer' || role.includes('photographer');

  const parsedTableId = tableId && tableId !== '??' && !isNaN(Number(tableId)) ? Number(tableId) : null;
  const initialTableMeta = parsedTableId ? swrCache.get(`table_meta_${parsedTableId}`) : null;
  const initialCounts = parsedTableId ? swrCache.get(`table_counts_${parsedTableId}`) : null;

  /* ── Table metadata & state (must be initialized before memoized selectors) ── */
  const [table, setTable] = useState(() => initialTableMeta);
  const [tableLoading, setTableLoading] = useState(() => !initialTableMeta);
  const [tableNotFound, setTableNotFound] = useState(false);
  const [undoLoading, setUndoLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [tableFreezeInfo, setTableFreezeInfo] = useState(null);
  const [filterInitialTab, setFilterInitialTab] = useState('sort');
  const [reprintModalCard, setReprintModalCard] = useState(null);

  const canUsePhotoCollection = useMemo(() => {
    if (isSuperAdmin) return true;
    if (isPhotographer) return false;
    if (currentUser?.permissions?.perm_idcard_photo_collection !== undefined) {
      return Boolean(currentUser.permissions.perm_idcard_photo_collection);
    }
    if (currentUser?.user_permissions?.perm_idcard_photo_collection !== undefined) {
      return Boolean(currentUser.user_permissions.perm_idcard_photo_collection);
    }
    if (currentUser?.perm_idcard_photo_collection !== undefined) {
      return Boolean(currentUser.perm_idcard_photo_collection);
    }
    if (table?.organisation?.perm_idcard_photo_collection !== undefined) {
      return Boolean(table.organisation.perm_idcard_photo_collection);
    }
    return false;
  }, [isSuperAdmin, isPhotographer, currentUser, table]);

  const hasCodeFields = useMemo(() => {
    const fields = table?.fields || [];
    return fields.some((f) => {
      const type = String(f?.type || '').toLowerCase();
      const name = String(f?.name || '').toLowerCase();
      return (
        ['qr_code', 'qrcode', 'qr', 'barcode'].includes(type) ||
        name.includes('barcode') ||
        /\bqr[\s_-]?code?\b/i.test(name)
      );
    });
  }, [table]);
  const [undoConfirmModal, setUndoConfirmModal] = useState({
    isOpen: false,
    type: 'undo',
    pin: '',
  });
  const [undoStatus, setUndoStatus] = useState({
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
    undoTooltip: '',
    redoTooltip: '',
  });

  /* ── Status & status counts ── */
  const [status, setStatus] = useState(() => {
    const norm = normalizeCardStatus(initialStatus);
    if (isAssistant && ['approved', 'printed', 'confirm'].includes(norm)) {
      return 'pending';
    }
    if (isPhotographer && ['approved', 'printed', 'confirm'].includes(norm)) {
      return 'pending';
    }
    return norm;
  });
  const [statusCounts, setStatusCounts] = useState(() => initialCounts || { pending: 0, verified: 0, approved: 0, download: 0, pool: 0 });
  const [page, setPage] = useState(1);

  const prevInitialStatusRef = useRef(normalizeCardStatus(initialStatus));
  useEffect(() => {
    if (initialStatus) {
      const norm = normalizeCardStatus(initialStatus);
      if (norm !== prevInitialStatusRef.current) {
        prevInitialStatusRef.current = norm;
        setStatus(norm);
      }
    }
  }, [initialStatus]);

  const handleStatusTabSwitch = useCallback((newStatus) => {
    const norm = normalizeCardStatus(newStatus);
    setStatus(norm);
    prevInitialStatusRef.current = norm;
    if (tableId && norm) {
      const orgId = table?.organisation_id || table?.client_id || scopedOrgId;
      const targetRoute = orgId
        ? `/organisation/${orgId}/table/${tableId}/${norm}`
        : `/table/${tableId}/${norm}`;
      if (typeof window !== 'undefined' && window.location.pathname !== targetRoute) {
        window.history.replaceState({}, document.title, targetRoute);
      }
    }
    onStatusChange?.(norm);
  }, [tableId, table?.organisation_id, table?.client_id, scopedOrgId, onStatusChange]);

  useEffect(() => {
    if (tableId && status) {
      const norm = normalizeCardStatus(status);
      const orgId = table?.organisation_id || table?.client_id || scopedOrgId;
      const targetRoute = orgId
        ? `/organisation/${orgId}/table/${tableId}/${norm}`
        : `/table/${tableId}/${norm}`;
      if (typeof window !== 'undefined' && window.location.pathname !== targetRoute) {
        window.history.replaceState({}, document.title, targetRoute);
      }
    }
  }, [tableId, status, table?.organisation_id, table?.client_id, scopedOrgId]);

  const prevRoleRef = useRef({ isAssistant, isPhotographer });
  useEffect(() => {
    const roleChanged =
      prevRoleRef.current.isAssistant !== isAssistant ||
      prevRoleRef.current.isPhotographer !== isPhotographer;
    prevRoleRef.current = { isAssistant, isPhotographer };
    if (!roleChanged) return; // Don't re-run just because status changed
    if (isAssistant && ['approved', 'printed', 'confirm'].includes(status)) {
      setStatus('pending');
    }
    if (isPhotographer && ['approved', 'printed', 'confirm'].includes(status)) {
      setStatus('pending');
    }
  }, [isAssistant, isPhotographer, status]);

  const normStatus = normalizeCardStatus(status);
  const isReprintFlow = ['reprint', 'request', 'confirm'].includes(normStatus);

  const visibleStatusList = useMemo(() => {
    if (isReprintFlow) {
      if (isPhotographer) {
        return REPRINT_TABS.filter((s) => s.key === 'request');
      }
      if (normStatus === 'reprint') {
        return REPRINT_STATUS_LIST;
      }
      return REPRINT_TABS;
    }
    if (isAssistant) {
      return ID_CARD_STATUS_LIST.filter((s) => ['pending', 'verified', 'deleted'].includes(s.key));
    }
    if (isPhotographer) {
      return ID_CARD_STATUS_LIST.filter((s) => s.key !== 'approved' && s.key !== 'printed');
    }
    return ID_CARD_STATUS_LIST;
  }, [isAssistant, isPhotographer, isReprintFlow, normStatus]);

  const visibleExtraStatusList = useMemo(() => {
    if (isAssistant) return [];
    if (isReprintFlow) {
      // In reprint flow: add Printed tab option after Confirmed so user can navigate back
      return PRINTED_TAB;
    }
    // In normal flow: only show Requested & Confirmed shortcuts when on Printed list
    if (normStatus === 'printed') {
      if (isPhotographer) {
        return REPRINT_TABS.filter((s) => s.key === 'request');
      }
      return REPRINT_TABS;
    }
    return [];
  }, [isAssistant, isPhotographer, isReprintFlow, normStatus]);

  const initialCardsCache = parsedTableId ? swrCache.get(`cards_${parsedTableId}_${normalizeCardStatus(initialStatus)}`) : null;

  /* ── Cards list state ── */
  const [cards, setCards] = useState(() => initialCardsCache?.cards || []);
  const [cardsLoading, setCardsLoading] = useState(() => !initialCardsCache);
  const [cardsError, setCardsError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => Boolean(initialCardsCache?.hasMore));
  const [logCard, setLogCard] = useState(null);
  const [pageSize] = useState(500);
  const [totalCards, setTotalCards] = useState(() => initialCardsCache?.total || initialCardsCache?.cards?.length || 0);
  const activeReqRef = useRef(0);

  /* ── Filters ── */

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [duplicatesFilter, setDuplicatesFilter] = useState(false);
  const [errorsFilter, setErrorsFilter] = useState(false);
  const [activeCell, setActiveCell] = useState(null); // { cardId, fieldName }
  const [totalDuplicates, setTotalDuplicates] = useState(0);
  const [activeImageSort, setActiveImageSort] = useState(null); // { columns: ['PHOTO'], conditions: ['complete'] }
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [showUploadXlsx, setShowUploadXlsx] = useState(false);
  const [showPrintDataModal, setShowPrintDataModal] = useState(false);
  const [showPrintSelectedModal, setShowPrintSelectedModal] = useState(false);
  const [showDownloadDataModal, setShowDownloadDataModal] = useState(false);

  const [showReuploadImageModal, setShowReuploadImageModal] = useState(false);
  const [showClearPendingPathModal, setShowClearPendingPathModal] = useState(false);
  const [showPhotoCollectionDrawer, setShowPhotoCollectionDrawer] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [showBulkTxModal, setShowBulkTxModal] = useState(false);
  const [focusTxId, setFocusTxId] = useState(null);
  const searchTimerRef = useRef(null);

  /* ── Local Storage Helpers ── */
  const getLocalStorageCards = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(`cf_table_${tableId}_cards`) || '[]');
    } catch {
      return [];
    }
  }, [tableId]);

  const saveLocalStorageCards = useCallback((data) => {
    try {
      localStorage.setItem(`cf_table_${tableId}_cards`, JSON.stringify(data));
    } catch {
      /* ignore storage quota errors */
    }
  }, [tableId]);

  const [sort, setSort] = useState('sr-asc');
  const [filterOptions, setFilterOptions] = useState({ classes: [], sections: [], courses: [], branches: [] });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');


  /* ── Selection state ── */
  const [selectedIds, setSelectedIds] = useState(new Set());

  /* Dispatch footer data count & selection */
  useEffect(() => {
    const selectedCount = selectedIds ? selectedIds.size : 0;
    let selectedText = '';
    if (selectedCount === 1) {
      const selectedId = Array.from(selectedIds)[0];
      const selectedCard = cards.find((c) => String(c.id) === String(selectedId));
      const fd = selectedCard?.field_data || {};
      const cardName =
        fd['FULL NAME'] ||
        fd['Full Name'] ||
        fd['STUDENT NAME'] ||
        fd['Student Name'] ||
        fd['NAME'] ||
        fd['name'] ||
        selectedCard?.name ||
        'Card Record';
      selectedText = `Selected: 1 Card (${cardName})`;
    } else if (selectedCount > 1) {
      selectedText = `Selected: ${selectedCount} Cards`;
    }
    const currentCount = totalCards || (statusCounts && statusCounts[status]) || cards.length;
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: `Total Cards: ${currentCount}`,
          selectedText,
          count: currentCount,
        },
      })
    );
  }, [cards, selectedIds, totalCards, statusCounts, status]);

  /* ── Schema Fields ── */
  const tableFields = useMemo(() => {
    let raw = [];
    if (Array.isArray(table?.fields) && table.fields.length > 0) {
      raw = table.fields;
    } else if (Array.isArray(table?.schema?.fields) && table.schema.fields.length > 0) {
      raw = table.schema.fields;
    } else if (cards.length > 0 && cards[0]?.field_data && Object.keys(cards[0].field_data).length > 0) {
      const sample = cards[0].field_data;
      raw = Object.keys(sample).map((key) => ({
        name: key,
        type: isImageField('text', key) ? 'photo' : 'text',
      }));
    } else {
      raw = [
        { name: 'PHOTO', type: 'photo' },
        { name: 'NAME', type: 'text' },
        { name: 'FATHER NAME', type: 'text' },
        { name: 'MOTHER NAME', type: 'text' },
        { name: 'ADDRESS', type: 'text' },
        { name: 'CONTACT NO.', type: 'text' },
        { name: 'CLASS', type: 'text' },
        { name: 'SECTION', type: 'text' },
      ];
    }
    const sorted = [...raw].sort((a, b) => {
      const aImg = isImageField(a.type, a.name);
      const bImg = isImageField(b.type, b.name);
      if (aImg && !bImg) return -1;
      if (!aImg && bImg) return 1;
      return 0;
    });

    // Expand show_path photo fields with a dedicated PATH column immediately following the photo field
    const result = [];
    for (const f of sorted) {
      result.push(f);
      const isImg = isImageField(f.type, f.name);
      if (isImg && Boolean(f.show_path)) {
        const pathColName = f.name.toUpperCase() === 'PHOTO' ? 'PATH' : `${f.name} PATH`;
        if (!sorted.some((col) => col.name.toUpperCase() === pathColName.toUpperCase())) {
          result.push({
            name: pathColName,
            type: 'text',
            subtype: 'standard',
            isPathColumn: true,
            sourceField: f.name,
          });
        }
      }
    }
    return result;
  }, [table, cards]);

  const classFieldName = useMemo(() => {
    const f = (tableFields || []).find((fld) => {
      const type = String(fld.type || '').toLowerCase();
      const name = String(fld.name || '').toLowerCase();
      return type === 'class' || type === 'designation' || /^(class|standard|std|grade|designation)$/i.test(name);
    });
    return f ? f.name : null;
  }, [tableFields]);

  const sectionFieldName = useMemo(() => {
    const f = (tableFields || []).find((fld) => {
      const type = String(fld.type || '').toLowerCase();
      const name = String(fld.name || '').toLowerCase();
      return type === 'section' || type === 'department' || /^(section|sec|division|div|dept)$/i.test(name);
    });
    return f ? f.name : null;
  }, [tableFields]);

  const getCardClassVal = useCallback((card) => {
    if (!card) return '';
    if (classFieldName) {
      const v = getCardFieldValue(card, classFieldName);
      if (v) return v;
    }
    const fd = card.field_data || {};
    for (const [k, v] of Object.entries(fd)) {
      if (/^(class|standard|std|grade|designation)$/i.test(k)) {
        return v;
      }
    }
    return card.class_name || '';
  }, [classFieldName]);

  const getCardSectionVal = useCallback((card) => {
    if (!card) return '';
    if (sectionFieldName) {
      const v = getCardFieldValue(card, sectionFieldName);
      if (v) return v;
    }
    const fd = card.field_data || {};
    for (const [k, v] of Object.entries(fd)) {
      if (/^(section|sec|div|division|dept|department)$/i.test(k)) {
        return v;
      }
    }
    return '';
  }, [sectionFieldName]);

  /* Dynamic Filter Options computation */
  const classOptions = useMemo(() => {
    const fromApi = (filterOptions.classes || []).map((item) => {
      if (typeof item === 'object' && item !== null) {
        return {
          value: String(item.value || item.name || item.display || '').trim(),
          label: String(item.display || item.label || item.name || item.value || '').trim(),
          count: typeof item.count === 'number' ? item.count : undefined,
        };
      }
      return { value: String(item).trim(), label: String(item).trim() };
    });
    const fromCards = cards
      .map(getCardClassVal)
      .filter(Boolean)
      .map((v) => ({ value: String(v).trim(), label: String(v).trim() }));

    const map = new Map();
    [...fromApi, ...fromCards].forEach((opt) => {
      if (opt.value && !map.has(opt.value)) {
        map.set(opt.value, opt);
      }
    });

    return Array.from(map.values()).sort(compareClasses);
  }, [filterOptions.classes, cards, getCardClassVal]);

  const effectiveTableId = useMemo(() => {
    if (tableId && tableId !== '??' && !isNaN(Number(tableId))) {
      return Number(tableId);
    }
    if (table?.id) return table.id;
    return 1;
  }, [tableId, table?.id]);

  /* ── Sync URL with effectiveTableId and active status ── */
  useEffect(() => {
    if (effectiveTableId && status) {
      const norm = normalizeCardStatus(status);
      const orgId = table?.organisation_id || table?.client_id || scopedOrgId;
      const targetRoute = orgId
        ? `/organisation/${orgId}/table/${effectiveTableId}/${norm}`
        : `/table/${effectiveTableId}/${norm}`;
      if (typeof window !== 'undefined' && window.location.pathname !== targetRoute && (window.location.pathname.includes('/table/') || window.location.pathname.includes('/organisation/'))) {
        window.history.replaceState({}, document.title, targetRoute);
      }
    }
  }, [effectiveTableId, status, table?.organisation_id, table?.client_id, scopedOrgId]);

  /* ── Load Operations Stack & Undo/Redo availability ── */
  const fetchUndoStatus = useCallback(async () => {
    if (!effectiveTableId || !isSuperAdmin) {
      setUndoStatus({
        canUndo: false,
        canRedo: false,
        undoCount: 0,
        redoCount: 0,
        undoTooltip: '',
        redoTooltip: '',
      });
      return;
    }
    try {
      const data = await operationsApi.getStack(effectiveTableId);
      setUndoStatus({
        canUndo: !!data?.can_undo,
        canRedo: !!data?.can_redo,
        undoCount: data?.undo_count ?? (data?.undo_stack?.length || 0),
        redoCount: data?.redo_count ?? (data?.redo_stack?.length || 0),
        undoTooltip: data?.undo_tooltip || (data?.can_undo ? 'Undo last changed images across table (Ctrl+Z)' : 'No images to undo'),
        redoTooltip: data?.redo_tooltip || (data?.can_redo ? 'Redo last changed images across table (Ctrl+Y)' : 'No images to redo'),
      });
    } catch {
      /* non-critical */
    }
  }, [effectiveTableId, isSuperAdmin]);

  /* ── Load Table Metadata ── */
  const loadTable = useCallback(async () => {
    if (!effectiveTableId) return;
    const cached = swrCache.get(`table_meta_${effectiveTableId}`);
    if (cached) {
      setTable(cached);
      onTableLoaded?.(cached);
      setTableLoading(false);
    } else {
      setTableLoading(true);
    }
    setTableNotFound(false);
    try {
      const data = await schemaApi.getTable(effectiveTableId);
      const tbl = data?.table || data;
      setTable(tbl);
      swrCache.set(`table_meta_${effectiveTableId}`, tbl, 10 * 60 * 1000);
      onTableLoaded?.(tbl);
    } catch (err) {
      console.error('Failed to load table metadata:', err);
      if (err?.response?.status === 404 || err?.status === 404) {
        setTableNotFound(true);
      }
    } finally {
      setTableLoading(false);
    }
  }, [effectiveTableId, onTableLoaded]);

  /* ── Load Status Counts ── */
  const loadStatusCounts = useCallback(async () => {
    if (!effectiveTableId || tableNotFound) return;
    const cached = swrCache.get(`table_counts_${effectiveTableId}`);
    if (cached) {
      setStatusCounts(cached);
    }
    try {
      const data = await cardApi.getStatusCounts(effectiveTableId);
      const c = data?.counts || data?.status_counts || data || {};
      const printedCount = (c.printed ?? c.printed_count) || (c.download ?? c.download_count) || 0;
      const deletedCount = (c.deleted ?? c.deleted_count) || (c.pool ?? c.pool_count ?? c.pool_list) || 0;
      const requestCount = (c.request ?? c.reprint_request ?? c.requested) || 0;
      const formatted = {
        pending: c.pending ?? c.pending_count ?? 0,
        verified: c.verified ?? c.verified_count ?? 0,
        approved: c.approved ?? c.approved_count ?? 0,
        printed: printedCount,
        deleted: deletedCount,
        reprint: c.reprint ?? c.reprint_count ?? c.reprinting ?? 0,
        request: requestCount,
        confirm: c.confirm ?? c.reprint_confirmed ?? c.confirmed ?? 0,
      };
      setStatusCounts(formatted);
      swrCache.set(`table_counts_${effectiveTableId}`, formatted, 2 * 60 * 1000);
    } catch (err) {
      console.warn('Failed to load status counts:', err);
    }
  }, [effectiveTableId, tableNotFound]);

  /* ── Load Filter Options ── */
  const loadFilterOptions = useCallback(async () => {
    if (!effectiveTableId || tableNotFound) return;
    try {
      const res = await apiClient.get(`/api/table/${effectiveTableId}/filter-options/`);
      const d = res.data;
      setFilterOptions({
        classes: d?.classes || d?.class_values || [],
        sections: d?.sections || d?.section_values || [],
        courses: d?.courses || d?.course_values || [],
        branches: d?.branches || d?.branch_values || [],
        classToSections: d?.class_to_sections || {},
        sectionToClasses: d?.section_to_classes || {},
        classSectionCounts: d?.class_section_counts || {},
        sectionClassCounts: d?.section_class_counts || {},
        courseToBranches: d?.course_to_branches || {},
        branchToCourses: d?.branch_to_courses || {},
        courseBranchCounts: d?.course_branch_counts || {},
        branchCourseCounts: d?.branch_course_counts || {},
      });
    } catch {
      /* non-critical */
    }
  }, [effectiveTableId, tableNotFound]);

  /* ── Load Cards List ── */
  const loadCards = useCallback(async () => {
    if (!effectiveTableId || tableNotFound) return;
    const reqId = ++activeReqRef.current;

    const isDefaultQuery =
      !debouncedSearch &&
      !classFilter &&
      !sectionFilter &&
      !courseFilter &&
      !branchFilter &&
      !duplicatesFilter &&
      !fromDate &&
      !toDate &&
      !activeImageSort;

    const cacheKey = `cards_${effectiveTableId}_${status}`;
    if (isDefaultQuery) {
      const cached = swrCache.get(cacheKey);
      if (cached && cached.cards) {
        setCards(cached.cards);
        setTotalCards(cached.total ?? cached.cards.length);
        setHasMore(Boolean(cached.hasMore));
        setCardsLoading(false);
      } else {
        setCardsLoading(true);
      }
    } else {
      setCardsLoading(true);
    }

    setCardsError(null);
    setSelectedIds(new Set());
    try {
      const params = {
        status,
        offset: 0,
        limit: pageSize,
        sort,
        search: debouncedSearch || undefined,
        class: classFilter || undefined,
        section: sectionFilter || undefined,
        course: courseFilter || undefined,
        branch: branchFilter || undefined,
        duplicates: duplicatesFilter ? 'true' : undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      };
      Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);

      const data = await cardApi.getCards(effectiveTableId, params);
      if (reqId !== activeReqRef.current) return;

      const list = data?.cards || data?.results || (Array.isArray(data) ? data : []);
      const total = data?.total_count ?? data?.total ?? list.length;
      const more = Boolean(data?.has_more || list.length < total);

      setCards(list);
      setTotalCards(total);
      setHasMore(more);
      setCardsError(null);
      if (data?.total_duplicates !== undefined) {
        setTotalDuplicates(data.total_duplicates);
      }
      if (data?.freeze_info !== undefined) {
        setTableFreezeInfo(data.freeze_info);
      }

      if (isDefaultQuery) {
        swrCache.set(cacheKey, { cards: list, total, hasMore: more }, 2 * 60 * 1000);
      }
    } catch (err) {
      if (reqId !== activeReqRef.current) return;
      console.warn('loadCards error:', err);
      setCards([]);
      setTotalCards(0);
      setHasMore(false);
      setCardsError(err?.response?.data?.message || err?.message || 'Failed to load cards from server.');
    } finally {
      if (reqId === activeReqRef.current) {
        setCardsLoading(false);
      }
    }
  }, [
    effectiveTableId,
    status,
    pageSize,
    debouncedSearch,
    classFilter,
    sectionFilter,
    courseFilter,
    branchFilter,
    duplicatesFilter,
    sort,
    fromDate,
    toDate,
    tableNotFound,
    activeImageSort,
  ]);

  /* ── Reprint Flow Handlers ── */
  const handleDirectReprint = async () => {
    if (!reprintModalCard || actionLoading) return;
    setActionLoading(true);
    try {
      const card = reprintModalCard;
      const cardName = card.field_data?.NAME || card.field_data?.name || card.name || `Card #${card.id}`;
      const res = await reprintApi.requestReprint(effectiveTableId, {
        card_ids: [card.id],
        reason: 'Reprint request',
      });
      if (res?.status === 'ok' || res?.success) {
        addToast?.(`Reprint request submitted for "${cardName}"`, 'success');
        setReprintModalCard(null);
        await Promise.all([loadCards(), loadStatusCounts()]);
      } else {
        addToast?.(res?.message || 'Failed to submit reprint request', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || 'Error submitting reprint request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmSingleReprint = async (card) => {
    if (!card || actionLoading) return;
    setActionLoading(true);
    try {
      const cardName = card.field_data?.NAME || card.field_data?.name || card.name || `Card #${card.id}`;
      const rrId = card.reprint_request_id || card.id;
      const res = await reprintApi.confirmReprint(effectiveTableId, [rrId]);
      if (res?.status === 'ok' || res?.success) {
        addToast?.(`Reprint confirmed for "${cardName}"`, 'success');
        await Promise.all([loadCards(), loadStatusCounts()]);
      } else {
        addToast?.(res?.message || 'Failed to confirm reprint', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || 'Error confirming reprint', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSingleReprint = async (card) => {
    if (!card || actionLoading) return;
    setActionLoading(true);
    try {
      const cardName = card.field_data?.NAME || card.field_data?.name || card.name || `Card #${card.id}`;
      const rrId = card.reprint_request_id || card.id;
      const res = await reprintApi.rejectReprint(effectiveTableId, [rrId], 'Rejected by staff');
      if (res?.status === 'ok' || res?.success) {
        addToast?.(`Reprint request rejected for "${cardName}"`, 'success');
        await Promise.all([loadCards(), loadStatusCounts()]);
      } else {
        addToast?.(res?.message || 'Failed to reject reprint', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || 'Error rejecting reprint', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkReprintRequest = async () => {
    const sel = [...selectedIds];
    if (!sel.length || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await reprintApi.requestReprint(effectiveTableId, {
        card_ids: sel,
        reason: 'Bulk reprint request',
      });
      if (res?.status === 'ok' || res?.success) {
        addToast?.(`${sel.length} card(s) submitted for reprint`, 'success');
        setSelectedIds(new Set());
        await Promise.all([loadCards(), loadStatusCounts()]);
      } else {
        addToast?.(res?.message || 'Failed to submit reprint requests', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || 'Error submitting reprint requests', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkConfirmReprint = async () => {
    const sel = [...selectedIds];
    if (!sel.length || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await reprintApi.confirmReprint(effectiveTableId, sel);
      if (res?.status === 'ok' || res?.success) {
        addToast?.(`${sel.length} reprint request(s) confirmed successfully`, 'success');
        setSelectedIds(new Set());
        await Promise.all([loadCards(), loadStatusCounts()]);
      } else {
        addToast?.(res?.message || 'Failed to confirm selected reprints', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || 'Error confirming selected reprints', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkRejectReprint = async () => {
    const sel = [...selectedIds];
    if (!sel.length || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await reprintApi.rejectReprint(effectiveTableId, sel, 'Bulk rejection');
      if (res?.status === 'ok' || res?.success) {
        addToast?.(`${sel.length} reprint request(s) rejected back to Reprinting`, 'success');
        setSelectedIds(new Set());
        await Promise.all([loadCards(), loadStatusCounts()]);
      } else {
        addToast?.(res?.message || 'Failed to reject selected reprints', 'error');
      }
    } catch (err) {
      addToast?.(err?.response?.data?.message || 'Error rejecting selected reprints', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /* ── Direct Unfreeze Handler ── */
  const handleUnfreezeTableDirect = async () => {
    if (!effectiveTableId) return;
    try {
      const res = await fetch(`/api/table/${effectiveTableId}/unfreeze-table/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        addToast?.(`Table (${status === 'approved' ? 'Approved' : 'Printed'}) unfrozen. New cards are now visible.`, 'success');
        setTableFreezeInfo(data.data || null);
        loadCards();
      } else {
        addToast?.(data.message || 'Failed to unfreeze table', 'error');
      }
    } catch (err) {
      console.error('Error unfreezing table:', err);
      addToast?.('Failed to unfreeze table', 'error');
    }
  };

  /* ── Generate QR / Barcodes ── */
  const handleGenerateCodes = async () => {
    if (!effectiveTableId || generatingCodes) return;
    setGeneratingCodes(true);
    try {
      const payload = {};
      const selArr = selectedIds ? [...selectedIds] : [];
      if (selArr.length > 0) {
        payload.card_ids = selArr;
      }
      const res = await schemaApi.generateCodes(effectiveTableId, payload);
      if (res?.success) {
        addToast?.(res.message || 'Successfully generated codes!', 'success');
        loadCards();
      } else {
        addToast?.(res?.message || 'Failed to generate codes', 'error');
      }
    } catch (err) {
      console.error('Generate codes error:', err);
      addToast?.(err?.response?.data?.message || err?.message || 'Error generating codes', 'error');
    } finally {
      setGeneratingCodes(false);
    }
  };

  /* ── Load More Cards (Infinite Scroll) ── */
  const loadMoreCards = useCallback(async () => {
    if (!effectiveTableId || cardsLoading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params = {
        status,
        offset: cards.length,
        limit: pageSize,
        sort,
        search: debouncedSearch || undefined,
        class: classFilter || undefined,
        section: sectionFilter || undefined,
        course: courseFilter || undefined,
        branch: branchFilter || undefined,
        duplicates: duplicatesFilter ? 'true' : undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      };
      Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);

      const data = await cardApi.getCards(effectiveTableId, params);
      const list = data?.cards || data?.results || (Array.isArray(data) ? data : []);
      const total = data?.total_count ?? data?.total ?? totalCards;

      setCards((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const uniqueNew = list.filter((c) => !existingIds.has(c.id));
        const combined = [...prev, ...uniqueNew];
        setHasMore(Boolean(data?.has_more || combined.length < total));
        return combined;
      });
      setTotalCards(total);
    } catch (err) {
      console.warn('loadMoreCards error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [
    effectiveTableId,
    status,
    cards.length,
    pageSize,
    debouncedSearch,
    classFilter,
    sectionFilter,
    courseFilter,
    branchFilter,
    duplicatesFilter,
    sort,
    fromDate,
    toDate,
    cardsLoading,
    loadingMore,
    hasMore,
    totalCards,
  ]);

  /* ── Execute Undo Operation ── */
  const executeUndo = useCallback(async () => {
    if (!effectiveTableId || undoLoading || !isSuperAdmin) return;
    setUndoLoading(true);
    try {
      const res = await operationsApi.undo({ table_id: effectiveTableId });
      if (res && res.success) {
        addToast?.(res.message || 'Image operation undone successfully.', 'success');
        await Promise.all([loadCards(), loadStatusCounts(), fetchUndoStatus()]);
      } else {
        addToast?.(res?.message || 'Could not undo operation.', 'warning');
        fetchUndoStatus();
      }
    } catch (err) {
      addToast?.(err.response?.data?.message || 'Failed to undo operation.', 'error');
    } finally {
      setUndoLoading(false);
    }
  }, [effectiveTableId, undoLoading, isSuperAdmin, addToast, loadCards, loadStatusCounts, fetchUndoStatus]);

  /* ── Execute Redo Operation ── */
  const executeRedo = useCallback(async () => {
    if (!effectiveTableId || undoLoading || !isSuperAdmin) return;
    setUndoLoading(true);
    try {
      const res = await operationsApi.redo({ table_id: effectiveTableId });
      if (res && res.success) {
        addToast?.(res.message || 'Image operation redone successfully.', 'success');
        await Promise.all([loadCards(), loadStatusCounts(), fetchUndoStatus()]);
      } else {
        addToast?.(res?.message || 'Could not redo operation.', 'warning');
        fetchUndoStatus();
      }
    } catch (err) {
      addToast?.(err.response?.data?.message || 'Failed to redo operation.', 'error');
    } finally {
      setUndoLoading(false);
    }
  }, [effectiveTableId, undoLoading, isSuperAdmin, addToast, loadCards, loadStatusCounts, fetchUndoStatus]);

  const promptUndo = useCallback(() => {
    if (!isSuperAdmin) {
      addToast?.('Only Super Admin can undo operations.', 'error');
      return;
    }
    if (!undoStatus.canUndo || undoLoading) return;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setUndoConfirmModal({
      isOpen: true,
      type: 'undo',
      pin,
    });
  }, [isSuperAdmin, undoStatus.canUndo, undoLoading, addToast]);

  const promptRedo = useCallback(() => {
    if (!isSuperAdmin) {
      addToast?.('Only Super Admin can redo operations.', 'error');
      return;
    }
    if (!undoStatus.canRedo || undoLoading) return;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setUndoConfirmModal({
      isOpen: true,
      type: 'redo',
      pin,
    });
  }, [isSuperAdmin, undoStatus.canRedo, undoLoading, addToast]);

  /* ── Listen for Undo/Redo triggers from Footer and emit state ── */
  useEffect(() => {
    const onTriggerUndo = () => promptUndo();
    const onTriggerRedo = () => promptRedo();
    window.addEventListener('cardflow:trigger-undo', onTriggerUndo);
    window.addEventListener('cardflow:trigger-redo', onTriggerRedo);
    return () => {
      window.removeEventListener('cardflow:trigger-undo', onTriggerUndo);
      window.removeEventListener('cardflow:trigger-redo', onTriggerRedo);
    };
  }, [promptUndo, promptRedo]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('cardflow:undo-redo-state', {
        detail: {
          canUndo: undoStatus.canUndo,
          canRedo: undoStatus.canRedo,
          undoCount: undoStatus.undoCount,
          redoCount: undoStatus.redoCount,
          undoLoading,
        },
      })
    );
  }, [undoStatus, undoLoading]);

  const sectionOptions = useMemo(() => {
    const fromApi = (filterOptions.sections || []).map((item) => {
      if (typeof item === 'object' && item !== null) {
        return {
          value: String(item.value || item.name || item.display || '').trim(),
          label: String(item.display || item.label || item.name || item.value || '').trim(),
          count: typeof item.count === 'number' ? item.count : undefined,
        };
      }
      return { value: String(item).trim(), label: String(item).trim() };
    });
    const fromCards = cards
      .map(getCardSectionVal)
      .filter(Boolean)
      .map((v) => ({ value: String(v).trim(), label: String(v).trim() }));

    const map = new Map();
    [...fromApi, ...fromCards].forEach((opt) => {
      if (opt.value && !map.has(opt.value)) {
        map.set(opt.value, opt);
      }
    });

    return Array.from(map.values());
  }, [filterOptions.sections, cards, getCardSectionVal]);

  const courseOptions = useMemo(() => {
    const fromApi = (filterOptions.courses || []).map((item) => {
      if (typeof item === 'object' && item !== null) {
        return {
          value: String(item.value || item.name || item.display || '').trim(),
          label: String(item.display || item.label || item.name || item.value || '').trim(),
          count: typeof item.count === 'number' ? item.count : undefined,
        };
      }
      return { value: String(item).trim(), label: String(item).trim() };
    });
    const fromCards = cards
      .map((c) => c.field_data?.COURSE || c.field_data?.Course || c.field_data?.['course'])
      .filter(Boolean)
      .map((v) => ({ value: String(v).trim(), label: String(v).trim() }));

    const map = new Map();
    [...fromApi, ...fromCards].forEach((opt) => {
      if (opt.value && !map.has(opt.value)) {
        map.set(opt.value, opt);
      }
    });
    return Array.from(map.values());
  }, [filterOptions.courses, cards]);

  const branchOptions = useMemo(() => {
    const fromApi = (filterOptions.branches || []).map((item) => {
      if (typeof item === 'object' && item !== null) {
        return {
          value: String(item.value || item.name || item.display || '').trim(),
          label: String(item.display || item.label || item.name || item.value || '').trim(),
          count: typeof item.count === 'number' ? item.count : undefined,
        };
      }
      return { value: String(item).trim(), label: String(item).trim() };
    });
    const fromCards = cards
      .map((c) => c.field_data?.BRANCH || c.field_data?.Branch || c.field_data?.['branch'])
      .filter(Boolean)
      .map((v) => ({ value: String(v).trim(), label: String(v).trim() }));

    const map = new Map();
    [...fromApi, ...fromCards].forEach((opt) => {
      if (opt.value && !map.has(opt.value)) {
        map.set(opt.value, opt);
      }
    });
    return Array.from(map.values());
  }, [filterOptions.branches, cards]);

  const localCrossCounts = useMemo(() => {
    const csCounts = {};
    const scCounts = {};
    (cards || []).forEach((c) => {
      const cls = getCardClassVal(c);
      const sec = getCardSectionVal(c);
      if (cls && sec) {
        const cKey = String(cls).trim();
        const sKey = String(sec).trim().toUpperCase();
        if (!csCounts[cKey]) csCounts[cKey] = {};
        csCounts[cKey][sKey] = (csCounts[cKey][sKey] || 0) + 1;
        if (!scCounts[sKey]) scCounts[sKey] = {};
        scCounts[sKey][cKey] = (scCounts[sKey][cKey] || 0) + 1;
      }
    });
    return { csCounts, scCounts };
  }, [cards, getCardClassVal, getCardSectionVal]);

  const effectiveClassSectionCounts = useMemo(() => {
    const apiCounts = filterOptions.classSectionCounts || {};
    if (Object.keys(apiCounts).length > 0) return apiCounts;
    return localCrossCounts.csCounts;
  }, [filterOptions.classSectionCounts, localCrossCounts.csCounts]);

  const effectiveSectionClassCounts = useMemo(() => {
    const apiCounts = filterOptions.sectionClassCounts || {};
    if (Object.keys(apiCounts).length > 0) return apiCounts;
    return localCrossCounts.scCounts;
  }, [filterOptions.sectionClassCounts, localCrossCounts.scCounts]);

  const classCounts = useMemo(() => {
    const counts = {};
    cards.forEach((c) => {
      const v = getCardClassVal(c);
      if (v) {
        const k = String(v).trim();
        counts[k] = (counts[k] || 0) + 1;
      }
    });
    return counts;
  }, [cards, getCardClassVal]);

  const sectionCounts = useMemo(() => {
    const counts = {};
    cards.forEach((c) => {
      const v = getCardSectionVal(c);
      if (v) {
        const k = String(v).trim();
        counts[k] = (counts[k] || 0) + 1;
      }
    });
    return counts;
  }, [cards, getCardSectionVal]);

  const courseCounts = useMemo(() => {
    const counts = {};
    cards.forEach((c) => {
      const v = c.field_data?.COURSE || c.field_data?.Course || c.field_data?.['course'];
      if (v) {
        const k = String(v).trim();
        counts[k] = (counts[k] || 0) + 1;
      }
    });
    return counts;
  }, [cards]);

  const branchCounts = useMemo(() => {
    const counts = {};
    cards.forEach((c) => {
      const v = c.field_data?.BRANCH || c.field_data?.Branch || c.field_data?.['branch'];
      if (v) {
        const k = String(v).trim();
        counts[k] = (counts[k] || 0) + 1;
      }
    });
    return counts;
  }, [cards]);

  const classOptionsWithCounts = useMemo(() => {
    return classOptions.map((opt) => ({
      ...opt,
      count: typeof opt.count === 'number' ? opt.count : (classCounts[opt.value] ?? 0),
    }));
  }, [classOptions, classCounts]);

  const sectionOptionsWithCounts = useMemo(() => {
    return sectionOptions.map((opt) => ({
      ...opt,
      count: typeof opt.count === 'number' ? opt.count : (sectionCounts[opt.value] ?? 0),
    }));
  }, [sectionOptions, sectionCounts]);

  const courseOptionsWithCounts = useMemo(() => {
    return courseOptions.map((opt) => ({
      ...opt,
      count: typeof opt.count === 'number' ? opt.count : (courseCounts[opt.value] ?? 0),
    }));
  }, [courseOptions, courseCounts]);

  const branchOptionsWithCounts = useMemo(() => {
    return branchOptions.map((opt) => ({
      ...opt,
      count: typeof opt.count === 'number' ? opt.count : (branchCounts[opt.value] ?? 0),
    }));
  }, [branchOptions, branchCounts]);

  const isCollege = useMemo(() => {
    if (table?.table_type === 'college_student' || table?.table_type === 'college') return true;
    if (table?.organisation?.org_type === 'college' || table?.org_type === 'college') return true;
    if (courseOptions.length > 0 || branchOptions.length > 0) return true;
    if (filterOptions.courses?.length > 0 || filterOptions.branches?.length > 0) return true;
    if (filterOptions.courseField || filterOptions.branchField) return true;
    const name = String(table?.name || '').toLowerCase();
    return /\b(college|university|institute|polytechnic|degree|btech|mtech|bca|mca|mba|semester|sem|branch)\b/.test(name);
  }, [table, courseOptions.length, branchOptions.length, filterOptions]);

  const selectedClasses = useMemo(() => {
    return classFilter ? classFilter.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }, [classFilter]);

  const selectedSections = useMemo(() => {
    return sectionFilter ? sectionFilter.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }, [sectionFilter]);

  const selectedCourses = useMemo(() => {
    return courseFilter ? courseFilter.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }, [courseFilter]);

  const selectedBranches = useMemo(() => {
    return branchFilter ? branchFilter.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }, [branchFilter]);

  const handleClassesChange = useCallback((newClasses) => {
    setClassFilter(Array.isArray(newClasses) ? newClasses.join(',') : '');
    setPage(1);
  }, []);

  const handleSectionsChange = useCallback((newSections) => {
    setSectionFilter(Array.isArray(newSections) ? newSections.join(',') : '');
    setPage(1);
  }, []);

  const handleCoursesChange = useCallback((newCourses) => {
    setCourseFilter(Array.isArray(newCourses) ? newCourses.join(',') : '');
    setPage(1);
  }, []);

  const handleBranchesChange = useCallback((newBranches) => {
    setBranchFilter(Array.isArray(newBranches) ? newBranches.join(',') : '');
    setPage(1);
  }, []);

  const handleResetAllFilters = useCallback(() => {
    setSort('sr-asc');
    setClassFilter('');
    setSectionFilter('');
    setCourseFilter('');
    setBranchFilter('');
    setActiveImageSort(null);
    setDuplicatesFilter(false);
    setErrorsFilter(false);
    setFromDate('');
    setToDate('');
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (sort && sort !== 'sr-asc') count += 1;
    if (classFilter) count += classFilter.split(',').filter(Boolean).length;
    if (sectionFilter) count += sectionFilter.split(',').filter(Boolean).length;
    if (courseFilter) count += courseFilter.split(',').filter(Boolean).length;
    if (branchFilter) count += branchFilter.split(',').filter(Boolean).length;
    if (activeImageSort && activeImageSort.conditions?.length) count += 1;
    if ((status === 'printed' || status === 'download') && (fromDate || toDate)) count += 1;
    if (status === 'approved' && tableFreezeInfo?.is_frozen) count += 1;
    return count;
  }, [sort, classFilter, sectionFilter, courseFilter, branchFilter, activeImageSort, fromDate, toDate, tableFreezeInfo?.is_frozen, status]);


  /* ── Effects ── */
  useEffect(() => {
    loadTable();
  }, [loadTable]);
  useEffect(() => {
    loadStatusCounts();
  }, [loadStatusCounts]);
  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);
  useEffect(() => {
    loadCards();
  }, [loadCards]);
  useEffect(() => {
    fetchUndoStatus();
  }, [fetchUndoStatus]);

  /* Keyboard Shortcuts: Escape, Ctrl+A, Ctrl+Z (Undo), Ctrl+Y (Redo), N, T, B */
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isTyping =
        activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

      if (e.key === 'Escape') {
        setDrawer(null);
        setShowUploadXlsx(false);
        setShowPrintDataModal(false);
        setShowPrintSelectedModal(false);
        setShowDownloadDataModal(false);
        setShowFilterModal(false);
        setShowHistoryModal(false);
      }


      if (isTyping) return;

      // Undo: Ctrl+Z / Cmd+Z (without Shift)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        promptUndo();
      }

      // Redo: Ctrl+Y / Cmd+Y OR Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
      ) {
        e.preventDefault();
        promptRedo();
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        if (cards.length > 0) {
          setSelectedIds(new Set(cards.map((c) => c.id)));
        }
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setDrawer({ mode: 'add', card: null });
      }

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        const container = document.querySelector('.table-container.idcard-table');
        if (container) container.scrollTop = 0;
      }

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        const container = document.querySelector('.table-container.idcard-table');
        if (container) container.scrollTop = container.scrollHeight;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cards, undoStatus.canUndo, undoStatus.canRedo, promptUndo, promptRedo]);


  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    searchTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [search]);

  const lastSelectedCardIdRef = useRef(null);
  const filteredCardsRef = useRef([]);
  const isShiftPressedRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Shift') isShiftPressedRef.current = true;
    };
    const onKeyUp = (e) => {
      if (e.key === 'Shift') isShiftPressedRef.current = false;
    };
    const onBlur = () => {
      isShiftPressedRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    lastSelectedCardIdRef.current = null;
  }, [status]);

  /* ── Selection Helpers ── */
  const allSelected = cards.length > 0 && cards.every((c) => selectedIds.has(c.id));
  const someSelected = cards.some((c) => selectedIds.has(c.id)) && !allSelected;

  const toggleSelectAll = () => {
    lastSelectedCardIdRef.current = null;
    const list = filteredCardsRef.current.length > 0 ? filteredCardsRef.current : cards;
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.map((c) => c.id)));
    }
  };

  const toggleSelect = (id, targetIdx, event) => {
    const isShift = Boolean(event?.shiftKey || event?.nativeEvent?.shiftKey || isShiftPressedRef.current);
    const list = filteredCardsRef.current.length > 0 ? filteredCardsRef.current : cards;

    if (isShift && lastSelectedCardIdRef.current != null) {
      try {
        window.getSelection()?.removeAllRanges();
      } catch (_) {}

      const anchorIdx = list.findIndex((c) => c.id === lastSelectedCardIdRef.current);
      const clickedIdx =
        typeof targetIdx === 'number' && targetIdx >= 0 && list[targetIdx]?.id === id
          ? targetIdx
          : list.findIndex((c) => c.id === id);

      if (anchorIdx !== -1 && clickedIdx !== -1) {
        const start = Math.min(anchorIdx, clickedIdx);
        const end = Math.max(anchorIdx, clickedIdx);

        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            if (list[i]) {
              next.add(list[i].id);
            }
          }
          return next;
        });
        lastSelectedCardIdRef.current = id;
        return;
      }
    }

    // Normal single-card toggle
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastSelectedCardIdRef.current = id;
  };

  /* ── Status Actions with Confirmation Modal ── */
  const [cardStatusModalConfig, setCardStatusModalConfig] = useState(null);

  const getStatusDisplayLabel = (st) => {
    const norm = String(st || '').toLowerCase();
    if (norm === 'download' || norm === 'downloaded') return 'Printed';
    const found = ID_CARD_STATUS_LIST.find((s) => s.key === norm) ||
      REPRINT_STATUS_LIST.find((s) => s.key === norm);
    return found?.label || (st ? st.charAt(0).toUpperCase() + st.slice(1) : 'Status');
  };

  const getCardDisplayName = (c) => {
    if (!c) return 'Card';
    const fd = c.field_data || {};
    return (
      fd.NAME ||
      fd.Name ||
      fd['STUDENT NAME'] ||
      fd.Student_Name ||
      c.name ||
      `Card #${c.id}`
    );
  };

  const getCardDisplayPhoto = (c) => {
    if (!c) return '';
    const fd = c.field_data || {};
    const photoKey = Object.keys(fd).find(
      (k) => k.toUpperCase() === 'PHOTO' || k.toLowerCase().includes('image') || k.toLowerCase().includes('pic')
    );
    const rawVal = photoKey ? fd[photoKey] : fd.PHOTO || c.photo_url || '';
    return getImgSrc(rawVal);
  };

  const getActionModalConfig = (newStatus, countOrCardName, isSingle = false, extraData = {}) => {
    const isPool = newStatus === 'pool' || newStatus === 'deleted' || newStatus === 'trash';
    const randomCode = isPool ? String(Math.floor(1000 + Math.random() * 9000)) : '';
    const countNumber = isSingle ? 1 : (extraData.count || (typeof countOrCardName === 'number' ? countOrCardName : 1));

    const transitionInfo = {
      fromStatus: status,
      toStatus: newStatus,
      count: countNumber,
      isSingle,
      cardName: isSingle ? String(countOrCardName) : '',
      card: extraData.card
        ? {
            id: extraData.card.id,
            name: getCardDisplayName(extraData.card),
            roll:
              extraData.card.field_data?.['ROLL NO'] ||
              extraData.card.field_data?.Roll_No ||
              extraData.card.field_data?.roll ||
              '',
            cls: extraData.card.field_data?.CLASS || extraData.card.field_data?.Class || '',
            sec: extraData.card.field_data?.SECTION || extraData.card.field_data?.Section || '',
            photo: getCardDisplayPhoto(extraData.card),
          }
        : null,
      sampleCards: (extraData.selectedCards || []).slice(0, 5).map((c) => ({
        id: c.id,
        name: getCardDisplayName(c),
      })),
      tableName: table?.name || '',
    };
    if (isPool) {
      return {
        title: isSingle ? 'Delete ID Card' : 'Delete Selected Cards',
        headline: isSingle ? `Delete Card "${countOrCardName}"` : `Delete ${countOrCardName} Selected Card(s)`,
        itemDescription: isSingle ? `card "${countOrCardName}"` : `${countOrCardName} selected card(s)`,
        requiresCode: true,
        deleteCode: randomCode,
        confirmText: isSingle ? 'Delete Card' : `Delete ${countNumber} Cards`,
        confirmVariant: 'danger',
        icon: <Trash2 size={24} style={{ color: '#ef4444' }} />,
        customMessage: isSingle
          ? `Are you sure you want to delete card "${countOrCardName}" and move it to the Deleted Pool? Please enter the verification PIN below to confirm.`
          : `Are you sure you want to permanently delete ${countOrCardName} selected card(s) and move them to the Deleted Pool? Please enter the verification PIN below to confirm.`,
        note: 'Note: Deleted cards will be moved to the Deleted List / Pool.',
        transitionInfo,
      };
    }

    if (newStatus === 'verified') {
      const isDisapprove = status === 'approved';
      return {
        title: isDisapprove
          ? (isSingle ? 'Disapprove ID Card' : 'Disapprove Selected Cards')
          : (isSingle ? 'Verify ID Card' : 'Verify Selected Cards'),
        headline: isDisapprove
          ? (isSingle ? `Disapprove Card "${countOrCardName}"` : `Disapprove ${countOrCardName} Selected Card(s)`)
          : (isSingle ? `Verify Card "${countOrCardName}"` : `Verify ${countOrCardName} Selected Card(s)`),
        itemDescription: isSingle ? `card "${countOrCardName}"` : `${countOrCardName} selected card(s)`,
        requiresCode: false,
        confirmText: isDisapprove
          ? (isSingle ? 'Disapprove' : `Disapprove ${countNumber} Cards`)
          : (isSingle ? 'Verify Card' : `Verify ${countNumber} Cards`),
        confirmVariant: isDisapprove ? 'danger' : 'success',
        icon: isDisapprove ? <XCircle size={24} style={{ color: '#ef4444' }} /> : <CheckCircle2 size={24} style={{ color: '#10b981' }} />,
        customMessage: isDisapprove
          ? (isSingle
              ? `Are you sure you want to disapprove card "${countOrCardName}" and move it back to the "Verified" list?`
              : `Are you sure you want to disapprove ${countOrCardName} selected card(s) and move them back to the "Verified" list?`)
          : (isSingle
              ? `Are you sure you want to verify card "${countOrCardName}" and advance it to the "Verified" list?`
              : `Are you sure you want to verify ${countOrCardName} selected card(s) and advance them to the "Verified" list?`),
        note: isDisapprove ? 'Cards will return to Verified status for review.' : 'Cards will be moved immediately and available in the Verified list.',
        transitionInfo,
      };
    }

    if (newStatus === 'approved') {
      const isRetrieve = status === 'printed' || status === 'download';
      return {
        title: isRetrieve
          ? (isSingle ? 'Retrieve ID Card to Approved' : 'Retrieve Selected Cards to Approved')
          : (isSingle ? 'Approve ID Card' : 'Approve Selected Cards'),
        headline: isRetrieve
          ? (isSingle ? `Retrieve Card "${countOrCardName}"` : `Retrieve ${countOrCardName} Selected Card(s)`)
          : (isSingle ? `Approve Card "${countOrCardName}"` : `Approve ${countOrCardName} Selected Card(s)`),
        itemDescription: isSingle ? `card "${countOrCardName}"` : `${countOrCardName} selected card(s)`,
        requiresCode: false,
        confirmText: isRetrieve
          ? (isSingle ? 'Retrieve' : `Retrieve ${countNumber} Cards`)
          : (isSingle ? 'Approve Card' : `Approve ${countNumber} Cards`),
        confirmVariant: isRetrieve ? 'warning' : 'primary',
        icon: isRetrieve ? <RotateCcw size={24} style={{ color: '#f59e0b' }} /> : <ThumbsUp size={24} style={{ color: '#2563eb' }} />,
        customMessage: isRetrieve
          ? (isSingle
              ? `Are you sure you want to retrieve card "${countOrCardName}" back to the "Approved" list?`
              : `Are you sure you want to retrieve ${countOrCardName} selected card(s) back to the "Approved" list?`)
          : (isSingle
              ? `Are you sure you want to approve card "${countOrCardName}" and advance it to the "Approved" list?`
              : `Are you sure you want to approve ${countOrCardName} selected card(s) and advance them to the "Approved" list?`),
        note: isRetrieve ? 'Cards will return to Approved status.' : 'Approved cards will be ready for printing.',
        transitionInfo,
      };
    }

    if (newStatus === 'pending') {
      const isUnverify = status === 'verified';
      const isRestore = status === 'pool' || status === 'deleted';
      return {
        title: isUnverify
          ? (isSingle ? 'Unverify ID Card' : 'Unverify Selected Cards')
          : isRestore
          ? (isSingle ? 'Restore ID Card to Pending' : 'Restore Selected Cards to Pending')
          : (isSingle ? 'Retrieve ID Card to Pending' : 'Retrieve Selected Cards to Pending'),
        headline: isUnverify
          ? (isSingle ? `Unverify Card "${countOrCardName}"` : `Unverify ${countOrCardName} Selected Card(s)`)
          : isRestore
          ? (isSingle ? `Restore Card "${countOrCardName}"` : `Restore ${countOrCardName} Selected Card(s)`)
          : (isSingle ? `Retrieve Card "${countOrCardName}"` : `Retrieve ${countOrCardName} Selected Card(s)`),
        itemDescription: isSingle ? `card "${countOrCardName}"` : `${countOrCardName} selected card(s)`,
        requiresCode: false,
        confirmText: isUnverify
          ? (isSingle ? 'Unverify' : `Unverify ${countNumber} Cards`)
          : isRestore
          ? (isSingle ? 'Restore' : `Restore ${countNumber} Cards`)
          : (isSingle ? 'Retrieve' : `Retrieve ${countNumber} Cards`),
        confirmVariant: isUnverify ? 'warning' : 'success',
        icon: <RotateCcw size={24} style={{ color: isUnverify ? '#f59e0b' : '#10b981' }} />,
        customMessage: isUnverify
          ? (isSingle
              ? `Are you sure you want to unverify card "${countOrCardName}" and move it back to the "Pending" list?`
              : `Are you sure you want to unverify ${countOrCardName} selected card(s) and move them back to the "Pending" list?`)
          : isRestore
          ? (isSingle
              ? `Are you sure you want to restore card "${countOrCardName}" from Deleted Pool back to "Pending"?`
              : `Are you sure you want to restore ${countOrCardName} selected card(s) from Deleted Pool back to "Pending"?`)
          : (isSingle
              ? `Are you sure you want to retrieve card "${countOrCardName}" back to the "Pending" list?`
              : `Are you sure you want to retrieve ${countOrCardName} selected card(s) back to the "Pending" list?`),
        note: 'Cards will be moved immediately and available in the Pending list.',
        transitionInfo,
      };
    }

    if (newStatus === 'reprint') {
      const isReject = status === 'request';
      return {
        title: isReject
          ? (isSingle ? 'Reject Card to Reprinting' : 'Reject Selected Cards to Reprinting')
          : (isSingle ? 'Send Card to Reprint' : 'Send Selected Cards to Reprint'),
        headline: isReject
          ? (isSingle ? `Reject Card "${countOrCardName}"` : `Reject ${countOrCardName} Selected Card(s)`)
          : (isSingle ? `Send Card "${countOrCardName}" to Reprint` : `Send ${countOrCardName} Selected Card(s) to Reprint`),
        itemDescription: isSingle ? `card "${countOrCardName}"` : `${countOrCardName} selected card(s)`,
        requiresCode: false,
        confirmText: isReject ? 'Reject' : `Reprint ${countNumber} Cards`,
        confirmVariant: isReject ? 'danger' : 'cyan',
        icon: <RotateCcw size={24} style={{ color: isReject ? '#ef4444' : '#06b6d4' }} />,
        customMessage: isReject
          ? (isSingle
              ? `Are you sure you want to reject card "${countOrCardName}" and send it back to Reprinting?`
              : `Are you sure you want to reject ${countOrCardName} selected card(s) and send them back to Reprinting?`)
          : (isSingle
              ? `Are you sure you want to send card "${countOrCardName}" to the Reprinting queue?`
              : `Are you sure you want to send ${countOrCardName} selected card(s) to the Reprinting queue?`),
        note: 'Cards will appear in the Reprinting list.',
        transitionInfo,
      };
    }

    if (newStatus === 'request') {
      return {
        title: isSingle ? 'Request Card Reprint' : 'Request Reprint for Selected Cards',
        headline: isSingle ? `Request Reprint for "${countOrCardName}"` : `Request Reprint for ${countOrCardName} Card(s)`,
        itemDescription: isSingle ? `card "${countOrCardName}"` : `${countOrCardName} selected card(s)`,
        requiresCode: false,
        confirmText: 'Request',
        confirmVariant: 'primary',
        icon: <CheckCircle2 size={24} style={{ color: '#a855f7' }} />,
        customMessage: isSingle
          ? `Are you sure you want to submit a reprint request for card "${countOrCardName}"?`
          : `Are you sure you want to submit a reprint request for ${countOrCardName} selected card(s)?`,
        note: 'Reprint request will be queued for review.',
        transitionInfo,
      };
    }

    if (newStatus === 'confirm') {
      return {
        title: isSingle ? 'Confirm Card Reprint' : 'Confirm Reprint for Selected Cards',
        headline: isSingle ? `Confirm Reprint for "${countOrCardName}"` : `Confirm Reprint for ${countOrCardName} Card(s)`,
        itemDescription: isSingle ? `card "${countOrCardName}"` : `${countOrCardName} selected card(s)`,
        requiresCode: false,
        confirmText: 'Confirm',
        confirmVariant: 'success',
        icon: <CheckCircle2 size={24} style={{ color: '#10b981' }} />,
        customMessage: isSingle
          ? `Are you sure you want to approve reprint for card "${countOrCardName}"?`
          : `Are you sure you want to approve reprint for ${countOrCardName} selected card(s)?`,
        note: 'Card will be confirmed and added to active reprint queue.',
        transitionInfo,
      };
    }

    if (newStatus === 'done') {
      return {
        title: isSingle ? 'Mark Card as Reprinted' : 'Mark Selected Cards as Reprinted',
        headline: isSingle ? `Complete Reprint for "${countOrCardName}"` : `Complete Reprint for ${countOrCardName} Card(s)`,
        itemDescription: isSingle ? `card "${countOrCardName}"` : `${countOrCardName} selected card(s)`,
        requiresCode: false,
        confirmText: 'Complete',
        confirmVariant: 'success',
        icon: <CheckCircle2 size={24} style={{ color: '#10b981' }} />,
        customMessage: isSingle
          ? `Are you sure you want to mark card "${countOrCardName}" as printed and dispatched?`
          : `Are you sure you want to mark ${countOrCardName} selected card(s) as printed and dispatched?`,
        note: 'Card will be marked as reprinted and archived.',
        transitionInfo,
      };
    }

    return {
      title: 'Update Status',
      headline: `Move to ${getStatusDisplayLabel(newStatus)}`,
      itemDescription: `${countOrCardName} card(s)`,
      requiresCode: false,
      confirmText: 'Update',
      confirmVariant: 'primary',
      icon: <CheckCircle2 size={24} style={{ color: '#2563eb' }} />,
      customMessage: `Are you sure you want to change status to "${getStatusDisplayLabel(newStatus)}"?`,
      note: 'Cards will update immediately.',
      transitionInfo,
    };
  };

  const applyBulkStatus = (newStatus, ids = [...selectedIds], skipConfirm = false) => {
    if (!ids.length) {
      addToast?.('No cards selected', 'warning');
      return;
    }
    if (!skipConfirm) {
      const selectedCardsList = cards.filter((c) => ids.includes(c.id));
      const cfg = getActionModalConfig(newStatus, ids.length, false, {
        selectedCards: selectedCardsList,
        count: ids.length,
      });
      setCardStatusModalConfig({
        ...cfg,
        onConfirm: () => applyBulkStatus(newStatus, ids, true),
      });
      return;
    }

    setActionLoading(true);
    (async () => {
      try {
        try {
          await apiClient.post(`/api/table/${tableId}/cards/bulk-status/`, { card_ids: ids, status: newStatus });
        } catch {
          try {
            await apiClient.post(`/api/table/${tableId}/bulk-status/`, { card_ids: ids, status: newStatus });
          } catch {
            await Promise.all(ids.map((id) => cardApi.changeStatus(id, newStatus)));
          }
        }
        addToast?.(`${ids.length} card(s) moved to ${getStatusDisplayLabel(newStatus)}`, 'success');
        setSelectedIds(new Set());
        await Promise.all([loadCards(), loadStatusCounts(), fetchUndoStatus()]);
      } catch (err) {
        console.error('Bulk status change error:', err);
        addToast?.('Failed to update card status', 'error');
      } finally {
        setActionLoading(false);
      }
    })();
  };

  const applyStatusSingle = (card, newStatus, skipConfirm = false) => {
    if (!card) return;
    if (!skipConfirm) {
      const cardName = card.field_data?.NAME || card.field_data?.name || card.name || `Card #${card.id}`;
      const cfg = getActionModalConfig(newStatus, cardName, true, {
        card,
        count: 1,
      });
      setCardStatusModalConfig({
        ...cfg,
        onConfirm: () => applyStatusSingle(card, newStatus, true),
      });
      return;
    }

    setActionLoading(true);
    (async () => {
      try {
        await cardApi.changeStatus(card.id, newStatus);
        addToast?.(`Card moved to ${getStatusDisplayLabel(newStatus)}`, 'success');
        await Promise.all([loadCards(), loadStatusCounts(), fetchUndoStatus()]);
      } catch (err) {
        console.error('Single status change error:', err);
        addToast?.('Failed to update status', 'error');
      } finally {
        setActionLoading(false);
      }
    })();
  };

  const deleteSingle = (card) => {
    applyStatusSingle(card, 'pool');
  };

  const [downloadingCardId, setDownloadingCardId] = useState(null);
  const [singleDownloadCard, setSingleDownloadCard] = useState(null);

  const handleDownloadSingleCard = async (card) => {
    if (!card || !card.id) return;
    const tid = tableId || table?.id;
    if (!tid) return;

    setDownloadingCardId(card.id);
    try {
      const response = await apiClient.post(
        `/api/table/${tid}/cards/download-docx/`,
        {
          card_ids: [card.id],
          format: 'docx',
          status: status || 'approved',
        },
        { responseType: 'blob' }
      );

      // Verify if response is JSON error
      const contentType = response.headers?.['content-type'] || response.data?.type || '';
      if (contentType.includes('application/json')) {
        const text = await response.data.text();
        try {
          const json = JSON.parse(text);
          if (!json.success) {
            addToast?.(json.message || 'Failed to download card document', 'error');
            return;
          }
        } catch (_) {}
      }

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;

      const cardTitle =
        card.field_data?.NAME ||
        card.field_data?.Name ||
        card.field_data?.Student_Name ||
        card.field_data?.name ||
        `Card_${card.id}`;
      const safeTitle = String(cardTitle).replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `${safeTitle}_IDCard.docx`;


      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      addToast?.(`Downloaded Word card for "${cardTitle}"`, 'success');
      // Single card download does NOT change card status; card remains in Approved
    } catch (err) {
      console.error('Error downloading single card:', err);
      let errMsg = 'Failed to download card document. Please try again.';
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
      setDownloadingCardId(null);
    }
  };


  const handleDelete = () => {
    const ids = [...selectedIds];
    if (!ids.length) {
      addToast?.('No cards selected', 'warning');
      return;
    }
    applyBulkStatus('pool', ids);
  };

  const handlePermanentDelete = () => {
    const ids = [...selectedIds];
    if (!ids.length) {
      addToast?.('No cards selected', 'warning');
      return;
    }
    const randomCode = Math.floor(1000 + Math.random() * 9000).toString();
    setCardStatusModalConfig({
      title: 'Permanently Delete Selected Cards',
      headline: `Permanently Delete ${ids.length} Selected Card(s)`,
      itemDescription: `${ids.length} selected card(s)`,
      requiresCode: true,
      deleteCode: randomCode,
      confirmText: 'Delete Permanently',
      confirmVariant: 'danger',
      icon: <Trash2 size={24} style={{ color: '#ef4444' }} />,
      customMessage: `Are you sure you want to PERMANENTLY delete ${ids.length} selected card(s)? This cannot be undone and media files will be removed from storage. Please enter the verification PIN below to confirm.`,
      note: 'Caution: This action is permanent and cannot be recovered.',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await cardApi.deleteBulkCards(tableId, ids);
          addToast?.(`${ids.length} card(s) permanently deleted`, 'success');
          setSelectedIds(new Set());
          await Promise.all([loadCards(), loadStatusCounts()]);
        } catch (err) {
          console.error('Permanent delete error:', err);
          addToast?.('Failed to permanently delete cards', 'error');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  useEffect(() => {
    const handleClearSelection = () => {
      setSelectedIds(new Set());
      lastSelectedCardIdRef.current = null;
    };

    window.addEventListener('cardflow:clear-selection', handleClearSelection);

    return () => {
      window.removeEventListener('cardflow:clear-selection', handleClearSelection);
    };
  }, []);

  /* ── Inline Field Edit & Excel Grid Navigation ── */
  const [editingCell, setEditingCell] = useState(null);
  const [cellValue, setCellValue] = useState('');

  const startCellEdit = (cardId, field, currentValue) => {
    setEditingCell({ cardId, field });
    setCellValue(currentValue ?? '');
    setActiveCell({ cardId, fieldName: field });
  };

  const commitCellEdit = async () => {
    if (!editingCell) return;
    const { cardId, field } = editingCell;
    const rawVal = cellValue ?? '';
    const isImg = (tableFields || []).some(
      (f) => f.name === field && isImageField(f.type, f.name)
    );
    const valueToCommit = isImg ? rawVal : String(rawVal).toUpperCase();
    setEditingCell(null);

    const currentCard = cards.find((c) => c.id === cardId);
    const currentVal = getCardFieldValue(currentCard, field);
    const trimmedNew = isImg ? String(valueToCommit).trim() : String(valueToCommit).trim().toUpperCase();
    const trimmedOld = isImg ? String(currentVal).trim() : String(currentVal).trim().toUpperCase();

    // If identical (case-insensitive for text fields), skip API and do not push to undo/redo
    if (trimmedNew === trimmedOld) {
      if (String(currentVal) !== trimmedNew) {
        setCards((prev) =>
          prev.map((c) => (c.id === cardId ? { ...c, field_data: { ...(c.field_data || {}), [field]: trimmedNew } } : c))
        );
      }
      return;
    }

    try {
      await cardApi.updateField(cardId, field, valueToCommit);
      fetchUndoStatus();
    } catch {
      /* ignore */
    }
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, field_data: { ...(c.field_data || {}), [field]: valueToCommit } } : c))
    );
    const local = getLocalStorageCards();
    const updated = local.map((c) =>
      c.id === cardId ? { ...c, field_data: { ...(c.field_data || {}), [field]: valueToCommit } } : c
    );
    saveLocalStorageCards(updated);
  };

  const commitDirectValue = async (cardId, field, directValue) => {
    const rawVal = directValue ?? '';
    const isImg = (tableFields || []).some(
      (f) => f.name === field && isImageField(f.type, f.name)
    );
    const valueToCommit = isImg ? rawVal : String(rawVal).toUpperCase();
    setEditingCell(null);

    const currentCard = cards.find((c) => c.id === cardId);
    const currentVal = getCardFieldValue(currentCard, field);
    const trimmedNew = isImg ? String(valueToCommit).trim() : String(valueToCommit).trim().toUpperCase();
    const trimmedOld = isImg ? String(currentVal).trim() : String(currentVal).trim().toUpperCase();

    if (trimmedNew === trimmedOld) {
      if (String(currentVal) !== trimmedNew) {
        setCards((prev) =>
          prev.map((c) => (c.id === cardId ? { ...c, field_data: { ...(c.field_data || {}), [field]: trimmedNew } } : c))
        );
      }
      return;
    }

    try {
      await cardApi.updateField(cardId, field, valueToCommit);
      fetchUndoStatus();
    } catch {
      /* ignore */
    }
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, field_data: { ...(c.field_data || {}), [field]: valueToCommit } } : c))
    );
    const local = getLocalStorageCards();
    const updated = local.map((c) =>
      c.id === cardId ? { ...c, field_data: { ...(c.field_data || {}), [field]: valueToCommit } } : c
    );
    saveLocalStorageCards(updated);
  };

  const commitCellEditAndMove = async (cardId, field, direction) => {
    const rawVal = cellValue ?? '';
    const isImg = (tableFields || []).some(
      (f) => f.name === field && isImageField(f.type, f.name)
    );
    const valueToCommit = isImg ? rawVal : String(rawVal).toUpperCase();
    setEditingCell(null);

    const currentCard = cards.find((c) => c.id === cardId);
    const currentVal = getCardFieldValue(currentCard, field);
    const trimmedNew = isImg ? String(valueToCommit).trim() : String(valueToCommit).trim().toUpperCase();
    const trimmedOld = isImg ? String(currentVal).trim() : String(currentVal).trim().toUpperCase();

    if (trimmedNew !== trimmedOld) {
      try {
        await cardApi.updateField(cardId, field, valueToCommit);
        fetchUndoStatus();
      } catch {
        /* ignore */
      }
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, field_data: { ...(c.field_data || {}), [field]: valueToCommit } } : c))
      );
      const local = getLocalStorageCards();
      const updated = local.map((c) =>
        c.id === cardId ? { ...c, field_data: { ...(c.field_data || {}), [field]: valueToCommit } } : c
      );
      saveLocalStorageCards(updated);
    } else if (String(currentVal) !== trimmedNew) {
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, field_data: { ...(c.field_data || {}), [field]: trimmedNew } } : c))
      );
    }

    const editableFields = (tableFields || []).filter((f) => !isImageField(f.type, f.name));
    if (!editableFields.length) return;

    const currentCardIdx = filteredCards.findIndex((c) => c.id === cardId);
    const currentFieldIdx = editableFields.findIndex((f) => f.name === field);
    if (currentCardIdx === -1 || currentFieldIdx === -1) return;

    let targetCardIdx = currentCardIdx;
    let targetFieldIdx = currentFieldIdx;

    if (direction === 'down') {
      targetCardIdx = Math.min(filteredCards.length - 1, currentCardIdx + 1);
    } else if (direction === 'up') {
      targetCardIdx = Math.max(0, currentCardIdx - 1);
    } else if (direction === 'next') {
      if (currentFieldIdx < editableFields.length - 1) {
        targetFieldIdx = currentFieldIdx + 1;
      } else if (currentCardIdx < filteredCards.length - 1) {
        targetCardIdx = currentCardIdx + 1;
        targetFieldIdx = 0;
      }
    } else if (direction === 'prev') {
      if (currentFieldIdx > 0) {
        targetFieldIdx = currentFieldIdx - 1;
      } else if (currentCardIdx > 0) {
        targetCardIdx = currentCardIdx - 1;
        targetFieldIdx = editableFields.length - 1;
      }
    }

    const nextCard = filteredCards[targetCardIdx];
    const nextField = editableFields[targetFieldIdx];
    if (nextCard && nextField) {
      const nextVal =
        nextCard.field_data?.[nextField.name] ??
        nextCard.field_data?.[nextField.name?.toUpperCase?.()] ??
        nextCard.field_data?.[nextField.name?.toLowerCase?.()] ??
        '';
      startCellEdit(nextCard.id, nextField.name, nextVal);
      setActiveCell({ cardId: nextCard.id, fieldName: nextField.name });
    }
  };

  /* ── Dynamic Drag Column Resizing ── */
  const [customColWidths, setCustomColWidths] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`cf_table_${tableId}_col_widths`) || '{}');
    } catch {
      return {};
    }
  });

  const startColumnResize = (e, fieldName) => {
    e.preventDefault();
    e.stopPropagation();
    const thElem = e.currentTarget.parentElement;
    const startWidth = thElem.getBoundingClientRect().width;
    const startX = e.clientX;

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(50, Math.round(startWidth + delta));
      setCustomColWidths((prev) => {
        const next = { ...prev, [fieldName]: newWidth };
        try {
          localStorage.setItem(`cf_table_${tableId}_col_widths`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const resetColumnWidth = (fieldName) => {
    setCustomColWidths((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      try {
        localStorage.setItem(`cf_table_${tableId}_col_widths`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  /* ── Optimal, Stable Column Widths (Cached across all tabs per tableId) ── */
  const baseColMetrics = useMemo(() => {
    const tId = String(effectiveTableId || tableId || 'default');
    const cached = getStoredTableMetrics(tId);

    const widths = {};
    const weights = {};
    const sampleCards = (cards || []).slice(0, 150);

    // Update max content lengths across sample cards for this table
    if (sampleCards.length > 0) {
      (tableFields || []).forEach((f) => {
        let currentMax = cached.maxLens[f.name] || 0;
        for (let i = 0; i < sampleCards.length; i++) {
          const val = String(getCardFieldValue(sampleCards[i], f.name, f) || '').trim();
          if (val.length > currentMax) {
            currentMax = val.length;
          }
        }
        cached.maxLens[f.name] = currentMax;
      });
    }

    (tableFields || []).forEach((f) => {
      if (customColWidths[f.name]) {
        widths[f.name] = customColWidths[f.name];
        cached.baseWidths[f.name] = customColWidths[f.name];
        weights[f.name] = 0;
        return;
      }

      const spec = getColumnSpec(f.name, f.type);
      if (spec.isImage) {
        const imgW = parseInt(spec.width, 10) || (spec.imgType === 'signature' ? 72 : spec.imgType === 'qr' ? 48 : 58);
        widths[f.name] = imgW;
        cached.baseWidths[f.name] = imgW;
        weights[f.name] = 0;
        return;
      }

      if (spec.isFixed && spec.width) {
        const fixedW = parseInt(spec.width, 10) || 56;
        widths[f.name] = fixedW;
        cached.baseWidths[f.name] = fixedW;
        weights[f.name] = 0;
        return;
      }

      // Read data content length across sample cards & table cache
      const maxContentLen = cached.maxLens[f.name] || 0;
      const headerMinPx = parseInt(getHeaderMinWidth(f.name, spec.minWidth, spec.width), 10) || 60;
      const contentPx = Math.ceil(maxContentLen * 8.5) + 20;
      const baseMin = Math.max(headerMinPx, parseInt(spec.minWidth || '60', 10));

      const rawName = String(f.name || '').toLowerCase();
      let calculated = Math.max(baseMin, contentPx);

      const isPhoneCol =
        spec.isPhone ||
        /\b(?:mob|mobile|phone|ph|cell|tel|whatsapp|contact|emerg|emergency|eme)\b|mob|phone|contact|emerg|eme/i.test(
          rawName
        );

      // Semantic clamping and weights
      if (f.isPathColumn || rawName.includes('path')) {
        calculated = Math.min(240, Math.max(140, calculated));
        weights[f.name] = 2;
      } else if (spec.isAddress || rawName.includes('address') || rawName.includes('location') || rawName.includes('locality') || rawName.includes('residence')) {
        // Address is prioritized as the largest column in the table
        calculated = Math.min(420, Math.max(260, calculated));
        weights[f.name] = 5;
      } else if (spec.isName || rawName.includes('name') || rawName.includes('student') || rawName.includes('father') || rawName.includes('mother') || rawName.includes('guardian')) {
        calculated = Math.min(240, Math.max(150, calculated));
        weights[f.name] = 3;
      } else if (isPhoneCol) {
        calculated = Math.min(165, Math.max(136, calculated));
        weights[f.name] = 0;
      } else if (rawName.includes('dob') || rawName.includes('date') || spec.isDate) {
        calculated = Math.min(128, Math.max(106, calculated));
        weights[f.name] = 0;
      } else if (spec.isFixed) {
        weights[f.name] = 0;
      } else {
        calculated = Math.min(180, Math.max(baseMin, calculated));
        weights[f.name] = spec.weight || 1;
      }

      // Preserve maximum width ever calculated for this table across tabs
      const previousStable = cached.baseWidths[f.name] || 0;
      const finalWidth = Math.max(calculated, previousStable);
      cached.baseWidths[f.name] = finalWidth;
      widths[f.name] = finalWidth;
    });

    persistTableMetrics(tId, cached);
    return { widths, weights };
  }, [tableFields, cards, customColWidths, effectiveTableId, tableId]);

  /* ── Container Width Observer ── */
  const [containerWidth, setContainerWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    updateWidth();
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Proportional Distribution of Remaining Space to Dynamic Columns ── */
  const effectiveColMetrics = useMemo(() => {
    // Fixed system columns: Checkbox (38), SR NO (44), Action (118), Logs (48)
    const fixedSysWidth = 38 + 44 + 118 + 48;
    const baseWidths = { ...baseColMetrics.widths };

    let fixedSchemaWidth = 0;
    const dynamicFields = [];
    let baseDynamicTotal = 0;

    (tableFields || []).forEach((f) => {
      const spec = getColumnSpec(f.name, f.type);
      const w = baseWidths[f.name] || (spec.isImage ? 58 : 100);

      if (spec.isImage || spec.isFixed) {
        fixedSchemaWidth += w;
      } else {
        dynamicFields.push({ name: f.name, baseWidth: w, weight: baseColMetrics.weights[f.name] || 1 });
        baseDynamicTotal += w;
      }
    });

    // If all fields were marked fixed/images, fall back to distributing among all non-image fields
    if (dynamicFields.length === 0) {
      fixedSchemaWidth = 0;
      baseDynamicTotal = 0;
      (tableFields || []).forEach((f) => {
        const spec = getColumnSpec(f.name, f.type);
        const w = baseWidths[f.name] || (spec.isImage ? 58 : 100);
        if (spec.isImage) {
          fixedSchemaWidth += w;
        } else {
          dynamicFields.push({ name: f.name, baseWidth: w, weight: baseColMetrics.weights[f.name] || 1 });
          baseDynamicTotal += w;
        }
      });
    }

    const totalMinWidth = fixedSysWidth + fixedSchemaWidth + baseDynamicTotal;
    const remainingSpace = Math.max(0, containerWidth - totalMinWidth);
    const resultWidths = { ...baseWidths };

    if (remainingSpace > 0 && dynamicFields.length > 0 && baseDynamicTotal > 0) {
      let allocatedExtra = 0;
      dynamicFields.forEach((item, idx) => {
        if (idx === dynamicFields.length - 1) {
          // Last dynamic field absorbs integer rounding remainder to exactly equal containerWidth
          resultWidths[item.name] = item.baseWidth + (remainingSpace - allocatedExtra);
        } else {
          const share = Math.floor(remainingSpace * (item.baseWidth / baseDynamicTotal));
          resultWidths[item.name] = item.baseWidth + share;
          allocatedExtra += share;
        }
      });
    }

    const isOverflowing = containerWidth > 0 && totalMinWidth > containerWidth;
    const totalEffectiveWidth = Math.max(containerWidth, totalMinWidth);

    return {
      widths: resultWidths,
      baseWidths,
      totalMinWidth,
      totalEffectiveWidth,
      isOverflowing,
    };
  }, [baseColMetrics, tableFields, containerWidth]);

  const stableColWidths = effectiveColMetrics.widths;
  const totalColumnsWidth = effectiveColMetrics.totalEffectiveWidth;
  const isTableOverflowing = effectiveColMetrics.isOverflowing;

  const flexColumnName = useMemo(() => {
    if (!tableFields || tableFields.length === 0) return null;
    const addressCol = tableFields.find((f) => {
      const name = String(f.name || '').toLowerCase();
      return name.includes('address') || name.includes('location');
    });
    if (addressCol) return addressCol.name;

    const nameCol =
      tableFields.find((f) => {
        const name = String(f.name || '').toLowerCase();
        return (name.includes('name') || name.includes('student')) && !name.includes('father') && !name.includes('mother');
      }) || tableFields.find((f) => String(f.name || '').toLowerCase().includes('name'));
    if (nameCol) return nameCol.name;

    const expandableCol = tableFields.find((f) => {
      const spec = getColumnSpec(f.name, f.type);
      return !spec.isFixed && !spec.isImage && !spec.isPhone && !spec.isDate;
    });
    if (expandableCol) return expandableCol.name;

    return tableFields[tableFields.length - 1]?.name || null;
  }, [tableFields]);

  /* Multi-Cell / Excel Range Clipboard Paste */
  const handlePasteFromClipboard = async () => {
    if (!activeCell) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) return;

      const rows = text
        .split(/\r?\n/)
        .filter((r) => r.length > 0)
        .map((r) => r.split('\t'));

      if (!rows.length) return;

      const editableFields = (tableFields || []).filter((f) => !isImageField(f.type, f.name));
      if (!editableFields.length) return;

      const startCardIdx = filteredCards.findIndex((c) => c.id === activeCell.cardId);
      const startFieldIdx = editableFields.findIndex((f) => f.name === activeCell.fieldName);
      if (startCardIdx === -1 || startFieldIdx === -1) return;

      const updatedCardsMap = new Map();

      for (let r = 0; r < rows.length; r++) {
        const cardIdx = startCardIdx + r;
        if (cardIdx >= filteredCards.length) break;
        const targetCard = filteredCards[cardIdx];
        const rowCells = rows[r];

        const cardUpdates = updatedCardsMap.get(targetCard.id) || { ...targetCard.field_data };

        for (let c = 0; c < rowCells.length; c++) {
          const fieldIdx = startFieldIdx + c;
          if (fieldIdx >= editableFields.length) break;
          const targetField = editableFields[fieldIdx];
          const rawVal = rowCells[c]?.trim?.() ?? '';
          const upperVal = rawVal.toUpperCase();
          const currentVal = targetCard.field_data?.[targetField.name] ?? '';
          if (String(currentVal).trim().toUpperCase() === upperVal) {
            continue;
          }
          cardUpdates[targetField.name] = upperVal;

          try {
            await cardApi.updateField(targetCard.id, targetField.name, upperVal);
          } catch {
            /* ignore */
          }
        }
        updatedCardsMap.set(targetCard.id, cardUpdates);
      }

      setCards((prev) =>
        prev.map((c) => (updatedCardsMap.has(c.id) ? { ...c, field_data: updatedCardsMap.get(c.id) } : c))
      );

      const local = getLocalStorageCards();
      const updatedLocal = local.map((c) =>
        updatedCardsMap.has(c.id) ? { ...c, field_data: updatedCardsMap.get(c.id) } : c
      );
      saveLocalStorageCards(updatedLocal);
      fetchUndoStatus();
    } catch (err) {
      console.warn('Clipboard paste error:', err);
    }
  };

  /* Excel keyboard navigation when cell is active but not in edit mode */
  const handleContainerKeyDown = (e) => {
    if (editingCell) return;
    if (!activeCell) return;

    const editableFields = (tableFields || []).filter((f) => !isImageField(f.type, f.name));
    if (!editableFields.length) return;

    const currentCardIdx = filteredCards.findIndex((c) => c.id === activeCell.cardId);
    const currentFieldIdx = editableFields.findIndex((f) => f.name === activeCell.fieldName);
    if (currentCardIdx === -1 || currentFieldIdx === -1) return;

    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      const card = filteredCards[currentCardIdx];
      const field = editableFields[currentFieldIdx];
      const val = card?.field_data?.[field.name] ?? '';
      navigator.clipboard.writeText(String(val));
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      handlePasteFromClipboard();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextCard = filteredCards[Math.min(filteredCards.length - 1, currentCardIdx + 1)];
      if (nextCard) setActiveCell({ cardId: nextCard.id, fieldName: activeCell.fieldName });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevCard = filteredCards[Math.max(0, currentCardIdx - 1)];
      if (prevCard) setActiveCell({ cardId: prevCard.id, fieldName: activeCell.fieldName });
    } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      if (currentFieldIdx < editableFields.length - 1) {
        setActiveCell({ cardId: activeCell.cardId, fieldName: editableFields[currentFieldIdx + 1].name });
      } else if (currentCardIdx < filteredCards.length - 1) {
        setActiveCell({ cardId: filteredCards[currentCardIdx + 1].id, fieldName: editableFields[0].name });
      }
    } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      if (currentFieldIdx > 0) {
        setActiveCell({ cardId: activeCell.cardId, fieldName: editableFields[currentFieldIdx - 1].name });
      } else if (currentCardIdx > 0) {
        setActiveCell({ cardId: filteredCards[currentCardIdx - 1].id, fieldName: editableFields[editableFields.length - 1].name });
      }
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      const card = filteredCards[currentCardIdx];
      const field = editableFields[currentFieldIdx];
      const val = getCardFieldValue(card, field.name, field);
      startCellEdit(card.id, field.name, val);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const card = filteredCards[currentCardIdx];
      const field = editableFields[currentFieldIdx];
      startCellEdit(card.id, field.name, '');
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const card = filteredCards[currentCardIdx];
      const field = editableFields[currentFieldIdx];
      startCellEdit(card.id, field.name, e.key.toUpperCase());
    }
  };

  /* Photo Counts for Filters & Sorting Badges */
  const photoCounts = useMemo(() => {
    let complete = 0;
    let pending = 0;
    let incomplete = 0;

    const photoFieldObj = tableFields.find(
      (f) => f.type === 'image' || (f.name && f.name.toUpperCase() === 'PHOTO')
    );
    const photoKey = photoFieldObj?.name || 'PHOTO';

    (cards || []).forEach((c) => {
      const fd = c.field_data || c.data || c || {};
      const val = String(fd[photoKey] ?? fd[photoKey.toLowerCase()] ?? fd.PHOTO ?? fd.photo ?? fd.image ?? '').trim();
      const hasImg = val !== '' && !val.includes('placeholder') && !val.includes('no-image');
      const isPending = val.startsWith('PENDING:') || (!hasImg && val !== '' && val !== 'NOT_FOUND');

      if (hasImg && !isPending) {
        complete++;
      } else if (isPending) {
        pending++;
      } else {
        incomplete++;
      }
    });

    return { complete, pending, incomplete };
  }, [cards, tableFields]);

  /* Real-time In-Grid Duplicates Detection */
  const gridDuplicates = useMemo(() => findGridDuplicates(cards, tableFields), [cards, tableFields]);
  const duplicateCardMap = gridDuplicates.cardDuplicates;
  const duplicateSummary = gridDuplicates.duplicateSummary;

  /* Real-time In-Grid Data Validation Issues */
  const gridIssues = useMemo(() => {
    let errorCount = 0;
    let warningCount = 0;
    const issueCardIds = new Set();
    cards.forEach((c) => {
      const issues = getCardIssues(c, tableFields, duplicateCardMap[c.id]);
      if (issues.hasIssues) {
        issueCardIds.add(c.id);
        errorCount += issues.errors.length;
        warningCount += issues.warnings.length;
      }
    });
    return {
      errorCount,
      warningCount,
      totalIssues: errorCount + warningCount,
      issueCardIds,
    };
  }, [cards, tableFields, duplicateCardMap]);

  /* Filter cards by Image Sort Modal conditions and Data Validation / Error Audit */
  const filteredCards = useMemo(() => {
    let list = cards;

    if (activeImageSort && activeImageSort.columns?.length && activeImageSort.conditions?.length) {
      const { columns, conditions } = activeImageSort;
      list = list.filter((card) => {
        const fd = card.field_data || {};
        return columns.some((col) => {
          const val = String(fd[col] ?? fd[col.toLowerCase()] ?? '').trim();
          const hasImg = val !== '' && !val.includes('placeholder') && !val.includes('no-image');

          if (conditions.includes('complete') && hasImg) return true;
          if (conditions.includes('pending') && !hasImg) return true;
          if (conditions.includes('incomplete') && !hasImg) return true;
          return false;
        });
      });
    }

    if (errorsFilter) {
      list = list.filter((c) => gridIssues.issueCardIds.has(c.id));
    }

    return list;
  }, [cards, activeImageSort, errorsFilter, gridIssues.issueCardIds]);

  filteredCardsRef.current = filteredCards;

  const selectedArr = [...selectedIds];
  const hasSelection = selectedArr.length > 0;

  /* TanStack Virtual for high-performance 60fps virtualized table rendering */
  const tableContainerRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredCards.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 83,
    overscan: 12,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom = virtualRows.length > 0 ? totalVirtualSize - (virtualRows[virtualRows.length - 1]?.end || 0) : 0;
  const totalColumns = (tableFields?.length || 0) + 4;

  /* Trigger infinite scroll when scrolling near bottom */
  useEffect(() => {
    if (!virtualRows.length || !hasMore || loadingMore || cardsLoading) return;
    const lastVirtual = virtualRows[virtualRows.length - 1];
    if (lastVirtual && lastVirtual.index >= filteredCards.length - 5) {
      loadMoreCards();
    }
  }, [virtualRows, hasMore, loadingMore, cardsLoading, filteredCards.length, loadMoreCards]);

  /* Button color inline style generator for 100% color reliability */
  const buttonStyle = (bg, disabled = false) => ({
    background: disabled ? '#f1f5f9' : bg,
    color: disabled ? '#94a3b8' : '#ffffff',
    border: disabled ? '1px solid #cbd5e1' : `1px solid ${bg}`,
    borderRadius: '4px',
    padding: '0 12px',
    height: '32px',
    minHeight: '32px',
    maxHeight: '32px',
    fontSize: '13px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: 1,
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family)',
    flexShrink: 0,
    boxSizing: 'border-box',
    transform: 'none',
    transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
  });

  /* Shared Print & Download buttons (Same Purple/Indigo color family) */
  const renderDownloadButtons = () => (
    <>
      <button
        onClick={() => setShowPrintDataModal(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0 12px',
          height: '32px',
          minHeight: '32px',
          maxHeight: '32px',
          flexShrink: 0,
          boxSizing: 'border-box',
          transform: 'none',
          fontSize: '13px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          border: '1px solid #4338ca',
          background: '#4f46e5',
          color: '#ffffff',
          borderRadius: '4px',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
        }}
        title="Print (Word & Excel with Page Breaks — moves approved cards to Printed list)"
      >
        <Printer size={13} /> <span>Print</span>
      </button>

      <button
        onClick={() => setShowDownloadDataModal(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0 12px',
          height: '32px',
          minHeight: '32px',
          maxHeight: '32px',
          flexShrink: 0,
          boxSizing: 'border-box',
          transform: 'none',
          fontSize: '13px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          border: '1px solid #6d28d9',
          background: '#7c3aed',
          color: '#ffffff',
          borderRadius: '4px',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
        }}
        title="Download (Images ZIP & PDF Document)"
      >
        <Download size={13} /> <span>Download</span>
      </button>

      {status === 'approved' && (
        <>
          <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />
          <button
            onClick={() => {
              if (onNavigate) {
                onNavigate('fix-images', {
                  tableId: effectiveTableId,
                  status: 'approved',
                  orgId: scopedOrgId,
                  orgName: scopedOrgName,
                  tableName: table?.name,
                });
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              flexShrink: 0,
              boxSizing: 'border-box',
              transform: 'none',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid #7c3aed',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
              color: '#ffffff',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
            }}
            title="Fix Images — Open Photo Studio for image enhancements"
          >
            <Sparkles size={13} /> <span>Fix Images</span>
          </button>
        </>
      )}
    </>
  );

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f4f4f4' }}
    >
      {/* ══════════════════════════════════════════════════════════
          TOPBAR — SOLID BLACK BACKGROUND (MATCHING SIDEBAR LOGO HEADER HEIGHT 44px)
          ══════════════════════════════════════════════════════════ */}
      <header
        className="topbar"
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
          gap: '8px',
          boxSizing: 'border-box',
          color: '#ffffff',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {/* Left: Tables, Table Setting, Divider, Download Buttons, Divider, Image Sort, Clear Pending Path */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onBack}
            id="table-back-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              height: '32px',
              minHeight: '32px',
              maxHeight: '32px',
              flexShrink: 0,
              boxSizing: 'border-box',
              transform: 'none',
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
            }}
            title="Back to Tables"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <span style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.2)', margin: '0 2px' }} />

          {renderDownloadButtons()}





          {/* Generate QR / Barcode Button */}
          {hasCodeFields && (status === 'pending' || status === 'verified' || status === 'approved') && (
            <button
              type="button"
              disabled={generatingCodes}
              onClick={handleGenerateCodes}
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
                border: '1px solid rgba(16, 185, 129, 0.4)',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#6ee7b7',
                borderRadius: '4px',
                cursor: generatingCodes ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={
                selectedArr?.length > 0
                  ? `Generate QR / Barcodes for ${selectedArr.length} selected card(s)`
                  : 'Generate QR Codes and Barcodes for all cards in this table'
              }
            >
              {generatingCodes ? <Spinner size={13} /> : <QrCode size={13} />}
              <span>{generatingCodes ? 'Generating Codes…' : selectedArr?.length > 0 ? `Generate Codes (${selectedArr.length})` : 'Generate Codes'}</span>
            </button>
          )}

          {/* Clear Pending Path Button */}

          {status === 'pending' && (
            <>
              <span style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.2)', margin: '0 2px' }} />
              <button
                type="button"
                onClick={() => setShowClearPendingPathModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 12px',
                height: '32px',
                minHeight: '32px',
                maxHeight: '32px',
                flexShrink: 0,
                boxSizing: 'border-box',
                transform: 'none',
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
              }}
              title="Clear paths for missing images"
            >
              <Eraser size={13} />
              <span>Clear Pending Path</span>
            </button>
            </>
          )}
        </div>

        {/* Right: Colored Status List Tabs */}
        <div className="status-tabs" id="table-status-tabs" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {/* Main Status Tabs */}
          {visibleStatusList.map((s) => {
            const count = statusCounts[s.key] ?? 0;
            const isActive = status === s.key || (s.key === 'printed' && (status === 'printed' || status === 'download'));
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => handleStatusTabSwitch(s.key)}
                className={`status-tab status-tab-${s.key} ${isActive ? `active active-${s.key}` : ''}`}
                title={`Switch to ${s.label}`}
                id={`status-tab-${s.key}`}
              >
                <span>{s.label}</span>
                <span className="status-tab-count">
                  {count}
                </span>
              </button>
            );
          })}

          {/* Divider and Requested / Confirmed tabs */}
          {visibleExtraStatusList.length > 0 && (
            <>
              <span
                style={{
                  width: '1px',
                  height: '18px',
                  background: 'rgba(255, 255, 255, 0.25)',
                  margin: '0 4px',
                  flexShrink: 0,
                }}
              />
              {visibleExtraStatusList.map((s) => {
                const count = statusCounts[s.key] ?? 0;
                const isActive = status === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleStatusTabSwitch(s.key)}
                    className={`status-tab status-tab-${s.key} ${isActive ? `active active-${s.key}` : ''}`}
                    title={s.key === 'printed' ? 'Move back to Printed table' : `Switch to ${s.label}`}
                    id={`status-tab-${s.key}`}
                  >
                    <span>{s.label}</span>
                    <span className="status-tab-count">
                      {count}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════
          UNIFIED ACTION & FILTER BAR (SINGLE ROW)
          ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          flexShrink: 0,
          padding: '0 16px',
          background: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          minHeight: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          position: 'relative',
          zIndex: 100,
          boxSizing: 'border-box',
        }}
      >
        {/* Left Side: All Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', flexShrink: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {/* Action Divider Component */}
          {/* Pending List buttons */}
          {status === 'pending' && (
            <>
              <button onClick={() => setShowUploadXlsx(true)} style={buttonStyle('#2563eb')} title="Upload Excel file">
                <FileSpreadsheet size={14} /> <span>Upload XLSX</span>
              </button>


              <button
                onClick={() => setShowReuploadImageModal(true)}
                style={buttonStyle('#0d9488')}
                title="Reupload images from ZIP"
              >
                <RefreshCw size={14} /> <span>Reupload Image</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                onClick={() => setDrawer({ mode: 'add', card: null })}
                style={buttonStyle('#2563eb')}
                title="Add new card"
              >
                <Plus size={14} /> <span>Add</span>
              </button>

              <button
                disabled={selectedArr.length !== 1}
                onClick={() => setDrawer({ mode: 'edit', card: cards.find((c) => selectedIds.has(c.id)) })}
                style={buttonStyle('#2563eb', selectedArr.length !== 1)}
                title="Edit selected card"
              >
                <Pencil size={14} /> <span>Edit</span>
              </button>

              <button
                disabled={!hasSelection}
                onClick={handleDelete}
                style={buttonStyle('#ef4444', !hasSelection)}
                title="Move selected to Pool"
              >
                <Trash2 size={14} /> <span>Delete</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                disabled={!hasSelection || actionLoading}
                onClick={() => applyBulkStatus('verified')}
                style={buttonStyle('#10b981', !hasSelection || actionLoading)}
                title="Verify selected cards"
              >
                {actionLoading ? <Spinner size={14} /> : <CheckCircle2 size={14} />} <span>Verify Selected</span>
              </button>
            </>
          )}

          {/* Verified List buttons */}
          {status === 'verified' && (
            <>
              <button
                disabled={selectedArr.length !== 1}
                onClick={() => setDrawer({ mode: 'edit', card: cards.find((c) => selectedIds.has(c.id)) })}
                style={buttonStyle('#2563eb', selectedArr.length !== 1)}
              >
                <Pencil size={14} /> <span>Edit</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                onClick={() => setShowReuploadImageModal(true)}
                style={buttonStyle('#0d9488')}
                title="Reupload images from ZIP"
              >
                <RefreshCw size={14} /> <span>Reupload Image</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                disabled={!hasSelection || actionLoading}
                onClick={() => applyBulkStatus('pending')}
                style={buttonStyle('#ef4444', !hasSelection || actionLoading)}
                title="Move back to Pending"
              >
                <RotateCcw size={14} /> <span>Unverify</span>
              </button>

              <button
                disabled={!hasSelection || actionLoading}
                onClick={() => applyBulkStatus('approved')}
                style={buttonStyle('#10b981', !hasSelection || actionLoading)}
                title="Approve selected"
              >
                {actionLoading ? <Spinner size={14} /> : <ThumbsUp size={14} />} <span>Approve Selected</span>
              </button>
            </>
          )}

          {/* Approved List buttons */}
          {status === 'approved' && (
            <>
              <button
                disabled={selectedArr.length !== 1}
                onClick={() => setDrawer({ mode: 'edit', card: cards.find((c) => selectedIds.has(c.id)) })}
                style={buttonStyle('#2563eb', selectedArr.length !== 1)}
              >
                <Pencil size={14} /> <span>Edit</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                onClick={() => setShowReuploadImageModal(true)}
                style={buttonStyle('#0d9488')}
                title="Reupload images from ZIP"
              >
                <RefreshCw size={14} /> <span>Reupload Image</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                disabled={!hasSelection || actionLoading}
                onClick={() => applyBulkStatus('verified')}
                style={buttonStyle('#ef4444', !hasSelection || actionLoading)}
                title="Move back to Verified"
              >
                <RotateCcw size={14} /> <span>Disapprove</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                disabled={!hasSelection || actionLoading}
                onClick={() => setShowPrintSelectedModal(true)}
                style={buttonStyle('#2563eb', !hasSelection || actionLoading)}
                title="Print Selected cards"
              >
                <Printer size={14} /> <span>Print Selected</span>
              </button>
            </>

          )}

          {/* Printed List buttons */}
          {(status === 'printed' || status === 'download') && (
            <>
              <button
                disabled={selectedArr.length !== 1}
                onClick={() => setDrawer({ mode: 'edit', card: cards.find((c) => selectedIds.has(c.id)) })}
                style={buttonStyle('#2563eb', selectedArr.length !== 1)}
              >
                <Pencil size={14} /> <span>Edit</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                onClick={() => setShowReuploadImageModal(true)}
                style={buttonStyle('#0d9488')}
                title="Reupload images from ZIP"
              >
                <RefreshCw size={14} /> <span>Reupload Image</span>
              </button>



              <button
                disabled={!hasSelection || actionLoading}
                onClick={() => applyBulkStatus('pending')}
                style={buttonStyle('#10b981', !hasSelection || actionLoading)}
                title="Retrieve to Pending"
              >
                <RotateCcw size={14} /> <span>Retrieve</span>
              </button>
            </>
          )}

          {/* Deleted List buttons */}
          {(status === 'deleted' || status === 'pool') && (
            <>
              <button
                disabled={selectedArr.length !== 1}
                onClick={() => setDrawer({ mode: 'edit', card: cards.find((c) => selectedIds.has(c.id)) })}
                style={buttonStyle('#2563eb', selectedArr.length !== 1)}
              >
                <Pencil size={14} /> <span>Edit</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                disabled={!hasSelection || actionLoading}
                onClick={() => applyBulkStatus('pending')}
                style={buttonStyle('#10b981', !hasSelection || actionLoading)}
                title="Restore selected cards to Pending"
              >
                <RotateCcw size={14} /> <span>Restore to Pending</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                disabled={!hasSelection || actionLoading}
                onClick={handlePermanentDelete}
                style={buttonStyle('#dc2626', !hasSelection || actionLoading)}
                title="Permanently delete selected cards (cannot be undone)"
              >
                {actionLoading ? <Spinner size={14} /> : <Trash2 size={14} />} <span>Permanent Delete</span>
              </button>
            </>
          )}

          {/* Reprinting List buttons */}
          {status === 'reprint' && (
            <>
              <button
                disabled={selectedArr.length !== 1}
                onClick={() => setDrawer({ mode: 'edit', card: cards.find((c) => selectedIds.has(c.id)) })}
                style={buttonStyle('#2563eb', selectedArr.length !== 1)}
              >
                <Pencil size={14} /> <span>Edit</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                onClick={() => setShowReuploadImageModal(true)}
                style={buttonStyle('#0d9488')}
                title="Reupload images from ZIP"
              >
                <RefreshCw size={14} /> <span>Reupload Image</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                disabled={!hasSelection || actionLoading}
                onClick={handleBulkReprintRequest}
                style={buttonStyle('#a855f7', !hasSelection || actionLoading)}
                title="Request reprint for selected cards"
              >
                <CheckCircle2 size={14} /> <span>Request Selected</span>
              </button>
            </>
          )}

          {/* Requested List buttons (Reprint Flow) */}
          {status === 'request' && (
            <>
              <button
                disabled={selectedArr.length !== 1}
                onClick={() => setDrawer({ mode: 'edit', card: cards.find((c) => selectedIds.has(c.id)) })}
                style={buttonStyle('#2563eb', selectedArr.length !== 1)}
              >
                <Pencil size={14} /> <span>Edit</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                disabled={!hasSelection || actionLoading}
                onClick={handleBulkConfirmReprint}
                style={buttonStyle('#10b981', !hasSelection || actionLoading)}
                title="Confirm reprint for selected cards"
              >
                <CheckCircle2 size={14} /> <span>Confirm Selected</span>
              </button>

              <button
                disabled={!hasSelection || actionLoading}
                onClick={handleBulkRejectReprint}
                style={buttonStyle('#ef4444', !hasSelection || actionLoading)}
                title="Reject and move back to Reprinting"
              >
                <RotateCcw size={14} /> <span>Reject to Reprinting</span>
              </button>
            </>
          )}

          {/* Confirmed List buttons (Reprint Flow) */}
          {status === 'confirm' && (
            <>
              <button
                disabled={selectedArr.length !== 1}
                onClick={() => setDrawer({ mode: 'edit', card: cards.find((c) => selectedIds.has(c.id)) })}
                style={buttonStyle('#2563eb', selectedArr.length !== 1)}
              >
                <Pencil size={14} /> <span>Edit</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

              <button
                disabled={!hasSelection || actionLoading}
                onClick={() => setShowPrintDataModal(true)}
                style={buttonStyle('#2563eb', !hasSelection || actionLoading)}
                title="Print selected confirmed cards"
              >
                <Printer size={14} /> <span>Print Selected</span>
              </button>

              <button
                disabled={!hasSelection || actionLoading}
                onClick={() => applyBulkStatus('reprint')}
                style={buttonStyle('#64748b', !hasSelection || actionLoading)}
                title="Move back to Reprinting List"
              >
                <RotateCcw size={14} /> <span>Retrieve</span>
              </button>
            </>
          )}
        </div>

        {/* Right Side: Filters, Duplicates, Movement Filter, Freeze Table, Clear, & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', marginLeft: 'auto', flexShrink: 0 }}>
          {/* 1. Filter Dropdown Popover */}
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              type="button"
              id="table-filter-toggle-btn"
              className="table-filter-toggle-btn"
              onClick={() => setShowFilterModal((prev) => !prev)}
              style={{
                height: '32px',
                minHeight: '32px',
                maxHeight: '32px',
                padding: '0 12px',
                border: activeFilterCount > 0 ? '1px solid #2563eb' : '1px solid #cbd5e1',
                borderRadius: '4px',
                background: activeFilterCount > 0 ? '#eff6ff' : '#ffffff',
                color: activeFilterCount > 0 ? '#1d4ed8' : '#334155',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              title="Filter & Sort Options"
            >
              <SlidersHorizontal size={13} style={{ color: activeFilterCount > 0 ? '#2563eb' : '#64748b' }} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    lineHeight: '1.2',
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                size={12}
                style={{
                  color: activeFilterCount > 0 ? '#2563eb' : '#94a3b8',
                  transform: showFilterModal ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s ease',
                }}
              />
            </button>

            {showFilterModal && (
              <TableFilterModal
                isOpen={showFilterModal}
                onClose={() => {
                  setShowFilterModal(false);
                  setFilterInitialTab('sort');
                }}
                initialTab={filterInitialTab}
                sort={sort}
                onSortChange={(val) => {
                  setSort(val);
                  setPage(1);
                }}
                classOptions={classOptionsWithCounts}
                selectedClasses={selectedClasses}
                onClassesChange={handleClassesChange}
                sectionOptions={sectionOptionsWithCounts}
                selectedSections={selectedSections}
                onSectionsChange={handleSectionsChange}
                courseOptions={courseOptionsWithCounts}
                selectedCourses={selectedCourses}
                onCoursesChange={handleCoursesChange}
                branchOptions={branchOptionsWithCounts}
                selectedBranches={selectedBranches}
                onBranchesChange={handleBranchesChange}
                isCollege={isCollege}
                classToSections={filterOptions.classToSections}
                sectionToClasses={filterOptions.sectionToClasses}
                classSectionCounts={effectiveClassSectionCounts}
                sectionClassCounts={effectiveSectionClassCounts}
                courseToBranches={filterOptions.courseToBranches}
                branchToCourses={filterOptions.branchToCourses}
                courseBranchCounts={filterOptions.courseBranchCounts}
                branchCourseCounts={filterOptions.branchCourseCounts}
                imageColumns={tableFields.filter((f) => f.type === 'image' || f.name.toUpperCase() === 'PHOTO')}
                activeImageSort={activeImageSort}
                onImageSortChange={(sortConfig) => setActiveImageSort(sortConfig)}
                onResetAll={handleResetAllFilters}
                totalCards={totalCards}
                photoCounts={photoCounts}
                cards={cards}
                // Movement Filter Props (Printed table only)
                showMovementTab={isAdminOrOperator && (status === 'printed' || status === 'download')}
                fromDate={fromDate}
                toDate={toDate}
                onApplyMovement={({ from, to }) => {
                  setFromDate(from);
                  setToDate(to);
                  setPage(1);
                }}
                onClearMovement={() => {
                  setFromDate('');
                  setToDate('');
                  setPage(1);
                }}
                bulkMovePresets={tableFreezeInfo?.bulk_movement_presets || []}
                // Freeze Table Props (Approved table only)
                showFreezeTab={isAdminOrOperator && status === 'approved'}
                tableFreezeInfo={tableFreezeInfo}
                onFreezeApplied={(newInfo) => {
                  setTableFreezeInfo(newInfo);
                  loadCards();
                }}
                onUnfrozen={() => {
                  setTableFreezeInfo(null);
                  loadCards();
                }}
                tableId={effectiveTableId}
                status={status === 'printed' ? 'download' : status}
                statusLabel={status === 'approved' ? 'Approved' : 'Printed'}
                addToast={addToast}
              />
            )}
          </div>

          {/* 2. Duplicates Filter Button */}
          {(totalDuplicates > 0 || duplicateSummary.totalDuplicateCards > 0) && (
            <button
              type="button"
              onClick={() => {
                setDuplicatesFilter((prev) => !prev);
                setPage(1);
              }}
              style={{
                height: '32px',
                minHeight: '32px',
                maxHeight: '32px',
                padding: '0 12px',
                border: duplicatesFilter ? '1px solid #d97706' : '1px solid #cbd5e1',
                borderRadius: '4px',
                background: duplicatesFilter ? '#fef3c7' : '#ffffff',
                color: duplicatesFilter ? '#b45309' : '#475569',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              title="Filter table to only show cards with repeating duplicate values"
            >
              <Layers size={13} style={{ color: duplicatesFilter ? '#d97706' : '#64748b' }} />
              <span>Duplicates ({duplicateSummary.totalDuplicateCards || totalDuplicates})</span>
            </button>
          )}



          {/* 5. Clear Filters Button */}
          {(activeFilterCount > 0 || duplicatesFilter || errorsFilter || search) && (
            <button
              type="button"
              onClick={() => {
                handleResetAllFilters();
                setSearch('');
              }}
              style={{
                width: '32px',
                height: '32px',
                minWidth: '32px',
                minHeight: '32px',
                maxHeight: '32px',
                padding: 0,
                border: '1px solid #fecaca',
                borderRadius: '4px',
                background: '#fef2f2',
                color: '#ef4444',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
              title="Clear all active filters and search"
              aria-label="Clear all active filters and search"
            >
              <RotateCcw size={13} />
            </button>
          )}

          {/* Search Box */}
          <Input
            size="sm"
            variant="light"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search All..."
            icon={<Search size={12} />}
            style={{ width: '220px', minWidth: '130px', flex: '0 1 220px' }}
          />
        </div>
      </div>

      {/* Active movement filter notification banner */}
      {(status === 'printed' || status === 'download') && (fromDate || toDate) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            marginBottom: '6px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '4px',
            fontSize: '13px',
            color: '#1e40af',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={14} style={{ color: '#2563eb' }} />
            <span>
              Showing cards moved between{' '}
              <strong>{fromDate ? formatDisplayDateTime(fromDate) : 'Initial'}</strong> and{' '}
              <strong>{toDate ? formatDisplayDateTime(toDate) : 'Now'}</strong>
              {totalCards !== undefined && (
                <span style={{ marginLeft: '6px', fontWeight: 700, color: '#1d4ed8' }}>
                  ({totalCards} card{totalCards !== 1 ? 's' : ''} moved)
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setFromDate('');
              setToDate('');
              setPage(1);
            }}
            style={{
              background: '#dbeafe',
              border: '1px solid #93c5fd',
              borderRadius: '3px',
              padding: '2px 8px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#1e40af',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            <RotateCcw size={11} />
            <span>Reset Date Filter</span>
          </button>
        </div>
      )}

      {/* Shared Frozen Table Banner for Superadmins & Operators */}
      {isAdminOrOperator && status === 'approved' && tableFreezeInfo?.is_frozen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            marginBottom: '6px',
            background: '#f0f9ff',
            border: '1px solid #7dd3fc',
            borderRadius: '4px',
            fontSize: '13px',
            color: '#0369a1',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Snowflake size={15} style={{ color: '#0284c7', flexShrink: 0 }} />
            <span>
              <strong>Table Frozen ({status === 'approved' ? 'Approved' : 'Printed'})</strong>: Showing{' '}
              <strong>{tableFreezeInfo.cards_in_freeze ?? totalCards}</strong> card{tableFreezeInfo.cards_in_freeze !== 1 ? 's' : ''} moved between{' '}
              <strong>{formatDisplayDateTime(tableFreezeInfo.frozen_from)}</strong> and{' '}
              <strong>{formatDisplayDateTime(tableFreezeInfo.frozen_to)}</strong>.
              {tableFreezeInfo.frozen_by_name && (
                <span style={{ marginLeft: '4px', color: '#0c4a6e' }}>
                  (Frozen by {tableFreezeInfo.frozen_by_name})
                </span>
              )}
              {tableFreezeInfo.total_unfrozen_cards > (tableFreezeInfo.cards_in_freeze ?? totalCards) && (
                <span style={{ marginLeft: '6px', color: '#0284c7', fontWeight: 600 }}>
                  • {tableFreezeInfo.total_unfrozen_cards - (tableFreezeInfo.cards_in_freeze ?? totalCards)} newer card(s) paused
                </span>
              )}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => {
                setFilterInitialTab('freeze');
                setShowFilterModal(true);
              }}
              style={{
                background: '#e0f2fe',
                border: '1px solid #38bdf8',
                borderRadius: '3px',
                padding: '2px 8px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#0369a1',
                cursor: 'pointer',
              }}
            >
              Update Freeze
            </button>
            <button
              type="button"
              onClick={handleUnfreezeTableDirect}
              style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '3px',
                padding: '2px 8px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#991b1b',
                cursor: 'pointer',
              }}
            >
              Unfreeze Table
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          VIRTUAL DATA TABLE WITH CRISP BORDERS & EXACT PHOTO HEIGHT
          ══════════════════════════════════════════════════════════ */}
      <div
        ref={tableContainerRef}
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        className="table-container idcard-table"
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: isTableOverflowing ? 'auto' : 'hidden',
          overflowY: 'auto',
          background: '#fff',
          position: 'relative',
          display: 'block',
          boxSizing: 'border-box',
          width: '100%',
          outline: 'none',
          overscrollBehavior: 'contain',
          scrollBehavior: 'auto',
        }}
      >
        {tableLoading ? (
          <SkeletonFullTable rowCount={10} />
        ) : tableNotFound ? (
          <div
            style={{
              padding: '80px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '400px',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                marginBottom: '16px',
              }}
            >
              <AlertCircle size={32} />
            </div>
            <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              Table #{effectiveTableId} Not Found
            </h3>
            <p style={{ fontSize: '15px', color: '#64748b', maxWidth: '440px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              This table does not exist or may have been deleted. Please check the URL or return to the tables list.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => {
                  if (onBack) {
                    onBack();
                  } else if (scopedOrgId || table?.organisation_id) {
                    window.location.href = `/organisation/${scopedOrgId || table?.organisation_id}/tables`;
                  } else {
                    window.location.href = '/cards';
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                }}
              >
                <ArrowLeft size={16} /> Back to Tables
              </button>
            </div>
          </div>
        ) : (
          <>
            <table
              style={{
                width: `${totalColumnsWidth}px`,
                minWidth: '100%',
                maxWidth: isTableOverflowing ? 'none' : '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: '15px',
                tableLayout: 'fixed',
                boxSizing: 'border-box',
                animation: 'pageEnter 0.22s cubic-bezier(0.22, 1, 0.36, 1) both',
              }}
            >
              <colgroup>
                <col style={{ width: '38px', minWidth: '38px' }} />
                <col style={{ width: '44px', minWidth: '44px' }} />
                {tableFields.map((f) => {
                  const spec = getColumnSpec(f.name, f.type);
                  const w = stableColWidths[f.name] || (spec.isImage ? (spec.imgType === 'photo' ? 100 : 58) : 100);
                  return (
                    <col key={f.name} style={{ width: `${w}px`, minWidth: `${w}px` }} />
                  );
                })}
                <col style={{ width: '118px', minWidth: '118px' }} />
                <col style={{ width: '48px', minWidth: '48px' }} />
              </colgroup>
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 25,
                  background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                  boxShadow: '0 -4px 0 0 #1e293b, 0 4px 6px -1px rgba(0,0,0,0.2)',
                  borderBottom: '2px solid #0f172a',
                }}
              >
                <tr style={{ background: 'transparent', color: '#f8fafc' }}>
                  {/* Checkbox */}
                  <th
                    className="freeze-col-check"
                    style={{
                      width: '38px',
                      minWidth: '38px',
                      maxWidth: '38px',
                      boxSizing: 'border-box',
                      padding: '2px 3px',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      background: 'transparent',
                      borderRight: '1px solid rgba(255,255,255,0.08)',
                      borderBottom: '2px solid #0f172a',
                      borderLeft: '1px solid #cbd5e1',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                      }}
                    >
                      <button
                        onClick={toggleSelectAll}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#fff',
                          padding: '2px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {allSelected ? (
                          <SquareCheck size={18} />
                        ) : someSelected ? (
                          <MinusSquare size={18} />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                    </div>
                  </th>

                  {/* SR NO */}
                  <th
                    className="freeze-col-sr"
                    style={{
                      width: '44px',
                      minWidth: '44px',
                      maxWidth: '44px',
                      boxSizing: 'border-box',
                      padding: '2px 3px',
                      textAlign: 'center',
                      background: 'transparent',
                      borderRight: '1px solid rgba(255,255,255,0.08)',
                      borderBottom: '2px solid #0f172a',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: '#f8fafc',
                      lineHeight: 1.1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    SR
                    <br />
                    NO
                  </th>

                  {tableFields.map((f) => {
                    const spec = getColumnSpec(f.name, f.type);
                    const colW = stableColWidths[f.name] || (spec.isImage ? (spec.imgType === 'photo' ? 100 : 58) : 100);
                    const widthStyle = {
                      width: `${colW}px`,
                      minWidth: `${colW}px`,
                      maxWidth: `${colW}px`,
                      boxSizing: 'border-box',
                    };

                    return (
                      <th
                        key={f.name}
                        style={{
                          padding: '2px 3px',
                          textAlign: spec.align,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          color: '#f8fafc',
                          ...widthStyle,
                          borderRight: '1px solid rgba(255,255,255,0.08)',
                          borderBottom: '2px solid #0f172a',
                          whiteSpace: 'normal',
                          wordBreak: 'normal',
                          overflowWrap: 'break-word',
                          lineHeight: 1.2,
                          verticalAlign: 'middle',
                          position: 'relative',
                        }}
                        title={`${f.name} (drag right border to resize, double-click to reset)`}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: spec.align === 'center' ? 'center' : 'flex-start',
                            width: '100%',
                            userSelect: 'none',
                          }}
                        >
                          <span>{f.name}</span>
                        </div>
                        <div
                          className="col-resize-handle"
                          onMouseDown={(e) => startColumnResize(e, f.name)}
                          onDoubleClick={() => resetColumnWidth(f.name)}
                          title="Drag to resize column (double-click to reset)"
                        />
                      </th>
                    );
                  })}

                  <th
                    style={{
                      width: '118px',
                      minWidth: '118px',
                      maxWidth: '118px',
                      boxSizing: 'border-box',
                      padding: '2px 3px',
                      textAlign: 'center',
                      background: 'transparent',
                      borderRight: '1px solid rgba(255,255,255,0.08)',
                      borderBottom: '2px solid #0f172a',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: '#f8fafc',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.2,
                    }}
                  >
                    ACTION
                  </th>
                  <th
                    style={{
                      width: '48px',
                      minWidth: '48px',
                      maxWidth: '48px',
                      boxSizing: 'border-box',
                      padding: '2px 3px',
                      textAlign: 'center',
                      background: 'transparent',
                      borderRight: 'none',
                      borderBottom: '2px solid #0f172a',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: '#f8fafc',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.2,
                    }}
                    title="Card Activity Timeline Logs"
                  >
                    LOGS
                  </th>
                </tr>
              </thead>
              {filteredCards.length > 0 && (
                <tbody>
                  {paddingTop > 0 && (
                    <tr
                      className="virtual-spacer-row"
                      style={{
                        height: `${paddingTop}px`,
                        minHeight: `${paddingTop}px`,
                        '--spacer-height': `${paddingTop}px`,
                      }}
                    >
                      <td
                        colSpan={totalColumns}
                        className="virtual-spacer-cell"
                        style={{
                          height: `${paddingTop}px`,
                          minHeight: `${paddingTop}px`,
                          '--spacer-height': `${paddingTop}px`,
                          padding: 0,
                          border: 'none',
                        }}
                      />
                    </tr>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const idx = virtualRow.index;
                    const card = filteredCards[idx];
                    if (!card) return null;
                    const isSelected = selectedIds.has(card.id);
                    const fd = card.field_data || {};
                    const srNo = idx + 1;

                    return (
                      <tr
                        key={card.id}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        className={`idcard-virtual-row ${isSelected ? 'selected' : ''}`}
                        style={{
                          height: '68px',
                          minHeight: '68px',
                          background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                          transition: 'background-color 0.12s ease-in-out',
                        }}
                      >
                        {/* Checkbox */}
                        <td
                          className="freeze-col-check"
                          onClick={(e) => {
                            if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                              toggleSelect(card.id, idx, e);
                            }
                          }}
                          style={{
                            background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                            width: '38px',
                            minWidth: '38px',
                            maxWidth: '38px',
                            boxSizing: 'border-box',
                            height: '68px',
                            padding: '2px',
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            borderLeft: isSelected ? '3px solid #2563eb' : '1px solid #cbd5e1',
                            borderRight: '1px solid #e2e8f0',
                            borderBottom: '1px solid #e2e8f0',
                            userSelect: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '100%',
                              height: '100%',
                            }}
                          >
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                if (e.shiftKey) e.preventDefault();
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(card.id, idx, e);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: isSelected ? '#2563eb' : '#94a3b8',
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'color 0.15s ease',
                              }}
                              title={isSelected ? 'Deselect card (Hold Shift to select range)' : 'Select card (Hold Shift to select range)'}
                            >
                              {isSelected ? <SquareCheck size={18} /> : <Square size={18} />}
                            </button>
                          </div>
                        </td>

                        {/* SR NO */}
                        <td
                          className="freeze-col-sr"
                          style={{
                            background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                            width: '44px',
                            minWidth: '44px',
                            maxWidth: '44px',
                            boxSizing: 'border-box',
                            height: '68px',
                            padding: '2px',
                            textAlign: 'center',
                            fontWeight: 600,
                            color: '#475569',
                            fontSize: '13px',
                            borderRight: '1px solid #e2e8f0',
                            borderBottom: '1px solid #e2e8f0',
                            verticalAlign: 'middle',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                            <span>{renderHighlightedText(String(srNo), search || debouncedSearch)}</span>
                            {(search || debouncedSearch) && String(card.id).includes(String(search || debouncedSearch).trim()) && (
                              <span
                                title={`Card ID: ${card.id}`}
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: '#fef08a',
                                  color: '#854d0e',
                                  padding: '0 2px',
                                  borderRadius: '2px',
                                }}
                              >
                                #{card.id}
                              </span>
                            )}
                            {card.is_duplicate && (
                              <span
                                title="Repeating card (shares duplicate values on unique columns)"
                                style={{
                                  width: '5px',
                                  height: '5px',
                                  borderRadius: '50%',
                                  background: '#f59e0b',
                                  display: 'inline-block',
                                }}
                              />
                            )}
                          </div>
                        </td>

                        {/* Dynamic Fields */}
                        {tableFields.map((f) => {
                          const spec = getColumnSpec(f.name, f.type);
                          const val = getCardFieldValue(card, f.name, f);
                          const isImg = spec.isImage;
                          const isEditing = editingCell?.cardId === card.id && editingCell?.field === f.name;
                          const isPhoneCol = Boolean(
                            spec.isPhone ||
                            /\b(?:mob|mobile|phone|ph|cell|tel|whatsapp|contact|emerg|emergency|eme)\b|mob|phone|contact|emerg|eme/i.test(
                              f.name
                            )
                          );

                          if (isImg) {
                            const colW = stableColWidths[f.name] || (spec.isImage ? 58 : 100);
                            return (
                              <PhotoTableCell
                                key={f.name}
                                card={card}
                                field={f}
                                spec={spec}
                                val={val}
                                width={colW}
                                onEdit={(e) => {
                                  e.stopPropagation();
                                  setDrawer({ mode: 'edit', card, srNo });
                                }}
                              />
                            );
                          }

                          const isDropdown = isDropdownField(f);
                          const options = isDropdown ? getOptionsForField(f) : [];
                          const isUniqueCol = Boolean(f.is_unique || f.unique);
                          const inGridDup = duplicateCardMap[card.id]?.[f.name];
                          const isDuplicate = Boolean(inGridDup || card.duplicate_fields?.includes(f.name) || (isUniqueCol && card.is_duplicate));
                          const dupCount = inGridDup ? inGridDup.count : isDuplicate ? 2 : 1;

                          const cellValidation = validateCell(f, val, fd);
                          const hasError = !cellValidation.isValid && cellValidation.severity === 'error';
                          const hasWarning = !cellValidation.isValid && cellValidation.severity === 'warning';
                          const validationMessage = cellValidation.message;
                          const isActive = activeCell?.cardId === card.id && activeCell?.fieldName === f.name;

                          const colW = stableColWidths[f.name] || (spec.isImage ? (spec.imgType === 'photo' ? 100 : 58) : 100);
                          const cellWidthStyle = {
                            width: `${colW}px`,
                            minWidth: `${colW}px`,
                            maxWidth: `${colW}px`,
                            boxSizing: 'border-box',
                          };

                          const cellBg = isEditing
                            ? undefined
                            : hasError
                            ? '#fff1f2'
                            : isDuplicate && !isSelected
                            ? '#fffbeb'
                            : hasWarning && !isSelected
                            ? '#fffdf5'
                            : undefined;

                          const cellBorderColor = hasError
                            ? '#fca5a5'
                            : hasWarning
                            ? '#fde68a'
                            : isDuplicate
                            ? '#fde68a'
                            : '#e2e8f0';

                          return (
                            <td
                              key={f.name}
                              className={[
                                hasError ? 'excel-cell-error' : hasWarning ? 'excel-cell-warning' : '',
                                isActive ? 'excel-cell-active' : '',
                              ].filter(Boolean).join(' ')}
                              style={{
                                padding: '2px',
                                textAlign: spec.align,
                                ...cellWidthStyle,
                                height: '68px',
                                background: cellBg,
                                color: hasError ? '#991b1b' : '#0f172a',
                                fontSize: '13px',
                                fontWeight: isDuplicate || hasError ? 700 : 500,
                                textTransform: 'uppercase',
                                whiteSpace: spec.isFixed ? 'nowrap' : 'normal',
                                wordBreak: spec.isFixed ? 'normal' : 'break-word',
                                borderRight: `1px solid ${cellBorderColor}`,
                                borderBottom: `1px solid ${cellBorderColor}`,
                                verticalAlign: 'middle',
                                position: 'relative',
                                cursor: isEditing ? 'default' : 'pointer',
                              }}
                              onClick={() => {
                                setActiveCell({ cardId: card.id, fieldName: f.name });
                              }}
                              onDoubleClick={() => {
                                setActiveCell({ cardId: card.id, fieldName: f.name });
                                if (!isEditing) startCellEdit(card.id, f.name, val);
                              }}
                            >
                              {isEditing ? (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    zIndex: 10,
                                    display: 'flex',
                                    alignItems: 'stretch',
                                    width: '100%',
                                    height: '100%',
                                    background: '#ffffff',
                                  }}
                                >
                                  {isDropdown ? (
                                    <CustomSelect
                                      autoOpen={true}
                                      value={cellValue}
                                      size="sm"
                                      height="100%"
                                      dropdownOffset={4}
                                      menuMaxWidth="220px"
                                      options={[
                                        { value: '', label: '-- SELECT --' },
                                        ...(cellValue && !options.includes(cellValue) ? [{ value: cellValue, label: `${cellValue} (Current)` }] : []),
                                        ...options.map((opt) => ({ value: opt, label: opt })),
                                      ]}
                                      onChange={(val) => commitDirectValue(card.id, f.name, val)}
                                      onClose={() => setEditingCell(null)}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        border: '1.5px solid #2563eb',
                                        borderRadius: '2px',
                                        boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.15)',
                                      }}
                                    />
                                  ) : (
                                    <input
                                      autoFocus
                                      value={cellValue}
                                      onChange={(e) => setCellValue(e.target.value.toUpperCase())}
                                      onBlur={commitCellEdit}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          commitCellEditAndMove(card.id, f.name, e.shiftKey ? 'up' : 'down');
                                        } else if (e.key === 'Tab') {
                                          e.preventDefault();
                                          commitCellEditAndMove(card.id, f.name, e.shiftKey ? 'prev' : 'next');
                                        } else if (e.key === 'Escape') {
                                          e.preventDefault();
                                          setEditingCell(null);
                                        }
                                      }}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        border: '1.5px solid #2563eb',
                                        borderRadius: '2px',
                                        padding: '4px 8px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        textTransform: 'uppercase',
                                        outline: 'none',
                                        background: '#ffffff',
                                        boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.15)',
                                        boxSizing: 'border-box',
                                        color: '#0f172a',
                                        fontFamily: 'inherit',
                                      }}
                                    />
                                  )}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: spec.align === 'center' ? 'center' : 'flex-start',
                                    gap: '4px',
                                    width: '100%',
                                    position: 'relative',
                                  }}
                                >
                                  {isPhoneCol && splitPhoneNumbers(val).length > 1 ? (
                                    <div
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: spec.align === 'center' ? 'center' : 'flex-start',
                                        justifyContent: 'center',
                                        gap: '2px',
                                        lineHeight: 1.25,
                                        width: '100%',
                                      }}
                                    >
                                      {splitPhoneNumbers(val).map((pNum, pIdx) => (
                                        <span
                                          key={pIdx}
                                          style={{
                                            cursor: 'pointer',
                                            color: hasError ? '#b91c1c' : isDuplicate ? '#92400e' : '#0f172a',
                                            fontSize: '13px',
                                            fontWeight: isDuplicate || hasError ? 700 : 500,
                                            textTransform: 'uppercase',
                                            whiteSpace: 'nowrap',
                                            fontVariantNumeric: 'tabular-nums',
                                            letterSpacing: '0.02em',
                                          }}
                                          title={String(val)}
                                        >
                                          {renderHighlightedText(pNum, search || debouncedSearch)}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span
                                      title={
                                        hasError
                                          ? `[DATA ERROR] ${validationMessage}`
                                          : hasWarning
                                          ? `[VALIDATION WARNING] ${validationMessage}`
                                          : isDuplicate
                                          ? `Repeating duplicate value "${val}" (shared with ${dupCount > 1 ? `${dupCount - 1} other cards` : 'other cards'})`
                                          : String(val)
                                      }
                                      style={{
                                        cursor: 'pointer',
                                        color: hasError ? '#b91c1c' : isDuplicate ? '#92400e' : '#0f172a',
                                        fontSize: '14px',
                                        fontWeight: isDuplicate || hasError ? 700 : 500,
                                        textTransform: 'uppercase',
                                        whiteSpace: isPhoneCol ? 'nowrap' : 'normal',
                                        fontVariantNumeric: isPhoneCol ? 'tabular-nums' : undefined,
                                        letterSpacing: isPhoneCol ? '0.02em' : undefined,
                                      }}
                                    >
                                      {String(val) ? (
                                        renderHighlightedText(val, search || debouncedSearch)
                                      ) : (
                                        <span style={{ color: hasError ? '#fca5a5' : '#cbd5e1' }}>—</span>
                                      )}
                                    </span>
                                  )}
                                  {isDuplicate && (
                                    <span
                                      title={`Repeating duplicate value in this table (${dupCount} occurrences)`}
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: '#b45309',
                                        background: '#fef3c7',
                                        padding: '1px 4px',
                                        borderRadius: '3px',
                                        border: '1px solid #fde68a',
                                        letterSpacing: '0.02em',
                                        lineHeight: 1,
                                        flexShrink: 0,
                                      }}
                                    >
                                      REPEAT{dupCount > 1 ? ` ${dupCount}x` : ''}
                                    </span>
                                  )}
                                  {hasError && (
                                    <span
                                      title={validationMessage}
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: '#ef4444',
                                        background: '#fee2e2',
                                        padding: '1px 4px',
                                        borderRadius: '3px',
                                        border: '1px solid #fecaca',
                                        lineHeight: 1,
                                        flexShrink: 0,
                                      }}
                                    >
                                      INVALID
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}


                        {/* Action */}
                        <td
                          style={{
                            background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                            width: '118px',
                            minWidth: '118px',
                            maxWidth: '118px',
                            boxSizing: 'border-box',
                            height: '68px',
                            padding: '2px',
                            textAlign: 'center',
                            borderRight: '1px solid #e2e8f0',
                            borderBottom: '1px solid #e2e8f0',
                            verticalAlign: 'middle',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '4px', width: '100%' }}>
                            {/* ── PENDING: Verify + Delete ── */}
                            {status === 'pending' && (
                              <>
                                <RowActionButton
                                  variant="success"
                                  onClick={() => applyStatusSingle(card, 'verified')}
                                  title="Verify"
                                >
                                  Verify
                                </RowActionButton>
                                <RowActionButton
                                  variant="danger"
                                  onClick={() => deleteSingle(card)}
                                  title="Delete"
                                >
                                  Delete
                                </RowActionButton>
                              </>
                            )}

                            {/* ── VERIFIED: Approve + Unverify (No Delete Button) ── */}
                            {status === 'verified' && (
                              <>
                                <RowActionButton
                                  variant="primary"
                                  onClick={() => applyStatusSingle(card, 'approved')}
                                  title="Approve"
                                >
                                  Approve
                                </RowActionButton>
                                <RowActionButton
                                  variant="warning"
                                  onClick={() => applyStatusSingle(card, 'pending')}
                                  title="Unverify"
                                >
                                  Unverify
                                </RowActionButton>
                              </>
                            )}

                            {/* ── APPROVED: Disapprove + Download ── */}
                            {status === 'approved' && (
                              <>
                                <RowActionButton
                                  variant="danger"
                                  onClick={() => applyStatusSingle(card, 'verified')}
                                  title="Disapprove"
                                >
                                  Disapprove
                                </RowActionButton>
                                <RowActionButton
                                  variant="primary"
                                  onClick={() => setSingleDownloadCard(card)}
                                  title="Download Word Document"
                                >
                                  Download
                                </RowActionButton>
                              </>
                            )}

                            {/* ── PRINTED / DOWNLOAD: Retrieve + Reprint ── */}
                            {(status === 'printed' || status === 'download') && (
                              <>
                                <RowActionButton
                                  variant="warning"
                                  onClick={() => applyStatusSingle(card, 'approved')}
                                  title="Retrieve back to Approved"
                                >
                                  Retrieve
                                </RowActionButton>
                                <RowActionButton
                                  variant="cyan"
                                  onClick={() => setReprintModalCard(card)}
                                  title="Request Reprint"
                                >
                                  Reprint
                                </RowActionButton>
                              </>
                            )}

                            {status === 'reprint' && (
                              <RowActionButton
                                variant="cyan"
                                onClick={() => setReprintModalCard(card)}
                                title="Request Reprint"
                              >
                                Reprint
                              </RowActionButton>
                            )}

                            {status === 'request' && (
                              <>
                                <RowActionButton
                                  variant="success"
                                  onClick={() => handleConfirmSingleReprint(card)}
                                  title="Confirm reprint request"
                                >
                                  Confirm
                                </RowActionButton>
                                <RowActionButton
                                  variant="danger"
                                  onClick={() => handleRejectSingleReprint(card)}
                                  title="Reject reprint request"
                                >
                                  Reject
                                </RowActionButton>
                              </>
                            )}

                            {(status === 'pool' || status === 'deleted') && (
                              <RowActionButton
                                variant="success"
                                onClick={() => applyStatusSingle(card, 'pending')}
                                title="Retrieve to Pending"
                              >
                                Retrieve
                              </RowActionButton>
                            )}
                          </div>
                        </td>

                        {/* Logs */}
                        <td
                          style={{
                            background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                            width: '48px',
                            minWidth: '48px',
                            maxWidth: '48px',
                            boxSizing: 'border-box',
                            height: '68px',
                            padding: '2px',
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            borderRight: 'none',
                            borderBottom: '1px solid #e2e8f0',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '100%',
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLogCard(card);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                border: '1px solid #bfdbfe',
                                background: '#eff6ff',
                                color: '#2563eb',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxSizing: 'border-box',
                                margin: '0 auto',
                                padding: 0,
                                boxShadow: '0 1px 2px rgba(37, 99, 235, 0.08)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#2563eb';
                                e.currentTarget.style.color = '#ffffff';
                                e.currentTarget.style.borderColor = '#1d4ed8';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#eff6ff';
                                e.currentTarget.style.color = '#2563eb';
                                e.currentTarget.style.borderColor = '#bfdbfe';
                                e.currentTarget.style.transform = 'translateY(0)';
                              }}
                              title="View Card History Logs"
                              aria-label="View Card History Logs"
                            >
                              <History size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr
                      className="virtual-spacer-row"
                      style={{
                        height: `${paddingBottom}px`,
                        minHeight: `${paddingBottom}px`,
                        '--spacer-height': `${paddingBottom}px`,
                      }}
                    >
                      <td
                        colSpan={totalColumns}
                        className="virtual-spacer-cell"
                        style={{
                          height: `${paddingBottom}px`,
                          minHeight: `${paddingBottom}px`,
                          '--spacer-height': `${paddingBottom}px`,
                          padding: 0,
                          border: 'none',
                        }}
                      />
                    </tr>
                  )}
                  {loadingMore && (
                    <SkeletonCardTableRows
                      count={3}
                      fields={tableFields}
                      stableColWidths={stableColWidths}
                      flexColumnName={flexColumnName}
                      isTableOverflowing={isTableOverflowing}
                      totalColumns={totalColumns}
                    />
                  )}
                </tbody>
              )}

              {filteredCards.length === 0 && cardsLoading && (
                <tbody>
                  <SkeletonCardTableRows
                    count={10}
                    fields={tableFields}
                    stableColWidths={stableColWidths}
                    flexColumnName={flexColumnName}
                    isTableOverflowing={isTableOverflowing}
                    totalColumns={totalColumns}
                  />
                </tbody>
              )}
            </table>

            {!cardsLoading && cardsError && (
              <div
                style={{
                  flex: 1,
                  minHeight: '360px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 20px',
                  textAlign: 'center',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '14px',
                    maxWidth: '440px',
                    margin: '0 auto',
                  }}
                >
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: '#fee2e2',
                      color: '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.18)',
                    }}
                  >
                    <AlertTriangle size={28} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <h4
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#0f172a',
                        margin: '0 0 6px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Unable to Load Cards
                    </h4>
                    <p style={{ fontSize: '14px', color: '#64748b', margin: 0, fontWeight: 500 }}>
                      {cardsError}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                    <button
                      onClick={() => loadCards()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        background: '#2563eb',
                        color: '#ffffff',
                        fontSize: '14px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                      }}
                    >
                      <RefreshCw size={14} /> Retry Loading Cards
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!cardsLoading && !cardsError && filteredCards.length === 0 && (
              <div
                style={{
                  flex: 1,
                  minHeight: '360px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 20px',
                  textAlign: 'center',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '14px',
                    maxWidth: '440px',
                    margin: '0 auto',
                  }}
                >
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: '#fef3c7',
                      color: '#d97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(217, 119, 6, 0.18)',
                    }}
                  >
                    <Clock size={28} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <h4
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#0f172a',
                        margin: '0 0 6px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {statusCounts && (statusCounts[status] || 0) > 0
                        ? (classFilter || sectionFilter || courseFilter || branchFilter || duplicatesFilter || errorsFilter || activeImageSort || search
                            ? 'NO CARDS MATCH ACTIVE FILTERS'
                            : 'SYNCING CARD RECORDS…')
                        : `NO CARDS IN STATUS "${status.toUpperCase()}"`}
                    </h4>
                    <p style={{ fontSize: '14px', color: '#64748b', margin: 0, fontWeight: 500 }}>
                      {statusCounts && (statusCounts[status] || 0) > 0
                        ? (classFilter || sectionFilter || courseFilter || branchFilter || duplicatesFilter || errorsFilter || activeImageSort || search
                            ? `Status "${status}" has ${statusCounts[status]} registered cards, but none match the current filter criteria.`
                            : `Status "${status}" has ${statusCounts[status]} registered cards. If they do not appear, click below to refresh.`)
                        : search
                          ? `No cards match search "${search}"`
                          : `THERE ARE NO CARDS MATCHING CURRENT FILTER CRITERIA.`}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                    {statusCounts && (statusCounts[status] || 0) > 0 ? (
                      (classFilter || sectionFilter || courseFilter || branchFilter || duplicatesFilter || errorsFilter || activeImageSort || search) ? (
                        <button
                          onClick={() => {
                            setClassFilter('');
                            setSectionFilter('');
                            setCourseFilter('');
                            setBranchFilter('');
                            setDuplicatesFilter(false);
                            setErrorsFilter(false);
                            setActiveImageSort(null);
                            setSearch('');
                            setPage(1);
                          }}
                          style={buttonStyle('#2563eb')}
                        >
                          <X size={14} /> Clear All Filters
                        </button>
                      ) : (
                        <button onClick={() => loadCards()} style={buttonStyle('#2563eb')}>
                          <RefreshCw size={14} /> Refresh Cards List
                        </button>
                      )
                    ) : (
                      !search && status === 'pending' && (
                        <>
                          <button onClick={() => setDrawer({ mode: 'add', card: null })} style={buttonStyle('#2563eb')}>
                            <Plus size={14} /> Add First Card
                          </button>
                          <button onClick={() => setShowUploadXlsx(true)} style={buttonStyle('#3b82f6')}>
                            <FileSpreadsheet size={14} /> Upload XLSX
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>



      {/* ── Drawers & Modals ── */}
      {drawer && (
        <CardSideDrawer
          card={drawer.card}
          srNo={
            drawer.srNo ||
            (drawer.card ? (
              (() => {
                const fIdx = filteredCards.findIndex((c) => String(c.id) === String(drawer.card.id));
                if (fIdx >= 0) return fIdx + 1;
                const cIdx = cards.findIndex((c) => String(c.id) === String(drawer.card.id));
                if (cIdx >= 0) return cIdx + 1;
                return drawer.card.serial_no || null;
              })()
            ) : null)
          }
          mode={drawer.mode}
          tableId={tableId}
          tableFields={tableFields}
          onClose={() => setDrawer(null)}
          onSave={async (updated) => {
            if (updated?.isReprint) {
              try {
                const targetCard = updated.card || drawer?.card;
                const cardName = targetCard?.field_data?.NAME || targetCard?.field_data?.name || targetCard?.name || `Card #${targetCard?.id}`;
                const res = await reprintApi.requestReprint(effectiveTableId, {
                  card_ids: [targetCard.id],
                  reason: 'Reprint request with staged edits',
                  changes: { [targetCard.id]: updated.changes },
                });
                if (res?.status === 'ok' || res?.success) {
                  addToast?.(`Reprint request with updated details submitted for "${cardName}"`, 'success');
                  await Promise.all([loadCards(), loadStatusCounts()]);
                } else {
                  addToast?.(res?.message || 'Failed to submit reprint request', 'error');
                }
              } catch (err) {
                addToast?.(err?.response?.data?.message || 'Error submitting reprint request', 'error');
              }
              return;
            }
            const local = getLocalStorageCards();
            const existingIdx = local.findIndex((c) => String(c.id) === String(updated.id));
            let updatedList = [];
            if (existingIdx >= 0) {
              updatedList = [...local];
              updatedList[existingIdx] = { ...updatedList[existingIdx], ...updated };
            } else {
              updatedList = [updated, ...local];
            }
            saveLocalStorageCards(updatedList);

            setCards((prev) => {
              const idx = prev.findIndex((c) => String(c.id) === String(updated.id));
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...updated };
                return next;
              }
              return [updated, ...prev];
            });
            loadStatusCounts();
            loadFilterOptions();
            loadCards();
          }}
          addToast={addToast}
          status={status}
          userRole={role}
          currentUser={currentUser}
        />
      )}

      {showUploadXlsx && (
        <UploadXlsxModal
          table={table}
          onClose={() => setShowUploadXlsx(false)}
          onSuccess={() => {
            loadCards();
            loadStatusCounts();
            loadFilterOptions();
          }}
          addToast={addToast}
        />
      )}

      {/* Print Data Modal */}
      {showPrintDataModal && (
        <PrintDataModal
          table={table}
          tableId={tableId || table?.id}
          status={status}
          cardCount={cards.length}
          availableClasses={classOptions.map((c) => c.value)}
          onClose={() => setShowPrintDataModal(false)}
          addToast={addToast}
          onStatusTransition={(newStatus) =>
            applyBulkStatus(
              newStatus,
              cards.map((c) => c.id)
            )
          }
        />
      )}

      {/* Print Selected Modal */}
      {showPrintSelectedModal && (
        <PrintSelectedModal
          table={table}
          tableId={tableId || table?.id}
          selectedIds={Array.from(selectedIds)}
          onClose={() => setShowPrintSelectedModal(false)}
          addToast={addToast}
          onSuccess={() => {
            setSelectedIds(new Set());
            loadCards();
            loadStatusCounts();
            fetchUndoStatus();
          }}
        />
      )}


      {/* Download Data Modal */}
      {showDownloadDataModal && (
        <DownloadDataModal
          table={table}
          tableId={tableId || table?.id}
          status={status}
          cardCount={cards.length}
          onClose={() => setShowDownloadDataModal(false)}
          addToast={addToast}
        />
      )}

      {/* Reupload Images Modal */}
      {showReuploadImageModal && (
        <ReuploadImageModal
          table={table}
          status={status}
          cardCount={cards.length}
          onClose={() => setShowReuploadImageModal(false)}
          onSuccess={() => {
            loadCards();
            loadStatusCounts();
          }}
          addToast={addToast}
        />
      )}

      {/* Clear Pending Path Modal */}
      {showClearPendingPathModal && (
        <ClearPendingPathModal
          table={table}
          status={status}
          tableFields={tableFields}
          onClose={() => setShowClearPendingPathModal(false)}
          onSuccess={() => {
            loadCards();
            loadStatusCounts();
          }}
          addToast={addToast}
        />
      )}







      {/* Reversible Operations & History Audit Modal */}
      {showHistoryModal && (
        <OperationHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          tableId={tableId}
          tableName={table?.name || 'Table'}
          onOperationReverted={() => {
            fetchUndoStatus();
            loadCards();
            loadStatusCounts();
          }}
          addToast={addToast}
        />
      )}

      {/* Bulk Transactions & Mass Batch History Modal */}
      {showBulkTxModal && (
        <BulkTransactionsModal
          isOpen={showBulkTxModal}
          onClose={() => {
            setShowBulkTxModal(false);
            setFocusTxId(null);
          }}
          tableId={tableId}
          tableName={table?.name || 'Table'}
          initialTransactionId={focusTxId}
          onTransactionReverted={() => {
            fetchUndoStatus();
            loadCards();
            loadStatusCounts();
          }}
          addToast={addToast}
        />
      )}

      {/* Card Activity & Timeline Drawer */}
      {logCard && (
        <CardTimelineDrawer
          card={logCard}
          table={table}
          onClose={() => setLogCard(null)}
          onCardUpdated={(updatedCard) => {
            if (updatedCard) {
              setCards((prev) => prev.map((c) => (c.id === updatedCard.id ? { ...c, ...updatedCard } : c)));
              setLogCard((prev) => (prev && prev.id === updatedCard.id ? { ...prev, ...updatedCard } : prev));
            } else {
              loadCards();
            }
          }}
          addToast={addToast}
          onOpenTransaction={(txId) => {
            setLogCard(null);
            setFocusTxId(txId);
            setShowBulkTxModal(true);
          }}
        />
      )}

      {/* ── 2-Option Reprint Request Modal ── */}
      {reprintModalCard && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px',
          }}
          onClick={() => setReprintModalCard(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #f1f5f9',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: '#cff4fc',
                    color: '#0891b2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RotateCcw size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    Request Card Reprint
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    Choose how to proceed with this reprint request
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReprintModalCard(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Card Info Box */}
            <div style={{ padding: '20px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                  {reprintModalCard.field_data?.NAME ||
                    reprintModalCard.field_data?.Name ||
                    reprintModalCard.field_data?.['STUDENT NAME'] ||
                    reprintModalCard.name ||
                    `Card #${reprintModalCard.id}`}
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b' }}>
                  <span>
                    <strong>Roll No:</strong> {reprintModalCard.field_data?.['ROLL NO'] || reprintModalCard.field_data?.Roll_No || '—'}
                  </span>
                  <span>
                    <strong>Class:</strong> {getCardClassVal(reprintModalCard) || '—'}
                  </span>
                  <span>
                    <strong>Section:</strong> {getCardSectionVal(reprintModalCard) || '—'}
                  </span>
                </div>
              </div>

              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                You can request an immediate reprint using existing data, or edit the photo and field values first.
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleDirectReprint}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    background: '#06b6d4',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: actionLoading ? 'wait' : 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#0891b2'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#06b6d4'; }}
                >
                  {actionLoading ? <Spinner size={16} /> : <RotateCcw size={16} />}
                  <span>Reprint Now (As-Is)</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    const c = reprintModalCard;
                    setReprintModalCard(null);
                    setDrawer({ mode: 'reprint', card: c });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1d4ed8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#2563eb'; }}
                >
                  <Pencil size={16} />
                  <span>Want to Edit first</span>
                </button>

                <button
                  type="button"
                  onClick={() => setReprintModalCard(null)}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    color: '#64748b',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    marginTop: '4px',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Status Transition & Deletion Confirmation Modal with PIN ── */}
      <ConfirmDeleteModal
        isOpen={Boolean(cardStatusModalConfig)}
        onClose={() => setCardStatusModalConfig(null)}
        title={cardStatusModalConfig?.title || 'Confirm Action'}
        headline={cardStatusModalConfig?.headline || cardStatusModalConfig?.title || 'Confirm Action'}
        itemDescription={cardStatusModalConfig?.itemDescription || 'selected card(s)'}
        requiresCode={Boolean(cardStatusModalConfig?.requiresCode)}
        deleteCode={cardStatusModalConfig?.deleteCode || ''}
        confirmText={cardStatusModalConfig?.confirmText || 'Confirm'}
        confirmVariant={cardStatusModalConfig?.confirmVariant || 'primary'}
        customMessage={cardStatusModalConfig?.customMessage || ''}
        note={cardStatusModalConfig?.note || ''}
        icon={cardStatusModalConfig?.icon || null}
        transitionInfo={cardStatusModalConfig?.transitionInfo || null}
        onConfirm={() => {
          cardStatusModalConfig?.onConfirm?.();
          setCardStatusModalConfig(null);
        }}
      />

      {/* ── Undo / Redo Confirmation Modal with PIN (Super Admin Only) ── */}
      {undoConfirmModal.isOpen && (
        <ConfirmDeleteModal
          isOpen={undoConfirmModal.isOpen}
          onClose={() => setUndoConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          onConfirm={() => {
            const isUndo = undoConfirmModal.type === 'undo';
            setUndoConfirmModal((prev) => ({ ...prev, isOpen: false }));
            if (isUndo) {
              executeUndo();
            } else {
              executeRedo();
            }
          }}
          title={undoConfirmModal.type === 'undo' ? 'Confirm Undo All Images' : 'Confirm Redo All Images'}
          headline={undoConfirmModal.type === 'undo' ? 'Undo Last Changed Images' : 'Redo Last Changed Images'}
          customMessage={
            undoConfirmModal.type === 'undo'
              ? 'Do you really want to undo the last changed images across this table? This reverts all images from the last operation back to their previous versions.'
              : 'Do you really want to redo the last changed images across this table?'
          }
          note="Note: Image history is retained for up to 30 days."
          requiresCode={true}
          deleteCode={undoConfirmModal.pin}
          confirmText={undoConfirmModal.type === 'undo' ? 'Undo' : 'Redo'}
          confirmVariant="primary"
          icon={undoConfirmModal.type === 'undo' ? <Undo2 size={24} style={{ color: '#2563eb' }} /> : <Redo2 size={24} style={{ color: '#2563eb' }} />}
        />
      )}

      {/* ── Single Card Download Confirmation Modal ── */}
      {singleDownloadCard && (
        <ConfirmDeleteModal
          isOpen={Boolean(singleDownloadCard)}
          onClose={() => setSingleDownloadCard(null)}
          onConfirm={() => {
            const target = singleDownloadCard;
            setSingleDownloadCard(null);
            handleDownloadSingleCard(target);
          }}
          title="Confirm Download Card Document"
          headline={`Download Word Document — ${
            singleDownloadCard.field_data?.NAME ||
            singleDownloadCard.field_data?.Name ||
            singleDownloadCard.name ||
            `Card #${singleDownloadCard.id}`
          }`}
          customMessage={`Are you sure you want to download the formatted Word document (.docx) for "${
            singleDownloadCard.field_data?.NAME ||
            singleDownloadCard.field_data?.Name ||
            singleDownloadCard.name ||
            `Card #${singleDownloadCard.id}`
          }"?`}
          itemDescription="Word (.docx) card document"
          confirmText="Download"
          confirmVariant="primary"
          requiresCode={false}
          note="Note: This card will download directly without changing its approval status."
          icon={<Download size={24} style={{ color: '#2563eb' }} />}
        />
      )}


    </div>
  );
}


