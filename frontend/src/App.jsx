import ProPanelLogo from './components/common/ProPanelLogo';
/**
 * CardFlow — B2B Enterprise SaaS Platform
 * Copyright (c) 2024-2026 KDR Softwares. All Rights Reserved.
 * Founder & Principal Architect: Roshan Damor (@logicbyroshan) - KDR Softwares
 * Proprietary and Confidential Commercial Software.
 */
import React, { useState, useEffect, useCallback } from 'react';
import PageTransition from './components/common/PageTransition';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import DashboardView from './components/dashboard/DashboardView';
import Footer from './components/layout/Footer';

import OrganisationDirectoryView from './components/organisation/OrganisationDirectoryView';
import OperatorManagementView, {
  AssistantManagementView,
  ManagerManagementView,
} from './components/staff/StaffManagementView';
const ManagePanelView = React.lazy(() => import('./components/panel/ManagePanelView'));
import TableManagementView from './components/table/TableManagementView';
import TableActionsView from './components/table/TableActionsView';
const FixImagesView = React.lazy(() => import('./components/table/FixImagesView'));
import CardDownloadsModal from './components/idcard/CardDownloadsModal';
import GlobalSearchModal from './components/common/GlobalSearchModal';
import ConfirmDeleteModal from './components/common/ConfirmDeleteModal';
import { Toaster, toast } from 'sonner';
import ErrorBoundary from './components/common/ErrorBoundary';
import OldVersionWarningModal from './components/idcard/OldVersionWarningModal';
const ReprintCardsManagerView = React.lazy(() => import('./components/reprint/ReprintCardsManagerView'));
const ProfileSettingsView = React.lazy(() => import('./components/settings/ProfileSettingsView'));

const TutorialGuideView = React.lazy(() => import('./components/tutorial/TutorialGuideView'));
import AuthFlowContainer from './components/auth/AuthFlowContainer';
import Preloader from './components/common/Preloader';
import { authApi, impersonateApi, clientApi, dashboardApi, schemaApi } from './services/api';
import { swrCache } from './utils/swrCache';

const PrimeAdminDashboardView = React.lazy(() => import('./components/saas/PrimeAdminDashboardView'));
const SuperAdminStatisticsView = React.lazy(() => import('./components/stats/SuperAdminStatisticsView'));
const PrimeAdminStatisticsView = React.lazy(() => import('./components/stats/PrimeAdminStatisticsView'));

import QuickActionDrawer from './components/dashboard/QuickActionDrawer';
const StudentPhotoPortal = React.lazy(() => import('./components/portal/StudentPhotoPortal'));
const StudentDataPortal = React.lazy(() => import('./components/portal/StudentDataPortal'));
const DataCollectionView = React.lazy(() => import('./components/collection/DataCollectionView'));

import { Smartphone, Download } from 'lucide-react';


const BOOT = { LOADING: 'loading', AUTH: 'auth', UNAUTH: 'unauth' };

function MobileAppFallback({ onForceDesktop }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1e2e 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#ffffff',
        fontFamily: "'Saira Semi Condensed', sans-serif",
        textAlign: 'center',
        boxSizing: 'border-box',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 999999,
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <ProPanelLogo size="lg" />
      </div>

      <div
        style={{
          maxWidth: '460px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          padding: '32px 24px',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #0050d2 0%, #00b4ff 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 8px 24px rgba(0, 180, 255, 0.35)',
          }}
        >
          <Smartphone size={32} color="#ffffff" />
        </div>

        <h2
          style={{
            fontSize: '23px',
            fontWeight: 700,
            marginBottom: '12px',
            color: '#ffffff',
            letterSpacing: '-0.3px',
          }}
        >
          Please Download the CardFlow Mobile App
        </h2>

        <p
          style={{
            fontSize: '15px',
            color: '#94a3b8',
            lineHeight: '1.5',
            marginBottom: '24px',
          }}
        >
          The CardFlow Desktop Portal is optimized for desktop displays (1000px – 2000px). For mobile devices and screens below 1000px, please download the official CardFlow Mobile App.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <a
            href="/static/app/cardflow-mobile-latest.apk"
            download
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '12px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '15px',
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
            }}
          >
            <Download size={18} />
            <span>Download Android App (.APK)</span>
          </a>

          <button
            onClick={onForceDesktop}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#cbd5e1',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#ffffff';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            Continue to Desktop Web View Anyway (Force Mode)
          </button>
        </div>

        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Desktop Optimization Bounds: 1000px – 2000px Width
        </div>
      </div>
    </div>
  );
}

function normalizeRouteStatus(status) {
  if (!status) return 'pending';
  const s = String(status).toLowerCase().trim();
  if (s === 'download' || s === 'downloaded' || s === 'printed') return 'printed';
  if (s === 'pool' || s === 'deleted') return 'deleted';
  if (s === 'request' || s === 'requested') return 'request';
  if (s === 'reprint' || s === 'reprinting') return 'reprint';
  if (s === 'confirm' || s === 'confirmed') return 'confirm';
  return s;
}

const PRO_SYSTEM_SLUG_TO_SUBTAB = {
  notifications: 'notifications',
  notification: 'notifications',
  email: 'notifications',
  emails: 'notifications',
  'email-logs': 'notifications',
  'email-management': 'notifications',
  logs: 'log-history',
  log: 'log-history',
  'log-history': 'log-history',
  'logs-updates': 'log-history',
  updates: 'log-history',
  backups: 'backups',
  backup: 'backups',
  templates: 'download-templates',
  template: 'download-templates',
  'download-templates': 'download-templates',
  impersonate: 'impersonate',
  imperosnate: 'impersonate',
  impersonation: 'impersonate',
  'impersonate-user': 'impersonate',
  passwords: 'passwords',
  password: 'passwords',
  'manage-passwords': 'passwords',
  'super-admins': 'super_admins',
  'super-admin': 'super_admins',
  super_admins: 'super_admins',
  'manage-super-admins': 'super_admins',
  statistics: 'statistics',
  statistic: 'statistics',
  stats: 'statistics',
  batch: 'batch',
  batches: 'batch',
  'batch-jobs': 'batch',
  jobs: 'batch',
  'server-info': 'server-info',
  server: 'server-info',
  'system-server': 'server-info',
};

const PRO_SYSTEM_SUBTAB_TO_SLUG = {
  notifications: 'notifications',
  'email-logs': 'email',
  'log-history': 'logs',
  backups: 'backups',
  'download-templates': 'templates',
  impersonate: 'impersonate',
  passwords: 'passwords',
  super_admins: 'super-admins',
  statistics: 'statistics',
  batch: 'batch',
  'server-info': 'server-info',
};


