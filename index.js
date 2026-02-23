require('dotenv').config()
const path = require('path')

// Require Provider
const lti = require('ltijs').Provider

// Log every request (so we can see in Coolify whether Moodle hits the app and which path)
function requestLogger(app) {
  app.use((req, res, next) => {
    const ts = new Date().toISOString()
    console.log('[LTI] Request', ts, req.method, req.url, req.path, '| query:', Object.keys(req.query || {}).length, '| body keys:', req.body ? Object.keys(req.body) : [])
    next()
  })
}

// Setup provider
lti.setup(process.env.LTI_KEY, // Key used to sign cookies and tokens
  { // Database configuration
    url: process.env.MONGODB_URL,
    connection: {
      user: process.env.MONGODB_USER,
      pass: process.env.MONGODB_PASSWORD
    }
  },
  { // Options
    appRoute: '/', loginRoute: '/login', // Optionally, specify some of the reserved routes
    cookies: {
      secure: process.env.COOKIES_SECURE === 'true',
      sameSite: process.env.COOKIES_SAME_SITE || ''
    },
    devMode: process.env.NODE_ENV !== 'production',
    serverAddon: requestLogger
  }
)

// Shared: render the LTI app page (used for both / and any other path that has a valid session)
function sendLtiApp(token, req, res) {
  const name = token?.userInfo?.name || token?.userInfo?.given_name || token?.userInfo?.family_name || 'there'
  const escaped = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LTI Tool</title>
</head>
<body>
  <h1>Hello, ${escaped(name)}!</h1>
  <script>console.log('[LTI iframe] Loaded. User:', ${JSON.stringify(name)})</script>
</body>
</html>`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.send(html)
}

// Set lti launch callback
lti.onConnect((token, req, res) => {
  console.log('[LTI] onConnect called', { path: req.path, userInfo: token?.userInfo })
  return sendLtiApp(token, req, res)
})

// Show a clear message when token is missing or invalid (instead of generic "invalid request")
lti.onInvalidToken((req, res) => {
  const err = res.locals?.err || {}
  console.log('[LTI] Invalid token', err.details?.message, err.details)
  const msg = err.details?.message || err.error || 'Invalid request'
  const desc = err.details?.description || ''
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>LTI Error</title></head>
<body>
  <h1>LTI: ${String(msg).replace(/</g, '&lt;')}</h1>
  ${desc ? `<p>${String(desc).replace(/</g, '&lt;')}</p>` : ''}
  <p>Ensure Moodle’s <strong>Redirection URI(s)</strong> is exactly your tool root (e.g. <code>https://your-tool-domain/</code>).</p>
</body>
</html>`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(err.status || 401).send(html)
})

const setup = async () => {
  if (!process.env.PLATFORM_URL || !process.env.LTI_KEY) {
    throw new Error('Missing required env: PLATFORM_URL and LTI_KEY must be set (copy .env.example to .env)')
  }

  const port = parseInt(process.env.PORT || '3000', 10)
  await lti.deploy({ port })

  // If Moodle uses a Redirection URI like /launch, ltijs redirects to that path with ?ltik=...
  // We only register the app route as /. This catch-all serves the app for any path that has a valid LTI session.
  lti.app.use((req, res, next) => {
    if (res.locals?.token && req.method === 'GET') {
      console.log('[LTI] Serving app for path (Moodle redirection URI)', req.path)
      return sendLtiApp(res.locals.token, req, res)
    }
    next()
  })
  lti.app.use((req, res) => {
    console.log('[LTI] 404', req.method, req.path)
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>404 Not found</h1><p>${req.method} ${req.path}</p><p>LTI Redirection URI in Moodle must be your tool root URL (e.g. <code>https://your-domain/</code>).</p></body></html>`
    )
  })

  console.log('[LTI] Server listening on port', port, '- app route: /')
  console.log('[LTI] Set env DEBUG=provider:main in Coolify for more ltijs logs')

  const platformUrl = process.env.PLATFORM_URL.replace(/\/$/, '') // trim trailing slash

  // Register platform
  await lti.registerPlatform({
    url: platformUrl,
    name: process.env.PLATFORM_NAME,
    clientId: process.env.PLATFORM_CLIENT_ID,
    authenticationEndpoint: `${platformUrl}/mod/lti/auth.php`,
    accesstokenEndpoint: `${platformUrl}/mod/lti/token.php`,
    authConfig: { 
      method: 'JWK_SET', 
      key: `${platformUrl}/mod/lti/certs.php` 
    }
  })
}

setup()