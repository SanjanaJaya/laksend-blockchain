from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import hashlib
from typing import Optional, List
from blockchain import Blockchain
from wallet import Wallet
from transaction import Transaction
from database import Database
from smart_contract import conversion_contract

app = FastAPI(title="LKRt Blockchain API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize blockchain and database
blockchain = Blockchain()
db = Database()

# Supported currencies
SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "INR", "SGD"]

# Pydantic models for request validation
class SignupRequest(BaseModel):
    username: str
    password: str
    initial_balance: float = 1000.0

class LoginRequest(BaseModel):
    username: str
    password: str

class TransferRequest(BaseModel):
    sender_username: str
    receiver_address: str
    amount: float
    password: str

class ConvertRequest(BaseModel):
    username: str
    from_currency: str
    to_currency: str
    amount: float

# API Endpoints
@app.get("/")
def read_root():
    return {
        "message": "LKRt Blockchain API",
        "version": "1.0",
        "endpoints": ["/signup", "/login", "/balance", "/transfer", "/convert", "/blockchain"]
    }

@app.post("/signup")
def signup(request: SignupRequest):
    """
    Create new user account with wallet.
    Backend generates all cryptographic keys - no key generation in frontend.
    """
    # 1. Generate cryptographic wallet/keypair on backend
    wallet = Wallet()
    
    # 2. Hash password for secure storage
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    
    # 3. Get wallet info (address, public_key, private_key)
    wallet_info = wallet.get_wallet_info()
    
    # 4. Store user in Supabase database
    success = db.create_user(request.username, password_hash, wallet_info)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # 5. Give initial LKRt balance via genesis transaction
    initial_tx = Transaction("SYSTEM", wallet.address, request.initial_balance)
    initial_tx.sign_transaction(None)  # System transactions don't need signature
    blockchain.add_transaction(initial_tx.to_dict())
    blockchain.mine_pending_transactions()
    
    # 6. Return wallet details (CRITICAL: User must save private_key!)
    return {
        "message": "Account created successfully",
        "username": request.username,
        "wallet_address": wallet.address,
        "public_key": wallet.public_key,
        "initial_balance": request.initial_balance,
        "private_key": wallet.private_key,
        "warning": "Save your private key securely! It cannot be recovered if lost."
    }

@app.post("/login")
def login(request: LoginRequest):
    """
    User login - verifies credentials and returns wallet info.
    """
    # 1. Get user from database
    user = db.get_user(request.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # 2. Verify password hash
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    if password_hash != user['password_hash']:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )
    
    # 3. Get current balance from blockchain
    balance = blockchain.get_balance(user['wallet_address'])
    
    # 4. Return user info (no private key on login for security)
    return {
        "message": "Login successful",
        "username": request.username,
        "wallet_address": user['wallet_address'],
        "public_key": user['public_key'],
        "balance": balance
    }

@app.get("/balance/{wallet_address}")
def get_balance(wallet_address: str):
    """
    Get wallet balance by address.
    """
    balance = blockchain.get_balance(wallet_address)
    user = db.get_user_by_address(wallet_address)
    return {
        "wallet_address": wallet_address,
        "username": user['username'] if user else "Unknown",
        "balance_LKRt": balance
    }

@app.get("/user/{username}")
def get_user_info(username: str):
    """
    Get user information by username.
    """
    user = db.get_user(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    balance = blockchain.get_balance(user['wallet_address'])
    return {
        "username": user['username'],
        "wallet_address": user['wallet_address'],
        "public_key": user['public_key'],
        "balance": balance,
        "created_at": user.get('created_at', 'N/A')
    }

@app.post("/transfer")
def transfer(request: TransferRequest):
    """
    Transfer LKRt between wallets.
    Validates sender credentials, checks balance, and processes transaction.
    """
    # 1. Get sender info from database
    sender = db.get_user(request.sender_username)
    if not sender:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sender not found"
        )
    
    # 2. Verify password
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    if password_hash != sender['password_hash']:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )
    
    # 3. Check sufficient balance
    sender_balance = blockchain.get_balance(sender['wallet_address'])
    if sender_balance < request.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient balance. Available: {sender_balance} LKRt"
        )
    
    # 4. Create transaction
    tx = Transaction(
        sender['wallet_address'],
        request.receiver_address,
        request.amount,
        sender['public_key']
    )
    
    # 5. Reconstruct wallet to sign transaction
    wallet = Wallet()
    wallet.private_key = sender['private_key']
    wallet.public_key = sender['public_key']
    wallet.address = sender['wallet_address']
    
    # 6. Sign transaction with private key
    tx.sign_transaction(wallet)
    
    # 7. Verify transaction signature
    if not tx.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid transaction signature"
        )
    
    # 8. Add to blockchain
    success = blockchain.add_transaction(tx.to_dict())
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction failed"
        )
    
    # 9. Mine block to confirm transaction
    block = blockchain.mine_pending_transactions()
    
    # 10. Return success response
    return {
        "message": "Transfer successful",
        "transaction": tx.to_dict(),
        "block_index": block.index,
        "new_balance": blockchain.get_balance(sender['wallet_address']),
        "receiver_balance": blockchain.get_balance(request.receiver_address)
    }

