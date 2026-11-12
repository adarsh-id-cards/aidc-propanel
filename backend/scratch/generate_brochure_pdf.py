"""
CardFlow Executive Sales Brochure Generator (A4 Landscape)
Generates: c:\\Users\\iamro\\Desktop\\CardFlow\\CardFlow_Agency_Brochure_A4_Horizontal.pdf
"""

import os
import sys

from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# 1. Register TrueType Fonts
FONT_REGULAR = 'SegoeUI'
FONT_BOLD = 'SegoeUI-Bold'
FONT_SEMIBOLD = 'SegoeUI-SemiBold'

try:
    pdfmetrics.registerFont(TTFont('SegoeUI', r'C:\Windows\Fonts\segoeui.ttf'))
    pdfmetrics.registerFont(TTFont('SegoeUI-Bold', r'C:\Windows\Fonts\segoeuib.ttf'))
    pdfmetrics.registerFont(TTFont('SegoeUI-SemiBold', r'C:\Windows\Fonts\seguisb.ttf'))
except Exception as e:
    print(f"Warning font loading: {e}. Falling back to Helvetica.")
    FONT_REGULAR = 'Helvetica'
    FONT_BOLD = 'Helvetica-Bold'
    FONT_SEMIBOLD = 'Helvetica-Bold'

# Page Dimensions (A4 Landscape: 841.89 x 595.27 pt)
PAGE_WIDTH, PAGE_HEIGHT = landscape(A4)

# Color Palette (Corporate Tech, Navy & Blue, Premium Editorial)
C_DARK_BG = colors.HexColor('#090D1A')       # Deep Space Navy
C_PRIMARY = colors.HexColor('#1E40AF')       # Deep Royal Blue
C_BLUE_LIGHT = colors.HexColor('#2563EB')    # Electric Accent Blue
C_CYAN = colors.HexColor('#06B6D4')          # Electric Cyan
C_AMBER = colors.HexColor('#D97706')         # Warm Gold/Amber
C_EMERALD = colors.HexColor('#059669')       # Success Green
C_RED = colors.HexColor('#DC2626')           # Alert Red
C_TEXT_DARK = colors.HexColor('#0F172A')     # Slate 900
C_TEXT_MUTED = colors.HexColor('#334155')    # Slate 700 (High contrast readability)
C_TEXT_LIGHT = colors.HexColor('#94A3B8')    # Slate 400
C_CARD_BG = colors.HexColor('#F8FAFC')       # Slate 50
C_CARD_BORDER = colors.HexColor('#CBD5E1')   # Slate 300
C_WHITE = colors.HexColor('#FFFFFF')

SCREENSHOTS_DIR = r"c:\Users\iamro\Desktop\CardFlow\screenshots"
OUTPUT_PDF = r"c:\Users\iamro\Desktop\CardFlow\CardFlow_Agency_Brochure_A4_Horizontal.pdf"

# Paragraph Styles
style_h1_dark = ParagraphStyle('H1Dark', fontName=FONT_BOLD, fontSize=20, leading=24, textColor=C_TEXT_DARK)
style_h1_white = ParagraphStyle('H1White', fontName=FONT_BOLD, fontSize=24, leading=28, textColor=C_WHITE)
style_h2_dark = ParagraphStyle('H2Dark', fontName=FONT_BOLD, fontSize=12.5, leading=16.5, textColor=C_PRIMARY)
style_h2_white = ParagraphStyle('H2White', fontName=FONT_BOLD, fontSize=13.5, leading=17.5, textColor=C_CYAN)
style_body_dark = ParagraphStyle('BodyDark', fontName=FONT_REGULAR, fontSize=8.5, leading=12, textColor=C_TEXT_MUTED)
style_body_white = ParagraphStyle('BodyWhite', fontName=FONT_REGULAR, fontSize=8.5, leading=12, textColor=C_TEXT_LIGHT)
style_bullet_dark = ParagraphStyle('BulletDark', fontName=FONT_REGULAR, fontSize=8, leading=11.5, textColor=C_TEXT_DARK)
style_bullet_white = ParagraphStyle('BulletWhite', fontName=FONT_REGULAR, fontSize=8, leading=11.5, textColor=C_WHITE)


def draw_paragraph(c, text, style, x, y, width, max_height=None):
    """Utility to wrap and draw paragraph downwards from top-left (x, y). Returns height consumed."""
    p = Paragraph(text, style)
    avail_h = max_height if max_height else PAGE_HEIGHT
    w, h = p.wrap(width, avail_h)
    p.drawOn(c, x, y - h)
    return h


def draw_rounded_card(c, x, y, w, h, radius=6, fill_color=C_CARD_BG, stroke_color=C_CARD_BORDER, stroke_width=1):
    c.saveState()
    c.setFillColor(fill_color)
    if stroke_color and stroke_width > 0:
        c.setStrokeColor(stroke_color)
        c.setLineWidth(stroke_width)
    else:
        c.setStrokeColor(fill_color)
        c.setLineWidth(0)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke_color else 0)
    c.restoreState()


