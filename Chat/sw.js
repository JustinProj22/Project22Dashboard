// Service worker — runs in the background, separate from the page itself.
// This is what lets a notification show even if the PWA isn't open.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fired when the Vercel relay successfully delivers a push to this device.
self.addEventListener('push', (event) => {
  let data = { title: 'New message', body: '' };

  try {
    data = event.data.json();
  } catch (e) {
    // If the payload wasn't JSON for some reason, fall back to plain text
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { conversationId: data.conversationId || '' }
  };

  // event.waitUntil is required — iOS will kill/distrust the subscription
  // if a push event doesn't result in a notification being shown.
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Fired when the user taps the notification itself.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If the app is already open in a tab/standalone window, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window to the app
      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});
