import json
import time
import traceback
import urllib.request
import urllib.error
from django.db import IntegrityError
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_POST
from django.conf import settings

from .forms import SignUpForm, LoginForm
from .models import ChatSession, ChatMessage

GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
SYSTEM_INSTRUCTION = (
    "You are MoldezAI, a helpful assistant. "
    "Give short, direct answers. Get straight to the point. "
    "Only elaborate when the user explicitly asks for more detail."
)


def _call_single_model(api_key, model, messages, timeout=30):
    """Call a single Groq model. Raises on failure."""
    body = json.dumps({
        'model': model,
        'messages': messages,
        'max_tokens': 300,
        'temperature': 0.7,
    }).encode()
    req = urllib.request.Request(GROQ_API_URL, data=body, headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
        'User-Agent': 'MoldezAI/1.0',
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read())
    return data['choices'][0]['message']['content']


def call_groq_rest(api_key, messages):
    """Try each model in order. For each model, retry once on 429/503 after a short wait.
    Falls through to the next model quickly instead of waiting forever."""
    last_err = None
    for model in GROQ_MODELS:
        for attempt in range(2):  # max 2 tries per model
            try:
                print(f'[GROQ] Trying {model} (attempt {attempt + 1})')
                return _call_single_model(api_key, model, messages)
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code in (429, 503) and attempt == 0:
                    print(f'[GROQ] {model} returned {e.code}, retrying in 2s...')
                    time.sleep(2)
                else:
                    print(f'[GROQ] {model} failed with {e.code}, trying next model...')
                    break
            except Exception as e:
                last_err = e
                print(f'[GROQ] {model} error: {e}, trying next model...')
                break
    # All models failed — raise the last error
    raise last_err


# ─────────────────────────────────────────────────────────────
# Auth Views
# ─────────────────────────────────────────────────────────────

def signup_view(request):
    if request.user.is_authenticated:
        return redirect('chat_dashboard')
    if request.method == 'POST':
        form = SignUpForm(request.POST)
        if form.is_valid():
            try:
                user = form.save()
            except IntegrityError:
                form.add_error('username', 'This username is already taken.')
                messages.error(request, 'Please correct the errors below.')
                return render(request, 'auth/signup.html', {'form': form})
            login(request, user)
            messages.success(request, f'Welcome, {user.username}! Your account has been created.')
            return redirect('chat_dashboard')
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        form = SignUpForm()
    return render(request, 'auth/signup.html', {'form': form})


def login_view(request):
    if request.user.is_authenticated:
        return redirect('chat_dashboard')
    if request.method == 'POST':
        form = LoginForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            messages.success(request, f'Welcome back, {user.username}!')
            return redirect('chat_dashboard')
        else:
            messages.error(request, 'Invalid username or password.')
    else:
        form = LoginForm()
    return render(request, 'auth/login.html', {'form': form})


def logout_view(request):
    logout(request)
    messages.info(request, 'You have been logged out.')
    return redirect('login')


# ─────────────────────────────────────────────────────────────
# Chat Views
# ─────────────────────────────────────────────────────────────

@login_required
def chat_dashboard(request):
    """Main chat dashboard."""
    sessions = ChatSession.objects.filter(user=request.user)
    session_id = request.GET.get('session')
    if session_id:
        session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    elif sessions.exists():
        session = sessions.first()
    else:
        session = None
    chat_messages = session.messages.all() if session else []
    # Check if the last message is from the user (AI never responded)
    pending_response = False
    if session:
        last_msg = session.messages.order_by('-created_at').first()
        if last_msg and last_msg.role == 'user':
            pending_response = True
    context = {
        'sessions': sessions,
        'current_session': session,
        'chat_messages': chat_messages,
        'pending_response': pending_response,
    }
    return render(request, 'chat/dashboard.html', context)


@login_required
def new_chat(request):
    session = ChatSession.objects.create(user=request.user, title='New Chat')
    return redirect(f'/chat/?session={session.id}')


@login_required
def delete_session(request, session_id):
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    session.delete()
    return JsonResponse({'success': True})


@login_required
@require_POST
def rename_session(request, session_id):
    """Rename a chat session title via AJAX POST."""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Invalid JSON.'}, status=400)
    new_title = data.get('title', '').strip()
    if not new_title:
        return JsonResponse({'error': 'Title cannot be empty.'}, status=400)
    session.title = new_title[:200]
    session.save(update_fields=['title'])
    return JsonResponse({'success': True, 'title': session.title})


