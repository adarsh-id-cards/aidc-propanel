import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { cardApi } from '../../../services/api';
import apiClient from '../../../services/api';
import ImageUploadSlot from '../../idcard/ImageUploadSlot';
import { isDropdownField, getOptionsForField } from '../../../utils/formatPresets';
import { getCardFieldValue } from '../../../utils/tableValidation';
import CustomSelect from '../../common/CustomSelect';

const IMAGE_FIELD_TYPES = new Set([
  'photo',
  'image',
  'img',
  'picture',
  'pic',
  'photo_path',
  'rel_photo',
  'mother_photo',
  'father_photo',
  'sign',
  'signature',
  'qr',
  'qrcode',
  'barcode',
]);

const isImageField = (type, name) =>
  IMAGE_FIELD_TYPES.has((type || '').toLowerCase()) ||
  IMAGE_FIELD_TYPES.has((name || '').toLowerCase().replace(/ /g, '_'));

const isNameClassSectionField = (fieldName) => {
  const lower = String(fieldName || '').toLowerCase().replace(/[_ -]/g, '');
  const isName = lower === 'name' || lower === 'studentname' || lower === 'fullname' || lower === 'candidatename' || lower === 'personname';
  const isClass = lower === 'class' || lower === 'cls' || lower === 'standard' || lower === 'grade';
  const isSection = lower === 'section' || lower === 'sec' || lower === 'div' || lower === 'division';
  return isName || isClass || isSection;
};

function Spinner({ size = 16 }) {
  return <Loader2 size={size} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />;
}

