// ============================================================
// CONFIG — fill these in once you have your new deployment + Vercel function
// ============================================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwElWIxEx9IbCseRdhMJkiYm51NLyA5sNPB2uCCX0D_HDTSdXJa9panGAdgG5f-jq2W/exec';
const VAPID_PUBLIC_KEY = 'BPgI6fOwbKkvNXU_UG_SO3xYlhGsB1QMfFHNPf6yhPFF3P_ck7zNypzb_iwL8HPYeEzwfAHUuVrw39WCN3Y-ZU8'; // not secret, safe in frontend code

// ============================================================
// STATE
// ============================================================
let currentUserId = localStorage.getItem('wm_userId') || null;
let currentConversationId = null;
let pollTimer = null;

// ============================================================
// LOGIN — minimal: just stores a UserID locally.
// (Matches your desktop app's model: UserID is the identity,
// no separate auth/password layer exists yet in your sheet schema.)
// ============================================================
function login(userId) {
  currentUserId = userId.trim();
  localStorage.setItem('wm_userId', currentUserId);
  showApp();
  subscribeToPush();
}

function logout() {
  localStorage.removeItem('wm_userId');
  currentUserId = null;
  location.reload();
}

// ============================================================
// CORS-SAFE FETCH HELPER
// Apps Script doesn't handle preflight OPTIONS requests, so we avoid
// triggering one: use text/plain as the content type instead of
// application/json. The body is still JSON text — Apps Script's
// e.postData.contents reads the raw text either way, so doPost's
// JSON.parse(e.postData.contents) keeps working unchanged.
// ============================================================
async function callAppsScript(action, params) {
  const body = JSON.stringify(Object.assign({ action: action }, params));

  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: body
  });

  return response.json();
}

// ============================================================
// PUSH SUBSCRIPTION
// ============================================================
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push not supported in this browser');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission not granted');
      return;
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    await callAppsScript('registerPush', {
      userId: currentUserId,
      subscription: subscription.toJSON()
    });
  } catch (err) {
    console.error('Push subscription failed', err);
  }
}

// Converts the VAPID public key from base64url (the format it's
// generated in) to the Uint8Array the Push API expects.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ============================================================
// CONVERSATIONS (dropdown)
// ============================================================
let conversationsCache = [];
let conversationsPollTimer = null;

async function loadConversations() {
  const result = await callAppsScript('getConversations', {
    userId: currentUserId
  });

  if (result.success) {
    conversationsCache = result.conversations;
    renderConversationOptions();
  } else {
    console.error('Failed to load conversations', result.error);
  }
}

function renderConversationOptions() {
  const select = document.getElementById('convoSelect');
  const previouslySelected = select.value;

  select.innerHTML = '';

  if (conversationsCache.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No conversations yet';
    select.appendChild(opt);
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a conversation...';
  select.appendChild(placeholder);

  conversationsCache.forEach((convo) => {
    const opt = document.createElement('option');
    opt.value = convo.conversationId;

    const icon = convo.type === 'group' ? '\u{1F465}' : '\u{1F464}'; // 👥 / 👤
    const unreadTag = convo.unreadCount > 0 ? ` (${convo.unreadCount} new)` : '';
    opt.textContent = `${icon} ${convo.displayName}${unreadTag}`;

    select.appendChild(opt);
  });

  // Keep the same chat selected across a background refresh, if it still exists
  if (previouslySelected && conversationsCache.some(c => c.conversationId === previouslySelected)) {
    select.value = previouslySelected;
  }
}

// ============================================================
// MESSAGES
// ============================================================
function openConversation(conversationId) {
  currentConversationId = conversationId;
  loadMessages();

  if (pollTimer) clearInterval(pollTimer);
  // Simple fallback polling while the conversation is open, in case
  // a push didn't arrive (matches your desktop app's 10s refresh idea,
  // but only while actively viewing a chat, to save requests).
  pollTimer = setInterval(loadMessages, 10000);
}

async function loadMessages() {
  if (!currentConversationId) return;

  const result = await callAppsScript('getMessages', {
    conversationId: currentConversationId
  });

  if (result.success) {
    renderMessages(result.messages);
  } else {
    console.error('Failed to load messages', result.error);
  }
}

async function sendMessage(text) {
  if (!text.trim() || !currentConversationId) return;

  const result = await callAppsScript('sendMessage', {
    conversationId: currentConversationId,
    senderId: currentUserId,
    text: text.trim()
  });

  if (result.success) {
    loadMessages();
  } else {
    console.error('Send failed', result.error);
  }
}

function renderMessages(messages) {
  const container = document.getElementById('messageList');
  container.innerHTML = '';

  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="no-messages">No messages yet. Start the conversation!</div>';
    return;
  }

  messages
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .forEach((msg) => {
      const isCurrentUser = msg.senderId === currentUserId;
      const div = document.createElement('div');
      div.className = 'message-container' + (isCurrentUser ? ' current-user' : '');

      const header = document.createElement('div');
      header.className = 'message-header';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'sender-name ' + (isCurrentUser ? 'current-user' : 'other-user');
      nameSpan.textContent = isCurrentUser ? 'You' : msg.senderId;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'timestamp';
      timeSpan.textContent = msg.timestamp;

      header.appendChild(nameSpan);
      header.appendChild(timeSpan);

      const textDiv = document.createElement('div');
      textDiv.className = 'message-text';
      textDiv.textContent = msg.text; // textContent, not innerHTML — avoids needing manual HTML-escaping

      div.appendChild(header);
      div.appendChild(textDiv);
      container.appendChild(div);
    });

  container.scrollTop = container.scrollHeight;
}

// ============================================================
// UI WIRING
// ============================================================
function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('currentUserLabel').textContent = currentUserId;

  loadConversations();

  if (conversationsPollTimer) clearInterval(conversationsPollTimer);
  // Refresh the dropdown periodically so new contacts/unread counts
  // show up without requiring a manual reload — mirrors the desktop
  // app's background refresh of its sidebar.
  conversationsPollTimer = setInterval(loadConversations, 30000);
}

window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }

  if (currentUserId) {
    showApp();
    subscribeToPush();
  }

  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const userId = document.getElementById('userIdInput').value;
    if (userId) login(userId);
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.getElementById('messageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    sendMessage(input.value);
    input.value = '';
  });

  document.getElementById('convoSelect').addEventListener('change', (e) => {
    const convoId = e.target.value;
    if (convoId) openConversation(convoId);
  });
});
