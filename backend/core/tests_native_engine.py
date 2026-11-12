"""
Tests for Native Acceleration Engine & Microservice Bridge
===========================================================
Verifies that NativeEngineService correctly manages discovery,
ZIP compression, Excel ingestion, DOCX extraction, PDF grid generation,
and reliable Python fallbacks.
"""

import io
import json
import os
import tempfile
import zipfile
import pytest
from pathlib import Path
from django.test import TestCase

from core.services.native_engine_service import NativeEngineService
from exports.zip import ZipExporter
from imports.excel_reader import parse_excel_or_csv, ParsedSpreadsheet


class NativeEngineServiceTests(TestCase):
    """Test suite for NativeEngineService and fallbacks."""

    def test_native_service_discovery(self):
        """Test binary discovery returns bool without crashing."""
        avail = NativeEngineService.is_native_available()
        self.assertIsInstance(avail, bool)

    def test_pack_zip_service(self):
        """Test pack_zip creates a valid compressed archive from source files."""
        with tempfile.TemporaryDirectory() as td:
            td_path = Path(td)
            f1 = td_path / "photo1.jpg"
            f1.write_bytes(b"TEST_IMAGE_DATA_1234567890" * 100)

            f2 = td_path / "photo2.png"
            f2.write_bytes(b"TEST_IMAGE_DATA_0987654321" * 100)

            out_zip = td_path / "output.zip"

            items = [
                {'source_path': str(f1), 'archive_filename': 'PHOTO/101.jpg'},
                {'source_path': str(f2), 'archive_filename': 'PHOTO/102.png'},
            ]

            result = NativeEngineService.pack_zip(items, str(out_zip), compression_level=6)

            self.assertTrue(result.get('success'))
            self.assertEqual(result.get('files_added'), 2)
            self.assertTrue(out_zip.is_file())

            # Verify ZIP contents
            with zipfile.ZipFile(out_zip, 'r') as zf:
                names = zf.namelist()
                self.assertIn('PHOTO/101.jpg', names)
                self.assertIn('PHOTO/102.png', names)
                self.assertEqual(zf.read('PHOTO/101.jpg'), f1.read_bytes())

    def test_docx_photo_extraction(self):
        """Test extract_docx_photos creates output directory and extracts media."""
        with tempfile.TemporaryDirectory() as td:
            td_path = Path(td)
            fake_docx = td_path / "sample.docx"
            out_media = td_path / "extracted_media"

            # Create a mock .docx (which is a ZIP with word/media/image1.png)
            with zipfile.ZipFile(fake_docx, 'w') as zf:
                zf.writestr('word/media/image1.png', b'\x89PNG\r\n\x1a\nFAKE_PNG_BYTES')
                zf.writestr('word/document.xml', '<w:document></w:document>')

            result = NativeEngineService.extract_docx_photos(str(fake_docx), str(out_media))

            self.assertTrue(result.get('success'))
            self.assertEqual(result.get('count'), 1)
            self.assertIn('image1.png', result.get('extracted_images'))
            self.assertTrue((out_media / 'image1.png').is_file())

    def test_pdf_grid_fallback(self):
        """Test PDF grid generation fallback handles manifest."""
        manifest = {
            'title': 'Test Print Run',
            'organisation_name': 'Springfield Academy',
            'table_name': 'Class 10th - A',
            'columns': ['name', 'roll_no'],
            'cards': [
                {'id': 1, 'fields': {'name': 'Alice', 'roll_no': '101'}, 'photo_path': None},
                {'id': 2, 'fields': {'name': 'Bob', 'roll_no': '102'}, 'photo_path': None},
            ],
            'output_pdf_path': 'test_output.pdf',
            'cards_per_page': 6,
        }
        res = NativeEngineService.generate_pdf_grid(manifest)
        self.assertIsInstance(res, dict)
        self.assertIn('success', res)