def draw_pill_badge(c, text, x, y, bg_color, text_color, font_size=8, pad_x=8, pad_y=4):
    """Draws a compact pill badge with text."""
    c.saveState()
    c.setFont(FONT_BOLD, font_size)
    txt_w = c.stringWidth(text, FONT_BOLD, font_size)
    pill_w = txt_w + (pad_x * 2)
    pill_h = font_size + (pad_y * 2)
    
    c.setFillColor(bg_color)
    c.setStrokeColor(bg_color)
    c.roundRect(x, y, pill_w, pill_h, pill_h / 2, fill=1, stroke=0)
    
    c.setFillColor(text_color)
    c.drawString(x + pad_x, y + pad_y + 1, text)
    c.restoreState()
    return pill_w, pill_h


def draw_image_mockup(c, img_path, x, y, w, h, caption=None, badge=None):
    """Draws an image inside a rounded mockup frame with clean border and optional badge."""
    c.saveState()
    c.setFillColor(colors.HexColor('#0F172A'))
    c.setStrokeColor(colors.HexColor('#334155'))
    c.setLineWidth(1)
    c.roundRect(x, y, w, h, 6, fill=1, stroke=1)
    
    pad = 4
    img_x = x + pad
    img_y = y + pad
    img_w = w - (pad * 2)
    img_h = h - (pad * 2)
    
    if os.path.exists(img_path):
        try:
            c.drawImage(img_path, img_x, img_y, width=img_w, height=img_h, preserveAspectRatio=True, anchor='c')
        except Exception as e:
            c.setFillColor(C_TEXT_LIGHT)
            c.drawString(img_x + 10, img_y + img_h / 2, f"Screenshot: {os.path.basename(img_path)}")
    else:
        c.setFillColor(C_TEXT_LIGHT)
        c.drawString(img_x + 10, img_y + img_h / 2, f"Missing: {os.path.basename(img_path)}")
    
    c.setStrokeColor(colors.HexColor('#94A3B8'))
    c.setLineWidth(1)
    c.roundRect(x, y, w, h, 6, fill=0, stroke=1)

    if badge:
        draw_pill_badge(c, badge[0], x + w - badge[1] - 8, y + h - 22, badge[2], badge[3], font_size=7.5)
    
    c.restoreState()


def draw_page_header(c, category, title, page_num, total_pages=6, is_dark=False):
    """Draws consistent professional top bar across pages 2-6."""
    c.saveState()
    bar_y = PAGE_HEIGHT - 32
    
    c.setFont(FONT_BOLD, 12)
    c.setFillColor(C_WHITE if is_dark else C_DARK_BG)
    c.drawString(36, bar_y, "CardFlow™")
    
    c.setFont(FONT_SEMIBOLD, 9.5)
    c.setFillColor(C_CYAN if is_dark else C_BLUE_LIGHT)
    c.drawString(102, bar_y, "ID CARD OS")
    
    c.setFillColor(colors.HexColor('#64748B'))
    c.drawString(168, bar_y, "|")
    
    c.setFont(FONT_BOLD, 9)
    c.setFillColor(C_CYAN if is_dark else C_PRIMARY)
    c.drawString(180, bar_y, category.upper())
    
    draw_pill_badge(c, "EXCLUSIVE REGIONAL LICENSE: 1 AGENCY PER DISTRICT", 460, bar_y - 3, 
                    colors.HexColor('#FEF3C7') if not is_dark else colors.HexColor('#78350F'),
                    colors.HexColor('#92400E') if not is_dark else colors.HexColor('#FDE68A'), 
                    font_size=7.5)
    
    c.setStrokeColor(colors.HexColor('#334155') if is_dark else colors.HexColor('#E2E8F0'))
    c.setLineWidth(1)
    c.line(36, bar_y - 10, PAGE_WIDTH - 36, bar_y - 10)
    
    c.restoreState()


def draw_page_footer(c, page_num, total_pages=6, is_dark=False):
    """Draws clean footer across pages."""
    c.saveState()
    footer_y = 18
    
    c.setStrokeColor(colors.HexColor('#334155') if is_dark else colors.HexColor('#E2E8F0'))
    c.setLineWidth(1)
    c.line(36, footer_y + 12, PAGE_WIDTH - 36, footer_y + 12)
    
    c.setFont(FONT_REGULAR, 8)
    c.setFillColor(C_TEXT_LIGHT if is_dark else C_TEXT_MUTED)
    c.drawString(36, footer_y, "CardFlow™ ID Card OS • Partner Briefing")
    
    c.setFont(FONT_SEMIBOLD, 8)
    c.setFillColor(C_AMBER)
    c.drawCentredString(PAGE_WIDTH / 2, footer_y, "CONFIDENTIAL & EXCLUSIVE • 3-DAY RISK-FREE EVALUATION")
    
    c.setFont(FONT_BOLD, 8.5)
    c.setFillColor(C_WHITE if is_dark else C_TEXT_DARK)
    c.drawRightString(PAGE_WIDTH - 36, footer_y, f"Page {page_num} of {total_pages}")
    
    c.restoreState()


