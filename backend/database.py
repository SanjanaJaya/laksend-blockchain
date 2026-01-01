import os
from supabase import create_client, Client

SUPABASE_URL = "https://ghvguuicklhncdsodrqj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdodmd1dWlja2xobmNkc29kcnFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDIzMTAsImV4cCI6MjA3ODAxODMxMH0.j7FYo21OMW_FZoUvTXN6OuZ6uSFHXE_RDpwWgnDcHc8"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

class Database:
    def create_user(self, username, password_hash, wallet_info):
        data = {
            "username": username,
            "password_hash": password_hash,
            "wallet_address": wallet_info["address"],
            "public_key": wallet_info["public_key"],
            "private_key_encrypted": wallet_info["private_key"],  # You can encrypt this
            "balance": 1000,
            "foreign_balances": "{}"
        }
        resp = supabase.table("users").insert(data).execute()
        return bool(resp.data)

    def get_user(self, username):
        query = supabase.table("users").select("*").eq("username", username).execute()
        result = query.data
        if result:
            user = result[0]
            return {
                "username": user["username"],
                "wallet_address": user["wallet_address"],
                "public_key": user["public_key"],
                "private_key": user["private_key_encrypted"],
                "password_hash": user["password_hash"]
            }
        return None

    def get_user_by_address(self, address):
        query = supabase.table("users").select("*").eq("wallet_address", address).execute()
        result = query.data
        if result:
            user = result[0]
            return {
                "username": user["username"],
                "wallet_address": user["wallet_address"],
                "public_key": user["public_key"]
            }
        return None
