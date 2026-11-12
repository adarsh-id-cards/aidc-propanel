"""
tables app URL configuration.
Canonical routes for Table, Schema, and IDCard endpoints.
"""

from django.urls import path
from . import views

app_name = 'tables'

urlpatterns = [
    # Table & Schema routes
    path('api/schemas/', views.api_schema_list, name='api_schema_list'),
    path('api/schemas/create/', views.api_schema_create, name='api_schema_create'),
    path('api/group/<int:group_id>/tables/', views.api_idcard_table_list, name='api_idcard_table_list'),
    path('api/group/<int:group_id>/table/create/', views.api_idcard_table_create, name='api_idcard_table_create'),
    path('api/table/<int:table_id>/', views.api_idcard_table_get, name='api_idcard_table_get'),
    path('api/table/<int:table_id>/update/', views.api_idcard_table_update, name='api_idcard_table_update'),
    path('api/table/<int:table_id>/delete/', views.api_idcard_table_delete, name='api_idcard_table_delete'),
    path('api/table/<int:table_id>/toggle-status/', views.api_idcard_table_toggle_status, name='api_idcard_table_toggle_status'),
    path('api/table/<int:table_id>/shared-managers/', views.api_table_shared_managers_get, name='api_table_shared_managers_get'),
    path('api/table/<int:table_id>/share-managers/', views.api_table_share_managers, name='api_table_share_managers'),

    # Card routes
    path('api/table/<int:table_id>/cards/', views.api_idcard_list, name='api_idcard_list'),
    path('api/table/<int:table_id>/cards-json/', views.api_idcard_cards_json, name='api_idcard_cards_json'),
    path('api/table/<int:table_id>/cards/all-ids/', views.api_idcard_all_ids, name='api_idcard_all_ids'),
    path('api/table/<int:table_id>/filter-options/', views.api_idcard_filter_options, name='api_idcard_filter_options'),
    path('api/table/<int:table_id>/card/create/', views.api_idcard_create, name='api_idcard_create'),
    path('api/card/<int:card_id>/', views.api_idcard_get, name='api_idcard_get'),
    path('api/card/<int:card_id>/history/', views.api_idcard_history, name='api_idcard_history'),
    path('api/card/<int:card_id>/update/', views.api_idcard_update, name='api_idcard_update'),
    path('api/card/<int:card_id>/update-field/', views.api_idcard_update_field, name='api_idcard_update_field'),
    path('api/card/<int:card_id>/delete/', views.api_idcard_delete, name='api_idcard_delete'),
    path('api/card/<int:card_id>/status/', views.api_idcard_change_status, name='api_idcard_change_status'),

    # Bulk operations
    path('api/table/<int:table_id>/cards/bulk-status/', views.api_idcard_bulk_status, name='api_idcard_bulk_status'),
    path('api/table/<int:table_id>/cards/bulk-delete/', views.api_idcard_bulk_delete, name='api_idcard_bulk_delete'),
    path('api/table/<int:table_id>/cards/upgrade-classes/', views.api_upgrade_all_classes, name='api_upgrade_all_classes'),
    path('api/table/<int:table_id>/status-counts/', views.api_table_status_counts, name='api_table_status_counts'),

    # Table freeze routes (operators & superadmins)
    path('api/table/<int:table_id>/freeze-info/', views.api_table_freeze_info, name='api_table_freeze_info'),
    path('api/table/<int:table_id>/freeze-table/', views.api_table_freeze_apply, name='api_table_freeze_apply'),
    path('api/table/<int:table_id>/unfreeze-table/', views.api_table_freeze_unfreeze, name='api_table_freeze_unfreeze'),

    # Photo collection portal routes
    path('api/table/<int:table_id>/photo-collection/', views.api_table_photo_collection_config, name='api_table_photo_collection_config'),
    path('api/table/<int:table_id>/generate-codes/', views.api_table_generate_codes, name='api_table_generate_codes'),
    path('api/public/photo-collection/<str:token>/', views.api_public_photo_collection_meta, name='api_public_photo_collection_meta'),
    path('api/public/photo-collection/<str:token>/verify/', views.api_public_photo_collection_verify, name='api_public_photo_collection_verify'),
    path('api/public/photo-collection/<str:token>/upload/', views.api_public_photo_collection_upload, name='api_public_photo_collection_upload'),

    # Data Collection routes (Standalone Data & Photo Ingestion Pipeline)
    path('api/organisation/<int:org_id>/collection-campaigns/', views.api_organisation_collection_campaigns, name='api_organisation_collection_campaigns'),
    path('api/collection-campaign/<int:campaign_id>/', views.api_campaign_detail_and_config, name='api_campaign_detail_and_config'),
    path('api/collection-campaign/<int:campaign_id>/records/', views.api_campaign_records, name='api_campaign_records'),
    path('api/collection-campaign/<int:campaign_id>/auto-check/', views.api_campaign_auto_check, name='api_campaign_auto_check'),
    path('api/collection-campaign/<int:campaign_id>/status-change/', views.api_campaign_status_change, name='api_campaign_status_change'),
    path('api/collection-campaign/<int:campaign_id>/correction-request/', views.api_campaign_request_correction, name='api_campaign_request_correction'),
    path('api/collection-campaign/<int:campaign_id>/events/', views.api_campaign_events, name='api_campaign_events_all'),
    path('api/collection-campaign/<int:campaign_id>/events/<int:record_id>/', views.api_campaign_events, name='api_campaign_events'),
    path('api/collection-campaign/<int:campaign_id>/create-table/', views.api_campaign_create_table, name='api_campaign_create_table'),
    path('api/collection-campaign/<int:campaign_id>/sync-table/', views.api_campaign_sync_table, name='api_campaign_sync_table'),
    path('api/collection-campaign/<int:campaign_id>/mapping-preview/', views.api_campaign_mapping_preview, name='api_campaign_mapping_preview'),
    path('api/table/<int:table_id>/data-collection/records/', views.api_data_collection_records, name='api_data_collection_records'),
    path('api/table/<int:table_id>/data-collection/auto-check/', views.api_data_collection_auto_check, name='api_data_collection_auto_check'),
    path('api/table/<int:table_id>/data-collection/promote/', views.api_data_collection_promote, name='api_data_collection_promote'),
    path('api/table/<int:table_id>/data-collection/status-change/', views.api_data_collection_status_change, name='api_data_collection_status_change'),
    path('api/public/data-collection/<str:token>/', views.api_public_data_collection_meta, name='api_public_data_collection_meta'),
    path('api/public/data-collection/<str:token>/submit/', views.api_public_data_collection_submit, name='api_public_data_collection_submit'),
    path('api/table/<int:table_id>/data-collection/correction-request/', views.api_data_collection_request_correction, name='api_data_collection_request_correction'),
    path('api/table/<int:table_id>/data-collection/events/<int:record_id>/', views.api_data_collection_events, name='api_data_collection_events'),
    path('api/table/<int:table_id>/data-collection/config/', views.api_data_collection_config, name='api_data_collection_config'),
    path('api/public/data-collection/correction/<str:token>/', views.api_public_correction_meta, name='api_public_correction_meta'),
    path('api/public/data-collection/correction/<str:token>/submit/', views.api_public_correction_submit, name='api_public_correction_submit'),
]