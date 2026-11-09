from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from vault.models import CustomUser, Document, DocumentPermission, AuditLog

@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'role', 'is_active', 'is_staff', 'date_joined')
    list_filter = ('role', 'is_active', 'is_staff')
    fieldsets = UserAdmin.fieldsets + (
        ('TrustVault Role', {'fields': ('role',)}),
    )

@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'owner', 'category', 'original_filename', 'file_size', 'created_at', 'deleted_at')
    list_filter = ('category', 'created_at', 'deleted_at')
    search_fields = ('title', 'description', 'original_filename')
    readonly_fields = ('file_path', 'checksum', 'encryption_iv')

@admin.register(DocumentPermission)
class DocumentPermissionAdmin(admin.ModelAdmin):
    list_display = ('document', 'user', 'permission_level', 'granted_by', 'granted_at', 'revoked_at')
    list_filter = ('permission_level', 'granted_at', 'revoked_at')
    search_fields = ('document__title', 'user__username', 'granted_by__username')

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('sequence_number', 'timestamp', 'user', 'action', 'resource_type', 'resource_id', 'entry_hash')
    list_filter = ('action', 'resource_type', 'timestamp')
    search_fields = ('action', 'user__username', 'resource_id', 'details')
    readonly_fields = ('sequence_number', 'timestamp', 'user', 'action', 'resource_type', 'resource_id', 'details', 'ip_address', 'user_agent', 'previous_hash', 'entry_hash')

    def has_add_permission(self, request):
        return False  # Audit logs must only be created programmatically

    def has_delete_permission(self, request, obj=None):
        return False  # Append-only: audit logs cannot be deleted from admin
