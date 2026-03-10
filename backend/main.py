from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import hashlib
from typing import List
import random
import smtplib
from email.mime.text import MIMEText

from blockchain import Blockchain
from wallet import Wallet
from transaction import Transaction
from database import Database
from smart_contract import conversion_contract

app = FastAPI(title="LKRt Blockchain API with Proof of Work")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize blockchain with Proof of Work (difficulty = 4)
blockchain = Blockchain(difficulty=4)
db = Database()

# Supported currencies
SUPPORTED_CURRENCIES: List[str] = [
    "USD", "EUR", "GBP", "JPY", "AUD",
    "CAD", "CHF", "CNY", "INR", "SGD",
]

# ================= EMAIL / OTP CONFIG =================

SMTP_HOST = "smtp.gmail.com"          # change if not using Gmail
SMTP_PORT = 587
APP_EMAIL = "laksend.lk@gmail.com"        # TODO: put your app email
APP_EMAIL_PASSWORD = "zami qdsh wvvy chyj"  # TODO: app password (not normal login)


def send_otp_email(to_email: str, username: str, otp_code: str):
    subject = "Your LKRt Wallet OTP Verification Code"
    body = (
        f"Hi {username},\n\n"
        f"Your OTP code is: {otp_code}\n"
        "It is valid for this signup session.\n\n"
        "If you did not request this, please ignore this email.\n\n"
        "LKRt Wallet Team"
    )

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = APP_EMAIL
    msg["To"] = to_email

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(APP_EMAIL, APP_EMAIL_PASSWORD)
            server.send_message(msg)
    except Exception as e:
        print(f"Failed to send OTP email: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send OTP email",
        )

# ================= REQUEST MODELS =================

class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    initial_balance: float = 1000.0

class LoginRequest(BaseModel):
    username: str
    password: str

class VerifyOtpRequest(BaseModel):
    username: str
    otp_code: str

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

class MineRequest(BaseModel):
    miner_address: str

# ================= API ENDPOINTS =================

@app.get("/")
def read_root():
    return {
        "message": "LKRt Blockchain API with Proof of Work Mining",
        "version": "2.2",
        "features": [
            "PoW Mining",
            "Multi-Currency",
            "Smart Contracts",
            "Encrypted Private Keys",
            "Email OTP Verification",
        ],
        "endpoints": [
            "/signup", "/verify-otp", "/login", "/balance", "/transfer",
            "/convert", "/mine", "/mining/stats", "/blockchain",
        ],
    }

@app.post("/signup")
def signup(request: SignupRequest):
    """Create new user account with wallet and initial LKRt balance, send OTP to email."""
    wallet = Wallet()
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()

    # Encrypt private key before storing in DB
    encrypted_private_key = wallet.encrypt_private_key(request.password)

    wallet_info = {
        "address": wallet.address,
        "public_key": wallet.public_key,
        "encrypted_private_key": encrypted_private_key,
    }

    # Generate 6-digit OTP
    otp_code = f"{random.randint(100000, 999999)}"

    # Create user in DB (unverified + OTP)
    success = db.create_user(
        request.username,
        request.email,
        password_hash,
        wallet_info,
        otp_code,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists or database error",
        )

    # Send OTP email
    send_otp_email(request.email, request.username, otp_code)

    # Initial SYSTEM → user mint as a transaction, then auto-mine it
    initial_tx = Transaction("SYSTEM", wallet.address, request.initial_balance)
    initial_tx.sign_transaction(None)
    blockchain.add_transaction(initial_tx.to_dict())
    blockchain.mine_pending_transactions()  # no reward, only SYSTEM tx in pool

    return {
        "message": "Account created. OTP sent to your email. Please verify to activate login.",
        "username": request.username,
        "wallet_address": wallet.address,
        "public_key": wallet.public_key,
        "initial_balance": request.initial_balance,
        "private_key": wallet.private_key,
        "warning": "⚠️ Save your private key securely! It cannot be recovered if lost.",
        "security_note": "🔒 Your private key is encrypted with your password in the database.",
    }

