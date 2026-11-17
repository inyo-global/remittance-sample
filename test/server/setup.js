// Runs before server/app.ts is imported: isolate the BFF from the developer's .env and from the real DB.
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.EXTERNAL_API_URL = 'https://api.example.test';
process.env.TENANT = 'sample';
process.env.API_KEY = 'test-api-key';
process.env.AGENT_ID = 'test-agent';
process.env.AGENT_KEY = 'test-agent-key';
process.env.JWT_SECRET = 'test-jwt-secret';
// Empty strings are "set" for dotenv, so values from .env never leak into the tests.
process.env.APP_URL = '';
process.env.MTLS_CERT = '';
process.env.MTLS_KEY = '';
process.env.WEBHOOK_BASIC_USER = '';
process.env.WEBHOOK_BASIC_PASS = '';

// The BFF logs every request and upstream call; keep the test output readable.
if (!process.env.TEST_VERBOSE) {
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    console[level] = () => {};
  }
}
