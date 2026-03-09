from django.db import models
from django.contrib.auth.models import User


class ChatSession(models.Model):
    """Represents a conversation session between a user and the AI."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions')
    title = models.CharField(max_length=200, default='New Chat')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.user.username} - {self.title} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"

    def get_last_message(self):
        return self.messages.order_by('-created_at').first()


class ChatMessage(models.Model):
    """Represents a single message in a chat session."""
    ROLE_CHOICES = [
        ('user', 'User'),
        ('ai', 'AI'),
    ]

    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.role.upper()}] {self.content[:60]}..."
