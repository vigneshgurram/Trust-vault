from django.contrib import admin
from django.urls import path, include
from django.shortcuts import redirect
from django.http import JsonResponse
from rest_framework.routers import DefaultRouter
from vault import views

router = DefaultRouter()
router.register(r'documents', views.DocumentViewSet, basename='api-documents')
router.register(r'audit', views.AuditLogViewSet, basename='api-audit')
router.register(r'users', views.UserViewSet, basename='api-users')

def health_check(request):
    return JsonResponse({'status': 'ok', 'service': 'TrustVault Django API'})

urlpatterns = [
    # Django Admin
    path('admin/', admin.site.urls),

    # Health Check
    path('api/health/', health_check, name='health-check'),

    # REST Framework API
    path('api/', include(router.urls)),

    # Web UI Authentication
    path('', lambda req: redirect('documents_list')),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),

    # Web UI Documents & ACL
    path('documents/', views.documents_list_view, name='documents_list'),
    path('documents/<uuid:doc_id>/', views.document_detail_view, name='document_detail'),
    path('documents/<uuid:doc_id>/download/', views.document_download_view, name='document_download'),
    path('documents/<uuid:doc_id>/delete/', views.document_delete_view, name='document_delete'),
    path('documents/<uuid:doc_id>/grant/', views.permission_grant_view, name='permission_grant'),
    path('documents/<uuid:doc_id>/revoke/<uuid:perm_id>/', views.permission_revoke_view, name='permission_revoke'),

    # Web UI Admin & Audit Trail
    path('audit/', views.audit_trail_view, name='audit_trail'),
    path('admin-dashboard/', views.admin_dashboard_view, name='admin_dashboard'),
]
