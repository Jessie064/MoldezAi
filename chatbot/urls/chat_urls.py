from django.urls import path
from chatbot import views

urlpatterns = [
    path('', views.chat_dashboard, name='chat_dashboard'),
    path('new/', views.new_chat, name='new_chat'),
    path('send/', views.send_message, name='send_message'),
    path('delete/<int:session_id>/', views.delete_session, name='delete_session'),
    path('rename/<int:session_id>/', views.rename_session, name='rename_session'),
    path('export/<int:session_id>/', views.export_chat, name='export_chat'),
    path('test/', views.test_api, name='test_api'),
]

