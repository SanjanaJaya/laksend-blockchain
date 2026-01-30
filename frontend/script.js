const API_URL = 'http://localhost:8000';
let currentUser = null;
let supportedCurrencies = [];
let lastTransactionCount = 0;
let transactionCheckInterval = null;

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
            
            // Verify session is still valid by fetching user info
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
            
            // Restore currentUser with stored data
            const storedUser = JSON.parse(localStorage.getItem('currentUser'));
            currentUser = {
                username: storedUser.username,
                wallet_address: storedUser.wallet_address,
                password: storedUser.password || null
            };
            
            // Session is valid, restore dashboard without showing auth section
            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('dashboard-section').style.display = 'block';
            
            document.getElementById('username-display').textContent = data.username;
            document.getElementById('wallet-address').textContent = data.wallet_address;
            
            loadPortfolio();
            loadTransactionHistory();
            startTransactionMonitoring();
        } else {
            // Session invalid, clear storage
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
    // Check every 5 seconds for new transactions
    transactionCheckInterval = setInterval(async () => {
        if (currentUser) {
            await checkForNewTransactions();
        }
    }, 5000);
}

// Stop transaction monitoring
function stopTransactionMonitoring() {
    if (transactionCheckInterval) {
        clearInterval(transactionCheckInterval);
        transactionCheckInterval = null;
    }
}

