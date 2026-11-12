from django.urls import path
from . import views

urlpatterns = [
    path('api/data/', views.api_statistics_data, name='api_statistics_data'),
    path('data/', views.api_statistics_data, name='api_statistics_data_alt'),
    path('api/live/', views.api_live_presence_breakdown, name='api_live_presence_breakdown'),
    path('live/', views.api_live_presence_breakdown, name='api_live_presence_breakdown_alt'),
    path('api/check-load/', views.api_check_server_load, name='api_check_server_load'),
    path('check-load/', views.api_check_server_load, name='api_check_server_load_alt'),
]
