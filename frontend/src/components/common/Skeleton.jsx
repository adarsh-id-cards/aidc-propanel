/**
 * Skeleton.jsx — reusable skeleton loading components
 * Uses react-loading-skeleton and GPU-accelerated CSS shimmers to match each page's layout.
 * Replaces circular spinners across all pages with realistic layout-identical skeletons.
 */
import React from 'react';
import SkeletonBase, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

// Dark navy theme that matches our .action-bar / sidebar background
const DARK_BASE = '#1e2538';
const DARK_HIGHLIGHT = '#2a3250';

// Light white theme for light-background panels (data table rows etc)
const LIGHT_BASE = '#e8ecf0';
const LIGHT_HIGHLIGHT = '#f1f4f7';

/**
 * SkeletonTableRows — renders N skeleton rows matching our data-table row height.
 * @param {number}  count       Number of skeleton rows to render (default 8)
 * @param {number}  cols        Number of columns (default 6)
 * @param {boolean} dark        Use dark theme (default false — white table bg)
 * @param {string}  rowHeight   CSS height string (default '38px')
 */
export function SkeletonTableRows({ count = 8, cols = 6, dark = false, rowHeight = '44px' }) {
  const base = dark ? DARK_BASE : LIGHT_BASE;
  const highlight = dark ? DARK_HIGHLIGHT : LIGHT_HIGHLIGHT;

  return (
    <SkeletonTheme baseColor={base} highlightColor={highlight}>
      {Array.from({ length: count }).map((_, i) => (
        <tr
          key={i}
          style={{ height: rowHeight, borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'}` }}
        >
          {Array.from({ length: cols }).map((_, j) => {
            const widthVariance = `${55 + ((i + j) % 5) * 8}%`;
            return (
              <td key={j} style={{ padding: '6px 10px', height: rowHeight, minHeight: rowHeight, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                <SkeletonBase height={14} width={j === 0 ? '24px' : widthVariance} borderRadius={4} />
              </td>
            );
          })}
        </tr>
      ))}
    </SkeletonTheme>
  );
}

/**
 * SkeletonCardTableRows — realistic 68px height skeleton rows matching TableActionsView.jsx
 */
export function SkeletonCardTableRows({
  count = 10,
  fields = [],
  stableColWidths = {},
  flexColumnName = '',
  isTableOverflowing = false,
  totalColumns = 8,
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        return (
          <tr
            key={`skel-row-${i}`}
            style={{
              height: '68px',
              minHeight: '68px',
              background: rowBg,
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            {/* Checkbox freeze col */}
            <td
              className="freeze-col-check"
              style={{
                width: '38px',
                minWidth: '38px',
                maxWidth: '38px',
                padding: '6px 10px',
                textAlign: 'center',
                verticalAlign: 'middle',
                background: rowBg,
                borderLeft: '1px solid #cbd5e1',
                borderRight: '1px solid #cbd5e1',
                borderBottom: '1px solid #cbd5e1',
              }}
            >
              <div
                className="skeleton-shimmer"
                style={{ width: '18px', height: '18px', borderRadius: '4px', margin: '0 auto' }}
              />
            </td>

            {/* SR NO freeze col */}
            <td
              className="freeze-col-sr"
              style={{
                width: '44px',
                minWidth: '44px',
                maxWidth: '44px',
                padding: '6px 10px',
                textAlign: 'center',
                verticalAlign: 'middle',
                background: rowBg,
                borderRight: '1px solid #cbd5e1',
                borderBottom: '1px solid #cbd5e1',
              }}
            >
              <div
                className="skeleton-shimmer"
                style={{ width: '16px', height: '14px', borderRadius: '3px', margin: '0 auto' }}
              />
            </td>

            {/* Dynamic schema columns */}
            {fields.map((f, j) => {
              const colW = stableColWidths[f.name] || (f.type === 'photo' || f.name.toLowerCase().includes('photo') || f.name.toLowerCase().includes('image') ? 58 : 100);
              const isImage = f.type === 'photo' || f.name.toLowerCase().includes('photo') || f.name.toLowerCase().includes('image');

              return (
                <td
                  key={`skel-cell-${f.name}-${j}`}
                  style={{
                    width: `${colW}px`,
                    minWidth: `${colW}px`,
                    maxWidth: `${colW}px`,
                    padding: '6px 10px',
                    height: '68px',
                    minHeight: '68px',
                    boxSizing: 'border-box',
                    verticalAlign: 'middle',
                    textAlign: isImage ? 'center' : 'left',
                    borderRight: '1px solid #e2e8f0',
                    borderBottom: '1px solid #cbd5e1',
                  }}
                >
                  {isImage ? (
                    <div
                      className="skeleton-shimmer"
                      style={{
                        width: '44px',
                        height: '52px',
                        borderRadius: '6px',
                        margin: '0 auto',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div
                        className="skeleton-shimmer"
                        style={{
                          height: '14px',
                          width: `${60 + ((i + j) % 4) * 10}%`,
                          borderRadius: '4px',
                        }}
                      />
                      {(j === 0 || f.name.toUpperCase().includes('NAME')) && (
                        <div
                          className="skeleton-shimmer"
                          style={{
                            height: '11px',
                            width: `${40 + (i % 3) * 12}%`,
                            borderRadius: '3px',
                          }}
                        />
                      )}
                    </div>
                  )}
                </td>
              );
            })}

            {/* Created At col */}
            <td
              style={{
                width: '114px',
                minWidth: '114px',
                padding: '6px 8px',
                textAlign: 'center',
                verticalAlign: 'middle',
                borderRight: '1px solid #e2e8f0',
                borderBottom: '1px solid #cbd5e1',
              }}
            >
              <div
                className="skeleton-shimmer"
                style={{ width: '60px', height: '14px', borderRadius: '4px', margin: '0 auto' }}
              />
            </td>

            {/* Action buttons col */}
            <td
              style={{
                width: '46px',
                minWidth: '46px',
                padding: '6px 4px',
                textAlign: 'center',
                verticalAlign: 'middle',
                borderRight: '1px solid #e2e8f0',
                borderBottom: '1px solid #cbd5e1',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                <div
                  className="skeleton-shimmer"
                  style={{ width: '38px', height: '23px', borderRadius: '4px' }}
                />
                <div
                  className="skeleton-shimmer"
                  style={{ width: '38px', height: '23px', borderRadius: '4px' }}
                />
              </div>
            </td>

            {/* Logs Col */}
            <td
              style={{
                width: '46px',
                minWidth: '46px',
                padding: '6px 4px',
                textAlign: 'center',
                verticalAlign: 'middle',
                borderBottom: '1px solid #cbd5e1',
              }}
            >
              <div
                className="skeleton-shimmer"
                style={{ width: '26px', height: '26px', borderRadius: '50%', margin: '0 auto' }}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}

/**
 * SkeletonFullTable — Complete structure for when table structure/columns are loading
 */
export function SkeletonFullTable({ rowCount = 10 }) {
  const dummyCols = [
    { name: 'Photo', width: '60px', isImage: true },
    { name: 'Student Name', width: '180px', isImage: false },
    { name: 'Father Name', width: '160px', isImage: false },
    { name: 'Class', width: '90px', isImage: false },
    { name: 'Section', width: '80px', isImage: false },
    { name: 'Roll No', width: '90px', isImage: false },
    { name: 'Mobile', width: '120px', isImage: false },
    { name: 'Created', width: '88px', isImage: false },
    { name: 'Action', width: '46px', isImage: false },
    { name: 'Logs', width: '46px', isImage: false },
  ];

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          fontSize: '14px',
          tableLayout: 'fixed',
          boxSizing: 'border-box',
        }}
      >
        <thead style={{ position: 'sticky', top: 0, zIndex: 25 }}>
          <tr style={{ background: '#1e293b', color: '#ffffff', height: '34px' }}>
            <th style={{ width: '38px', borderRight: '1px solid rgba(255,255,255,0.15)', textAlign: 'center' }}>
              <div className="skeleton-shimmer-dark" style={{ width: '16px', height: '16px', borderRadius: '4px', margin: '0 auto' }} />
            </th>
            <th style={{ width: '36px', borderRight: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
              <div className="skeleton-shimmer-dark" style={{ width: '16px', height: '12px', borderRadius: '3px', margin: '0 auto' }} />
            </th>
            {dummyCols.map((col, idx) => (
              <th
                key={idx}
                style={{
                  width: col.width,
                  padding: '6px 10px',
                  textAlign: col.isImage || col.name === 'Action' || col.name === 'Logs' ? 'center' : 'left',
                  borderRight: '1px solid rgba(255,255,255,0.15)',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#94a3b8',
                }}
              >
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, i) => (
            <tr
              key={i}
              style={{
                height: '68px',
                background: i % 2 === 0 ? '#ffffff' : '#f8fafc',
                borderBottom: '1px solid #cbd5e1',
              }}
            >
              <td style={{ textAlign: 'center', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ width: '18px', height: '18px', borderRadius: '4px', margin: '0 auto' }} />
              </td>
              <td style={{ textAlign: 'center', borderRight: '2px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ width: '16px', height: '14px', borderRadius: '3px', margin: '0 auto' }} />
              </td>
              <td style={{ textAlign: 'center', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ width: '44px', height: '52px', borderRadius: '6px', margin: '0 auto' }} />
              </td>
              <td style={{ padding: '8px 10px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ height: '14px', width: '80%', borderRadius: '4px', marginBottom: '6px' }} />
                <div className="skeleton-shimmer" style={{ height: '11px', width: '50%', borderRadius: '3px' }} />
              </td>
              <td style={{ padding: '8px 10px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ height: '14px', width: '70%', borderRadius: '4px' }} />
              </td>
              <td style={{ padding: '8px 10px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ height: '14px', width: '60%', borderRadius: '4px' }} />
              </td>
              <td style={{ padding: '8px 10px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ height: '14px', width: '50%', borderRadius: '4px' }} />
              </td>
              <td style={{ padding: '8px 10px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ height: '14px', width: '65%', borderRadius: '4px' }} />
              </td>
              <td style={{ padding: '8px 10px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ height: '14px', width: '75%', borderRadius: '4px' }} />
              </td>
              <td style={{ textAlign: 'center', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ width: '60px', height: '14px', borderRadius: '4px', margin: '0 auto' }} />
              </td>
              <td style={{ textAlign: 'center', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                  <div className="skeleton-shimmer" style={{ width: '38px', height: '23px', borderRadius: '4px' }} />
                  <div className="skeleton-shimmer" style={{ width: '38px', height: '23px', borderRadius: '4px' }} />
                </div>
              </td>
              <td style={{ textAlign: 'center', borderBottom: '1px solid #cbd5e1' }}>
                <div className="skeleton-shimmer" style={{ width: '26px', height: '26px', borderRadius: '50%', margin: '0 auto' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * SkeletonTimeline — matches timeline items in CardTimelineDrawer, OrgActivityDrawer, OperationHistoryModal
 */
export function SkeletonTimeline({ count = 5 }) {
  return (
    <div style={{ position: 'relative', paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Vertical Spine */}
      <div
        style={{
          position: 'absolute',
          left: '11px',
          top: '12px',
          bottom: '12px',
          width: '2px',
          background: 'linear-gradient(to bottom, #cbd5e1 0%, #e2e8f0 100%)',
          zIndex: 1,
        }}
      />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Node Icon */}
          <div
            className="skeleton-shimmer"
            style={{
              position: 'absolute',
              left: '-32px',
              top: '4px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              zIndex: 2,
              border: '2px solid #ffffff',
            }}
          />

          {/* Card Body */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '14px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div className="skeleton-shimmer" style={{ height: '15px', width: `${45 + (i % 3) * 15}%`, borderRadius: '4px' }} />
              <div className="skeleton-shimmer" style={{ height: '18px', width: '70px', borderRadius: '999px' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="skeleton-shimmer" style={{ height: '12px', width: '90px', borderRadius: '3px' }} />
              <div className="skeleton-shimmer" style={{ height: '12px', width: '60px', borderRadius: '3px' }} />
            </div>

            <div
              style={{
                background: '#f8fafc',
                borderRadius: '6px',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div className="skeleton-shimmer" style={{ height: '12px', width: '85%', borderRadius: '3px' }} />
              <div className="skeleton-shimmer" style={{ height: '12px', width: '60%', borderRadius: '3px' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonList — matches list items (contacts, managers, assistants, delegation accounts)
 */
export function SkeletonList({ count = 5, hasAvatar = true, hasAction = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            {hasAvatar && (
              <div
                className="skeleton-shimmer"
                style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0 }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
              <div className="skeleton-shimmer" style={{ height: '14px', width: `${50 + (i % 4) * 12}%`, borderRadius: '4px' }} />
              <div className="skeleton-shimmer" style={{ height: '11px', width: `${30 + (i % 3) * 15}%`, borderRadius: '3px' }} />
            </div>
          </div>

          {hasAction && (
            <div
              className="skeleton-shimmer"
              style={{ width: '64px', height: '26px', borderRadius: '4px', flexShrink: 0 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonCard — a single card-shaped skeleton block.
 */
export function SkeletonCard({ height = 80, dark = false }) {
  const base = dark ? DARK_BASE : LIGHT_BASE;
  const highlight = dark ? DARK_HIGHLIGHT : LIGHT_HIGHLIGHT;
  return (
    <SkeletonTheme baseColor={base} highlightColor={highlight}>
      <SkeletonBase height={height} borderRadius={8} />
    </SkeletonTheme>
  );
}

/**
 * SkeletonText — one or more lines of text skeleton.
 */
export function SkeletonText({ lines = 3, dark = false }) {
  const base = dark ? DARK_BASE : LIGHT_BASE;
  const highlight = dark ? DARK_HIGHLIGHT : LIGHT_HIGHLIGHT;
  return (
    <SkeletonTheme baseColor={base} highlightColor={highlight}>
      <SkeletonBase count={lines} height={12} borderRadius={4} style={{ marginBottom: '6px' }} />
    </SkeletonTheme>
  );
}

/**
 * SkeletonStatCards — 4 inline stat cards like on the server snapshot panel.
 */
export function SkeletonStatCards({ count = 4, dark = false }) {
  const base = dark ? DARK_BASE : LIGHT_BASE;
  const highlight = dark ? DARK_HIGHLIGHT : LIGHT_HIGHLIGHT;
  return (
    <SkeletonTheme baseColor={base} highlightColor={highlight}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: '12px', padding: '12px 16px' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
            }}
          >
            <SkeletonBase height={12} width="60%" borderRadius={4} />
            <SkeletonBase height={24} width="80%" borderRadius={4} />
            <SkeletonBase height={10} width="50%" borderRadius={4} />
          </div>
        ))}
      </div>
    </SkeletonTheme>
  );
}

export default SkeletonBase;