# ==========================================
# PAGE 1: EXECUTIVE COVER / PITCH DECK HERO
# ==========================================
def render_page_1(c):
    c.saveState()
    c.setFillColor(C_DARK_BG)
    c.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    
    c.setFillColor(colors.HexColor('#0F172A'))
    c.circle(PAGE_WIDTH * 0.85, PAGE_HEIGHT * 0.85, 260, fill=1, stroke=0)
    c.setFillColor(colors.HexColor('#1E293B'))
    c.circle(PAGE_WIDTH * 0.12, PAGE_HEIGHT * 0.15, 200, fill=1, stroke=0)
    
    c.setFont(FONT_BOLD, 14)
    c.setFillColor(C_WHITE)
    c.drawString(36, PAGE_HEIGHT - 40, "CardFlow™")
    c.setFont(FONT_SEMIBOLD, 10)
    c.setFillColor(C_CYAN)
    c.drawString(116, PAGE_HEIGHT - 40, "ENTERPRISE ID CARD OPERATING SYSTEM")
    
    draw_pill_badge(c, "EXCLUSIVE REGIONAL MONOPOLY: 1 AGENCY PER REGION", 
                    PAGE_WIDTH - 340, PAGE_HEIGHT - 46, 
                    colors.HexColor('#B45309'), C_WHITE, font_size=8, pad_x=12, pad_y=5)

    c.setStrokeColor(colors.HexColor('#334155'))
    c.setLineWidth(1)
    c.line(36, PAGE_HEIGHT - 54, PAGE_WIDTH - 36, PAGE_HEIGHT - 54)
    
    cur_y = PAGE_HEIGHT - 75
    draw_pill_badge(c, "ID CARD PRINTING PRESS & AGENCY BLUEPRINT", 36, cur_y - 12, colors.HexColor('#1E3A8A'), C_CYAN, font_size=8)
    cur_y -= 26
    
    hero_title = "<b>Dominate ID Card Printing In Your Region</b><br/><font color='#38BDF8'>Stop Chasing Excels. Start Dominating.</font>"
    h = draw_paragraph(c, hero_title, style_h1_white, 36, cur_y, 410)
    cur_y -= (h + 10)
    
    hero_desc = (
        "<b>CardFlow</b> is the high-throughput SaaS engineered specifically for ID card printers, "
        "lamination press operators, and manufacturing agencies. Eliminate Excel chaos, corrupted WhatsApp photos, "
        "and costly duplicate misprints with direct school portals, automated photo ingestion, and an instant reprint audit engine."
    )
    h = draw_paragraph(c, hero_desc, style_body_white, 36, cur_y, 410)
    cur_y -= (h + 16)
    
    pillars = [
        ("[MONOPOLY] Regional Lock", "Only 1 agency licensed per district. Lock out your local competitors.", colors.HexColor('#1E293B'), C_CYAN),
        ("[DELEGATION] Multi-School", "Schools enter student data & upload photos directly in their own portal.", colors.HexColor('#1E293B'), C_WHITE),
        ("[ZERO LOSS] Reprint Engine", "Update typos in place with 'Reprint x1' badges. Zero messy duplicate rows.", colors.HexColor('#1E293B'), C_WHITE),
        ("[PRICING] Starting at ₹499/mo", "Transparent pricing with ZERO per-card commission + full 3-day demo.", colors.HexColor('#1E293B'), C_AMBER),
    ]
    
    card_w = 196
    card_h = 60
    for i, (p_title, p_desc, p_bg, p_color) in enumerate(pillars):
        col = i % 2
        row = i // 2
        bx = 36 + (col * (card_w + 14))
        by = cur_y - (row * (card_h + 10)) - card_h
        
        draw_rounded_card(c, bx, by, card_w, card_h, radius=6, fill_color=p_bg, stroke_color=colors.HexColor('#334155'))
        
        p_t_style = ParagraphStyle(f'PT_{i}', fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=p_color)
        draw_paragraph(c, f"<b>{p_title}</b>", p_t_style, bx + 8, by + card_h - 8, card_w - 16)
        
        p_d_style = ParagraphStyle(f'PD_{i}', fontName=FONT_REGULAR, fontSize=7.5, leading=10, textColor=C_TEXT_LIGHT)
        draw_paragraph(c, p_desc, p_d_style, bx + 8, by + card_h - 24, card_w - 16)
    
    mockup_x = 465
    mockup_y = 110
    mockup_w = 340
    mockup_h = 365
    
    draw_rounded_card(c, mockup_x, mockup_y, mockup_w, mockup_h, radius=8, fill_color=colors.HexColor('#111827'), stroke_color=colors.HexColor('#374151'), stroke_width=1.5)
    
    c.setFillColor(colors.HexColor('#1F2937'))
    c.roundRect(mockup_x, mockup_y + mockup_h - 26, mockup_w, 26, 4, fill=1, stroke=0)
    c.setFont(FONT_BOLD, 8.5)
    c.setFillColor(C_WHITE)
    c.drawString(mockup_x + 10, mockup_y + mockup_h - 17, "LIVE PRODUCTION PORTAL • SHREE ID CARDS")
    
    draw_pill_badge(c, "ACTIVE TENANT", mockup_x + mockup_w - 85, mockup_y + mockup_h - 21, C_EMERALD, C_WHITE, font_size=7)
    
    img_1_path = os.path.join(SCREENSHOTS_DIR, "01_organisations_directory.png")
    c.drawImage(img_1_path, mockup_x + 8, mockup_y + 190, width=mockup_w - 16, height=140, preserveAspectRatio=True, anchor='c')
    
    img_3_path = os.path.join(SCREENSHOTS_DIR, "03_spreadsheet_table.png")
    c.drawImage(img_3_path, mockup_x + 8, mockup_y + 35, width=mockup_w - 16, height=145, preserveAspectRatio=True, anchor='c')
    
    c.setFont(FONT_REGULAR, 7.5)
    c.setFillColor(C_TEXT_LIGHT)
    c.drawCentredString(mockup_x + mockup_w / 2, mockup_y + 14, "Multi-School Directory & Virtualized Card Pipeline in Action")

    bot_y = 42
    draw_rounded_card(c, 36, bot_y, PAGE_WIDTH - 72, 46, radius=6, fill_color=colors.HexColor('#1E1B4B'), stroke_color=C_BLUE_LIGHT)
    
    c.setFont(FONT_BOLD, 9.5)
    c.setFillColor(C_CYAN)
    c.drawString(50, bot_y + 26, "EXCLUSIVE REGIONAL MONOPOLY OFFER:")
    
    c.setFont(FONT_REGULAR, 8.5)
    c.setFillColor(C_WHITE)
    c.drawString(50, bot_y + 11, "We partner with only ONE agency per district. First agency to book locks the region. Includes full 3-day free evaluation.")
    
    c.setFont(FONT_BOLD, 10.5)
    c.setFillColor(C_AMBER)
    c.drawRightString(PAGE_WIDTH - 50, bot_y + 17, "3-Day Free Demo • Call/WhatsApp: +91-98820-CARDFLOW")

    c.restoreState()


