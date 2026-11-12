/**
 * CardFlow Central Design System Tokens
 *
 * Provides single-source-of-truth typography, color, spacing, radius,
 * and elevation definitions across all React components, drawers, modals,
 * tables, and utility helpers.
 *
 * Supports both CSS Variable references (for reactive theming)
 * and Raw Values (for Canvas, SVG attributes, and chart libraries).
 */

export const FONT = {
  '3xs': 'var(--font-3xs, 10px)',
  '2xs': 'var(--font-2xs, 11px)',
  xs: 'var(--font-xs, 12px)',
  sm: 'var(--font-sm, 13px)',
  base: 'var(--font-base, 14px)',
  md: 'var(--font-md, 15px)',
  lg: 'var(--font-lg, 16px)',
  xl: 'var(--font-xl, 18px)',
  '2xl': 'var(--font-2xl, 20px)',
  '3xl': 'var(--font-3xl, 24px)',
  '4xl': 'var(--font-4xl, 28px)',
  '5xl': 'var(--font-5xl, 32px)',
};

export const FONT_WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 800,
};

export const COLOR = {
  /* Brand / Primary */
  primary: 'var(--primary, #2563eb)',
  primaryHover: 'var(--primary-hover, #1d4ed8)',
  primaryActive: 'var(--primary-active, #1e40af)',
  primarySubtle: 'var(--primary-subtle, #eff6ff)',
  primaryBorder: 'var(--primary-border, #bfdbfe)',
  primaryDark: 'var(--primary-dark, #1d4ed8)',
  primaryLight: 'var(--primary-light, #93c5fd)',

  /* Neutral Text */
  textMain: 'var(--text-main, #0f172a)',
  textPrimary: 'var(--text-primary, #1e293b)',
  textSecondary: 'var(--text-secondary, #475569)',
  textMuted: 'var(--text-muted, #64748b)',
  textDim: 'var(--text-dim, #94a3b8)',
  textWhite: 'var(--text-white, #ffffff)',
  textBrand: 'var(--text-brand, #2563eb)',

  /* Neutral Backgrounds */
  bgApp: 'var(--bg-app, #f8fafc)',
  bgSurface: 'var(--bg-surface, #ffffff)',
  bgSubtle: 'var(--bg-subtle, #f1f5f9)',
  bgMuted: 'var(--bg-muted, #e2e8f0)',
  bgDark: 'var(--bg-dark, #1e293b)',
  bgDarker: 'var(--bg-darker, #0f172a)',

  /* Neutral Borders */
  borderSubtle: 'var(--border-subtle, #f1f5f9)',
  borderLight: 'var(--border-light, #e2e8f0)',
  borderDefault: 'var(--border-default, #cbd5e1)',
  borderStrong: 'var(--border-strong, #94a3b8)',
  borderDark: 'var(--border-dark, rgba(255, 255, 255, 0.15))',

  /* Success (Green) */
  success: 'var(--success, #16a34a)',
  successHover: 'var(--success-hover, #15803d)',
  successSubtle: 'var(--success-subtle, #ecfdf5)',
  successBorder: 'var(--success-border, #bbf7d0)',

  /* Danger (Red) */
  danger: 'var(--danger, #ef4444)',
  dangerHover: 'var(--danger-hover, #dc2626)',
  dangerSubtle: 'var(--danger-subtle, #fef2f2)',
  dangerBorder: 'var(--danger-border, #fecaca)',

  /* Warning (Amber) */
  warning: 'var(--warning, #f59e0b)',
  warningHover: 'var(--warning-hover, #d97706)',
  warningSubtle: 'var(--warning-subtle, #fef3c7)',
  warningBorder: 'var(--warning-border, #fde68a)',

  /* Info (Cyan / Sky) */
  info: 'var(--info, #06b6d4)',
  infoHover: 'var(--info-hover, #0891b2)',
  infoSubtle: 'var(--info-subtle, #ecfeff)',
  infoBorder: 'var(--info-border, #a5f3fc)',

  /* Purple / Indigo */
  purple: 'var(--purple, #7c3aed)',
  purpleHover: 'var(--purple-hover, #6d28d9)',
  purpleSubtle: 'var(--purple-subtle, #ede9fe)',
  purpleBorder: 'var(--purple-border, #ddd6fe)',
};

