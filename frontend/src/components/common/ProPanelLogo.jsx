import React from 'react';

/**
 * ProPanelLogo
 * Official Pro Panel 3D Identity Component.
 * Renders the official brand emblem with responsive sizing and elegant drop-shadow.
 */
export default function ProPanelLogo({
  size = 'md',
  style = {},
  className = '',
}) {
  const sizes = {
    sm: { height: 30, radius: 6 },
    md: { height: 38, radius: 8 },
    lg: { height: 74, radius: 14 },
    xl: { height: 96, radius: 18 },
  };

  const config = sizes[size] || sizes.md;

  return (
    <div
      className={`pro-panel-logo-wrap ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        lineHeight: 0,
        ...style,
      }}
    >
      <img
        src="/propanel_logo.png"
        onError={(e) => {
          if (!e.target.src.includes('/static/propanel_logo.png')) {
            e.target.src = '/static/propanel_logo.png';
          }
        }}
        alt="Pro Panel"
        style={{
          height: `${config.height}px`,
          width: 'auto',
          aspectRatio: '1 / 1',
          borderRadius: `${config.radius}px`,
          objectFit: 'contain',
          display: 'block',
          boxShadow:
            size === 'lg' || size === 'xl'
              ? '0 8px 24px rgba(220, 38, 38, 0.35), 0 2px 8px rgba(0, 0, 0, 0.4)'
              : '0 2px 8px rgba(0, 0, 0, 0.25)',
          transition: 'transform 0.2s ease',
        }}
      />
    </div>
  );
}
