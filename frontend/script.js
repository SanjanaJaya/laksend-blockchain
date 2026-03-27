const API_URL = 'http://localhost:8000';

let currentUser = null;
let supportedCurrencies = [];
let lastTransactionCount = 0;
let transactionCheckInterval = null;
let allTransactions = [];
let pendingTransferData = null;
let currentPortfolio = {}; // Store portfolio data globally
let pendingSignupUser = null; // store username for OTP verification

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
    if (currentUser) {
      loadProfile(currentUser.username);
    }
  } else if (pageName === 'profile') {
    if (currentUser) {
      loadProfile(currentUser.username);
    }
  } else if (pageName === 'transfer') {
    loadFavoritePayees();
  } else if (pageName === 'convert') {
    loadPortfolio(); // Load portfolio to show balances
    updateConversionBalances();
  }
}

// ========== AUTH TAB SWITCHING ==========
function showTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Remove active from all buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Activate the tab content
  const tabEl = document.getElementById(`${tabName}-tab`);
  if (tabEl) tabEl.classList.add('active');

  // Activate the matching button
  const btn =
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`) ||
    document.querySelector(`.tab-btn[data-page="${tabName}"]`);
  if (btn) btn.classList.add('active');
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
      const fullName = data.full_name || data.username;

      currentUser = {
        username: storedUser.username,
        wallet_address: storedUser.wallet_address,
        password: storedUser.password || null,
        full_name: fullName,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
      };

      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('dashboard-section').classList.add('active');

      const fullnameEl = document.getElementById('user-fullname-display');
      if (fullnameEl) fullnameEl.textContent = fullName;
      const usernameEl = document.getElementById('username-display');
      if (usernameEl) usernameEl.textContent = data.username;
      const walletEl = document.getElementById('wallet-address');
      if (walletEl) walletEl.textContent = data.wallet_address;

      await loadProfile(username);
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
  const firstName = document.getElementById('signup-first-name').value.trim();
  const lastName = document.getElementById('signup-last-name').value.trim();
  const nic = document.getElementById('signup-nic').value.trim();
  const address = document.getElementById('signup-address').value.trim();
  const postalCode = document.getElementById('signup-postal-code').value.trim();
  const username = document.getElementById('signup-username').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const initialBalance = parseFloat(document.getElementById('initial-balance').value);

  if (
    !firstName ||
    !lastName ||
    !nic ||
    !address ||
    !postalCode ||
    !username ||
    !email ||
    !password
  ) {
    showNotification('error', 'Validation Error', 'Please fill all fields');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username,
        email: email,
        password: password,
        first_name: firstName,
        last_name: lastName,
        nic: nic,
        address: address,
        postal_code: postalCode,
        initial_balance: initialBalance,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      showNotification('info', 'OTP Sent', 'Account created. Check your email for OTP to verify.');
      pendingSignupUser = username;
      const otpSection = document.getElementById('otp-section');
      if (otpSection) otpSection.style.display = 'block';
    } else {
      showNotification('error', 'Signup Failed', data.detail || 'Could not create account');
    }
  } catch (error) {
    console.error(error);
    showNotification('error', 'Connection Error', 'Could not connect to server');
  }
}

async function verifySignupOtp() {
  const otpInput = document.getElementById('signup-otp');
  const otpCode = otpInput ? otpInput.value.trim() : '';

  if (!pendingSignupUser) {
    showNotification('error', 'Verification Error', 'No signup in progress');
    return;
  }
  if (!otpCode) {
    showNotification('error', 'Validation Error', 'Please enter the OTP');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: pendingSignupUser, otp_code: otpCode }),
    });
    const data = await response.json();

    if (response.ok) {
      showNotification('success', 'Verified', 'Your email has been verified. You can now log in.');
      const otpSection = document.getElementById('otp-section');
      if (otpSection) otpSection.style.display = 'none';
      pendingSignupUser = null;
      showTab('login');
    } else {
      showNotification('error', 'Verification Failed', data.detail || 'Invalid OTP');
    }
  } catch (error) {
    console.error(error);
    showNotification('error', 'Connection Error', 'Could not verify OTP');
  }
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showNotification('error', 'Validation Error', 'Please fill all fields');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();

    if (response.ok) {
      const fullName = data.full_name || data.username;
      showNotification('success', '✅ Welcome Back', `Logged in as ${fullName}`);

      currentUser = {
        username: data.username,
        wallet_address: data.wallet_address,
        password: password,
        full_name: data.full_name,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
      };
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('dashboard-section').classList.add('active');

      const fullnameEl = document.getElementById('user-fullname-display');
      if (fullnameEl) fullnameEl.textContent = fullName;
      const usernameEl = document.getElementById('username-display');
      if (usernameEl) usernameEl.textContent = data.username;
      const walletEl = document.getElementById('wallet-address');
      if (walletEl) walletEl.textContent = data.wallet_address;

      await loadProfile(username);
      loadPortfolio();
      loadRecentTransactions();
      startTransactionMonitoring();
      showPage('overview');
    } else {
      showNotification('error', 'Login Failed', data.detail || 'Could not log in');
    }
  } catch (error) {
    console.error(error);
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

// ========== PROFILE LOADING ==========
async function loadProfile(username) {
  try {
    const response = await fetch(`${API_URL}/user/${username}`);
    if (!response.ok) return;
    const data = await response.json();

    const fullName =
      data.full_name ||
      `${data.first_name || ''} ${data.last_name || ''}`.trim() ||
      data.username;

    const fullNameEl = document.getElementById('profile-full-name');
    if (fullNameEl) fullNameEl.textContent = fullName || '-';

    const userEl = document.getElementById('profile-username');
    if (userEl) userEl.textContent = data.username || '-';

    const emailEl = document.getElementById('profile-email');
    if (emailEl) emailEl.textContent = data.email || '-';

    const nicEl = document.getElementById('profile-nic');
    if (nicEl) nicEl.textContent = data.nic || '-';

    const addrEl = document.getElementById('profile-address');
    if (addrEl) addrEl.textContent = data.address || '-';

    const pcEl = document.getElementById('profile-postal-code');
    if (pcEl) pcEl.textContent = data.postal_code || '-';

    const wEl = document.getElementById('profile-wallet-address');
    if (wEl) wEl.textContent = data.wallet_address || '-';

    const createdEl = document.getElementById('profile-created-at');
    if (createdEl) createdEl.textContent = data.created_at || '-';
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

// ========== COPY WALLET ADDRESS ==========
function copyWalletAddress() {
  const addrEl = document.getElementById('wallet-address');
  if (!addrEl || !addrEl.textContent) return;

  const value = addrEl.textContent.trim();
  navigator.clipboard
    .writeText(value)
    .then(() => {
      showNotification('success', 'Copied', 'Wallet address copied to clipboard');
    })
    .catch(() => {
      showNotification('error', 'Copy failed', 'Could not copy wallet address');
    });
}

// ========== PORTFOLIO / BALANCES ==========
async function loadSupportedCurrencies() {
  try {
    const response = await fetch(`${API_URL}/currencies`);
    if (!response.ok) return;
    const data = await response.json();
    supportedCurrencies = data.currencies || [];

    const fromSelect = document.getElementById('from-currency');
    const toSelect = document.getElementById('to-currency');
    if (!fromSelect || !toSelect) return;

    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';

    const baseOption = document.createElement('option');
    baseOption.value = 'LKRt';
    baseOption.textContent = 'LKRt (Base)';
    fromSelect.appendChild(baseOption.cloneNode(true));
    toSelect.appendChild(baseOption.cloneNode(true));

    supportedCurrencies.forEach(cur => {
      const opt1 = document.createElement('option');
      opt1.value = cur;
      opt1.textContent = cur;
      fromSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = cur;
      opt2.textContent = cur;
      toSelect.appendChild(opt2);
    });

    fromSelect.value = 'LKRt';
    if (supportedCurrencies.length > 0) {
      toSelect.value = supportedCurrencies[0];
    }
  } catch (error) {
    console.error('Failed to load supported currencies:', error);
  }
}

async function loadPortfolio() {
  if (!currentUser) return;

  try {
    const response = await fetch(`${API_URL}/portfolio/${currentUser.username}`);
    const data = await response.json();
    if (!response.ok) return;

    currentPortfolio = data.portfolio || {};
    const container = document.getElementById('portfolio-balances');
    const fxContainer = document.getElementById('fx-balances');
    if (!container) return;

    container.innerHTML = '';
    if (fxContainer) fxContainer.innerHTML = '';

    const entries = Object.entries(currentPortfolio);
    if (entries.length === 0) {
      container.innerHTML = '<p class="muted">No currencies in portfolio yet</p>';
      return;
    }

    entries.forEach(([currency, balance]) => {
      if (balance <= 0) return;

      const card = document.createElement('div');
      card.className = 'currency-card';
      card.innerHTML = `
        <div class="currency-code">${currency}</div>
        <div class="currency-balance">${balance.toFixed(2)}</div>
      `;
      container.appendChild(card);

      if (currency !== 'LKRt' && fxContainer) {
        const chip = document.createElement('div');
        chip.className = 'balance-chip';
        chip.textContent = `${currency} · ${balance.toFixed(2)}`;
        fxContainer.appendChild(chip);
      }
    });
  } catch (error) {
    console.error('Failed to load portfolio:', error);
  }
}

// ========== TRANSFERS ==========
async function fetchReceiverInfo() {
  const address = document.getElementById('receiver-address').value.trim();
  const infoBox = document.getElementById('receiver-info');
  if (!infoBox || !address) {
    if (infoBox) infoBox.innerHTML = '';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/balance/${address}`);
    if (!response.ok) {
      infoBox.innerHTML = '<p class="muted">Could not find receiver info.</p>';
      return;
    }
    const data = await response.json();
    const namePart = data.full_name || data.username || 'Unknown';

    infoBox.innerHTML = `
      <div class="receiver-summary">
        <div class="receiver-name">${namePart}</div>
        <div class="receiver-username">@${data.username}</div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to fetch receiver info:', err);
    infoBox.innerHTML = '';
  }
}

function prepareTransfer() {
  if (!currentUser) {
    showNotification('error', 'Transfer Error', 'Please login first');
    return;
  }

  const receiverAddress = document.getElementById('receiver-address').value.trim();
  const amount = parseFloat(document.getElementById('transfer-amount').value);
  const password = document.getElementById('transfer-password').value;

  if (!receiverAddress || !amount || !password) {
    showNotification('error', 'Validation Error', 'Please fill all fields');
    return;
  }

  pendingTransferData = {
    sender_username: currentUser.username,
    receiver_address: receiverAddress,
    amount,
    password,
  };

  const summary = document.getElementById('transfer-summary');
  const confirmBox = document.getElementById('transfer-confirmation');
  if (summary) {
    summary.textContent = `Send ${amount.toFixed(2)} LKRt to ${receiverAddress}?`;
  }
  if (confirmBox) confirmBox.style.display = 'block';
}

function cancelTransfer() {
  pendingTransferData = null;
  const confirmBox = document.getElementById('transfer-confirmation');
  if (confirmBox) confirmBox.style.display = 'none';
}

async function confirmTransfer() {
  if (!pendingTransferData) return;

  try {
    const response = await fetch(`${API_URL}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingTransferData),
    });
    const data = await response.json();

    if (response.ok) {
      showNotification('success', 'Transfer Successful', 'Your transfer has been confirmed.');
      pendingTransferData = null;
      document.getElementById('transfer-confirmation').style.display = 'none';
      document.getElementById('transfer-amount').value = '';
      document.getElementById('transfer-password').value = '';
      loadPortfolio();
      loadRecentTransactions();
      loadTransactionHistory();
    } else {
      showNotification('error', 'Transfer Failed', data.detail || 'Could not complete transfer');
    }
  } catch (error) {
    console.error('Transfer error:', error);
    showNotification('error', 'Connection Error', 'Could not connect to server');
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
      <div class="favorite-main">
        <div class="favorite-name">@${fav.username}</div>
        <div class="favorite-address">${fav.address}</div>
      </div>
      <div class="favorite-actions">
        <button class="primary-btn" onclick="selectFavoritePayee('${fav.username}', '${fav.address}')">Pay</button>
        <button class="secondary-btn" onclick="deleteFavoritePayee('${fav.address}')">Remove</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// ========== CONVERSION ==========
function updateConversionBalances() {
  if (!currentUser || !currentPortfolio) return;

  const fromCurrency = document.getElementById('from-currency').value;
  const toCurrency = document.getElementById('to-currency').value;

  const fromBalance = currentPortfolio[fromCurrency] || 0;
  const toBalance = currentPortfolio[toCurrency] || 0;

  const fromLabel = document.getElementById('from-currency-balance');
  const toLabel = document.getElementById('to-currency-balance');

  if (fromLabel) fromLabel.textContent = `Balance: ${fromBalance.toFixed(2)} ${fromCurrency}`;
  if (toLabel) toLabel.textContent = `Balance: ${toBalance.toFixed(2)} ${toCurrency}`;
}

async function convertCurrency() {
  if (!currentUser) {
    showNotification('error', 'Convert Error', 'Please login first');
    return;
  }

  const fromCurrency = document.getElementById('from-currency').value;
  const toCurrency = document.getElementById('to-currency').value;
  const amount = parseFloat(document.getElementById('convert-amount').value);

  if (!fromCurrency || !toCurrency || !amount) {
    showNotification('error', 'Validation Error', 'Please select currencies and amount');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser.username,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        amount: amount,
      }),
    });
    const data = await response.json();

    if (response.ok) {
      const resultBox = document.getElementById('convert-result');
      if (resultBox) {
        resultBox.innerHTML = `
          <p>Converted ${data.amount_converted.toFixed(2)} ${fromCurrency}
             → ${data.amount_received.toFixed(2)} ${toCurrency}</p>
          <p class="muted">Rate: ${data.exchange_rate}</p>
        `;
      }
      loadPortfolio();
      updateConversionBalances();
    } else {
      showNotification('error', 'Conversion Failed', data.detail || 'Could not convert currency');
    }
  } catch (error) {
    console.error('Conversion error:', error);
    showNotification('error', 'Connection Error', 'Could not connect to server');
  }
}

