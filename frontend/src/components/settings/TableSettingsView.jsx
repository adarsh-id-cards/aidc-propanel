import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { createPortal } from 'react-dom';
import {
  Plus,
  Pen,
  Trash2,
  ToggleRight,
  Download,
  FileSpreadsheet,
  SlidersHorizontal,
  Settings,
  Search,
  Loader2,
  Save,
  X,
  CheckCircle2,
  Upload,
  Settings2,
  GripVertical,
  Edit3,
  PlusCircle,
  List,
  Info,
  Check,
  School,
  BookOpen,
  Briefcase,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Power,
} from 'lucide-react';

import CreateXlsxModal from '../common/CreateXlsxModal';
import CustomSelect from '../common/CustomSelect';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import { schemaApi, clientApi } from '../../services/api';

const STATUS_TABS = ['All', 'Active', 'Inactive'];

/* ── Table Type metadata ── */
const TABLE_TYPES = [
  {
    value: 'school_student',
    label: 'School Student',
    icon: School,
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
  },
  {
    value: 'college_student',
    label: 'College Student',
    icon: BookOpen,
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
  },
  { value: 'staff', label: 'Staff', icon: Briefcase, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  { value: 'custom', label: 'Custom', icon: Settings2, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
];

function getTableTypeMeta(value) {
  return TABLE_TYPES.find((t) => t.value === value) || TABLE_TYPES[3];
}

/* ── Smart table-type inference (mirrors backend logic) ── */
function inferTableType(tableName = '', orgName = '', fields = []) {
  const name = (tableName || '').toLowerCase().trim();
  const org = (orgName || '').toLowerCase().trim();

  const staffRe = /\b(staff|teacher|teachers|employee|employees|emp|faculty|personnel|hr|driver|workers|management)\b/;
  const collegeRe =
    /\b(college|university|institute|polytechnic|degree|btech|mtech|bca|mca|mba|bsc|msc|ba|ma|bcom|mcom|semester|sem|branch|dept|department)\b/;
  const schoolRe = /\b(school|vidyalaya|academy|convent|class|std|standard|grade|section|sec)\b/;
  const studentRe = /\b(student|students|pupil|scholars|list|data|records|info|all)\b/;

  if (staffRe.test(name)) return 'staff';
  if (collegeRe.test(name)) return 'college_student';
  if (schoolRe.test(name)) return 'school_student';

  if (studentRe.test(name)) {
    if (collegeRe.test(org)) return 'college_student';
    return 'school_student';
  }

  // Check fields if table name is generic
  if (Array.isArray(fields) && fields.length > 0) {
    const fieldTypes = fields.map((f) => (f.type || '').toLowerCase());
    const fieldSubtypes = fields.map((f) => (f.subtype || '').toLowerCase());
    const fieldNames = fields.map((f) => (f.name || '').toLowerCase()).join(' ');

    if (
      fieldTypes.includes('class') ||
      fieldSubtypes.includes('class') ||
      fieldTypes.includes('section') ||
      fieldSubtypes.includes('section') ||
      /\b(class|section|roll|father|mother)\b/.test(fieldNames)
    ) {
      return 'school_student';
    }
    if (
      fieldTypes.includes('course') ||
      fieldSubtypes.includes('course') ||
      fieldTypes.includes('branch') ||
      fieldSubtypes.includes('branch') ||
      /\b(branch|semester|sem|course|enrolment|enrollment)\b/.test(fieldNames)
    ) {
      return 'college_student';
    }
    if (
      fieldSubtypes.includes('department') ||
      fieldSubtypes.includes('designation') ||
      /\b(designation|emp|employee|department|salary)\b/.test(fieldNames)
    ) {
      return 'staff';
    }
  }

  return 'custom';
}

import FormatPresetConfigModal from '../common/FormatPresetConfigModal';
import CodeConfigModal from '../common/CodeConfigModal';
import { FORMAT_PRESETS, isDropdownField } from '../../utils/formatPresets';

/* ── Unified Field Types (combines Text/Role and Media into a single clean dropdown) ── */
const UNIFIED_FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'class', label: 'Class' },
  { value: 'section', label: 'Section' },
  { value: 'photo', label: 'Photo' },
  { value: 'rel_photo', label: 'Relation Photo' },
  { value: 'signature', label: 'Signature' },
  { value: 'barcode', label: 'Barcode' },
  { value: 'qr_code', label: 'QR Code' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'course', label: 'Course' },
  { value: 'branch', label: 'Branch' },
  { value: 'department', label: 'Department' },
  { value: 'designation', label: 'Designation' },
];

function getFieldUnifiedType(f) {
  if (!f) return 'text';
  const rawSubtype = String(f.subtype || '').toLowerCase().trim();
  const rawType = String(f.type || '').toLowerCase().trim();

  if (['class', 'section', 'course', 'branch', 'department', 'designation'].includes(rawSubtype)) {
    return rawSubtype;
  }
  if (['class', 'section', 'course', 'branch', 'department', 'designation', 'date', 'number', 'photo', 'rel_photo', 'signature', 'barcode', 'qr_code'].includes(rawType)) {
    return rawType;
  }
  if (['mother_photo', 'father_photo'].includes(rawType)) {
    return 'rel_photo';
  }
  if (['image'].includes(rawType)) {
    return 'photo';
  }
  return 'text';
}

function mapUnifiedTypeToField(val) {
  if (['class', 'section', 'course', 'branch', 'department', 'designation'].includes(val)) {
    return { type: 'text', subtype: val, show_path: false };
  }
  if (['photo', 'rel_photo', 'signature'].includes(val)) {
    return { type: val, subtype: '', show_path: true };
  }
  if (['barcode', 'qr_code', 'date', 'number'].includes(val)) {
    return { type: val, subtype: '', show_path: false };
  }
  return { type: 'text', subtype: 'standard', show_path: false };
}

/* ── Smart field-type & subtype inference ── */
function inferFieldTypeAndSubtype(name = '') {
  const n = String(name || '').toLowerCase().trim();

  // Media types
  if (/\b(rel(?:ation)?[\s_-]*(?:photo|pic|image|1|2|one|two))\b/.test(n) ||
      /\b(mother|father)[\s_-]*(photo|pic|image)\b/.test(n)) {
    return { type: 'rel_photo', subtype: '' };
  }
  if (/\b(photo|pic|picture|image)\b/.test(n)) {
    return { type: 'photo', subtype: '' };
  }
  if (/\b(signature|sign)\b/.test(n) && !/\bdesignation\b/.test(n)) {
    return { type: 'signature', subtype: '' };
  }
  if (/\bbarcode\b/.test(n)) {
    return { type: 'barcode', subtype: '' };
  }
  if (/\bqr[\s_-]?code?\b/.test(n)) {
    return { type: 'qr_code', subtype: '' };
  }

  // Date / Number
  if (/\b(dob|date[\s_-]*of[\s_-]*birth|birth[\s_-]*date|joining[\s_-]*date|validity|issue[\s_-]*date|expiry)\b/.test(n)) {
    return { type: 'date', subtype: '' };
  }

  // Text subtypes
  if (/\b(class|std|standard|grade)\b/.test(n)) {
    return { type: 'text', subtype: 'class' };
  }
  if (/\b(section|sec|div|division)\b/.test(n)) {
    return { type: 'text', subtype: 'section' };
  }
  if (/\b(course|degree|prog|program)\b/.test(n)) {
    return { type: 'text', subtype: 'course' };
  }
  if (/\b(branch|stream)\b/.test(n)) {
    return { type: 'text', subtype: 'branch' };
  }
  if (/\b(department|dept)\b/.test(n)) {
    return { type: 'text', subtype: 'department' };
  }
  if (/\b(designation|role|position|post|title)\b/.test(n)) {
    return { type: 'text', subtype: 'designation' };
  }

  return { type: 'text', subtype: 'standard' };
}

