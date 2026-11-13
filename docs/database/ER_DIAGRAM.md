# Pro-Panel Complete Entity-Relationship Diagram (`ER_DIAGRAM.md`)

> [!NOTE]
> This Entity-Relationship Diagram reflects the clean, rebuilt Pro-Panel PostgreSQL database architecture across all 13 model-owning Django apps (`core`, `accounts`, `saas`, `organisation`, `assistants`, `operators`, `tables`, `mediafiles`, `reprint`, `operations`, `mobile_api`, `desktop_app`, `stats`).

## 1. Complete Domain ER Diagram

```mermaid
erDiagram
    %% ========================================================================
    %% IDENTITY, AUTHENTICATION & SESSIONS (core, accounts)
    %% ========================================================================
    core_user {
        bigint id PK
        varchar username UK
        varchar email UK "unique_user_email (non-empty)"
        varchar role "superadmin | admin_staff | client | client_staff | photographer"
        bigint subscription_id FK "NULL -> saas_saassubscription.id (SET_NULL)"
        boolean is_active
        boolean is_staff
        boolean is_superuser
        timestamptz created_at
        timestamptz updated_at
    }

    accounts_userdevicesession {
        bigint id PK
        bigint user_id FK "-> core_user.id (CASCADE)"
        varchar session_key UK
        varchar device_type "web | mobile | desktop"
        varchar device_name
        inet ip_address
        timestamptz last_active
    }

    accounts_usersecuritypin {
        bigint id PK
        bigint user_id FK,UK "OneToOne -> core_user.id (CASCADE)"
        varchar pin_hash
        integer failed_attempts
        timestamptz locked_until
    }

    %% ========================================================================
    %% SAAS & BILLING (saas)
    %% ========================================================================
    saas_saastierfeature {
        bigint id PK
        varchar tier_code UK "basic | pro | enterprise"
        varchar display_name
        integer max_organisations
        integer max_cards
        numeric price_monthly
        numeric price_yearly
        boolean is_active
    }

    saas_saassubscription {
        bigint id PK
        varchar company_name
        varchar tier "basic | pro | enterprise"
        varchar status "trial | active | grace | expired | suspended"
        integer card_Quota
        integer cards_used
        integer max_organisations
        timestamptz starts_at
        timestamptz expires_at
    }

    saas_saaspayment {
        bigint id PK
        bigint subscription_id FK "-> saas_saassubscription.id (CASCADE)"
        bigint recorded_by_id FK "NULL -> core_user.id (SET_NULL)"
        numeric amount
        varchar status
        varchar payment_method
        timestamptz paid_at
    }

    saas_saascardtopuprequest {
        bigint id PK
        bigint subscription_id FK "-> saas_saassubscription.id (CASCADE)"
        bigint requested_by_id FK "NULL -> core_user.id (SET_NULL)"
        bigint reviewed_by_id FK "NULL -> core_user.id (SET_NULL)"
        integer requested_cards
        varchar status
        timestamptz created_at
    }

    saas_saasaddonrequest {
        bigint id PK
        bigint subscription_id FK "-> saas_saassubscription.id (CASCADE)"
        bigint requested_by_id FK "NULL -> core_user.id (SET_NULL)"
        bigint reviewed_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar addon_type
        integer quantity
        varchar status
        timestamptz created_at
    }

    saas_saaslead {
        bigint id PK
        bigint converted_subscription_id FK "NULL -> saas_saassubscription.id (SET_NULL)"
        varchar full_name
        varchar email
        varchar phone
        varchar status
        timestamptz created_at
    }

    saas_saasplatformlog {
        bigint id PK
        bigint subscription_id FK "NULL -> saas_saassubscription.id (SET_NULL)"
        bigint actor_id FK "NULL -> core_user.id (SET_NULL)"
        varchar event_type
        jsonb metadata
        timestamptz created_at
    }

    %% ========================================================================
    %% ORGANISATIONS, MANAGERS & STAFF (organisation, assistants, operators, core)
    %% ========================================================================
    organisation_organisation {
        bigint id PK
        bigint user_id FK,UK "NULL OneToOne -> core_user.id (CASCADE)"
        bigint owner_id FK "NULL -> core_user.id (SET_NULL)"
        bigint subscription_id FK "NULL -> saas_saassubscription.id (SET_NULL)"
        varchar code_number UK
        varchar name
        varchar org_type "school | other"
        varchar status "active | inactive | hold"
        boolean perm_organisation_list
        boolean perm_idcard_pending_list
        boolean perm_idcard_verified_list
        boolean perm_idcard_approved_list
        boolean perm_idcard_pool_list
        boolean perm_idcard_download_list
        boolean perm_idcard_reprint_list
        timestamptz created_at
    }

    organisation_manager {
        bigint id PK
        bigint organisation_id FK "-> organisation_organisation.id (CASCADE)"
        bigint user_id FK,UK "OneToOne -> core_user.id (CASCADE)"
        varchar name
        varchar manager_type "principal | manager | sub_admin | other"
        boolean is_active
        timestamptz created_at
    }

    assistants_assistant {
        bigint id PK
        bigint user_id FK,UK "OneToOne -> core_user.id (CASCADE)"
        bigint organisation_id FK "-> organisation_organisation.id (CASCADE)"
        bigint manager_id FK "NULL -> organisation_manager.id (SET_NULL)"
        varchar department
        varchar designation
        boolean perm_organisation_list
        boolean perm_manage_assistants
        timestamptz created_at
    }

    operators_operator {
        bigint id PK
        bigint user_id FK,UK "OneToOne -> core_user.id (CASCADE)"
        bigint created_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar department
        varchar designation
        boolean perm_organisation_list
        timestamptz created_at
    }

    core_photographer {
        bigint id PK
        bigint user_id FK,UK "OneToOne -> core_user.id (CASCADE)"
        varchar studio_name
        boolean is_active
        timestamptz created_at
    }

    core_photographerassignment {
        bigint id PK
        bigint photographer_id FK "-> core_photographer.id (CASCADE)"
        bigint client_id FK "-> organisation_organisation.id (CASCADE)"
        bigint assigned_by_id FK "NULL -> core_user.id (SET_NULL)"
        boolean can_upload_photos
        timestamptz assigned_at
    }

    %% ========================================================================
    %% TABLES, ID CARDS & PUBLIC COLLECTION (tables, mediafiles, reprint)
    %% ========================================================================
    tables_table {
        bigint id PK
        bigint organisation_id FK "-> organisation_organisation.id (CASCADE)"
        varchar name
        jsonb fields "Schema definition for dynamic card columns"
        boolean is_active
        boolean deleted_by_manager
        timestamptz deleted_at
        timestamptz created_at
    }

    tables_idcard {
        bigint id PK
        bigint table_id FK "-> tables_table.id (CASCADE)"
        jsonb field_data "Indexed via GIN (idcard_field_data_gin)"
        varchar status "pending | verified | approved | printed | download | pool | reprint | deleted"
        varchar original_photo_name
        timestamptz status_changed_at
        timestamptz downloaded_at
        timestamptz deleted_at
        timestamptz created_at
        timestamptz updated_at
    }

    tables_tableaccess {
        bigint id PK
        bigint table_id FK "-> tables_table.id (CASCADE)"
        bigint manager_id FK "-> organisation_manager.id (CASCADE)"
        boolean can_view
        boolean can_edit
    }

    tables_tablefreeze {
        bigint id PK
        bigint table_id FK "-> tables_table.id (CASCADE)"
        bigint frozen_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar status
        boolean is_frozen
    }

    tables_tablephotocollectionlink {
        bigint id PK
        bigint table_id FK,UK "OneToOne -> tables_table.id (CASCADE)"
        bigint created_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar token UK
        boolean is_active
    }

    tables_collectioncampaign {
        bigint id PK
        bigint organisation_id FK "-> organisation_organisation.id (CASCADE)"
        bigint table_id FK "NULL -> tables_table.id (SET_NULL)"
        bigint created_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar token UK
        varchar name
        varchar status
    }

    tables_datacollectionrecord {
        bigint id PK
        bigint table_id FK "NULL -> tables_table.id (CASCADE)"
        bigint campaign_id FK "NULL -> tables_collectioncampaign.id (CASCADE)"
        bigint matched_card_id FK "NULL -> tables_idcard.id (SET_NULL)"
        bigint verified_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar status "collection | checked | canceled"
        varchar idempotency_key
        jsonb field_data
        timestamptz submitted_at
    }

    tables_datacollectionevent {
        bigint id PK
        bigint record_id FK "-> tables_datacollectionrecord.id (CASCADE)"
        bigint actor_id FK "NULL -> core_user.id (SET_NULL)"
        varchar event_type
        timestamptz created_at
    }

    mediafiles_cardmedia {
        bigint id PK
        bigint card_id FK,UK "NULL OneToOne -> tables_idcard.id (CASCADE)"
        bigint client_id FK "NULL -> organisation_organisation.id (CASCADE)"
        varchar original_filename
        varchar file_hash
        timestamptz created_at
    }

    reprint_reprintrequest {
        bigint id PK
        bigint card_id FK "-> tables_idcard.id (CASCADE)"
        bigint table_id FK "-> tables_table.id (CASCADE)"
        bigint requested_by_id FK "NULL -> core_user.id (SET_NULL)"
        bigint processed_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar status "requested | processing | reprinted | rejected"
        timestamptz created_at
    }

    %% ========================================================================
    %% OPERATIONS, UNDO/REDO & AUDIT LOGGING (operations, core)
    %% ========================================================================
    operations_operation {
        bigint id PK
        bigint user_id FK "NULL -> core_user.id (SET_NULL)"
        bigint organisation_id FK "-> organisation_organisation.id (CASCADE)"
        bigint target_table_id FK "NULL -> tables_table.id (SET_NULL)"
        varchar operation_type
        varchar status "completed | undone | redone | failed"
        timestamptz created_at
    }

    operations_operationchange {
        bigint id PK
        bigint operation_id FK "-> operations_operation.id (CASCADE)"
        varchar target_model
        bigint target_id "64-bit BigIntegerField"
        varchar field_name
    }

    operations_bulktransaction {
        bigint id PK
        bigint actor_id FK "NULL -> core_user.id (SET_NULL)"
        bigint organisation_id FK "-> organisation_organisation.id (CASCADE)"
        bigint table_id FK "NULL -> tables_table.id (SET_NULL)"
        bigint undone_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar action_type
        timestamptz created_at
    }

    operations_auditevent {
        bigint id PK
        bigint actor_id FK "NULL -> core_user.id (SET_NULL)"
        bigint organisation_id FK "-> organisation_organisation.id (CASCADE)"
        bigint target_table_id FK "NULL -> tables_table.id (SET_NULL)"
        bigint bulk_transaction_id FK "NULL -> operations_bulktransaction.id (SET_NULL)"
        varchar target_type
        bigint target_id "64-bit BigIntegerField"
        timestamptz created_at
    }

    core_activitylog {
        bigint id PK
        bigint user_id FK "NULL -> core_user.id (SET_NULL)"
        varchar action
        varchar target_model
        bigint target_id "64-bit PositiveBigIntegerField"
        timestamptz created_at
    }

    %% ========================================================================
    %% MESSAGING, PRESENCE, NOTIFICATIONS, DEVICES & TELEMETRY
    %% ========================================================================
    core_notification {
        bigint id PK
        bigint created_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar title
        varchar target
        boolean is_active
        timestamptz created_at
    }

    core_notificationread {
        bigint id PK
        bigint notification_id FK "-> core_notification.id (CASCADE)"
        bigint user_id FK "-> core_user.id (CASCADE)"
        timestamptz read_at
    }

    core_clientmessage {
        bigint id PK
        bigint client_id FK "NULL -> organisation_organisation.id (CASCADE)"
        bigint sent_by_id FK "NULL -> core_user.id (SET_NULL)"
        bigint notification_id FK "NULL -> core_notification.id (CASCADE)"
        varchar scope
        timestamptz created_at
    }

    core_clientpresencesession {
        bigint id PK
        bigint client_id FK "-> organisation_organisation.id (CASCADE)"
        bigint user_id FK "-> core_user.id (CASCADE)"
        varchar tab_id
        timestamptz last_seen_at
    }

    core_backgroundtask {
        uuid id PK
        bigint user_id FK "-> core_user.id (CASCADE)"
        varchar task_type
        varchar status
        timestamptz created_at
    }

    core_backuptask {
        uuid id PK
        bigint created_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar status
        timestamptz created_at
    }

    desktop_app_desktopappdevice {
        bigint id PK
        bigint user_id FK "-> core_user.id (CASCADE)"
        bigint revoked_by_id FK "NULL -> core_user.id (SET_NULL)"
        varchar installation_id UK
        varchar token_hash UK
        boolean is_active
    }

    mobile_api_mobiledevicetoken {
        bigint id PK
        bigint user_id FK "-> core_user.id (CASCADE)"
        varchar token UK
        varchar platform
        boolean is_active
    }

    %% ========================================================================
    %% RELATIONSHIPS
    %% ========================================================================
    saas_saassubscription ||--o{ core_user : "subscription"
    saas_saassubscription ||--o{ organisation_organisation : "subscription"
    saas_saassubscription ||--o{ saas_saaspayment : "payments"
    saas_saassubscription ||--o{ saas_saascardtopuprequest : "topup_requests"
    saas_saassubscription ||--o{ saas_saasaddonrequest : "addon_requests"
    saas_saassubscription ||--o{ saas_saaslead : "converted_leads"
    saas_saassubscription ||--o{ saas_saasplatformlog : "logs"

    core_user ||--o{ accounts_userdevicesession : "device_sessions"
    core_user ||--o| accounts_usersecuritypin : "security_pin"
    core_user ||--o| organisation_organisation : "organisation_account"
    core_user ||--o{ organisation_organisation : "owned_organisations"
    core_user ||--o| organisation_manager : "manager_profile"
    core_user ||--o| assistants_assistant : "assistant_profile"
    core_user ||--o| operators_operator : "operator_profile"
    core_user ||--o| core_photographer : "photographer_profile"
    core_user ||--o{ core_activitylog : "activity_logs"
    core_user ||--o{ core_backgroundtask : "background_tasks"
    core_user ||--o{ core_backuptask : "backup_tasks"
    core_user ||--o{ desktop_app_desktopappdevice : "desktop_devices"
    core_user ||--o{ mobile_api_mobiledevicetoken : "mobile_tokens"

    organisation_organisation ||--o{ organisation_manager : "managers"
    organisation_organisation ||--o{ assistants_assistant : "assistants"
    organisation_organisation ||--o{ tables_table : "tables"
    organisation_organisation ||--o{ tables_collectioncampaign : "campaigns"
    organisation_organisation ||--o{ mediafiles_cardmedia : "media_files"
    organisation_organisation ||--o{ operations_operation : "operations"
    organisation_organisation ||--o{ operations_bulktransaction : "bulk_transactions"
    organisation_organisation ||--o{ operations_auditevent : "audit_events"
    organisation_organisation ||--o{ core_photographerassignment : "photographer_assignments"
    organisation_organisation ||--o{ core_clientmessage : "messages"
    organisation_organisation ||--o{ core_clientpresencesession : "presence_sessions"

    organisation_manager ||--o{ assistants_assistant : "assistants"
    organisation_manager ||--o{ tables_tableaccess : "table_access_grants"

    tables_table ||--o{ tables_idcard : "id_cards"
    tables_table ||--o{ tables_tableaccess : "access_grants"
    tables_table ||--o{ tables_tablefreeze : "freezes"
    tables_table ||--o| tables_tablephotocollectionlink : "photo_collection_link"
    tables_table ||--o{ tables_collectioncampaign : "campaigns"
    tables_table ||--o{ tables_datacollectionrecord : "collection_records"
    tables_table ||--o{ reprint_reprintrequest : "reprint_requests"
    tables_table ||--o{ operations_operation : "operations"
    tables_table ||--o{ operations_bulktransaction : "bulk_transactions"
    tables_table ||--o{ operations_auditevent : "audit_events"

    tables_idcard ||--o| mediafiles_cardmedia : "media"
    tables_idcard ||--o{ reprint_reprintrequest : "reprint_requests"
    tables_idcard ||--o{ tables_datacollectionrecord : "matched_records"

    tables_collectioncampaign ||--o{ tables_datacollectionrecord : "records"
    tables_datacollectionrecord ||--o{ tables_datacollectionevent : "events"

    operations_operation ||--o{ operations_operationchange : "changes"
    operations_bulktransaction ||--o{ operations_auditevent : "audit_events"

    core_notification ||--o{ core_notificationread : "reads"
    core_notification ||--o{ core_clientmessage : "client_messages"
    core_photographer ||--o{ core_photographerassignment : "assignments"
```

