import logging
import os
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_GET

logger = logging.getLogger(__name__)

def _get_catalog_base_url():
    return os.getenv('CATALOG_WEBSITE_URL', '').rstrip('/') or getattr(settings, 'SITE_URL', '').rstrip('/')

def _build_banner_ads():
    catalog_base = _get_catalog_base_url()
    prefix = catalog_base if catalog_base else ''
    return [
        {
            "id": "banner-pvc-lanyard",
            "type": "product",
            "title": "Smart PVC Cards & Lanyards",
            "subtitle": "HD Sublimation Blank Cards & Satin Neckbands",
            "tag": "SUPPLIES",
            "ratio": "1:1.6",
            "accent": "#3b82f6",
            "bg_gradient": "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
            "image_url": "/static/banners/banner_pvc_cards_tall.svg",
            "target_url": f"{prefix}/supplies" if prefix else "#",
            "cta": "View Catalog",
            "is_vidyamaxx": False,
            "order": 1,
        },
        {
            "id": "banner-card-printers",
            "type": "product",
            "title": "Dual-Sided Thermal ID Printers",
            "subtitle": "High-speed 300DPI Direct-to-Card Printing",
            "tag": "HARDWARE",
            "ratio": "1:1.6",
            "accent": "#06b6d4",
            "bg_gradient": "linear-gradient(135deg, #083344 0%, #0f172a 100%)",
            "image_url": "/static/banners/banner_printers_tall.svg",
            "target_url": f"{prefix}/printers" if prefix else "#",
            "cta": "Explore Printers",
            "is_vidyamaxx": False,
            "order": 2,
        },
        {
            "id": "banner-vidyamaxx-school-erp",
            "type": "vidyamaxx",
            "title": "VidyaMaxx School ERP Software",
            "subtitle": "All-in-One School Management System: Fees, Attendance & App",
            "tag": "⭐ OUR SCHOOL SOFTWARE",
            "ratio": "1:1.6",
            "accent": "#f97316",
            "bg_gradient": "linear-gradient(135deg, #ea580c 0%, #9a3412 50%, #1e1b4b 100%)",
            "image_url": "/static/banners/banner_vidyamaxx_orange_tall.svg",
            "target_url": os.getenv('VIDYAMAXX_URL', "https://vidyamaxx.com"),
            "cta": "Open VidyaMaxx",
            "is_vidyamaxx": True,
            "order": 3,
        },
        {
            "id": "banner-ai-photo-studio",
            "type": "product",
            "title": "AI Face Capture & Photo Studio",
            "subtitle": "1-Click Auto Background Remover & Crop",
            "tag": "AI TOOLS",
            "ratio": "1:1.6",
            "accent": "#8b5cf6",
            "bg_gradient": "linear-gradient(135deg, #4c1d95 0%, #0f172a 100%)",
            "image_url": "/static/banners/banner_ai_studio_tall.svg",
            "target_url": f"{prefix}/ai-studio" if prefix else "#",
            "cta": "Try AI Suite",
            "is_vidyamaxx": False,
            "order": 4,
        },
        {
            "id": "banner-rfid-scanners",
            "type": "product",
            "title": "RFID & NFC Gate Attendance",
            "subtitle": "Automated Tap Gate Readers with Cloud Sync",
            "tag": "HARDWARE",
            "ratio": "1:1.6",
            "accent": "#10b981",
            "bg_gradient": "linear-gradient(135deg, #064e3b 0%, #0f172a 100%)",
            "image_url": "/static/banners/banner_rfid_tall.svg",
            "target_url": f"{prefix}/rfid" if prefix else "#",
            "cta": "Get Hardware",
            "is_vidyamaxx": False,
            "order": 5,
        },
        {
            "id": "banner-vidyamaxx-campus-app",
            "type": "vidyamaxx",
            "title": "VidyaMaxx School ERP Software",
            "subtitle": "Smart Student Tracking, Bus GPS & Parent Mobile App",
            "tag": "⭐ VIDYAMAXX ERP",
            "ratio": "1:1.6",
            "accent": "#f97316",
            "bg_gradient": "linear-gradient(135deg, #ea580c 0%, #9a3412 50%, #1e1b4b 100%)",
            "image_url": "/static/banners/banner_vidyamaxx_orange_tall.svg",
            "target_url": os.getenv('VIDYAMAXX_URL', "https://vidyamaxx.com"),
            "cta": "Free School Demo",
            "is_vidyamaxx": True,
            "order": 6,
        },
    ]


@require_GET
def api_sidebar_banners(request):
    """
    GET /api/banners/
    Returns promotional vertical tall poster banners for sidebar.
    Configured so after every 2 product ads, a VidyaMaxx orange banner is shown.
    """
    banners = _build_banner_ads()
    return JsonResponse({
        "success": True,
        "ratio": "1:1.6",
        "banners": banners,
        "count": len(banners),
    })
