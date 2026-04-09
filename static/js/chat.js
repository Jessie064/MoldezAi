/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MoldezAI — chat.js
   Features: async messaging, typing effect, sidebar
   search, session rename, export chat.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────
    let currentSessionId = typeof SESSION_ID !== 'undefined' ? SESSION_ID : null;

    const _SEND_URL      = typeof SEND_URL      !== 'undefined' ? SEND_URL      : '';
    const _CSRF_TOKEN    = typeof CSRF_TOKEN    !== 'undefined' ? CSRF_TOKEN    : '';
    const _CHAT_URL      = typeof CHAT_URL      !== 'undefined' ? CHAT_URL      : '/chat/';
    const _USERNAME      = typeof USERNAME_INITIAL !== 'undefined' ? USERNAME_INITIAL : '?';
    const _RENAME_TPL    = typeof RENAME_URL_TPL !== 'undefined' ? RENAME_URL_TPL : '/chat/rename/__ID__/';
    const _EXPORT_TPL    = typeof EXPORT_URL_TPL !== 'undefined' ? EXPORT_URL_TPL : '/chat/export/__ID__/';

    let isSending = false;

    // ── DOM refs ───────────────────────────────────
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInput      = document.getElementById('messageInput');
    const sendBtn           = document.getElementById('sendBtn');
    const typingIndicator   = document.getElementById('typingIndicator');
    const charCount         = document.getElementById('charCount');
    const sidebar           = document.getElementById('sidebar');
    const sidebarToggle     = document.getElementById('sidebarToggle');
    const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
    const sessionSearch     = document.getElementById('sessionSearch');
    const renameModal       = document.getElementById('renameModal');
    const renameInput       = document.getElementById('renameInput');
    const renameConfirm     = document.getElementById('renameConfirm');
    const renameCancel      = document.getElementById('renameCancel');

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
        charCount.style.color = len > 3800 ? '#f87171' : '';
    }

    function updateSendButton() {
        if (!sendBtn || !messageInput) return;
        sendBtn.disabled = !messageInput.value.trim().length || isSending;
    }

    if (messageInput) {
        messageInput.addEventListener('input', () => {
            autoResize(messageInput);
            updateCharCount();
            updateSendButton();
        });

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

    // ── Escape HTML ────────────────────────────────
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── Create message bubble ──────────────────────
    function createBubble(role, content, timestamp, animate = false) {
        const row = document.createElement('div');
        row.className = `message-row message-${role}`;

        const timeStr = timestamp || new Date().toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true,
        });

        const escapedContent = escapeHtml(content).replace(/\n/g, '<br>');

        if (role === 'ai') {
            row.innerHTML = `
        <div class="msg-avatar ai-avatar">
          <i data-lucide="bot"></i>
        </div>
        <div class="message-bubble">
          <div class="bubble-content" id="typing-target-${Date.now()}"></div>
          <span class="bubble-time">${timeStr}</span>
        </div>`;
            lucide.createIcons({ nodes: row.querySelectorAll('[data-lucide]') });

            if (animate) {
                // defer content so caller can append first
                row._typeContent = content;
                row._timeStr = timeStr;
            } else {
                row.querySelector('.bubble-content').innerHTML = escapedContent;
            }
        } else {
            row.innerHTML = `
        <div class="message-bubble">
          <div class="bubble-content">${escapedContent}</div>
          <span class="bubble-time">${timeStr}</span>
        </div>
        <div class="msg-avatar user-avatar">${escapeHtml(_USERNAME)}</div>`;
        }

        return row;
    }

    // ── Typing effect ──────────────────────────────
    const CHAR_DELAY = 8; // ms per character

    function typeText(container, text, onDone) {
        let i = 0;
        container.innerHTML = '';

        function tick() {
            if (i < text.length) {
                // Append characters; handle newlines as <br>
                const ch = text[i++];
                if (ch === '\n') {
                    container.appendChild(document.createElement('br'));
                } else {
                    const node = document.createTextNode(ch);
                    container.appendChild(node);
                }
                scrollToBottom(false);
                setTimeout(tick, CHAR_DELAY);
            } else {
                if (onDone) onDone();
            }
        }
        tick();
    }

    // ── Show / hide typing indicator ───────────────
    function showTyping() {
        if (!typingIndicator || !messagesContainer) return;
        typingIndicator.style.display = 'flex';
        messagesContainer.appendChild(typingIndicator);
        scrollToBottom();
    }

    function hideTyping() {
        if (!typingIndicator) return;
        typingIndicator.style.display = 'none';
    }

    // ── Remove welcome state ───────────────────────
    function removeWelcomeState() {
        const welcome = document.getElementById('welcomeState');
        if (welcome) welcome.remove();
    }

    // ── Update session in sidebar ──────────────────
    function updateSidebarSession(sessionId, title) {
        const existing = document.getElementById(`session-${sessionId}`);
        if (existing) {
            const titleEl = existing.querySelector('.session-title');
            if (titleEl && title) {
                titleEl.textContent = title.substring(0, 35) + (title.length > 35 ? '…' : '');
            }
            existing.dataset.title = title || '';
            const list = existing.parentElement;
            if (list && list.firstElementChild !== existing) {
                // Move to top (after label)
                const label = list.querySelector('.sessions-label');
                if (label) label.after(existing);
                else list.prepend(existing);
            }
        } else if (sessionId) {
            const sessionsList = document.querySelector('.sessions-list');
            const emptyState = sessionsList ? sessionsList.querySelector('.sessions-empty') : null;
            if (emptyState) emptyState.remove();

            const label = sessionsList ? sessionsList.querySelector('.sessions-label') : null;
            const newItem = document.createElement('a');
            newItem.href = `${_CHAT_URL}?session=${sessionId}`;
            newItem.className = 'session-item active';
            newItem.id = `session-${sessionId}`;
            newItem.dataset.title = title || '';
            newItem.innerHTML = `
        <i data-lucide="message-square"></i>
        <div class="session-info">
          <span class="session-title">${escapeHtml((title || 'New Chat').substring(0, 35))}</span>
          <span class="session-date">Now</span>
        </div>
        <button class="session-rename" data-session-id="${sessionId}" title="Rename conversation" tabindex="-1">
          <i data-lucide="pencil"></i>
        </button>
        <button class="session-delete" data-session-id="${sessionId}" title="Delete conversation" tabindex="-1">
          <i data-lucide="trash-2"></i>
        </button>`;
            lucide.createIcons({ nodes: newItem.querySelectorAll('[data-lucide]') });

            // Wire buttons
            newItem.querySelector('.session-delete').addEventListener('click', (e) => {
                deleteSession(e, sessionId);
            });
            newItem.querySelector('.session-rename').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                promptRename(sessionId);
            });

            document.querySelectorAll('.session-item.active').forEach(el => el.classList.remove('active'));
            newItem.classList.add('active');

            if (sessionsList) {
                if (label) label.after(newItem);
                else sessionsList.prepend(newItem);
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

        messageInput.value = '';
        messageInput.style.height = 'auto';
        updateCharCount();

        removeWelcomeState();

        const userBubble = createBubble('user', text);
        messagesContainer.appendChild(userBubble);
        scrollToBottom();

        showTyping();

        try {
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
                body: JSON.stringify({ message: text, session_id: currentSessionId }),
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                hideTyping();
                if (response.status === 403 || response.redirected) {
                    showError('Session expired. Please refresh and log in again.');
                    setTimeout(() => { window.location.href = '/auth/login/'; }, 2000);
                } else {
                    const rawText = await response.text().catch(() => '');
                    console.error('[MoldezAI] Server error', response.status, rawText.substring(0, 300));
                    showError(`Server error (${response.status}). Check the browser console for details.`);
                }
                return;
            }

            let data;
            try {
                data = await response.json();
            } catch (jsonErr) {
                hideTyping();
                console.error('[MoldezAI] JSON parse error:', jsonErr);
                showError('Unexpected server response. Please refresh and try again.');
                return;
            }

            hideTyping();

            if (data.success) {
                if (!currentSessionId && data.session_id) {
                    currentSessionId = data.session_id;
                    window.history.replaceState({}, '', `${_CHAT_URL}?session=${data.session_id}`);
                }

                updateSidebarSession(data.session_id, data.session_title);

                if (data.session_title) {
                    const titleEl = document.querySelector('.chat-title');
                    if (titleEl) {
                        titleEl.textContent = data.session_title.length > 50
                            ? data.session_title.substring(0, 50) + '…'
                            : data.session_title;
                    }
                }

                // ── Typing effect for AI response ──
                const aiBubble = createBubble('ai', data.ai_response, data.timestamp, true);
                messagesContainer.appendChild(aiBubble);
                scrollToBottom();

                const bubbleContent = aiBubble.querySelector('.bubble-content');
                typeText(bubbleContent, data.ai_response, null);

            } else {
                showError(data.error || 'Something went wrong. Please try again.');
            }

        } catch (err) {
            hideTyping();
            console.error('[MoldezAI ERROR]', err.name, err.message, err);
            if (err.name === 'AbortError') {
                showError('⏱️ Rate limited — please wait a moment and try again.');
            } else {
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
      <div class="msg-avatar ai-avatar" style="background:linear-gradient(135deg,#ef4444,#dc2626);">
        <i data-lucide="alert-triangle"></i>
      </div>
      <div class="message-bubble">
        <div class="bubble-content" style="border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#fca5a5;">
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
                    if (Number(currentSessionId) === Number(sessionId)) {
                        window.location.href = _CHAT_URL;
                    }
                }
            })
            .catch(() => {
                window.location.href = `/chat/delete/${sessionId}/`;
            });
    };

    // ── Rename session ─────────────────────────────
    let _renameTargetId = null;

    window.promptRename = function (sessionId) {
        _renameTargetId = sessionId;
        const el = document.getElementById(`session-${sessionId}`);
        const currentTitle = el ? (el.dataset.title || el.querySelector('.session-title').textContent.trim()) : '';
        if (renameInput) renameInput.value = currentTitle;
        if (renameModal) {
            renameModal.style.display = 'flex';
            setTimeout(() => renameInput && renameInput.focus(), 50);
        }
    };

    function closeRenameModal() {
        if (renameModal) renameModal.style.display = 'none';
        _renameTargetId = null;
    }

    function doRename() {
        const newTitle = renameInput ? renameInput.value.trim() : '';
        if (!newTitle || !_renameTargetId) { closeRenameModal(); return; }

        const url = _RENAME_TPL.replace('__ID__', _renameTargetId);
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _CSRF_TOKEN,
            },
            body: JSON.stringify({ title: newTitle }),
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const sessionEl = document.getElementById(`session-${_renameTargetId}`);
                    if (sessionEl) {
                        const titleEl = sessionEl.querySelector('.session-title');
                        if (titleEl) titleEl.textContent = data.title.substring(0, 35) + (data.title.length > 35 ? '…' : '');
                        sessionEl.dataset.title = data.title;
                    }
                    // If it's the current session, also update header
                    if (Number(currentSessionId) === Number(_renameTargetId)) {
                        const headerTitle = document.querySelector('.chat-title');
                        if (headerTitle) headerTitle.textContent = data.title.length > 50
                            ? data.title.substring(0, 50) + '…'
                            : data.title;
                    }
                }
            })
            .catch(err => console.error('[MoldezAI] Rename error:', err))
            .finally(closeRenameModal);
    }

    if (renameConfirm) renameConfirm.addEventListener('click', doRename);
    if (renameCancel)  renameCancel.addEventListener('click', closeRenameModal);
    if (renameModal) {
        renameModal.addEventListener('click', (e) => {
            if (e.target === renameModal) closeRenameModal();
        });
    }
    if (renameInput) {
        renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); doRename(); }
            if (e.key === 'Escape') closeRenameModal();
        });
    }

    // ── Export chat ────────────────────────────────
    window.exportChat = function (sessionId) {
        const url = _EXPORT_TPL.replace('__ID__', sessionId);
        window.location.href = url;
    };

    // ── Search / filter sessions ───────────────────
    if (sessionSearch) {
        sessionSearch.addEventListener('input', () => {
            const query = sessionSearch.value.toLowerCase().trim();
            document.querySelectorAll('.session-item').forEach(item => {
                const title = (item.dataset.title || '').toLowerCase();
                item.style.display = (!query || title.includes(query)) ? '' : 'none';
            });
            // Show/hide empty state
            const visible = [...document.querySelectorAll('.session-item')].some(i => i.style.display !== 'none');
            let noResult = document.getElementById('searchNoResult');
            if (!visible && query) {
                if (!noResult) {
                    noResult = document.createElement('div');
                    noResult.id = 'searchNoResult';
                    noResult.className = 'sessions-empty';
                    noResult.innerHTML = '<p>No results found</p>';
                    document.getElementById('sessionsList').appendChild(noResult);
                }
                noResult.style.display = 'flex';
            } else if (noResult) {
                noResult.style.display = 'none';
            }
        });
    }

    // ── Init ───────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        if (messagesContainer) scrollToBottom(false);
        if (messageInput) messageInput.focus();
        if (typeof lucide !== 'undefined') lucide.createIcons();
        updateSendButton();
    });

})();
