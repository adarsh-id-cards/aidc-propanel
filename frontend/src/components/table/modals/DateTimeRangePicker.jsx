import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight, ChevronDown, RotateCcw, X, Check } from 'lucide-react';
import { formatDisplayDateTime } from '../../../utils/formatters';
import { FONT, COLOR, RADIUS, SHADOW } from '../../../styles/tokens';

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

export function MovementFilterPanel({
  fromDate = '',
  toDate = '',
  onApply,
  onClear,
  totalMatched = null,
  bulkMovePresets = [],
}) {
  const initFrom = useMemo(() => parseIso(fromDate, '00:00'), [fromDate]);
  const initTo = useMemo(() => parseIso(toDate, '23:59'), [toDate]);

  const [tempFromDate, setTempFromDate] = useState(initFrom.date);
  const [tempToDate, setTempToDate] = useState(initTo.date);

  const initFromTimeParsed = useMemo(() => from24Hour(initFrom.time, '12', '00', 'AM'), [initFrom.time]);
  const initToTimeParsed = useMemo(() => from24Hour(initTo.time, '11', '59', 'PM'), [initTo.time]);

  const [fromHour, setFromHour] = useState(initFromTimeParsed.hour);
  const [fromMinute, setFromMinute] = useState(initFromTimeParsed.minute);
  const [fromAmpm, setFromAmpm] = useState(initFromTimeParsed.ampm);

  const [toHour, setToHour] = useState(initToTimeParsed.hour);
  const [toMinute, setToMinute] = useState(initToTimeParsed.minute);
  const [toAmpm, setToAmpm] = useState(initToTimeParsed.ampm);

  const now = new Date();
  const [fromViewDate, setFromViewDate] = useState(() => {
    if (initFrom.date) {
      const [y, m] = initFrom.date.split('-');
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [toViewDate, setToViewDate] = useState(() => {
    if (initTo.date) {
      const [y, m] = initTo.date.split('-');
      return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    const f = parseIso(fromDate, '00:00');
    const t = parseIso(toDate, '23:59');
    setTempFromDate(f.date);
    setTempToDate(t.date);

    const fTime = from24Hour(f.time, '12', '00', 'AM');
    const tTime = from24Hour(t.time, '11', '59', 'PM');
    setFromHour(fTime.hour);
    setFromMinute(fTime.minute);
    setFromAmpm(fTime.ampm);

    setToHour(tTime.hour);
    setToMinute(tTime.minute);
    setToAmpm(tTime.ampm);

    if (f.date) {
      const [y, m] = f.date.split('-');
      setFromViewDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
    }
    if (t.date) {
      const [y, m] = t.date.split('-');
      setToViewDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
    }
  }, [fromDate, toDate]);

  const renderCalendarMonth = (viewDate, setViewDate, isFromCalendar) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    const handlePrevMonth = (e) => {
      e.stopPropagation();
      setViewDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = (e) => {
      e.stopPropagation();
      setViewDate(new Date(year, month + 1, 1));
    };

    const handleDayClick = (day) => {
      const dateStr = `${year}-${padZero(month + 1)}-${padZero(day)}`;
      if (isFromCalendar) {
        setTempFromDate(dateStr);
        if (tempToDate && dateStr > tempToDate) {
          setTempToDate(dateStr);
        }
      } else {
        setTempToDate(dateStr);
        if (tempFromDate && dateStr < tempFromDate) {
          setTempFromDate(dateStr);
        }
      }
    };

    const todayStr = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;

    return (
      <div style={{ flex: 1, minWidth: '240px' }}>
        {/* Month Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
            padding: '0 4px',
          }}
        >
          <button
            type="button"
            onClick={handlePrevMonth}
            style={{
              background: COLOR.bgApp,
              border: `1px solid ${COLOR.borderLight}`,
              borderRadius: RADIUS.sm,
              padding: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLOR.textSecondary,
              transition: 'background-color 0.15s ease',
            }}
            title="Previous month"
          >
            <ChevronLeft size={14} />
          </button>
          <div style={{ fontSize: FONT.base, fontWeight: 700, color: COLOR.textMain }}>
            {MONTHS[month]} {year}
          </div>
          <button
            type="button"
            onClick={handleNextMonth}
            style={{
              background: COLOR.bgApp,
              border: `1px solid ${COLOR.borderLight}`,
              borderRadius: RADIUS.sm,
              padding: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLOR.textSecondary,
              transition: 'background-color 0.15s ease',
            }}
            title="Next month"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Calendar Title */}
        <div
          style={{
            fontSize: FONT.xs,
            fontWeight: 700,
            color: isFromCalendar ? COLOR.primary : COLOR.success,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '6px',
            textAlign: 'center',
            background: isFromCalendar ? COLOR.primarySubtle : COLOR.successSubtle,
            padding: '3px 0',
            borderRadius: RADIUS.sm,
          }}
        >
          {isFromCalendar ? '● Select From Date' : '● Select To Date'}
        </div>

        {/* Days of Week */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              style={{
                fontSize: FONT.xs,
                fontWeight: 600,
                color: COLOR.textDim,
                textAlign: 'center',
                padding: '4px 0',
              }}
            >
              {wd}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {Array.from({ length: firstDay }).map((_, idx) => (
            <div key={`blank-${idx}`} style={{ height: '28px' }} />
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
            let color = '#1e293b';
            let fontWeight = 500;
            let borderRadius = '4px';

            if (isSelected) {
              bg = isFromCalendar ? '#2563eb' : '#059669';
              color = '#ffffff';
              fontWeight = 700;
            } else if (inRange) {
              bg = '#dbeafe';
              color = '#1e40af';
              borderRadius = '0';
            } else if (isToday) {
              bg = '#f1f5f9';
              color = '#2563eb';
              fontWeight = 700;
            }

            return (
              <button
                key={day}
                type="button"
                onClick={() => handleDayClick(day)}
                style={{
                  height: '28px',
                  border: isToday && !isSelected ? '1px solid #93c5fd' : 'none',
                  borderRadius,
                  background: bg,
                  color,
                  fontSize: FONT.sm,
                  fontWeight,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.12s ease',
                  padding: 0,
                  outline: 'none',
                }}
                title={currentStr}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const applyBulkPreset = (preset) => {
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

  const applyPreset = (type) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${padZero(today.getMonth() + 1)}-${padZero(today.getDate())}`;

    if (type === 'today') {
      setTempFromDate(todayStr);
      setTempToDate(todayStr);
      setFromHour('12');
      setFromMinute('00');
      setFromAmpm('AM');
      setToHour('11');
      setToMinute('59');
      setToAmpm('PM');
      setFromViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
      setToViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    } else if (type === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      const yestStr = `${yest.getFullYear()}-${padZero(yest.getMonth() + 1)}-${padZero(yest.getDate())}`;
      setTempFromDate(yestStr);
      setTempToDate(yestStr);
      setFromHour('12');
      setFromMinute('00');
      setFromAmpm('AM');
      setToHour('11');
      setToMinute('59');
      setToAmpm('PM');
      setFromViewDate(new Date(yest.getFullYear(), yest.getMonth(), 1));
      setToViewDate(new Date(yest.getFullYear(), yest.getMonth(), 1));
    } else if (type === 'last7') {
      const past7 = new Date(today);
      past7.setDate(past7.getDate() - 6);
      const past7Str = `${past7.getFullYear()}-${padZero(past7.getMonth() + 1)}-${padZero(past7.getDate())}`;
      setTempFromDate(past7Str);
      setTempToDate(todayStr);
      setFromHour('12');
      setFromMinute('00');
      setFromAmpm('AM');
      setToHour('11');
      setToMinute('59');
      setToAmpm('PM');
      setFromViewDate(new Date(past7.getFullYear(), past7.getMonth(), 1));
      setToViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    } else if (type === 'thisMonth') {
      const startMonth = `${today.getFullYear()}-${padZero(today.getMonth() + 1)}-01`;
      setTempFromDate(startMonth);
      setTempToDate(todayStr);
      setFromHour('12');
      setFromMinute('00');
      setFromAmpm('AM');
      setToHour('11');
      setToMinute('59');
      setToAmpm('PM');
      setFromViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
      setToViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    } else if (type === 'last30') {
      const past30 = new Date(today);
      past30.setDate(past30.getDate() - 29);
      const past30Str = `${past30.getFullYear()}-${padZero(past30.getMonth() + 1)}-${padZero(past30.getDate())}`;
      setTempFromDate(past30Str);
      setTempToDate(todayStr);
      setFromHour('12');
      setFromMinute('00');
      setFromAmpm('AM');
      setToHour('11');
      setToMinute('59');
      setToAmpm('PM');
      setFromViewDate(new Date(past30.getFullYear(), past30.getMonth(), 1));
      setToViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    }
  };

  const handleApply = () => {
    if (!tempFromDate && !tempToDate) {
      onClear?.();
      return;
    }

    const fDate = tempFromDate || tempToDate;
    const tDate = tempToDate || tempFromDate;

    const fromTimeStr = to24Hour(fromHour, fromMinute, fromAmpm);
    const toTimeStr = to24Hour(toHour, toMinute, toAmpm);

    const fromIso = `${fDate}T${fromTimeStr}`;
    const toIso = `${tDate}T${toTimeStr}`;

    onApply?.({
      from: fromIso,
      to: toIso,
      fromDate: fDate,
      toDate: tDate,
      fromDisplay: `${fDate} ${fromHour}:${fromMinute} ${fromAmpm}`,
      toDisplay: `${tDate} ${toHour}:${toMinute} ${toAmpm}`,
    });
  };

  const handleReset = () => {
    setTempFromDate('');
    setTempToDate('');
    setFromHour('12');
    setFromMinute('00');
    setFromAmpm('AM');
    setToHour('11');
    setToMinute('59');
    setToAmpm('PM');
    onClear?.();
  };

  const hasActiveRange = Boolean(fromDate || toDate);

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
      {/* Active Range Status Bar — only shown when active */}
      {hasActiveRange && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#1e40af',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
            <span>
              <strong>Active Movement Filter:</strong> {formatDisplayDateTime(fromDate)} → {formatDisplayDateTime(toDate)}
              {typeof totalMatched === 'number' && (
                <span style={{ marginLeft: '6px', fontWeight: 700, color: '#1d4ed8' }}>
                  ({totalMatched} matched)
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: '4px',
              color: '#dc2626',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '2px 8px',
              transition: 'background-color 0.15s ease',
            }}
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* Preset Buttons Header */}
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
        <span style={{ fontSize: FONT.xs, fontWeight: 700, color: COLOR.textMuted, marginRight: '4px' }}>
          PRESETS:
        </span>
        {bulkMovePresets.map((p, idx) => (
          <button
            key={p.id || idx}
            type="button"
            onClick={() => applyBulkPreset(p)}
            style={{
              background: idx === 0 ? '#eff6ff' : '#f8fafc',
              border: idx === 0 ? '1px solid #93c5fd' : '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '2px 9px',
              fontSize: '12px',
              fontWeight: 700,
              color: idx === 0 ? '#1d4ed8' : '#334155',
              cursor: 'pointer',
              transition: 'background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title={`Cards moved on ${p.created_at || p.from}`}
          >
            <span>{p.label || `Last Bulk Move (${p.count})`}</span>
          </button>
        ))}
        {[
          { label: 'Today', type: 'today' },
          { label: 'Yesterday', type: 'yesterday' },
          { label: 'Last 7 Days', type: 'last7' },
          { label: 'This Month', type: 'thisMonth' },
          { label: 'Last 30 Days', type: 'last30' },
        ].map((p) => (
          <button
            key={p.type}
            type="button"
            onClick={() => applyPreset(p.type)}
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '2px 9px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
              transition: 'background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#eff6ff';
              e.currentTarget.style.borderColor = '#93c5fd';
              e.currentTarget.style.color = '#1d4ed8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.color = '#475569';
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Dual Calendars Side-by-Side */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {renderCalendarMonth(fromViewDate, setFromViewDate, true)}
        <div style={{ width: '1px', background: '#e2e8f0' }} />
        {renderCalendarMonth(toViewDate, setToViewDate, false)}
      </div>

      {/* Time Range (12-Hour AM / PM) */}
      <div
        style={{
          borderTop: '1px solid #e2e8f0',
          paddingTop: '10px',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <Clock size={12} style={{ color: '#2563eb' }} />
          <span>Time Range (12-Hour AM / PM)</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* From Time Control */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '8px 12px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              From Time:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <select
                value={fromHour}
                onChange={(e) => setFromHour(e.target.value)}
                style={{
                  height: '28px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '0 4px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#ffffff',
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {hours12.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span style={{ fontWeight: 700, color: '#64748b' }}>:</span>
              <select
                value={fromMinute}
                onChange={(e) => setFromMinute(e.target.value)}
                style={{
                  height: '28px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '0 4px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#ffffff',
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <div
                style={{
                  display: 'flex',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginLeft: '6px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setFromAmpm('AM')}
                  style={{
                    padding: '0 8px',
                    height: '26px',
                    border: 'none',
                    background: fromAmpm === 'AM' ? '#2563eb' : '#ffffff',
                    color: fromAmpm === 'AM' ? '#ffffff' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setFromAmpm('PM')}
                  style={{
                    padding: '0 8px',
                    height: '26px',
                    border: 'none',
                    borderLeft: '1px solid #cbd5e1',
                    background: fromAmpm === 'PM' ? '#2563eb' : '#ffffff',
                    color: fromAmpm === 'PM' ? '#ffffff' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          {/* To Time Control */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '8px 12px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              To Time:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <select
                value={toHour}
                onChange={(e) => setToHour(e.target.value)}
                style={{
                  height: '28px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '0 4px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#ffffff',
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {hours12.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span style={{ fontWeight: 700, color: '#64748b' }}>:</span>
              <select
                value={toMinute}
                onChange={(e) => setToMinute(e.target.value)}
                style={{
                  height: '28px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '0 4px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#ffffff',
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <div
                style={{
                  display: 'flex',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginLeft: '6px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setToAmpm('AM')}
                  style={{
                    padding: '0 8px',
                    height: '26px',
                    border: 'none',
                    background: toAmpm === 'AM' ? '#059669' : '#ffffff',
                    color: toAmpm === 'AM' ? '#ffffff' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setToAmpm('PM')}
                  style={{
                    padding: '0 8px',
                    height: '26px',
                    border: 'none',
                    borderLeft: '1px solid #cbd5e1',
                    background: toAmpm === 'PM' ? '#059669' : '#ffffff',
                    color: toAmpm === 'PM' ? '#ffffff' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  PM
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Controls for Movement Panel */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '12px',
        }}
      >
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          {tempFromDate && tempToDate ? (
            <span>
              Selected: <strong>{tempFromDate} {fromHour}:{fromMinute} {fromAmpm}</strong> →{' '}
              <strong>{tempToDate} {toHour}:{toMinute} {toAmpm}</strong>
            </span>
          ) : (
            <span>Select both From and To dates to filter cards</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              height: '30px',
              padding: '0 12px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'background-color 0.15s ease',
            }}
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              height: '30px',
              padding: '0 14px',
              background: '#2563eb',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'background-color 0.15s ease',
            }}
          >
            <Check size={13} />
            <span>Apply Movement Filter</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DateTimeRangePicker({
  fromDate = '',
  toDate = '',
  onApply,
  onClear,
  totalMatched = null,
  label = 'Movement',
  bulkMovePresets = [],
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const hasActiveRange = Boolean(fromDate || toDate);

  const displayButtonText = useMemo(() => {
    if (fromDate && toDate) {
      return `${formatDisplayDateTime(fromDate)} – ${formatDisplayDateTime(toDate)}`;
    }
    if (fromDate) {
      return `From ${formatDisplayDateTime(fromDate)}`;
    }
    if (toDate) {
      return `Until ${formatDisplayDateTime(toDate)}`;
    }
    return label;
  }, [fromDate, toDate, label]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: '34px',
          minHeight: '34px',
          border: hasActiveRange ? `1px solid ${COLOR.primary}` : `1px solid ${COLOR.borderDefault}`,
          borderRadius: RADIUS.sm,
          background: hasActiveRange ? COLOR.primarySubtle : COLOR.bgSurface,
          color: hasActiveRange ? COLOR.primaryHover : COLOR.textPrimary,
          fontSize: FONT.base,
          fontWeight: 600,
          boxSizing: 'border-box',
          overflow: 'hidden',
          transition: 'all 0.15s ease',
        }}
      >
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '0 8px',
            height: '100%',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '14px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
          title={hasActiveRange ? `Active Filter: ${displayButtonText}` : 'Filter cards by movement date & time'}
        >
          <Calendar size={13} style={{ color: hasActiveRange ? '#2563eb' : '#64748b' }} />
          <span>{displayButtonText}</span>
          <ChevronDown
            size={12}
            style={{
              color: hasActiveRange ? '#2563eb' : '#94a3b8',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>

        {hasActiveRange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear?.();
            }}
            style={{
              background: '#dbeafe',
              border: 'none',
              borderLeft: '1px solid #bfdbfe',
              color: '#1d4ed8',
              cursor: 'pointer',
              padding: '0 6px',
              height: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Clear date and time filter"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 9999,
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: SHADOW.lg,
            width: '580px',
            maxWidth: '92vw',
            boxSizing: 'border-box',
          }}
        >
          <MovementFilterPanel
            fromDate={fromDate}
            toDate={toDate}
            onApply={(res) => {
              onApply?.(res);
              setIsOpen(false);
            }}
            onClear={() => {
              onClear?.();
              setIsOpen(false);
            }}
            totalMatched={totalMatched}
            bulkMovePresets={bulkMovePresets}
          />
        </div>
      )}
    </div>
  );
}