@app.post("/verify-otp")
def verify_otp(request: VerifyOtpRequest):
    """Verify OTP code for a user and activate account."""
    success, msg = db.verify_user_otp(request.username, request.otp_code)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        )
    return {"message": msg, "username": request.username}

@app.post("/login")
def login(request: LoginRequest):
    """User login - verifies credentials and returns wallet info."""
    user = db.get_user(request.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not user.get("is_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not verified. Please check your email for OTP.",
        )

    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    if password_hash != user["password_hash"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    # Decrypt private key to ensure password is correct and key is usable
    try:
        _ = Wallet.decrypt_private_key(
            user["private_key_encrypted"],
            request.password,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt private key. Data may be corrupted.",
        )

    balance = blockchain.get_balance(user["wallet_address"])

    return {
        "message": "Login successful",
        "username": request.username,
        "wallet_address": user["wallet_address"],
        "public_key": user["public_key"],
        "balance": balance,
    }

@app.get("/balance/{wallet_address}")
def get_balance(wallet_address: str):
    """Get wallet balance by address."""
    balance = blockchain.get_balance(wallet_address)
    user = db.get_user_by_address(wallet_address)

    return {
        "wallet_address": wallet_address,
        "username": user["username"] if user else "Unknown",
        "balance_LKRt": balance,
    }

@app.get("/user/{username}")
def get_user_info(username: str):
    """Get user information by username."""
    user = db.get_user(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    balance = blockchain.get_balance(user["wallet_address"])

    return {
        "username": user["username"],
        "wallet_address": user["wallet_address"],
        "public_key": user["public_key"],
        "balance": balance,
        "created_at": user.get("created_at", "N/A"),
    }

@app.post("/transfer")
def transfer(request: TransferRequest):
    """Transfer LKRt and auto-mine so balances update immediately."""
    # 1. Get sender info
    sender = db.get_user(request.sender_username)
    if not sender:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sender not found",
        )

    # 2. Verify password
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    if password_hash != sender["password_hash"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    # 3. Decrypt private key using password
    try:
        decrypted_private_key = Wallet.decrypt_private_key(
            sender["private_key_encrypted"],
            request.password,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to decrypt private key. Incorrect password.",
        )

    # 4. Check sufficient balance
    sender_balance = blockchain.get_balance(sender["wallet_address"])
    if sender_balance < request.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient balance. Available: {sender_balance} LKRt",
        )

    # 5. Create transaction
    tx = Transaction(
        sender["wallet_address"],
        request.receiver_address,
        request.amount,
        sender["public_key"],
    )

    # 6. Reconstruct wallet with decrypted private key
    wallet = Wallet()
    wallet.private_key = decrypted_private_key
    wallet.public_key = sender["public_key"]
    wallet.address = sender["wallet_address"]

    # 7. Sign and verify
    tx.sign_transaction(wallet)
    if not tx.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid transaction signature",
        )

    # 8. Add to pending pool
    success = blockchain.add_transaction(tx.to_dict())
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction failed",
        )

    # 9. Auto-mine this transaction (sender collects reward)
    block = blockchain.mine_pending_transactions(
        mining_reward_address=sender["wallet_address"]
    )

    return {
        "message": "Transfer successful",
        "transaction": tx.to_dict(),
        "status": "CONFIRMED",
        "block_index": block.index if block else None,
        "new_balance": blockchain.get_balance(sender["wallet_address"]),
        "receiver_balance": blockchain.get_balance(request.receiver_address),
    }

@app.post("/mine")
def mine_block(request: MineRequest):
    """Explicit mining endpoint (if you want manual mining from UI)."""
    if not blockchain.pending_transactions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No transactions to mine",
        )

    miner = db.get_user_by_address(request.miner_address)
    if not miner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Miner address not found",
        )

    block = blockchain.mine_pending_transactions(request.miner_address)
    blockchain.adjust_difficulty(target_time=10)

    return {
        "message": "✅ Block mined successfully!",
        "block": block.to_dict(),
        "mining_reward": blockchain.mining_reward,
        "miner_balance": blockchain.get_balance(request.miner_address),
        "difficulty": blockchain.difficulty,
        "nonce": block.nonce,
    }

