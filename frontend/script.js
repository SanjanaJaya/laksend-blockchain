const API_URL = 'http://localhost:8000';
let currentUser = null;
let supportedCurrencies = [];
let lastTransactionCount = 0;
let transactionCheckInterval = null;
let allTransactions = []; // Store all transactions globally
let showingAllTransactions = false; // Track current view state

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadSupportedCurrencies();
    checkStoredSession();
});

// Check for stored session on page load
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

// Verify and restore user session
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
            document.getElementById('dashboard-section').style.display = 'block';
            document.getElementById('username-display').textContent = data.username;
            document.getElementById('wallet-address').textContent = data.wallet_address;
            loadPortfolio();
            loadTransactionHistory();
            startTransactionMonitoring();
        } else {
            localStorage.removeItem('currentUser');
            currentUser = null;
            document.getElementById('auth-section').style.display = 'block';
            document.getElementById('dashboard-section').style.display = 'none';
        }
    } catch (error) {
        console.error('Session verification failed:', error);
        localStorage.removeItem('currentUser');
        currentUser = null;
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('dashboard-section').style.display = 'none';
    }
}

// Start monitoring for new transactions
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

// Check for new transactions
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
                    
                    const senderInfo = await getSenderInfo(latestTx.fromaddress);
                    const senderUsername = senderInfo ? senderInfo.username : 'Unknown User';
                    
                    showNotification(
                        'success',
                        '💰 Payment Received!',
                        `You received ${latestTx.amount} LKRt from ${senderUsername}`
                    );
                    
                    loadPortfolio();
                    loadTransactionHistory();
                }
            }
            lastTransactionCount = currentCount;
        }
    } catch (error) {
        console.error('Error checking transactions:', error);
    }
}

