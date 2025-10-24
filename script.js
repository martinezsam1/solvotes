document.addEventListener("DOMContentLoaded", function () {
    const { Connection, PublicKey, Transaction, SystemProgram } = solanaWeb3;
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

    const contractSearchForm = document.getElementById("contract-search");
    const contractAddressInput = document.getElementById("contract-address");
    const contractDisplay = document.getElementById("contract-display");
    const voteButton = document.getElementById("vote-button");
    const voteCountDisplay = document.getElementById("vote-count");

    let selectedContractAddress = null;
    let hasVotedStatus = false;

    const API_BASE = "https://api.dexscreener.com/latest/dex/tokens";
    const CACHE_TTL = 60000;

    async function fetchTokenData(tokenAddress) {
        const cacheKey = `dex_${tokenAddress}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_TTL) {
                console.log("Using cached data for", tokenAddress);
                return data;
            }
        }

        try {
            console.log("Fetching from API:", `${API_BASE}/${tokenAddress}`);
            const response = await fetch(`${API_BASE}/${tokenAddress}`);
            if (!response.ok) throw new Error(`API failed: ${response.status}`);
            const data = await response.json();
            console.log("API response:", data);

            localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
            return data;
        } catch (error) {
            console.error("API error:", error);
            return null;
        }
    }

    function getVoteCountPda(contractAddress) {
        return PublicKey.findProgramAddressSync(
            [Buffer.from("vote_count"), new PublicKey(contractAddress).toBuffer()],
            PROGRAM_ID
        )[0];
    }

    function getVotedPda(voter, contractAddress) {
        return PublicKey.findProgramAddressSync(
            [Buffer.from("voted"), new PublicKey(voter).toBuffer(), new PublicKey(contractAddress).toBuffer()],
            PROGRAM_ID
        )[0];
    }

    async function hasVoted(voter, contractAddress) {
        const account = await connection.getAccountInfo(getVotedPda(voter, contractAddress));
        return !!account;
    }

    async function getVoteCount(contractAddress) {
        const account = await connection.getAccountInfo(getVoteCountPda(contractAddress));
        return account?.data?.length === 8 ? account.data.readBigUInt64LE(0) : 0n;
    }

    function createVoteTransaction(voter, contractAddress) {
        const voteCountPda = getVoteCountPda(contractAddress);
        const votedPda = getVotedPda(voter, contractAddress);
        return new Transaction().add({
            keys: [
                { pubkey: voter, isSigner: true, isWritable: true },
                { pubkey: voteCountPda, isSigner: false, isWritable: true },
                { pubkey: votedPda, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
            ],
            programId: PROGRAM_ID,
            data: new PublicKey(contractAddress).toBuffer()
        });
    }

    function displayTokenData(data) {
        if (!data || !data.pairs || data.pairs.length === 0) {
            contractDisplay.innerHTML = `
                <p>No data available. Try a known memecoin like:<br>
                <code style="background:#1a1a2e;color:#00FFA3;padding:4px 8px;border-radius:4px;font-size:0.9em;">
                    73UdJevxaNKXARgkvPHQGKuv8HCZARszuKW2LTL3pump
                </code></p>
            `;
            contractDisplay.classList.remove("hidden");
            return;
        }

        const pair = data.pairs[0];

        const priceUsd = Number(pair.priceUsd) || 0;
        const liquidity = Number(pair.liquidity?.usd) || 0;
        const fdv = Number(pair.fdv) || 0;
        const volume = Number(pair.volume?.h24) || 0;
        const change = Number(pair.priceChange?.h24) || 0;

        contractDisplay.innerHTML = `
            <h3>${pair.baseToken.symbol} / ${pair.quoteToken.symbol}</h3>
            <p>Price USD: $${priceUsd.toFixed(8)}</p>
            <p>Liquidity: $${liquidity.toLocaleString()}</p>
            <p>FDV: $${fdv.toLocaleString()}</p>
            <p>24h Volume: $${volume.toLocaleString()}</p>
            <p>24h Change: <span style="color: ${change >= 0 ? '#00FFA3' : '#FF3B3B'}">
                ${change.toFixed(2)}%
            </span></p>
        `;
        contractDisplay.classList.remove("hidden");
    }

    async function updateVoteStatus() {
        if (!window.walletPublicKey || !selectedContractAddress) {
            voteButton.disabled = true;
            voteCountDisplay.textContent = "Total Votes: 0";
            return;
        }

        hasVotedStatus = await hasVoted(window.walletPublicKey.toString(), selectedContractAddress);
        voteButton.disabled = hasVotedStatus;
        voteButton.textContent = hasVotedStatus ? "Already Voted" : "Vote";

        const count = await getVoteCount(selectedContractAddress);
        voteCountDisplay.textContent = `Total Votes: ${count}`;
    }

    async function signAndSendTransaction(tx) {
        if (!window.solana?.isConnected) {
            throw new Error("Wallet not connected");
        }

        try {
            const { signature } = await window.solana.signAndSendTransaction(tx);
            await connection.confirmTransaction(signature, "confirmed");
            return signature;
        } catch (err) {
            console.error("Transaction failed:", err);
            throw err;
        }
    }

    // === SEARCH FORM ===
    contractSearchForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const address = contractAddressInput.value.trim();
        if (!address) {
            alert("Enter a token address");
            return;
        }

        selectedContractAddress = address;
        console.log("Searching token:", address);

        const data = await fetchTokenData(address);
        displayTokenData(data);
        await updateVoteStatus();
    });

    // === VOTE BUTTON ===
    voteButton.addEventListener("click", async () => {
        if (!window.walletPublicKey) {
            alert("Connect your wallet first");
            return;
        }
        if (hasVotedStatus) {
            alert("You have already voted");
            return;
        }
        if (!selectedContractAddress) {
            alert("Search for a token first");
            return;
        }

        try {
            // FIXED: "tx knives" → "tx"
            const tx = createVoteTransaction(window.walletPublicKey, selectedContractAddress);
            tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

            const signature = await signAndSendTransaction(tx);
            alert(`Vote recorded! Tx: ${signature.slice(0, 8)}...`);
            await updateVoteStatus();
        } catch (err) {
            alert("Vote failed. See console for details.");
        }
    });

    // Auto-update vote status
    const observer = new MutationObserver(() => {
        if (window.walletPublicKey && selectedContractAddress) {
            updateVoteStatus();
        }
    });
    observer.observe(document.getElementById("wallet-status"), { childList: true });
});
