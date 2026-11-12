/**
 * CardFlow — B2B Enterprise SaaS Platform
 * Copyright (c) 2024-2026 KDR Softwares. All Rights Reserved.
 * Founder & Principal Architect: Roshan Damor (@logicbyroshan) - KDR Softwares
 * Proprietary and Confidential Commercial Software.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
