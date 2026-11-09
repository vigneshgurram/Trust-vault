import os
import uuid
from datetime import datetime, timezone
from django.shortcuts import render, redirect, get_object_or_404
from django.http import HttpResponse, Http404, JsonResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q
from django.utils import timezone as dj_timezone

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from vault.models import CustomUser, Document, DocumentPermission, AuditLog
from vault.serializers import DocumentSerializer, DocumentPermissionSerializer, AuditLogSerializer, UserSerializer
from vault.permissions import check_user_document_permission, IsAdminRole, CanUploadDocuments
from vault.services.encryption import save_encrypted_file, read_decrypted_file, compute_checksum
from vault.services.audit import record_audit_log, verify_audit_chain

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')

# ==========================================
# WEB / HTML VIEWS (Bootstrap 5 Frontend)
# ==========================================

def login_view(request):
    if request.user.is_authenticated:
        return redirect('documents_list')

    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        ip = get_client_ip(request)
        ua = request.META.get('HTTP_USER_AGENT', '')

        if user is not None:
            if not user.is_active:
                record_audit_log('LOGIN_FAILED', None, 'user', str(user.id), {'username': username, 'reason': 'Account disabled'}, ip, ua)
                messages.error(request, 'Your account has been locked out by an administrator.')
                return render(request, 'login.html')
                
            login(request, user)
            record_audit_log('LOGIN', user, 'user', str(user.id), {'username': username}, ip, ua)
            return redirect('documents_list')
        else:
            # Check if user exists with valid password but is disabled
            inactive_user = CustomUser.objects.filter(username=username).first()
            if inactive_user and inactive_user.check_password(password) and not inactive_user.is_active:
                record_audit_log('LOGIN_FAILED', None, 'user', str(inactive_user.id), {'username': username, 'reason': 'Account disabled'}, ip, ua)
                messages.error(request, 'Your account has been locked out by an administrator.')
                return render(request, 'login.html')

            record_audit_log('LOGIN_FAILED', None, 'user', None, {'username': username, 'reason': 'Invalid credentials'}, ip, ua)
            messages.error(request, 'Invalid username or password.')

    return render(request, 'login.html')

def logout_view(request):
    if request.user.is_authenticated:
        ip = get_client_ip(request)
        ua = request.META.get('HTTP_USER_AGENT', '')
        record_audit_log('LOGOUT', request.user, 'user', str(request.user.id), {}, ip, ua)
        logout(request)
    return redirect('login')

@login_required
def documents_list_view(request):
    user = request.user
    query = request.GET.get('search', '').strip()
    category = request.GET.get('category', '').strip()

    # Base query: non-deleted documents
    docs = Document.objects.filter(deleted_at__isnull=True)

    # Permission boundary: non-admins only see owned documents OR documents with active grant
    if user.role != 'admin':
        active_grants = DocumentPermission.objects.filter(
            user=user,
            revoked_at__isnull=True
        ).values_list('document_id', flat=True)

        docs = docs.filter(Q(owner=user) | Q(id__in=active_grants)).distinct()

    if query:
        docs = docs.filter(
            Q(title__icontains=query) |
            Q(description__icontains=query) |
            Q(original_filename__icontains=query)
        )

    if category:
        docs = docs.filter(category=category)

    # Handle Upload POST
    if request.method == 'POST':
        if user.role not in ['owner', 'admin']:
            messages.error(request, 'Viewers do not have upload privileges.')
            return redirect('documents_list')

        uploaded_file = request.FILES.get('file')
        title = request.POST.get('title', '').strip()
        cat = request.POST.get('category', '').strip()
        desc = request.POST.get('description', '').strip()

        if not uploaded_file or not title:
            messages.error(request, 'Please provide both a document file and a title.')
            return redirect('documents_list')

        file_bytes = uploaded_file.read()
        stored_filename = f"{uuid.uuid4().hex}.enc"
        
        stored_path, iv_hex, checksum = save_encrypted_file(file_bytes, stored_filename)

        new_doc = Document.objects.create(
            title=title,
            description=desc,
            category=cat if cat else None,
            file_path=stored_path,
            original_filename=uploaded_file.name,
            file_size=len(file_bytes),
            mime_type=uploaded_file.content_type or 'application/octet-stream',
            checksum=checksum,
            encryption_iv=iv_hex,
            owner=user,
        )

        ip = get_client_ip(request)
        ua = request.META.get('HTTP_USER_AGENT', '')
        record_audit_log('UPLOAD', user, 'document', str(new_doc.id), {
            'title': title,
            'filename': uploaded_file.name,
            'size': len(file_bytes),
        }, ip, ua)

        messages.success(request, f'Document "{title}" encrypted with AES-256-GCM and stored.')
        return redirect('document_detail', doc_id=new_doc.id)

    categories = Document.objects.filter(deleted_at__isnull=True).exclude(category__isnull=True).exclude(category='').values_list('category', flat=True).distinct()

    return render(request, 'documents.html', {
        'documents': docs,
        'categories': categories,
        'selected_category': category,
        'search_query': query,
    })

