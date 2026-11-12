/**
 * tableValidation.js
 *
 * Real-time data validation and duplicate detection engine for CardFlow tables.
 * Emulates Excel-style cell data validation (date, phone, blood group, required, numeric)
 * and conditional duplicate tracking across in-grid rows.
 */

// Common Blood Group standards
const VALID_BLOOD_GROUPS = new Set([
  'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-',
  'A1+', 'A1-', 'A1B+', 'A1B-', 'A2+', 'A2-', 'A2B+', 'A2B-',
  'RH+', 'RH-', 'UNKNOWN'
]);

// Placeholders that should never be flagged as duplicates
const IGNORED_DUPLICATE_VALUES = new Set([
  '', '0', '00', '000', '0000', '000000', '0000000000',
  'N/A', 'NA', 'N.A.', 'N/A.', 'NONE', 'NIL', 'NULL',
  '-', '--', '---', '—', '.', '..', 'NOT_FOUND', 'NOT APPLICABLE',
  'PENDING', 'UNKNOWN', 'DEFAULT', 'NO', 'NO PHONE', 'NO ROLL'
]);

/**
 * Safely and case-insensitively retrieve a field's value from a card or field_data object.
 * Handles exact match, uppercase, lowercase, title-case, snake_case, and whitespace-varied keys.
 * Also handles synthesized path columns (when show_path is enabled on an image field).
 */
export function getCardFieldValue(cardOrFd, fieldName, fieldObj = null) {
  if (!cardOrFd || !fieldName) return '';
  const fd = cardOrFd.field_data || cardOrFd;
  if (!fd || typeof fd !== 'object') return '';

  const nameStr = String(fieldName).trim();
  const upper = nameStr.toUpperCase();

  // Special handling for synthesized path columns
  if (fieldObj?.isPathColumn || /^(?:PHOTO\s+PATH|PATH)$/i.test(upper)) {
    const directPath =
      fd[fieldName] ??
      fd['PATH'] ??
      fd['Path'] ??
      fd['path'] ??
      fd['Photo Path'] ??
      fd['PHOTO PATH'];
    if (directPath !== undefined && directPath !== null && String(directPath).trim()) {
      const s = String(directPath).trim();
      return s.startsWith('PENDING:') ? s.substring(8).trim() : s === 'NOT_FOUND' ? '' : s;
    }
    // Fallback to extracting from the associated photo field
    const sourceKey = fieldObj?.sourceField || 'PHOTO';
    const photoVal = getCardFieldValue(fd, sourceKey);
    if (photoVal && typeof photoVal === 'string') {
      const s = photoVal.trim();
      if (!s || s === 'NOT_FOUND') return '';
      return s.startsWith('PENDING:') ? s.substring(8).trim() : s;
    }
    return '';
  }

  // 1. Direct key match (fastest)
  if (fd[fieldName] !== undefined && fd[fieldName] !== null && fd[fieldName] !== '') {
    return fd[fieldName];
  }

  // 2. Uppercase / lowercase direct lookups
  if (fd[upper] !== undefined && fd[upper] !== null && fd[upper] !== '') {
    return fd[upper];
  }
  const lower = nameStr.toLowerCase();
  if (fd[lower] !== undefined && fd[lower] !== null && fd[lower] !== '') {
    return fd[lower];
  }

  // 3. Scan keys case-insensitively and normalized
  const targetNorm = upper.replace(/[\s_-]+/g, '');
  for (const [k, v] of Object.entries(fd)) {
    if (v === undefined || v === null || v === '') continue;
    const kUpper = String(k).trim().toUpperCase();
    if (kUpper === upper || kUpper.replace(/[\s_-]+/g, '') === targetNorm) {
      return v;
    }
  }

  return '';
}