# ========================================================
# PAGE 2: MULTI-SCHOOL DELEGATION & WORK DIVISION
# ========================================================
def render_page_2(c):
    draw_page_header(c, "Fleet Architecture", "Multi-School Fleet & Intelligent Work Division", 2)
    
    left_x = 36
    cur_y = PAGE_HEIGHT - 60
    
    h = draw_paragraph(c, "<b>Multi-School Fleet Management & Work Division</b>", style_h1_dark, left_x, cur_y, 330)
    cur_y -= (h + 6)
    
    h = draw_paragraph(c, "Eliminate the May-August Printing Season WhatsApp & Excel Nightmare", style_h2_dark, left_x, cur_y, 330)
    cur_y -= (h + 8)
    
    desc_p1 = (
        "During peak admission season, printing presses juggle 30 to 80 schools simultaneously. "
        "Teachers send messy Excel sheets with misaligned columns, blurry WhatsApp photos, and unorganized folders. "
        "Your design operators end up doing manual data-entry instead of printing cards."
    )
    h = draw_paragraph(c, desc_p1, style_body_dark, left_x, cur_y, 330)
    cur_y -= (h + 6)
    
    h = draw_paragraph(c, "<b>CardFlow completely solves this through Self-Service Delegation:</b>", style_body_dark, left_x, cur_y, 330)
    cur_y -= (h + 5)
    
    bullets = [
        "<b>Direct School Portals:</b> Give Delhi Public School, St. Xavier's, or Apex Academy their own login. School staff enter student details and upload photos directly.",
        "<b>Strict Data Isolation:</b> School A can never see School B's data or card templates. Multi-tenant privacy is cryptographically enforced.",
        "<b>School Manager Role:</b> Principals or clerks can add students, verify proofs, and submit print requests, but cannot alter system settings.",
        "<b>Dedicated Printing Operator Queue:</b> Your printing press team gets a dedicated workstation view focused exclusively on printing, proofing, and packaging batches.",
        "<b>Real-Time Progress Visibility:</b> Schools see their card statuses in real time, eliminating 90% of status check phone calls."
    ]
    
    for b in bullets:
        h = draw_paragraph(c, f"• {b}", style_bullet_dark, left_x + 4, cur_y, 326)
        cur_y -= (h + 3.5)
    
    metric_y = cur_y - 6
    draw_rounded_card(c, left_x, metric_y - 52, 330, 52, radius=6, fill_color=colors.HexColor('#EFF6FF'), stroke_color=C_BLUE_LIGHT)
    
    c.setFont(FONT_BOLD, 14)
    c.setFillColor(C_PRIMARY)
    c.drawString(left_x + 16, metric_y - 24, "85% Less Overhead")
    c.drawString(left_x + 185, metric_y - 24, "Zero Data Leakage")
    
    c.setFont(FONT_REGULAR, 7.5)
    c.setFillColor(C_TEXT_MUTED)
    c.drawString(left_x + 16, metric_y - 40, "No manual data cleaning or photo re-sorting")
    c.drawString(left_x + 185, metric_y - 40, "Two-domain enterprise isolation")

    right_x = 385
    vis_w = 420
    vis_h = 205
    
    img_1 = os.path.join(SCREENSHOTS_DIR, "01_organisations_directory.png")
    draw_image_mockup(c, img_1, right_x, PAGE_HEIGHT - 55 - vis_h, vis_w, vis_h, 
                      badge=("MULTI-CLIENT DIRECTORY", 125, colors.HexColor('#1E293B'), C_CYAN))
    
    c.setFont(FONT_SEMIBOLD, 7.5)
    c.setFillColor(C_TEXT_DARK)
    c.drawString(right_x, PAGE_HEIGHT - 55 - vis_h - 10, "Figure 1.1: Multi-School Fleet Overview (Delhi Public School, St. Xavier's, Apex International)")
    
    img_2 = os.path.join(SCREENSHOTS_DIR, "02_work_division.png")
    draw_image_mockup(c, img_2, right_x, 48, vis_w, vis_h, 
                      badge=("ROLE-BASED WORK DIVISION", 140, colors.HexColor('#1E293B'), C_AMBER))
    
    c.setFont(FONT_SEMIBOLD, 7.5)
    c.setFillColor(C_TEXT_DARK)
    c.drawString(right_x, 48 - 10, "Figure 1.2: Granular Delegation Drawer — School Managers vs. Printing Press Operators")

    draw_page_footer(c, 2)


