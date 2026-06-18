// ============================================================
// CONFIG — fill these in once you have your new deployment + Vercel function
// ============================================================
const APPS_SCRIPT_URL = 'PASTE_YOUR_NEW_DEPLOYMENT_EXEC_URL_HERE';
const VAPID_PUBLIC_KEY = 'PASTE_YOUR_VAPID_PUBLIC_KEY_HERE'; // not secret, safe in frontend code

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

  // TEMPORARY: for testing before a real conversation list is built.
  // Replace with your sidebar/contact list once the core flow is verified.
  document.getElementById('openConvoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const convoId = document.getElementById('convoIdInput').value;
    if (convoId) openConversation(convoId);
  });
});
