from rest_framework import serializers
from vault.models import CustomUser, Document, DocumentPermission, AuditLog

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_active', 'date_joined']
        read_only_fields = ['id', 'date_joined']


class DocumentPermissionSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    granted_by_name = serializers.CharField(source='granted_by.username', read_only=True)

    class Meta:
        model = DocumentPermission
        fields = [
            'id', 'document', 'user', 'user_name', 'user_email',
            'permission_level', 'granted_by', 'granted_by_name',
            'granted_at', 'revoked_at'
        ]
        read_only_fields = ['id', 'granted_by', 'granted_at', 'revoked_at']


class DocumentSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.username', read_only=True)
    owner_email = serializers.CharField(source='owner.email', read_only=True)
    permissions = DocumentPermissionSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'category',
            'original_filename', 'file_size', 'mime_type',
            'checksum', 'owner', 'owner_name', 'owner_email',
            'created_at', 'updated_at', 'permissions'
        ]
        read_only_fields = ['id', 'file_size', 'mime_type', 'checksum', 'owner', 'created_at', 'updated_at']


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'sequence_number', 'id', 'timestamp', 'user',
            'user_name', 'action', 'resource_type', 'resource_id',
            'details', 'ip_address', 'user_agent', 'previous_hash', 'entry_hash'
        ]
        read_only_fields = '__all__'
