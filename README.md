# Pro Panel — Enterprise Digital ID Card Management Platform
### Standalone Tenant Edition

Welcome to **Pro Panel**, a high-performance, enterprise-grade digital ID card and demographic data lifecycle management platform.

Pro Panel is configured as a dedicated, unbranded standalone management system for organizations, agencies, and high-volume identity printing centers.

---

## 1. Architectural Highlights

- **Pure Client-Side React SPA (`frontend/`)**:
  - React 19 + Vite 8 fast modern architecture.
  - Zero Tailwind — 100% pure vanilla CSS with crisp geometric design language (4px radius, HSL color tokens).
  - High-volume tabular virtualization via `@tanstack/react-virtual` with smooth 300+ card infinite scrolling.
  - Standalone demographic and photo collection portal with multi-mode public registration and QR code generation.
- **Headless Django REST API (`backend/`)**:
  - Headless API returning strict JSON payloads.
  - Multi-tiered tenant model where **Super Admin** acts as the supreme tenant administrator managing Operators, Client Organisations, and Assistants.
  - Dynamic table schemas supporting custom fields, admission numbers, photo slots, and metadata.
  - Dual-path photo collection engine supporting embedded spreadsheet drawings (`.xlsx`, `.docx`), ZIP archives, and direct public portal uploads.
  - Non-destructive reprint management: in-place correction tracking with version increment badges (`O<OrgCode>_<ImageCode>V<Version>`).

---

## 2. User Roles & Hierarchy

1. **Super Admin**: Supreme administrator of this Pro Panel installation. Has full authority over Dashboard, Operators, Client Organisations, Global Settings, Table Schemas, and Batch Operations.
2. **Operator**: Operations staff authorized to manage assigned organisations, verify cards, perform batch approvals, and execute print jobs.
3. **Organisation Manager (Client)**: Client representative managing specific institutional card queues.
4. **Assistant / Staff**: Data entry and verification assistants with scoped access to specific tables.
5. **Photographer**: Field photographer authorized to capture or upload student portraits directly into table slots.

---

## 3. Quick Start & Local Execution

### Backend
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The web interface will be available at `http://localhost:5173`.

