from django.db import models


def default_wsgi_application():
    """WSGI config for moldez project."""
    import django
    from django.core.wsgi import get_wsgi_application
    import os
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'moldez.settings')
    return get_wsgi_application()
