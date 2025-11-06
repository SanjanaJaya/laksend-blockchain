import ecdsa
import hashlib
import binascii
from cryptography.fernet import Fernet

class Wallet:
    def __init__(self):
        self.private_key = None
        self.public_key = None
        self.address = None
        self.generate_keypair()
    
    def generate_keypair(self):
        """Generate public/private key pair using ECDSA"""
        # Generate private key
        private_key = ecdsa.SigningKey.generate(curve=ecdsa.SECP256k1)
        self.private_key = private_key.to_string().hex()
        
        # Generate public key
        public_key = private_key.get_verifying_key()
        self.public_key = public_key.to_string().hex()
        
        # Generate wallet address from public key
        self.address = self.generate_address(self.public_key)
    
    def generate_address(self, public_key: str) -> str:
        """Generate wallet address from public key"""
        # Hash the public key using SHA256
        sha256_hash = hashlib.sha256(public_key.encode()).hexdigest()
        # Take first 40 characters as address
        return sha256_hash[:40]
    
    def sign_transaction(self, transaction_data: str) -> str:
        """Sign transaction with private key"""
        private_key = ecdsa.SigningKey.from_string(
            bytes.fromhex(self.private_key), 
            curve=ecdsa.SECP256k1
        )
        signature = private_key.sign(transaction_data.encode())
        return binascii.hexlify(signature).decode()
    
    @staticmethod
    def verify_signature(public_key: str, transaction_data: str, 
                        signature: str) -> bool:
        """Verify transaction signature"""
        try:
            verifying_key = ecdsa.VerifyingKey.from_string(
                bytes.fromhex(public_key), 
                curve=ecdsa.SECP256k1
            )
            verifying_key.verify(
                binascii.unhexlify(signature), 
                transaction_data.encode()
            )
            return True
        except:
            return False
    
    def get_wallet_info(self) -> dict:
        """Return wallet information"""
        return {
            "address": self.address,
            "public_key": self.public_key,
            "private_key": self.private_key  # In production, encrypt this!
        }
    
    def encrypt_private_key(self, password: str) -> str:
        """Encrypt private key with password"""
        key = hashlib.sha256(password.encode()).digest()
        fernet = Fernet(key)
        encrypted = fernet.encrypt(self.private_key.encode())
        return encrypted.decode()
