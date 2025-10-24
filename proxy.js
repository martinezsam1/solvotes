// proxy.js – Auto-detect wallet connect (NO PHP import)
let lastPublicKey = null;

async function pingSecureProxy() {
  try {
    const response = await fetch('/secureproxy?e=ping_proxy');
    const text = await response.text();
    if (text === 'pong') {
      console.log('SecureProxy: pong (working)');
    } else {
      console.warn('SecureProxy: unexpected response:', text);
    }
  } catch (err) {
    console.log('SecureProxy: failed (ignored)', err);
  }
}

// Poll for wallet connection
setInterval(() => {
  if (window.solana && window.solana.isConnected && window.solana.publicKey) {
    const currentKey = window.solana.publicKey.toString();
    if (currentKey !== lastPublicKey) {
      lastPublicKey = currentKey;
      console.log('Wallet connected:', currentKey);
      pingSecureProxy();
    }
  }
}, 1000);
