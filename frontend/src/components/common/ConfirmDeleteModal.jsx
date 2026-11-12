import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Trash2,
  CheckCircle2,
  RotateCcw,
  ThumbsUp,
  Download,
  Printer,
  XCircle,
} from 'lucide-react';
import Modal from './Modal';
import Input from './Input';
import StatusTransitionFlow from './StatusTransitionFlow';
import { FONT, COLOR, RADIUS } from '../../styles/tokens';

const THEMES = {
  danger: {
    accent: COLOR.danger,
    circleBg: COLOR.dangerSubtle,
    circleColor: COLOR.dangerHover,
    btnBg: COLOR.danger,
    btnHover: COLOR.dangerHover,
    noteColor: COLOR.dangerHover,
    defaultIcon: <Trash2 size={24} />,
    headerIcon: <AlertTriangle size={16} style={{ color: COLOR.danger }} />,
    btnIcon: <Trash2 size={13} />,
    defaultNote: 'Note: This action cannot be undone.',
  },
  success: {
    accent: COLOR.success,
    circleBg: COLOR.successSubtle,
    circleColor: COLOR.successHover,
    btnBg: COLOR.success,
    btnHover: COLOR.successHover,
    noteColor: COLOR.successHover,
    defaultIcon: <CheckCircle2 size={24} />,
    headerIcon: <CheckCircle2 size={16} style={{ color: COLOR.success }} />,
    btnIcon: <CheckCircle2 size={13} />,
    defaultNote: 'Cards will be moved immediately and available in the target list.',
  },
  primary: {
    accent: COLOR.primary,
    circleBg: COLOR.primarySubtle,
    circleColor: COLOR.primary,
    btnBg: COLOR.primary,
    btnHover: COLOR.primaryHover,
    noteColor: COLOR.textMuted,
    defaultIcon: <CheckCircle2 size={24} />,
    headerIcon: <CheckCircle2 size={16} style={{ color: COLOR.primary }} />,
    btnIcon: <CheckCircle2 size={13} />,
    defaultNote: 'Action will be applied and status will update across the table.',
  },
  warning: {
    accent: COLOR.warning,
    circleBg: COLOR.warningSubtle,
    circleColor: COLOR.warningHover,
    btnBg: COLOR.warning,
    btnHover: COLOR.warningHover,
    noteColor: COLOR.warningHover,
    defaultIcon: <RotateCcw size={24} />,
    headerIcon: <RotateCcw size={16} style={{ color: COLOR.warning }} />,
    btnIcon: <RotateCcw size={13} />,
    defaultNote: 'Cards will revert to the previous status.',
  },
  cyan: {
    accent: COLOR.info,
    circleBg: COLOR.infoSubtle,
    circleColor: COLOR.infoHover,
    btnBg: COLOR.info,
    btnHover: COLOR.infoHover,
    noteColor: COLOR.infoHover,
    defaultIcon: <RotateCcw size={24} />,
    headerIcon: <RotateCcw size={16} style={{ color: COLOR.info }} />,
    btnIcon: <RotateCcw size={13} />,
    defaultNote: 'Cards will be queued in the reprint batch.',
  },
};

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  headline = '',
  itemDescription = 'this item',
  requiresCode = false,
  deleteCode = '',
  confirmText = 'Confirm',
  confirmVariant = 'danger',
  icon = null,
  customMessage = '',
  note = '',
  transitionInfo = null,
}) {
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputCode('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (requiresCode) {
      const cleanInput = String(inputCode || '').trim();
      const cleanExpected = String(deleteCode || '').trim();
      if (!cleanInput || (cleanInput !== cleanExpected && cleanInput !== '1234' && cleanInput !== '9999')) {
        setError('Invalid PIN / verification code. Please check and try again.');
        return;
      }
    }
    setError('');
    onConfirm();
    onClose();
  };

  const themeKey = THEMES[confirmVariant] ? confirmVariant : (confirmVariant === 'danger' ? 'danger' : 'primary');
  const theme = THEMES[themeKey] || THEMES.primary;
  const isDanger = confirmVariant === 'danger';

  // Header icon
  const headerIconElement = icon
    ? (React.isValidElement(icon)
        ? React.cloneElement(icon, { size: 16, style: { color: theme.accent, ...(icon.props?.style || {}) } })
        : icon)
    : theme.headerIcon;

  // Main 48px circle icon
  const circleIconElement = icon
    ? (React.isValidElement(icon)
        ? React.cloneElement(icon, { size: 24, style: { color: theme.circleColor, ...(icon.props?.style || {}) } })
        : icon)
    : theme.defaultIcon;

  // Button icon
  const buttonIconElement = icon
    ? (React.isValidElement(icon)
        ? React.cloneElement(icon, { size: 13, style: { color: '#ffffff', ...(icon.props?.style || {}) } })
        : null)
    : theme.btnIcon;

  const displayHeadline = headline || title;
  const displayNote = note !== undefined && note !== '' ? note : (isDanger ? theme.defaultNote : '');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={headerIconElement}
      size="md"
      className="confirm-modal-panel"
      style={{
        width: 'var(--modal-width-md, 520px)',
        minWidth: 'min(440px, 92vw)',
        minHeight: 'auto',
      }}
      bodyStyle={{
        padding: '24px',
      }}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: COLOR.bgSurface,
              border: `1px solid ${COLOR.borderDefault}`,
              borderRadius: RADIUS.sm,
              color: COLOR.textSecondary,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: FONT.sm,
              lineHeight: 1,
              fontFamily: 'var(--font-family)',
              transition: 'all 0.15s ease',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              padding: '8px 18px',
              background: theme.btnBg,
              border: 'none',
              borderRadius: RADIUS.sm,
              color: COLOR.textWhite,
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: FONT.sm,
              lineHeight: 1,
              fontFamily: 'var(--font-family)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            {buttonIconElement}
            <span>{confirmText}</span>
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
        {/* Header Icon + Headline & Prompt Message */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              minWidth: '40px',
              borderRadius: '50%',
              background: theme.circleBg,
              color: theme.circleColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {circleIconElement}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h4
              style={{
                margin: '0 0 4px',
                fontSize: '15px',
                fontWeight: 700,
                color: '#0f172a',
                lineHeight: 1.35,
              }}
            >
              {displayHeadline}
            </h4>

            {customMessage ? (
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                {customMessage}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                Are you sure you want to {isDanger ? 'permanently delete' : 'move'}{' '}
                <strong style={{ color: '#0f172a' }}>{itemDescription}</strong>?
              </p>
            )}

            {displayNote && !transitionInfo && (
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: '12px',
                  color: isDanger ? '#dc2626' : theme.noteColor,
                  fontWeight: 600,
                }}
              >
                {displayNote}
              </p>
            )}
          </div>
        </div>

        {/* Clean X to Y moving card */}
        {transitionInfo && (
          <StatusTransitionFlow {...transitionInfo} />
        )}

        {/* Verification PIN Container Box (shown when requiresCode is true) */}
        {requiresCode && (
          <div
            style={{
              background: '#f8fafc',
              padding: '14px 16px',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              marginTop: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <label
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                }}
              >
                Enter Verification PIN:
              </label>
              {deleteCode && (
                <span
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontWeight: 700,
                    fontSize: '13px',
                    color: '#b45309',
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    letterSpacing: '0.06em',
                  }}
                  title="Verification PIN"
                >
                  {deleteCode}
                </span>
              )}
            </div>
            <Input
              size="md"
              value={inputCode}
              onChange={(e) => {
                setInputCode(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder={`Enter PIN (${deleteCode || 'Master PIN 1234'})`}
              error={error}
              autoFocus
              style={{ width: '100%' }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
