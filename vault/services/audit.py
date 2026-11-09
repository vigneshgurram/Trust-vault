import hmac
import hashlib
import json
from datetime import datetime, timezone
from django.conf import settings
from django.utils import timezone
from vault.models import AuditLog

def compute_hmac(data_str: str, secret: str) -> str:
    return hmac.new(
        secret.encode('utf-8'),
        data_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

def serialize_audit_payload(
    timestamp_iso: str,
    user_id: str | None,
    action: str,
    resource_type: str | None,
    resource_id: str | None,
    details_str: str | None,
    ip_address: str | None,
    user_agent: str | None,
    previous_hash: str | None,
) -> str:
    data = {
        "timestamp": timestamp_iso,
        "user_id": str(user_id) if user_id else None,
        "action": action,
        "resource_type": resource_type,
        "resource_id": str(resource_id) if resource_id else None,
        "details": details_str,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "previous_hash": previous_hash,
    }
    return json.dumps(data, sort_keys=True)

def record_audit_log(
    action: str,
    user=None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """
    Creates a new immutable HMAC-chained audit log entry.
    """
    last_entry = AuditLog.objects.order_by('-sequence_number').first()
    previous_hash = last_entry.entry_hash if last_entry else None
    
    timestamp = timezone.now()
    timestamp_str = timestamp.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
    details_str = json.dumps(details, sort_keys=True) if details else None
    user_id = str(user.id) if user and user.is_authenticated else None

    payload = serialize_audit_payload(
        timestamp_iso=timestamp_str,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        details_str=details_str,
        ip_address=ip_address,
        user_agent=user_agent,
        previous_hash=previous_hash,
    )

    entry_hash = compute_hmac(payload, settings.AUDIT_HMAC_SECRET)

    audit_entry = AuditLog.objects.create(
        timestamp=timestamp,
        timestamp_str=timestamp_str,
        user=user if user and user.is_authenticated else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        details=details_str,
        ip_address=ip_address,
        user_agent=user_agent,
        previous_hash=previous_hash,
        entry_hash=entry_hash,
    )
    return audit_entry

def verify_audit_chain() -> dict:
    """
    Verifies unbroken cryptographic chain of all audit entries.
    """
    entries = AuditLog.objects.order_by('sequence_number').all()
    if not entries.exists():
        return {
            "valid": True,
            "total_entries": 0,
            "message": "Audit trail is empty (genesis stage).",
        }

    previous_hash = None
    for entry in entries:
        if entry.previous_hash != previous_hash:
            return {
                "valid": False,
                "total_entries": entries.count(),
                "broken_at": entry.sequence_number,
                "message": f"Cryptographic chain broken at #{entry.sequence_number}: previous_hash mismatch.",
            }

        timestamp_to_use = entry.timestamp_str if entry.timestamp_str else entry.timestamp.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        payload = serialize_audit_payload(
            timestamp_iso=timestamp_to_use,
            user_id=str(entry.user_id) if entry.user_id else None,
            action=entry.action,
            resource_type=entry.resource_type,
            resource_id=entry.resource_id,
            details_str=entry.details,
            ip_address=entry.ip_address,
            user_agent=entry.user_agent,
            previous_hash=entry.previous_hash,
        )

        expected_hash = compute_hmac(payload, settings.AUDIT_HMAC_SECRET)
        if entry.entry_hash != expected_hash:
            return {
                "valid": False,
                "total_entries": entries.count(),
                "broken_at": entry.sequence_number,
                "message": f"Cryptographic tamper detected at #{entry.sequence_number}: record payload was modified.",
            }

        previous_hash = entry.entry_hash

    return {
        "valid": True,
        "total_entries": entries.count(),
        "message": f"All {entries.count()} audit entries cryptographically verified. Chain intact.",
    }
