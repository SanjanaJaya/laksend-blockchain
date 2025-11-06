const API_URL = 'http://localhost:8000';
let currentUser = null;

// Show message function
function showMessage(message, type = 'success') {
    const messageBox = document.getElementById('message-box');
    messageBox.textContent = message;
    messageBox.className = type;
    messageBox.style.display = 'block';
    
    setTimeout(() => {
        messageBox.style.display = 'none';
    }, 3000);
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

// Signup function
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
            setTimeout(() => showTab('login'), 3000);
        } else {
            showMessage(data.detail || 'Signup failed', 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    }
}

// Login function
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
            
            showMessage('Login successful!', 'success');
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
    document.getElementById('balance-display').textContent = userData.balance;
    
    loadBlockchain();
}

// Logout
function logout() {
    currentUser = null;
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('dashboard-section').style.display = 'none';
    showMessage('Logged out', 'success');
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
            document.getElementById('balance-display').textContent = data.new_balance;
            document.getElementById('receiver-address').value = '';
            document.getElementById('transfer-amount').value = '';
            document.getElementById('transfer-password').value = '';
            loadBlockchain();
        } else {
            showMessage(data.detail || 'Transfer failed', 'error');
        }
    } catch (error) {
        showMessage('Connection error', 'error');
    }
}

// Load blockchain
async function loadBlockchain() {
    try {
        const response = await fetch(`${API_URL}/blockchain`);
        const data = await response.json();
        
        const display = document.getElementById('blockchain-display');
        display.innerHTML = '';
        
        data.chain.reverse().forEach(block => {
            const blockDiv = document.createElement('div');
            blockDiv.className = 'block';
            
            let transactionsHTML = '';
            block.transactions.forEach(tx => {
                transactionsHTML += `
                    <div class="transaction">
                        <strong>${tx.sender.substring(0, 10)}...</strong> → 
                        <strong>${tx.receiver.substring(0, 10)}...</strong>
                        <br>Amount: ${tx.amount_LKRt} LKRt
                    </div>
                `;
            });
            
            blockDiv.innerHTML = `
                <h4>Block #${block.index}</h4>
                <p><strong>Hash:</strong> ${block.hash.substring(0, 20)}...</p>
                <p><strong>Previous Hash:</strong> ${block.previous_hash.substring(0, 20)}...</p>
                <p><strong>Timestamp:</strong> ${new Date(block.timestamp * 1000).toLocaleString()}</p>
                <p><strong>Transactions:</strong></p>
                ${transactionsHTML || '<p>No transactions</p>'}
            `;
            
            display.appendChild(blockDiv);
        });
        
    } catch (error) {
        showMessage('Failed to load blockchain', 'error');
    }
}

// Convert Currency
async function convertCurrency() {
    const lkrAmount = parseFloat(document.getElementById('convert-lkr-amount').value);
    const fxCurrency = document.getElementById('foreign-currency').value.toUpperCase();
    
    if (!lkrAmount || !fxCurrency || !currentUser) {
        showMessage('Fill all conversion fields', 'error');
        return;
    }
    
    if (lkrAmount <= 0) {
        showMessage('Amount must be positive', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/convert`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                username: currentUser.username,
                lkr_amount: lkrAmount,
                foreign_currency: fxCurrency
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('conversion-result').innerHTML = `
                <p>Converted: <b>${data.amount} ${data.currency}</b><br>
                LKRt balance: ${data.lkr_balance}<br>
                ${data.currency} balance: ${data.fx_balance}</p>
            `;
            document.getElementById('balance-display').textContent = data.lkr_balance;
            document.getElementById('convert-lkr-amount').value = '';
            showMessage(data.message, 'success');
            loadBlockchain();
        } else {
            showMessage(data.detail || 'Conversion failed', 'error');
        }
    } catch (error) {
        showMessage('Failed to convert', 'error');
    }
}