function parsePathToRoute(pathname) {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '/');

  // Match public portal routes: /portal/upload/:token, /upload/:token, /p/:token
  const portalUploadMatch = path.match(/^\/(?:portal\/upload|upload|p)\/([^/]+)\/?$/i);
  if (portalUploadMatch) {
    return {
      tab: 'portal-upload',
      portalToken: portalUploadMatch[1],
      idcardActionsState: null,
      scopedOrgId: null,
    };
  }

  // Match public data collection portal routes: /portal/collect/:token, /collect/:token, /c/:token
  const portalCollectMatch = path.match(/^\/(?:portal\/collect|collect|c)\/([^/]+)\/?$/i);
  if (portalCollectMatch) {
    return {
      tab: 'portal-collect',
      portalToken: portalCollectMatch[1],
      idcardActionsState: null,
      scopedOrgId: null,
    };
  }

  // Match public student correction portal routes: /portal/correct/:token, /correct/:token
  const portalCorrectMatch = path.match(/^\/(?:portal\/correct|correct)\/([^/]+)\/?$/i);
  if (portalCorrectMatch) {
    return {
      tab: 'portal-correct',
      portalToken: portalCorrectMatch[1],
      idcardActionsState: null,
      scopedOrgId: null,
    };
  }

  // Match /organisation/:orgId/campaign/:campaignId
  const orgCampaignMatch = path.match(/^\/(?:organisation|organisations|org)\/([^/]+)\/campaign\/([^/]+)\/?$/i);
  if (orgCampaignMatch) {
    const rawOid = orgCampaignMatch[1];
    const rawCid = orgCampaignMatch[2];
    const orgId = (rawOid && !isNaN(Number(rawOid))) ? Number(rawOid) : null;
    const campaignId = (rawCid && !isNaN(Number(rawCid))) ? Number(rawCid) : null;
    return {
      tab: 'data-collection',
      idcardActionsState: { campaignId, status: 'collection', orgId },
      scopedOrgId: orgId,
    };
  }

  // Match /campaign/:campaignId
  const standaloneCampaignMatch = path.match(/^\/campaign\/([^/]+)\/?$/i);
  if (standaloneCampaignMatch) {
    const rawCid = standaloneCampaignMatch[1];
    const campaignId = (rawCid && !isNaN(Number(rawCid))) ? Number(rawCid) : null;
    return {
      tab: 'data-collection',
      idcardActionsState: { campaignId, status: 'collection' },
      scopedOrgId: null,
    };
  }

  // Match /organisation/:orgId/table/:tableId/data-collection
  const orgDataCollectionMatch = path.match(/^\/(?:organisation|organisations|org)\/([^/]+)\/(?:table|tables)\/([^/]+)\/data-collection\/?$/i);
  if (orgDataCollectionMatch) {
    const rawOid = orgDataCollectionMatch[1];
    const rawTid = orgDataCollectionMatch[2];
    const orgId = (rawOid && !isNaN(Number(rawOid))) ? Number(rawOid) : null;
    const tableId = (rawTid && rawTid !== '??' && !isNaN(Number(rawTid))) ? Number(rawTid) : 1;
    return {
      tab: 'data-collection',
      idcardActionsState: { tableId, status: 'collection', orgId },
      scopedOrgId: orgId,
    };
  }

  // Match /table/:tableId/data-collection or /data-collection/:tableId
  const standaloneDataCollectionMatch = path.match(/^\/(?:(?:table|tables)\/([^/]+)\/data-collection|data-collection\/([^/]+))\/?$/i);
  if (standaloneDataCollectionMatch) {
    const rawTid = standaloneDataCollectionMatch[1] || standaloneDataCollectionMatch[2];
    const tableId = (rawTid && rawTid !== '??' && !isNaN(Number(rawTid))) ? Number(rawTid) : 1;
    return {
      tab: 'data-collection',
      idcardActionsState: { tableId, status: 'collection' },
      scopedOrgId: null,
    };
  }

  // Match /organisation/:orgId/table/:tableId/fix-images
  const orgFixImagesMatch = path.match(/^\/(?:organisation|organisations|org)\/([^/]+)\/(?:table|tables)\/([^/]+)\/fix-images\/?$/i);
  if (orgFixImagesMatch) {
    const rawOid = orgFixImagesMatch[1];
    const rawTid = orgFixImagesMatch[2];
    const orgId = (rawOid && !isNaN(Number(rawOid))) ? Number(rawOid) : null;
    const tableId = (rawTid && rawTid !== '??' && !isNaN(Number(rawTid))) ? Number(rawTid) : 1;
    return {
      tab: 'fix-images',
      idcardActionsState: { tableId, status: 'approved', orgId },
      scopedOrgId: orgId,
    };
  }

  // Match /table/:tableId/fix-images
  const standaloneFixImagesMatch = path.match(/^\/(?:table|tables)\/([^/]+)\/fix-images\/?$/i);
  if (standaloneFixImagesMatch) {
    const rawTid = standaloneFixImagesMatch[1];
    const tableId = (rawTid && rawTid !== '??' && !isNaN(Number(rawTid))) ? Number(rawTid) : 1;
    return {
      tab: 'fix-images',
      idcardActionsState: { tableId, status: 'approved' },
      scopedOrgId: null,
    };
  }

  // Match /organisation/:orgId/table/:tableId/:status or /organisations/:orgId/table/:tableId/:status

  const orgTableMatch = path.match(/^\/(?:organisation|organisations|org)\/([^/]+)\/(?:table|tables)\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (orgTableMatch) {
    const rawOid = orgTableMatch[1];
    const rawTid = orgTableMatch[2];
    const orgId = (rawOid && !isNaN(Number(rawOid))) ? Number(rawOid) : null;
    const tableId = (rawTid && rawTid !== '??' && !isNaN(Number(rawTid))) ? Number(rawTid) : 1;
    const status = normalizeRouteStatus(orgTableMatch[3] || 'pending');
    return {
      tab: 'idcard-actions',
      idcardActionsState: { tableId, status, orgId },
      scopedOrgId: orgId,
    };
  }

  // Match /organisation/:orgId/tables or /organisations/:orgId/tables
  const orgTablesMatch = path.match(/^\/(?:organisation|organisations|org)\/([^/]+)\/(?:tables|cards)\/?$/);
  if (orgTablesMatch) {
    const rawOid = orgTablesMatch[1];
    const orgId = (rawOid && !isNaN(Number(rawOid))) ? Number(rawOid) : null;
    return {
      tab: 'cards',
      idcardActionsState: null,
      scopedOrgId: orgId,
    };
  }

  // Match /organisation/:orgId/assistants or /organisations/:orgId/assistants or /orgs/:orgId/assistants
  const orgAssistantsMatch = path.match(/^\/(?:organisation|organisations|org|orgs)\/([^/]+)\/(?:assistants|assistant)\/?$/i);
  if (orgAssistantsMatch) {
    const rawOid = orgAssistantsMatch[1];
    const orgId = (rawOid && !isNaN(Number(rawOid))) ? Number(rawOid) : null;
    return {
      tab: 'assistants',
      idcardActionsState: null,
      scopedOrgId: orgId,
    };
  }

  // Match /organisation/:orgId/managers or /organisations/:orgId/managers or /orgs/:orgId/managers
  const orgManagersMatch = path.match(/^\/(?:organisation|organisations|org|orgs)\/([^/]+)\/(?:managers|manager)\/?$/i);
  if (orgManagersMatch) {
    const rawOid = orgManagersMatch[1];
    const orgId = (rawOid && !isNaN(Number(rawOid))) ? Number(rawOid) : null;
    return {
      tab: 'managers',
      idcardActionsState: null,
      scopedOrgId: orgId,
    };
  }

  // Match Pro System routes: /pro-system, /pro system, /pro%20system, /pro_system, /panel, /pro and optional /:subtab
  const proSystemMatch = path.match(/^\/(?:pro-system|pro_system|pro%20system|pro system|panel|pro)(?:\/([^/]+))?\/?$/i);
  if (proSystemMatch) {
    const rawSub = proSystemMatch[1] ? decodeURIComponent(proSystemMatch[1]).toLowerCase().trim() : '';
    let resolvedSubtab = 'notifications';
    if (rawSub) {
      resolvedSubtab = PRO_SYSTEM_SLUG_TO_SUBTAB[rawSub] || rawSub;
    } else if (path.toLowerCase().startsWith('/pro') && !path.toLowerCase().startsWith('/pro-system') && !path.toLowerCase().startsWith('/pro_system') && !path.toLowerCase().startsWith('/pro%20system')) {
      resolvedSubtab = 'impersonate';
    }
    return {
      tab: 'panel',
      panelSubtab: resolvedSubtab,
      idcardActionsState: null,
      scopedOrgId: null,
    };
  }

  // Match /table/:tableId/:status or /tables/:tableId/:status or /cards/:tableId/:status or /table/:tableId
  const tableMatch = path.match(/^\/(?:table|tables|cards)\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (tableMatch) {
    const rawTid = tableMatch[1];
    const tableId = (rawTid && rawTid !== '??' && !isNaN(Number(rawTid))) ? Number(rawTid) : 1;
    const status = normalizeRouteStatus(tableMatch[2] || 'pending');
    return {
      tab: 'idcard-actions',
      idcardActionsState: { tableId, status },
      scopedOrgId: null,
    };
  }

  const map = {
    '/': { tab: 'dashboard', idcardActionsState: null },
    '/dashboard': { tab: 'dashboard', idcardActionsState: null },
    '/tables': { tab: 'organisations', idcardActionsState: null },
    '/cards': { tab: 'organisations', idcardActionsState: null },
    '/reprints': { tab: 'reprints', idcardActionsState: null },
    '/organisations': { tab: 'organisations', idcardActionsState: null },
    '/organisation': { tab: 'organisations', idcardActionsState: null },
    '/orgs': { tab: 'organisations', idcardActionsState: null },
    '/managers': { tab: 'managers', idcardActionsState: null },
    '/manager': { tab: 'managers', idcardActionsState: null },
    '/organisations/managers': { tab: 'managers', idcardActionsState: null },
    '/organisations/assistants': { tab: 'assistants', idcardActionsState: null },
    '/organisation/managers': { tab: 'managers', idcardActionsState: null },
    '/organisation/assistants': { tab: 'assistants', idcardActionsState: null },
    '/orgs/managers': { tab: 'managers', idcardActionsState: null },
    '/orgs/assistants': { tab: 'assistants', idcardActionsState: null },
    '/accounts': { tab: 'organisations', idcardActionsState: null },
    '/client-accounts': { tab: 'organisations', idcardActionsState: null },
    '/clients': { tab: 'organisations', idcardActionsState: null },
    '/operators': { tab: 'operators', idcardActionsState: null },
    '/operator': { tab: 'operators', idcardActionsState: null },
    '/staff': { tab: 'operators', idcardActionsState: null },
    '/assistants': { tab: 'assistants', idcardActionsState: null },
    '/assistant': { tab: 'assistants', idcardActionsState: null },
    '/photographers': { tab: 'photographers', idcardActionsState: null },
    '/photographer': { tab: 'photographers', idcardActionsState: null },
    '/panel': { tab: 'panel', idcardActionsState: null },
    '/tutorial': { tab: 'tutorial', idcardActionsState: null },
    '/settings': { tab: 'settings', idcardActionsState: null },
    '/pro': { tab: 'pro', idcardActionsState: null },
    '/profile': { tab: 'profile', idcardActionsState: null },
    '/statistics': { tab: 'statistics', idcardActionsState: null },
    '/saas': { tab: 'saas_subscriptions', idcardActionsState: null },
    '/saas/dashboard': { tab: 'dashboard', idcardActionsState: null },
    '/saas/overview': { tab: 'dashboard', idcardActionsState: null },
    '/saas/statistics': { tab: 'saas_statistics', idcardActionsState: null },
    '/saas/subscriptions': { tab: 'saas_subscriptions', idcardActionsState: null },
    '/saas/billing': { tab: 'saas_payments', idcardActionsState: null },
    '/saas/payments': { tab: 'saas_payments', idcardActionsState: null },
    '/saas/operators': { tab: 'saas_prime_operators', idcardActionsState: null },
    '/saas/tiers': { tab: 'saas_settings', idcardActionsState: null },
    '/saas/settings': { tab: 'saas_settings', idcardActionsState: null },
    '/saas/logs': { tab: 'saas_logs', idcardActionsState: null },
    '/saas/domains': { tab: 'saas_domains_landing', idcardActionsState: null },
    '/saas/mobile-app': { tab: 'saas_mobile_app', idcardActionsState: null },
    '/saas/features': { tab: 'saas_feature_matrix', idcardActionsState: null },
  };

  return map[path] || { tab: 'dashboard', idcardActionsState: null };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const cached = localStorage.getItem('cf_auth_user') || sessionStorage.getItem('cf_auth_user');
      return cached ? JSON.parse(cached) : null;
    } catch (_) {
      return null;
    }
  });
  const [userRole, setUserRole] = useState(() => {
    try {
      const cached = localStorage.getItem('cf_auth_user') || sessionStorage.getItem('cf_auth_user');
      if (cached) {
        const u = JSON.parse(cached);
        return u.role || 'super_admin';
      }
    } catch (_) {}
    return 'super_admin';
  });
  const normRole = String(userRole || '').toLowerCase();
  const [bootState, setBootState] = useState(() => {
    try {
      const cached = localStorage.getItem('cf_auth_user') || sessionStorage.getItem('cf_auth_user');
      return cached ? BOOT.AUTH : BOOT.LOADING;
    } catch (_) {
      return BOOT.LOADING;
    }
  });
  const initialRoute = parsePathToRoute();
  const [impersonatedUser, setImpersonatedUser] = useState(null);
  const [activeTab, setActiveTab] = useState(() => initialRoute.tab);
  const [panelSubtab, setPanelSubtab] = useState(() => initialRoute.panelSubtab || 'notifications');
  const [idcardActionsState, setIdcardActionsState] = useState(() => initialRoute.idcardActionsState); // { tableId, status, orgId }
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState('all');
  const [scopedClientId, setScopedClientId] = useState(() => initialRoute.scopedOrgId || null);
  const [scopedClientOrg, setScopedClientOrg] = useState(null);
  const [activeTableName, setActiveTableName] = useState(null);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [forceDesktop, setForceDesktop] = useState(false);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Apply tenant dynamic panel theme color (Pro / Max tiers)
  useEffect(() => {
    const themeColor = currentUser?.subscription?.panel_color_theme;
    if (themeColor && typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--primary-color', themeColor);
      document.documentElement.style.setProperty('--panel-accent-theme', currentUser?.subscription?.panel_accent_theme || themeColor);
    }
  }, [currentUser]);

  // Clean URL query parameters and sync semantic path aliases
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('next')) {
        urlParams.delete('next');
        const cleanSearch = urlParams.toString();
        const cleanUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '');
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
  }, []);

  // Sync clean, semantic role URLs in browser address bar and sync routes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.match(/^\/(?:portal\/upload|upload|p|portal\/collect|portal\/collection|collect|c|portal\/correct|correct)\/([^/]+)\/?$/i)) {
      return;
    }

    if (bootState === BOOT.UNAUTH) {

      if (window.location.pathname !== '/auth/login' && window.location.pathname !== '/login') {
        window.history.replaceState({}, document.title, '/auth/login');
      }
      return;
    }

    if (bootState === BOOT.AUTH) {
      const path = window.location.pathname;
      if (path === '/auth/login' || path === '/login') {
        window.history.replaceState({}, document.title, '/');
      } else if (activeTab === 'fix-images' && idcardActionsState?.tableId) {
        const orgId = idcardActionsState.orgId || scopedClientId || scopedClientOrg?.id;
        const targetRoute = orgId
          ? `/organisation/${orgId}/table/${idcardActionsState.tableId}/fix-images`
          : `/table/${idcardActionsState.tableId}/fix-images`;
        if (path !== targetRoute) {
          window.history.pushState({}, document.title, targetRoute);
        }
      } else if (activeTab === 'data-collection') {
        const orgId = idcardActionsState?.orgId || scopedClientId || scopedClientOrg?.id;
        let targetRoute = null;
        if (idcardActionsState?.campaignId) {
          targetRoute = orgId
            ? `/organisation/${orgId}/campaign/${idcardActionsState.campaignId}`
            : `/campaign/${idcardActionsState.campaignId}`;
        } else if (idcardActionsState?.tableId) {
          targetRoute = orgId
            ? `/organisation/${orgId}/table/${idcardActionsState.tableId}/data-collection`
            : `/table/${idcardActionsState.tableId}/data-collection`;
        }
        if (targetRoute && path !== targetRoute) {
          window.history.pushState({}, document.title, targetRoute);
        }
      } else if (activeTab === 'idcard-actions' && idcardActionsState?.tableId) {
        const status = idcardActionsState.status || 'pending';
        const orgId = idcardActionsState.orgId || scopedClientId || scopedClientOrg?.id;
        const targetRoute = orgId
          ? `/organisation/${orgId}/table/${idcardActionsState.tableId}/${status}`
          : `/table/${idcardActionsState.tableId}/${status}`;
        if (path !== targetRoute) {
          window.history.pushState({}, document.title, targetRoute);
        }
      } else if (activeTab === 'cards') {
        const orgId = scopedClientId || scopedClientOrg?.id;
        if (orgId) {
          const targetRoute = `/organisation/${orgId}/tables`;
          if (path !== targetRoute) {
            window.history.pushState({}, document.title, targetRoute);
          }
        } else {
          setActiveTab('organisations');
          if (path !== '/organisations') {
            window.history.replaceState({}, document.title, '/organisations');
          }
        }
      } else if (activeTab === 'assistants') {
        const orgId = scopedClientId || scopedClientOrg?.id;
        const targetRoute = orgId ? `/organisations/${orgId}/assistants` : '/organisations/assistants';
        if (path !== targetRoute) {
          window.history.pushState({}, document.title, targetRoute);
        }
      } else if (activeTab === 'managers') {
        const orgId = scopedClientId || scopedClientOrg?.id;
        const targetRoute = orgId ? `/organisations/${orgId}/managers` : '/organisations/managers';
        if (path !== targetRoute) {
          window.history.pushState({}, document.title, targetRoute);
        }
      } else if (activeTab === 'panel' || activeTab === 'pro') {
        const slug = PRO_SYSTEM_SUBTAB_TO_SLUG[panelSubtab] || panelSubtab || 'notifications';
        const targetRoute = `/pro-system/${slug}`;
        if (path !== targetRoute) {
          window.history.pushState({}, document.title, targetRoute);
        }
      } else {
        const routeMap = {
          dashboard: (normRole === 'prime_admin' || normRole === 'prime_operator') ? '/saas/dashboard' : '/',
          cards: '/organisations',
          tables: '/organisations',
          reprints: '/reprints',
          organisations: '/organisations',
          clients: '/organisations/managers',
          managers: '/organisations/managers',
          operators: '/operators',
          staff: '/operators',
          assistants: '/organisations/assistants',
          photographers: '/photographers',
          tutorial: '/tutorial',
          settings: '/settings',
          profile: '/profile',
          statistics: (normRole === 'prime_admin' || normRole === 'prime_operator') ? '/saas/statistics' : '/statistics',
          saas_overview: '/saas/dashboard',
          saas_statistics: '/saas/statistics',
          saas_subscriptions: '/saas/subscriptions',
          saas_payments: '/saas/billing',
          saas_prime_operators: '/saas/operators',
          saas_settings: '/saas/tiers',
          saas_platform_settings: '/saas/tiers',
          saas_logs: '/saas/logs',
          saas_domains_landing: '/saas/domains',
          saas_mobile_app: '/saas/mobile-app',
          saas_feature_matrix: '/saas/features',
        };
        const targetRoute = routeMap[activeTab] || '/';
        if (path !== targetRoute && path !== '/dashboard' && path !== '/saas/dashboard') {
          window.history.pushState({}, document.title, targetRoute);
        }
      }
    }
  }, [bootState, activeTab, panelSubtab, idcardActionsState, scopedClientId, scopedClientOrg, normRole]);

  // Static single document title across entire application
  useEffect(() => {
    document.title = 'CardFlow';
  }, []);

  // Handle browser back/forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parsePathToRoute(window.location.pathname);
      setActiveTab(parsed.tab);
      if (parsed.tab === 'panel' && parsed.panelSubtab) {
        setPanelSubtab(parsed.panelSubtab);
      }
      setIdcardActionsState(parsed.idcardActionsState || null);
      if (parsed.scopedOrgId) {
        setScopedClientId(parsed.scopedOrgId);
      } else if (parsed.tab !== 'idcard-actions' && parsed.tab !== 'cards') {
        setScopedClientId(null);
        setScopedClientOrg(null);
        setActiveTableName(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Automatically fetch organisation details when scopedClientId is set without organisation info
  useEffect(() => {
    if (scopedClientId && (!scopedClientOrg || scopedClientOrg.id !== scopedClientId)) {
      (async () => {
        try {
          const data = await clientApi.getClient(scopedClientId);
          const org = data?.client || data?.organisation || data;
          if (org?.name || org?.school_name) {
            setScopedClientOrg({ id: scopedClientId, name: org.name || org.school_name });
          }
        } catch (_) {}
      })();
    }
  }, [scopedClientId, scopedClientOrg]);

  const handleTableLoaded = useCallback((tbl) => {
    if (tbl?.name) setActiveTableName(tbl.name);
    const orgId = tbl?.organisation_id || tbl?.client_id;
    const orgName = tbl?.organisation_name || tbl?.client_name;
    if (orgId) {
      setScopedClientId(orgId);
      setScopedClientOrg((prev) => {
        if (prev?.id === orgId && prev?.name) return prev;
        return { id: orgId, name: orgName || prev?.name || `Organisation #${orgId}` };
      });
      setIdcardActionsState((prev) => {
        if (!prev || prev.orgId === orgId) return prev;
        return { ...prev, orgId };
      });
    }
  }, []);

  // Native scroll handling for nested scroll containers
  useEffect(() => {
    // Native browser scrolling for nested tables and views
    return () => {};
  }, []);

  // Register global impersonation callback
  useEffect(() => {
    window.__setActiveImpersonation = (user) => {
      setImpersonatedUser(user);
      if (user) {
        setUserRole(user.rawRole || 'prime_manager');
      } else {
        setUserRole('super_admin');
      }
    };
  }, []);

  // Modals & Drawers
  const [drawerAction, setDrawerAction] = useState(null);
  const [drawerInitialData, setDrawerInitialData] = useState(null);
  const [showDownloadsModal, setShowDownloadsModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [deleteModalConfig, setDeleteModalConfig] = useState(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningData] = useState(null);

  const handleOpenActionDrawer = useCallback((action, initialData = null) => {
    setDrawerAction(action);
    setDrawerInitialData(initialData);
  }, []);

  const handleOpenDeleteModal = useCallback((cfg) => {
    if (!cfg) {
      setDeleteModalConfig(null);
      return;
    }
    const pin = cfg.deleteCode || String(Math.floor(1000 + Math.random() * 9000));
    setDeleteModalConfig({
      title: 'Confirm Permanent Delete',
      itemDescription: 'this item',
      confirmText: 'Delete',
      confirmVariant: 'danger',
      requiresCode: true,
      ...cfg,
      deleteCode: pin,
    });
  }, []);

  useEffect(() => {
    window.__openActionDrawer = handleOpenActionDrawer;
    return () => {
      delete window.__openActionDrawer;
    };
  }, [handleOpenActionDrawer]);

  // Toasts — powered by Sonner
  const addToast = useCallback((message, type = 'info') => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else if (type === 'warning') toast.warning(message);
    else toast.info(message);
  }, []);

  const handleStatusChange = useCallback((newStatus) => {
    const st = normalizeRouteStatus(newStatus);
    setIdcardActionsState((prev) => {
      if (!prev) return { tableId: 1, status: st };
      if (prev.status === st) return prev;
      return { ...prev, status: st };
    });
  }, []);

  // Auth bootstrap & impersonation re-sync
  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.getCurrentUser();
      if (data && (data.authenticated || data.user || data.username)) {
        const u = data.user || data;
        setCurrentUser(u);
        const role = u.role || 'super_admin';
        setUserRole(role);

        if (data.is_impersonating && data.impersonator) {
          setImpersonatedUser({
            name: u.full_name || u.username,
            role: role,
            email: u.email,
            impersonator: data.impersonator,
            subscription_name: u.subscription?.name || data.impersonator?.subscription_name,
          });
        } else {
          setImpersonatedUser(null);
        }
        setBootState(BOOT.AUTH);
        // Background prefetch dashboard & schemas for instant render
        try {
          setTimeout(() => {
            Promise.allSettled([
              schemaApi.getSchemas(),
              dashboardApi.getStats(),
              dashboardApi.getRecentClientUpdates(),
              dashboardApi.getReprintOverview(),
              dashboardApi.getRecentActivity(50),
            ]).then(([schemaRes, statsRes, clientRes, reprintRes, actRes]) => {
              const d = swrCache.get('dashboard_data') || {};
              swrCache.set('dashboard_data', {
                stats: statsRes.status === 'fulfilled' ? (statsRes.value?.stats || statsRes.value) : d.stats,
                allTables: schemaRes.status === 'fulfilled' ? (schemaRes.value?.tables || schemaRes.value?.results || (Array.isArray(schemaRes.value) ? schemaRes.value : [])) : d.allTables,
                clients: clientRes.status === 'fulfilled' ? (clientRes.value?.clients || clientRes.value?.results || (Array.isArray(clientRes.value) ? clientRes.value : [])) : d.clients,
                reprintClients: reprintRes.status === 'fulfilled' ? (reprintRes.value?.clients || reprintRes.value?.results || reprintRes.value || []) : d.reprintClients,
                activities: actRes.status === 'fulfilled' ? (actRes.value?.activities || actRes.value?.results || actRes.value || []) : d.activities,
              }, 5 * 60 * 1000);
            }).catch(() => {});
          }, 60);
        } catch (_) {}
        return data;
      } else {
        // Only set UNAUTH if server definitively responded that user is not authenticated
        try {
          localStorage.removeItem('cf_auth_user');
          sessionStorage.removeItem('cf_auth_user');
        } catch (_) {}
        setCurrentUser(null);
        setImpersonatedUser(null);
        setBootState(BOOT.UNAUTH);
      }
    } catch (err) {
      console.warn('Auth refresh error:', err);
      // If network error, don't immediately kick user out if they have a cached user
      const hasCached = localStorage.getItem('cf_auth_user') || sessionStorage.getItem('cf_auth_user');
      if (!hasCached) {
        setCurrentUser(null);
        setImpersonatedUser(null);
        setBootState(BOOT.UNAUTH);
      }
    }
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      try {
        localStorage.removeItem('cf_auth_user');
        sessionStorage.removeItem('cf_auth_user');
      } catch (_) {}
      setCurrentUser(null);
      setBootState(BOOT.UNAUTH);
    };
    window.addEventListener('cardflow:auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('cardflow:auth-unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    window.__refreshAuthUser = refreshUser;
    window.__setActiveImpersonation = (user) => {
      if (user) {
        setImpersonatedUser(user);
        setUserRole(user.rawRole || user.role || 'prime_manager');
      } else {
        setImpersonatedUser(null);
        refreshUser();
      }
    };

    // Safe 8s fallback timeout so app never gets stuck indefinitely
    const timer = setTimeout(() => {
      setBootState((prev) => {
        if (prev === BOOT.LOADING) {
          const hasCached = localStorage.getItem('cf_auth_user') || sessionStorage.getItem('cf_auth_user');
          return hasCached ? BOOT.AUTH : BOOT.UNAUTH;
        }
        return prev;
      });
    }, 8000);

    // Prefetch CSRF cookie before auth check, then check auth state.
    fetch('/api/auth/csrf/', { credentials: 'include' })
      .catch(() => {})
      .finally(() => {
        refreshUser().finally(() => clearTimeout(timer));
      });
  }, [refreshUser]);

  const handleExitImpersonation = async () => {
    try {
      const res = await impersonateApi.stop();
      addToast(res?.message || 'Returned to Administrator session.', 'success');
      try {
        localStorage.removeItem('cf_auth_user');
        sessionStorage.removeItem('cf_auth_user');
      } catch (_) {}
      const refreshed = await refreshUser();
      const role = refreshed?.user?.role || refreshed?.role;
      const dest = (role === 'prime_admin' || role === 'prime_operator')
        ? '/saas/subscriptions'
        : (res?.redirect_url || '/');
      window.location.href = dest;
    } catch (err) {
      addToast('Impersonation session ended.', 'info');
      try {
        localStorage.removeItem('cf_auth_user');
        sessionStorage.removeItem('cf_auth_user');
      } catch (_) {}
      window.location.href = '/saas/subscriptions';
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (_) {}
    try {
      localStorage.removeItem('cf_auth_user');
      localStorage.removeItem('cf_remember_me');
      sessionStorage.removeItem('cf_auth_user');
    } catch (_) {}
    swrCache.clear();
    setBootState(BOOT.UNAUTH);
    setCurrentUser(null);
    setImpersonatedUser(null);
    setUserRole('super_admin');
    setActiveTab('dashboard');
  };

  // ── Public Student Photo Self-Upload Portal (Accessible without login & bypasses mobile desktop gate) ──
  const portalUploadMatch = typeof window !== 'undefined'
    ? window.location.pathname.match(/^\/(?:portal\/upload|upload|p)\/([^/]+)\/?$/i)
    : null;
  if (portalUploadMatch) {
    return (
      <React.Suspense fallback={<Preloader />}>
        <StudentPhotoPortal token={portalUploadMatch[1]} />
      </React.Suspense>
    );
  }

  // ── Public Student Data & Photo Collection Portal (Accessible without login & bypasses mobile desktop gate) ──
  const portalCollectMatch = typeof window !== 'undefined'
    ? window.location.pathname.match(/^\/(?:portal\/collect|portal\/collection|collect|c)\/([^/]+)\/?$/i)
    : null;
  if (portalCollectMatch) {
    return (
      <React.Suspense fallback={<Preloader />}>
        <StudentDataPortal token={portalCollectMatch[1]} />
      </React.Suspense>
    );
  }

  // ── Public Student Self-Correction Portal ──
  const portalCorrectMatch = typeof window !== 'undefined'
    ? window.location.pathname.match(/^\/(?:portal\/correct|correct)\/([^/]+)\/?$/i)
    : null;
  if (portalCorrectMatch) {
    return (
      <React.Suspense fallback={<Preloader />}>
        <StudentDataPortal token={portalCorrectMatch[1]} isCorrectionMode={true} />
      </React.Suspense>
    );
  }

  // ── Loading splash ──────────────────────────────────────────────────────────
  if (bootState === BOOT.LOADING) {
    return <Preloader onFinished={() => {}} />;
  }


  // ── Mobile Screen Boundary Gate (< 1000px) ──────────────────────────────
  if (windowWidth < 1000 && !forceDesktop) {
    return <MobileAppFallback onForceDesktop={() => setForceDesktop(true)} />;
  }

  // ── Auth Flow ─────────────────────────────────────────────────────────────────
  if (bootState === BOOT.UNAUTH) {
    return (
      <AuthFlowContainer
        onLoginSuccess={async (user) => {
          if (user) {
            setCurrentUser(user);
            setUserRole(user.role || 'super_admin');
            if (user.role === 'prime_admin' || user.role === 'prime_operator') {
              setActiveTab('dashboard');
            }
          }
          await refreshUser();
          setBootState(BOOT.AUTH);
        }}
      />
    );
  }

  const isAdminRole = normRole === 'prime_admin' || normRole === 'super_admin' || normRole === 'pro_user' || normRole === 'admin';
  const isOrgRole = normRole === 'prime_manager' || normRole === 'super_manager' || normRole === 'manager' || normRole === 'client';
  const isOperatorRole = normRole === 'operator';

  const isInsideTable = activeTab === 'idcard-actions' || activeTab === 'fix-images';

  return (
    <div className={`app-container${isInsideTable ? ' inside-table-mode' : ''}`}>
      {/* Dark sidebar — automatically closed/hidden inside any table view */}
      {!isInsideTable && (
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          userRole={userRole}
          currentUser={currentUser}
          onLogout={handleLogout}
          impersonatedUser={impersonatedUser}
          onExitImpersonation={handleExitImpersonation}
        />
      )}

      {/* Right: topbar + page content */}
      <div
        className="main-content"
        style={isInsideTable ? { marginLeft: 0, width: '100%', maxWidth: '100%' } : undefined}
      >
        {/* Top bar header — visible on all views except full-width ID card actions */}
        {activeTab !== 'idcard-actions' && activeTab !== 'fix-images' && (
          <Header
            activeTab={activeTab}
            searchQuery={searchQuery}
            setSearchQuery={(q) => {
              setSearchQuery(q);
              if (q.length > 1) setShowSearchModal(true);
            }}
            selectedClient={selectedClient}
            setSelectedClient={setSelectedClient}
            userRole={userRole}
            currentUser={currentUser}
            onLogout={handleLogout}
            onOpenActionDrawer={handleOpenActionDrawer}
          />
        )}


        {/* Page content — scrollable area */}
        <div
          className="page-content"
          style={
            (activeTab === 'idcard-actions' || activeTab === 'fix-images' ||
              activeTab === 'dashboard' ||
              activeTab === 'statistics' ||
              activeTab === 'saas_statistics' ||
              activeTab?.startsWith('saas_') ||
              normRole === 'prime_admin' ||
              normRole === 'prime_operator')
              ? { padding: 0, margin: 0, height: '100%', overflow: 'hidden' }
              : undefined
          }
        >
          <ErrorBoundary key={activeTab}>
            <React.Suspense fallback={<Preloader />}>
            <PageTransition
              pageKey={activeTab}
              fullHeight={
                activeTab === 'idcard-actions' ||
                activeTab === 'dashboard' ||
                activeTab === 'statistics' ||
                activeTab === 'saas_statistics' ||
                activeTab?.startsWith('saas_') ||
                normRole === 'prime_admin' ||
                normRole === 'prime_operator'
              }
            >
              {/* ── Dedicated SaaS Statistics Page (Prime Admin & Prime Operator) ── */}
              {activeTab === 'saas_statistics' && (
                <PrimeAdminStatisticsView addToast={addToast} />
              )}

              {/* ── SaaS Master Control Center (Prime Admin & Prime Operator) ── */}
              {activeTab !== 'saas_statistics' && (activeTab?.startsWith('saas_') || ((normRole === 'prime_admin' || normRole === 'prime_operator') && (activeTab === 'dashboard' || !activeTab))) && (
                <PrimeAdminDashboardView
                  currentUser={currentUser}
                  userRole={userRole}
                  initialTab={
                    activeTab === 'dashboard' || !activeTab
                      ? 'overview'
                      : activeTab === 'saas_settings' || activeTab === 'saas_platform_settings'
                      ? 'platform_settings'
                      : activeTab.replace('saas_', '')
                  }
                  onNavigate={(dest) => setActiveTab(dest)}
                  addToast={addToast}
                />
              )}

              {/* ── Standard Dashboard (Tenant / Super Admin / Staff) ── */}
              {activeTab === 'dashboard' && normRole !== 'prime_admin' && normRole !== 'prime_operator' && (
                <DashboardView
                  onNavigate={(dest, params) => {
                    if (dest === 'fix-images') {
                      const tid = params?.tableId || params?.table_id || 1;
                      const orgId = params?.orgId || scopedClientId || scopedClientOrg?.id;
                      if (orgId) setScopedClientId(orgId);
                      if (params?.orgName) setScopedClientOrg({ id: orgId, name: params.orgName });
                      if (params?.tableName) setActiveTableName(params.tableName);
                      setIdcardActionsState({ tableId: tid, status: 'approved', orgId });
                      setActiveTab('fix-images');
                    } else if (dest === 'data-collection') {
                      const tid = params?.tableId || params?.table_id || null;
                      const cid = params?.campaignId || params?.campaign_id || null;
                      const orgId = params?.orgId || scopedClientId || scopedClientOrg?.id;
                      if (orgId) setScopedClientId(orgId);
                      if (params?.orgName) setScopedClientOrg({ id: orgId, name: params.orgName });
                      if (params?.tableName) setActiveTableName(params.tableName);
                      setIdcardActionsState({ tableId: tid, campaignId: cid, status: 'collection', orgId, campaignName: params?.campaignName });
                      setActiveTab('data-collection');
                    } else if (dest === 'idcard-actions' || (params && (params.tableId || params.table_id))) {
                      const tid = params?.tableId || params?.table_id || 1;
                      const st = normalizeRouteStatus(params?.status || params?.statusFilter || 'pending');
                      const orgId = params?.orgId || scopedClientId || scopedClientOrg?.id;
                      setIdcardActionsState({ tableId: tid, status: st, orgId });
                      setActiveTab('idcard-actions');
                    } else if (dest === 'cards') {
                      setActiveTab('cards');
                    } else if (dest) {
                      setActiveTab(dest);
                    }
                  }}
                  currentUser={currentUser}
                  onOpenActionDrawer={handleOpenActionDrawer}
                />
              )}

              {/* ── ID Cards / Tables ── */}
              {(activeTab === 'cards' || activeTab === 'schema') && (
                <TableManagementView
                  addToast={addToast}
                  currentUser={currentUser}
                  userRole={userRole}
                  selectedClientId={scopedClientId}
                  selectedClientOrg={scopedClientOrg}
                  onClearSelectedClient={() => {
                    setScopedClientId(null);
                    setScopedClientOrg(null);
                    setActiveTableName(null);
                  }}
                  onOrgResolved={(org) => {
                    if (org && (!scopedClientOrg || scopedClientOrg.id !== org.id)) {
                      setScopedClientOrg({ id: org.id, name: org.name || org.school_name || 'Organisation' });
                    }
                  }}
                  onNavigate={(tabOrObj, params) => {
                    if (typeof tabOrObj === 'string' && tabOrObj === 'idcard-actions' && params) {
                      const orgId = params.orgId || scopedClientId || scopedClientOrg?.id;
                      if (orgId) setScopedClientId(orgId);
                      if (params.orgName) setScopedClientOrg({ id: orgId, name: params.orgName });
                      if (params.tableName) setActiveTableName(params.tableName);
                      const st = normalizeRouteStatus(params.status || 'pending');
                      setIdcardActionsState({ tableId: params.tableId, status: st, orgId });
                      setActiveTab('idcard-actions');
                    } else if (typeof tabOrObj === 'string') {
                      if (tabOrObj !== 'cards' && tabOrObj !== 'schema') {
                        setScopedClientId(null);
                        setScopedClientOrg(null);
                        setActiveTableName(null);
                      }
                      setActiveTab(tabOrObj);
                    }
                  }}
                />
              )}

              {/* ── ID Card Actions (full card list view per table/status) ── */}
              {activeTab === 'idcard-actions' && (
                <TableActionsView
                  tableId={idcardActionsState?.tableId || 1}
                  initialStatus={idcardActionsState?.status || 'pending'}
                  scopedOrgId={idcardActionsState?.orgId || scopedClientId || scopedClientOrg?.id}
                  scopedOrgName={scopedClientOrg?.name || null}
                  onStatusChange={handleStatusChange}
                  onTableLoaded={handleTableLoaded}
                  addToast={addToast}
                  currentUser={currentUser}
                  userRole={userRole}
                  onBack={() => {
                    setActiveTab('cards');
                    setIdcardActionsState(null);
                  }}
                  onNavigate={(tab, params) => {
                    if (tab === 'fix-images') {
                      if (params) {
                        const orgId = params.orgId || scopedClientId || scopedClientOrg?.id;
                        if (orgId) setScopedClientId(orgId);
                        if (params.orgName) setScopedClientOrg({ id: orgId, name: params.orgName });
                        if (params.tableName) setActiveTableName(params.tableName);
                        setIdcardActionsState({ tableId: params.tableId, status: 'approved', orgId });
                      }
                      setActiveTab('fix-images');
                    } else if (tab === 'data-collection') {
                      if (params) {
                        const orgId = params.orgId || scopedClientId || scopedClientOrg?.id;
                        if (orgId) setScopedClientId(orgId);
                        if (params.orgName) setScopedClientOrg({ id: orgId, name: params.orgName });
                        if (params.tableName) setActiveTableName(params.tableName);
                        setIdcardActionsState({
                          tableId: params.tableId || null,
                          campaignId: params.campaignId || null,
                          status: 'collection',
                          orgId,
                          campaignName: params.campaignName,
                        });
                      }
                      setActiveTab('data-collection');
                    } else if (tab === 'table-settings' || tab === 'schema') {
                      setActiveTab('schema');
                    } else if (tab === 'cards' || tab === 'idcard-group') {
                      setActiveTab('cards');
                      setIdcardActionsState(null);
                    } else if (typeof tab === 'string') {
                      setActiveTab(tab);
                    }
                  }}
                />
              )}

              {/* ── Fix Images Studio (Side-by-Side Photo Pair Enhancement) ── */}
              {activeTab === 'fix-images' && (
                <FixImagesView
                  tableId={idcardActionsState?.tableId || 1}
                  scopedOrgId={idcardActionsState?.orgId || scopedClientId || scopedClientOrg?.id}
                  scopedOrgName={scopedClientOrg?.name || null}
                  currentUser={currentUser}
                  userRole={userRole}
                  addToast={addToast}
                  onBack={() => {
                    setActiveTab('idcard-actions');
                    setIdcardActionsState((prev) => ({ ...prev, status: 'approved' }));
                  }}
                />
              )}

              {/* ── Data & Photo Collection Studio / Queue ── */}
              {activeTab === 'data-collection' && (
                <DataCollectionView
                  tableId={idcardActionsState?.tableId || null}
                  campaignId={idcardActionsState?.campaignId || null}
                  scopedOrgId={idcardActionsState?.orgId || scopedClientId || scopedClientOrg?.id}
                  scopedOrgName={scopedClientOrg?.name || null}
                  currentUser={currentUser}
                  userRole={userRole}
                  addToast={addToast}
                  onBack={() => {
                    if (idcardActionsState?.tableId) {
                      setActiveTab('idcard-actions');
                      setIdcardActionsState((prev) => ({ ...prev, status: 'pending' }));
                    } else {
                      setActiveTab('tables');
                    }
                  }}
                  onNavigate={(dest, params) => {
                    if (dest === 'idcard-actions') {
                      const tid = params?.tableId || params?.table_id || 1;
                      const st = normalizeRouteStatus(params?.status || 'pending');
                      const orgId = params?.orgId || scopedClientId || scopedClientOrg?.id;
                      setIdcardActionsState({ tableId: tid, status: st, orgId });
                      setActiveTab('idcard-actions');
                    } else if (dest === 'tables') {
                      setActiveTab('tables');
                    }
                  }}
                />
              )}

              {/* ── Reprint Queue ── */}
              {activeTab === 'reprints' && <ReprintCardsManagerView addToast={addToast} />}

              {/* ── Manage Organisation ── */}
              {activeTab === 'organisations' && ((isAdminRole || isOperatorRole) ? (
                <OrganisationDirectoryView
                  addToast={addToast}
                  onOpenActionDrawer={handleOpenActionDrawer}
                  onNavigate={(tab, params) => {
                    if ((tab === 'cards' || tab === 'assistants' || tab === 'managers') && params?.clientId) {
                      setScopedClientId(params.clientId);
                      setScopedClientOrg(params.org || { id: params.clientId, name: params.clientName });
                      setActiveTab(tab);
                    } else {
                      setScopedClientId(null);
                      setScopedClientOrg(null);
                      setActiveTab(tab);
                    }
                  }}
                  onOpenDeleteModal={handleOpenDeleteModal}
                />
              ) : (
                <DashboardView currentUser={currentUser} onNavigate={(d) => setActiveTab(d)} />
              ))}


              {/* ── Manage Operator (Data Managers & Photographers) ── */}
              {(activeTab === 'operators' || activeTab === 'staff' || activeTab === 'photographers') && (isAdminRole ? (
                <OperatorManagementView
                  addToast={addToast}
                  staffType="operator"
                  onOpenActionDrawer={handleOpenActionDrawer}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onOpenDeleteModal={handleOpenDeleteModal}
                />
              ) : (
                <DashboardView currentUser={currentUser} onNavigate={(d) => setActiveTab(d)} />
              ))}

              {/* ── Manage Assistants ── */}
              {activeTab === 'assistants' && ((isAdminRole || isOrgRole) ? (
                <AssistantManagementView
                  addToast={addToast}
                  staffType="assistant"
                  scopedClientId={scopedClientId}
                  scopedClientOrg={scopedClientOrg}
                  onClearOrgScope={() => {
                    setScopedClientId(null);
                    setScopedClientOrg(null);
                  }}
                  onOpenActionDrawer={handleOpenActionDrawer}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onOpenDeleteModal={handleOpenDeleteModal}
                />
              ) : (
                <DashboardView currentUser={currentUser} onNavigate={(d) => setActiveTab(d)} />
              ))}

              {/* ── Manage Managers (Prime & Super Managers) ── */}
              {activeTab === 'managers' && ((isAdminRole || isOrgRole) ? (
                <ManagerManagementView
                  addToast={addToast}
                  staffType="manager"
                  scopedClientId={scopedClientId}
                  scopedClientOrg={scopedClientOrg}
                  onClearOrgScope={() => {
                    setScopedClientId(null);
                    setScopedClientOrg(null);
                  }}
                  onOpenActionDrawer={handleOpenActionDrawer}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onOpenDeleteModal={handleOpenDeleteModal}
                />
              ) : (
                <DashboardView currentUser={currentUser} onNavigate={(d) => setActiveTab(d)} />
              ))}

              {/* ── System / Control Panel (Unified System + Pro) ── */}
              {(activeTab === 'panel' || activeTab === 'pro') && ((isAdminRole || isOperatorRole) ? (
                <ManagePanelView
                  addToast={addToast}
                  currentUser={currentUser}
                  userRole={userRole}
                  initialTab={panelSubtab}
                  onTabChange={(newSubtab) => {
                    setPanelSubtab(newSubtab);
                    const slug = PRO_SYSTEM_SUBTAB_TO_SLUG[newSubtab] || newSubtab;
                    const targetRoute = `/pro-system/${slug}`;
                    if (window.location.pathname !== targetRoute) {
                      window.history.pushState({}, document.title, targetRoute);
                    }
                  }}
                />
              ) : (
                <DashboardView currentUser={currentUser} onNavigate={(d) => setActiveTab(d)} />
              ))}

              {/* ── Tutorial ── */}
              {activeTab === 'tutorial' && <TutorialGuideView />}

              {/* ── Settings / Profile ── */}
              {(activeTab === 'settings' || activeTab === 'profile') && (
                <ProfileSettingsView addToast={addToast} currentUser={currentUser} onLogout={handleLogout} />
              )}

              {/* ── Statistics / Analytics (Super Admin & Staff) ── */}
              {activeTab === 'statistics' && (isAdminRole ? (
                <SuperAdminStatisticsView addToast={addToast} />
              ) : (
                <DashboardView currentUser={currentUser} onNavigate={(d) => setActiveTab(d)} />
              ))}
            </PageTransition>
            </React.Suspense>
          </ErrorBoundary>
        </div>

        {/* Global Black Footer */}
        <Footer
          activeTab={activeTab}
          onNavigate={(dest, params) => {
            if (dest === 'organisations') {
              setScopedClientId(null);
              setScopedClientOrg(null);
              setActiveTableName(null);
            } else if (dest === 'cards' && params?.orgId) {
              setScopedClientId(params.orgId);
              if (params.orgName) setScopedClientOrg({ id: params.orgId, name: params.orgName });
              setIdcardActionsState(null);
            }
            setActiveTab(dest);
          }}
          idcardActionsState={idcardActionsState}
          scopedOrgName={scopedClientOrg?.name || null}
          scopedOrgId={scopedClientId || scopedClientOrg?.id || null}
          activeTableName={activeTableName}
          userRole={userRole}
        />
      </div>

      {/* ── Global Modals & Drawers ── */}
      <ErrorBoundary>
        <QuickActionDrawer
          isOpen={!!drawerAction}
          actionType={drawerAction}
          initialData={drawerInitialData}
          currentUser={currentUser}
          userRole={userRole}
          onClose={() => {
            setDrawerAction(null);
            setDrawerInitialData(null);
          }}
          onNavigate={(tab, params) => {
            if ((tab === 'cards' || tab === 'assistants' || tab === 'managers') && params?.clientId) {
              setScopedClientId(params.clientId);
              setScopedClientOrg(params.org || { id: params.clientId, name: params.clientName });
              setActiveTab(tab);
            } else {
              setScopedClientId(null);
              setScopedClientOrg(null);
              setActiveTab(tab);
            }
          }}
          addToast={addToast}
          onOpenDeleteModal={handleOpenDeleteModal}
        />
      </ErrorBoundary>
      <CardDownloadsModal
        isOpen={showDownloadsModal}
        onClose={() => setShowDownloadsModal(false)}
        addToast={addToast}
      />

      <GlobalSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onNavigate={(tab, params) => {
          if (tab === 'idcard-actions' && params) {
            const st = normalizeRouteStatus(params.status || 'pending');
            setIdcardActionsState({ tableId: params.tableId, status: st });
            setActiveTab('idcard-actions');
          } else if (tab === 'cards' && params?.clientId) {
            setScopedClientId(params.clientId);
            setScopedClientOrg(params.org || { id: params.clientId, name: params.clientName });
            setActiveTab('cards');
          } else if (tab) {
            setActiveTab(tab);
          }
        }}
      />
      <ConfirmDeleteModal
        isOpen={!!deleteModalConfig}
        onClose={() => setDeleteModalConfig(null)}
        title={deleteModalConfig?.title || 'Confirm Permanent Delete'}
        headline={deleteModalConfig?.headline || deleteModalConfig?.title || ''}
        itemDescription={deleteModalConfig?.itemDescription || 'this item'}
        requiresCode={deleteModalConfig?.requiresCode !== false}
        deleteCode={deleteModalConfig?.deleteCode || ''}
        confirmText={deleteModalConfig?.confirmText || 'Delete'}
        confirmVariant={deleteModalConfig?.confirmVariant || 'danger'}
        icon={deleteModalConfig?.icon || null}
        customMessage={deleteModalConfig?.customMessage || ''}
        note={deleteModalConfig?.note || ''}
        onConfirm={() => {
          deleteModalConfig?.onConfirm?.();
          setDeleteModalConfig(null);
        }}
      />

      <OldVersionWarningModal
        isOpen={showWarningModal}
        warningData={warningData}
        onClose={() => setShowWarningModal(false)}
        onConfirmOverwrite={() => {
          setShowWarningModal(false);
          addToast('Overwrite confirmed', 'warning');
        }}
      />
      {/* Sonner Toast Container — elevated 16px above 36px footer with rounded-8px cards */}
      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        closeButton
        offset={52}
        gap={8}
        duration={4500}
        style={{ zIndex: 2147483647 }}
        toastOptions={{
          style: {
            fontFamily: 'var(--font-family, system-ui, -apple-system, sans-serif)',
            fontSize: '13.5px',
            borderRadius: '8px',
          },
          className: 'cardflow-toast',
        }}
      />
    </div>
  );
}
