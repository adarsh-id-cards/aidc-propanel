import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Snowflake,
  X,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { formatDisplayDateTime } from '../../../utils/formatters';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const padZero = (n) => String(n).padStart(2, '0');

const to24Hour = (hour12, minute, ampm) => {
  let h = parseInt(hour12, 10) || 12;
  const m = String(minute).padStart(2, '0');
  if (ampm === 'AM') {
    if (h === 12) h = 0;
  } else if (ampm === 'PM') {
    if (h !== 12) h += 12;
  }
  return `${padZero(h)}:${m}:00`;
};

const from24Hour = (timeStr, defaultHour = '09', defaultMinute = '00', defaultAmpm = 'AM') => {
  if (!timeStr) return { hour: defaultHour, minute: defaultMinute, ampm: defaultAmpm };
  const parts = String(timeStr).split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] ? String(parts[1]).padStart(2, '0') : defaultMinute;
  if (isNaN(h)) return { hour: defaultHour, minute: defaultMinute, ampm: defaultAmpm };
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return {
    hour: padZero(h),
    minute: m,
    ampm,
  };
};

const parseIso = (isoStr, defaultTime) => {
  if (!isoStr) return { date: '', time: defaultTime };
  if (isoStr.includes('T')) {
    const [d, t] = isoStr.split('T');
    return { date: d, time: t.substring(0, 5) };
  }
  if (isoStr.includes(' ')) {
    const [d, t] = isoStr.split(' ');
    return { date: d, time: t.substring(0, 5) };
  }
  return { date: isoStr, time: defaultTime };
};