async function getSenderInfo(walletAddress) {
    try {
        const response = await fetch(`${API_URL}/balance/${walletAddress}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Error fetching sender info:', error);
    }
    return null;
}

async function copyAddress() {
    const address = document.getElementById('wallet-address').textContent;
    const copyBtn = document.querySelector('.copy-btn');
    
    try {
        await navigator.clipboard.writeText(address);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied!';
        copyBtn.classList.add('copied');
        showNotification('success', 'Address Copied', 'Wallet address copied to clipboard');
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch (error) {
        showNotification('error', 'Copy Failed', 'Failed to copy address to clipboard');
    }
}

function showNotification(type, title, message) {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-title">${title}</div>
        <div class="notification-message">${message}</div>
    `;
    
    container.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

function showTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[onclick="showTab('${tab}')"]`).classList.add('active');
    document.getElementById(`${tab}-tab`).classList.add('active');
}

async function loadSupportedCurrencies() {
    try {
        const response = await fetch(`${API_URL}/currencies`);
        const data = await response.json();
        supportedCurrencies = data.currencies;
        
        const fromSelect = document.getElementById('from-currency');
        const toSelect = document.getElementById('to-currency');
        
        fromSelect.innerHTML = '<option value="LKRt">LKRt</option>';
        toSelect.innerHTML = '<option value="LKRt">LKRt</option>';
        
        supportedCurrencies.forEach(currency => {
            fromSelect.innerHTML += `<option value="${currency}">${currency}</option>`;
            toSelect.innerHTML += `<option value="${currency}">${currency}</option>`;
        });
    } catch (error) {
        console.error('Failed to load currencies:', error);
    }
}

async function signup() {
    const username = document.getElementById('signup-username').value;
    const password = document.getElementById('signup-password').value;
    
    if (!username || !password) {
        showNotification('error', 'Validation Error', 'Please fill all fields');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/signup`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('success', '✅ Account Created', 
                `Welcome ${username}! Wallet: ${data.wallet_address.substring(0, 10)}...`);
            document.getElementById('signup-username').value = '';
            document.getElementById('signup-password').value = '';
            showTab('login');
        } else {
            showNotification('error', 'Signup Failed', data.detail || 'Could not create account');
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
            body: JSON.stringify({username, password})
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = {
                username: data.username,
                wallet_address: data.wallet_address,
                password: password
            };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard-section').style.display = 'block';
            document.getElementById('username-display').textContent = data.username;
            document.getElementById('wallet-address').textContent = data.wallet_address;
            
            showNotification('success', '✅ Login Successful', `Welcome back, ${username}!`);
            loadPortfolio();
            loadTransactionHistory();
            startTransactionMonitoring();
        } else {
            showNotification('error', 'Login Failed', data.detail || 'Invalid credentials');
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }
}

async function loadPortfolio() {
    try {
        const response = await fetch(`${API_URL}/portfolio/${currentUser.username}`);
        const data = await response.json();
        const portfolioGrid = document.getElementById('portfolio-grid');
        portfolioGrid.innerHTML = '';
        
        const portfolio = data.portfolio;
        if (!portfolio || Object.keys(portfolio).length === 0) {
            portfolioGrid.innerHTML = '<p class="no-data">No currencies in portfolio yet</p>';
        } else {
            for (const [currency, balance] of Object.entries(portfolio)) {
                if (balance > 0) {
                    const card = document.createElement('div');
                    card.className = 'currency-card';
                    card.innerHTML = `
                        <div class="currency-symbol">${currency}</div>
                        <div class="currency-name">${getCurrencyName(currency)}</div>
                        <div class="currency-balance">${balance.toFixed(2)}</div>
                    `;
                    portfolioGrid.appendChild(card);
                }
            }
        }
    } catch (error) {
        console.error('Failed to load portfolio:', error);
    }
}

function getCurrencyName(code) {
    const names = {
        'LKRt': 'Lankan Rupee Token', 'USD': 'US Dollar', 'EUR': 'Euro', 'GBP': 'British Pound',
        'JPY': 'Japanese Yen', 'AUD': 'Australian Dollar', 'CAD': 'Canadian Dollar',
        'CHF': 'Swiss Franc', 'CNY': 'Chinese Yuan', 'INR': 'Indian Rupee', 'SGD': 'Singapore Dollar'
    };
    return names[code] || code;
}

function toggleTransactionView() {
    showingAllTransactions = !showingAllTransactions;
    displayTransactions(allTransactions);
}

// UPDATED: Display transactions based on current view state
function displayTransactions(transactions) {
    const historyContainer = document.getElementById('transaction-list');
    historyContainer.innerHTML = '';
    
    if (transactions.length === 0) {
        historyContainer.innerHTML = '<p class="no-data">No transactions yet</p>';
        return;
    }
    
    const displayCount = showingAllTransactions ? transactions.length : Math.min(5, transactions.length);
    const transactionsToDisplay = transactions.slice(0, displayCount);
    
    transactionsToDisplay.forEach((txData) => {
        const txElement = document.createElement('div');
        txElement.className = `transaction-item ${txData.txClass}`;
        txElement.innerHTML = `
            <div class="tx-details">
                <div class="tx-type">${txData.txType}</div>
                <div class="tx-address">${txData.details}</div>
                <div class="tx-time">${txData.timestamp}</div>
            </div>
            <div class="tx-amount ${txData.txClass}">${txData.amountDisplay}</div>
        `;
        historyContainer.appendChild(txElement);
    });
    
    if (transactions.length > 5) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.textAlign = 'center';
        buttonContainer.style.marginTop = '15px';
        
        const toggleButton = document.createElement('button');
        toggleButton.className = 'see-all-btn';
        toggleButton.textContent = showingAllTransactions ? 
            `Show Less ▲` : 
            `See All Transactions (${transactions.length}) ▼`;
        toggleButton.onclick = toggleTransactionView;
        
        buttonContainer.appendChild(toggleButton);
        historyContainer.appendChild(buttonContainer);
    }
}

