// ============================================================
// CONFIG — fill these in
// ============================================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw_fVcjSgfCiVg5TeEiUj_-WnZ4VfU8oPbYyrFbf_3hq3r33dqbt07wrLafL1VJ9GcA/exec';
const VAPID_PUBLIC_KEY = 'BPgI6fOwbKkvNXU_UG_SO3xYlhGsB1QMfFHNPf6yhPFF3P_ck7zNypzb_iwL8HPYeEzwfAHUuVrw39WCN3Y-ZU8';
const GIPHY_API_KEY    = 'X6uHs1HdNBeFDtnk8dHJWlXUk108UFbj';

// ============================================================
// STATE
// ============================================================
let currentUserId         = localStorage.getItem('wm_userId') || null;
let currentConversationId = null;
let currentChatName       = '';
let conversationsCache    = [];
let messagePollTimer      = null;
let conversationPollTimer = null;
let pendingGifUrl         = null;   // set when user picks a GIF before sending

// ============================================================
// EMOJI DATA
// ============================================================
const EMOJI_CATEGORIES = [
  { icon: '😊', label: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😵','🤯','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱'] },
  { icon: '👍', label: 'Gestures', emojis: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','🙏','💪','🦾','✍️','🤳','💅','🤲','👐','🙌','👏','🤜','🤛','🤌'] },
  { icon: '❤️', label: 'Hearts',   emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟'] },
  { icon: '🐶', label: 'Animals',  emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞','🐜','🐢','🐍','🐙','🦑','🐡','🐠','🐟','🐬','🐳','🦈','🐊','🐘','🦒','🦘'] },
  { icon: '🍕', label: 'Food',     emojis: ['🍎','🍏','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥒','🌽','🥕','🍞','🥐','🧀','🥚','🍳','🥞','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🍝','🍜','🍣','🍱','🍦','🧁','🍰','🎂','🍩','🍪','☕','🍵','🍺','🍻','🥂','🥃'] }
];

// ============================================================
// HELPERS
// ============================================================
function createConversationId(u1, u2) {
  return [u1, u2].sort().join('-');
}

function isGifUrl(text) {
  if (!text) return false;
  const t = text.trim();
  return (t.startsWith('http://') || t.startsWith('https://')) &&
    (t.endsWith('.gif') || t.includes('giphy.com') || t.includes('tenor.com'));
}

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// Auto-grow textarea as user types
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// Parses timestamps in dd/MM/yyyy HH:mm:ss format (what the desktop app writes)
// JavaScript's Date constructor expects MM/dd/yyyy so we reorder the parts.
function parseTimestamp(ts) {
  if (!ts) return new Date(0);
  var s = String(ts).trim();
  // Match dd/MM/yyyy HH:mm:ss
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) {
    // Reorder to yyyy-MM-dd HH:mm:ss which Date parses reliably
    return new Date(m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0') + 'T' + m[4].padStart(2,'0') + ':' + m[5] + ':' + m[6]);
  }
  // Fallback for ISO or other formats
  var d = new Date(s);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

// ============================================================
// APPS SCRIPT FETCH
// ============================================================
async function callAppsScript(action, params) {
  const body = JSON.stringify(Object.assign({ action }, params));
  const res  = await fetch(APPS_SCRIPT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body
  });
  return res.json();
}

// ============================================================
// LOGIN / LOGOUT
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
// PUSH SUBSCRIPTION
// ============================================================
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg        = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    await callAppsScript('registerPush', { userId: currentUserId, subscription: sub.toJSON() });
  } catch (err) {
    console.error('Push subscription failed', err);
  }
}

// ============================================================
// CONVERSATIONS — DRAWER
// ============================================================
async function loadConversations() {
  const result = await callAppsScript('getConversations', { userId: currentUserId });
  if (result.success) {
    conversationsCache = result.conversations;
    renderConvoList(document.getElementById('drawerSearch').value);
  } else {
    console.error('Failed to load conversations', result.error);
  }
}

function renderConvoList(filter) {
  const list    = document.getElementById('convoList');
  const term    = (filter || '').toLowerCase();
  const items   = conversationsCache.filter(c =>
    !term || c.displayName.toLowerCase().includes(term)
  );

  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:#999;font-size:0.9rem">No conversations found</div>';
    return;
  }

  items.forEach(convo => {
    const div = document.createElement('div');
    div.className = 'convo-item' + (convo.conversationId === currentConversationId ? ' active' : '');
    div.dataset.id = convo.conversationId;

    const isGroup = convo.type === 'group';
    const icon    = isGroup ? '👥' : '👤';

    div.innerHTML = `
      <div class="convo-avatar ${isGroup ? 'group' : ''}">${icon}</div>
      <div class="convo-info">
        <div class="convo-name">${escapeHtml(convo.displayName)}</div>
        <div class="convo-preview">${escapeHtml(convo.lastMessage || 'No messages yet')}</div>
      </div>
      <div class="convo-meta">
        ${convo.unreadCount > 0 ? `<span class="unread-badge">${convo.unreadCount}</span>` : ''}
      </div>
    `;

    div.addEventListener('click', () => {
      openConversation(convo.conversationId, convo.displayName);
      closeDrawer();
    });

    list.appendChild(div);
  });
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text || '';
  return d.innerHTML;
}

// ============================================================
// DRAWER OPEN/CLOSE
// ============================================================
function openDrawer() {
  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  loadConversations(); // refresh on each open so counts are current
}

function closeDrawer() {
  document.getElementById('drawerOverlay').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
}

// ============================================================
// OPEN CONVERSATION (also called from push notification tap)
// ============================================================
function openConversation(conversationId, displayName) {
  currentConversationId = conversationId;
  currentChatName       = displayName || conversationId;

  document.getElementById('headerChatName').textContent = currentChatName;

  // Highlight active item in drawer if it's open
  document.querySelectorAll('.convo-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === conversationId);
  });

  loadMessages(true); // true = scroll to bottom

  if (messagePollTimer) clearInterval(messagePollTimer);
  messagePollTimer = setInterval(() => loadMessages(false), 10000);
}