export const RADIUS = {
  xs: 'var(--radius-xs, 4px)',
  sm: 'var(--radius-sm, 6px)',
  md: 'var(--radius-md, 8px)',
  lg: 'var(--radius-lg, 10px)',
  xl: 'var(--radius-xl, 12px)',
  full: 'var(--radius-full, 9999px)',
};

export const SPACING = {
  1: 'var(--space-1, 4px)',
  2: 'var(--space-2, 8px)',
  3: 'var(--space-3, 12px)',
  4: 'var(--space-4, 16px)',
  5: 'var(--space-5, 20px)',
  6: 'var(--space-6, 24px)',
  8: 'var(--space-8, 32px)',
  10: 'var(--space-10, 40px)',
  12: 'var(--space-12, 48px)',
  16: 'var(--space-16, 64px)',
};

export const Z_INDEX = {
  sticky: 'var(--z-sticky, 30)',
  sidebar: 'var(--z-sidebar, 40)',
  popover: 'var(--z-popover, 50)',
  dropdown: 'var(--z-dropdown, 60)',
  drawerBackdrop: 'var(--z-drawer-backdrop, 80)',
  drawer: 'var(--z-drawer, 85)',
  modalBackdrop: 'var(--z-modal-backdrop, 90)',
  modal: 'var(--z-modal, 100)',
  toast: 'var(--z-toast, 12000)',
};

export const SHADOW = {
  xs: 'var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.05))',
  sm: 'var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.08))',
  md: 'var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1))',
  lg: 'var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1))',
  xl: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.15))',
};

export const CONTROL = {
  heightSm: '32px',
  heightMd: '40px',
  heightLg: '46px',
  fontSizeSm: 'var(--font-sm, 13px)',
  fontSizeMd: 'var(--font-base, 14px)',
  fontWeight: 600,
  radiusSm: 'var(--radius-sm, 6px)',
  radiusMd: 'var(--radius-md, 8px)',
  radiusLg: 'var(--radius-lg, 10px)',
};

/* Raw hex values for non-CSS contexts (Canvas rendering, dynamic Lucide icon props, SVG) */
export const RAW_COLOR = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primaryActive: '#1e40af',
  primarySubtle: '#eff6ff',
  primaryBorder: '#bfdbfe',

  textMain: '#0f172a',
  textPrimary: '#1e293b',
  textSecondary: '#475569',
  textMuted: '#64748b',
  textDim: '#94a3b8',
  textWhite: '#ffffff',

  bgApp: '#f8fafc',
  bgSurface: '#ffffff',
  bgSubtle: '#f1f5f9',
  bgMuted: '#e2e8f0',
  bgDark: '#1e293b',
  bgDarker: '#0f172a',

  borderSubtle: '#f1f5f9',
  borderLight: '#e2e8f0',
  borderDefault: '#cbd5e1',
  borderStrong: '#94a3b8',

  success: '#16a34a',
  successSubtle: '#ecfdf5',
  successBorder: '#bbf7d0',

  danger: '#ef4444',
  dangerSubtle: '#fef2f2',
  dangerBorder: '#fecaca',

  warning: '#f59e0b',
  warningSubtle: '#fef3c7',
  warningBorder: '#fde68a',

  info: '#06b6d4',
  infoSubtle: '#ecfeff',
  infoBorder: '#a5f3fc',

  purple: '#7c3aed',
  purpleSubtle: '#ede9fe',
  purpleBorder: '#ddd6fe',
};

export const tokens = {
  font: FONT,
  weight: FONT_WEIGHT,
  color: COLOR,
  radius: RADIUS,
  spacing: SPACING,
  zIndex: Z_INDEX,
  shadow: SHADOW,
  control: CONTROL,
  raw: RAW_COLOR,
};

export default tokens;