@app.get("/currencies")
def get_supported_currencies():
    """
    Get list of supported currencies for conversion.
    """
    return {
        "currencies": SUPPORTED_CURRENCIES,
        "base_currency": "LKRt"
    }

@app.get("/portfolio/{username}")
def get_user_portfolio(username: str):
    """
    Get all currency balances for a user.
    """
    user = db.get_user(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    wallet_address = user['wallet_address']
    
    # Get LKRt balance
    lkr_balance = blockchain.get_balance(wallet_address)
    
    # Get all foreign currency balances
    portfolio = {
        "LKRt": lkr_balance
    }
    
    for currency in SUPPORTED_CURRENCIES:
        fx_key = f"FXT_{currency}_{wallet_address}"
        fx_balance = blockchain.balances.get(fx_key, 0)
        if fx_balance > 0:
            portfolio[currency] = fx_balance
    
    return {
        "username": username,
        "wallet_address": wallet_address,
        "portfolio": portfolio,
        "total_currencies": len([v for v in portfolio.values() if v > 0])
    }

@app.post("/convert")
def convert_currency(request: ConvertRequest):
    """
    Instant currency conversion using smart contract.
    Supports LKRt to foreign currency and foreign to foreign conversions.
    """
    # 1. Get user from database
    user = db.get_user(request.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    wallet_address = user['wallet_address']
    
    # 2. Validate currencies
    if request.from_currency not in ["LKRt"] + SUPPORTED_CURRENCIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid source currency: {request.from_currency}"
        )
    
    if request.to_currency not in ["LKRt"] + SUPPORTED_CURRENCIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid target currency: {request.to_currency}"
        )
    
    if request.from_currency == request.to_currency:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot convert currency to itself"
        )
    
    # 3. Execute conversion smart contract
    try:
        result = conversion_contract(
            blockchain,
            wallet_address,
            request.from_currency,
            request.to_currency,
            request.amount
        )
        
        return {
            "message": "Conversion successful",
            "from_currency": request.from_currency,
            "to_currency": request.to_currency,
            "amount_converted": request.amount,
            "amount_received": result["amount_received"],
            "exchange_rate": result["exchange_rate"],
            "from_balance": result["from_balance"],
            "to_balance": result["to_balance"],
            "timestamp": result["timestamp"]
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@app.get("/blockchain")
def get_blockchain():
    """
    Get entire blockchain with validation status.
    """
    return {
        "chain": blockchain.get_chain(),
        "length": len(blockchain.chain),
        "is_valid": blockchain.is_chain_valid(),
        "pending_transactions": len(blockchain.pending_transactions)
    }

@app.get("/blockchain/latest")
def get_latest_block():
    """
    Get the latest mined block.
    """
    latest = blockchain.get_latest_block()
    return latest.to_dict()

@app.get("/transactions/{wallet_address}")
def get_transactions(wallet_address: str):
    """
    Get all transactions for a specific wallet address.
    """
    transactions = []
    
    # Iterate through all blocks
    for block in blockchain.chain:
        for tx in block.transactions:
            # Check if wallet is sender or receiver
            if tx.get('from_address') == wallet_address or tx.get('to_address') == wallet_address:
                tx_info = tx.copy()
                tx_info['block_index'] = block.index
                tx_info['timestamp'] = block.timestamp
                transactions.append(tx_info)
    
    return {
        "wallet_address": wallet_address,
        "transaction_count": len(transactions),
        "transactions": transactions
    }

@app.get("/health")
def health_check():
    """
    Health check endpoint for monitoring.
    """
    return {
        "status": "healthy",
        "blockchain_length": len(blockchain.chain),
        "pending_transactions": len(blockchain.pending_transactions),
        "database_connected": db.client is not None
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
