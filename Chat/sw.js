self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = { title: 'New message', body: '', conversationId: '' };
  try { data = event.data.json(); } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  'icon-192.png',
      badge: 'icon-192.png',
      data:  { conversationId: data.conversationId || '' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const convoId = event.notification.data?.conversationId || '';
  const target  = self.registration.scope + (convoId ? `?conversationId=${convoId}` : '');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // If app already open, navigate it to the right conversation
      for (const client of clients) {
        if (client.url.includes(self.registration.scope) && 'navigate' in client) {
          client.focus();
          return client.navigate(target);
        }
      }
      // Otherwise open fresh
      return self.clients.openWindow(target);
    })
  );
});
