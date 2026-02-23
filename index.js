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

// Set lti launch callback
lti.onConnect((token, req, res) => {
  console.log('[LTI] onConnect called', { path: req.path, userInfo: token?.userInfo })
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
})

const setup = async () => {
  if (!process.env.PLATFORM_URL || !process.env.LTI_KEY) {
    throw new Error('Missing required env: PLATFORM_URL and LTI_KEY must be set (copy .env.example to .env)')
  }

  const port = parseInt(process.env.PORT || '3000', 10)
  await lti.deploy({ port })
  console.log('[LTI] Server listening on port', port, '- app route: /')
  console.log('[LTI] Set env DEBUG=provider:main in Coolify for more ltijs logs')

  const platformUrl = process.env.PLATFORM_URL.replace(/\/$/, '') // trim trailing slash

  // Register platform
  await lti.registerPlatform({
    url: platformUrl,
    name: process.env.PLATFORM_NAME,
    clientId: process.env.PLATFORM_CLIENT_ID,
    authenticationEndpoint: `${platformUrl}/auth`,
    accesstokenEndpoint: `${platformUrl}/token`,
    authConfig: { method: 'JWK_SET', key: `${platformUrl}/keyset` }
  })
}

setup()