// ============================================================
// MESSAGES
// ============================================================
async function loadMessages(scrollToBottom) {
  if (!currentConversationId) return;

  const result = await callAppsScript('getMessages', { conversationId: currentConversationId });
  if (result.success) {
    renderMessages(result.messages, scrollToBottom);
  } else {
    console.error('Failed to load messages', result.error);
  }
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text  = pendingGifUrl || input.value.trim();
  if (!text || !currentConversationId) return;

  // Clear input immediately — feels instant
  input.value        = '';
  input.style.height = 'auto';
  pendingGifUrl      = null;

  // ── OPTIMISTIC UI: show the bubble right now, before the server responds ──
  const now       = new Date();
  const pad       = n => n.toString().padStart(2, '0');
  const timeStr   = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const container = document.getElementById('messageList');

  const placeholder = container.querySelector('.no-messages');
  if (placeholder) placeholder.remove();

  const optimisticBubble = buildMessageBubble({ senderId: currentUserId, text, timestamp: timeStr }, true);
  optimisticBubble.style.opacity = '0.7'; // slightly dim until confirmed
  container.appendChild(optimisticBubble);
  container.scrollTop = container.scrollHeight;

  // ── NETWORK: fire and forget, confirm in background ──
  callAppsScript('sendMessage', {
    conversationId: currentConversationId,
    senderId:       currentUserId,
    text
  }).then(result => {
    if (result.success) {
      // Replace optimistic bubble with server-confirmed messages
      loadMessages(false);
    } else {
      console.error('Send failed', result.error);
      optimisticBubble.style.opacity = '1';
      optimisticBubble.style.border  = '1px solid red';
      optimisticBubble.title         = 'Failed to send — tap to retry';
    }
  }).catch(err => {
    console.error('Send error', err);
    optimisticBubble.style.opacity = '1';
    optimisticBubble.style.border  = '1px solid red';
    optimisticBubble.title         = 'Failed to send';
  });
}

