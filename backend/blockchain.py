import hashlib
import json
import time
from typing import List, Dict, Any


class Block:
    def __init__(
        self,
        index: int,
        timestamp: float,
        transactions: List[Dict],
        previous_hash: str,
        nonce: int = 0,
    ):
        self.index = index
        self.timestamp = timestamp
        self.transactions = transactions
        self.previous_hash = previous_hash
        self.nonce = nonce
        self.hash = self.calculate_hash()

    def calculate_hash(self) -> str:
        """Calculate SHA256 hash of the block"""
        block_string = json.dumps(
            {
                "index": self.index,
                "timestamp": self.timestamp,
                "transactions": self.transactions,
                "previous_hash": self.previous_hash,
                "nonce": self.nonce,
            },
            sort_keys=True,
        )
        return hashlib.sha256(block_string.encode()).hexdigest()

    def mine_block(self, difficulty: int) -> None:
        """Proof of Work: find nonce so hash has `difficulty` leading zeros"""
        target = "0" * difficulty
        print(f"⛏️ Mining block {self.index} with difficulty {difficulty}...")
        start_time = time.time()

        while self.hash[:difficulty] != target:
            self.nonce += 1
            self.hash = self.calculate_hash()

        mining_time = time.time() - start_time
        print(f"✅ Block {self.index} mined!")
        print(f"   Hash: {self.hash}")
        print(f"   Nonce: {self.nonce:,}")
        print(f"   Time: {mining_time:.2f}s")

    def to_dict(self) -> Dict:
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "transactions": self.transactions,
            "previous_hash": self.previous_hash,
            "nonce": self.nonce,
            "hash": self.hash,
        }


class Blockchain:
    def __init__(self, difficulty: int = 4):
        """Initialize blockchain with Proof of Work mining."""
        self.chain: List[Block] = []
        self.pending_transactions: List[Dict] = []
        self.balances: Dict[str, float] = {}
        self.difficulty = difficulty
        self.create_genesis_block()

    def create_genesis_block(self):
        """Create the first block in the blockchain with PoW."""
        print("Creating genesis block...")
        genesis_block = Block(0, time.time(), [], "0")
        genesis_block.mine_block(self.difficulty)
        self.chain.append(genesis_block)

    def get_latest_block(self) -> Block:
        """Get the most recent block."""
        return self.chain[-1]

    @staticmethod
    def _normalize_tx(tx: Any) -> Dict | None:
        """Ensure transaction is a dict with required keys."""
        # Convert Transaction objects (or similar) to dict
        if not isinstance(tx, dict) and hasattr(tx, "to_dict"):
            tx = tx.to_dict()

        if not isinstance(tx, dict):
            return None

        required = {"sender", "receiver", "amount_LKRt"}
        if not required.issubset(tx.keys()):
            return None

        return tx

    def add_transaction(self, transaction: Dict | Any) -> bool:
        """Add a transaction to pending transactions."""
        tx = self._normalize_tx(transaction)
        if tx is None:
            # Invalid structure, reject
            return False

        sender = tx["sender"]
        amount = tx["amount_LKRt"]

        # System mints are always allowed
        if sender == "SYSTEM":
            self.pending_transactions.append(tx)
            return True

        sender_balance = self.balances.get(sender, 0)
        if sender_balance >= amount:
            self.pending_transactions.append(tx)
            return True

        return False

    def mine_pending_transactions(self):
        """Mine all pending transactions into a new block and update balances."""
        if not self.pending_transactions:
            return None

        # Normalize and filter transactions before mining
        cleaned_transactions: list[dict] = []
        for raw_tx in self.pending_transactions:
            tx = self._normalize_tx(raw_tx)
            if tx is None:
                # Skip malformed entries instead of crashing
                continue
            cleaned_transactions.append(tx)

        if not cleaned_transactions:
            # Nothing valid to mine
            self.pending_transactions = []
            return None

        # Create new block referencing previous hash
        block = Block(
            index=len(self.chain),
            timestamp=time.time(),
            transactions=cleaned_transactions.copy(),
            previous_hash=self.get_latest_block().hash,
        )

        # Proof of Work
        block.mine_block(self.difficulty)

        # Apply all transactions to balances
        for tx in cleaned_transactions:
            sender = tx["sender"]
            receiver = tx["receiver"]
            amount = tx["amount_LKRt"]

            if sender != "SYSTEM":
                self.balances[sender] = self.balances.get(sender, 0) - amount

            self.balances[receiver] = self.balances.get(receiver, 0) + amount

        # Commit block and clear pool
        self.chain.append(block)
        self.pending_transactions = []
        return block

    def get_balance(self, address: str) -> float:
        """Get balance for a wallet address."""
        return self.balances.get(address, 0)

    def is_chain_valid(self) -> bool:
        """Verify blockchain integrity including PoW difficulty."""
        target = "0" * self.difficulty

        for i in range(1, len(self.chain)):
            current_block = self.chain[i]
            previous_block = self.chain[i - 1]

            if current_block.hash != current_block.calculate_hash():
                print(f"❌ Block {i} hash is invalid")
                return False

            if current_block.hash[:self.difficulty] != target:
                print(
                    f"❌ Block {i} does not meet difficulty requirement"
                )
                return False

            if current_block.previous_hash != previous_block.hash:
                print(f"❌ Block {i} previous hash mismatch")
                return False

        return True

    def get_chain(self) -> List[Dict]:
        """Return the entire blockchain."""
        return [block.to_dict() for block in self.chain]

    def adjust_difficulty(self, target_time: int = 10):
        """Naive difficulty adjustment to target given block time in seconds."""
        if len(self.chain) < 2:
            return

        recent_blocks = (
            self.chain[-10:] if len(self.chain) >= 10 else self.chain[1:]
        )
        if len(recent_blocks) < 2:
            return

        time_taken = recent_blocks[-1].timestamp - recent_blocks[0].timestamp
        avg_time = time_taken / len(recent_blocks)

        if avg_time < target_time * 0.8:
            self.difficulty += 1
            print(f"⬆️ Difficulty increased to {self.difficulty}")
        elif avg_time > target_time * 1.2 and self.difficulty > 1:
            self.difficulty -= 1
            print(f"⬇️ Difficulty decreased to {self.difficulty}")

    def get_mining_stats(self) -> Dict:
        """Return simple mining statistics for the explorer/GUI."""
        if len(self.chain) < 2:
            avg_block_time = 0
        else:
            recent_blocks = (
                self.chain[-10:] if len(self.chain) >= 10 else self.chain
            )
            if len(recent_blocks) >= 2:
                time_diff = (
                    recent_blocks[-1].timestamp - recent_blocks[0].timestamp
                )
                avg_block_time = round(
                    time_diff / (len(recent_blocks) - 1), 2
                )
            else:
                avg_block_time = 0

        return {
            "difficulty": self.difficulty,
            "total_blocks": len(self.chain),
            "pending_transactions": len(self.pending_transactions),
            "average_block_time": avg_block_time,
        }