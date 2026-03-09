"""
WSGI config for moldez project.
"""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'moldez.settings')

application = get_wsgi_application()
