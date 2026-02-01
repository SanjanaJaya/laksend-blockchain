const API_URL = 'http://localhost:8000';
let currentUser = null;
let supportedCurrencies = [];
let lastTransactionCount = 0;
let transactionCheckInterval = null;
let allTransactions = [];
let pendingTransferData = null;
let currentPortfolio = {}; // Store portfolio data globally

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadSupportedCurrencies();
    checkStoredSession();
});

// ========== PAGE NAVIGATION ==========

function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.remove('active');
    });

    // Show selected page
    const selectedPage = document.getElementById(`${pageName}-page`);
    if (selectedPage) {
        selectedPage.classList.add('active');
    }

    // Update navigation active states
    document.querySelectorAll('.nav-item, .sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName || item.getAttribute('data-page') === pageName) {
            item.classList.add('active');
        }
    });

    // Load data for specific pages
    if (pageName === 'transactions') {
        loadTransactionHistory();
    } else if (pageName === 'overview') {
        loadPortfolio();
        loadRecentTransactions();
    } else if (pageName === 'transfer') {
        loadFavoritePayees();
    } else if (pageName === 'convert') {
        loadPortfolio(); // Load portfolio to show balances
        updateConversionBalances();
    }
}

// ========== AUTH TAB SWITCHING ==========

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.target.classList.add('active');
}

// ========== SESSION MANAGEMENT ==========

function checkStoredSession() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        try {
            const userData = JSON.parse(storedUser);
            currentUser = userData;
            verifyAndRestoreSession(userData.username);
        } catch (error) {
            console.error('Error parsing stored session:', error);
            localStorage.removeItem('currentUser');
        }
    }
}

async function verifyAndRestoreSession(username) {
    try {
        const response = await fetch(`${API_URL}/user/${username}`);
        if (response.ok) {
            const data = await response.json();
            const storedUser = JSON.parse(localStorage.getItem('currentUser'));
            currentUser = {
                username: storedUser.username,
                wallet_address: storedUser.wallet_address,
                password: storedUser.password || null
            };

            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard-section').classList.add('active');
            document.getElementById('username-display').textContent = data.username;
            document.getElementById('wallet-address').textContent = data.wallet_address;

            loadPortfolio();
            loadRecentTransactions();
            startTransactionMonitoring();
            showPage('overview');
        } else {
            localStorage.removeItem('currentUser');
        }
    } catch (error) {
        console.error('Session verification failed:', error);
        localStorage.removeItem('currentUser');
    }
}

// ========== AUTH FUNCTIONS ==========