// Check for new transactions
async function checkForNewTransactions() {
    try {
        const response = await fetch(`${API_URL}/transactions/${currentUser.wallet_address}`);
        const data = await response.json();
        
        if (response.ok) {
            const currentCount = data.transaction_count;
            
            // If we have a new transaction
            if (lastTransactionCount > 0 && currentCount > lastTransactionCount) {
                // Get the latest transaction
                const latestTx = data.transactions[data.transactions.length - 1];
                
                // Check if it's a received transaction
                if (latestTx.to_address === currentUser.wallet_address && 
                    latestTx.from_address !== 'SYSTEM' &&
                    latestTx.from_address !== currentUser.wallet_address) {
                    
                    // Get sender username
                    const senderInfo = await getSenderInfo(latestTx.from_address);
                    const senderUsername = senderInfo ? senderInfo.username : 'Unknown User';
                    
                    // Show notification
                    showNotification(
                        'success',
                        '💰 Payment Received!',
                        `You received ${latestTx.amount} LKRt from ${senderUsername}`
                    );
                    
                    // Reload portfolio to show updated balance
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

// Get sender information
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

// Copy wallet address to clipboard
async function copyAddress() {
    const address = document.getElementById('wallet-address').textContent;
    const copyBtn = document.querySelector('.copy-btn');
    
    try {
        await navigator.clipboard.writeText(address);
        
        // Change button text temporarily
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

// Show popup notification
function showNotification(type, title, message) {
    const container = document.getElementById('notification-container');
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
        <div class="notification-header">
            <span class="notification-title">${title}</span>
            <button class="notification-close" onclick="closeNotification(this)">×</button>
        </div>
        <div class="notification-body">${message}</div>
    `;
    
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            closeNotification(notification.querySelector('.notification-close'));
        }
    }, 5000);
}

// Close notification
function closeNotification(button) {
    const notification = button.closest('.notification');
    notification.classList.add('closing');
    
    setTimeout(() => {
        notification.remove();
    }, 300);
}

// Load supported currencies from backend
async function loadSupportedCurrencies() {
    try {
        const response = await fetch(`${API_URL}/currencies`);
        const data = await response.json();
        supportedCurrencies = data.currencies;
        populateCurrencyDropdowns();
    } catch (error) {
        console.error('Failed to load currencies:', error);
        supportedCurrencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "INR", "SGD"];
        populateCurrencyDropdowns();
    }
}

// Populate currency dropdowns
function populateCurrencyDropdowns() {
    const fromSelect = document.getElementById('from-currency');
    const toSelect = document.getElementById('to-currency');
    
    if (!fromSelect || !toSelect) return;
    
    // Clear existing options (except LKRt for from)
    toSelect.innerHTML = '<option value="">Select currency...</option>';
    
    // Add currencies to both dropdowns
    supportedCurrencies.forEach(currency => {
        const option1 = document.createElement('option');
        option1.value = currency;
        option1.textContent = currency;
        fromSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = currency;
        option2.textContent = currency;
        toSelect.appendChild(option2);
    });
    
    // Add LKRt to "to" dropdown
    const lkrtOption = document.createElement('option');
    lkrtOption.value = 'LKRt';
    lkrtOption.textContent = 'LKRt';
    toSelect.appendChild(lkrtOption);
}

// Show message function (legacy - kept for compatibility)
function showMessage(message, type = 'success') {
    const messageBox = document.getElementById('message-box');
    messageBox.textContent = message;
    messageBox.className = type;
    messageBox.style.display = 'block';
    setTimeout(() => {
        messageBox.style.display = 'none';
    }, 5000);
}

// Tab switching
function showTab(tab) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'login') {
        loginForm.style.display = 'flex';
        signupForm.style.display = 'none';
        tabBtns[0].classList.add('active');
    } else {
        loginForm.style.display = 'none';
        signupForm.style.display = 'flex';
        tabBtns[1].classList.add('active');
    }
}

// Signup
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
            showNotification('success', 'Account Created', `Private Key: ${data.private_key.substring(0, 30)}... (SAVE THIS!)`);
            
            // Clear form
            document.getElementById('signup-username').value = '';
            document.getElementById('signup-password').value = '';
            document.getElementById('initial-balance').value = '1000';
            
            setTimeout(() => showTab('login'), 3000);
        } else {
            showNotification('error', 'Signup Failed', data.detail || 'Could not create account');
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }
}

// Login
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
            body: JSON.stringify({
                username: username,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = {
                username: data.username,
                wallet_address: data.wallet_address,
                password: password
            };
            
            // Store session in localStorage (including password for transfers)
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            showNotification('success', 'Login Successful', `Welcome back, ${data.username}!`);
            
            // Clear login form
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
            
            showDashboard(data);
            startTransactionMonitoring();
        } else {
            showNotification('error', 'Login Failed', data.detail || 'Invalid credentials');
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }
}

// Show dashboard
function showDashboard(userData) {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    
    document.getElementById('username-display').textContent = userData.username;
    document.getElementById('wallet-address').textContent = userData.wallet_address;
    
    loadPortfolio();
    loadTransactionHistory();
}

// Load user portfolio
async function loadPortfolio() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_URL}/portfolio/${currentUser.username}`);
        const data = await response.json();
        
        const portfolioGrid = document.getElementById('portfolio-grid');
        portfolioGrid.innerHTML = '';
        
        const portfolio = data.portfolio;
        
        // Check if portfolio is empty
        const hasBalance = Object.values(portfolio).some(balance => balance > 0);
        
        if (!hasBalance) {
            portfolioGrid.innerHTML = '<p style="text-align: center; color: #999; grid-column: 1/-1;">No currencies in portfolio yet</p>';
        } else {
            // Display each currency with balance > 0
            for (const [currency, balance] of Object.entries(portfolio)) {
                if (balance > 0) {
                    const card = document.createElement('div');
                    card.className = 'currency-card';
                    card.innerHTML = `
                        <div class="currency-code">${currency}</div>
                        <div class="currency-amount">${balance.toFixed(2)}</div>
                    `;
                    portfolioGrid.appendChild(card);
                }
            }
        }
        
        // Update from-currency dropdown to show only owned currencies
        updateFromCurrencyDropdown(portfolio);
        
    } catch (error) {
        showNotification('error', 'Load Error', 'Failed to load portfolio');
        console.error('Portfolio load error:', error);
    }
}

// Load transaction history
async function loadTransactionHistory() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_URL}/transactions/${currentUser.wallet_address}`);
        const data = await response.json();
        
        const transactionList = document.getElementById('transaction-list');
        transactionList.innerHTML = '';
        
        if (data.transaction_count === 0) {
            transactionList.innerHTML = '<div class="no-transactions">No transactions yet</div>';
            lastTransactionCount = 0;
            return;
        }
        
        // Store transaction count
        lastTransactionCount = data.transaction_count;
        
        // Get recent 5 transactions (reversed to show newest first)
        const recentTransactions = data.transactions.slice(-5).reverse();
        
        for (const tx of recentTransactions) {
            const isSent = tx.from_address === currentUser.wallet_address;
            const isReceived = tx.to_address === currentUser.wallet_address;
            const isConversion = tx.type === 'CONVERSION';
            
            let txType = '';
            let txClass = '';
            let amountDisplay = '';
            let details = '';
            
            if (isConversion) {
                txType = '💱 Currency Conversion';
                txClass = 'conversion';
                amountDisplay = `${tx.amount_converted} ${tx.from_currency} → ${tx.amount_received} ${tx.to_currency}`;
                details = `Exchange Rate: 1 ${tx.from_currency} = ${tx.exchange_rate?.toFixed(4)} ${tx.to_currency}`;
            } else if (isSent) {
                txType = '📤 Sent';
                txClass = 'sent';
                amountDisplay = `- ${tx.amount} LKRt`;
                
                // Get receiver info
                const receiverInfo = await getSenderInfo(tx.to_address);
                const receiverName = receiverInfo ? receiverInfo.username : 'Unknown';
                details = `To: ${receiverName} (${tx.to_address.substring(0, 10)}...)`;
            } else if (isReceived) {
                txType = '📥 Received';
                txClass = 'received';
                amountDisplay = `+ ${tx.amount} LKRt`;
                
                // Get sender info
                if (tx.from_address === 'SYSTEM') {
                    details = 'From: System (Initial Balance)';
                } else {
                    const senderInfo = await getSenderInfo(tx.from_address);
                    const senderName = senderInfo ? senderInfo.username : 'Unknown';
                    details = `From: ${senderName} (${tx.from_address.substring(0, 10)}...)`;
                }
            }
            
            const timestamp = new Date(tx.timestamp * 1000).toLocaleString();
            
            const txItem = document.createElement('div');
            txItem.className = `transaction-item ${txClass}`;
            txItem.innerHTML = `
                <div class="transaction-header">
                    <span class="transaction-type">${txType}</span>
                    <span class="transaction-amount">${amountDisplay}</span>
                </div>
                <div class="transaction-details">${details}</div>
                <div class="transaction-time">${timestamp}</div>
            `;
            
            transactionList.appendChild(txItem);
        }
        
    } catch (error) {
        showNotification('error', 'Load Error', 'Failed to load transaction history');
        console.error('Transaction history error:', error);
    }
}

// Update from-currency dropdown based on owned currencies
function updateFromCurrencyDropdown(portfolio) {
    const fromSelect = document.getElementById('from-currency');
    if (!fromSelect) return;
    
    fromSelect.innerHTML = '';
    
    // Add currencies that user owns
    let hasOptions = false;
    for (const [currency, balance] of Object.entries(portfolio)) {
        if (balance > 0) {
            hasOptions = true;
            const option = document.createElement('option');
            option.value = currency;
            option.textContent = `${currency} (${balance.toFixed(2)})`;
            fromSelect.appendChild(option);
        }
    }
    
    // If no currencies owned, show placeholder
    if (!hasOptions) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No currencies available';
        option.disabled = true;
        fromSelect.appendChild(option);
    }
}

// Convert Currency
async function convertCurrency() {
    const fromCurrency = document.getElementById('from-currency').value;
    const toCurrency = document.getElementById('to-currency').value;
    const amount = parseFloat(document.getElementById('convert-amount').value);
    
    if (!fromCurrency || !toCurrency || !amount) {
        showNotification('error', 'Validation Error', 'Please fill all conversion fields');
        return;
    }
    
    if (amount <= 0) {
        showNotification('error', 'Validation Error', 'Amount must be positive');
        return;
    }
    
    if (fromCurrency === toCurrency) {
        showNotification('error', 'Validation Error', 'Cannot convert currency to itself');
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
            showNotification('success', '💱 Conversion Successful', 
                `Converted ${data.amount_converted} ${data.from_currency} to ${data.amount_received} ${data.to_currency}`);
            
            const resultDiv = document.getElementById('conversion-result');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <h4 style="color: #667eea; margin-bottom: 10px;">✅ Conversion Complete</h4>
                <p><strong>Converted:</strong> ${data.amount_converted} ${data.from_currency}</p>
                <p><strong>Received:</strong> ${data.amount_received} ${data.to_currency}</p>
                <p><strong>Exchange Rate:</strong> 1 ${data.from_currency} = ${data.exchange_rate.toFixed(4)} ${data.to_currency}</p>
                <p><strong>New ${data.from_currency} Balance:</strong> ${data.from_balance.toFixed(2)}</p>
                <p><strong>New ${data.to_currency} Balance:</strong> ${data.to_balance.toFixed(2)}</p>
            `;
            
            // Clear input
            document.getElementById('convert-amount').value = '';
            
            // Reload portfolio and transaction history
            loadPortfolio();
            loadTransactionHistory();
            
        } else {
            showNotification('error', 'Conversion Failed', data.detail || 'Could not convert currency');
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }
}

// Transfer LKRt
async function transfer() {
    const receiverAddress = document.getElementById('receiver-address').value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    const password = document.getElementById('transfer-password').value;
    
    if (!receiverAddress || !amount || !password) {
        showNotification('error', 'Validation Error', 'Please fill all fields');
        return;
    }
    
    if (amount <= 0) {
        showNotification('error', 'Validation Error', 'Amount must be positive');
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
            // Get receiver info
            const receiverInfo = await getSenderInfo(receiverAddress);
            const receiverName = receiverInfo ? receiverInfo.username : 'Unknown User';
            
            showNotification('success', '✅ Transfer Successful', 
                `Sent ${amount} LKRt to ${receiverName}. New balance: ${data.new_balance} LKRt`);
            
            // Clear inputs
            document.getElementById('receiver-address').value = '';
            document.getElementById('transfer-amount').value = '';
            document.getElementById('transfer-password').value = '';
            
            // Reload portfolio and transaction history
            loadPortfolio();
            loadTransactionHistory();
        } else {
            showNotification('error', 'Transfer Failed', data.detail || 'Could not complete transfer');
        }
    } catch (error) {
        showNotification('error', 'Connection Error', 'Could not connect to server');
    }
}

// Logout
function logout() {
    stopTransactionMonitoring();
    currentUser = null;
    lastTransactionCount = 0;
    localStorage.removeItem('currentUser');
    
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('dashboard-section').style.display = 'none';
    
    // Clear all input fields
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    
    showNotification('info', 'Logged Out', 'You have been logged out successfully');
    showTab('login');
}
