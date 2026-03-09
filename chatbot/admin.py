from django.contrib import admin
from .models import ChatSession, ChatMessage


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = ('role', 'content', 'created_at')
    can_delete = False


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'created_at', 'updated_at', 'message_count')
    list_filter = ('user', 'created_at')
    search_fields = ('user__username', 'title')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [ChatMessageInline]

    def message_count(self, obj):
        return obj.messages.count()
    message_count.short_description = 'Messages'


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('session', 'role', 'short_content', 'created_at')
    list_filter = ('role', 'created_at')
    search_fields = ('content', 'session__user__username')
    readonly_fields = ('created_at',)

    def short_content(self, obj):
        return obj.content[:80] + ('...' if len(obj.content) > 80 else '')
    short_content.short_description = 'Content'