// Shared bubble builder — used by both optimistic send and renderMessages
function buildMessageBubble(msg, isMine) {
  const wrap       = document.createElement('div');
  wrap.className   = 'message-container' + (isMine ? ' current-user' : '');

  if (!isMine) {
    const nameEl       = document.createElement('div');
    nameEl.className   = 'sender-name-inline';
    nameEl.textContent = msg.senderId;
    wrap.appendChild(nameEl);
  }

  const bubble     = document.createElement('div');
  bubble.className = 'message-bubble';

  if (isGifUrl(msg.text)) {
    const img     = document.createElement('img');
    img.src       = msg.text;
    img.className = 'message-gif';
    img.alt       = 'GIF';
    bubble.appendChild(img);
  } else {
    bubble.textContent = msg.text;
  }

  wrap.appendChild(bubble);

  const meta       = document.createElement('div');
  meta.className   = 'message-meta';
  meta.textContent = msg.timestamp;
  wrap.appendChild(meta);

  return wrap;
}

function renderMessages(messages, scrollToBottom) {
  const container        = document.getElementById('messageList');
  const prevScrollTop    = container.scrollTop;
  const prevScrollHeight = container.scrollHeight;
  const wasNearBottom    = (prevScrollHeight - prevScrollTop - container.clientHeight) < 80;

  container.innerHTML = '';

  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="no-messages">No messages yet. Say hello! 👋</div>';
    return;
  }

  messages
    .sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp))
    .forEach(msg => container.appendChild(buildMessageBubble(msg, msg.senderId === currentUserId)));

  if (scrollToBottom || wasNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

// ============================================================
// EMOJI PICKER
// ============================================================
let currentEmojiCat = 0;

function openEmojiPicker() {
  const overlay = document.getElementById('emojiOverlay');
  overlay.classList.add('open');
  if (document.getElementById('emojiGrid').children.length === 0) {
    buildEmojiPicker();
  }
}

function closeEmojiPicker() {
  document.getElementById('emojiOverlay').classList.remove('open');
}

function buildEmojiPicker() {
  const catsEl = document.getElementById('emojiCats');
  const gridEl = document.getElementById('emojiGrid');
  catsEl.innerHTML = '';

  EMOJI_CATEGORIES.forEach((cat, i) => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (i === currentEmojiCat ? ' active' : '');
    btn.textContent = cat.icon;
    btn.title = cat.label;
    btn.addEventListener('click', () => {
      currentEmojiCat = i;
      document.querySelectorAll('.cat-btn').forEach((b, j) =>
        b.classList.toggle('active', j === i)
      );
      renderEmojiGrid(i);
    });
    catsEl.appendChild(btn);
  });

  renderEmojiGrid(currentEmojiCat);
}

function renderEmojiGrid(catIndex) {
  const gridEl = document.getElementById('emojiGrid');
  gridEl.innerHTML = '';
  EMOJI_CATEGORIES[catIndex].emojis.forEach(emoji => {
    const cell = document.createElement('div');
    cell.className   = 'emoji-cell';
    cell.textContent = emoji;
    cell.addEventListener('click', () => {
      const input = document.getElementById('messageInput');
      input.value += emoji;
      autoGrow(input);
      closeEmojiPicker();
      input.focus();
    });
    gridEl.appendChild(cell);
  });
}

// ============================================================
// GIF PICKER
// ============================================================
function openGifPicker() {
  document.getElementById('gifOverlay').classList.add('open');
  loadTrendingGifs();
}

function closeGifPicker() {
  document.getElementById('gifOverlay').classList.remove('open');
}

async function loadTrendingGifs() {
  const grid = document.getElementById('gifGrid');
  grid.innerHTML = '<div class="gif-status">Loading trending GIFs…</div>';
  try {
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`;
    const res  = await fetch(url);
    const data = await res.json();
    renderGifs(data.data);
  } catch (e) {
    grid.innerHTML = '<div class="gif-status">Could not load GIFs. Check your API key.</div>';
  }
}

async function searchGifs(query) {
  const grid = document.getElementById('gifGrid');
  grid.innerHTML = '<div class="gif-status">Searching…</div>';
  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=g`;
    const res  = await fetch(url);
    const data = await res.json();
    renderGifs(data.data);
  } catch (e) {
    grid.innerHTML = '<div class="gif-status">Search failed.</div>';
  }
}

