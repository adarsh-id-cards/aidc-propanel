"""
Field Mapping Service — Schema Compatibility, Synonym Resolution & Mapping Validation.

Powers:
- Workflow A: Mapping collected standalone fields to newly created or custom tables.
- Workflow B: Mapping incoming submissions to existing table schemas.
- Automatic matching with exact, tokenized, and educational demographic alias resolution.
- 1-to-1 mapping guarantee, type compatibility, and interactive mapping preview generation.
"""

import logging
import re

logger = logging.getLogger(__name__)


class FieldMappingService:
    """
    Intelligent schema compatibility, alias resolution, and field mapping engine.
    """

    KNOWN_ALIASES = {
        'name': [
            'student name', 'student_name', 'name', 'pupil name',
            'candidate name', 'student', 'full name', 'first name',
            'student full name', 'full student name', 'studentname',
        ],
        'roll_no': [
            'roll no', 'roll_no', 'roll number', 'rollno', 'admission no',
            'admission_no', 'adm no', 'id no', 'scholar no', 'enrollment no', 'registration no',
            'roll', 'adm number', 'scholar number',
        ],
        'class': ['class', 'standard', 'grade', 'std', 'class/grade', 'academic class', 'class / standard'],
        'section': ['section', 'sec', 'division', 'div'],
        'father_name': ['father name', 'father_name', 'fathers name', 'father', 'guardian name', 'parent name', 'father full name'],
        'mother_name': ['mother name', 'mother_name', 'mothers name', 'mother', 'mother full name'],
        'phone': [
            'phone', 'mobile', 'mobile no', 'contact', 'contact no', 'whatsapp', 'phone no', 'cell', 'telephone',
            'mobile contact', 'mobile number', 'phone number', 'contact number', 'parent contact', 'emergency contact',
        ],
        'dob': ['dob', 'date of birth', 'birth date', 'birthdate'],
        'photo': ['photo', 'image', 'picture', 'student photo', 'photograph', 'pic', 'portrait', 'student image'],
        'blood_group': ['blood group', 'blood_group', 'blood', 'bg'],
        'address': ['address', 'residential address', 'residence', 'current address', 'permanent address'],
    }

    IMAGE_TYPES = {'photo', 'rel_photo', 'signature', 'image'}

    @classmethod
    def normalize_token(cls, field_name):
        """Normalize field label: lowercase, trimmed, underscores/hyphens replaced with spaces."""
        if not field_name:
            return ''
        s = str(field_name).strip().lower().replace('_', ' ').replace('-', ' ')
        return ' '.join(s.split())

    @classmethod
    def find_best_match(cls, source_field, candidate_fields):
        """
        Identify the highest confidence destination field for a source collection field.
        Returns: (matched_candidate_name: str or None, match_type: str)
        """
        src_norm = cls.normalize_token(source_field)
        if not src_norm:
            return None, 'UNMAPPED'

        candidate_norms = {cls.normalize_token(c): c for c in candidate_fields}

        # 1. Exact case-insensitive / normalized match
        if src_norm in candidate_norms:
            return candidate_norms[src_norm], 'EXACT'

        # 2. Known educational alias resolution
        for canonical_key, aliases in cls.KNOWN_ALIASES.items():
            if src_norm in aliases:
                for cand_norm, cand_orig in candidate_norms.items():
                    if cand_norm in aliases:
                        return cand_orig, 'ALIAS'

        # 3. Fuzzy substring containment
        for cand_norm, cand_orig in candidate_norms.items():
            if src_norm in cand_norm or cand_norm in src_norm:
                return cand_orig, 'FUZZY'

        return None, 'UNMAPPED'

    @classmethod
    def validate_mapping(cls, mapping, source_schema, destination_schema):
        """
        Validate proposed field mapping for consistency, type compatibility, and 1-to-1 guarantees.
        mapping: dict {source_field_name: destination_field_name}
        source_schema: list of dicts [{'name': ..., 'type': ...}]
        destination_schema: list of dicts [{'name': ..., 'type': ..., 'required': ...}]

        Returns: (is_valid: bool, errors: list, warnings: list)
        """
        errors = []
        warnings = []

        src_types = {cls.normalize_token(f.get('name')): f.get('type', 'text').lower() for f in (source_schema or [])}
        dest_types = {cls.normalize_token(f.get('name')): f.get('type', 'text').lower() for f in (destination_schema or [])}
        dest_required = {cls.normalize_token(f.get('name')): f.get('required', False) for f in (destination_schema or [])}

        used_destinations = {}

        for src_field, dest_field in mapping.items():
            if not dest_field:
                continue

            src_norm = cls.normalize_token(src_field)
            dest_norm = cls.normalize_token(dest_field)

            # 1. 1-to-1 Guarantee: Never map two different source fields into one destination field
            if dest_norm in used_destinations:
                errors.append(
                    f"Conflicting mapping: Destination field '{dest_field}' is mapped to multiple source fields "
                    f"('{used_destinations[dest_norm]}' and '{src_field}'). Each destination must be unique."
                )
            else:
                used_destinations[dest_norm] = src_field

            # 2. Type Compatibility Check
            src_t = src_types.get(src_norm, 'text')
            dest_t = dest_types.get(dest_norm, 'text')

            src_is_img = src_t in cls.IMAGE_TYPES
            dest_is_img = dest_t in cls.IMAGE_TYPES

            if src_is_img and not dest_is_img:
                errors.append(f"Type mismatch: Photo field '{src_field}' cannot be mapped to text/scalar destination '{dest_field}'.")
            elif not src_is_img and dest_is_img:
                errors.append(f"Type mismatch: Text field '{src_field}' cannot be mapped to image destination '{dest_field}'.")

        # 3. Check for unmapped required destination fields
        mapped_dest_norms = set(used_destinations.keys())
        for d_norm, is_req in dest_required.items():
            if is_req and d_norm not in mapped_dest_norms:
                warnings.append(f"Required destination field '{d_norm.upper()}' is not mapped to any collection field.")

        is_valid = len(errors) == 0
        return is_valid, errors, warnings

    @classmethod
    def generate_mapping_preview(cls, source_schema, destination_schema, existing_mapping=None):
        """
        Generate complete, structured mapping preview for UI wizard and backend validation.
        source_schema: list of field dicts or field names
        destination_schema: list of field dicts or field names
        existing_mapping: dict of {source_field: destination_field}

        Returns: {
            'mappings': list of preview rows,
            'unmapped_sources': list,
            'unmapped_destinations': list,
            'is_valid': bool,
            'errors': list,
            'warnings': list,
        }
        """
        existing_mapping = existing_mapping or {}

        # Normalize schemas to dict lists
        src_list = []
        for s in (source_schema or []):
            if isinstance(s, dict):
                src_list.append(s)
            else:
                src_list.append({'name': str(s), 'type': 'photo' if 'photo' in str(s).lower() else 'text'})

        dest_list = []
        for d in (destination_schema or []):
            if isinstance(d, dict):
                dest_list.append(d)
            else:
                dest_list.append({'name': str(d), 'type': 'photo' if 'photo' in str(d).lower() else 'text', 'required': False})

        dest_field_names = [d.get('name') for d in dest_list]
        dest_field_norms = {cls.normalize_token(d.get('name')): d for d in dest_list}

        mappings = []
        assigned_destinations = set()

        for sf in src_list:
            s_name = sf.get('name', '')
            s_type = sf.get('type', 'text')

            # Check if user explicitly provided mapping
            target_dest = existing_mapping.get(s_name)
            match_type = 'MANUAL' if target_dest else None

            if not target_dest:
                # Run auto-matcher
                target_dest, match_type = cls.find_best_match(s_name, dest_field_names)

            status = 'MATCHED' if target_dest else 'UNMAPPED'
            message = ''

            if target_dest:
                d_norm = cls.normalize_token(target_dest)
                d_info = dest_field_norms.get(d_norm, {})
                d_type = d_info.get('type', 'text')

                src_is_img = s_type.lower() in cls.IMAGE_TYPES
                dest_is_img = d_type.lower() in cls.IMAGE_TYPES

                if src_is_img != dest_is_img:
                    status = 'CONFLICT'
                    message = f"Type mismatch: '{s_type}' -> '{d_type}'"
                elif d_norm in assigned_destinations:
                    status = 'CONFLICT'
                    message = f"Duplicate assignment: '{target_dest}' already mapped"
                else:
                    assigned_destinations.add(d_norm)
                    message = f"Auto-mapped via {match_type.lower()} rule" if match_type != 'MANUAL' else 'Manually configured'
            else:
                message = "Not mapped to any destination column (data will be retained in history)"

            mappings.append({
                'source_field': s_name,
                'source_type': s_type,
                'destination_field': target_dest,
                'match_type': match_type or 'UNMAPPED',
                'status': status,
                'message': message,
            })

        # Calculate unmapped fields
        mapped_src_names = {m['source_field'] for m in mappings if m['destination_field']}
        unmapped_sources = [sf['name'] for sf in src_list if sf['name'] not in mapped_src_names]

        mapped_dest_norms = {cls.normalize_token(m['destination_field']) for m in mappings if m['destination_field']}
        unmapped_destinations = [d['name'] for d in dest_list if cls.normalize_token(d['name']) not in mapped_dest_norms]

        # Run validation
        effective_map = {m['source_field']: m['destination_field'] for m in mappings if m['destination_field']}
        is_valid, errors, warnings = cls.validate_mapping(effective_map, src_list, dest_list)

        return {
            'mappings': mappings,
            'unmapped_sources': unmapped_sources,
            'unmapped_destinations': unmapped_destinations,
            'is_valid': is_valid and not any(m['status'] == 'CONFLICT' for m in mappings),
            'errors': errors,
            'warnings': warnings,
        }