async function loadTransactionHistory() {
    try {
        const response = await fetch(`${API_URL}/transactions/${currentUser.wallet_address}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        const historyContainer = document.getElementById('transaction-list');
        if (!historyContainer) return;
        
        const transactions = data.transactions || [];
        if (transactions.length === 0) {
            historyContainer.innerHTML = '<p class="no-data">No transactions yet</p>';
            allTransactions = [];
            return;
        }
        
        const uniqueTransactions = [];
        const seenSignatures = new Set();
        for (const tx of transactions) {
            const txKey = `${tx.fromaddress}-${tx.toaddress}-${tx.amount}-${tx.timestamp}`;
            if (!seenSignatures.has(txKey)) {
                seenSignatures.add(txKey);
                uniqueTransactions.push(tx);
            }
        }
        
        const sortedTransactions = uniqueTransactions.sort((a, b) => b.timestamp - a.timestamp);
        const addressSet = new Set();
        sortedTransactions.forEach(tx => {
            if (tx.fromaddress && tx.fromaddress !== 'SYSTEM') addressSet.add(tx.fromaddress);
            if (tx.toaddress) addressSet.add(tx.toaddress);
        });
        
        const addressToUsername = {};
        await Promise.all(
            Array.from(addressSet).map(async (address) => {
                const userInfo = await getSenderInfo(address);
                addressToUsername[address] = userInfo ? userInfo.username : 'Unknown';
            })
        );
        
        allTransactions = sortedTransactions.map((tx) => {
            const isReceived = tx.toaddress === currentUser.wallet_address;
            const isSent = tx.fromaddress === currentUser.wallet_address;
            const isSystem = tx.fromaddress === 'SYSTEM';
            
            let txType, txClass, details;
            if (isSystem) {
                txType = '🎁 Initial Balance'; txClass = 'received'; details = 'System Credit';
            } else if (isReceived) {
                txType = '📥 Received'; txClass = 'received';
                details = `From: ${addressToUsername[tx.fromaddress] || 'Unknown'}`;
            } else if (isSent) {
                txType = '📤 Sent'; txClass = 'sent';
                details = `To: ${addressToUsername[tx.toaddress] || 'Unknown'}`;
            } else {
                txType = '❓ Unknown'; txClass = ''; details = 'Transaction type unknown';
            }
            
            const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString() : 'Unknown time';
            return {
                txType, txClass, details, timestamp,
                amountDisplay: tx.amount > 0 ? `${tx.amount.toFixed(2)} LKRt` : 'N/A'
            };
        });
        
        showingAllTransactions = false;
        displayTransactions(allTransactions);
    } catch (error) {
        console.error('❌ Failed to load transaction history:', error);
    }
}

async function convertCurrency() {
    const fromCurrency = document.getElementById('from-currency').value;
    const toCurrency = document.getElementById('to-currency').value;
    const amount = parseFloat(document.getElementById('convert-amount').value);
    
    if (!amount || amount <= 0 || fromCurrency === toCurrency) {
        showNotification('error', 'Validation Error', 'Invalid amount or same currency');
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
                `Converted: ${data.amount_converted} ${data.from_currency}\nReceived: ${data.amount_received} ${data.to_currency}`);
            document.getElementById('convert-amount').value = '';
            loadPortfolio();
            loadTransactionHistory();
        } else {
            showNotification('error', 'Conversion Failed', data.detail);
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }
}

async function transfer() {
    const receiverAddress = document.getElementById('receiver-address').value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    const password = document.getElementById('transfer-password').value;
    
    if (!receiverAddress || !amount || amount <= 0 || !password) {
        showNotification('error', 'Validation Error', 'Please fill all fields correctly');
        return;
    }
    
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
            const receiverInfo = await getSenderInfo(receiverAddress);
            showNotification('success', '✅ Transfer Successful', `Sent ${amount} LKRt to ${receiverInfo?.username || 'User'}`);
            document.getElementById('receiver-address').value = '';
            document.getElementById('transfer-amount').value = '';
            document.getElementById('transfer-password').value = '';
            loadPortfolio();
            loadTransactionHistory();
        } else {
            showNotification('error', 'Transfer Failed', data.detail);
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
    showingAllTransactions = false;
    localStorage.removeItem('currentUser');
    
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('dashboard-section').style.display = 'none';
    showNotification('info', 'Logged Out', 'You have been logged out successfully');
    showTab('login');
}