@login_required
def document_detail_view(request, doc_id):
    user = request.user
    doc = get_object_or_404(Document, id=doc_id, deleted_at__isnull=True)

    # Strict server authorization check (denies ID enumeration by returning 404)
    if not check_user_document_permission(user, doc, 'READ'):
        raise Http404("Document not found.")

    ip = get_client_ip(request)
    ua = request.META.get('HTTP_USER_AGENT', '')
    record_audit_log('VIEW', user, 'document', str(doc.id), {'title': doc.title}, ip, ua)

    is_owner = (doc.owner_id == user.id)
    can_edit = is_owner or check_user_document_permission(user, doc, 'EDIT')

    # Handle metadata update POST
    if request.method == 'POST' and 'update_metadata' in request.POST:
        if not can_edit:
            raise Http404("Document not found.")
        new_title = request.POST.get('title', '').strip()
        new_category = request.POST.get('category', '').strip()
        new_desc = request.POST.get('description', '').strip()
        if new_title:
            doc.title = new_title
            doc.category = new_category if new_category else None
            doc.description = new_desc
            doc.save()
            record_audit_log('EDIT', user, 'document', str(doc.id), {'title': new_title}, ip, ua)
            messages.success(request, 'Document metadata updated successfully.')
        return redirect('document_detail', doc_id=doc.id)

    active_perms = doc.permissions.filter(revoked_at__isnull=True)
    revoked_perms = doc.permissions.filter(revoked_at__isnull=False)
    audit_logs = AuditLog.objects.filter(resource_id=str(doc.id)).order_by('-sequence_number')
    all_users = CustomUser.objects.exclude(id=doc.owner_id).filter(is_active=True)

    return render(request, 'document_detail.html', {
        'doc': doc,
        'is_owner': is_owner,
        'can_edit': can_edit,
        'active_perms': active_perms,
        'revoked_perms': revoked_perms,
        'audit_logs': audit_logs,
        'all_users': all_users,
    })

@login_required
def document_download_view(request, doc_id):
    user = request.user
    doc = get_object_or_404(Document, id=doc_id, deleted_at__isnull=True)

    if not check_user_document_permission(user, doc, 'READ'):
        raise Http404("Document not found.")

    try:
        decrypted_bytes = read_decrypted_file(doc.file_path, doc.encryption_iv)
        # Verify SHA-256 checksum
        if compute_checksum(decrypted_bytes) != doc.checksum:
            return HttpResponse("File integrity check failed.", status=500)

        ip = get_client_ip(request)
        ua = request.META.get('HTTP_USER_AGENT', '')
        record_audit_log('DOWNLOAD', user, 'document', str(doc.id), {'title': doc.title, 'filename': doc.original_filename}, ip, ua)

        response = HttpResponse(decrypted_bytes, content_type=doc.mime_type)
        response['Content-Disposition'] = f'attachment; filename="{doc.original_filename}"'
        response['Content-Length'] = len(decrypted_bytes)
        return response
    except Exception as e:
        return HttpResponse(f"Decryption error: {str(e)}", status=500)