export default function CardSideDrawer({
  card,
  srNo,
  mode,
  tableId,
  tableFields,
  onClose,
  onSave,
  addToast,
  status = 'pending',
  userRole = '',
  currentUser = null,
}) {
  const isView = mode === 'view';
  const isReprint = mode === 'reprint';
  const role = String(currentUser?.role || currentUser?.operator_type || userRole || '').toLowerCase();
  const isSuperAdmin = ['super_admin', 'prime_admin'].includes(role) || Boolean(currentUser?.is_superuser);
  const isPhotographer = role === 'photographer' || role.includes('photographer');
  const normStatus = String(status || '').toLowerCase();
  // User directive: "never aproved and printed list never given or never chagne phto same the confirmed list too but hte repriting and requested list can have phto chagned."
  const isLockedStatusForPhoto = !isReprint && ['approved', 'printed', 'confirm'].includes(normStatus);
  const canPhotographerChangePhoto = !isLockedStatusForPhoto;
  const [formData, setFormData] = useState(() => card?.field_data || {});
  const [saving, setSaving] = useState(false);

  const personName = (() => {
    const data = formData || card?.field_data || {};
    const directKeys = [
      'NAME', 'Name', 'name',
      'FULL NAME', 'Full Name', 'full_name',
      'STUDENT NAME', 'Student Name', 'student_name',
      'EMPLOYEE NAME', 'Employee Name', 'employee_name',
      'CANDIDATE NAME', 'Candidate Name',
      'MEMBER NAME', 'Member Name',
      'PERSON NAME', 'Person Name',
    ];
    for (const k of directKeys) {
      if (data[k] && String(data[k]).trim()) {
        return String(data[k]).trim();
      }
    }
    const keys = Object.keys(data);
    const nameKey = keys.find((k) => {
      const lower = k.toLowerCase().trim();
      return (
        (lower === 'name' || lower.endsWith(' name') || lower.endsWith('_name') || lower.includes('student') || lower.includes('employee')) &&
        !lower.includes('father') &&
        !lower.includes('mother') &&
        !lower.includes('husband') &&
        !lower.includes('guardian') &&
        !lower.includes('school') &&
        !lower.includes('college') &&
        !lower.includes('org') &&
        !lower.includes('firm') &&
        !lower.includes('company')
      );
    });
    if (nameKey && data[nameKey] && String(data[nameKey]).trim()) {
      return String(data[nameKey]).trim();
    }
    return '';
  })();

  const displaySrNo = srNo || card?.sr_no || card?.serial_no;

  const handleChange = (field, val) => setFormData((prev) => ({ ...prev, [field]: val }));

  const handleSave = async () => {
    if (isView) {
      onClose();
      return;
    }
    if (isReprint) {
      setSaving(true);
      onSave?.({ card, changes: formData, isReprint: true });
      setSaving(false);
      onClose();
      return;
    }
    setSaving(true);
    const original = card?.field_data || {};

    if (card?.id) {
      let changedEntries = Object.entries(formData).filter(
        ([k, v]) => String(v ?? '').trim().toUpperCase() !== String(original[k] ?? '').trim().toUpperCase()
      );
      if (isPhotographer) {
        changedEntries = changedEntries.filter(([k]) => {
          if (isImageField('', k)) return canPhotographerChangePhoto;
          return isNameClassSectionField(k);
        });
      }
      if (changedEntries.length > 0) {
        try {
          const results = await Promise.all(
            changedEntries.map(([k, v]) => cardApi.updateField(card.id, k, v))
          );
          results.forEach((res, idx) => {
            const [k] = changedEntries[idx];
            const finalVal = res?.data?.value ?? res?.value;
            if (finalVal !== undefined && finalVal !== null) {
              formData[k] = finalVal;
            }
          });
        } catch (e) {
          console.warn('Field update error:', e);
        }
      }
    } else if (tableId) {
      try {
        const res = await apiClient.post(`/api/table/${tableId}/card/create/`, {
          field_data: formData,
          status: 'pending',
        });
        const newCard = res.data?.card || res.data;
        addToast?.('New card created successfully', 'success');
        setSaving(false);
        onSave?.(
          newCard || { id: Date.now(), field_data: formData, status: 'pending', updated_at: new Date().toISOString() }
        );
        onClose();
        return;
      } catch (err) {
        console.warn('API create card error:', err);
      }
    }

    setSaving(false);
    const updatedCard = {
      ...card,
      id: card?.id || Date.now(),
      field_data: formData,
      status: card?.status || 'pending',
      updated_at: new Date().toISOString(),
    };

    addToast?.(card?.id ? 'Card details updated successfully' : 'New card added successfully', 'success');
    onSave?.(updatedCard);
    onClose();
  };

  const fields = Array.isArray(tableFields) ? tableFields : [];

  return createPortal(
    <>
      <div className="drawer-overlay-backdrop" />
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
        }}
      >
        {/* Header */}
        <div
          className="drawer-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            background: '#1e293b',
            color: '#ffffff',
            flexShrink: 0,
          }}
        >
          <div>
            <h3
              className="drawer-title"
              style={{
                fontSize: '18px',
                fontWeight: 700,
                margin: 0,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <UserPlus size={18} style={{ color: '#38bdf8', flexShrink: 0 }} />
              <span style={{ maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {mode === 'add'
                  ? 'Add New Card'
                  : mode === 'edit'
                    ? (personName ? `Edit: ${personName}` : 'Edit Card Record')
                    : (personName ? `View: ${personName}` : 'View Card Record')}
              </span>
              {mode !== 'add' && displaySrNo && (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    background: 'rgba(56, 189, 248, 0.18)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: '4px',
                    padding: '1px 6px',
                    letterSpacing: '0.02em',
                  }}
                  title={`Serial No. ${displaySrNo}`}
                >
                  Sr No. {displaySrNo}
                </span>
              )}
            </h3>
            <span style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
              {isView
                ? 'Read-only card details'
                : displaySrNo
                  ? `Record #${displaySrNo} · Fill in field values and upload images`
                  : 'Fill in field values and upload images'}
            </span>
          </div>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          className="drawer-body"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {fields.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              No fields defined for this table.
            </div>
          ) : (
            <>
              {/* Separate Image slots */}
              {fields.filter((f) => isImageField(f.type, f.name)).length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      fields.filter((f) => isImageField(f.type, f.name)).length === 1
                        ? '1fr'
                        : 'repeat(auto-fit, minmax(270px, 1fr))',
                    gap: '12px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {fields
                    .filter((f) => isImageField(f.type, f.name))
                    .map((f) => {
                      const photoDisabled = isView || (isPhotographer && !canPhotographerChangePhoto);
                      return (
                        <div key={f.name} style={{ pointerEvents: photoDisabled ? 'none' : 'auto', opacity: photoDisabled ? 0.65 : 1 }}>
                          <ImageUploadSlot
                            cardId={card?.id}
                            fieldName={f.name}
                            currentPath={getCardFieldValue(formData, f.name, f) || ''}
                            onUpdate={handleChange}
                            disabled={photoDisabled}
                            isSuperAdmin={isSuperAdmin}
                          />
                          {isPhotographer && !canPhotographerChangePhoto && (
                            <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', textAlign: 'center', fontWeight: 600 }}>
                              Photo editing locked for {normStatus} list
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Text / Dropdown Fields */}
              {fields
                .filter((f) => !isImageField(f.type, f.name))
                .map((f) => {
                  const value = getCardFieldValue(formData, f.name, f) ?? '';
                  const isDropdown = isDropdownField(f);
                  const options = isDropdown ? getOptionsForField(f) : [];
                  const isUnique = Boolean(f.is_unique || f.unique);
                  const isDuplicate = card?.duplicate_fields?.includes(f.name) || (isUnique && card?.is_duplicate);

                  const isNameClassSec = isNameClassSectionField(f.name);
                  const isFieldDisabled = isView || (isPhotographer && !isNameClassSec);

                  return (
                    <div key={f.name} style={{ width: '100%', boxSizing: 'border-box' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '6px',
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: '#475569',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            margin: 0,
                          }}
                        >
                          <span>{f.name}</span>
                          {f.mandatory && <span style={{ color: '#ef4444' }}>*</span>}
                          {isUnique && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#8b5cf6',
                                background: '#f5f3ff',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                border: '1px solid #ddd6fe',
                                textTransform: 'uppercase',
                              }}
                            >
                              UNIQUE
                            </span>
                          )}
                          {isPhotographer && !isNameClassSec && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#64748b',
                                background: '#f1f5f9',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                border: '1px solid #e2e8f0',
                                textTransform: 'uppercase',
                              }}
                            >
                              LOCKED (PHOTO ROLE)
                            </span>
                          )}
                          {isPhotographer && isNameClassSec && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#16a34a',
                                background: '#dcfce7',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                border: '1px solid #bbf7d0',
                                textTransform: 'uppercase',
                              }}
                            >
                              EDITABLE
                            </span>
                          )}
                        </label>

                        {isDuplicate && (
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#b45309',
                              background: '#fef3c7',
                              padding: '1px 6px',
                              borderRadius: '3px',
                              border: '1px solid #fde68a',
                            }}
                          >
                            REPEATING VALUE
                          </span>
                        )}
                      </div>

                      {isDropdown ? (
                        <div style={{ width: '100%' }}>
                          <CustomSelect
                            value={value}
                            disabled={isFieldDisabled}
                            size="md"
                            height="38px"
                            placeholder={`-- SELECT ${f.name} --`}
                            style={{
                              width: '100%',
                              border: isDuplicate ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                              borderRadius: '6px',
                              background: isFieldDisabled ? '#f8fafc' : '#ffffff',
                              cursor: isFieldDisabled ? 'not-allowed' : 'pointer',
                              color: isFieldDisabled ? '#64748b' : '#0f172a',
                            }}
                            menuMaxWidth="100%"
                            menuMinWidth="100%"
                            options={[
                              { value: '', label: `-- SELECT ${f.name} --` },
                              ...(value && !options.includes(value) ? [{ value, label: `${value} (CURRENT VALUE)` }] : []),
                              ...options.map((opt) => ({ value: opt, label: opt })),
                            ]}
                            onChange={(newVal) => handleChange(f.name, (newVal || '').toUpperCase())}
                          />
                        </div>
                      ) : (
                        <input
                          type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                          value={value}
                          disabled={isFieldDisabled}
                          onChange={(e) => handleChange(f.name, e.target.value.toUpperCase())}
                          style={{
                            width: '100%',
                            height: '38px',
                            padding: '0 12px',
                            borderRadius: '6px',
                            border: isDuplicate ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                            fontSize: '14px',
                            fontWeight: 500,
                            textTransform: 'uppercase',
                            background: isFieldDisabled ? '#f8fafc' : '#ffffff',
                            cursor: isFieldDisabled ? 'not-allowed' : 'text',
                            boxSizing: 'border-box',
                            outline: 'none',
                            color: isFieldDisabled ? '#64748b' : '#0f172a',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)',
                          }}
                        />
                      )}

                      {isDuplicate && (
                        <div
                          style={{
                            marginTop: '4px',
                            fontSize: '13px',
                            color: '#b45309',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <AlertCircle size={12} />
                          <span>This value is shared with another card in this table.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </>
          )}
        </div>

        {/* Footer */}
        {!isView && (
          <div
            className="drawer-footer"
            style={{
              height: '56px',
              minHeight: '56px',
              padding: '0 24px',
              borderTop: '1px solid #334155',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              justifyContent: 'flex-end',
              background: '#1e293b',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 18px',
                background: '#334155',
                color: '#ffffff',
                border: '1px solid #475569',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#475569';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#334155';
                e.currentTarget.style.color = '#ffffff';
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 20px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saving ? 'wait' : 'pointer',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1d4ed8';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#2563eb';
                e.currentTarget.style.color = '#ffffff';
              }}
            >
              {saving ? (
                <>
                  <Spinner size={14} /> Saving…
                </>
              ) : (
                <>
                  <Check size={14} /> Save Card
                </>
              )}
            </button>
          </div>
        )}
      </aside>
    </>,
    document.body
  );
}
