import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { FONT, COLOR, RADIUS } from '../../styles/tokens';

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select option...',
  disabled = false,
  style = {},
  className = '',
  id,
  size = 'sm',
  height,
  dark = false,
  menuWidth,
  menuMaxWidth = '260px',
  menuMinWidth,
  dropdownOffset = 5,
  autoOpen = false,
  onClose,
}) {
  const isSmall = size === 'sm';
  const effectiveHeight = style.height || height || (isSmall ? '34px' : '40px');
  const fontSize = style.fontSize || FONT.base;
  const borderRadius = RADIUS.sm;
  const [open, setOpen] = useState(autoOpen);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        if (onClose) onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const toggleOpen = () => {
    if (disabled) return;
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Auto-detect direction: if space below < 230px and space above > spaceBelow, open upward
      if (spaceBelow < 230 && spaceAbove > spaceBelow) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }
    setOpen((prev) => !prev);
  };

  // Normalize options safely (handles strings, objects, {value, display, count}, etc.)
  const normalizedOptions = (Array.isArray(options) ? options : []).map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      let rawLabel = opt.label;
      if (typeof rawLabel === 'object' && rawLabel !== null) {
        rawLabel = rawLabel.display || rawLabel.label || rawLabel.name || rawLabel.value || '';
      }
      if (rawLabel === undefined || rawLabel === null) {
        rawLabel = opt.display || opt.name || opt.title || opt.value || '';
      }

      let rawVal = opt.value;
      if (typeof rawVal === 'object' && rawVal !== null) {
        rawVal = rawVal.value !== undefined ? rawVal.value : (rawVal.id !== undefined ? rawVal.id : rawVal.name || rawLabel);
      }
      if (rawVal === undefined || rawVal === null) {
        rawVal = opt.id !== undefined ? opt.id : rawLabel;
      }

      return {
        value: String(rawVal ?? ''),
        label: String(rawLabel ?? ''),
      };
    }
    return { value: String(opt ?? ''), label: String(opt ?? '') };
  });

  const selectedOpt = normalizedOptions.find((o) => String(o.value) === String(value));

  return (
    <div
      ref={containerRef}
      id={id}
      className={`custom-select-container ${className}`}
      style={{ position: 'relative', display: 'inline-block', width: '100%', ...style }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            if (onClose) onClose();
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleOpen();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) {
              setOpen(true);
            } else if (normalizedOptions.length > 0) {
              const currentIdx = normalizedOptions.findIndex((o) => String(o.value) === String(value));
              const nextIdx = e.key === 'ArrowDown'
                ? (currentIdx + 1) % normalizedOptions.length
                : (currentIdx - 1 + normalizedOptions.length) % normalizedOptions.length;
              if (typeof onChange === 'function') {
                onChange(normalizedOptions[nextIdx].value);
              }
            }
          }
        }}
        style={{
          width: '100%',
          height: effectiveHeight,
          padding: isSmall ? '0 8px' : '0 12px',
          border: open
            ? '1px solid #3b82f6'
            : dark
            ? '1px solid rgba(255, 255, 255, 0.18)'
            : style.border || '1px solid #cbd5e1',
          borderRadius: style.borderRadius || borderRadius,
          background: disabled
            ? dark
              ? 'rgba(255, 255, 255, 0.04)'
              : '#f1f5f9'
            : dark
            ? 'rgba(255, 255, 255, 0.08)'
            : '#ffffff',
          fontSize,
          fontWeight: 600,
          color: selectedOpt
            ? dark
              ? '#ffffff'
              : '#0f172a'
            : dark
            ? '#94a3b8'
            : '#64748b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: open
            ? dark
              ? '0 0 0 2px rgba(59, 130, 246, 0.3)'
              : '0 0 0 3px rgba(37, 99, 235, 0.12), 0 1px 2px rgba(0,0,0,0.05)'
            : 'none',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box',
          fontFamily: 'var(--font-family, inherit)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOpt ? selectedOpt.label : placeholder}
        </span>
        <ChevronDown
          size={13}
          style={{
            color: dark ? '#94a3b8' : '#64748b',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        />
      </button>

      {open && !disabled && (
        <div
          className="custom-select-menu"
          role="listbox"
          tabIndex={-1}
          style={{
            position: 'absolute',
            top: openUp ? 'auto' : `calc(100% + ${dropdownOffset}px)`,
            bottom: openUp ? `calc(100% + ${dropdownOffset}px)` : 'auto',
            left: 0,
            zIndex: 99999,
            width: menuWidth || 'max-content',
            minWidth: menuMinWidth || '100%',
            maxWidth: menuMaxWidth || '260px',
            background: dark ? '#181825' : '#ffffff',
            border: dark ? '1px solid rgba(255, 255, 255, 0.18)' : '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: dark
              ? '0 12px 28px rgba(0,0,0,0.7), 0 4px 10px rgba(0,0,0,0.4)'
              : '0 10px 25px -5px rgba(0,0,0,0.15), 0 4px 10px -2px rgba(0,0,0,0.06)',
            maxHeight: '230px',
            overflowY: 'auto',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            boxSizing: 'border-box',
            scrollbarWidth: 'thin',
            animation: 'fadeIn 0.12s ease',
          }}
        >
          {normalizedOptions.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: FONT.base, color: '#94a3b8', textAlign: 'center' }}>
              No options available
            </div>
          ) : (
            normalizedOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    if (typeof onChange === 'function') onChange(opt.value);
                    setOpen(false);
                    if (typeof onClose === 'function') onClose();
                  }}
                  style={{
                    width: '100%',
                    padding: isSmall ? '6px 8px' : '7px 10px',
                    borderRadius: '6px',
                    fontSize: style.fontSize || '14px',
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected
                      ? dark
                        ? '#ffffff'
                        : '#1d4ed8'
                      : dark
                      ? '#cbd5e1'
                      : '#334155',
                    background: isSelected
                      ? dark
                        ? 'rgba(37, 99, 235, 0.35)'
                        : '#eff6ff'
                      : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    boxSizing: 'border-box',
                    fontFamily: 'var(--font-family, inherit)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = dark ? 'rgba(255, 255, 255, 0.08)' : '#f8fafc';
                      if (dark) e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                      if (dark) e.currentTarget.style.color = '#cbd5e1';
                    }
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opt.label}
                  </span>
                  {isSelected && <Check size={13} style={{ color: dark ? '#60a5fa' : '#2563eb', flexShrink: 0 }} />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