# ========================================================
# PAGE 3: VIRTUALIZED SPREADSHEET GRID & MEDIA PIPELINE
# ========================================================
def render_page_3(c):
    draw_page_header(c, "Core Engine", "Ultra-Fast Spreadsheet Grid & Automated Photo Matching", 3)
    
    left_x = 36
    cur_y = PAGE_HEIGHT - 60
    
    h = draw_paragraph(c, "<b>Blazing Fast In-Browser Grid & Automated Photos</b>", style_h1_dark, left_x, cur_y, 330)
    cur_y -= (h + 6)
    
    h = draw_paragraph(c, "Handles 50,000+ Cards at 60 FPS Without Crashing or Freezing", style_h2_dark, left_x, cur_y, 330)
    cur_y -= (h + 8)
    
    desc_p1 = (
        "Most web applications choke when opening a school with 2,000+ student rows. "
        "CardFlow is built with high-performance <b>TanStack Virtualization</b>, rendering only what is visible on the screen. "
        "It feels like Excel inside Google Chrome, but with cloud security and multi-user sync."
    )
    h = draw_paragraph(c, desc_p1, style_body_dark, left_x, cur_y, 330)
    cur_y -= (h + 6)
    
    features = [
        "<b>In-Cell Spreadsheet Editing:</b> Double-click any cell to instantly edit names, admission numbers, blood groups, or phone numbers. Instant auto-save to cloud.",
        "<b>Live Production Status Pipeline:</b> Card state progression tracked with crisp visual badges: <code>Pending</code> -> <code>Verified</code> -> <code>Approved</code> -> <code>Printed</code> -> <code>Reprint</code>.",
        "<b>Bulk Photo ZIP Ingestion:</b> Upload 1,000 photos in a single ZIP. CardFlow automatically matches photos to student admission numbers and extracts embedded Word/Excel photos.",
        "<b>Media Standardization Service:</b> Automatically renames and optimizes every photo into the production standard: <code>O&lt;OrgCode&gt;_&lt;ImageCode&gt;V&lt;Version&gt;.jpg</code>.",
        "<b>One-Click Production Export:</b> Export clean, ready-to-print CSV/XLSX spreadsheets pre-formatted for CorelDraw Print Merge, Photoshop Data Sets, or UV RIP software."
    ]
    
    for f in features:
        h = draw_paragraph(c, f"• {f}", style_bullet_dark, left_x + 4, cur_y, 326)
        cur_y -= (h + 3.5)
        
    tech_y = cur_y - 6
    draw_rounded_card(c, left_x, tech_y - 74, 330, 74, radius=6, fill_color=colors.HexColor('#F1F5F9'), stroke_color=colors.HexColor('#94A3B8'))
    
    c.setFont(FONT_BOLD, 8.5)
    c.setFillColor(C_TEXT_DARK)
    c.drawString(left_x + 10, tech_y - 16, "[TECH] Bounded Memory & Concurrency Throttling")
    
    tech_desc = (
        "Engineered to sustain intense multi-school upload spikes on lightweight infrastructure. "
        "Heavy ZIP extractions and thumbnail generation run asynchronously via BackgroundWorkers, "
        "keeping your UI responsive under 500ms."
    )
    draw_paragraph(c, tech_desc, style_body_dark, left_x + 10, tech_y - 24, 310)

    right_x = 385
    vis_w = 420
    vis_h = 430
    
    img_3 = os.path.join(SCREENSHOTS_DIR, "03_spreadsheet_table.png")
    draw_image_mockup(c, img_3, right_x, 48, vis_w, vis_h, 
                      badge=("VIRTUALIZED SPREADSHEET GRID (10 CARDS LOADED)", 210, colors.HexColor('#0F172A'), C_CYAN))
    
    draw_pill_badge(c, "[1] In-Cell Editing", right_x + 12, 60, colors.HexColor('#047857'), C_WHITE, font_size=8)
    draw_pill_badge(c, "[2] Photo Preview Thumbnails", right_x + 130, 60, colors.HexColor('#0284C7'), C_WHITE, font_size=8)
    draw_pill_badge(c, "[3] CorelDraw/RIP Export", right_x + 290, 60, colors.HexColor('#7C3AED'), C_WHITE, font_size=8)

    draw_page_footer(c, 3)


