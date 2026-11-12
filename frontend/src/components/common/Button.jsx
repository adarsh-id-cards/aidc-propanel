import React from 'react';
import { Loader2 } from 'lucide-react';
import { FONT, COLOR, RADIUS } from '../../styles/tokens';

const SIZES = {
  sm: {
    height: '32px',
    padding: '0 12px',
    fontSize: FONT.base,
    fontWeight: 600,
    borderRadius: RADIUS.sm,
    gap: '6px',
    iconSize: 14,
  },
  md: {
    height: '40px',
    padding: '0 16px',
    fontSize: FONT.base,
    fontWeight: 600,
    borderRadius: RADIUS.sm,
    gap: '7px',
    iconSize: 16,
  },
  lg: {
    height: '46px',
    padding: '0 20px',
    fontSize: FONT.base,
    fontWeight: 700,
    borderRadius: RADIUS.sm,
    gap: '8px',
    iconSize: 18,
  },
  'icon-sm': {
    width: '32px',
    height: '32px',
    padding: '0',
    fontSize: FONT.base,
    fontWeight: 600,
    borderRadius: RADIUS.sm,
    gap: '0',
    iconSize: 14,
  },
  'icon-md': {
    width: '40px',
    height: '40px',
    padding: '0',
    fontSize: FONT.base,
    fontWeight: 600,
    borderRadius: RADIUS.sm,
    gap: '0',
    iconSize: 16,
  },
};

const VARIANTS = {
  primary: {
    bg: COLOR.primary,
    color: COLOR.textWhite,
    border: `1px solid ${COLOR.primary}`,
    hoverBg: COLOR.primaryHover,
    hoverBorder: `1px solid ${COLOR.primaryHover}`,
    activeBg: COLOR.primaryActive,
  },
  secondary: {
    bg: COLOR.bgSurface,
    color: COLOR.textPrimary,
    border: `1px solid ${COLOR.borderDefault}`,
    hoverBg: COLOR.bgApp,
    hoverBorder: `1px solid ${COLOR.borderStrong}`,
    activeBg: COLOR.bgSubtle,
  },
  danger: {
    bg: COLOR.danger,
    color: COLOR.textWhite,
    border: `1px solid ${COLOR.danger}`,
    hoverBg: COLOR.dangerHover,
    hoverBorder: `1px solid ${COLOR.dangerHover}`,
    activeBg: COLOR.dangerHover,
  },
  success: {
    bg: COLOR.success,
    color: COLOR.textWhite,
    border: `1px solid ${COLOR.success}`,
    hoverBg: COLOR.successHover,
    hoverBorder: `1px solid ${COLOR.successHover}`,
    activeBg: COLOR.successHover,
  },
  warning: {
    bg: COLOR.warning,
    color: COLOR.textWhite,
    border: `1px solid ${COLOR.warning}`,
    hoverBg: COLOR.warningHover,
    hoverBorder: `1px solid ${COLOR.warningHover}`,
    activeBg: COLOR.warningHover,
  },
  neutral: {
    bg: 'rgba(255, 255, 255, 0.08)',
    color: COLOR.textWhite,
    border: '1px solid rgba(255, 255, 255, 0.15)',
    hoverBg: 'rgba(255, 255, 255, 0.14)',
    hoverBorder: '1px solid rgba(255, 255, 255, 0.25)',
    activeBg: 'rgba(255, 255, 255, 0.2)',
  },
  ghost: {
    bg: 'transparent',
    color: 'inherit',
    border: '1px solid transparent',
    hoverBg: 'rgba(0, 0, 0, 0.05)',
    hoverBorder: '1px solid transparent',
    activeBg: 'rgba(0, 0, 0, 0.1)',
  },
  outline: {
    bg: 'transparent',
    color: '#2563eb',
    border: '1px solid #2563eb',
    hoverBg: '#eff6ff',
    hoverBorder: '1px solid #2563eb',
    activeBg: '#dbeafe',
  },
};