const hours12 = Array.from({ length: 12 }, (_, i) => padZero(i + 1));
const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function FreezeTablePanel({
  tableId,
  status = 'approved',
  statusLabel = 'Approved',
  tableFreezeInfo = null,
  initialFreezeInfo = null,
  onFreezeApplied,
  onUnfrozen,
  addToast,
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [freezeData, setFreezeData] = useState(tableFreezeInfo || initialFreezeInfo);

  // Date and Time state
  const [tempFromDate, setTempFromDate] = useState('');
  const [tempToDate, setTempToDate] = useState('');

  const [fromHour, setFromHour] = useState('12');
  const [fromMinute, setFromMinute] = useState('00');
  const [fromAmpm, setFromAmpm] = useState('AM');

  const [toHour, setToHour] = useState('11');
  const [toMinute, setToMinute] = useState('59');
  const [toAmpm, setToAmpm] = useState('PM');

  // Calendar views
  const now = new Date();
  const [fromViewDate, setFromViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [toViewDate, setToViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const populateFields = useCallback((info) => {
    if (!info) return;
    const latestBulk = (info.bulk_movement_presets || [])[0];
    const sourceFrom = info.is_frozen ? (info.frozen_from || info.default_from) : (latestBulk?.from || info.default_from);
    const sourceTo = info.is_frozen ? (info.frozen_to || info.default_to) : (latestBulk?.to || info.default_to);

    const parsedFrom = parseIso(sourceFrom, '00:00');
    const parsedTo = parseIso(sourceTo, '23:59');

    setTempFromDate(parsedFrom.date || '');
    setTempToDate(parsedTo.date || '');

    const tFrom = from24Hour(parsedFrom.time, '12', '00', 'AM');
    setFromHour(tFrom.hour);
    setFromMinute(tFrom.minute);
    setFromAmpm(tFrom.ampm);

    const tTo = from24Hour(parsedTo.time, '11', '59', 'PM');
    setToHour(tTo.hour);
    setToMinute(tTo.minute);
    setToAmpm(tTo.ampm);

    if (parsedFrom.date) {
      const [y, m] = parsedFrom.date.split('-');
      setFromViewDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
    }
    if (parsedTo.date) {
      const [y, m] = parsedTo.date.split('-');
      setToViewDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
    }
  }, []);

  const fetchFreezeInfo = useCallback(async () => {
    if (!tableId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/table/${tableId}/freeze-info/?status=${status}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setFreezeData(data.data);
        populateFields(data.data);
      }
    } catch (err) {
      console.error('Failed to load freeze info:', err);
    } finally {
      setLoading(false);
    }
  }, [tableId, status, populateFields]);

  useEffect(() => {
    if (tableFreezeInfo) {
      setFreezeData(tableFreezeInfo);
      populateFields(tableFreezeInfo);
    } else {
      fetchFreezeInfo();
    }
  }, [tableFreezeInfo, fetchFreezeInfo, populateFields]);

  const isCurrentlyFrozen = Boolean(freezeData?.is_frozen);
  const bulkMovePresets = freezeData?.bulk_movement_presets || tableFreezeInfo?.bulk_movement_presets || [];

  const handleApplyBulkPreset = (preset) => {
    if (!preset) return;
    const parsedFrom = parseIso(preset.from, '00:00');
    const parsedTo = parseIso(preset.to, '23:59');

    setTempFromDate(parsedFrom.date || '');
    setTempToDate(parsedTo.date || '');

    const tFrom = from24Hour(parsedFrom.time, '12', '00', 'AM');
    setFromHour(tFrom.hour);
    setFromMinute(tFrom.minute);
    setFromAmpm(tFrom.ampm);

    const tTo = from24Hour(parsedTo.time, '11', '59', 'PM');
    setToHour(tTo.hour);
    setToMinute(tTo.minute);
    setToAmpm(tTo.ampm);

    if (parsedFrom.date) {
      const [y, m] = parsedFrom.date.split('-');
      setFromViewDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
    }
    if (parsedTo.date) {
      const [y, m] = parsedTo.date.split('-');
      setToViewDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
    }
  };

  const handlePresetAllCurrent = () => {
    if (freezeData?.default_from && freezeData?.default_to) {
      const parsedFrom = parseIso(freezeData.default_from, '00:00');
      const parsedTo = parseIso(freezeData.default_to, '23:59');
      setTempFromDate(parsedFrom.date);
      setTempToDate(parsedTo.date);
      const tFrom = from24Hour(parsedFrom.time, '12', '00', 'AM');
      setFromHour(tFrom.hour);
      setFromMinute(tFrom.minute);
      setFromAmpm(tFrom.ampm);
      const tTo = from24Hour(parsedTo.time, '11', '59', 'PM');
      setToHour(tTo.hour);
      setToMinute(tTo.minute);
      setToAmpm(tTo.ampm);
      if (parsedFrom.date) {
        const [y, m] = parsedFrom.date.split('-');
        setFromViewDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
      }
    }
  };

  const handlePresetToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setTempFromDate(today);
    setTempToDate(today);
    setFromHour('12');
    setFromMinute('00');
    setFromAmpm('AM');
    setToHour('11');
    setToMinute('59');
    setToAmpm('PM');
  };

  const handlePresetYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split('T')[0];
    setTempFromDate(yesterday);
    setTempToDate(yesterday);
    setFromHour('12');
    setFromMinute('00');
    setFromAmpm('AM');
    setToHour('11');
    setToMinute('59');
    setToAmpm('PM');
  };

  const handleApplyFreeze = async () => {
    if (!tempFromDate && !tempToDate) {
      addToast?.('Please select a date range to freeze', 'error');
      return;
    }

    const fDate = tempFromDate || tempToDate;
    const tDate = tempToDate || tempFromDate;

    const fromTimeStr = to24Hour(fromHour, fromMinute, fromAmpm);
    const toTimeStr = to24Hour(toHour, toMinute, toAmpm);

    const fromIso = `${fDate}T${fromTimeStr}`;
    const toIso = `${tDate}T${toTimeStr}`;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/table/${tableId}/freeze-table/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          status,
          frozen_from: fromIso,
          frozen_to: toIso,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast?.(`Table (${statusLabel}) frozen successfully`, 'success');
        setFreezeData(data.data);
        onFreezeApplied?.(data.data);
        onClose?.();
      } else {
        addToast?.(data.message || 'Failed to freeze table', 'error');
      }
    } catch (err) {
      console.error('Error freezing table:', err);
      addToast?.('Network error while freezing table', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnfreeze = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/table/${tableId}/unfreeze-table/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        addToast?.(`Table (${statusLabel}) unfrozen. New cards are now visible.`, 'success');
        setFreezeData(null);
        onUnfrozen?.();
        onClose?.();
      } else {
        addToast?.(data.message || 'Failed to unfreeze table', 'error');
      }
    } catch (err) {
      console.error('Error unfreezing table:', err);
      addToast?.('Network error while unfreezing table', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const renderCalendar = (viewDate, setViewDate, isFromCalendar) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const todayStr = new Date().toISOString().split('T')[0];

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

    return (
      <div style={{ flex: 1, minWidth: '220px', padding: '4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
          }}
        >
          <button
            type="button"
            onClick={prevMonth}
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              padding: '2px 5px',
              cursor: 'pointer',
              color: '#475569',
              transition: 'background-color 0.15s ease',
            }}
          >
            <ChevronLeft size={13} />
          </button>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
            {MONTHS[month]} {year}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              padding: '2px 5px',
              cursor: 'pointer',
              color: '#475569',
              transition: 'background-color 0.15s ease',
            }}
          >
            <ChevronRight size={13} />
          </button>
        </div>

        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: isFromCalendar ? '#0284c7' : '#0d9488',
            marginBottom: '4px',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: isFromCalendar ? '#e0f2fe' : '#ccfbf1',
            padding: '2px 0',
            borderRadius: '4px',
          }}
        >
          {isFromCalendar ? 'From Date' : 'To Date'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '3px' }}>
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#94a3b8',
                textAlign: 'center',
                padding: '2px 0',
              }}
            >
              {wd}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {Array.from({ length: firstDay }).map((_, idx) => (
            <div key={`blank-${idx}`} style={{ height: '24px' }} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const currentStr = `${year}-${padZero(month + 1)}-${padZero(day)}`;
            const isSelectedFrom = tempFromDate === currentStr;
            const isSelectedTo = tempToDate === currentStr;
            const isSelected = isSelectedFrom || isSelectedTo;
            const inRange =
              tempFromDate && tempToDate && currentStr > tempFromDate && currentStr < tempToDate;
            const isToday = currentStr === todayStr;

            let bg = 'transparent';
            let color = '#334155';
            let fontWeight = 500;
            let borderRadius = '3px';

            if (isSelected) {
              bg = isFromCalendar ? '#0284c7' : '#0d9488';
              color = '#ffffff';
              fontWeight = 700;
            } else if (inRange) {
              bg = '#e0f2fe';
              color = '#0369a1';
              borderRadius = '0';
            } else if (isToday) {
              bg = '#f1f5f9';
              color = '#0284c7';
              fontWeight = 700;
            }

            return (
              <button
                key={day}
                type="button"
                onClick={() => {
                  if (isFromCalendar) {
                    setTempFromDate(currentStr);
                    if (tempToDate && currentStr > tempToDate) {
                      setTempToDate(currentStr);
                    }
                  } else {
                    setTempToDate(currentStr);
                    if (tempFromDate && currentStr < tempFromDate) {
                      setTempFromDate(currentStr);
                    }
                  }
                }}
                style={{
                  height: '24px',
                  border: isToday && !isSelected ? '1px solid #7dd3fc' : 'none',
                  borderRadius,
                  background: bg,
                  color,
                  fontSize: '11px',
                  fontWeight,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.1s ease',
                  padding: 0,
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const presetBtnStyle = {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '2px 9px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    cursor: 'pointer',
    transition: 'background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease',
  };

  const renderTimeSelect = (val, setVal, options) => (
    <select
      value={val}
      onChange={(e) => setVal(e.target.value)}
      style={{
        padding: '3px 5px',
        borderRadius: '4px',
        border: '1px solid #cbd5e1',
        fontSize: '13px',
        fontWeight: 600,
        background: '#ffffff',
        color: '#1e293b',
        outline: 'none',
      }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );

  const ampmBtnStyle = (active) => ({
    padding: '3px 6px',
    fontSize: '11px',
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    background: active ? '#0284c7' : '#ffffff',
    color: active ? '#ffffff' : '#64748b',
    transition: 'background-color 0.12s ease',
  });

  return (
    <div
      style={{
        padding: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        backgroundColor: '#ffffff',
      }}
    >
      {/* Freeze Status Banner — only shown when table is actively frozen */}
      {isCurrentlyFrozen && (
        <div
          style={{
            padding: '10px 14px',
            background: '#f0f9ff',
            border: '1px solid #7dd3fc',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#0369a1',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <Snowflake size={16} style={{ color: '#0284c7', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Table Frozen ({statusLabel})</span>
              <span
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                }}
              >
                {freezeData?.cards_in_freeze ?? 0} cards
              </span>
              {freezeData?.frozen_by_name && (
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#0c4a6e' }}>
                  (Frozen by {freezeData.frozen_by_name})
                </span>
              )}
            </div>
            <div style={{ marginTop: '3px', fontSize: '12px', color: '#075985' }}>
              Boundary: <strong>{formatDisplayDateTime(freezeData?.frozen_from)}</strong> →{' '}
              <strong>{formatDisplayDateTime(freezeData?.frozen_to)}</strong>
              {freezeData?.total_unfrozen_cards > freezeData?.cards_in_freeze && (
                <span style={{ marginLeft: '6px', fontWeight: 600, color: '#0284c7' }}>
                  • {freezeData.total_unfrozen_cards - freezeData.cards_in_freeze} newer cards paused
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clean Presets Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingBottom: '10px',
          borderBottom: '1px solid #e2e8f0',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginRight: '4px' }}>
          PRESETS:
        </span>
        {bulkMovePresets.map((p, idx) => (
          <button
            key={p.id || idx}
            type="button"
            onClick={() => handleApplyBulkPreset(p)}
            style={{
              ...presetBtnStyle,
              background: idx === 0 ? '#eff6ff' : '#ffffff',
              color: idx === 0 ? '#1d4ed8' : '#334155',
              borderColor: idx === 0 ? '#93c5fd' : '#cbd5e1',
              fontWeight: 700,
            }}
            title={`Bulk movement of ${p.count} cards on ${formatDisplayDateTime(p.created_at || p.from)}`}
          >
            {p.label || `Last Bulk Move (${p.count})`}
          </button>
        ))}
        {freezeData?.default_from && freezeData?.default_to && (
          <button
            type="button"
            onClick={handlePresetAllCurrent}
            style={presetBtnStyle}
            title={`${formatDisplayDateTime(freezeData.default_from)} – ${formatDisplayDateTime(freezeData.default_to)}`}
          >
            Batch Range
          </button>
        )}
        <button
          type="button"
          onClick={handlePresetToday}
          style={presetBtnStyle}
        >
          Today
        </button>
        <button
          type="button"
          onClick={handlePresetYesterday}
          style={presetBtnStyle}
        >
          Yesterday
        </button>
      </div>

      {/* Dual Calendars Side-by-Side */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          border: '1px solid #f1f5f9',
          borderRadius: '6px',
          padding: '8px',
          background: '#fafafa',
        }}
      >
        {renderCalendar(fromViewDate, setFromViewDate, true)}
        <div style={{ width: '1px', background: '#e2e8f0', margin: '4px 0' }} />
        {renderCalendar(toViewDate, setToViewDate, false)}
      </div>

      {/* 12-Hour AM/PM Time Pickers */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* From Time */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', marginBottom: '3px' }}>
            From Time:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {renderTimeSelect(fromHour, setFromHour, hours12)}
            <span style={{ fontWeight: 700, color: '#94a3b8' }}>:</span>
            {renderTimeSelect(fromMinute, setFromMinute, minutes)}
            <div style={{ display: 'inline-flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid #cbd5e1', marginLeft: '4px' }}>
              <button
                type="button"
                onClick={() => setFromAmpm('AM')}
                style={ampmBtnStyle(fromAmpm === 'AM')}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setFromAmpm('PM')}
                style={ampmBtnStyle(fromAmpm === 'PM')}
              >
                PM
              </button>
            </div>
          </div>
        </div>

        {/* To Time */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#0d9488', marginBottom: '3px' }}>
            To Time:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {renderTimeSelect(toHour, setToHour, hours12)}
            <span style={{ fontWeight: 700, color: '#94a3b8' }}>:</span>
            {renderTimeSelect(toMinute, setToMinute, minutes)}
            <div style={{ display: 'inline-flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid #cbd5e1', marginLeft: '4px' }}>
              <button
                type="button"
                onClick={() => setToAmpm('AM')}
                style={ampmBtnStyle(toAmpm === 'AM')}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setToAmpm('PM')}
                style={ampmBtnStyle(toAmpm === 'PM')}
              >
                PM
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '12px',
        }}
      >
        <div>
          {isCurrentlyFrozen && (
            <button
              type="button"
              onClick={handleUnfreeze}
              disabled={submitting}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '4px',
                border: '1px solid #fca5a5',
                background: '#fef2f2',
                color: '#dc2626',
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {submitting ? 'Unfreezing...' : 'Unfreeze Table'}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleApplyFreeze}
          disabled={submitting || (!tempFromDate && !tempToDate)}
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '4px',
            border: 'none',
            background: '#0284c7',
            color: '#ffffff',
            cursor: submitting || (!tempFromDate && !tempToDate) ? 'not-allowed' : 'pointer',
            opacity: submitting || (!tempFromDate && !tempToDate) ? 0.6 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'background-color 0.15s ease',
          }}
        >
          <Snowflake size={13} />
          <span>{submitting ? 'Applying...' : isCurrentlyFrozen ? 'Update Freeze' : 'Apply Freeze'}</span>
        </button>
      </div>
    </div>
  );
}

export default function FreezeTableModal({
  isOpen,
  onClose,
  ...rest
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        right: 0,
        zIndex: 9999,
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.18), 0 6px 12px -4px rgba(0, 0, 0, 0.08)',
        width: '560px',
        maxWidth: '92vw',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Snowflake size={14} style={{ color: '#0284c7' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
            Freeze Table ({rest.statusLabel || 'Approved'})
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '2px',
          }}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
      <FreezeTablePanel {...rest} onClose={onClose} />
    </div>
  );
}
