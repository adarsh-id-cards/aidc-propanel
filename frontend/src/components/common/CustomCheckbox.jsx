import React from 'react';
import { Check } from 'lucide-react';
import { FONT, COLOR, RADIUS } from '../../styles/tokens';

export default function CustomCheckbox({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  style = {},
  className = '',
  id,
}) {
  const handleClick = (e) => {
    e.stopPropagation();
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`custom-checkbox-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: description ? 'flex-start' : 'center',
        gap: '9px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      <div
        id={id}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            handleClick(e);
          }
        }}
        style={{
          width: '16px',
          height: '16px',
          minWidth: '16px',
          minHeight: '16px',
          borderRadius: RADIUS.sm,
          border: checked ? `1.5px solid ${COLOR.primary}` : `1.5px solid ${COLOR.borderDefault}`,
          background: checked ? COLOR.primary : COLOR.bgSurface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
          boxShadow: checked ? '0 1px 3px rgba(37, 99, 235, 0.25)' : '0 1px 2px rgba(0,0,0,0.04)',
          outline: 'none',
          boxSizing: 'border-box',
          marginTop: description ? '2px' : '0',
        }}
      >
        {checked && <Check size={11} strokeWidth={3.2} style={{ color: '#ffffff' }} />}
      </div>

      {(label || description) && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {label && (
            <span
              style={{
                fontSize: FONT.base,
                fontWeight: 600,
                color: checked ? COLOR.textMain : COLOR.textPrimary,
                transition: 'color 0.15s ease',
                lineHeight: 1.3,
              }}
            >
              {label}
            </span>
          )}
          {description && (
            <span style={{ fontSize: FONT.xs, color: COLOR.textMuted, marginTop: '2px', lineHeight: 1.3 }}>{description}</span>
          )}
        </div>
      )}
    </div>
  );
}