# ========================================================
# PAGE 4: ZERO-DUPLICATE REPRINT ENGINE & CARD PROOFING
# ========================================================
def render_page_4(c):
    draw_page_header(c, "Quality Control", "Zero-Duplicate Reprint Engine & Instant Card Proofing", 4)
    
    left_x = 36
    cur_y = PAGE_HEIGHT - 60
    
    h = draw_paragraph(c, "<b>The Zero-Duplicate Intelligent Reprint Engine</b>", style_h1_dark, left_x, cur_y, 330)
    cur_y -= (h + 6)
    
    h = draw_paragraph(c, "Stop Losing Profits on Misprints, Spelling Corrections & Lost Cards", style_h2_dark, left_x, cur_y, 330)
    cur_y -= (h + 8)
    
    desc_p1 = (
        "In traditional print shops, when a student loses an ID card or a parent reports a spelling mistake, "
        "operators create a duplicate row in Excel. By July, the database is cluttered with duplicate admission numbers, "
        "causing billing discrepancies and wasted plastic cards."
    )
    h = draw_paragraph(c, desc_p1, style_body_dark, left_x, cur_y, 330)
    cur_y -= (h + 6)
    
    reprint_points = [
        "<b>In-Place Record Mutation:</b> CardFlow never creates duplicate card rows. It updates the student's existing record in place, preserving admission history.",
        "<b>Automatic Reprint Badging:</b> Modified cards are instantly tagged with visual audit badges: <code>Reprint x1</code>, <code>Reprint x2</code>, tracking total reprint cycles.",
        "<b>Full Card Proofing Drawer:</b> Click any student to open the comprehensive proof inspection window. Verify photos, emergency contacts, blood group, and student metadata before printing.",
        "<b>Dedicated Reprint Queue:</b> Filter specifically for cards in <code>reprint</code> status. Print only the corrected cards without having to re-export the entire school.",
        "<b>Audit Trail & Accountability:</b> Every reprint request logs who initiated it, reason for reprint (e.g. 'Father name spelling correction'), and exact timestamp."
    ]
    
    for r in reprint_points:
        h = draw_paragraph(c, f"• {r}", style_bullet_dark, left_x + 4, cur_y, 326)
        cur_y -= (h + 3.5)
        
    cost_y = cur_y - 6
    draw_rounded_card(c, left_x, cost_y - 70, 330, 70, radius=6, fill_color=colors.HexColor('#FEF2F2'), stroke_color=colors.HexColor('#F87171'))
    
    c.setFont(FONT_BOLD, 8.5)
    c.setFillColor(C_RED)
    c.drawString(left_x + 10, cost_y - 16, "[PROFIT WARNING] The Hidden Bleed of Manual Reprints")
    
    cost_desc = (
        "Average print shops lose 4% to 7% of their seasonal revenue in unbilled reprints and duplicated card sheets. "
        "CardFlow's in-place badging ensures 100% billing accuracy and zero accidental re-prints."
    )
    draw_paragraph(c, cost_desc, style_body_dark, left_x + 10, cost_y - 24, 310)

    right_x = 385
    vis_w = 420
    vis_h = 205
    
    img_4a = os.path.join(SCREENSHOTS_DIR, "04_reprint_queue.png")
    draw_image_mockup(c, img_4a, right_x, PAGE_HEIGHT - 55 - vis_h, vis_w, vis_h, 
                      badge=("REPRINT QUEUE (3 CARDS)", 140, colors.HexColor('#7F1D1D'), colors.HexColor('#FCA5A5')))
    
    c.setFont(FONT_SEMIBOLD, 7.5)
    c.setFillColor(C_TEXT_DARK)
    c.drawString(right_x, PAGE_HEIGHT - 55 - vis_h - 10, "Figure 3.1: Dedicated Reprint Pipeline — Aditya Somani, Kavya Bhatt, Reyansh Vora")
    
    img_4b = os.path.join(SCREENSHOTS_DIR, "04_card_modal_drawer.png")
    draw_image_mockup(c, img_4b, right_x, 48, vis_w, vis_h, 
                      badge=("IN-PLACE PROOFING DRAWER", 155, colors.HexColor('#1E293B'), C_CYAN))
    
    c.setFont(FONT_SEMIBOLD, 7.5)
    c.setFillColor(C_TEXT_DARK)
    c.drawString(right_x, 48 - 10, "Figure 3.2: Comprehensive Card Proofing Drawer with Photo Verification & In-Place Editing")

    draw_page_footer(c, 4)