// ========== TRANSACTIONS ==========
async function loadTransactionHistory() {
  if (!currentUser) return;

  try {
    const response = await fetch(`${API_URL}/transactions/${currentUser.wallet_address}`);
    const data = await response.json();
    if (!response.ok) return;

    const transactions = data.transactions || [];
    allTransactions = transactions;
    lastTransactionCount = transactions.length;

    await processAndDisplayTransactions(transactions);
  } catch (error) {
    console.error('Failed to load transaction history:', error);
  }
}

async function loadRecentTransactions() {
  if (!currentUser) return;

  try {
    const response = await fetch(`${API_URL}/transactions/${currentUser.wallet_address}`);
    const data = await response.json();
    if (!response.ok) return;

    const transactions = data.transactions || [];
    const recent = transactions.slice(-5).reverse();
    await processAndDisplayTransactions(recent, 'recent-transaction-list');
  } catch (error) {
    console.error('Failed to load recent transactions:', error);
  }
}

async function processAndDisplayTransactions(transactions, containerId = 'transaction-list') {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = '<p class="muted">No transactions yet</p>';
    return;
  }

  const addressSet = new Set();
  transactions.forEach(tx => {
    if (tx.fromaddress && tx.fromaddress !== 'SYSTEM') addressSet.add(tx.fromaddress);
    if (tx.toaddress) addressSet.add(tx.toaddress);
  });

  const addressToUsername = {};
  await Promise.all(
    Array.from(addressSet).map(async address => {
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

    const timestamp = tx.timestamp
      ? new Date(tx.timestamp * 1000).toLocaleString()
      : 'Unknown time';
    const amountDisplay = tx.amount > 0 ? `${tx.amount.toFixed(2)} LKRt` : 'N/A';

    const txElement = document.createElement('div');
    txElement.className = `transaction-item ${txClass}`;
    txElement.innerHTML = `
      <div class="tx-main">
        <div class="tx-type">${txType}</div>
        <div class="tx-amount">${amountDisplay}</div>
      </div>
      <div class="tx-meta">
        <span>${details}</span>
        <span>${timestamp}</span>
        <span>Block #${tx.block_index}</span>
      </div>
    `;
    container.appendChild(txElement);
  });
}

