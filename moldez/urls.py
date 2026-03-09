"""
URL configuration for moldez project.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('auth/', include('chatbot.urls.auth_urls')),
    path('chat/', include('chatbot.urls.chat_urls')),
    path('', include('chatbot.urls.home_urls')),
]