@login_required
def export_chat(request, session_id):
    """Export a chat session as a plain-text file download."""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    msgs = session.messages.order_by('created_at')
    lines = [f'MoldezAI — Conversation Export', f'Title: {session.title}',
             f'Date: {session.created_at.strftime("%Y-%m-%d %H:%M")}',
             '=' * 60, '']
    for msg in msgs:
        role_label = 'You' if msg.role == 'user' else 'MoldezAI'
        time_str = msg.created_at.strftime('%H:%M')
        lines.append(f'[{time_str}] {role_label}:')
        lines.append(msg.content)
        lines.append('')
    content = '\n'.join(lines)
    safe_title = ''.join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in session.title)[:60]
    filename = f'MoldezAI_{safe_title}.txt'
    response = HttpResponse(content, content_type='text/plain; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


# ─────────────────────────────────────────────────────────────
# Diagnostic endpoint — visit /chat/test/ to check API key
# ─────────────────────────────────────────────────────────────

@login_required
@require_POST
def retry_pending(request):
    """If the last message in a session is from the user (AI never responded),
    call Groq and return the AI response."""
    try:
        data = json.loads(request.body)
        session_id = data.get('session_id')
        if not session_id:
            return JsonResponse({'error': 'No session_id.'}, status=400)

        session = get_object_or_404(ChatSession, id=session_id, user=request.user)
        last_msg = session.messages.order_by('-created_at').first()
        if not last_msg or last_msg.role != 'user':
            return JsonResponse({'error': 'No pending message.'}, status=400)

        api_key = settings.GROQ_API_KEY
        if not api_key or api_key.startswith('your_'):
            ai_response = "⚠️ Groq API key not configured."
        else:
            try:
                messages = [{'role': 'system', 'content': SYSTEM_INSTRUCTION}]
                for msg in session.messages.order_by('created_at'):
                    role = 'user' if msg.role == 'user' else 'assistant'
                    messages.append({'role': role, 'content': msg.content})
                ai_response = call_groq_rest(api_key, messages)
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    ai_response = '⏱️ Rate limited — please wait a moment and try again.'
                elif e.code == 503:
                    ai_response = '⏱️ The AI model is temporarily busy. Please try again in a few seconds.'
                else:
                    ai_response = f'⚠️ Something went wrong (Error {e.code}). Please try again.'
            except Exception as e:
                ai_response = f'⚠️ AI Error: {e}'

        ai_msg = ChatMessage.objects.create(session=session, role='ai', content=ai_response)
        return JsonResponse({
            'success': True,
            'ai_response': ai_response,
            'timestamp': ai_msg.created_at.strftime('%I:%M %p'),
        })
    except Exception as err:
        return JsonResponse({'error': f'Server error: {err}'}, status=500)


@login_required
def test_api(request):
    api_key = settings.GROQ_API_KEY
    if not api_key or api_key.startswith('your_'):
        return JsonResponse({'status': 'error', 'message': 'GROQ_API_KEY not set in .env'})
    try:
        text = call_groq_rest(api_key, [
            {'role': 'system', 'content': SYSTEM_INSTRUCTION},
            {'role': 'user', 'content': 'Say "API OK" and nothing else.'},
        ])
        return JsonResponse({'status': 'ok', 'response': text, 'models': GROQ_MODELS})
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e),
            'detail': traceback.format_exc(),
        })


# ─────────────────────────────────────────────────────────────
# Send Message — main chat API endpoint
# ─────────────────────────────────────────────────────────────

@login_required
@require_POST
def send_message(request):
    """
    Receives a user message, calls Gemini, saves both messages,
    and returns the AI response as JSON.
    Always returns clean JSON — never crashes the server.
    """
    try:
        # Parse body
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({'error': 'Invalid request body.'}, status=400)

        user_message = data.get('message', '').strip()
        session_id = data.get('session_id')

        if not user_message:
            return JsonResponse({'error': 'Message cannot be empty.'}, status=400)

        # Get or create session
        if session_id:
            session = get_object_or_404(ChatSession, id=session_id, user=request.user)
        else:
            session = ChatSession.objects.create(user=request.user, title='New Chat')

        # Save user message
        ChatMessage.objects.create(session=session, role='user', content=user_message)

        # Auto-title on first message
        if session.messages.count() == 1:
            session.title = user_message[:50] + ('...' if len(user_message) > 50 else '')
            session.save()

        # ── Groq API ─────────────────────────────────────────────────
        api_key = settings.GROQ_API_KEY
        if not api_key or api_key.startswith('your_'):
            ai_response = (
                "⚠️ Groq API key not configured. "
                "Add your GROQ_API_KEY to the .env file and restart the server."
            )
        else:
            try:
                # Build conversation history for Groq (OpenAI format)
                groq_messages = [{'role': 'system', 'content': SYSTEM_INSTRUCTION}]
                for msg in session.messages.order_by('created_at'):
                    role = 'user' if msg.role == 'user' else 'assistant'
                    groq_messages.append({'role': role, 'content': msg.content})

                ai_response = call_groq_rest(api_key, groq_messages)

            except urllib.error.HTTPError as groq_err:
                err_body = groq_err.read().decode()[:300]
                print(f'\n[GROQ HTTP ERROR] {groq_err.code}: {err_body}')
                if groq_err.code == 429:
                    ai_response = '⏱️ Rate limited — please wait a moment and try again.'
                elif groq_err.code == 503:
                    ai_response = '⏱️ The AI model is temporarily busy. Please try again in a few seconds.'
                else:
                    ai_response = f'⚠️ Something went wrong (Error {groq_err.code}). Please try again.'

            except Exception as groq_err:
                print(f'\n[GROQ ERROR] {type(groq_err).__name__}: {groq_err}')
                print(traceback.format_exc())
                ai_response = f'⚠️ AI Error: {groq_err}'
        # ─────────────────────────────────────────────────────────────

        # Save AI response
        ai_msg = ChatMessage.objects.create(session=session, role='ai', content=ai_response)
        session.save()

        return JsonResponse({
            'success': True,
            'ai_response': ai_response,
            'session_id': session.id,
            'session_title': session.title,
            'timestamp': ai_msg.created_at.strftime('%I:%M %p'),
        })

    except Exception as fatal_err:
        print(f'\n[FATAL send_message ERROR] {type(fatal_err).__name__}: {fatal_err}')
        print(traceback.format_exc())
        return JsonResponse({'error': f'Server error: {fatal_err}'}, status=500)