@login_required
def document_delete_view(request, doc_id):
    user = request.user
    doc = get_object_or_404(Document, id=doc_id, deleted_at__isnull=True)

    # Only owner or admin can delete
    if doc.owner_id != user.id and user.role != 'admin':
        raise Http404("Document not found.")

    now = dj_timezone.now()
    doc.deleted_at = now
    doc.save()

    # Cascade revoke all active permissions
    doc.permissions.filter(revoked_at__isnull=True).update(revoked_at=now)

    ip = get_client_ip(request)
    ua = request.META.get('HTTP_USER_AGENT', '')
    record_audit_log('DELETE', user, 'document', str(doc.id), {'title': doc.title}, ip, ua)

    messages.success(request, f'Document "{doc.title}" deleted and all active grants revoked.')
    return redirect('documents_list')

@login_required
def permission_grant_view(request, doc_id):
    if request.method != 'POST':
        return redirect('document_detail', doc_id=doc_id)

    user = request.user
    doc = get_object_or_404(Document, id=doc_id, deleted_at__isnull=True)

    # Only owner can grant permissions
    if doc.owner_id != user.id:
        messages.error(request, 'Only the document owner can grant permissions.')
        return redirect('document_detail', doc_id=doc_id)

    target_user_id = request.POST.get('user_id')
    perm_level = request.POST.get('permission_level', 'READ')

    target_user = get_object_or_404(CustomUser, id=target_user_id)

    # Cannot grant to self
    if target_user.id == user.id:
        messages.error(request, 'Cannot grant permissions to yourself.')
        return redirect('document_detail', doc_id=doc_id)

    # Check for active existing grant
    existing = DocumentPermission.objects.filter(
        document=doc,
        user=target_user,
        permission_level=perm_level,
        revoked_at__isnull=True
    ).first()

    if existing:
        messages.warning(request, f'{target_user.username} already has active {perm_level} access.')
        return redirect('document_detail', doc_id=doc_id)

    perm = DocumentPermission.objects.create(
        document=doc,
        user=target_user,
        permission_level=perm_level,
        granted_by=user,
    )

    ip = get_client_ip(request)
    ua = request.META.get('HTTP_USER_AGENT', '')
    record_audit_log('PERMISSION_GRANT', user, 'permission', str(perm.id), {
        'document_id': str(doc.id),
        'document_title': doc.title,
        'granted_to': target_user.username,
        'permission_level': perm_level,
    }, ip, ua)

    messages.success(request, f'Granted {perm_level} access to {target_user.username}.')
    return redirect('document_detail', doc_id=doc_id)

@login_required
def permission_revoke_view(request, doc_id, perm_id):
    user = request.user
    doc = get_object_or_404(Document, id=doc_id, deleted_at__isnull=True)

    if doc.owner_id != user.id:
        messages.error(request, 'Only the document owner can revoke permissions.')
        return redirect('document_detail', doc_id=doc_id)

    perm = get_object_or_404(DocumentPermission, id=perm_id, document=doc, revoked_at__isnull=True)
    perm.revoked_at = dj_timezone.now()
    perm.save()

    ip = get_client_ip(request)
    ua = request.META.get('HTTP_USER_AGENT', '')
    record_audit_log('PERMISSION_REVOKE', user, 'permission', str(perm.id), {
        'document_id': str(doc.id),
        'document_title': doc.title,
        'revoked_from': perm.user.username,
        'permission_level': perm.permission_level,
    }, ip, ua)

    messages.success(request, f'Revoked {perm.permission_level} access for {perm.user.username} immediately.')
    return redirect('document_detail', doc_id=doc_id)

