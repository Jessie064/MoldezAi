/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MoldezAI — chat.js
   Handles: async messaging, typing indicator,
   sidebar toggle, auto-resize textarea, etc.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────
    let currentSessionId = typeof SESSION_ID !== 'undefined' ? SESSION_ID : null;

    // Guard template-injected globals so chat.js doesn't crash on non-chat pages
    const _SEND_URL = typeof SEND_URL !== 'undefined' ? SEND_URL : '';
    const _CSRF_TOKEN = typeof CSRF_TOKEN !== 'undefined' ? CSRF_TOKEN : '';
    const _CHAT_URL = typeof CHAT_URL !== 'undefined' ? CHAT_URL : '/chat/';
    const _USERNAME = typeof USERNAME_INITIAL !== 'undefined' ? USERNAME_INITIAL : '?';
    let isSending = false;

    // ── DOM refs ───────────────────────────────────
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');
    const charCount = document.getElementById('charCount');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');

    // ── Sidebar overlay (mobile) ───────────────────
    let overlay = null;
    function createOverlay() {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebarOverlay';
        overlay.addEventListener('click', closeMobileSidebar);
        document.body.appendChild(overlay);
    }

    function openMobileSidebar() {
        if (!overlay) createOverlay();
        sidebar.classList.add('mobile-open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileSidebar() {
        sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ── Sidebar toggle (desktop collapse) ──────────
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const icon = sidebarToggle.querySelector('[data-lucide]');
            if (sidebar.classList.contains('collapsed')) {
                icon.setAttribute('data-lucide', 'panel-left-open');
            } else {
                icon.setAttribute('data-lucide', 'panel-left-close');
            }
            lucide.createIcons();
        });
    }

    if (mobileSidebarToggle) {
        mobileSidebarToggle.addEventListener('click', openMobileSidebar);
    }

    // ── Textarea auto-resize ───────────────────────
    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
    }

    function updateCharCount() {
        if (!messageInput || !charCount) return;
        const len = messageInput.value.length;
        charCount.textContent = len + ' / 4000';
        if (len > 3800) {
            charCount.style.color = '#f87171';
        } else {
            charCount.style.color = '';
        }
    }

    function updateSendButton() {
        if (!sendBtn || !messageInput) return;
        const hasText = messageInput.value.trim().length > 0;
        sendBtn.disabled = !hasText || isSending;
    }

    if (messageInput) {
        messageInput.addEventListener('input', () => {
            autoResize(messageInput);
            updateCharCount();
            updateSendButton();
        });

        // Send on Enter (Shift+Enter = newline)
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) sendMessage();
            }
        });
    }

    // ── Scroll to bottom ───────────────────────────
    function scrollToBottom(smooth = true) {
        if (!messagesContainer) return;
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: smooth ? 'smooth' : 'instant',
        });
    }

    // ── Create message bubble ──────────────────────
    function createBubble(role, content, timestamp) {
        const row = document.createElement('div');
        row.className = `message-row message-${role}`;

        const timeStr = timestamp || new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });

        if (role === 'ai') {
            row.innerHTML = `
        <div class="msg-avatar ai-avatar">
          <i data-lucide="bot"></i>
        </div>
        <div class="message-bubble">
          <div class="bubble-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
          <span class="bubble-time">${timeStr}</span>
        </div>`;
        } else {
            const initial = _USERNAME;
            row.innerHTML = `
        <div class="message-bubble">
          <div class="bubble-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
          <span class="bubble-time">${timeStr}</span>
        </div>
        <div class="msg-avatar user-avatar">${initial}</div>`;
        }

        // Re-render lucide icons inside this bubble
        lucide.createIcons({ nodes: row.querySelectorAll('[data-lucide]') });
        return row;
    }

    // ── Escape HTML to prevent XSS ─────────────────
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── Show / hide typing indicator ───────────────
    function showTyping() {
        if (!typingIndicator || !messagesContainer) return;
        typingIndicator.style.display = 'flex';
        messagesContainer.appendChild(typingIndicator); // ensure at bottom
        scrollToBottom();
    }

    function hideTyping() {
        if (!typingIndicator) return;
        typingIndicator.style.display = 'none';
    }

    // ── Remove welcome state if present ───────────
    function removeWelcomeState() {
        const welcome = document.getElementById('welcomeState');
        if (welcome) welcome.remove();
    }

    // ── Update session in sidebar ──────────────────
    function updateSidebarSession(sessionId, title) {
        const existing = document.getElementById(`session-${sessionId}`);
        if (existing) {
            const titleEl = existing.querySelector('.session-title');
            if (titleEl && title) titleEl.textContent = title.substring(0, 35) + (title.length > 35 ? '…' : '');
            // Move to top
            const list = existing.parentElement;
            if (list && list.firstChild !== existing) {
                list.insertBefore(existing, list.firstChild);
            }
        } else if (sessionId) {
            // New session — add to sidebar
            const sessionsList = document.querySelector('.sessions-list');
            const emptyState = sessionsList ? sessionsList.querySelector('.sessions-empty') : null;
            if (emptyState) emptyState.remove();

            const label = sessionsList ? sessionsList.querySelector('.sessions-label') : null;
            const newItem = document.createElement('a');
            newItem.href = `${_CHAT_URL}?session=${sessionId}`;
            newItem.className = 'session-item active';
            newItem.id = `session-${sessionId}`;
            newItem.innerHTML = `
        <i data-lucide="message-square"></i>
        <div class="session-info">
          <span class="session-title">${escapeHtml((title || 'New Chat').substring(0, 35))}</span>
          <span class="session-date">Now</span>
        </div>
        <button class="session-delete" onclick="deleteSession(event, ${sessionId})" title="Delete conversation">
          <i data-lucide="trash-2"></i>
        </button>`;
            lucide.createIcons({ nodes: newItem.querySelectorAll('[data-lucide]') });

            // Deactivate other sessions
            document.querySelectorAll('.session-item.active').forEach(el => el.classList.remove('active'));
            newItem.classList.add('active');

            if (sessionsList) {
                if (label) {
                    label.after(newItem);
                } else {
                    sessionsList.prepend(newItem);
                }
            }
        }
    }

    // ── Main send function ─────────────────────────
    window.sendMessage = async function () {
        if (!messageInput || isSending) return;

        const text = messageInput.value.trim();
        if (!text) return;

        isSending = true;
        updateSendButton();

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        updateCharCount();

        // Remove welcome state
        removeWelcomeState();

        // Append user bubble immediately
        const userBubble = createBubble('user', text);
        messagesContainer.appendChild(userBubble);
        scrollToBottom();

        // Show typing
        showTyping();

        try {
            // 28-second timeout — handles Gemini SDK retry delays gracefully
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 28000);

            if (!_SEND_URL) { showError('Chat URL not configured. Please refresh.'); return; }
            const response = await fetch(_SEND_URL, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': _CSRF_TOKEN,
                },
                body: JSON.stringify({
                    message: text,
                    session_id: currentSessionId,
                }),
            });

            clearTimeout(timeoutId);

            // Handle session expiry / non-JSON responses
            if (!response.ok) {
                hideTyping();
                if (response.status === 403 || response.redirected) {
                    showError('Session expired. Please refresh the page and log in again.');
                    setTimeout(() => { window.location.href = '/auth/login/'; }, 2000);
                } else {
                    const rawText = await response.text().catch(() => '');
                    console.error('[MoldezAI] Server error', response.status, rawText.substring(0, 300));
                    showError(`Server error (${response.status}). Check the browser console for details.`);
                }
                return;
            }

            // Parse JSON — handle gracefully if server sends unexpected response
            let data;
            try {
                data = await response.json();
            } catch (jsonErr) {
                hideTyping();
                console.error('[MoldezAI] JSON parse error:', jsonErr);
                showError('Unexpected server response. Please refresh the page and try again.');
                return;
            }

            hideTyping();

            if (data.success) {
                // Update session id if new
                if (!currentSessionId && data.session_id) {
                    currentSessionId = data.session_id;
                    // Update URL without reload
                    window.history.replaceState({}, '', `${_CHAT_URL}?session=${data.session_id}`);
                }
                // Update sidebar
                updateSidebarSession(data.session_id, data.session_title);

                // Update page title
                if (data.session_title) {
                    document.querySelector('.chat-title').textContent =
                        data.session_title.length > 50
                            ? data.session_title.substring(0, 50) + '…'
                            : data.session_title;
                }

                // Append AI bubble
                const aiBubble = createBubble('ai', data.ai_response, data.timestamp);
                messagesContainer.appendChild(aiBubble);
                scrollToBottom();
            } else {
                showError(data.error || 'Something went wrong. Please try again.');
            }
        } catch (err) {
            hideTyping();
            console.error('[MoldezAI ERROR]', err.name, err.message, err);
            if (err.name === 'AbortError') {
                showError('⏱️ Rate limited — please wait a moment and try again.');
            } else {
                // Show exact error so we can diagnose — remove once fixed
                showError(`Error (${err.name}): ${err.message}`);
            }
        } finally {
            isSending = false;
            updateSendButton();
            messageInput.focus();
        }
    };

    // ── Show inline error bubble ───────────────────
    function showError(message) {
        const row = document.createElement('div');
        row.className = 'message-row message-ai';
        row.innerHTML = `
      <div class="msg-avatar ai-avatar" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
        <i data-lucide="alert-triangle"></i>
      </div>
      <div class="message-bubble">
        <div class="bubble-content" style="border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); color: #fca5a5;">
          ⚠️ ${escapeHtml(message)}
        </div>
      </div>`;
        lucide.createIcons({ nodes: row.querySelectorAll('[data-lucide]') });
        if (messagesContainer) {
            messagesContainer.appendChild(row);
            scrollToBottom();
        }
    }

    // ── Fill input from suggestion chips ──────────
    window.fillInput = function (text) {
        if (!messageInput) return;
        messageInput.value = text;
        autoResize(messageInput);
        updateCharCount();
        updateSendButton();
        messageInput.focus();
    };

    // ── Delete session ─────────────────────────────
    window.deleteSession = function (event, sessionId) {
        event.preventDefault();
        event.stopPropagation();

        if (!confirm('Delete this conversation? This cannot be undone.')) return;

        fetch(`/chat/delete/${sessionId}/`, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': _CSRF_TOKEN,
            },
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const el = document.getElementById(`session-${sessionId}`);
                    if (el) el.remove();

                    // If deleted session was the active one, go to a fresh chat
                    if (Number(currentSessionId) === Number(sessionId)) {
                        window.location.href = _CHAT_URL;
                    }
                }
            })
            .catch(() => {
                // Fallback: navigate directly
                window.location.href = `/chat/delete/${sessionId}/`;
            });
    };

    // ── Init ───────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        // Scroll to bottom of existing messages on load
        if (messagesContainer) {
            scrollToBottom(false);
        }
        // Focus input
        if (messageInput) {
            messageInput.focus();
        }
        // Re-render icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        updateSendButton();
    });

})();