// Identify field role from column name & type
export function getFieldRole(fieldName = '', fieldType = '') {
  const name = String(fieldName || '').trim().toLowerCase().replace(/[_.\-\s]+/g, ' ');
  const type = String(fieldType || '').trim().toLowerCase();

  if (type === 'photo' || type === 'image' || (type !== 'text' && /photo|image|picture|pic|sign|signature|qr|barcode/i.test(name))) {
    return 'image';
  }
  if (type === 'phone' || /phone|mobile|contact|cell|whatsapp|calling/i.test(name)) {
    return 'phone';
  }
  if (type === 'email' || /email|mail/i.test(name)) {
    return 'email';
  }
  if (type === 'date' || /dob|date of birth|birth date|admission date|joining date|valid upto|expiry/i.test(name)) {
    return 'date';
  }
  if (/blood|bg\b|b\.g\b|blood group/i.test(name)) {
    return 'blood_group';
  }
  if (/aadhaar|aadhar|uid/i.test(name)) {
    return 'aadhaar';
  }
  if (/roll|adm|reg|admission|registration|enroll|scholar|sr no|id no|emp id|employee id/i.test(name)) {
    return 'identifier';
  }
  if (/name|student|father|mother|guardian/i.test(name)) {
    return 'name';
  }
  if (/pin|pincode|zip|postal/i.test(name)) {
    return 'pincode';
  }
  return 'text';
}

/**
 * Validate a single cell value against its column specifications.
 * Non-blocking: returns { isValid: boolean, message?: string, severity?: 'error' | 'warning' }
 */
export function validateCell(field, rawValue, rowData = {}) {
  const fieldName = typeof field === 'string' ? field : field?.name || '';
  const fieldType = typeof field === 'object' ? field?.type || '' : '';
  const role = getFieldRole(fieldName, fieldType);
  const val = rawValue !== null && rawValue !== undefined ? String(rawValue).trim() : '';

  if (role === 'image') {
    return { isValid: true };
  }

  // 1. Mandatory / Required check
  const lowerName = fieldName.toLowerCase();
  const isRequired = Boolean(
    field?.is_required ||
    field?.required ||
    (field?.is_required !== false && (lowerName === 'name' || lowerName === 'student name' || lowerName === 'student_name' || lowerName === 'full name' || lowerName === 'full_name'))
  );

  if (!val) {
    if (isRequired) {
      return {
        isValid: false,
        message: `${fieldName} is required`,
        severity: 'warning',
      };
    }
    return { isValid: true };
  }

  // Placeholders skip formatting validation if not required
  const isPlaceholder = /^(n\/?a|none|nil|null|-|—|\.)$/i.test(val);
  if (isPlaceholder && !isRequired) {
    return { isValid: true };
  }

  // 2. Name validation
  if (role === 'name') {
    if (/^\d+$/.test(val)) {
      return {
        isValid: false,
        message: 'Name cannot contain only numbers',
        severity: 'error',
      };
    }
    if (val.length < 2 && !isPlaceholder) {
      return {
        isValid: false,
        message: 'Name is too short',
        severity: 'warning',
      };
    }
  }

  // 3. Phone / Mobile validation (supports multi-phone numbers separated by / or ,)
  if (role === 'phone') {
    if (isPlaceholder) return { isValid: true };
    const phoneParts = val.split(/[/,;]+/).map((p) => p.trim()).filter(Boolean);
    for (const part of phoneParts) {
      const digitsOnly = part.replace(/\D/g, '');
      const hasAlpha = /[a-zA-Z]/.test(part);
      if (hasAlpha) {
        return {
          isValid: false,
          message: 'Phone number cannot contain letters',
          severity: 'error',
        };
      }
      if (
        digitsOnly.length !== 10 &&
        !(digitsOnly.length === 11 && digitsOnly.startsWith('0')) &&
        !(digitsOnly.length === 12 && digitsOnly.startsWith('91')) &&
        !(digitsOnly.length >= 7 && digitsOnly.length <= 15)
      ) {
        return {
          isValid: false,
          message: `Phone must be valid (10 digits, got ${digitsOnly.length})`,
          severity: 'error',
        };
      }
    }
  }

  // 4. Date / DOB validation
  if (role === 'date') {
    if (isPlaceholder) return { isValid: true };
    const cleanDate = val.split(/[ T]/)[0];
    const dmyMatch = cleanDate.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    const ymdMatch = cleanDate.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    let d, m, y;
    if (dmyMatch) {
      d = parseInt(dmyMatch[1], 10);
      m = parseInt(dmyMatch[2], 10);
      y = parseInt(dmyMatch[3], 10);
    } else if (ymdMatch) {
      y = parseInt(ymdMatch[1], 10);
      m = parseInt(ymdMatch[2], 10);
      d = parseInt(ymdMatch[3], 10);
    } else {
      const parsedTs = Date.parse(val);
      if (!isNaN(parsedTs)) {
        return { isValid: true };
      }
      return {
        isValid: false,
        message: 'Invalid date format (expected DD/MM/YYYY)',
        severity: 'warning',
      };
    }

    if (m < 1 || m > 12) {
      return { isValid: false, message: 'Invalid month in date (1-12)', severity: 'error' };
    }
    const daysInMonth = new Date(y, m, 0).getDate();
    if (d < 1 || d > daysInMonth) {
      return { isValid: false, message: `Invalid day for month (${d}/${m})`, severity: 'error' };
    }
    if (y < 1920 || y > 2050) {
      return { isValid: false, message: `Year out of range (${y})`, severity: 'warning' };
    }
  }

  // 5. Blood Group validation
  if (role === 'blood_group') {
    if (isPlaceholder) return { isValid: true };
    const normalizedBg = val.replace(/\s+/g, '').toUpperCase();
    if (!VALID_BLOOD_GROUPS.has(normalizedBg)) {
      return {
        isValid: false,
        message: `Unrecognized blood group "${val}" (e.g. A+, B+, O+)`,
        severity: 'warning',
      };
    }
  }

  // 6. Aadhaar / UID validation
  if (role === 'aadhaar') {
    if (isPlaceholder) return { isValid: true };
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length !== 12 || /[a-zA-Z]/.test(val)) {
      return {
        isValid: false,
        message: 'Aadhaar must be 12 numeric digits',
        severity: 'error',
      };
    }
  }

  // 7. Pincode validation
  if (role === 'pincode') {
    if (isPlaceholder) return { isValid: true };
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length !== 6 || /[a-zA-Z]/.test(val)) {
      return {
        isValid: false,
        message: 'PIN code must be 6 digits',
        severity: 'warning',
      };
    }
  }

  // 8. Email validation
  if (role === 'email') {
    if (isPlaceholder) return { isValid: true };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) {
      return {
        isValid: false,
        message: 'Invalid email address format',
        severity: 'error',
      };
    }
  }

  return { isValid: true };
}