async function signup() {
    const username = document.getElementById('signup-username').value;
    const password = document.getElementById('signup-password').value;
    const initialBalance = parseFloat(document.getElementById('initial-balance').value);

    if (!username || !password) {
        showNotification('error', 'Validation Error', 'Please fill all fields');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/signup`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                username: username,
                password: password,
                initial_balance: initialBalance
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('success', '✅ Account Created', `Welcome ${username}! Your wallet is ready.`);

            currentUser = {
                username: data.username,
                wallet_address: data.wallet_address,
                password: password
            };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));

            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard-section').classList.add('active');
            document.getElementById('username-display').textContent = data.username;
            document.getElementById('wallet-address').textContent = data.wallet_address;

            loadPortfolio();
            startTransactionMonitoring();
            showPage('overview');
        } else {
            showNotification('error', 'Signup Failed', data.detail);
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }
}

async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        showNotification('error', 'Validation Error', 'Please fill all fields');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('success', '✅ Welcome Back', `Logged in as ${username}`);

            currentUser = {
                username: data.username,
                wallet_address: data.wallet_address,
                password: password
            };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));

            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard-section').classList.add('active');
            document.getElementById('username-display').textContent = data.username;
            document.getElementById('wallet-address').textContent = data.wallet_address;

            loadPortfolio();
            loadRecentTransactions();
            startTransactionMonitoring();
            showPage('overview');
        } else {
            showNotification('error', 'Login Failed', data.detail);
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }
}

function logout() {
    stopTransactionMonitoring();
    currentUser = null;
    lastTransactionCount = 0;
    allTransactions = [];
    currentPortfolio = {};
    localStorage.removeItem('currentUser');

    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('dashboard-section').classList.remove('active');
    showNotification('info', 'Logged Out', 'You have been logged out successfully');
    showTab('login');
}

// ========== MINING ==========

async function mineBlock() {
    if (!currentUser || !currentUser.wallet_address) {
        showNotification('error', 'Mining Error', 'Please login first');
        return;
    }
    
    const mineBtn = document.getElementById('mineButton');
    
    try {
        // Show mining indicator
        if (mineBtn) {
            mineBtn.disabled = true;
            mineBtn.textContent = '⛏️ Mining...';
        }
        
        const response = await fetch(`${API_URL}/mine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ miner_address: currentUser.wallet_address })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('success', '💎 Block Mined!', `Reward: ${data.mining_reward} LKRt received.`);
            loadPortfolio(); // Refresh balance display
            loadRecentTransactions(); // Update history if necessary
        } else {
            showNotification('error', 'Mining Failed', data.detail || 'Could not mine block');
        }
    } catch (error) {
        console.error('Mining error:', error);
        showNotification('error', 'Connection Error', 'Mining server is unreachable');
    } finally {
        if (mineBtn) {
            mineBtn.disabled = false;
            mineBtn.textContent = 'Mine Block';
        }
    }
}

// ========== FAVORITE PAYEES ==========

function getFavoritePayees() {
    const key = `favorites_${currentUser.username}`;
    const favorites = localStorage.getItem(key);
    return favorites ? JSON.parse(favorites) : [];
}

function saveFavoritePayee(username, address) {
    const key = `favorites_${currentUser.username}`;
    let favorites = getFavoritePayees();

    // Check if already exists
    const exists = favorites.some(fav => fav.address === address);
    if (!exists) {
        favorites.push({ username, address });
        localStorage.setItem(key, JSON.stringify(favorites));
        showNotification('success', '⭐ Saved', `${username} added to favorites`);
    }
}

function deleteFavoritePayee(address) {
    const key = `favorites_${currentUser.username}`;
    let favorites = getFavoritePayees();
    favorites = favorites.filter(fav => fav.address !== address);
    localStorage.setItem(key, JSON.stringify(favorites));
    loadFavoritePayees();
    showNotification('info', 'Removed', 'Payee removed from favorites');
}

function selectFavoritePayee(username, address) {
    document.getElementById('receiver-address').value = address;
    fetchReceiverInfo();
    document.getElementById('transfer-amount').focus();
}

