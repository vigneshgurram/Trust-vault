from rest_framework import permissions
from vault.models import DocumentPermission

def check_user_document_permission(user, document, required_level='READ') -> bool:
    """
    Real-time DB query for document permission.
    Owner always has full access.
    EDIT implies READ.
    Revoked permissions are strictly excluded.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return False
        
    if document.deleted_at is not None:
        return False
        
    # Owner always has access
    if document.owner_id == user.id:
        return True
        
    # Allowed levels
    levels = ['READ', 'EDIT'] if required_level == 'READ' else ['EDIT']
    
    # Active grant check
    has_perm = DocumentPermission.objects.filter(
        document=document,
        user=user,
        permission_level__in=levels,
        revoked_at__isnull=True
    ).exists()
    
    return has_perm

class IsAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'admin')

class CanUploadDocuments(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role in ['owner', 'admin'])
