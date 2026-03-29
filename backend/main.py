from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import hashlib
from typing import List
import random
import smtplib
import time
from datetime import datetime
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

# In-memory OTP store for transfer verification
transfer_otp_store = {}  # { username: { "otp": "123456", "expires": timestamp } }

# Supported currencies
SUPPORTED_CURRENCIES: List[str] = [
    "USD", "EUR", "GBP", "JPY", "AUD",
    "CAD", "CHF", "CNY", "INR", "SGD",
]

# ================= EMAIL / OTP CONFIG =================

SMTP_HOST = "smtp.gmail.com"  # change if not using Gmail
SMTP_PORT = 587
APP_EMAIL = "laksend.lk@gmail.com"  # TODO: put your app email
APP_EMAIL_PASSWORD = "zami qdsh wvvy chyj"  # TODO: app password (not normal login)


def send_otp_email(to_email: str, full_name: str, otp_code: str):
    subject = "Your LKRt Wallet OTP Verification Code"
    body = (
        f"Hi {full_name},\n\n"
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


def send_receipt_email(to_email: str, fullname: str, amount: float, sender_name: str, tx_hash: str, block_index: int, timestamp: str):
    subject = "💸 You received LKRt – Payment Receipt"
    body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: Arial, sans-serif; background: #f4f7fa; margin: 0; padding: 0; }}
    .container {{ max-width: 580px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }}
    .header {{ background: linear-gradient(135deg, #6c63ff, #3ecf8e); padding: 36px 32px; text-align: center; }}
    .header h1 {{ color: #fff; margin: 0; font-size: 26px; letter-spacing: 1px; }}
    .header p {{ color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px; }}
    .body {{ padding: 32px; }}
    .amount-box {{ background: #f0fdf4; border: 2px solid #3ecf8e; border-radius: 10px; text-align: center; padding: 24px; margin-bottom: 28px; }}
    .amount-box .label {{ font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }}
    .amount-box .amount {{ font-size: 42px; font-weight: 700; color: #16a34a; margin: 8px 0 0; }}
    .details-table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; }}
    .details-table td {{ padding: 10px 4px; font-size: 14px; border-bottom: 1px solid #f3f4f6; }}
    .details-table td:first-child {{ color: #6b7280; font-weight: 500; width: 40%; }}
    .details-table td:last-child {{ color: #111827; font-weight: 600; word-break: break-all; }}
    .footer {{ background: #f9fafb; padding: 20px 32px; text-align: center; font-size: 12px; color: #9ca3af; }}
    .badge {{ display: inline-block; background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; border-radius: 20px; padding: 4px 14px; margin-bottom: 16px; letter-spacing: 0.5px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>LKRt Wallet</h1>
      <p>Payment Receipt</p>
    </div>
    <div class="body">
      <p style="color:#374151;font-size:15px;">Hi <strong>{fullname}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px;">You have successfully received a payment on the LKRt blockchain.</p>
      <div class="amount-box">
        <div class="label">Amount Received</div>
        <div class="amount">+{amount:.2f} <span style="font-size:22px;color:#16a34a;">LKRt</span></div>
      </div>
      <span class="badge">✅ CONFIRMED ON BLOCKCHAIN</span>
      <table class="details-table">
        <tr><td>From</td><td>{sender_name}</td></tr>
        <tr><td>Block #</td><td>{block_index}</td></tr>
        <tr><td>Transaction ID</td><td>{tx_hash}</td></tr>
        <tr><td>Date & Time</td><td>{timestamp}</td></tr>
      </table>
      <p style="font-size:13px;color:#9ca3af;">This is an automated receipt. Please keep it for your records.</p>
    </div>
    <div class="footer">
      LKRt Wallet &bull; Blockchain-secured payments &bull; Do not reply to this email.
    </div>
  </div>
</body>
</html>
"""
    msg = MIMEText(body, "html")
    msg["Subject"] = subject
    msg["From"] = APP_EMAIL
    msg["To"] = to_email
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(APP_EMAIL, APP_EMAIL_PASSWORD)
            server.send_message(msg)
    except Exception as e:
        print(f"Failed to send receipt email: {e}")
        # Non-fatal: don't raise, just log


# ================= REQUEST MODELS =================


class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    nic: str
    address: str
    postal_code: str
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
    otp_code: str  # Required for transfer OTP verification


class TransferOtpRequestModel(BaseModel):
    username: str


class VerifyTransferOtpRequest(BaseModel):
    username: str
    otp_code: str
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
            "Transfer OTP Verification",
            "Receipt Email Notifications",
        ],
        "endpoints": [
            "/signup",
            "/verify-otp",
            "/login",
            "/balance",
            "/request-transfer-otp",
            "/transfer",
            "/convert",
            "/mine",
            "/mining/stats",
            "/blockchain",
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

    # Create user in DB (unverified + OTP + profile fields)
    success = db.create_user(
        request.username,
        request.email,
        password_hash,
        wallet_info,
        otp_code,
        request.first_name,
        request.last_name,
        request.nic,
        request.address,
        request.postal_code,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists or database error",
        )

    full_name = f"{request.first_name} {request.last_name}"
    # Send OTP email
    send_otp_email(request.email, full_name, otp_code)

    # Initial SYSTEM → user mint as a transaction, then auto-mine it
    initial_tx = Transaction("SYSTEM", wallet.address, request.initial_balance)
    initial_tx.sign_transaction(None)
    blockchain.add_transaction(initial_tx.to_dict())
    blockchain.mine_pending_transactions()  # no reward, only SYSTEM tx in pool

    return {
        "message": "Account created. OTP sent to your email. Please verify to activate login.",
        "username": request.username,
        "full_name": full_name,
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
    """User login - verifies credentials and returns wallet info and profile."""
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
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()

    return {
        "message": "Login successful",
        "username": request.username,
        "full_name": full_name,
        "wallet_address": user["wallet_address"],
        "public_key": user["public_key"],
        "balance": balance,
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "nic": user.get("nic"),
        "address": user.get("address"),
        "postal_code": user.get("postal_code"),
        "email": user.get("email"),
        "created_at": user.get("created_at", "N/A"),
    }


@app.get("/balance/{wallet_address}")
def get_balance(wallet_address: str):
    """Get wallet balance by address."""
    balance = blockchain.get_balance(wallet_address)
    user = db.get_user_by_address(wallet_address)

    full_name = None
    if user and (user.get("first_name") or user.get("last_name")):
        full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()

    return {
        "wallet_address": wallet_address,
        "username": user["username"] if user else "Unknown",
        "full_name": full_name,
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
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()

    return {
        "username": user["username"],
        "full_name": full_name,
        "wallet_address": user["wallet_address"],
        "public_key": user["public_key"],
        "balance": balance,
        "created_at": user.get("created_at", "N/A"),
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "nic": user.get("nic"),
        "address": user.get("address"),
        "postal_code": user.get("postal_code"),
        "email": user.get("email"),
    }


@app.post("/request-transfer-otp")
def request_transfer_otp(request: TransferOtpRequestModel):
    """Send an OTP to the user's email before allowing a transfer."""
    user = db.get_user(request.username)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    otp_code = f"{random.randint(100000, 999999)}"
    transfer_otp_store[request.username] = {
        "otp": otp_code,
        "expires": time.time() + 300  # 5-minute expiry
    }
    fullname = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
    send_otp_email(user.get("email"), fullname, otp_code)  # reuse existing function
    return {"message": "OTP sent to your registered email. Valid for 5 minutes."}


@app.post("/transfer")
def transfer(request: TransferRequest):
    """Transfer LKRt and auto-mine so balances update immediately."""

    # 0. Verify transfer OTP
    stored = transfer_otp_store.get(request.sender_username)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Transfer OTP not verified. Please request an OTP first.",
        )
    if time.time() > stored["expires"]:
        transfer_otp_store.pop(request.sender_username, None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Transfer OTP has expired. Please request a new one.",
        )
    if stored["otp"] != request.otp_code:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid transfer OTP.",
        )
    transfer_otp_store.pop(request.sender_username, None)  # consume OTP

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

    # 10. Send receipt email to receiver
    receiver_user = db.get_user_by_address(request.receiver_address)
    if receiver_user and receiver_user.get("email"):
        try:
            recv_fullname = f"{receiver_user.get('first_name', '')} {receiver_user.get('last_name', '')}".strip()
            sender_fullname = f"{sender.get('first_name', '')} {sender.get('last_name', '')}".strip()
            tx_hash = tx.to_dict().get("signature", "N/A")[:20] + "..."
            timestamp_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            send_receipt_email(
                receiver_user.get("email"),
                recv_fullname,
                request.amount,
                sender_fullname,
                tx_hash,
                block.index if block else 0,
                timestamp_str,
            )
        except Exception as e:
            print(f"Receipt email failed: {e}")  # Log but don't fail the transfer

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