# ========================================================
# PAGE 5: REGIONAL MONOPOLY & COMPETITOR REALITY CHECK
# ========================================================
def render_page_5(c):
    draw_page_header(c, "Unfair Advantage", "Exclusive Regional Monopoly & Competitor Reality Check", 5)
    
    left_x = 36
    cur_y = PAGE_HEIGHT - 60
    
    h = draw_paragraph(c, "<b>Your Unfair Competitive Moat: 1 Region = 1 Agency</b>", style_h1_dark, left_x, cur_y, 330)
    cur_y -= (h + 6)
    
    h = draw_paragraph(c, "Lock In Your District Before Any Other Printing Agency Does", style_h2_dark, left_x, cur_y, 330)
    cur_y -= (h + 8)
    
    desc_p1 = (
        "We believe in creating strong, highly profitable partners. That's why CardFlow enforces a strict "
        "<b>One-Agency-Per-Region Policy</b>. When you adopt CardFlow, we decline licenses to any other ID card printing agency in your district."
    )
    h = draw_paragraph(c, desc_p1, style_body_dark, left_x, cur_y, 330)
    cur_y -= (h + 6)
    
    points = [
        "<b>Monopoly Advantage:</b> You offer local schools an automated web portal while your competitors are still asking them to email Excel files and attach photos one by one.",
        "<b>Retention Lock-in:</b> Once a school inputs their student data and experiences CardFlow's self-service portal, they will NEVER switch back to a competitor using manual methods.",
        "<b>Custom White-Label Branding:</b> Present CardFlow with your own printing agency branding, logo, and domain.",
        "<b>Enterprise Tenant Governance:</b> Active device tracking, cryptographically verified license keys, and real-time quota alerts."
    ]
    
    for p in points:
        h = draw_paragraph(c, f"• {p}", style_bullet_dark, left_x + 4, cur_y, 326)
        cur_y -= (h + 3.5)
        
    comp_y = cur_y - 6
    draw_rounded_card(c, left_x, comp_y - 105, 330, 105, radius=6, fill_color=colors.HexColor('#0F172A'), stroke_color=C_CYAN)
    
    c.setFont(FONT_BOLD, 8.5)
    c.setFillColor(C_CYAN)
    c.drawString(left_x + 10, comp_y - 16, "[REALITY CHECK] Competitor Claims vs. CardFlow Delivery")
    
    t_text = (
        "<b>Competitor Claims:</b> Some vendors claim to offer school software. But when May arrives and 20 schools upload photos simultaneously, "
        "their cheap PHP servers crash, photos fail to attach, and support is unavailable.<br/><br/>"
        "<b>CardFlow Reality:</b> Built with enterprise Django REST + TanStack Virtualization, Background worker queues, and bounded memory streaming. "
        "Proven under 100,000+ card loads with 99.9% peak season uptime."
    )
    draw_paragraph(c, t_text, style_body_white, left_x + 10, comp_y - 24, 310)

    right_x = 385
    vis_w = 420
    vis_h = 430
    
    img_6 = os.path.join(SCREENSHOTS_DIR, "06_tenant_license_management.png")
    draw_image_mockup(c, img_6, right_x, 48, vis_w, vis_h, 
                      badge=("TENANT LICENSE & QUOTA CONTROL", 185, colors.HexColor('#1E293B'), C_AMBER))
    
    draw_pill_badge(c, "[KEY] Hardware Lock", right_x + 15, 60, colors.HexColor('#1E3A8A'), C_WHITE, font_size=8)
    draw_pill_badge(c, "[QUOTA] Real-time Guard", right_x + 155, 60, colors.HexColor('#047857'), C_WHITE, font_size=8)
    draw_pill_badge(c, "[BACKUP] Cloud Sync", right_x + 295, 60, colors.HexColor('#7C3AED'), C_WHITE, font_size=8)

    draw_page_footer(c, 5)