function loadFavoritePayees() {
    const favorites = getFavoritePayees();
    const container = document.getElementById('favorites-list');
    const section = document.getElementById('favorites-section');

    if (!container || !section) return;

    if (favorites.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = '';

    favorites.forEach(fav => {
        const card = document.createElement('div');
        card.className = 'favorite-card';
        card.innerHTML = `
            <div class="favorite-info">
                <div class="favorite-name">@${fav.username}</div>
                <div class="favorite-address">${fav.address.substring(0, 10)}...${fav.address.substring(fav.address.length - 6)}</div>
            </div>
            <div class="favorite-actions">
                <button class="favorite-select-btn" onclick="selectFavoritePayee('${fav.username}', '${fav.address}')">Select</button>
                <button class="favorite-delete-btn" onclick="deleteFavoritePayee('${fav.address}')">×</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ========== RECEIVER INFO LOOKUP ==========

let receiverLookupTimeout = null;

async function fetchReceiverInfo() {
    const receiverAddress = document.getElementById('receiver-address').value.trim();
    const receiverInfoDiv = document.getElementById('receiver-info');

    if (!receiverInfoDiv) return;

    // Clear previous timeout
    if (receiverLookupTimeout) {
        clearTimeout(receiverLookupTimeout);
    }

    // Reset if empty
    if (!receiverAddress) {
        receiverInfoDiv.classList.remove('show', 'success', 'error', 'loading');
        return;
    }

    // Show loading state
    receiverInfoDiv.className = 'receiver-info show loading';
    receiverInfoDiv.textContent = '🔍 Looking up recipient...';

    // Debounce the API call
    receiverLookupTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`${API_URL}/balance/${receiverAddress}`);

            if (response.ok) {
                const data = await response.json();
                receiverInfoDiv.className = 'receiver-info show success';
                receiverInfoDiv.textContent = `✅ Recipient: @${data.username}`;
            } else {
                receiverInfoDiv.className = 'receiver-info show error';
                receiverInfoDiv.textContent = '❌ Wallet address not found';
            }
        } catch (error) {
            receiverInfoDiv.className = 'receiver-info show error';
            receiverInfoDiv.textContent = '⚠️ Unable to verify address';
        }
    }, 500); // Wait 500ms after user stops typing
}

// ========== TRANSFER WITH CONFIRMATION ==========

async function initiateTransfer() {
    const receiverAddress = document.getElementById('receiver-address').value.trim();
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    const password = document.getElementById('transfer-password').value;
    const saveFavorite = document.getElementById('save-favorite').checked;

    if (!receiverAddress || !amount || amount <= 0 || !password) {
        showNotification('error', 'Validation Error', 'Please fill all fields correctly');
        return;
    }

    // Check if recipient exists
    try {
        const recipientResponse = await fetch(`${API_URL}/balance/${receiverAddress}`);
        let recipientUsername = 'Unknown User';

        if (recipientResponse.ok) {
            const recipientData = await recipientResponse.json();
            recipientUsername = recipientData.username;
        } else {
            showNotification('error', 'Invalid Address', 'Recipient wallet address not found');
            return;
        }

        // Get current balance
        const balanceResponse = await fetch(`${API_URL}/balance/${currentUser.wallet_address}`);
        const balanceData = await balanceResponse.json();
        const currentBalance = balanceData.balance_LKRt;

        if (currentBalance < amount) {
            showNotification('error', 'Insufficient Balance', `You have ${currentBalance.toFixed(2)} LKRt`);
            return;
        }

        const newBalance = currentBalance - amount;

        // Store transfer data for confirmation
        pendingTransferData = {
            receiverAddress,
            amount,
            password,
            recipientUsername,
            newBalance,
            saveFavorite
        };

        // Show confirmation modal
        document.getElementById('confirm-recipient').textContent = `@${recipientUsername} (${receiverAddress.substring(0, 10)}...${receiverAddress.substring(receiverAddress.length - 6)})`;
        document.getElementById('confirm-amount').textContent = `${amount.toFixed(2)} LKRt`;
        document.getElementById('confirm-new-balance').textContent = `${newBalance.toFixed(2)} LKRt`;

        // Show save favorite status
        if (saveFavorite) {
            document.getElementById('save-favorite-summary').style.display = 'flex';
            document.getElementById('confirm-save-favorite').textContent = '✅ Yes';
        } else {
            document.getElementById('save-favorite-summary').style.display = 'none';
        }

        document.getElementById('confirmation-modal').classList.add('show');

    } catch (error) {
        showNotification('error', 'Error', 'Could not verify recipient');
    }
}

async function confirmTransfer() {
    if (!pendingTransferData) return;

    const { receiverAddress, amount, password, recipientUsername, saveFavorite } = pendingTransferData;

    // Close modal
    closeConfirmationModal();

    try {
        const response = await fetch(`${API_URL}/transfer`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                sender_username: currentUser.username,
                receiver_address: receiverAddress,
                amount: amount,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('success', '✅ Transfer Successful', `Sent ${amount} LKRt to @${recipientUsername}`);

            // Save to favorites if checked
            if (saveFavorite) {
                saveFavoritePayee(recipientUsername, receiverAddress);
            }

            // Clear form
            document.getElementById('receiver-address').value = '';
            document.getElementById('transfer-amount').value = '';
            document.getElementById('transfer-password').value = '';
            document.getElementById('receiver-info').classList.remove('show');

            // Reload data
            loadPortfolio();
            loadRecentTransactions();

            // Show overview page
            showPage('overview');
        } else {
            showNotification('error', 'Transfer Failed', data.detail);
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }

    pendingTransferData = null;
}

function closeConfirmationModal() {
    document.getElementById('confirmation-modal').classList.remove('show');
    pendingTransferData = null;
}

// ========== PORTFOLIO ==========

async function loadPortfolio() {
    try {
        const response = await fetch(`${API_URL}/portfolio/${currentUser.username}`);
        const data = await response.json();

        if (response.ok) {
            currentPortfolio = data.portfolio;
            displayPortfolio(currentPortfolio);
            updateConversionBalances();
        }
    } catch (error) {
        console.error('Failed to load portfolio:', error);
    }
}

function displayPortfolio(portfolio) {
    const grid = document.getElementById('currency-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!portfolio || Object.keys(portfolio).length === 0) {
        grid.innerHTML = '<p class="no-transactions">No currencies in portfolio yet</p>';
        return;
    }

    for (const [currency, balance] of Object.entries(portfolio)) {
        if (balance > 0) {
            const card = document.createElement('div');
            card.className = 'currency-card';
            card.innerHTML = `
                <div class="currency-code">${currency}</div>
                <div class="currency-amount">${balance.toFixed(2)}</div>
            `;
            grid.appendChild(card);
        }
    }
}

// ========== CURRENCY CONVERSION WITH BALANCE DISPLAY ==========

async function loadSupportedCurrencies() {
    try {
        const response = await fetch(`${API_URL}/currencies`);
        const data = await response.json();
        supportedCurrencies = ['LKRt', ...data.currencies];
        populateCurrencyDropdowns();
    } catch (error) {
        console.error('Failed to load currencies:', error);
    }
}

function populateCurrencyDropdowns() {
    const fromSelect = document.getElementById('from-currency');
    const toSelect = document.getElementById('to-currency');

    if (!fromSelect || !toSelect) return;

    fromSelect.innerHTML = supportedCurrencies.map(curr => 
        `<option value="${curr}">${curr}</option>`
    ).join('');

    toSelect.innerHTML = supportedCurrencies.map(curr => 
        `<option value="${curr}">${curr}</option>`
    ).join('');

    toSelect.selectedIndex = 1;
}

function updateConversionBalances() {
    // Update the overview balance grid
    const balancesContainer = document.getElementById('conversion-balances');
    if (balancesContainer && currentPortfolio) {
        balancesContainer.innerHTML = '';

        if (Object.keys(currentPortfolio).length === 0) {
            balancesContainer.innerHTML = '<p class="no-favorites">No currency balances available</p>';
            return;
        }

        for (const [currency, balance] of Object.entries(currentPortfolio)) {
            if (balance > 0) {
                const chip = document.createElement('div');
                chip.className = 'balance-chip';
                chip.innerHTML = `
                    <div class="balance-chip-currency">${currency}</div>
                    <div class="balance-chip-amount">${balance.toFixed(2)}</div>
                `;
                balancesContainer.appendChild(chip);
            }
        }
    }

    // Update selected currency balances
    const fromCurrency = document.getElementById('from-currency')?.value;
    const toCurrency = document.getElementById('to-currency')?.value;

    if (fromCurrency && currentPortfolio) {
        const fromBalance = currentPortfolio[fromCurrency] || 0;
        const fromDisplay = document.getElementById('from-balance-display');
        if (fromDisplay) {
            fromDisplay.textContent = `Available: ${fromBalance.toFixed(2)} ${fromCurrency}`;
            fromDisplay.className = 'balance-display show available';
        }
    }

    if (toCurrency && currentPortfolio) {
        const toBalance = currentPortfolio[toCurrency] || 0;
        const toDisplay = document.getElementById('to-balance-display');
        if (toDisplay) {
            toDisplay.textContent = `Current: ${toBalance.toFixed(2)} ${toCurrency}`;
            toDisplay.className = 'balance-display show';
        }
    }
}

async function convertCurrency() {
    const fromCurrency = document.getElementById('from-currency').value;
    const toCurrency = document.getElementById('to-currency').value;
    const amount = parseFloat(document.getElementById('convert-amount').value);

    if (!amount || amount <= 0) {
        showNotification('error', 'Validation Error', 'Please enter a valid amount');
        return;
    }

    if (fromCurrency === toCurrency) {
        showNotification('error', 'Validation Error', 'Cannot convert currency to itself');
        return;
    }

    // Check if sufficient balance
    const availableBalance = currentPortfolio[fromCurrency] || 0;
    if (availableBalance < amount) {
        showNotification('error', 'Insufficient Balance', `You only have ${availableBalance.toFixed(2)} ${fromCurrency}`);
        return;
    }

    try {
        const response = await fetch(`${API_URL}/convert`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                username: currentUser.username,
                from_currency: fromCurrency,
                to_currency: toCurrency,
                amount: amount
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('success', '✅ Conversion Successful', 
                `Converted: ${data.amount_converted} ${data.from_currency}\nReceived: ${data.amount_received.toFixed(2)} ${data.to_currency}`);

            document.getElementById('convert-amount').value = '';
            loadPortfolio();
            showPage('overview');
        } else {
            showNotification('error', 'Conversion Failed', data.detail);
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }
}

// ========== TRANSACTIONS ==========

async function loadTransactionHistory() {
    try {
        const response = await fetch(`${API_URL}/transactions/${currentUser.wallet_address}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Failed to load transactions');
        }

        const transactions = data.transactions || [];
        lastTransactionCount = transactions.length;

        if (transactions.length === 0) {
            const container = document.getElementById('transaction-list');
            if (container) container.innerHTML = '<p class="no-transactions">No transactions yet</p>';
            return;
        }

        await processAndDisplayTransactions(transactions);
    } catch (error) {
        console.error('Failed to load transaction history:', error);
    }
}

async function loadRecentTransactions() {
    try {
        const response = await fetch(`${API_URL}/transactions/${currentUser.wallet_address}`);
        const data = await response.json();

        if (!response.ok) return;

        const transactions = data.transactions || [];
        const recent = transactions.slice(-5).reverse(); // Last 5 transactions

        await processAndDisplayTransactions(recent, 'recent-transaction-list');
    } catch (error) {
        console.error('Failed to load recent transactions:', error);
    }
}

async function processAndDisplayTransactions(transactions, containerId = 'transaction-list') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (transactions.length === 0) {
        container.innerHTML = '<p class="no-transactions">No transactions yet</p>';
        return;
    }

    // Get unique addresses for username lookup
    const addressSet = new Set();
    transactions.forEach(tx => {
        if (tx.fromaddress && tx.fromaddress !== 'SYSTEM') addressSet.add(tx.fromaddress);
        if (tx.toaddress) addressSet.add(tx.toaddress);
    });

    // Fetch usernames
    const addressToUsername = {};
    await Promise.all(
        Array.from(addressSet).map(async (address) => {
            try {
                const response = await fetch(`${API_URL}/balance/${address}`);
                if (response.ok) {
                    const data = await response.json();
                    addressToUsername[address] = data.username;
                }
            } catch (error) {
                addressToUsername[address] = 'Unknown';
            }
        })
    );

    // Display transactions
    container.innerHTML = '';

    transactions.forEach(tx => {
        const isReceived = tx.toaddress === currentUser.wallet_address;
        const isSent = tx.fromaddress === currentUser.wallet_address;
        const isSystem = tx.fromaddress === 'SYSTEM';

        let txType, txClass, details;

        if (isSystem) {
            txType = '🎁 System Reward';
            txClass = 'received';
            details = 'Initial/Mining Credit';
        } else if (isReceived) {
            txType = '📥 Received';
            txClass = 'received';
            details = `From: @${addressToUsername[tx.fromaddress] || 'Unknown'}`;
        } else if (isSent) {
            txType = '📤 Sent';
            txClass = 'sent';
            details = `To: @${addressToUsername[tx.toaddress] || 'Unknown'}`;
        } else {
            txType = '❓ Unknown';
            txClass = '';
            details = 'Transaction type unknown';
        }

        const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString() : 'Unknown time';
        const amountDisplay = tx.amount > 0 ? `${tx.amount.toFixed(2)} LKRt` : 'N/A';

        const txElement = document.createElement('div');
        txElement.className = `transaction-item ${txClass}`;
        txElement.innerHTML = `
            <div class="transaction-header">
                <span class="transaction-type">${txType}</span>
                <span class="transaction-amount">${amountDisplay}</span>
            </div>
            <div class="transaction-details">${details}</div>
            <div class="transaction-time">${timestamp}</div>
        `;

        container.appendChild(txElement);
    });
}

