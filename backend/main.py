from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import hashlib
from typing import Optional

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
    lkr_amount: float
    foreign_currency: str

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
    """Create new user account with wallet"""
    # Create wallet
    wallet = Wallet()
    
    # Hash password
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    
    # Store user in database
    wallet_info = wallet.get_wallet_info()
    success = db.create_user(request.username, password_hash, wallet_info)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Give initial LKRt balance
    initial_tx = Transaction("SYSTEM", wallet.address, request.initial_balance)
    initial_tx.sign_transaction(None)
    blockchain.add_transaction(initial_tx.to_dict())
    blockchain.mine_pending_transactions()
    
    return {
        "message": "Account created successfully",
        "username": request.username,
        "wallet_address": wallet.address,
        "initial_balance": request.initial_balance,
        "private_key": wallet.private_key  # Show once, user must save it!
    }

@app.post("/login")
def login(request: LoginRequest):
    """User login"""
    user = db.get_user(request.username)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Verify password
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    if password_hash != user['password_hash']:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )
    
    balance = blockchain.get_balance(user['wallet_address'])
    
    return {
        "message": "Login successful",
        "username": request.username,
        "wallet_address": user['wallet_address'],
        "balance": balance
    }

@app.get("/balance/{wallet_address}")
def get_balance(wallet_address: str):
    """Get wallet balance"""
    balance = blockchain.get_balance(wallet_address)
    user = db.get_user_by_address(wallet_address)
    
    return {
        "wallet_address": wallet_address,
        "username": user['username'] if user else "Unknown",
        "balance_LKRt": balance
    }

@app.post("/transfer")
def transfer(request: TransferRequest):
    """Transfer LKRt between wallets"""
    # Get sender info
    sender = db.get_user(request.sender_username)
    if not sender:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sender not found"
        )
    
    # Verify password
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    if password_hash != sender['password_hash']:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )
    
    # Check balance
    sender_balance = blockchain.get_balance(sender['wallet_address'])
    if sender_balance < request.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient balance. Available: {sender_balance} LKRt"
        )
    
    # Create and sign transaction
    tx = Transaction(
        sender['wallet_address'],
        request.receiver_address,
        request.amount,
        sender['public_key']
    )
    
    # Reconstruct wallet to sign
    wallet = Wallet()
    wallet.private_key = sender['private_key']
    wallet.public_key = sender['public_key']
    wallet.address = sender['wallet_address']
    
    tx.sign_transaction(wallet)
    
    # Verify transaction
    if not tx.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid transaction signature"
        )
    
    # Add to blockchain
    success = blockchain.add_transaction(tx.to_dict())
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction failed"
        )
    
    # Mine block
    block = blockchain.mine_pending_transactions()
    
    return {
        "message": "Transfer successful",
        "transaction": tx.to_dict(),
        "block_index": block.index,
        "new_balance": blockchain.get_balance(sender['wallet_address'])
    }

@app.post("/convert")
def convert_currency(request: ConvertRequest):
    """Convert LKRt to foreign currency"""
    user = db.get_user(request.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    wallet_address = user['wallet_address']
    
    try:
        fx_amount = conversion_contract(
            blockchain, 
            wallet_address, 
            request.lkr_amount, 
            request.foreign_currency
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Get balances
    fx_key = f"FXT_{request.foreign_currency}_{wallet_address}"
    fx_balance = blockchain.balances.get(fx_key, 0)
    lkr_balance = blockchain.get_balance(wallet_address)
    
    return {
        "message": f"Converted {request.lkr_amount} LKRt to {fx_amount} {request.foreign_currency}",
        "lkr_balance": lkr_balance,
        "fx_balance": fx_balance,
        "currency": request.foreign_currency,
        "amount": fx_amount,
        "wallet_address": wallet_address
    }

@app.get("/blockchain")
def get_blockchain():
    """Get entire blockchain"""
    return {
        "chain": blockchain.get_chain(),
        "length": len(blockchain.chain),
        "is_valid": blockchain.is_chain_valid()
    }

@app.get("/blockchain/latest")
def get_latest_block():
    """Get latest block"""
    latest = blockchain.get_latest_block()
    return latest.to_dict()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)