@login_required
def audit_trail_view(request):
    if request.user.role != 'admin':
        raise Http404("Page not found.")

    action_filter = request.GET.get('action', '')
    logs = AuditLog.objects.all().order_by('-sequence_number')

    if action_filter:
        logs = logs.filter(action=action_filter)

    verify_result = None
    if 'verify' in request.GET:
        verify_result = verify_audit_chain()
        ip = get_client_ip(request)
        ua = request.META.get('HTTP_USER_AGENT', '')
        record_audit_log('CHAIN_VERIFIED', request.user, 'audit', None, {
            'result': 'VALID' if verify_result['valid'] else 'BROKEN',
            'total_entries': verify_result['total_entries'],
        }, ip, ua)

    actions = AuditLog.objects.values_list('action', flat=True).distinct()

    return render(request, 'audit.html', {
        'logs': logs[:100],
        'total_count': logs.count(),
        'actions': actions,
        'selected_action': action_filter,
        'verify_result': verify_result,
    })

@login_required
def admin_dashboard_view(request):
    if request.user.role != 'admin':
        raise Http404("Page not found.")

    if request.method == 'POST' and 'toggle_user' in request.POST:
        target_id = request.POST.get('user_id')
        target_user = get_object_or_404(CustomUser, id=target_id)
        target_user.is_active = not target_user.is_active
        target_user.save()

        ip = get_client_ip(request)
        ua = request.META.get('HTTP_USER_AGENT', '')
        action_name = 'USER_ENABLED' if target_user.is_active else 'USER_LOCKED_OUT'
        record_audit_log(action_name, request.user, 'user', str(target_user.id), {'username': target_user.username}, ip, ua)
        messages.success(request, f"Updated {target_user.username} status.")
        return redirect('admin_dashboard')

    users = CustomUser.objects.all().order_by('-date_joined')
    total_docs = Document.objects.filter(deleted_at__isnull=True).count()
    active_grants = DocumentPermission.objects.filter(revoked_at__isnull=True).count()
    total_logs = AuditLog.objects.count()

    return render(request, 'admin_dashboard.html', {
        'users': users,
        'total_docs': total_docs,
        'active_grants': active_grants,
        'total_logs': total_logs,
    })

# ==========================================
# DRF REST API VIEWSETS
# ==========================================

class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return Document.objects.filter(deleted_at__isnull=True)
        active_grants = DocumentPermission.objects.filter(user=user, revoked_at__isnull=True).values_list('document_id', flat=True)
        return Document.objects.filter(Q(owner=user) | Q(id__in=active_grants), deleted_at__isnull=True).distinct()

    def retrieve(self, request, *args, **kwargs):
        doc = self.get_object()
        if not check_user_document_permission(request.user, doc, 'READ'):
            raise Http404("Document not found.")
        record_audit_log('VIEW', request.user, 'document', str(doc.id), {'title': doc.title}, get_client_ip(request), request.META.get('HTTP_USER_AGENT', ''))
        return super().retrieve(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        doc = self.get_object()
        if not check_user_document_permission(request.user, doc, 'READ'):
            raise Http404("Document not found.")
        decrypted = read_decrypted_file(doc.file_path, doc.encryption_iv)
        record_audit_log('DOWNLOAD', request.user, 'document', str(doc.id), {'title': doc.title}, get_client_ip(request), request.META.get('HTTP_USER_AGENT', ''))
        response = HttpResponse(decrypted, content_type=doc.mime_type)
        response['Content-Disposition'] = f'attachment; filename="{doc.original_filename}"'
        return response

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]
    queryset = AuditLog.objects.all().order_by('-sequence_number')

    @action(detail=False, methods=['get'])
    def verify(self, request):
        result = verify_audit_chain()
        record_audit_log('CHAIN_VERIFIED', request.user, 'audit', None, result, get_client_ip(request), request.META.get('HTTP_USER_AGENT', ''))
        return Response(result)

class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAdminRole]
    queryset = CustomUser.objects.all().order_by('-date_joined')
