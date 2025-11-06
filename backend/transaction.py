import time
import json
from typing import Dict

class Transaction:
    def __init__(self, sender: str, receiver: str, amount: float, 
                 sender_public_key: str = None):
        self.sender = sender
        self.receiver = receiver
        self.amount_LKRt = amount
        self.timestamp = time.time()
        self.sender_public_key = sender_public_key
        self.signature = None
    
    def calculate_hash(self) -> str:
        """Create transaction hash for signing"""
        tx_data = {
            "sender": self.sender,
            "receiver": self.receiver,
            "amount_LKRt": self.amount_LKRt,
            "timestamp": self.timestamp
        }
        return json.dumps(tx_data, sort_keys=True)
    
    def sign_transaction(self, wallet):
        """Sign transaction with sender's wallet"""
        if self.sender == "SYSTEM":
            self.signature = "SYSTEM_SIGNATURE"
            return
        
        tx_hash = self.calculate_hash()
        self.signature = wallet.sign_transaction(tx_hash)
    
    def is_valid(self) -> bool:
        """Verify transaction signature"""
        if self.sender == "SYSTEM":
            return True
        
        if not self.signature or not self.sender_public_key:
            return False
        
        from wallet import Wallet
        tx_hash = self.calculate_hash()
        return Wallet.verify_signature(
            self.sender_public_key, 
            tx_hash, 
            self.signature
        )
    
    def to_dict(self) -> Dict:
        """Convert transaction to dictionary"""
        return {
            "sender": self.sender,
            "receiver": self.receiver,
            "amount_LKRt": self.amount_LKRt,
            "timestamp": self.timestamp,
            "signature": self.signature,
            "sender_public_key": self.sender_public_key
        }
