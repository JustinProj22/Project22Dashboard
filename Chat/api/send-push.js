const webpush = require('web-push');

// These come from Vercel's Environment Variables (set in the dashboard, not in code)
webpush.setVapidDetails(
  'mailto:Justin@Project22.com.au',          // contact email, required by VAPID spec
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);


module.exports = async (req, res) => {
  // Basic shared-secret check so randoms can't spam your push relay
  if (req.headers['x-relay-secret'] !== process.env.RELAY_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const parsed = typeof req.body === "string"
  ? JSON.parse(req.body)
  : req.body;

const { subscription, title, body } = parsed;

if (!subscription || !subscription.endpoint) {
  return res.status(400).json({
    debug: true,
    body: req.body,
    error: "missing subscription"
  });
}

  const payload = JSON.stringify({
    title:          title || 'New message',
    body:           body  || '',
    conversationId: parsed.conversationId || ''
  });

  try {
    await webpush.sendNotification(subscription, payload);
    return res.status(200).json({ success: true });
  } catch (err) {
    // err.statusCode 410/404 typically means the subscription is dead/expired
    console.error('push send failed', err.statusCode, err.body);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
      statusCode: err.statusCode
      
    });

});
  }
};