@app.get("/mining/stats")
def get_mining_stats():
    """Get current mining difficulty and statistics."""
    stats = blockchain.get_mining_stats()
    return {
        "difficulty": stats["difficulty"],
        "mining_reward": stats["mining_reward"],
        "pending_transactions": stats["pending_transactions"],
        "total_blocks": stats["total_blocks"],
        "average_block_time": stats["average_block_time"],
        "estimated_mining_time": f"~{2 ** stats['difficulty'] / 1000:.1f}s",
    }

@app.get("/currencies")
def get_supported_currencies():
    """Get list of supported currencies for conversion."""
    return {"currencies": SUPPORTED_CURRENCIES, "base_currency": "LKRt"}

@app.get("/portfolio/{username}")
def get_user_portfolio(username: str):
    """Get all currency balances for a user."""
    user = db.get_user(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    wallet_address = user["wallet_address"]
    lkr_balance = blockchain.get_balance(wallet_address)
    portfolio = {"LKRt": lkr_balance}

    for currency in SUPPORTED_CURRENCIES:
        fx_key = f"FXT_{currency}_{wallet_address}"
        fx_balance = blockchain.balances.get(fx_key, 0)
        if fx_balance > 0:
            portfolio[currency] = fx_balance

    return {
        "username": username,
        "wallet_address": wallet_address,
        "portfolio": portfolio,
        "total_currencies": len([v for v in portfolio.values() if v > 0]),
    }

@app.post("/convert")
def convert_currency(request: ConvertRequest):
    """Instant currency conversion using smart contract."""
    user = db.get_user(request.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    wallet_address = user["wallet_address"]

    if request.from_currency not in ["LKRt"] + SUPPORTED_CURRENCIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid source currency: {request.from_currency}",
        )

    if request.to_currency not in ["LKRt"] + SUPPORTED_CURRENCIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid target currency: {request.to_currency}",
        )

    if request.from_currency == request.to_currency:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot convert currency to itself",
        )

    try:
        result = conversion_contract(
            blockchain,
            wallet_address,
            request.from_currency,
            request.to_currency,
            request.amount,
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
            "timestamp": result["timestamp"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

@app.get("/blockchain")
def get_blockchain():
    """Get entire blockchain with validation status."""
    return {
        "chain": blockchain.get_chain(),
        "length": len(blockchain.chain),
        "is_valid": blockchain.is_chain_valid(),
        "pending_transactions": len(blockchain.pending_transactions),
        "difficulty": blockchain.difficulty,
    }

@app.get("/blockchain/latest")
def get_latest_block():
    """Get the latest mined block."""
    latest = blockchain.get_latest_block()
    return latest.to_dict()

@app.get("/transactions/{wallet_address}")
def get_transactions(wallet_address: str):
    """Get all transactions for a specific wallet address."""
    transactions: list[dict] = []

    for block in blockchain.chain:
        for tx in block.transactions:
            if tx.get("sender") == wallet_address or tx.get("receiver") == wallet_address:
                tx_info = tx.copy()
                tx_info["block_index"] = block.index
                tx_info["timestamp"] = block.timestamp
                tx_info["block_hash"] = block.hash
                tx_info["fromaddress"] = tx.get("sender")
                tx_info["toaddress"] = tx.get("receiver")
                tx_info["amount"] = tx.get("amount_LKRt")
                transactions.append(tx_info)

    return {
        "wallet_address": wallet_address,
        "transaction_count": len(transactions),
        "transactions": transactions,
    }

@app.get("/health")
def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "blockchain_length": len(blockchain.chain),
        "pending_transactions": len(blockchain.pending_transactions),
        "database_connected": db.client is not None,
        "mining_difficulty": blockchain.difficulty,
        "pow_enabled": True,
        "encryption_enabled": True,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