/**
 * Scan all loaded cards in memory to identify duplicates across identity & unique columns.
 * Returns: {
 *   cardDuplicates: { [cardId]: { [fieldName]: { count: number, duplicateCardIds: number[] } } },
 *   duplicateSummary: { totalDuplicateCards: number, totalDuplicateCells: number, fieldCounts: { [fieldName]: number } }
 * }
 */
export function findGridDuplicates(cards = [], fields = []) {
  if (!cards?.length || !fields?.length) {
    return {
      cardDuplicates: {},
      duplicateSummary: { totalDuplicateCards: 0, totalDuplicateCells: 0, fieldCounts: {} },
    };
  }

  // Select fields to check for duplicates:
  // 1. Explicitly configured as unique (is_unique || unique)
  // 2. Identity columns (Roll No, Adm No, Reg No, Scholar No, Student ID, Phone)
  const candidateFields = fields.filter((f) => {
    if (f.is_unique || f.unique) return true;
    const role = getFieldRole(f.name, f.type);
    return role === 'identifier' || role === 'phone' || role === 'aadhaar' || role === 'email';
  });

  if (!candidateFields.length) {
    return {
      cardDuplicates: {},
      duplicateSummary: { totalDuplicateCards: 0, totalDuplicateCells: 0, fieldCounts: {} },
    };
  }

  // Map of fieldName -> normalizedValue -> array of cardIds
  const valueMap = {};
  candidateFields.forEach((f) => {
    valueMap[f.name] = new Map();
  });

  cards.forEach((card) => {
    if (!card || card.status === 'deleted') return;
    const fd = card.field_data || {};
    candidateFields.forEach((f) => {
      const rawVal = getCardFieldValue(card, f.name, f);
      if (rawVal !== undefined && rawVal !== null) {
        const strVal = String(rawVal).trim().toUpperCase();
        if (
          strVal &&
          !IGNORED_DUPLICATE_VALUES.has(strVal) &&
          !strVal.startsWith('PENDING:')
        ) {
          const map = valueMap[f.name];
          if (!map.has(strVal)) {
            map.set(strVal, []);
          }
          map.get(strVal).push(card.id);
        }
      }
    });
  });

  // Collect duplicate results
  const cardDuplicates = {};
  const duplicateCardsSet = new Set();
  const fieldCounts = {};
  let totalDuplicateCells = 0;

  candidateFields.forEach((f) => {
    const map = valueMap[f.name];
    map.forEach((cardIds, val) => {
      if (cardIds.length > 1) {
        fieldCounts[f.name] = (fieldCounts[f.name] || 0) + cardIds.length;
        cardIds.forEach((cid) => {
          duplicateCardsSet.add(cid);
          totalDuplicateCells += 1;
          if (!cardDuplicates[cid]) {
            cardDuplicates[cid] = {};
          }
          cardDuplicates[cid][f.name] = {
            count: cardIds.length,
            value: val,
            duplicateCardIds: cardIds.filter((id) => id !== cid),
          };
        });
      }
    });
  });

  return {
    cardDuplicates,
    duplicateSummary: {
      totalDuplicateCards: duplicateCardsSet.size,
      totalDuplicateCells,
      fieldCounts,
    },
  };
}

