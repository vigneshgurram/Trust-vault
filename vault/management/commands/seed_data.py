from django.core.management.base import BaseCommand
from vault.models import CustomUser

class Command(BaseCommand):
    help = 'Seeds initial users for TrustVault'

    def handle(self, *args, **kwargs):
        users_data = [
            ('admin', 'admin@trustvault.com', 'Admin@123456', 'admin', True, True, True),
            ('owner', 'owner@trustvault.com', 'Owner@123456', 'owner', True, False, False),
            ('owner2', 'owner2@trustvault.com', 'Owner2@123456', 'owner', True, False, False),
            ('viewer', 'viewer@trustvault.com', 'Viewer@123456', 'viewer', True, False, False),
            ('viewer2', 'viewer2@trustvault.com', 'Viewer2@123456', 'viewer', True, False, False),
            ('disabled', 'disabled@trustvault.com', 'Disabled@123456', 'viewer', False, False, False),
        ]

        for username, email, password, role, is_active, is_staff, is_super in users_data:
            user, created = CustomUser.objects.get_or_create(username=username, defaults={
                'email': email,
                'role': role,
                'is_active': is_active,
                'is_staff': is_staff,
                'is_superuser': is_super,
            })
            if created or not user.check_password(password):
                user.set_password(password)
                user.email = email
                user.role = role
                user.is_active = is_active
                user.is_staff = is_staff
                user.is_superuser = is_super
                user.save()
            action = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{action} user: {username} ({role})"))

        self.stdout.write(self.style.SUCCESS("TrustVault seed completed successfully."))
