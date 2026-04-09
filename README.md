# 🤖 MoldezAI — Django AI Chatbot

A full-featured AI chatbot web application built with **Django** (backend) and **HTML/CSS/JavaScript** (frontend), powered by **Google Gemini AI**.

![Tech Stack](https://img.shields.io/badge/Django-5.2-green?logo=django)
![AI](https://img.shields.io/badge/AI-Google%20Gemini%202.5%20Flash-blue?logo=google)
![Python](https://img.shields.io/badge/Python-3.10+-yellow?logo=python)

---

## ✨ Features

- 🔐 **User Authentication** — Sign up, log in, log out with secure password hashing
- 💬 **AI Chat** — Real-time conversation powered by Google Gemini 2.5 Flash
- ⌨️ **Typing Effect** — AI responses appear character-by-character for a natural feel
- 📜 **Chat History** — All conversations saved and browsable in the sidebar
- 🔍 **Conversation Search** — Filter sidebar sessions by title in real time
- 🗂️ **Multiple Sessions** — Create and switch between chat sessions
- ✏️ **Rename Sessions** — Rename any conversation via a sleek modal dialog
- 📥 **Export Chat** — Download any conversation as a plain-text `.txt` file
- 🔄 **Auto-Retry** — API calls automatically retry on 429/503 errors with exponential backoff
- 🌙 **Dark Mode UI** — Premium glassmorphism design with animated bubbles
- 📱 **Responsive** — Works on mobile, tablet, and desktop
- ⚡ **No Page Reloads** — Async messages via JavaScript Fetch API
- 🛠️ **Admin Panel** — Monitor users and messages at `/admin/`

---

## 📁 Project Structure

```
moldez/
├── manage.py
├── requirements.txt
├── .env.example          ← Copy to .env and fill in your API key
├── .gitignore
│
├── moldez/               ← Django project config
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
│
├── chatbot/              ← Main app
│   ├── models.py         ← ChatSession, ChatMessage
│   ├── views.py          ← Auth + Chat API views (uses Gemini REST API)
│   ├── forms.py          ← SignUp, Login forms
│   ├── admin.py          ← Admin panel config
│   ├── migrations/
│   └── urls/
│       ├── auth_urls.py
│       ├── chat_urls.py
│       └── home_urls.py
│
├── templates/
│   ├── base.html
│   ├── auth/
│   │   ├── login.html
│   │   └── signup.html
│   └── chat/
│       └── dashboard.html
│
└── static/
    ├── css/style.css
    └── js/chat.js
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Python 3.10 or higher
- pip

### 2. Clone / Navigate to project

```bash
cd moldez
```

### 3. Create & activate virtual environment

```bash
# Create
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (macOS/Linux)
source venv/bin/activate
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Set up environment variables

```bash
# Copy the example file
copy .env.example .env    # Windows
cp .env.example .env      # macOS/Linux
```

Then open `.env` and fill in your values:

```env
GEMINI_API_KEY=your_actual_gemini_key_here
SECRET_KEY=your_django_secret_key_here
DEBUG=True
```

> **Get your free Gemini API key:** https://aistudio.google.com/apikey  
> **Generate a Django secret key:** https://djecrety.ir/

### 6. Run database migrations

```bash
python manage.py migrate
```

### 7. Create admin superuser

```bash
python manage.py createsuperuser
```

Or create one quickly via shell:

```bash
python manage.py shell -c "from django.contrib.auth.models import User; User.objects.create_superuser('admin', 'admin@example.com', 'admin1234')"
```

### 8. Start the server

```bash
python manage.py runserver
```

### 9. Open in browser

```
http://127.0.0.1:8000
```

---

## 🔗 URL Reference

| URL | Description |
|-----|-------------|
| `/` | Home — redirects to chat or login |
| `/auth/signup/` | Create a new account |
| `/auth/login/` | Sign in |
| `/auth/logout/` | Sign out |
| `/chat/` | Chat dashboard |
| `/chat/new/` | Start a new chat session |
| `/chat/send/` | API endpoint (POST JSON) |
| `/chat/delete/<id>/` | Delete a chat session |
| `/chat/rename/<id>/` | Rename a chat session (POST JSON) |
| `/chat/export/<id>/` | Export a chat session as `.txt` download |
| `/chat/test/` | Diagnostic — checks if API key works |
| `/admin/` | Django admin panel |

---

## 🧠 How It Works

1. User sends a message via the chat input
2. JavaScript `fetch()` POSTs to `/chat/send/` asynchronously
3. Django backend receives the message, builds full conversation history
4. Backend calls **Google Gemini 2.5 Flash** via direct REST API (no SDK), with automatic retry on 429/503
5. AI response is saved to the database and returned as JSON
6. Frontend displays the response with a character-by-character typing effect — no page reload

---

## 🛡️ Security

- Passwords hashed with PBKDF2 (Django default)
- CSRF protection on all POST requests
- `@login_required` on all chat views
- API key stored in `.env` (never committed to git)
- XSS-safe message rendering in JavaScript

---

## 📝 Notes

- The project uses **SQLite** by default (no extra DB setup needed)
- Gemini API is called via **direct REST** (not the google-genai SDK) for better free-tier compatibility
- Model used: `gemini-2.5-flash` via `https://generativelanguage.googleapis.com/v1beta`
- If `GEMINI_API_KEY` is not set, the chatbot will show a configuration warning
- Visit `/chat/test/` to verify your API key is working correctly
- If you get a 429 quota error, create a new API key at a fresh Google AI Studio project

---

## 🐛 Troubleshooting

| Problem | Fix |
|---------|-----|
| "Chat URL not configured" error | Hard refresh the page (Ctrl+F5) |
| 429 RESOURCE_EXHAUSTED | Create a new Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| AI not responding | Visit `/chat/test/` to diagnose the API key |
| Admin login fails | Run `python manage.py createsuperuser` |
