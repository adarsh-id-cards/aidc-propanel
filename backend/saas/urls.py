from django.urls import path
from . import views

app_name = 'saas'

urlpatterns = [
    # Platform Overview
    path('overview/', views.api_saas_overview, name='overview'),

    # Subscriptions & Clients
    path('subscriptions/', views.api_saas_subscriptions, name='subscriptions_list'),
    path('subscriptions/<int:sub_id>/', views.api_saas_subscription_detail, name='subscription_detail'),
    path('subscriptions/<int:sub_id>/super-admins/', views.api_saas_subscription_super_admins, name='subscription_super_admins'),
    path('subscriptions/<int:sub_id>/impersonate/', views.api_saas_enter_account, name='subscription_impersonate'),

    # Payments & Billing Ledger
    path('payments/', views.api_saas_payments, name='payments'),
    path('payments/submit/', views.api_saas_submit_payment, name='submit_payment'),
    path('payments/<int:payment_id>/verify/', views.api_saas_verify_payment, name='verify_payment'),

    # Leads & CRM Pipeline
    path('leads/', views.api_saas_leads, name='leads'),
    path('leads/<int:lead_id>/', views.api_saas_lead_detail, name='lead_detail'),

    # Prime Operators (Sales, Dev, Helper)
    path('prime-operators/', views.api_saas_prime_operators, name='prime_operators'),
    path('prime-operators/<int:operator_id>/', views.api_saas_prime_operator_detail, name='prime_operator_detail'),

    # Tier Feature Matrix
    path('features/', views.api_saas_tier_features, name='tier_features'),

    # Public Landing Page Configuration
    path('landing/<str:slug_or_domain>/', views.api_saas_public_landing, name='public_landing'),

    # Tenant Quota, Extra Cards Top-up & Paid Add-ons
    path('subscription/quota/', views.api_saas_subscription_quota, name='subscription_quota'),
    path('subscription/request-extra-cards/', views.api_saas_request_extra_cards, name='request_extra_cards'),
    path('subscription/request-addon/', views.api_saas_request_addon, name='request_addon'),
    path('subscriptions/<int:sub_id>/branding/', views.api_saas_update_tenant_branding, name='subscription_branding'),
    path('subscriptions/<int:sub_id>/regenerate-license/', views.api_saas_regenerate_license, name='regenerate_license'),
    path('topups/', views.api_saas_card_topups_list, name='topups_list'),
    path('topups/<int:topup_id>/approve/', views.api_saas_approve_topup, name='approve_topup'),
    path('addons/', views.api_saas_addon_requests_list, name='addon_requests_list'),
    path('addons/<int:req_id>/approve/', views.api_saas_approve_addon, name='approve_addon'),

    # SaaS Platform Audit, Telemetry & Logs
    path('logs/', views.api_saas_logs, name='platform_logs'),
]
