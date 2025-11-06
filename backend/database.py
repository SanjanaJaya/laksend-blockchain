import sqlite3
import json
from typing import Dict, Optional

class Database:
    def __init__(self, db_name: str = "blockchain.db"):
        self.db_name = db_name
        self.init_database()
    
    def init_database(self):
        """Initialize database tables"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                wallet_address TEXT UNIQUE NOT NULL,
                public_key TEXT NOT NULL,
                private_key_encrypted TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def create_user(self, username: str, password_hash: str, 
                   wallet_info: Dict) -> bool:
        """Create new user with wallet"""
        try:
            conn = sqlite3.connect(self.db_name)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO users (username, password_hash, wallet_address, 
                                 public_key, private_key_encrypted)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                username,
                password_hash,
                wallet_info['address'],
                wallet_info['public_key'],
                wallet_info['private_key']
            ))
            
            conn.commit()
            conn.close()
            return True
        except sqlite3.IntegrityError:
            return False
    
    def get_user(self, username: str) -> Optional[Dict]:
        """Get user information"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT username, wallet_address, public_key, 
                   private_key_encrypted, password_hash
            FROM users WHERE username = ?
        ''', (username,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return {
                "username": result[0],
                "wallet_address": result[1],
                "public_key": result[2],
                "private_key": result[3],
                "password_hash": result[4]
            }
        return None
    
    def get_user_by_address(self, address: str) -> Optional[Dict]:
        """Get user by wallet address"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT username, wallet_address, public_key
            FROM users WHERE wallet_address = ?
        ''', (address,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return {
                "username": result[0],
                "wallet_address": result[1],
                "public_key": result[2]
            }
        return None
