document.addEventListener("DOMContentLoaded", function () {
    const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = solanaWeb3;
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const PROGRAM_ID = new PublicKey("11111111111111111111111111111111"); // Placeholder

    const contractSearchForm = document.getElementById("contract-search");
    const contractAddressInput = document.getElementById("contract-address");
    const contractDisplay = document.getElementById("contract-display");
    const voteButton = document.getElementById("vote-button");
    const voteCountDisplay = document.getElementById("vote-count");

    let walletPublicKey = null; // Set by second.js
    let selectedContractAddress = null;
    let hasVotedStatus = false;

    // Updated DexScreener API with caching - correct endpoint for tokens
    const API_BASE = "https://api.dexscreener.com/latest/dex/tokens"; // No /solana - chain inferred from address
    const CACHE_TTL = 60000; // 1 minute

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
            if (!response.ok) {
                throw new Error(`API failed: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            console.log("API response for", tokenAddress, ":", data); // Debug log
            if (!data.pairs || data.pairs.length === 0) {
                console.warn("No pairs found for token:", tokenAddress, "- It may not be indexed on DexScreener yet. Try a known token like USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v).");
            }
            localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
            return data;
        } catch (error) {
            console.error("API error for", tokenAddress, ":", error);
            return null;
        }
    }

    // Voting utilities (placeholders)
    function getVoteCountPda(contractAddress) { return PublicKey.findProgramAddressSync([Buffer.from("vote_count"), new PublicKey(contractAddress).toBuffer()], PROGRAM_ID)[0]; }
    function getVotedPda(voter, contractAddress) { return PublicKey.findProgramAddressSync([Buffer.from("voted"), new PublicKey(voter).toBuffer(), new PublicKey(contractAddress).toBuffer()], PROGRAM_ID)[0]; }
    async function hasVoted(voter, contractAddress) { const account = await connection.getAccountInfo(getVotedPda(voter, contractAddress)); return !!account; }
    async function getVoteCount(contractAddress) { const account = await connection.getAccountInfo(getVoteCountPda(contractAddress)); return account?.data?.length === 8 ? account.data.readBigUInt64LE(0) : 0; }
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
            contractDisplay.innerHTML = "<p>No data available. The token may not have active pairs on DexScreener. Try a different address (e.g., USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v).</p>";
            contractDisplay.classList.remove("hidden");
            return;
        }
        const pair = data.pairs[0]; // Use first pair
        contractDisplay.innerHTML = `
            <h3>${pair.baseToken.symbol} / ${pair.quoteToken.symbol}</h3>
            <p>Price USD: $${pair.priceUsd || "N/A"}</p>
            <p>Liquidity USD: $${pair.liquidity?.usd || "N/A"}</p>
            <p>FDV: $${pair.fdv || "N/A"}</p>
            <p>24h Volume: $${pair.volume?.h24 || "N/A"}</p>
            <p>24h Price Change: ${pair.priceChange?.h24 || "0"}%</p>
        `;
        contractDisplay.classList.remove("hidden");
    }

    async function updateVoteStatus() { 
        if (!walletPublicKey || !selectedContractAddress) { 
            voteButton.disabled = true; 
            voteCountDisplay.textContent = "Total Votes: 0"; 
            return; 
        } 
        hasVotedStatus = await hasVoted(walletPublicKey.toString(), selectedContractAddress); 
        voteButton.disabled = hasVotedStatus; 
        voteButton.textContent = hasVotedStatus ? "Already Voted" : "Vote"; 
        voteCountDisplay.textContent = `Total Votes: ${Number(await getVoteCount(selectedContractAddress))}`; 
    }

    async function signTransaction(tx) {
        try {
            // Placeholder; wallet connection handled by second.js
            throw new Error("Wallet not connected for signing");
        } catch (error) {
            console.error("Sign error:", error);
            throw error;
        }
    }

    contractSearchForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const address = contractAddressInput.value.trim();
        if (!address) {
            alert("Enter a valid address");
            return;
        }
        try {
            new PublicKey(address); // Validate Solana address
            selectedContractAddress = address;
            console.log("Searching for token:", address); // Debug log
            const data = await fetchTokenData(address);
            displayTokenData(data);
            await updateVoteStatus();
        } catch (e) {
            console.error("Search error:", e);
            contractDisplay.innerHTML = "<p>Invalid address or no data</p>";
            contractDisplay.classList.remove("hidden");
            voteButton.disabled = true;
            voteCountDisplay.textContent = "Total Votes: 0";
        }
    });

    voteButton.addEventListener("click", async () => {
        if (!walletPublicKey) {
            alert("Connect wallet");
            return;
        }
        if (hasVotedStatus) {
            alert("Already voted");
            return;
        }
        if (!selectedContractAddress) {
            alert("Select a contract");
            return;
        }
        try {
            const tx = createVoteTransaction(walletPublicKey, selectedContractAddress);
            tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            const signedRaw = await signTransaction(tx);
            const txid = await connection.sendRawTransaction(signedRaw);
            await connection.confirmTransaction(txid);
            alert(`Vote success: ${txid}`);
            await updateVoteStatus();
        } catch (e) {
            console.error("Vote error:", e);
            alert("Vote failed");
        }
    });
});