# ========================================================
# PAGE 6: TRANSPARENT PRICING, 3-DAY FREE DEMO & ACTION
# ========================================================
def render_page_6(c):
    draw_page_header(c, "Partnership & Plans", "Transparent Pricing & 3-Day Risk-Free Live Evaluation", 6)
    
    left_x = 36
    cur_y = PAGE_HEIGHT - 60
    
    h = draw_paragraph(c, "<b>Transparent Pricing Built to Help You Scale</b>", style_h1_dark, left_x, cur_y, 330)
    cur_y -= (h + 6)
    
    h = draw_paragraph(c, "No Per-Card Hidden Taxes. Fixed Predictable Monthly Pricing.", style_h2_dark, left_x, cur_y, 330)
    cur_y -= (h + 8)
    
    desc_p1 = (
        "We care deeply about local printing businesses. Other software companies charge $0.10 to $0.20 per printed card, "
        "which extracts ₹15,000 to ₹30,000 from your seasonal profits. CardFlow charges a simple flat subscription with "
        "<b>ZERO per-card fees</b>."
    )
    h = draw_paragraph(c, desc_p1, style_body_dark, left_x, cur_y, 330)
    cur_y -= (h + 8)
    
    tiers_info = [
        ("Starter Tier", "₹499 / month", "Up to 10 Client Schools • Core Spreadsheet Grid • Batch Excel Export • Ideal for single print shops.", colors.HexColor('#F8FAFC')),
        ("Pro Tier (Most Popular)", "₹1,499 / month", "Unlimited Schools • Multi-Operator Work Division • Intelligent Reprint Engine • Priority Background Workers.", colors.HexColor('#EFF6FF')),
        ("Enterprise Tier", "Custom / Annual", "Dedicated White-Label Domain • Custom Mobile App Companion • 24/7 Dedicated Peak Season Engineer Support.", colors.HexColor('#FAF5FF'))
    ]
    
    for t_title, t_price, t_details, t_bg in tiers_info:
        draw_rounded_card(c, left_x, cur_y - 42, 330, 42, radius=5, fill_color=t_bg, stroke_color=C_CARD_BORDER)
        c.setFont(FONT_BOLD, 9)
        c.setFillColor(C_PRIMARY if "Pro" in t_title else C_TEXT_DARK)
        c.drawString(left_x + 10, cur_y - 15, t_title)
        
        c.setFont(FONT_BOLD, 9.5)
        c.setFillColor(C_EMERALD if "Pro" in t_title else C_TEXT_DARK)
        c.drawRightString(left_x + 320, cur_y - 15, t_price)
        
        c.setFont(FONT_REGULAR, 7)
        c.setFillColor(C_TEXT_MUTED)
        c.drawString(left_x + 10, cur_y - 30, t_details)
        
        cur_y -= 46

    cur_y -= 4
    draw_rounded_card(c, left_x, cur_y - 82, 330, 82, radius=6, fill_color=colors.HexColor('#FEF3C7'), stroke_color=colors.HexColor('#F59E0B'))
    
    c.setFont(FONT_BOLD, 9.5)
    c.setFillColor(colors.HexColor('#92400E'))
    c.drawString(left_x + 10, cur_y - 18, "[RISK-FREE] 3-Day Free Live Evaluation Offer")
    
    offer_text = (
        "<b>Experience CardFlow with zero commitment:</b><br/>"
        "• We set up your agency portal and import your first school for free.<br/>"
        "• Test it with your real operators and live school data for 3 full days.<br/>"
        "• If it doesn't save you 50+ hours in your first week, you owe nothing."
    )
    draw_paragraph(c, offer_text, style_bullet_dark, left_x + 10, cur_y - 25, 310)

    right_x = 385
    vis_w = 420
    vis_h = 240
    
    img_5 = os.path.join(SCREENSHOTS_DIR, "05_saas_pricing_tiers.png")
    draw_image_mockup(c, img_5, right_x, PAGE_HEIGHT - 55 - vis_h, vis_w, vis_h, 
                      badge=("CARDFLOW SAAS TIERS & ARCHITECTURE", 195, colors.HexColor('#0F172A'), C_CYAN))
    
    cta_y = 48
    cta_h = 160
    draw_rounded_card(c, right_x, cta_y, vis_w, cta_h, radius=8, fill_color=C_DARK_BG, stroke_color=C_CYAN, stroke_width=1.5)
    
    c.setFont(FONT_BOLD, 13)
    c.setFillColor(C_WHITE)
    c.drawString(right_x + 18, cta_y + cta_h - 26, "Claim Your Exclusive Region Today")
    
    cta_p = (
        "Regional exclusivity is awarded on a first-come, first-served basis. "
        "Once an agency in your district signs up, we cannot offer CardFlow to you this season."
    )
    draw_paragraph(c, cta_p, style_body_white, right_x + 18, cta_y + cta_h - 36, vis_w - 36)
    
    c.setFont(FONT_BOLD, 10.5)
    c.setFillColor(C_CYAN)
    c.drawString(right_x + 18, cta_y + 46, "Phone / WhatsApp: +91-98820-CARDFLOW")
    c.drawString(right_x + 18, cta_y + 26, "Email: partners@cardflow.io")
    
    c.setFont(FONT_BOLD, 9.5)
    c.setFillColor(C_AMBER)
    c.drawRightString(right_x + vis_w - 18, cta_y + 36, "Web: portal.cardflow.io")

    draw_page_footer(c, 6)


def build_brochure():
    print(f"Generating brochure PDF: {OUTPUT_PDF}")
    c = canvas.Canvas(OUTPUT_PDF, pagesize=landscape(A4))
    
    print("Rendering Page 1 (Cover)...")
    render_page_1(c)
    c.showPage()
    
    print("Rendering Page 2 (Fleet Management & Work Division)...")
    render_page_2(c)
    c.showPage()
    
    print("Rendering Page 3 (Spreadsheet Grid & Media Pipeline)...")
    render_page_3(c)
    c.showPage()
    
    print("Rendering Page 4 (Reprint Engine & Proofing Drawer)...")
    render_page_4(c)
    c.showPage()
    
    print("Rendering Page 5 (Regional Monopoly & Competitor Reality Check)...")
    render_page_5(c)
    c.showPage()
    
    print("Rendering Page 6 (Pricing, 3-Day Demo & Action)...")
    render_page_6(c)
    c.showPage()
    
    c.save()
    print(f"Brochure generated successfully at: {OUTPUT_PDF}")
    file_size = os.path.getsize(OUTPUT_PDF)
    print(f"File size: {file_size / 1024:.2f} KB ({file_size} bytes)")


if __name__ == '__main__':
    build_brochure()