/**
 * Compute validation report for an entire card row.
 */
export function getCardIssues(card, fields = [], cardDuplicateInfo = {}) {
  if (!card) return { errors: [], warnings: [], hasIssues: false };
  const fd = card.field_data || {};
  const errors = [];
  const warnings = [];

  // Check validation rules per field
  fields.forEach((f) => {
    const val = getCardFieldValue(card, f.name, f);
    const result = validateCell(f, val, fd);
    if (!result.isValid) {
      if (result.severity === 'error') {
        errors.push({ field: f.name, message: result.message });
      } else {
        warnings.push({ field: f.name, message: result.message });
      }
    }
  });

  // Check duplicate issues
  const dupFields = Object.keys(cardDuplicateInfo || {});
  dupFields.forEach((fName) => {
    const dup = cardDuplicateInfo[fName];
    warnings.push({
      field: fName,
      message: `Duplicate value repeated in ${dup.count} cards`,
      isDuplicate: true,
      count: dup.count,
    });
  });

  return {
    errors,
    warnings,
    hasIssues: errors.length > 0 || warnings.length > 0,
    totalIssues: errors.length + warnings.length,
  };
}
/**
 * Compute sort rank for classes, sorting from small class on top to big on bottom,
 * and higher degrees/courses alphabetically.
 */
export function getClassSortRank(val) {
  if (!val) return 9999;
  const s = String(val).trim().toUpperCase();

  // Pre-school ranks
  if (/^(?:PLAY|PG|PRE[-\s]?NUR)/i.test(s)) return 1;
  if (/^(?:NUR|NURSERY)/i.test(s)) return 2;
  if (/^(?:LKG|L\.K\.G|KG[-\s]?1|KG[-\s]?I\b)/i.test(s)) return 3;
  if (/^(?:UKG|U\.K\.G|KG[-\s]?2|KG[-\s]?II\b)/i.test(s)) return 4;

  // Match Roman numerals I to XII
  const romanMap = {
    'I': 10, 'II': 20, 'III': 30, 'IV': 40, 'V': 50, 'VI': 60,
    'VII': 70, 'VIII': 80, 'IX': 90, 'X': 100, 'XI': 110, 'XII': 120
  };
  const cleanRoman = s.replace(/^(?:CLASS|STD|GRADE)\s+/i, '').trim();
  if (romanMap[cleanRoman] !== undefined) {
    return romanMap[cleanRoman];
  }

  // Match digits (e.g. "1st", "2nd", "10th", "Class 5", "Grade 8")
  const digitMatch = s.match(/\b(\d+)(?:ST|ND|RD|TH)?\b/);
  if (digitMatch) {
    const num = parseInt(digitMatch[1], 10);
    return 10 * num;
  }

  // Higher rank for arbitrary text/courses (e.g. "BCA", "B.Tech", "Alpha")
  return 1000;
}

export function compareClasses(a, b) {
  const labelA = typeof a === 'object' ? String(a?.label || a?.display || a?.value || '') : String(a || '');
  const labelB = typeof b === 'object' ? String(b?.label || b?.display || b?.value || '') : String(b || '');

  const rankA = getClassSortRank(labelA);
  const rankB = getClassSortRank(labelB);

  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: 'base' });
}
