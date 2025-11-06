import hashlib
import json
import time
from typing import List, Dict

class Block:
    def __init__(self, index: int, timestamp: float, transactions: List[Dict], 
                 previous_hash: str):
        self.index = index
        self.timestamp = timestamp
        self.transactions = transactions
        self.previous_hash = previous_hash
        self.hash = self.calculate_hash()
    
    def calculate_hash(self) -> str:
        """Calculate SHA256 hash of the block"""
        block_string = json.dumps({
            "index": self.index,
            "timestamp": self.timestamp,
            "transactions": self.transactions,
            "previous_hash": self.previous_hash
        }, sort_keys=True)
        return hashlib.sha256(block_string.encode()).hexdigest()
    
    def to_dict(self):
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "transactions": self.transactions,
            "previous_hash": self.previous_hash,
            "hash": self.hash
        }

class Blockchain:
    def __init__(self):
        self.chain: List[Block] = []
        self.pending_transactions: List[Dict] = []
        self.balances: Dict[str, float] = {}
        self.create_genesis_block()
    
    def create_genesis_block(self):
        """Create the first block in the blockchain"""
        genesis_block = Block(0, time.time(), [], "0")
        self.chain.append(genesis_block)
    
    def get_latest_block(self) -> Block:
        """Get the most recent block"""
        return self.chain[-1]
    
    def add_transaction(self, transaction: Dict) -> bool:
        """Add a transaction to pending transactions"""
        # Verify sender has sufficient balance
        sender = transaction['sender']
        amount = transaction['amount_LKRt']
        
        if sender == "SYSTEM":  # Initial token distribution
            self.pending_transactions.append(transaction)
            return True
        
        sender_balance = self.balances.get(sender, 0)
        if sender_balance >= amount:
            self.pending_transactions.append(transaction)
            return True
        return False
    
    def mine_pending_transactions(self):
        """Create a new block with pending transactions"""
        if not self.pending_transactions:
            return None
        
        block = Block(
            index=len(self.chain),
            timestamp=time.time(),
            transactions=self.pending_transactions.copy(),
            previous_hash=self.get_latest_block().hash
        )
        
        # Update balances
        for tx in self.pending_transactions:
            sender = tx['sender']
            receiver = tx['receiver']
            amount = tx['amount_LKRt']
            
            if sender != "SYSTEM":
                self.balances[sender] = self.balances.get(sender, 0) - amount
            self.balances[receiver] = self.balances.get(receiver, 0) + amount
        
        self.chain.append(block)
        self.pending_transactions = []
        return block
    
    def get_balance(self, address: str) -> float:
        """Get balance for a wallet address"""
        return self.balances.get(address, 0)
    
    def is_chain_valid(self) -> bool:
        """Verify blockchain integrity"""
        for i in range(1, len(self.chain)):
            current_block = self.chain[i]
            previous_block = self.chain[i - 1]
            
            # Check if hash is correct
            if current_block.hash != current_block.calculate_hash():
                return False
            
            # Check if previous hash matches
            if current_block.previous_hash != previous_block.hash:
                return False
        
        return True
    
    def get_chain(self) -> List[Dict]:
        """Return the entire blockchain"""
        return [block.to_dict() for block in self.chain]
