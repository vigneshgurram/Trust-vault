import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser

from django.utils import timezone

class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ('admin', 'Administrator'),
        ('owner', 'Document Owner'),
        ('viewer', 'Viewer'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='viewer')
    
    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    category = models.CharField(max_length=100, blank=True, null=True)
    file_path = models.CharField(max_length=255)  # Stored UUID filename on disk
    original_filename = models.CharField(max_length=255)
    file_size = models.IntegerField()
    mime_type = models.CharField(max_length=100)
    checksum = models.CharField(max_length=64)  # SHA-256 of plaintext
    encryption_iv = models.CharField(max_length=64)  # Hex IV
    owner = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='owned_documents')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class DocumentPermission(models.Model):
    PERMISSION_LEVELS = (
        ('READ', 'Read Only'),
        ('EDIT', 'Edit & Read'),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='permissions')
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='received_permissions')
    permission_level = models.CharField(max_length=10, choices=PERMISSION_LEVELS)
    granted_by = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='granted_permissions')
    granted_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-granted_at']

    def __str__(self):
        status = "Active" if not self.revoked_at else f"Revoked at {self.revoked_at}"
        return f"{self.user.username} - {self.document.title} [{self.permission_level}] ({status})"


class AuditLog(models.Model):
    sequence_number = models.AutoField(primary_key=True)
    id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    timestamp = models.DateTimeField(default=timezone.now)
    timestamp_str = models.CharField(max_length=60, blank=True)
    user = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_entries')
    action = models.CharField(max_length=50)
    resource_type = models.CharField(max_length=50, null=True, blank=True)
    resource_id = models.CharField(max_length=100, null=True, blank=True)
    details = models.TextField(null=True, blank=True)  # JSON formatted details
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, null=True, blank=True)
    previous_hash = models.CharField(max_length=64, null=True, blank=True)
    entry_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-sequence_number']

    def __str__(self):
        return f"#{self.sequence_number} [{self.action}] by {self.user.username if self.user else 'Anonymous'}"
