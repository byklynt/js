// Unit tests run the provider adapters in mock mode. The app never does this by default.
process.env.PROVIDER_MODE = "mock";
// A .env.local that approves the real provider (PROVIDER_LIVE_APPROVED_REF) must never reach tests: an empty value is "defined", so the
// env loaders of the suites (which only fill undefined variables) keep it empty and the mode stays mock.
process.env.PROVIDER_LIVE_APPROVED_REF = "";
