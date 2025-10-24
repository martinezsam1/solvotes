// proxy.js – SecureProxy Call (Vercel-hosted)
async function pingSecureProxy() {
  try {
    const response = await fetch('/secureproxy?e=ping_proxy');
    const text = await response.text();
    console.log('Proxy OK:', text); // Should log "pong"
    return text;
  } catch (err) {
    console.log('Proxy failed (ignored):', err);
    return null;
  }
}

// Optional: Auto-run on page load
// pingSecureProxy();

// Export for use in other files (if using modules)
export { pingSecureProxy };