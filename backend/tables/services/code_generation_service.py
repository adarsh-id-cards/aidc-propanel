import io
import os
import re
import logging
from typing import Dict, Any, List, Optional
from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)


class CodeGenerationService:
    """
    Service for generating 2D QR Codes and 1D Barcodes for ID Cards.

    Supports:
    1. Dynamic generation from another column (e.g. Admission No, Roll No, Student ID)
       with optional prefix and suffix.
    2. Static generation from fixed text or URL (e.g. school portal verification link).
    """

    @staticmethod
    def is_code_field(field_config: dict) -> bool:
        """Return True if field represents a QR Code or Barcode."""
        if not isinstance(field_config, dict):
            return False
        ftype = str(field_config.get('type') or '').lower().strip()
        fname = str(field_config.get('name') or '').lower().strip()
        return (
            ftype in ('qr_code', 'qrcode', 'qr', 'barcode') or
            'barcode' in fname or
            bool(re.search(r'\bqr[\s_-]?code?\b', fname))
        )

    @staticmethod
    def is_qr_field(field_config: dict) -> bool:
        """Return True if field is specifically a QR Code."""
        if not isinstance(field_config, dict):
            return False
        ftype = str(field_config.get('type') or '').lower().strip()
        fname = str(field_config.get('name') or '').lower().strip()
        return ftype in ('qr_code', 'qrcode', 'qr') or bool(re.search(r'\bqr[\s_-]?code?\b', fname))

    @staticmethod
    def is_barcode_field(field_config: dict) -> bool:
        """Return True if field is specifically a Barcode."""
        if not isinstance(field_config, dict):
            return False
        ftype = str(field_config.get('type') or '').lower().strip()
        fname = str(field_config.get('name') or '').lower().strip()
        return ftype == 'barcode' or 'barcode' in fname

    @classmethod
    def generate_qr_bytes(cls, value: str) -> bytes:
        """Generate high-contrast PNG bytes for a QR code."""
        try:
            import qrcode
            qr = qrcode.QRCode(
                version=None,  # Auto-size
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=10,
                border=2,
            )
            qr.add_data(str(value))
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue()
        except ImportError:
            from reportlab.graphics.barcode.qr import QrCodeWidget
            from reportlab.graphics.shapes import Drawing
            from reportlab.graphics import renderPM

            safe_val = str(value).strip() or " "
            qr_widget = QrCodeWidget(safe_val)
            bounds = qr_widget.getBounds()
            w = bounds[2] - bounds[0]
            h = bounds[3] - bounds[1]
            size = 300
            d = Drawing(size, size, transform=[size / w, 0, 0, size / h, 0, 0])
            d.add(qr_widget)
            buf = io.BytesIO()
            renderPM.drawToFile(d, buf, fmt='PNG')
            return buf.getvalue()

    @classmethod
    def generate_barcode_bytes(cls, value: str) -> bytes:
        """Generate high-contrast Code 128 PNG bytes for a 1D barcode."""
        from reportlab.graphics.barcode import createBarcodeDrawing
        from reportlab.graphics import renderPM

        safe_val = str(value).strip()
        if not safe_val:
            safe_val = "000000"

        drawing = createBarcodeDrawing(
            'Code128',
            value=safe_val,
            barWidth=1.5,
            barHeight=50,
            humanReadable=True,
            fontSize=9,
        )
        buf = io.BytesIO()
        renderPM.drawToFile(drawing, buf, fmt="PNG")
        return buf.getvalue()

    @classmethod
    def resolve_code_value(cls, card, field_config: dict) -> str:
        """
        Determine the raw text value to encode for the given field configuration on a card.
        """
        code_cfg = field_config.get('code_config') or {}
        mode = (
            field_config.get('code_mode') or
            code_cfg.get('mode') or
            ('static' if field_config.get('static_value') or code_cfg.get('static_value') else 'column')
        )

        if mode == 'static':
            return str(field_config.get('static_value') or code_cfg.get('static_value') or '').strip()

        # Dynamic from column
        source_col = str(
            field_config.get('source_column') or
            code_cfg.get('source_column') or
            ''
        ).strip()

        if not source_col:
            return ''

        field_data = getattr(card, 'field_data', {}) or {}
        raw_val = ''

        # Case-insensitive / whitespace-tolerant lookup
        target_norm = source_col.upper().replace('_', ' ').replace('-', ' ').strip()
        for k, v in field_data.items():
            if str(k).upper().replace('_', ' ').replace('-', ' ').strip() == target_norm:
                raw_val = str(v or '').strip()
                break

        if not raw_val:
            return ''

        prefix = str(field_config.get('code_prefix') or code_cfg.get('prefix') or '')
        suffix = str(field_config.get('code_suffix') or code_cfg.get('suffix') or '')
        return f"{prefix}{raw_val}{suffix}".strip()

    @classmethod
    def generate_and_save_code_for_card(
        cls,
        card,
        field_config: dict,
        table_id: Optional[int] = None,
    ) -> Optional[str]:
        """
        Generate image file for a code field on an ID card and return relative media path.
        """
        if not cls.is_code_field(field_config):
            return None

        val_to_encode = cls.resolve_code_value(card, field_config)
        if not val_to_encode:
            return None

        t_id = table_id or getattr(card, 'table_id', 0)
        c_id = getattr(card, 'id', 'new')
        field_name = str(field_config.get('name') or 'code')
        safe_slug = re.sub(r'[^a-zA-Z0-9_]', '_', field_name).lower()

        # Destination directory: media/generated_codes/table_<table_id>/
        table_dir = os.path.join(settings.MEDIA_ROOT, 'generated_codes', f'table_{t_id}')
        os.makedirs(table_dir, exist_ok=True)

        filename = f"{safe_slug}_{c_id}.png"
        abs_filepath = os.path.join(table_dir, filename)
        rel_filepath = f"generated_codes/table_{t_id}/{filename}"

        try:
            if cls.is_qr_field(field_config):
                png_bytes = cls.generate_qr_bytes(val_to_encode)
            else:
                png_bytes = cls.generate_barcode_bytes(val_to_encode)

            with open(abs_filepath, 'wb') as f:
                f.write(png_bytes)

            return rel_filepath
        except Exception as exc:
            logger.error("Failed to generate code image for card %s field %s: %s", c_id, field_name, exc)
            return None

    @classmethod
    def generate_codes_for_card(cls, card, table=None, save: bool = True) -> Dict[str, str]:
        """
        Generate codes for all configured code fields for a single card.
        Updates card.field_data in-place and optionally saves.
        """
        tbl = table or getattr(card, 'table', None)
        if not tbl:
            return {}

        fields = tbl.fields or []
        code_fields = [f for f in fields if cls.is_code_field(f)]
        if not code_fields:
            return {}

        field_data = dict(card.field_data or {})
        updated = {}

        for f in code_fields:
            fname = f.get('name')
            if not fname:
                continue

            rel_path = cls.generate_and_save_code_for_card(card, f, table_id=tbl.id)
            if rel_path:
                field_data[fname] = rel_path
                updated[fname] = rel_path

        if updated and save:
            card.field_data = field_data
            card.save(update_fields=['field_data', 'updated_at'])

        return updated

    @classmethod
    def generate_codes_for_table(
        cls,
        table_id: int,
        card_ids: Optional[List[int]] = None,
        field_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Bulk generate QR codes and Barcodes for all or specified cards in a table.
        """
        from tables.models import Table, IDCard

        table = Table.objects.get(id=table_id)
        fields = table.fields or []

        code_fields = [f for f in fields if cls.is_code_field(f)]
        if field_name:
            code_fields = [f for f in code_fields if f.get('name', '').upper() == field_name.upper()]

        if not code_fields:
            return {
                'success': True,
                'message': 'No QR code or Barcode fields configured in table.',
                'generated_count': 0,
                'total_cards': 0,
                'fields': [],
            }

        cards_qs = IDCard.objects.filter(table=table).exclude(status__in=['deleted', 'pool'])
        if card_ids:
            cards_qs = cards_qs.filter(id__in=card_ids)

        cards = list(cards_qs)
        generated_count = 0

        with transaction.atomic():
            for card in cards:
                field_data = dict(card.field_data or {})
                card_changed = False

                for f in code_fields:
                    fname = f.get('name')
                    if not fname:
                        continue

                    rel_path = cls.generate_and_save_code_for_card(card, f, table_id=table.id)
                    if rel_path:
                        field_data[fname] = rel_path
                        card_changed = True
                        generated_count += 1

                if card_changed:
                    card.field_data = field_data
                    card.save(update_fields=['field_data', 'updated_at'])

        # Invalidate table caches
        try:
            from tables.services.card_service import IDCardCardService
            IDCardCardService._bump_table_cache_versions(table)
        except Exception as exc:
            logger.debug("Failed to bump cache after generating codes: %s", exc)

        return {
            'success': True,
            'message': f"Successfully generated {generated_count} code image(s) across {len(cards)} card(s).",
            'generated_count': generated_count,
            'total_cards': len(cards),
            'fields': [f.get('name') for f in code_fields],
        }