function renderGifs(gifs) {
  const grid = document.getElementById('gifGrid');
  grid.innerHTML = '';

  if (!gifs || gifs.length === 0) {
    grid.innerHTML = '<div class="gif-status">No GIFs found.</div>';
    return;
  }

  gifs.forEach(gif => {
    const preview  = gif.images?.fixed_height_small?.url;
    const fullUrl  = gif.images?.original?.url;
    if (!preview || !fullUrl) return;

    const img      = document.createElement('img');
    img.src        = preview;
    img.className  = 'gif-thumb';
    img.alt        = 'GIF';
    img.loading    = 'lazy';
    img.addEventListener('click', () => {
      pendingGifUrl = fullUrl;
      closeGifPicker();
      sendMessage(); // send immediately on tap, same behaviour as desktop
    });
    grid.appendChild(img);
  });
}

// ============================================================
// SHOW APP
// ============================================================
function showApp() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');
  document.getElementById('drawerUserLabel').textContent = currentUserId;

  loadConversations();
  if (conversationPollTimer) clearInterval(conversationPollTimer);
  conversationPollTimer = setInterval(loadConversations, 30000);
}

// ============================================================
// OPEN-FROM-PUSH-NOTIFICATION
// When the service worker opens the app from a notification tap,
// it appends ?conversationId=XXX to the URL. We read that here.
// ============================================================
function checkPushOpenIntent() {
  const params = new URLSearchParams(window.location.search);
  const convoId = params.get('conversationId');
  if (convoId && currentUserId) {
    // Wait for conversations to load so we have the display name
    const tryOpen = () => {
      const found = conversationsCache.find(c => c.conversationId === convoId);
      if (found) {
        openConversation(found.conversationId, found.displayName);
      } else {
        // Fallback: open with raw ID if cache not ready yet
        openConversation(convoId, convoId);
      }
    };
    // Give the first loadConversations call a moment to finish
    setTimeout(tryOpen, 1500);

    // Clean up the URL so refreshing doesn't re-open the same chat
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('DOMContentLoaded', () => {

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }

  // Already logged in?
  if (currentUserId) {
    showApp();
    subscribeToPush();
    checkPushOpenIntent();
  } else {
    document.getElementById('loginScreen').classList.add('active');
  }

  // ── Login form ──
  document.getElementById('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const val = document.getElementById('userIdInput').value;
    if (val) login(val);
  });

  // ── Logout ──
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // ── Hamburger ──
  document.getElementById('hamburgerBtn').addEventListener('click', openDrawer);

  // Close drawer by tapping the overlay behind it
  document.getElementById('drawerOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('drawerOverlay')) closeDrawer();
  });

  // ── Drawer search ──
  document.getElementById('drawerSearch').addEventListener('input', e => {
    renderConvoList(e.target.value);
  });

  // ── Send button ──
  document.getElementById('sendBtn').addEventListener('click', sendMessage);

  // ── Enter to send (Shift+Enter for newline) ──
  document.getElementById('messageInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ── Auto-grow textarea ──
  document.getElementById('messageInput').addEventListener('input', e => {
    autoGrow(e.target);
  });

  // ── Emoji ──
  document.getElementById('emojiBtn').addEventListener('click', openEmojiPicker);
  document.getElementById('emojiOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('emojiOverlay')) closeEmojiPicker();
  });

  // ── GIF ──
  document.getElementById('gifBtn').addEventListener('click', openGifPicker);
  document.getElementById('gifOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('gifOverlay')) closeGifPicker();
  });

  document.getElementById('gifSearchBtn').addEventListener('click', () => {
    const q = document.getElementById('gifSearchInput').value.trim();
    if (q) searchGifs(q); else loadTrendingGifs();
  });

  document.getElementById('gifSearchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) searchGifs(q); else loadTrendingGifs();
    }
  });
});
