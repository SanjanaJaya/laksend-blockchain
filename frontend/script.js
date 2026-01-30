const API_URL = 'http://localhost:8000';
let currentUser = null;
let supportedCurrencies = [];

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

// Show message function
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
        showMessage('Please fill all fields', 'error');
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
            showMessage(`Account created! Private Key: ${data.private_key.substring(0, 20)}... (SAVE THIS!)`, 'success');
            
            // Clear form
            document.getElementById('signup-username').value = '';
            document.getElementById('signup-password').value = '';
            document.getElementById('initial-balance').value = '1000';
            
            setTimeout(() => showTab('login'), 3000);
        } else {
            showMessage(data.detail || 'Signup failed', 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    }
}

// Login
async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showMessage('Please fill all fields', 'error');
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
            
            showMessage('Login successful!', 'success');
            
            // Clear login form
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
            
            showDashboard(data);
        } else {
            showMessage(data.detail || 'Login failed', 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    }
}

// Show dashboard
function showDashboard(userData) {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    
    document.getElementById('username-display').textContent = userData.username;
    document.getElementById('wallet-address').textContent = userData.wallet_address;
    
    loadPortfolio();
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
        showMessage('Failed to load portfolio', 'error');
        console.error('Portfolio load error:', error);
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
        showMessage('Please fill all conversion fields', 'error');
        return;
    }
    
    if (amount <= 0) {
        showMessage('Amount must be positive', 'error');
        return;
    }
    
    if (fromCurrency === toCurrency) {
        showMessage('Cannot convert currency to itself', 'error');
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
            showMessage('Conversion successful!', 'success');
            
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
            
            // Reload portfolio
            loadPortfolio();
            
        } else {
            showMessage(data.detail || 'Conversion failed', 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    }
}

// Transfer LKRt
async function transfer() {
    const receiverAddress = document.getElementById('receiver-address').value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    const password = document.getElementById('transfer-password').value;
    
    if (!receiverAddress || !amount || !password) {
        showMessage('Please fill all fields', 'error');
        return;
    }
    
    if (amount <= 0) {
        showMessage('Amount must be positive', 'error');
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
            showMessage(`Transfer successful! New balance: ${data.new_balance} LKRt`, 'success');
            
            // Clear inputs
            document.getElementById('receiver-address').value = '';
            document.getElementById('transfer-amount').value = '';
            document.getElementById('transfer-password').value = '';
            
            // Reload portfolio
            loadPortfolio();
        } else {
            showMessage(data.detail || 'Transfer failed', 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    }
}

// Logout
function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('dashboard-section').style.display = 'none';
    
    // Clear all input fields
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    
    showMessage('Logged out successfully', 'success');
    showTab('login');
}
