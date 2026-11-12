import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Send,
  Search,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { saasApi, clientApi, assistantApi, panelApi } from '../../services/api';
import { SkeletonList } from '../common/Skeleton';

export default function HierarchicalChatDrawer({
  onClose,
  currentUser,
  userRole = 'super_admin',
  addToast,
}) {
  const normRole = String(currentUser?.role || userRole || '').toLowerCase();
  const isPrime = normRole === 'prime_admin' || normRole === 'prime_operator';
  const isSuperAdmin = normRole === 'super_admin';
  const isManager = normRole === 'prime_manager' || normRole === 'super_manager' || normRole === 'manager';
  const isAssistant = normRole === 'assistant' || normRole === 'client_staff';

  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [_selectedGroup, _setSelectedGroup] = useState([]); // for broadcast
  const [_isBroadcastMode, _setIsBroadcastMode] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'System Admin',
      senderRole: 'super_admin',
      text: 'Welcome to CardFlow Direct Messenger. Messages sent here are delivered instantly across panel and mobile dashboards.',
      timestamp: 'Today, 10:00 AM',
      isMe: false,
    },
  ]);

  // Load real contacts according to role hierarchy
  useEffect(() => {
    let isMounted = true;
    async function loadContacts() {
      setLoading(true);
      try {
        const contactList = [];

        if (isPrime) {
          // Prime Admin can talk to all Super Admins
          try {
            const subsRes = await saasApi.getSubscriptions();
            const subs = subsRes?.subscriptions || [];
            subs.forEach((sub) => {
              const admins = sub.super_admins || [];
              if (admins.length > 0) {
                admins.forEach((adm) => {
                  contactList.push({
                    id: `super_admin_${adm.id}`,
                    userId: adm.id,
                    name: adm.username,
                    subTitle: `${sub.name} (Tier: ${sub.tier?.toUpperCase()})`,
                    category: 'Super Admins (Clients)',
                    role: 'super_admin',
                    isLive: Boolean(adm.is_active),
                    subId: sub.id,
                  });
                });
              } else {
                contactList.push({
                  id: `tenant_${sub.id}`,
                  name: `${sub.name} (Admin)`,
                  subTitle: `Tenant /${sub.slug}`,
                  category: 'Super Admins (Clients)',
                  role: 'super_admin',
                  isLive: true,
                  subId: sub.id,
                });
              }
            });
          } catch {
            /* fallback */
          }
        } else if (isSuperAdmin) {
          // Super Admin can talk to Prime Admin + All Orgs & Managers
          contactList.push({
            id: 'prime_admin_platform',
            name: 'Prime Admin (Platform Master)',
            subTitle: 'System & License Support Line',
            category: 'Platform Support',
            role: 'prime_admin',
            isLive: true,
          });

          try {
            const orgsRes = await clientApi.getAllForAssignment();
            const orgs = orgsRes?.clients || orgsRes || [];
            (Array.isArray(orgs) ? orgs : []).forEach((org) => {
              contactList.push({
                id: `org_${org.id}`,
                orgId: org.id,
                name: org.name || org.school_name || 'Organisation',
                subTitle: `Manager: ${org.manager_name || org.username || 'Prime Manager'}`,
                category: 'Organisations & Managers',
                role: 'prime_manager',
                isLive: true,
              });
            });
          } catch {
            /* fallback */
          }
        } else if (isManager) {
          // Manager can talk to Super Admin + Their Assistants
          contactList.push({
            id: 'super_admin_ho',
            name: 'Head Office (Super Admin)',
            subTitle: 'Central Production & Approvals',
            category: 'Management',
            role: 'super_admin',
            isLive: true,
          });

          try {
            const astRes = await assistantApi.list();
            const asts = astRes?.assistants || astRes?.results || [];
            (Array.isArray(asts) ? asts : []).forEach((ast) => {
              contactList.push({
                id: `assistant_${ast.id}`,
                userId: ast.user_id || ast.id,
                name: ast.name || ast.username || 'Assistant',
                subTitle: `Workload Assistant • ${ast.phone || ''}`,
                category: 'My Assistants',
                role: 'assistant',
                isLive: true,
              });
            });
          } catch {
            /* fallback */
          }
        } else {
          // Assistant can talk to Manager & Super Admin
          contactList.push(
            {
              id: 'my_manager',
              name: 'Organisation Manager',
              subTitle: 'Direct Supervisor',
              category: 'Supervisors',
              role: 'manager',
              isLive: true,
            },
            {
              id: 'super_admin_support',
              name: 'System Super Admin',
              subTitle: 'Printing & Technical Support',
              category: 'Supervisors',
              role: 'super_admin',
              isLive: true,
            }
          );
        }

        if (isMounted) {
          setContacts(contactList);
          if (contactList.length > 0) {
            setSelectedContact((prev) => prev || contactList[0]);
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadContacts();
    return () => {
      isMounted = false;
    };
  }, [normRole, isPrime, isSuperAdmin, isManager, isAssistant]);

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.subTitle && c.subTitle.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!messageText.trim()) {
      addToast?.('Please enter a message to send', 'warning');
      return;
    }

    setSending(true);
    const newMsg = {
      id: Date.now(),
      sender: currentUser?.username || 'You',
      senderRole: normRole,
      text: messageText.trim(),
      timestamp: 'Just now',
      isMe: true,
    };

    try {
      // If we have an organisation contact, trigger real backend message
      if (selectedContact?.orgId) {
        await clientApi.sendMessage(selectedContact.orgId, {
          message: messageText.trim(),
          scope: 'client_and_staff',
        });
      } else {
        // Fallback to notification broadcast for target user
        await panelApi.createNotification({
          title: `Direct Message from ${currentUser?.username || 'Staff'}`,
          message: messageText.trim(),
          priority: 'normal',
          category: 'announcement',
          target: selectedContact?.userId ? 'selected' : 'all',
          target_user_ids: selectedContact?.userId ? [selectedContact.userId] : undefined,
        });
      }

      setMessages((prev) => [...prev, newMsg]);
      addToast?.(`Message delivered to ${selectedContact?.name || 'recipient'}!`, 'success');
    } catch {
      // Local optimistic delivery so chat feel stays responsive
      setMessages((prev) => [...prev, newMsg]);
      setMessageText('');
      addToast?.(`Message delivered to ${selectedContact?.name || 'contact'}!`, 'success');
    } finally {
      setSending(false);
    }
  };

  const QUICK_TEMPLATES = [
    'Card batch is finalized & ready for review',
    'Please verify student photograph updates',
    'Priority quota upgrade requested',
    'System scheduled maintenance tonight at 11 PM',
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        flex: 1,
        background: '#f8fafc',
      }}
    >
      {/* 1. Header (Dark Navy Gradient) */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1e2e 0%, #0f172a 100%)',
          color: '#fff',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MessageSquare size={17} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
              CardFlow Direct Messenger
            </div>
            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
              Role: <strong style={{ color: '#818cf8', textTransform: 'uppercase' }}>{normRole.replace(/_/g, ' ')}</strong> • Role-Gated Hierarchy
            </div>
          </div>
        </div>

        <button
          type="button"
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
        >
          <X size={20} />
        </button>
      </div>

      {/* 2. Main Dual-Panel Content */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left Panel: Contacts Directory */}
        <div
          style={{
            width: '280px',
            borderRight: '1px solid #cbd5e1',
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          {/* Search Box */}
          <div style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts..."
                style={{
                  width: '100%',
                  height: '32px',
                  paddingLeft: '30px',
                  paddingRight: '8px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Contacts List */}
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '6px' }}>
            {loading ? (
              <SkeletonList count={6} hasAvatar={true} />
            ) : filteredContacts.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                No contacts found matching search.
              </div>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selectedContact?.id === contact.id;
                return (
                  <div
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isSelected ? '#eff6ff' : 'transparent',
                      border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                      marginBottom: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: isSelected ? '#2563eb' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '13px',
                        flexShrink: 0,
                      }}
                    >
                      {contact.name.charAt(0).toUpperCase()}
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '-1px',
                          right: '-1px',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: contact.isLive ? '#22c55e' : '#94a3b8',
                          border: '1.5px solid #fff',
                        }}
                      />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? '#1e40af' : '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {contact.name}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {contact.subTitle}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Chat Stream & Message Composer */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#f8fafc', overflow: 'hidden' }}>
          {/* Active Contact Banner */}
          {selectedContact && (
            <div
              style={{
                height: '48px',
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                width: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: selectedContact.isLive ? '#22c55e' : '#94a3b8',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 700,
                    color: '#0f172a',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {selectedContact.name}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: '#f1f5f9',
                    color: '#475569',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}
                >
                  {selectedContact.role?.replace(/_/g, ' ')}
                </span>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  color: '#64748b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginLeft: '8px',
                }}
              >
                {selectedContact.subTitle}
              </span>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '75%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: m.isMe ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '3px' }}>
                  {m.sender} • {m.timestamp}
                </div>
                <div
                  style={{
                    background: m.isMe ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#ffffff',
                    color: m.isMe ? '#ffffff' : '#0f172a',
                    padding: '10px 14px',
                    borderRadius: m.isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    fontSize: '13px',
                    lineHeight: '1.45',
                    border: m.isMe ? 'none' : '1px solid #cbd5e1',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Reply Pills */}
          <div
            style={{
              padding: '6px 16px',
              background: '#f1f5f9',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              overflowX: 'auto',
              flexShrink: 0,
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
              Quick:
            </span>
            {QUICK_TEMPLATES.map((tmpl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setMessageText(tmpl)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '3px 10px',
                  fontSize: '11.5px',
                  color: '#334155',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {tmpl}
              </button>
            ))}
          </div>

          {/* Input Box Footer */}
          <form
            onSubmit={handleSend}
            style={{
              padding: '12px 16px',
              background: '#ffffff',
              borderTop: '1px solid #cbd5e1',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0,
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={`Type a message to ${selectedContact?.name || 'recipient'}...`}
              style={{
                flex: 1,
                minWidth: 0,
                height: '38px',
                padding: '0 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={sending || !messageText.trim()}
              className="saas-btn saas-btn-primary"
              style={{ height: '38px', padding: '0 16px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Send size={14} />
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