// ========== TRANSACTION MONITORING ==========
function startTransactionMonitoring() {
  if (transactionCheckInterval) clearInterval(transactionCheckInterval);

  transactionCheckInterval = setInterval(async () => {
    if (!currentUser) return;
    try {
      const response = await fetch(`${API_URL}/transactions/${currentUser.wallet_address}`);
      if (!response.ok) return;
      const data = await response.json();
      const transactions = data.transactions || [];
      if (transactions.length > lastTransactionCount) {
        lastTransactionCount = transactions.length;
        loadPortfolio();
        loadRecentTransactions();
        loadTransactionHistory();
      }
    } catch (err) {
      console.error('Error polling transactions:', err);
    }
  }, 10000);
}

function stopTransactionMonitoring() {
  if (transactionCheckInterval) {
    clearInterval(transactionCheckInterval);
    transactionCheckInterval = null;
  }
}

// ========== NOTIFICATIONS ==========
function showNotification(type, title, message) {
  const container = document.getElementById('notification-container');
  if (!container) return;

  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.innerHTML = `
    <div class="notification-title">${title}</div>
    <div class="notification-message">${message}</div>
  `;

  container.appendChild(notif);
  requestAnimationFrame(() => {
    notif.classList.add('visible');
  });

  setTimeout(() => {
    notif.classList.remove('visible');
    setTimeout(() => {
      if (notif.parentNode === container) {
        container.removeChild(notif);
      }
    }, 250);
  }, 4000);
}
