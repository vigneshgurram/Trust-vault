import uuid
from django.test import TestCase, Client
from django.urls import reverse
from vault.models import CustomUser, Document, DocumentPermission, AuditLog
from vault.services.encryption import save_encrypted_file, compute_checksum
from vault.services.audit import record_audit_log, verify_audit_chain

class TrustVaultSecurityTests(TestCase):
    def setUp(self):
        self.client = Client()

        # Create test users
        self.admin = CustomUser.objects.create_user(
            username='admin_test', email='admin@test.com', password='Password123', role='admin', is_superuser=True, is_staff=True
        )
        self.owner1 = CustomUser.objects.create_user(
            username='owner1_test', email='owner1@test.com', password='Password123', role='owner'
        )
        self.owner2 = CustomUser.objects.create_user(
            username='owner2_test', email='owner2@test.com', password='Password123', role='owner'
        )
        self.viewer1 = CustomUser.objects.create_user(
            username='viewer1_test', email='viewer1@test.com', password='Password123', role='viewer'
        )
        self.viewer2 = CustomUser.objects.create_user(
            username='viewer2_test', email='viewer2@test.com', password='Password123', role='viewer'
        )
        self.disabled_user = CustomUser.objects.create_user(
            username='disabled_test', email='disabled@test.com', password='Password123', role='viewer', is_active=False
        )

        # Owner 1 uploads a secret document
        content = b"HIGHLY CONFIDENTIAL OWNER 1 CONTENT"
        stored_path, iv_hex, checksum = save_encrypted_file(content, f"{uuid.uuid4().hex}.enc")
        self.owner1_doc = Document.objects.create(
            title="Owner 1 Secret Document",
            description="Confidential deal document",
            category="Legal",
            file_path=stored_path,
            original_filename="deal.pdf",
            file_size=len(content),
            mime_type="application/pdf",
            checksum=checksum,
            encryption_iv=iv_hex,
            owner=self.owner1,
        )

    # ---------------------------------------------------------------
    # 1. CROSS-USER ISOLATION & ACCESS CONTROL (CRITICAL)
    # ---------------------------------------------------------------
    def test_owner2_cannot_read_owner1_document(self):
        self.client.login(username='owner2_test', password='Password123')
        response = self.client.get(reverse('document_detail', args=[self.owner1_doc.id]))
        # Must return 404, not 403, to deny ID enumeration!
        self.assertEqual(response.status_code, 404)

    def test_owner2_cannot_download_owner1_document(self):
        self.client.login(username='owner2_test', password='Password123')
        response = self.client.get(reverse('document_download', args=[self.owner1_doc.id]))
        self.assertEqual(response.status_code, 404)

    def test_unshared_viewer_cannot_view_or_download(self):
        self.client.login(username='viewer1_test', password='Password123')
        # View attempt
        res_view = self.client.get(reverse('document_detail', args=[self.owner1_doc.id]))
        self.assertEqual(res_view.status_code, 404)
        # Download attempt
        res_down = self.client.get(reverse('document_download', args=[self.owner1_doc.id]))
        self.assertEqual(res_down.status_code, 404)

    def test_unauthenticated_request_is_redirected(self):
        response = self.client.get(reverse('document_detail', args=[self.owner1_doc.id]))
        self.assertEqual(response.status_code, 302)  # Redirects to login

    def test_owner2_document_list_does_not_contain_owner1_document(self):
        self.client.login(username='owner2_test', password='Password123')
        response = self.client.get(reverse('documents_list'))
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "Owner 1 Secret Document")

    # ---------------------------------------------------------------
    # 2. IMMEDIATE REVOCATION & GRANT ENFORCEMENT
    # ---------------------------------------------------------------
    def test_grant_read_permission_allows_access(self):
        # Owner 1 grants READ to viewer 1
        DocumentPermission.objects.create(
            document=self.owner1_doc,
            user=self.viewer1,
            permission_level='READ',
            granted_by=self.owner1,
        )

        self.client.login(username='viewer1_test', password='Password123')
        response = self.client.get(reverse('document_detail', args=[self.owner1_doc.id]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Owner 1 Secret Document")

        # Download succeeds
        down_res = self.client.get(reverse('document_download', args=[self.owner1_doc.id]))
        self.assertEqual(down_res.status_code, 200)
        self.assertEqual(down_res.content, b"HIGHLY CONFIDENTIAL OWNER 1 CONTENT")

    def test_immediate_revocation_denies_access_immediately(self):
        # 1. Grant
        perm = DocumentPermission.objects.create(
            document=self.owner1_doc,
            user=self.viewer1,
            permission_level='READ',
            granted_by=self.owner1,
        )

        # Viewer can access
        self.client.login(username='viewer1_test', password='Password123')
        self.assertEqual(self.client.get(reverse('document_detail', args=[self.owner1_doc.id])).status_code, 200)

        # 2. Owner revokes immediately
        self.client.login(username='owner1_test', password='Password123')
        revoke_res = self.client.get(reverse('permission_revoke', args=[self.owner1_doc.id, perm.id]))
        self.assertEqual(revoke_res.status_code, 302)

        # 3. Viewer immediately denied on next request
        self.client.login(username='viewer1_test', password='Password123')
        self.assertEqual(self.client.get(reverse('document_detail', args=[self.owner1_doc.id])).status_code, 404)
        self.assertEqual(self.client.get(reverse('document_download', args=[self.owner1_doc.id])).status_code, 404)

    def test_viewer_cannot_upload_document(self):
        self.client.login(username='viewer1_test', password='Password123')
        # Attempt to upload
        from django.core.files.uploadedfile import SimpleUploadedFile
        test_file = SimpleUploadedFile("hack.txt", b"unauthorized upload")
        res = self.client.post(reverse('documents_list'), {'file': test_file, 'title': 'Hacked Document'})
        self.assertEqual(res.status_code, 302)
        self.assertFalse(Document.objects.filter(title='Hacked Document').exists())

    def test_disabled_user_cannot_log_in(self):
        res = self.client.post(reverse('login'), {'username': 'disabled_test', 'password': 'Password123'})
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "locked out by an administrator")

    # ---------------------------------------------------------------
    # 3. HMAC CHAIN INTEGRITY & AUDIT TAMPER DETECTION
    # ---------------------------------------------------------------
    def test_audit_chain_validates_clean_ledger(self):
        AuditLog.objects.all().delete()
        record_audit_log('LOGIN', self.owner1)
        record_audit_log('UPLOAD', self.owner1, 'document', str(self.owner1_doc.id))
        record_audit_log('DOWNLOAD', self.owner1, 'document', str(self.owner1_doc.id))

        result = verify_audit_chain()
        self.assertTrue(result['valid'])
        self.assertEqual(result['total_entries'], 3)

    def test_audit_chain_detects_database_tampering(self):
        AuditLog.objects.all().delete()
        record_audit_log('LOGIN', self.owner1)
        entry2 = record_audit_log('DOWNLOAD', self.owner1, 'document', str(self.owner1_doc.id))
        record_audit_log('LOGOUT', self.owner1)

        # Malicious insider modifies entry2 directly in the database
        AuditLog.objects.filter(id=entry2.id).update(details='{"tampered": true}')

        result = verify_audit_chain()
        self.assertFalse(result['valid'])
        self.assertIn("tamper detected", result['message'].lower())
