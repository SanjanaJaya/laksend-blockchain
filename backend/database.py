# database.py

import os
from supabase import create_client, Client

SUPABASE_URL = "https://ghvguuicklhncdsodrqj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdodmd1dWlja2xobmNkc29kcnFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDIzMTAsImV4cCI6MjA3ODAxODMxMH0.j7FYo21OMW_FZoUvTXN6OuZ6uSFHXE_RDpwWgnDcHc8"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

class Database:
    def __init__(self):
        self.client = supabase

    def create_user(
        self,
        username,
        email,
        password_hash,
        wallet_info,
        otp_code,
        first_name,
        last_name,
        nic,
        address,
        postal_code,
    ):
        """
        Create new user - stores authentication, wallet keys, email and profile info.
        Balance is NOT stored here - it lives on the blockchain only.
        """
        data = {
            "username": username,
            "email": email,
            "password_hash": password_hash,
            "wallet_address": wallet_info["address"],
            "public_key": wallet_info["public_key"],
            "private_key_encrypted": wallet_info["encrypted_private_key"],
            "otp_code": otp_code,
            "is_verified": False,
            "first_name": first_name,
            "last_name": last_name,
            "nic": nic,
            "address": address,
            "postal_code": postal_code,
        }

        try:
            resp = supabase.table("users").insert(data).execute()
            return bool(resp.data)
        except Exception as e:
            print(f"Database error: {e}")
            return False

    def get_user(self, username):
        """Get user by username"""
        try:
            query = supabase.table("users").select("*").eq("username", username).execute()
            result = query.data
            if result:
                user = result[0]
                return {
                    "username": user["username"],
                    "email": user.get("email"),
                    "wallet_address": user["wallet_address"],
                    "public_key": user["public_key"],
                    "private_key_encrypted": user["private_key_encrypted"],
                    "password_hash": user["password_hash"],
                    "otp_code": user.get("otp_code"),
                    "is_verified": user.get("is_verified", False),
                    "created_at": user.get("created_at", "N/A"),
                    "first_name": user.get("first_name"),
                    "last_name": user.get("last_name"),
                    "nic": user.get("nic"),
                    "address": user.get("address"),
                    "postal_code": user.get("postal_code"),
                }
            return None
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def get_user_by_address(self, address):
        """Get user by wallet address"""
        try:
            query = supabase.table("users").select("*").eq("wallet_address", address).execute()
            result = query.data
            if result:
                user = result[0]
                return {
                    "username": user["username"],
                    "wallet_address": user["wallet_address"],
                    "public_key": user["public_key"],
                    "first_name": user.get("first_name"),
                    "last_name": user.get("last_name"),
                }
            return None
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def verify_user_otp(self, username, otp_code):
        """Mark user as verified if OTP matches"""
        try:
            query = supabase.table("users").select("*").eq("username", username).execute()
            result = query.data
            if not result:
                return False, "User not found"

            user = result[0]
            if user.get("is_verified"):
                return True, "Already verified"

            if user.get("otp_code") != otp_code:
                return False, "Invalid OTP"

            update_resp = (
                supabase.table("users")
                .update({"is_verified": True, "otp_code": None})
                .eq("username", username)
                .execute()
            )
            return bool(update_resp.data), "Verified successfully"
        except Exception as e:
            print(f"Database error: {e}")
            return False, "Database error"

    def is_user_verified(self, username):
        """Check if user is verified"""
        user = self.get_user(username)
        if not user:
            return False
        return bool(user.get("is_verified", False))