export default function Button({
  children,
  variant = 'primary',
  size = 'sm',
  icon = null,
  iconPosition = 'start',
  loading = false,
  disabled = false,
  active = false,
  type = 'button',
  onClick,
  title,
  className = '',
  style = {},
  id,
  ...props
}) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isActive, setIsActive] = React.useState(false);

  const sizeCfg = SIZES[size] || SIZES.sm;
  const variantCfg = VARIANTS[variant] || VARIANTS.primary;
  const isDisabled = disabled || loading;

  let bg = variantCfg.bg;
  let color = variantCfg.color;
  let border = variantCfg.border;

  if (active) {
    bg = variantCfg.activeBg || variantCfg.hoverBg;
  } else if (isHovered && !isDisabled) {
    bg = variantCfg.hoverBg;
    if (variantCfg.hoverBorder) {
      border = variantCfg.hoverBorder.includes(' ')
        ? variantCfg.hoverBorder
        : `1px solid ${variantCfg.hoverBorder}`;
    }
  }
  if (isActive && !isDisabled) {
    bg = variantCfg.activeBg || bg;
  }

  const baseStyle = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: sizeCfg.height,
    minHeight: sizeCfg.height,
    maxHeight: sizeCfg.height,
    flexShrink: 0,
    width: sizeCfg.width || 'auto',
    padding: sizeCfg.padding,
    fontSize: sizeCfg.fontSize,
    fontWeight: sizeCfg.fontWeight,
    borderRadius: sizeCfg.borderRadius,
    background: isDisabled ? (variant === 'neutral' ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9') : bg,
    color: isDisabled ? (variant === 'neutral' ? 'rgba(255, 255, 255, 0.7)' : '#64748b') : color,
    border: isDisabled ? (variant === 'neutral' ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid #cbd5e1') : border,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    gap: sizeCfg.gap,
    lineHeight: 1,
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease',
    transform: 'none',
    letterSpacing: 'inherit',
    fontFamily: 'var(--font-family)',
    opacity: isDisabled ? 0.85 : 1,
    outline: 'none',
    ...style,
  };

  const renderIcon = () => {
    const isBrightBg = variant === 'primary' || variant === 'danger' || variant === 'success' || variant === 'warning';
    const customIconColor = icon?.props?.color || icon?.props?.style?.color;

    let iconColor = isBrightBg ? '#ffffff' : 'inherit';
    if (customIconColor) {
      iconColor = customIconColor;
    } else if (isDisabled) {
      iconColor = variant === 'neutral' ? 'rgba(255, 255, 255, 0.7)' : (variantCfg.color || '#475569');
    }
    const strokeColor = iconColor !== 'inherit' ? iconColor : (isBrightBg ? '#ffffff' : 'currentColor');

    if (loading) {
      return (
        <Loader2
          size={sizeCfg.iconSize}
          color={iconColor}
          style={{ animation: 'spin 1s linear infinite', flexShrink: 0, color: iconColor, stroke: strokeColor }}
        />
      );
    }
    if (icon) {
      return React.isValidElement(icon)
        ? React.cloneElement(icon, {
            size: icon.props?.size || sizeCfg.iconSize,
            color: icon.props?.color || iconColor,
            style: {
              flexShrink: 0,
              color: icon.props?.style?.color || icon.props?.color || iconColor,
              stroke: icon.props?.style?.stroke || icon.props?.color || strokeColor,
              filter: isDisabled ? 'saturate(0.8)' : 'none',
              opacity: isDisabled ? 0.85 : 1,
              ...(icon.props?.style || {}),
            },
          })
        : icon;
    }
    return null;
  };

  return (
    <button
      id={id}
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      aria-label={title}
      title={title}
      className={`cf-btn ${className}`}
      style={baseStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsActive(false);
      }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      {...props}
    >
      {iconPosition === 'start' && renderIcon()}
      {children}
      {iconPosition === 'end' && renderIcon()}

    </button>
  );
}