function inferFieldType(name = '') {
  return inferFieldTypeAndSubtype(name).type;
}

const DEFAULT_SCHEMA_FIELDS = [
  { id: 'f-1', name: 'PHOTO', type: 'photo', subtype: '', mandatory: true, show_path: true },
  { id: 'f-2', name: 'NAME', type: 'text', subtype: 'standard', mandatory: true, show_path: false },
  { id: 'f-3', name: 'SERIAL NO', type: 'text', subtype: 'standard', mandatory: true, show_path: false },
];


export default function TableSettingsView({ addToast, onNavigate }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('All');
  const [selected, setSelected] = useState(null);
  const [_page, setPage] = useState(1);

  const [showAddEditDrawer, setShowAddEditDrawer] = useState(false);
  const [showExcelDrawer, setShowExcelDrawer] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [clientOrg, setClientOrg] = useState('');
  const [tableToDelete, setTableToDelete] = useState(null);
  const [tableDeleteCode, setTableDeleteCode] = useState('');

  /* Fetch group_id from the current client so we can call createTable(groupId, …) */
  const loadGroupId = useCallback(async () => {
    try {
      const data = await clientApi.getActive?.({ page_size: 1 });
      const clients = data?.results || data?.clients || (Array.isArray(data) ? data : []);
      if (clients.length > 0) {
        const client = clients[0];
        setGroupId(client.group_id || client.default_group_id || null);
        setClientOrg(client.name || client.client_name || '');
      }
    } catch {
      /* ignore — tables still work via fallback */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let activeOrg = clientOrg;

    if (!activeOrg) {
      try {
        const clientsData = await clientApi.getActive?.({ page_size: 10 });
        const clients = clientsData?.results || clientsData?.clients || (Array.isArray(clientsData) ? clientsData : []);
        if (clients.length > 0) {
          activeOrg = clients[0].name || clients[0].client_name || '';
          setClientOrg(activeOrg);
          if (clients[0].group_id || clients[0].id) {
            setGroupId(clients[0].group_id || clients[0].id);
          }
        }
      } catch {
        /* fallback */
      }
    }

    try {
      let list = [];
      if (groupId) {
        const data = await schemaApi.getGroupTables(groupId);
        list = data?.tables || data?.results || (Array.isArray(data) ? data : []);
      } else {
        const data = await schemaApi.getSchemas?.();
        list = data?.tables || data?.results || (Array.isArray(data) ? data : []);
      }

      const enriched = (list || []).map((t) => {
        const rawName = t.client_name || t.client?.name || '';
        const validName =
          rawName && !['Default Organisation', 'Organisation', '—'].includes(rawName.trim())
            ? rawName.trim()
            : activeOrg || 'Primary Organisation';
        return {
          ...t,
          client_name: validName,
          fields: t.fields || DEFAULT_SCHEMA_FIELDS,
        };
      });

      setTables(enriched);
      // Auto-select if exactly 1 table, otherwise unselect all
      if (enriched.length === 1) {
        setSelected(enriched[0].id);
      } else {
        setSelected(null);
      }
    } catch (err) {
      console.error('Failed to load table schemas:', err);
      setTables([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [clientOrg, groupId]);

  useEffect(() => {
    loadGroupId();
  }, [loadGroupId]);
  useEffect(() => {
    load();
  }, [load]);

  /* Dispatch footer data count & selection */
  useEffect(() => {
    let selectedText = '';
    if (selected) {
      const match = tables.find((t) => String(t.id) === String(selected));
      if (match) {
        selectedText = `Selected: ${match.name || 'Table'}`;
      }
    }
    window.dispatchEvent(
      new CustomEvent('cardflow:data-count', {
        detail: {
          text: `Total Tables: ${tables.length}`,
          selectedText,
          count: tables.length,
        },
      })
    );
  }, [tables, selected]);

  const filtered = tables.filter((t) => {
    if (!t) return false;
    const q = (search || '').toLowerCase();
    const matchSearch =
      !q || (t.name || '').toLowerCase().includes(q) || (t.client_name || '').toLowerCase().includes(q);
    const isActive = t.is_active !== false;
    const matchStatus = statusTab === 'All' || (statusTab === 'Active' ? isActive : !isActive);
    return matchSearch && matchStatus;
  });

  const paged = filtered;
  const selTable = tables.find((t) => t.id === selected);

  const handleToggleStatus = async () => {
    if (!selected) return;
    try {
      await schemaApi.toggleTableStatus(selected);
      addToast?.(`Status toggled for ${selTable?.name}`, 'success');
      load();
    } catch (err) {
      console.error('Toggle status error:', err);
      addToast?.(err?.response?.data?.message || 'Error updating table status', 'error');
    }
  };

  const _handleDeleteTable = () => {
    if (!selected) return;
    const target = tables.find((t) => t.id === selected) || selTable;
    setTableToDelete(target);
    setTableDeleteCode(String(Math.floor(1000 + Math.random() * 9000)));
  };

  const handleDownloadBlankTemplate = () => {
    try {
      const currentTable = selTable || (tables && tables.length > 0 ? tables[0] : null);
      let headers = [];
      if (currentTable?.fields && Array.isArray(currentTable.fields) && currentTable.fields.length > 0) {
        headers = currentTable.fields.map((f) => f.name || f.fieldName || 'FIELD');
      } else {
        headers = [
          'NAME',
          'ROLL_NO',
          'CLASS',
          'SECTION',
          'FATHER_NAME',
          'DOB',
          'BLOOD_GROUP',
          'PHONE',
          'ADDRESS',
          'PHOTO',
        ];
      }

      const sampleRow = headers.map((h) => {
        const u = String(h || '').toUpperCase();
        if (u.includes('NAME') && !u.includes('FATHER') && !u.includes('MOTHER')) return 'Aarav Sharma';
        if (u.includes('ROLL')) return '101';
        if (u.includes('CLASS')) return '10';
        if (u.includes('SEC')) return 'A';
        if (u.includes('FATHER')) return 'Rajesh Sharma';
        if (u.includes('MOTHER')) return 'Sunita Sharma';
        if (u.includes('DOB') || u.includes('BIRTH')) return '2008-05-15';
        if (u.includes('BLOOD')) return 'O+';
        if (u.includes('MOB') || u.includes('PHONE') || u.includes('CONTACT')) return '9876543210';
        if (u.includes('PHOTO') || u.includes('PIC') || u.includes('IMG')) return '101.jpg';
        if (u.includes('ADDR')) return '12 Civil Lines';
        return 'Sample ' + h;
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8',
      });
      const fileName = currentTable?.name
        ? `${currentTable.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Template.xlsx`
        : 'CardFlow_Template.xlsx';

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }, 150);

      addToast?.(`Downloaded ${fileName} successfully!`, 'success');
    } catch (e) {
      addToast?.('Failed to generate template: ' + (e?.message || 'unknown error'), 'error');
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return d;
    }
  };

  return (
    <div
      className="view-container"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* ── ACTION BAR ── */}
      <div
        className="action-bar"
        id="gs-action-bar"
        style={{
          background: '#1e1e2e',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          height: '50px',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}
      >
        {/* Left */}
        <div className="action-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            className="status-tabs"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '5px',
              padding: '2px',
              gap: '2px',
              height: '34px',
              boxSizing: 'border-box',
            }}
          >
            {STATUS_TABS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setStatusTab(t);
                  setPage(1);
                }}
                className={`status-tab${statusTab === t ? ' active' : ''}`}
                style={{
                  padding: '0 10px',
                  height: '28px',
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  lineHeight: '1.2',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  background: statusTab === t ? '#2563eb' : 'transparent',
                  color: statusTab === t ? '#ffffff' : '#cbd5e1',
                  fontWeight: statusTab === t ? 700 : 600,
                  fontFamily: 'var(--font-family)',
                  transition: 'all 0.15s',
                  boxShadow: statusTab === t ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div
            className="action-divider"
            style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }}
          />

          <div
            className="notif-search-box"
            style={{
              width: '220px',
              height: '34px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '5px',
              padding: '0 8px',
              display: 'flex',
              alignItems: 'center',
              boxSizing: 'border-box',
            }}
          >
            <Search size={12} style={{ color: '#94a3b8', flexShrink: 0, marginRight: '6px' }} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search tables..."
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                outline: 'none',
                fontSize: '13px',
                width: '100%',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 2px',
                }}
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="action-bar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="btn-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="btn"
                onClick={() => {
                  setEditingTable(null);
                  setShowAddEditDrawer(true);
                }}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  height: '34px',
                  minHeight: '34px',
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid #2563eb',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxSizing: 'border-box',
                }}
              >
                <Plus size={13} /> Add
              </button>
              <button
                className="btn"
                disabled={!selected}
                onClick={() => {
                  setEditingTable(selTable);
                  setShowAddEditDrawer(true);
                }}
                style={{
                  background: selected ? '#2563eb' : 'rgba(255, 255, 255, 0.08)',
                  color: selected ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
                  border: selected ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.15)',
                  height: '34px',
                  minHeight: '34px',
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: selected ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxSizing: 'border-box',
                }}
              >
                <Pen size={13} /> Edit
              </button>

            </div>

            <div
              className="btn-separator"
              style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }}
            />

            <div className="btn-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="btn"
                onClick={() => setShowExcelDrawer(true)}
                title="Create Table with Data (Excel / Word / CSV)"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  height: '34px',
                  minHeight: '34px',
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxSizing: 'border-box',
                }}
              >
                <FileSpreadsheet size={13} /> <span>Create with Data</span>
              </button>
              <button
                className="btn"
                onClick={handleDownloadBlankTemplate}
                title="Download XLSX Template"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  height: '34px',
                  minHeight: '34px',
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxSizing: 'border-box',
                }}
              >
                <Download size={13} /> <span>Download XLSX Template</span>
              </button>
            </div>

            <div
              className="btn-separator"
              style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }}
            />

            <div className="btn-group" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="btn"
                onClick={() => onNavigate?.('cards')}
                title="Tables"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  height: '34px',
                  minHeight: '34px',
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxSizing: 'border-box',
                }}
              >
                <ShieldCheck size={13} /> <span>Tables</span>
              </button>
              <button
                className="btn"
                title="Table Setting"
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: '1px solid #2563eb',
                  height: '34px',
                  minHeight: '34px',
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxSizing: 'border-box',
                }}
              >
                <Settings size={13} /> <span>Table Setting</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── TABLE CONTAINER ── */}
      <div
        id="gs-table-container"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
      >
        <div
          className="table-wrapper"
          style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}
        >
          {paged.length === 0 && !loading ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.12)',
                  border: '1px solid #bfdbfe',
                  marginBottom: '12px',
                }}
              >
                <SlidersHorizontal size={30} />
              </div>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                No Table Settings Found
              </h4>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                {search ? `No tables match "${search}"` : 'No table settings configured yet.'}
              </p>
              {!search && (
                <button
                  onClick={() => {
                    setEditingTable(null);
                    setShowAddEditDrawer(true);
                  }}
                  className="btn btn-primary btn-sm"
                  style={{
                    marginTop: '14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    padding: '7px 16px',
                    borderRadius: '5px',
                  }}
                >
                  <Plus size={14} /> Add First Table Setting
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '42px', textAlign: 'center' }}>S. NO.</th>
                  <th style={{ width: '200px', textAlign: 'left' }}>TABLE NAME</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>TABLE TYPE</th>
                  <th style={{ width: '190px', textAlign: 'left' }}>ORGANISATION</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>SCHEMA FIELDS</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>STATUS</th>
                  <th style={{ width: '115px', textAlign: 'center' }}>CREATED AT</th>
                  <th style={{ width: '115px', textAlign: 'center' }}>UPDATED AT</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 12 }).map((_, i) => (
                      <tr key={i} className="skeleton-row">
                        <td style={{ textAlign: 'center' }}>
                          <div
                            className="skeleton"
                            style={{ width: '16px', height: '16px', borderRadius: '3px', margin: '0 auto' }}
                          />
                        </td>
                        <td>
                          <div className="skeleton" style={{ height: '13px', width: `${60 + (i % 4) * 8}%` }} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div
                            className="skeleton"
                            style={{ height: '20px', width: '90px', margin: '0 auto', borderRadius: '10px' }}
                          />
                        </td>
                        <td>
                          <div className="skeleton" style={{ height: '13px', width: `${55 + (i % 3) * 10}%` }} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="skeleton" style={{ height: '13px', width: '60%', margin: '0 auto' }} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="skeleton skeleton-cell-badge" style={{ margin: '0 auto' }} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="skeleton skeleton-cell-date" style={{ margin: '0 auto' }} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="skeleton skeleton-cell-date" style={{ margin: '0 auto', width: '75%' }} />
                        </td>
                      </tr>
                    ))
                  : filtered.map((t, idx) => {
                      const name = t.name || `Table ${idx + 1}`;
                      const rawClient = t.client_name || t.client?.name || '';
                      const clientName =
                        rawClient &&
                        !['Default Organisation', 'Organisation', 'Primary Organisation', '—'].includes(
                          rawClient.trim()
                        )
                          ? rawClient.trim()
                          : clientOrg || 'Mathura Das School of Execellence';
                      const isActive = t.is_active !== false;
                      const isSel = t.id === selected;
                      const fieldList =
                        Array.isArray(t.fields) && t.fields.length > 0 ? t.fields : DEFAULT_SCHEMA_FIELDS;
                      const requiredCount = fieldList.filter((f) => f.mandatory || f.is_required).length;
                      const typeMeta = getTableTypeMeta(t.table_type || 'custom');
                      const TypeIcon = typeMeta.icon;

                      return (
                        <tr
                          key={t.id || idx}
                          onClick={() => setSelected((prev) => (prev === t.id ? null : t.id))}
                          className={`table-row${isSel ? ' selected' : ''}`}
                          style={{ cursor: 'pointer' }}
                        >
                          <td
                            className="text-center"
                            style={{ width: '42px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}
                          >
                            {idx + 1}
                          </td>
                          <td style={{ fontWeight: 600, color: isSel ? '#1d4ed8' : '#0f172a' }}>{name}</td>
                          <td className="text-center" style={{ width: '130px', textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: typeMeta.bg,
                                color: typeMeta.color,
                                border: `1px solid ${typeMeta.border}`,
                              }}
                            >
                              {typeMeta.label}
                            </span>
                          </td>
                          <td style={{ fontSize: '13px', color: '#475569' }}>{clientName}</td>
                          <td className="text-center" style={{ width: '140px', textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: '#f1f5f9',
                                color: '#334155',
                                border: '1px solid #cbd5e1',
                              }}
                            >
                              <span>
                                {fieldList.length} Fields ({requiredCount} Required)
                              </span>
                            </span>
                          </td>
                          <td className="text-center" style={{ width: '80px', textAlign: 'center' }}>
                            <span className={`badge ${isActive ? 'badge-success' : 'badge-neutral'}`}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td
                            className="text-center"
                            style={{ width: '115px', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}
                          >
                            {formatDate(t.created_at)}
                          </td>
                          <td
                            className="text-center"
                            style={{ width: '115px', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}
                          >
                            {formatDate(t.updated_at)}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── BACKDROP ── */}
      {(showAddEditDrawer || showExcelDrawer) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 999,
            animation: 'fadeIn 0.15s ease-out',
          }}
        />
      )}


      {/* ── CREATE / EDIT DRAWER ── */}
      {showAddEditDrawer && (
        <TableDrawerForm
          editingTable={editingTable}
          groupId={groupId}
          orgName={clientOrg}
          onClose={() => setShowAddEditDrawer(false)}
          onSave={() => {
            setShowAddEditDrawer(false);
            load();
          }}
          onDeleteTable={(tbl) => {
            setShowAddEditDrawer(false);
            setTableToDelete(tbl);
            setTableDeleteCode(String(Math.floor(1000 + Math.random() * 9000)));
          }}
          addToast={addToast}
        />
      )}

      {/* ── CREATE WITH XLSX MODAL ── */}
      {showExcelDrawer && (
        <CreateXlsxModal
          groupId={groupId}
          onClose={() => setShowExcelDrawer(false)}
          onSuccess={() => {
            setShowExcelDrawer(false);
            load();
          }}
          addToast={addToast}
        />
      )}

      {/* ── Table Deletion Confirmation Modal with PIN ── */}
      <ConfirmDeleteModal
        isOpen={Boolean(tableToDelete)}
        onClose={() => setTableToDelete(null)}
        title={`Delete Table "${tableToDelete?.name || ''}"`}
        itemDescription={`table "${tableToDelete?.name || ''}" and all its ID cards`}
        requiresCode={true}
        deleteCode={tableDeleteCode}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={async () => {
          if (!tableToDelete) return;
          try {
            await schemaApi.deleteTable(tableToDelete.id);
            addToast?.(`Table "${tableToDelete.name}" deleted successfully`, 'success');
            if (selected === tableToDelete.id) setSelected(null);
            setTableToDelete(null);
            load();
          } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Error deleting table';
            addToast?.(msg, 'error');
          }
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TABLE DRAWER FORM — Create New Table / Edit Table
   ═══════════════════════════════════════════════════════════════════════════ */
export function TableDrawerForm({ editingTable, groupId, orgName, onClose, onSave, onDeleteTable, addToast }) {
  const isEditing = Boolean(editingTable);

  const [tableName, setTableName] = useState(editingTable?.name || '');
  const [tableType, setTableType] = useState(editingTable?.table_type || 'custom');
  const [typeAuto, setTypeAuto] = useState(false); // was this auto-detected?
  const [fields, setFields] = useState(() => {
    return (editingTable?.fields || []).map((f, i) => {
      const rawType = (f.type || 'text').toLowerCase();
      const rawSubtype = (f.subtype || '').toLowerCase();

      let type = 'text';
      let subtype = 'standard';
      let customSubtype = '';

      if (['photo', 'image'].includes(rawType)) {
        type = 'photo';
        subtype = '';
      } else if (['rel_photo', 'mother_photo', 'father_photo'].includes(rawType)) {
        type = 'rel_photo';
        subtype = '';
      } else if (['signature', 'sign'].includes(rawType)) {
        type = 'signature';
        subtype = '';
      } else if (['barcode'].includes(rawType)) {
        type = 'barcode';
        subtype = '';
      } else if (['qr_code', 'qrcode'].includes(rawType)) {
        type = 'qr_code';
        subtype = '';
      } else {
        type = 'text';
        const knownSubtypes = ['class', 'section', 'course', 'branch', 'department', 'designation', 'standard'];
        if (knownSubtypes.includes(rawSubtype)) {
          subtype = rawSubtype;
        } else if (rawSubtype) {
          subtype = 'custom';
          customSubtype = rawSubtype;
        } else if (['class', 'section', 'course', 'branch', 'department', 'designation'].includes(rawType)) {
          subtype = rawType;
        } else {
          const inferred = inferFieldTypeAndSubtype(f.name || f.original_name || '');
          if (inferred.type === 'text' && inferred.subtype !== 'standard') {
            subtype = inferred.subtype;
          } else {
            subtype = 'standard';
          }
        }
      }

      return {
        ...f,
        id: f.id || `f_${i}`,
        original_name: f.name || f.original_name || '',
        type,
        subtype,
        customSubtype,
        mandatory: Boolean(f.mandatory),
        is_unique: Boolean(f.is_unique || f.unique),
        options: Array.isArray(f.options)
          ? f.options
          : typeof f.options === 'string' && f.options
            ? f.options.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        format_preset: f.format_preset || '',
        show_path: Boolean(f.show_path),
        code_mode: f.code_mode || (f.code_config?.mode) || (f.static_value ? 'static' : (f.source_column ? 'column' : '')),
        source_column: f.source_column || (f.code_config?.source_column) || '',
        static_value: f.static_value || (f.code_config?.static_value) || '',
        code_prefix: f.code_prefix || (f.code_config?.prefix) || '',
        code_suffix: f.code_suffix || (f.code_config?.suffix) || '',
        code_config: f.code_config || null,
      };
    });
  });
  const [saving, setSaving] = useState(false);
  const [formatModalField, setFormatModalField] = useState(null);
  const [codeConfigModalField, setCodeConfigModalField] = useState(null);
  const [fieldToDelete, setFieldToDelete] = useState(null);
  const [fieldDeleteCode, setFieldDeleteCode] = useState('');
  const [drawerTableToDelete, setDrawerTableToDelete] = useState(null);
  const [drawerTableDeleteCode, setDrawerTableDeleteCode] = useState('');
  const [tableIsActive, setTableIsActive] = useState(editingTable?.is_active !== false);
  const [showStatusConfirmModal, setShowStatusConfirmModal] = useState(false);
  const [statusToggling, setStatusToggling] = useState(false);

  useEffect(() => {
    setTableIsActive(editingTable?.is_active !== false);
  }, [editingTable]);

  /* New-field form state */
  const [newName, setNewName] = useState('');
  const [newUnifiedType, setNewUnifiedType] = useState('text');
  const [typeAutoField, setTypeAutoField] = useState(false);

  /* Master toggle: all mandatory */
  const allMandatory = fields.length > 0 && fields.every((f) => Boolean(f.mandatory));
  const handleToggleAllMandatory = () => {
    const nextVal = !allMandatory;
    setFields((prev) => prev.map((f) => ({ ...f, mandatory: nextVal })));
  };

  /* Drag-and-drop state */
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  /* ── Auto-detect table type as user types name or adds fields ── */
  useEffect(() => {
    if (isEditing) return; // don't auto-override in edit mode
    if (!tableName.trim() && fields.length === 0) {
      setTypeAuto(false);
      return;
    }
    const detected = inferTableType(tableName, orgName, fields);
    if (detected !== 'custom') {
      setTableType(detected);
      setTypeAuto(true);
    } else {
      setTypeAuto(false);
    }
  }, [tableName, orgName, fields, isEditing]);

  /* ── Auto-detect field type as user types field name ── */
  const handleNewNameChange = (val) => {
    setNewName(val);
    const detected = inferFieldTypeAndSubtype(val);
    const unified = getFieldUnifiedType(detected);
    setNewUnifiedType(unified);
    setTypeAutoField(val.trim().length > 2);
  };

  /* ── Add field ── */
  const handleAddField = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const mapped = mapUnifiedTypeToField(newUnifiedType);
    const field = {
      id: `f_${Date.now()}`,
      name: newName.trim().toUpperCase(),
      type: mapped.type,
      subtype: mapped.subtype,
      mandatory: false,
      is_unique: false,
      options: [],
      format_preset: '',
      show_path: mapped.show_path,
    };
    setFields((prev) => [...prev, field]);
    setNewName('');
    setNewUnifiedType('text');
    setTypeAutoField(false);
    addToast?.(`Field "${field.name}" added`, 'success');
  };

  /* ── Field mutations ── */
  const setFieldProp = (id, key, val) => setFields((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: val } : f)));

  const handleFieldNameChange = (id, val) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name: val } : f))
    );
  };

  const handleRowUnifiedTypeChange = (id, newUnifiedVal) => {
    const mapped = mapUnifiedTypeToField(newUnifiedVal);
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        return {
          ...f,
          type: mapped.type,
          subtype: mapped.subtype,
          show_path: mapped.show_path,
        };
      })
    );
  };

  const handleDeleteField = (id) => setFields((prev) => prev.filter((f) => f.id !== id));

  /* ── Drag & Drop Reorder ── */
  const onDragStart = (e, idx) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(idx);
  };
  const onDrop = (e, idx) => {
    e.preventDefault();
    setDragOver(null);
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const copy = [...fields];
    const [moved] = copy.splice(dragIdx.current, 1);
    copy.splice(idx, 0, moved);
    dragIdx.current = null;
    setFields(copy);
  };
  const onDragEnd = () => {
    dragIdx.current = null;
    setDragOver(null);
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!tableName.trim()) {
      addToast?.('Table Name is required', 'warning');
      return;
    }
    if (fields.length === 0) {
      addToast?.('Add at least one field', 'warning');
      return;
    }

    const payload = {
      name: tableName.trim().toUpperCase(),
      // Table type cannot change once created
      table_type: isEditing ? (editingTable.table_type || tableType) : tableType,
      fields: fields.map((f, i) => {
        let finalType = f.type || 'text';
        let finalSubtype = f.subtype || '';
        if (finalType === 'text' && !finalSubtype) {
          finalSubtype = 'standard';
        }
        return {
          name: f.name,
          old_name: f.original_name ? f.original_name.trim().toUpperCase() : undefined,
          type: finalType,
          subtype: finalSubtype,
          order: i,
          mandatory: Boolean(f.mandatory),
          is_unique: Boolean(f.is_unique),
          options: Array.isArray(f.options) ? f.options : [],
          format_preset: f.format_preset || '',
          show_path: Boolean(f.show_path),
        };
      }),
    };

    setSaving(true);
    try {
      if (isEditing) {
        await schemaApi.updateTable(editingTable.id, payload);
        addToast?.(`Table "${payload.name}" updated successfully!`, 'success');
      } else {
        if (groupId) {
          await schemaApi.createTable(groupId, payload);
        } else {
          await schemaApi.createSchema(payload);
        }
        addToast?.(`Table "${payload.name}" created successfully!`, 'success');
      }
      onSave();
    } catch (err) {
      console.error('Save table error:', err);
      addToast?.(err?.response?.data?.message || err?.message || 'Error saving table', 'error');
    } finally {
      setSaving(false);
    }
  };

  const typeMeta = getTableTypeMeta(tableType);

  const TypeIcon = typeMeta.icon;

  return createPortal(
    <>
      <div className="drawer-overlay-backdrop" />
      <aside
        className="side-drawer-panel table-drawer"
        style={{ width: '780px', maxWidth: '96vw', padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div
          style={{
            background: '#2563eb',
            color: '#fff',
            height: '48px',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
            <Edit3 size={17} />
            <span>{isEditing ? 'Edit Table' : 'Create New Table'}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
          {/* ── SECTION 1: TABLE DETAILS ── */}
          <Section icon={<Edit3 size={15} />} title="Table Details">
            {/* Table Name */}
            <div>
              <label style={labelStyle}>
                Table Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="Enter table name (e.g., Class 10 Students)"
                style={inputStyle}
              />
            </div>

            {/* Table Type — with auto-detection indicator and lock on edit */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  Table Type
                  
                </label>
                {isEditing && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                    }}
                    title="Table type is set upon creation and cannot be changed later"
                  >
                    <Lock size={11} /> Locked (Set once on creation)
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {TABLE_TYPES.map((t) => {
                  const TIcon = t.icon;
                  const sel = tableType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      disabled={isEditing}
                      onClick={() => {
                        if (isEditing) return;
                        setTableType(t.value);
                        setTypeAuto(false);
                      }}
                      title={
                        isEditing
                          ? sel
                            ? `${t.label} (Locked on creation)`
                            : 'Table type cannot be changed after creation'
                          : t.label
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        height: '34px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: sel ? `1px solid ${t.color}` : '1px solid #d1d5db',
                        background: sel ? t.bg : '#ffffff',
                        color: sel ? t.color : '#4b5563',
                        fontWeight: sel ? 700 : 500,
                        fontSize: '13px',
                        cursor: isEditing ? 'not-allowed' : 'pointer',
                        opacity: isEditing ? (sel ? 1 : 0.45) : 1,
                        transition: 'all 0.15s',
                        boxShadow: sel ? `0 1px 3px ${t.border}` : 'none',
                      }}
                    >
                      <TIcon size={14} style={{ color: sel ? t.color : '#6b7280', flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.label}
                      </span>
                      {isEditing && sel && (
                        <Lock size={10} style={{ color: t.color, flexShrink: 0, marginLeft: '2px' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Table Status & Lifecycle (Edit Mode) */}
            {isEditing && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px 14px',
                  borderRadius: '6px',
                  background: tableIsActive ? '#f0fdf4' : '#fffbeb',
                  border: tableIsActive ? '1px solid #bbf7d0' : '1px solid #fde68a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      background: tableIsActive ? '#dcfce7' : '#fee2e2',
                      color: tableIsActive ? '#15803d' : '#b91c1c',
                      border: tableIsActive ? '1px solid #86efac' : '1px solid #fca5a5',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: tableIsActive ? '#16a34a' : '#dc2626',
                      }}
                    />
                    {tableIsActive ? 'Active' : 'Inactive'}
                  </span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                      Table Status: {tableIsActive ? 'Active and Available' : 'Inactive / Suspended'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                      {tableIsActive
                        ? 'This table is active and accessible for ID card entry and printing.'
                        : 'This table is inactive. It is safely hidden from standard card printing.'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowStatusConfirmModal(true)}
                  disabled={statusToggling}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0 12px',
                    height: '30px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: tableIsActive ? '#fff1f2' : '#ecfdf5',
                    color: tableIsActive ? '#e11d48' : '#047857',
                    border: tableIsActive ? '1px solid #fecdd3' : '1px solid #a7f3d0',
                    cursor: statusToggling ? 'wait' : 'pointer',
                    boxSizing: 'border-box',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = tableIsActive ? '#ffe4e6' : '#d1fae5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = tableIsActive ? '#fff1f2' : '#ecfdf5';
                  }}
                >
                  <Power size={13} />
                  <span>{tableIsActive ? 'Deactivate Table' : 'Activate Table'}</span>
                </button>
              </div>
            )}
          </Section>

          {/* ── SECTION 2: ADD NEW FIELD ── */}
          <Section icon={<PlusCircle size={15} />} title="Add New Field">
            <form onSubmit={handleAddField} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 160px auto',
                  gap: '10px',
                  alignItems: 'end',
                }}
              >
                {/* Field Name — with auto-detect type */}
                <div>
                  <label style={labelStyle}>Field Name</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      value={newName}
                      onChange={(e) => handleNewNameChange(e.target.value)}
                      placeholder="e.g., Student Name, Photo, Class, Roll No…"
                      style={inputStyle}
                    />
                    
                  </div>
                </div>

                {/* Field Type */}
                <div>
                  <label style={labelStyle}>Field Type</label>
                  <CustomSelect
                    value={newUnifiedType}
                    onChange={(val) => {
                      setNewUnifiedType(val);
                      setTypeAutoField(false);
                    }}
                    options={UNIFIED_FIELD_TYPES}
                    height="32px"
                  />
                </div>

                {/* Add Field Button */}
                <div>
                  <button
                    type="submit"
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0 16px',
                      height: '32px',
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            </form>
          </Section>

          {/* ── SECTION 3: TABLE FIELDS LIST ── */}
          <Section
            icon={<List size={15} />}
            title="Table Fields"
            action={
              fields.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleAllMandatory}
                  title={allMandatory ? 'Make all fields optional' : 'Make all fields mandatory'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(255,255,255,0.16)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '4px',
                    padding: '3px 10px 3px 12px',
                    cursor: 'pointer',
                    color: '#ffffff',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.16)')}
                >
                  <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em', userSelect: 'none' }}>
                    All Mandatory
                  </span>
                  <div
                    style={{
                      width: '32px',
                      height: '18px',
                      borderRadius: '9px',
                      background: allMandatory ? '#22c55e' : 'rgba(255,255,255,0.35)',
                      position: 'relative',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '2px',
                        left: allMandatory ? '16px' : '2px',
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        background: '#ffffff',
                        transition: 'left 0.15s ease',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                      }}
                    />
                  </div>
                </button>
              )
            }
          >
            <div
              style={{
                fontSize: '12px',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginBottom: '8px',
              }}
            >
              <GripVertical size={12} style={{ color: '#9ca3af' }} />
              <span>Drag rows to reorder • Toggle switch = Mandatory field</span>
            </div>

            {fields.length === 0 ? (
              <div
                style={{
                  border: '2px dashed #e2e8f0',
                  borderRadius: '8px',
                  padding: '24px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '13px',
                }}
              >
                <Info size={16} style={{ color: '#3b82f6', marginBottom: '6px' }} />
                <p style={{ margin: 0 }}>No fields added yet. Use the form above to add fields.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {fields.map((f, idx) => {
                  const unifiedType = getFieldUnifiedType(f);
                  const isPhoto = ['photo', 'rel_photo', 'signature'].includes(f.type) || ['photo', 'rel_photo', 'signature'].includes(unifiedType);
                  const isDropdown = isDropdownField(f) || ['class', 'section', 'course', 'branch', 'department', 'designation'].includes(unifiedType);
                  const isBarcode = ['barcode'].includes(f.type) || unifiedType === 'barcode' || String(f.name || '').toLowerCase().includes('barcode');
                  const isQrCode = ['qr_code', 'qrcode', 'qr'].includes(f.type) || unifiedType === 'qr_code' || /\bqr[\s_-]?code?\b/i.test(f.name);
                  const isCodeField = isBarcode || isQrCode;
                  const hasCodeConfig = Boolean(f.code_mode === 'static' ? f.static_value : f.source_column);
                  const isDragTarget = dragOver === idx;
                  const hasCustomOptions = Array.isArray(f.options) && f.options.length > 0;
                  const hasPreset = Boolean(f.format_preset && FORMAT_PRESETS[f.format_preset]);

                  return (
                    <div
                      key={f.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDrop={(e) => onDrop(e, idx)}
                      onDragEnd={onDragEnd}
                      style={{
                        background: '#fff',
                        border: `1px solid ${isDragTarget ? '#2563eb' : '#e2e8f0'}`,
                        borderLeft: `3px solid ${f.mandatory ? '#ef4444' : '#2563eb'}`,
                        borderRadius: '6px',
                        padding: '7px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: isDragTarget ? '0 4px 12px rgba(37,99,235,0.15)' : '0 1px 3px rgba(0,0,0,0.03)',
                        transform: isDragTarget ? 'scale(1.01)' : 'none',
                        transition: 'all 0.12s',
                        cursor: 'grab',
                        opacity: dragIdx.current === idx ? 0.5 : 1,
                      }}
                    >
                      {/* Drag grip */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', flexShrink: 0 }}
                      >
                        <GripVertical size={14} />
                      </div>

                      {/* Field Name Input — with Path Checkbox or Options Button inside on the right if applicable */}
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          background: '#fff',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          padding: '0 5px 0 10px',
                          boxSizing: 'border-box',
                          transition: 'border-color 0.15s',
                        }}
                        onFocusCapture={(e) => {
                          e.currentTarget.style.borderColor = '#2563eb';
                        }}
                        onBlurCapture={(e) => {
                          e.currentTarget.style.borderColor = '#d1d5db';
                        }}
                      >
                        <input
                          value={f.name}
                          onChange={(e) => handleFieldNameChange(f.id, e.target.value)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            height: '100%',
                            border: 'none',
                            outline: 'none',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#111827',
                            background: 'transparent',
                            padding: 0,
                            margin: 0,
                            cursor: 'text',
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                        {isPhoto && (
                          <label
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                              flexShrink: 0,
                              marginLeft: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: f.show_path ? '#6d28d9' : '#64748b',
                              cursor: 'pointer',
                              userSelect: 'none',
                              background: f.show_path ? '#f5f3ff' : '#f8fafc',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              border: `1px solid ${f.show_path ? '#c4b5fd' : '#cbd5e1'}`,
                              height: '22px',
                              boxSizing: 'border-box',
                            }}
                            title="Include image file path in exports"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(f.show_path)}
                              onChange={(e) => setFieldProp(f.id, 'show_path', e.target.checked)}
                              style={{ width: '12px', height: '12px', cursor: 'pointer', accentColor: '#7c3aed' }}
                            />
                            <span>Path</span>
                          </label>
                        )}
                        {isDropdown && (
                          <button
                            type="button"
                            onClick={() => setFormatModalField(f)}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                              flexShrink: 0,
                              marginLeft: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: (hasPreset || hasCustomOptions) ? '#3730a3' : '#4338ca',
                              background: (hasPreset || hasCustomOptions) ? '#e0e7ff' : '#eef2ff',
                              border: `1px solid ${(hasPreset || hasCustomOptions) ? '#a5b4fc' : '#c7d2fe'}`,
                              padding: '2px 8px',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              height: '22px',
                              lineHeight: '18px',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box',
                            }}
                            title="Configure format presets or custom dropdown options"
                          >
                            <SlidersHorizontal size={11} style={{ color: '#4f46e5' }} />
                            <span>
                              {hasPreset
                                ? FORMAT_PRESETS[f.format_preset].label.split(' ')[0]
                                : hasCustomOptions
                                  ? `${f.options.length} Opts`
                                  : 'Options'}
                            </span>
                          </button>
                        )}
                        {isCodeField && (
                          <button
                            type="button"
                            onClick={() => setCodeConfigModalField(f)}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                              flexShrink: 0,
                              marginLeft: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: hasCodeConfig ? '#065f46' : '#047857',
                              background: hasCodeConfig ? '#d1fae5' : '#ecfdf5',
                              border: `1px solid ${hasCodeConfig ? '#6ee7b7' : '#a7f3d0'}`,
                              padding: '2px 8px',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              height: '22px',
                              lineHeight: '18px',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box',
                            }}
                            title="Configure dynamic column or static link generation for code"
                          >
                            <SlidersHorizontal size={11} style={{ color: '#059669' }} />
                            <span>
                              {hasCodeConfig
                                ? f.code_mode === 'static'
                                  ? 'Static Link'
                                  : `Col: ${f.source_column}`
                                : 'Options'}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Field Type (Unified Dropdown) */}
                      <div style={{ width: '140px', flexShrink: 0 }} onMouseDown={(e) => e.stopPropagation()}>
                        <CustomSelect
                          value={unifiedType}
                          onChange={(val) => handleRowUnifiedTypeChange(f.id, val)}
                          options={UNIFIED_FIELD_TYPES}
                          height="32px"
                        />
                      </div>

                      {/* Single Mandatory Toggle — ON = Mandatory (Primary Blue), OFF = Optional (Neutral Gray) */}
                      <button
                        type="button"
                        onClick={() => setFieldProp(f.id, 'mandatory', !f.mandatory)}
                        title={
                          f.mandatory ? 'Mandatory (Required field) — click to make optional' : 'Optional field — click to make mandatory'
                        }
                        style={{
                          width: '34px',
                          height: '18px',
                          borderRadius: '9px',
                          background: f.mandatory ? '#2563eb' : '#cbd5e1',
                          border: 'none',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background 0.15s',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: '2px',
                            left: f.mandatory ? '18px' : '2px',
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            background: '#fff',
                            transition: 'left 0.15s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                          }}
                        />
                      </button>

                      {/* Delete button in a box */}
                      <button
                        type="button"
                        onClick={() => {
                          setFieldToDelete(f);
                          setFieldDeleteCode(String(Math.floor(1000 + Math.random() * 9000)));
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          border: '1px solid #fee2e2',
                          background: '#fef2f2',
                          color: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#fee2e2';
                          e.currentTarget.style.borderColor = '#fca5a5';
                          e.currentTarget.style.color = '#dc2626';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#fef2f2';
                          e.currentTarget.style.borderColor = '#fee2e2';
                          e.currentTarget.style.color = '#ef4444';
                        }}
                        title="Delete field"
                      >
                        <X size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Danger Zone: Permanent Deletion */}
          {isEditing && (
            <div
              style={{
                marginTop: '20px',
                padding: '16px',
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9f1239', fontWeight: 700, fontSize: '13px' }}>
                <AlertTriangle size={16} style={{ color: '#e11d48' }} /> Danger Zone — Permanent Deletion
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#881337', lineHeight: '1.45' }}>
                Deleting this table will permanently remove all associated ID cards, fields, and records. This action is irreversible and requires Master PIN authorization.
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteTable) {
                      onDeleteTable(editingTable);
                    } else {
                      setDrawerTableToDelete(editingTable);
                      setDrawerTableDeleteCode(String(Math.floor(1000 + Math.random() * 9000)));
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '30px', padding: '0 12px', background: '#e11d48', color: '#ffffff', border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#be123c')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#e11d48')}
                >
                  <Trash2 size={13} /> Delete Table
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #334155',
            background: '#1e293b',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: '32px', padding: '0 16px', borderRadius: '6px', border: '1px solid #475569', background: '#334155', color: '#fff', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              style={{
                ...saveBtnStyle,
                opacity: saving ? 0.7 : 1,
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              {saving ? (
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              ) : isEditing ? (
                <Check size={14} />
              ) : (
                <Plus size={14} />
              )}
              <span>{saving ? 'Saving…' : isEditing ? 'Update Table' : 'Create Table'}</span>
            </button>
          </div>
        </div>
      </aside>


      {/* Format Preset / Dropdown Options Configuration Modal */}
      {formatModalField && (
        <FormatPresetConfigModal
          field={formatModalField}
          onClose={() => setFormatModalField(null)}
          onSave={({ format_preset, options }) => {
            setFieldProp(formatModalField.id, 'format_preset', format_preset);
            setFieldProp(formatModalField.id, 'options', options);
          }}
        />
      )}

      {/* QR Code / Barcode Configuration Modal */}
      {codeConfigModalField && (
        <CodeConfigModal
          field={codeConfigModalField}
          allFields={fields}
          onClose={() => setCodeConfigModalField(null)}
          onSave={(codeConfig) => {
            setFields((prev) =>
              prev.map((f) =>
                f.id === codeConfigModalField.id
                  ? {
                      ...f,
                      code_mode: codeConfig.code_mode,
                      source_column: codeConfig.source_column,
                      static_value: codeConfig.static_value,
                      code_prefix: codeConfig.code_prefix,
                      code_suffix: codeConfig.code_suffix,
                      code_config: codeConfig.code_config,
                    }
                  : f
              )
            );
          }}
        />
      )}

      {/* Table Status confirmation modal */}
      <ConfirmDeleteModal
        isOpen={showStatusConfirmModal}
        onClose={() => setShowStatusConfirmModal(false)}
        title={tableIsActive ? `Deactivate Table "${tableName || editingTable?.name}"` : `Activate Table "${tableName || editingTable?.name}"`}
        headline={tableIsActive ? 'Deactivate Table' : 'Activate Table'}
        itemDescription={`table "${tableName || editingTable?.name}"`}
        customMessage={
          tableIsActive
            ? `Are you sure you want to deactivate table "${tableName || editingTable?.name}"? While inactive, this table will be suspended from card printing, batch processing, and scanning workflows until reactivated.`
            : `Are you sure you want to activate table "${tableName || editingTable?.name}"? This table will become fully accessible for card entry, data collection, and printing.`
        }
        note={tableIsActive ? 'Note: You can safely reactivate this table anytime from this edit drawer.' : 'Note: All existing cards and table configurations are preserved.'}
        requiresCode={false}
        confirmText={tableIsActive ? 'Deactivate Table' : 'Activate Table'}
        confirmVariant={tableIsActive ? 'danger' : 'success'}
        icon={<Power size={24} style={{ color: tableIsActive ? '#e11d48' : '#16a34a' }} />}
        onConfirm={async () => {
          if (!editingTable?.id) return;
          try {
            setStatusToggling(true);
            await schemaApi.toggleTableStatus(editingTable.id);
            const nextState = !tableIsActive;
            setTableIsActive(nextState);
            addToast?.(`Table "${tableName || editingTable.name}" is now ${nextState ? 'Active' : 'Inactive'}`, 'success');
            onSave?.();
          } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Error updating table status';
            addToast?.(msg, 'error');
          } finally {
            setStatusToggling(false);
            setShowStatusConfirmModal(false);
          }
        }}
      />

      {/* Field deletion confirmation modal with PIN */}
      <ConfirmDeleteModal
        isOpen={Boolean(fieldToDelete)}
        onClose={() => setFieldToDelete(null)}
        title={`Delete Column "${fieldToDelete?.name || ''}"`}
        headline={`Delete Column "${fieldToDelete?.name || ''}"`}
        itemDescription={`column "${fieldToDelete?.name || ''}"`}
        requiresCode={true}
        deleteCode={fieldDeleteCode}
        confirmText="Delete"
        confirmVariant="danger"
        customMessage={`Are you sure you want to delete column "${fieldToDelete?.name || ''}"? This will permanently delete the column and remove its data across all ID cards.`}
        note="Note: This action cannot be undone."
        onConfirm={() => {
          if (fieldToDelete) {
            handleDeleteField(fieldToDelete.id);
            addToast?.(`Field "${fieldToDelete.name}" removed`, 'info');
          }
          setFieldToDelete(null);
        }}
      />

      {/* Table deletion confirmation modal with PIN (fallback when opened standalone) */}
      <ConfirmDeleteModal
        isOpen={Boolean(drawerTableToDelete)}
        onClose={() => setDrawerTableToDelete(null)}
        title={`Delete Table "${drawerTableToDelete?.name || ''}"`}
        headline={`Delete Table "${drawerTableToDelete?.name || ''}"`}
        itemDescription={`table "${drawerTableToDelete?.name || ''}" and all its ID cards`}
        requiresCode={true}
        deleteCode={drawerTableDeleteCode}
        confirmText="Delete"
        confirmVariant="danger"
        customMessage={`Are you sure you want to permanently delete table "${drawerTableToDelete?.name || ''}" and all its ID cards?`}
        note="Note: This action cannot be undone."
        onConfirm={async () => {
          if (!drawerTableToDelete) return;
          try {
            await schemaApi.deleteTable(drawerTableToDelete.id);
            addToast?.(`Table "${drawerTableToDelete.name}" deleted successfully`, 'success');
            setDrawerTableToDelete(null);
            onClose?.();
            onSave?.();
          } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'Error deleting table';
            addToast?.(msg, 'error');
          }
        }}
      />
    </>,

    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CREATE WITH XLSX DRAWER
   ═══════════════════════════════════════════════════════════════════════════ */
export function CreateWithXlsxDrawer({ groupId, orgName, onClose, onSave, addToast }) {
  const [tableName, setTableName] = useState('');
  const [tableType, setTableType] = useState('custom');
  const [typeAuto, setTypeAuto] = useState(false);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [saving, setSaving] = useState(false);

  /* Auto-detect table type from name */
  useEffect(() => {
    if (!tableName.trim()) {
      setTypeAuto(false);
      return;
    }
    const detected = inferTableType(tableName, orgName);
    if (detected !== 'custom') {
      setTableType(detected);
      setTypeAuto(true);
    } else {
      setTypeAuto(false);
    }
  }, [tableName, orgName]);

  const handleFileSelect = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileName(f.name);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      if (firstSheetName) {
        const ws = wb.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const headers = (rows[0] || []).filter(Boolean).map(String);
        setParsedHeaders(headers);
        addToast?.(`Parsed ${headers.length} column headers from ${f.name}`, 'success');
      }
    } catch (parseErr) {
      console.warn('XLSX header parse warning:', parseErr);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tableName.trim()) {
      addToast?.('Table Name is required', 'warning');
      return;
    }
    if (!file) {
      addToast?.('Please select an Excel (.xlsx) file', 'warning');
      return;
    }
    if (!groupId) {
      addToast?.('Group ID not found. Please refresh.', 'error');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('table_name', tableName.trim().toUpperCase());
      formData.append('table_type', tableType);

      const res = await schemaApi.createTableFromXlsx(groupId, formData);
      if (res?.success === false) throw new Error(res.message || 'Create failed');
      addToast?.(`Table "${tableName}" created from XLSX! (${res.cards_created || 0} records imported)`, 'success');
      onSave();
    } catch (err) {
      addToast?.(err?.response?.data?.message || err?.message || 'Error creating table from XLSX', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '620px',
        minWidth: '580px',
        maxWidth: '95vw',
        background: '#fff',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#16a34a',
          color: '#fff',
          height: '48px',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '16px' }}>
          <FileSpreadsheet size={18} />
          <span>Create Table Setting with XLSX</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        {/* Info banner */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}
        >
          <FileSpreadsheet size={20} style={{ color: '#16a34a', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: '#14532d' }}>
              Upload Excel (.xlsx) Schema File
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#15803d', lineHeight: 1.5 }}>
              The first row of your Excel file will be parsed as field column headers. All data rows will be imported
              automatically.
            </p>
          </div>
        </div>

        {/* Table Name */}
        <div>
          <label style={labelStyle}>
            Table Name <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            required
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="e.g., Class 10 Students"
            style={inputStyle}
          />
        </div>

        {/* Table Type */}
        <div>
          <label style={labelStyle}>
            Table Type
            {typeAuto && (
              <span
                style={{
                  marginLeft: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '1px 7px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: '#fef9c3',
                  color: '#713f12',
                  border: '1px solid #fde68a',
                }}
              >
                <Sparkles size={9} /> Auto-detected
              </span>
            )}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '6px' }}>
            {TABLE_TYPES.map((t) => {
              const TIcon = t.icon;
              const sel = tableType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    setTableType(t.value);
                    setTypeAuto(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    height: '34px',
                    padding: '0 8px',
                    borderRadius: '6px',
                    border: sel ? `1px solid ${t.color}` : '1px solid #d1d5db',
                    background: sel ? t.bg : '#ffffff',
                    color: sel ? t.color : '#4b5563',
                    fontWeight: sel ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: sel ? `0 1px 3px ${t.border}` : 'none',
                  }}
                >
                  <TIcon size={14} style={{ color: sel ? t.color : '#6b7280', flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* File Upload */}
        <div>
          <label style={labelStyle}>
            Select Excel (.xlsx / .xls) File <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <div
            style={{
              border: '2px dashed #cbd5e1',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              background: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              id="xlsx-file-input"
              style={{ display: 'none' }}
            />
            <label
              htmlFor="xlsx-file-input"
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
            >
              <Upload size={28} style={{ color: '#16a34a' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                {fileName ? `✓ ${fileName}` : 'Drag & drop or click to browse'}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Supports .xlsx, .xls, .csv · Max 50 MB</span>
            </label>
          </div>
        </div>

        {/* Parsed headers preview */}
        {parsedHeaders.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <CheckCircle2 size={14} style={{ color: '#16a34a' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                Detected {parsedHeaders.length} column headers:
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {parsedHeaders.map((hdr) => (
                <span
                  key={hdr}
                  style={{
                    padding: '3px 9px',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#f0fdf4',
                    color: '#15803d',
                    border: '1px solid #bbf7d0',
                  }}
                >
                  {hdr}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button type="button" onClick={onClose} style={cancelBtnStyle}>
            <X size={14} /> Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{ ...saveBtnStyle, background: '#16a34a', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
            <span>{saving ? 'Creating…' : 'Create Table Setting'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Helpers ── */
function Section({ icon, title, badge, action, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div
        style={{
          background: '#2563eb',
          color: '#fff',
          borderRadius: '6px',
          padding: '9px 14px',
          fontSize: '14px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon} <span>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {badge && (
            <span
              style={{
                background: 'rgba(255,255,255,0.25)',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {badge}
            </span>
          )}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── Style constants ── */
const labelStyle = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '6px',
};
const inputStyle = {
  width: '100%',
  height: '32px',
  padding: '0 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-family)',
};
const cancelBtnStyle = {
  padding: '7px 16px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  background: '#f9fafb',
  color: '#374151',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
};
const saveBtnStyle = {
  height: '32px',
  padding: '0 16px',
  borderRadius: '6px',
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};
