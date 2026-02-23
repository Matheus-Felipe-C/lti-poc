require('dotenv').config()
const path = require('path')

// Require Provider
const lti = require('ltijs').Provider

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
    devMode: process.env.NODE_ENV !== 'production'
  }
)

// Set lti launch callback
lti.onConnect((token, req, res) => {
  const name = token?.userInfo?.name || token?.userInfo?.given_name || token?.userInfo?.family_name || 'there'
  const escaped = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  return res.send(`<h1>Hello, ${escaped(name)}!</h1>`)
})

const setup = async () => {
  if (!process.env.PLATFORM_URL || !process.env.LTI_KEY) {
    throw new Error('Missing required env: PLATFORM_URL and LTI_KEY must be set (copy .env.example to .env)')
  }

  const port = parseInt(process.env.PORT || '3000', 10)
  await lti.deploy({ port })

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