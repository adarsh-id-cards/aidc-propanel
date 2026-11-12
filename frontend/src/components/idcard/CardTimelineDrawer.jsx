import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Clock,
  Layers,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Camera,
  Edit3,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { auditApi } from '../../services/api';
import { SkeletonTimeline } from '../common/Skeleton';

export default function CardTimelineDrawer({ card, table, onClose, onOpenTransaction, onCardUpdated, addToast }) {
  const [timeline, setTimeline] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const cardId = card?.id;

  const fetchTimeline = useCallback(async () => {
    if (!cardId) return;
    setLoading(true);
    try {
      const res = await auditApi.getCardTimeline(cardId, { limit: 100 });
      if (res && res.success) {
        setTimeline(res.timeline || []);
        setTotalCount(res.total_count || 0);
      } else {
        setTimeline([]);
      }
    } catch {
      setTimeline([]);
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const handleUndoEvent = async (ev) => {
    if (!cardId || !ev?.id) return;
    setActionLoadingId(ev.id);
    try {
      const res = await auditApi.undoCardEvent(cardId, ev.id, { event_ids: ev.event_ids });
      if (res && res.success) {
        addToast?.(res.message || 'Field changes undone successfully.', 'success');
        if (res.card && onCardUpdated) {
          onCardUpdated(res.card);
        }
        await fetchTimeline();
      } else {
        addToast?.(res?.message || 'Could not undo changes.', 'warning');
      }
    } catch (err) {
      addToast?.(err.response?.data?.message || 'Failed to undo changes.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRedoEvent = async (ev) => {
    if (!cardId || !ev?.id) return;
    setActionLoadingId(ev.id);
    try {
      const res = await auditApi.redoCardEvent(cardId, ev.id, { event_ids: ev.event_ids });
      if (res && res.success) {
        addToast?.(res.message || 'Field changes redone successfully.', 'success');
        if (res.card && onCardUpdated) {
          onCardUpdated(res.card);
        }
        await fetchTimeline();
      } else {
        addToast?.(res?.message || 'Could not redo changes.', 'warning');
      }
    } catch (err) {
      addToast?.(err.response?.data?.message || 'Failed to redo changes.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!card) return null;

  const studentName =
    card.field_data?.['FULL NAME'] ||
    card.field_data?.['NAME'] ||
    card.field_data?.['STUDENT NAME'] ||
    card.name ||
    'Card Record';

  const getRoleBadgeColor = (role) => {
    const r = String(role || '').toLowerCase();
    if (r.includes('super_admin') || r.includes('prime_admin')) return { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' };
    if (r.includes('operator') || r.includes('admin')) return { bg: '#e0e7ff', text: '#4338ca', border: '#c7d2fe' };
    if (r.includes('manager')) return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' };
    if (r.includes('assistant')) return { bg: '#e0f2fe', text: '#0284c7', border: '#bae6fd' };
    return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
  };

  const getEventIcon = (eventType, summary = '') => {
    const s = String(summary || '').toLowerCase();
    if (s.includes('undid') || s.includes('undo')) {
      return <RotateCcw size={13} color="#d97706" />;
    }
    if (s.includes('redid') || s.includes('redo')) {
      return <RotateCw size={13} color="#0284c7" />;
    }
    switch (eventType) {
      case 'status_change':
      case 'bulk_status':
        return <CheckCircle2 size={13} color="#16a34a" />;
      case 'media_upload':
      case 'media_replace':
      case 'crop_update':
        return <Camera size={13} color="#0d9488" />;
      case 'create':
        return <Sparkles size={13} color="#2563eb" />;
      default:
        return <Edit3 size={13} color="#6366f1" />;
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="drawer-overlay-backdrop"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className="side-drawer-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '640px',
          maxWidth: '95vw',
          height: '100vh',
          background: '#ffffff',
          boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.35)',
          zIndex: 99999999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'drawerSlideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          fontFamily: 'var(--font-family, system-ui, -apple-system, sans-serif)',
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '16px 20px',
            background: '#1e293b',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.4)',
              }}
            >
              <Clock size={18} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Card Activity Timeline
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                {studentName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '6px',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#cbd5e1',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Card Summary Mini-Bar */}
        <div
          style={{
            padding: '10px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: '#475569',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Status:</span>
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                background: '#e0e7ff',
                color: '#3730a3',
                textTransform: 'uppercase',
              }}
            >
              {card.status || 'pending'}
            </span>
          </div>

          <div>
            <span>Events: </span>
            <strong style={{ color: '#0f172a' }}>{totalCount}</strong>
          </div>
        </div>

        {/* Timeline Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            background: '#ffffff',
          }}
        >
          {loading ? (
            <SkeletonTimeline count={5} />
          ) : timeline.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <Clock size={36} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#334155' }}>No activity records found</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Changes to this card will be tracked here in real-time.</p>
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '32px' }}>
              {/* Vertical timeline spine */}
              {timeline.length > 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: '11px',
                    top: '24px',
                    bottom: '24px',
                    width: '2px',
                    background: 'linear-gradient(to bottom, #3b82f6 0%, #60a5fa 35%, #cbd5e1 100%)',
                    zIndex: 1,
                  }}
                />
              )}

              {timeline.map((ev, idx) => {
                const isLatest = idx === 0;
                const roleBadge = getRoleBadgeColor(ev.actor_role);
                const dt = new Date(ev.created_at);
                const timeStr = dt.toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={ev.id || idx}
                    style={{
                      position: 'relative',
                      marginBottom: '18px',
                    }}
                  >
                    {/* Node Dot - Centered vertically to the card */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '-32px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: isLatest ? '#eff6ff' : '#ffffff',
                        border: isLatest ? '2px solid #2563eb' : '2px solid #94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: isLatest ? '0 0 0 4px rgba(37, 99, 235, 0.18)' : '0 1px 3px rgba(0,0,0,0.08)',
                        zIndex: 2,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {getEventIcon(ev.event_type, ev.human_summary)}
                    </div>

                    {/* Timeline Card */}
                    <div
                      style={{
                        background: isLatest ? '#ffffff' : '#f8fafc',
                        border: isLatest ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        boxShadow: isLatest ? '0 2px 8px rgba(37, 99, 235, 0.08)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Top Row: Actor, Badges, Timestamp & Undo/Redo Buttons */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '8px',
                          flexWrap: 'wrap',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                            {ev.actor_name}
                          </span>
                          {ev.actor_role && (
                            <span
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: roleBadge.bg,
                                color: roleBadge.text,
                                border: `1px solid ${roleBadge.border}`,
                              }}
                            >
                              {ev.actor_role}
                            </span>
                          )}
                          {isLatest && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                letterSpacing: '0.03em',
                              }}
                            >
                              Latest
                            </span>
                          )}
                          {ev.is_undone && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                                textTransform: 'uppercase',
                              }}
                            >
                              Undone
                            </span>
                          )}
                        </div>

                        {/* Top-Right: Timestamp + Undo/Redo Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}>{timeStr}</span>

                          {ev.has_text_changes && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              {ev.can_undo && (
                                <button
                                  type="button"
                                  disabled={actionLoadingId === ev.id}
                                  onClick={() => handleUndoEvent(ev)}
                                  style={{
                                    padding: '3px 9px',
                                    borderRadius: '5px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#2563eb',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: actionLoadingId === ev.id ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (actionLoadingId !== ev.id) {
                                      e.currentTarget.style.background = '#eff6ff';
                                      e.currentTarget.style.borderColor = '#93c5fd';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (actionLoadingId !== ev.id) {
                                      e.currentTarget.style.background = '#ffffff';
                                      e.currentTarget.style.borderColor = '#cbd5e1';
                                    }
                                  }}
                                  title="Undo changes from this log entry"
                                >
                                  <RotateCcw size={11} />
                                  <span>{actionLoadingId === ev.id ? 'Undoing...' : 'Undo'}</span>
                                </button>
                              )}
                              {ev.can_redo && (
                                <button
                                  type="button"
                                  disabled={actionLoadingId === ev.id}
                                  onClick={() => handleRedoEvent(ev)}
                                  style={{
                                    padding: '3px 9px',
                                    borderRadius: '5px',
                                    border: '1px solid #93c5fd',
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: actionLoadingId === ev.id ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 2px rgba(37,99,235,0.08)',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (actionLoadingId !== ev.id) {
                                      e.currentTarget.style.background = '#dbeafe';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (actionLoadingId !== ev.id) {
                                      e.currentTarget.style.background = '#eff6ff';
                                    }
                                  }}
                                  title="Redo changes from this log entry"
                                >
                                  <RotateCw size={11} />
                                  <span>{actionLoadingId === ev.id ? 'Redoing...' : 'Redo'}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bulk Transaction Link Badge */}
                      {ev.bulk_transaction && (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'rgba(37, 99, 235, 0.06)',
                            border: '1px solid rgba(37, 99, 235, 0.15)',
                            borderRadius: '4px',
                            padding: '2px 7px',
                            fontSize: '11px',
                            color: '#2563eb',
                            fontWeight: 600,
                            marginBottom: '6px',
                            cursor: onOpenTransaction ? 'pointer' : 'default',
                          }}
                          onClick={() => onOpenTransaction?.(ev.bulk_transaction.id)}
                          title="Click to view full bulk transaction details"
                        >
                          <Layers size={11} />
                          <span>Bulk Batch: <strong>{ev.bulk_transaction.tx_code}</strong></span>
                          {ev.bulk_transaction.requested_count && (
                            <span style={{ color: '#64748b', fontSize: '10.5px' }}>
                              ({ev.bulk_transaction.requested_count} cards)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Clean Card Content: Field Deltas OR Event Summary */}
                      {ev.field_deltas && ev.field_deltas.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                          {ev.field_deltas.map((d, dIdx) => (
                            <div
                              key={dIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12.5px',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <span style={{ fontWeight: 700, color: '#334155' }}>{d.field_name}:</span>
                              <span
                                style={{
                                  color: '#dc2626',
                                  textDecoration: d.before_value !== null ? 'line-through' : 'none',
                                  background: '#fee2e2',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  fontSize: '11.5px',
                                }}
                              >
                                {d.before_value !== null && d.before_value !== undefined && d.before_value !== ''
                                  ? String(d.before_value)
                                  : 'empty'}
                              </span>
                              <ArrowRight size={11} color="#94a3b8" />
                              <span
                                style={{
                                  color: '#16a34a',
                                  fontWeight: 600,
                                  background: '#dcfce7',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  fontSize: '11.5px',
                                }}
                              >
                                {d.after_value !== null && d.after_value !== undefined && d.after_value !== ''
                                  ? String(d.after_value)
                                  : 'empty'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : ev.human_summary ? (
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                          {ev.human_summary}
                        </div>
                      ) : null}

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Event ID: {timeline[0]?.event_id || '—'}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 16px',
              background: '#334155',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </aside>
    </>,
    document.body
  );
}