// ========== TRANSACTION MONITORING ==========

function startTransactionMonitoring() {
    stopTransactionMonitoring();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!document.hidden) {
        startPolling();
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        stopPolling();
    } else if (currentUser) {
        startPolling();
    }
}

function startPolling() {
    if (!transactionCheckInterval && currentUser) {
        transactionCheckInterval = setInterval(async () => {
            if (currentUser) {
                await checkForNewTransactions();
            }
        }, 10000); // 10 seconds
    }
}

function stopPolling() {
    if (transactionCheckInterval) {
        clearInterval(transactionCheckInterval);
        transactionCheckInterval = null;
    }
}

function stopTransactionMonitoring() {
    stopPolling();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
}

async function checkForNewTransactions() {
    try {
        const response = await fetch(`${API_URL}/transactions/${currentUser.wallet_address}`);
        const data = await response.json();

        if (response.ok) {
            const currentCount = data.transactions ? data.transactions.length : 0;

            if (lastTransactionCount > 0 && currentCount > lastTransactionCount) {
                const latestTx = data.transactions[data.transactions.length - 1];

                if (latestTx.toaddress === currentUser.wallet_address && 
                    latestTx.fromaddress !== 'SYSTEM' && 
                    latestTx.fromaddress !== currentUser.wallet_address) {

                    try {
                        const senderResponse = await fetch(`${API_URL}/balance/${latestTx.fromaddress}`);
                        const senderData = await senderResponse.json();
                        const senderUsername = senderData.username || 'Unknown User';

                        showNotification('success', '💰 Payment Received!', 
                            `You received ${latestTx.amount} LKRt from @${senderUsername}`);
                    } catch {
                        showNotification('success', '💰 Payment Received!', 
                            `You received ${latestTx.amount} LKRt`);
                    }

                    loadPortfolio();
                    loadRecentTransactions();
                }
            }

            lastTransactionCount = currentCount;
        }
    } catch (error) {
        console.error('Error checking transactions:', error);
    }
}

// ========== UTILITY FUNCTIONS ==========

async function copyAddress() {
    const addressEl = document.getElementById('wallet-address');
    if (!addressEl) return;
    
    const address = addressEl.textContent;
    const copyBtn = document.querySelector('.copy-btn');

    try {
        await navigator.clipboard.writeText(address);
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✓ Copied!';
            copyBtn.classList.add('copied');
            showNotification('success', 'Address Copied', 'Wallet address copied to clipboard');

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.classList.remove('copied');
            }, 2000);
        }
    } catch (error) {
        showNotification('error', 'Copy Failed', 'Failed to copy address to clipboard');
    }
}

function showNotification(type, title, message) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    notification.innerHTML = `
        <div class="notification-header">
            <span class="notification-title">${title}</span>
            <button class="notification-close" onclick="this.closest('.notification').remove()">×</button>
        </div>
        <div class="notification-body">${message}</div>
    `;

    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('closing');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}