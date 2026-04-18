import requests
from datetime import datetime

EXCHANGE_API = "https://open.er-api.com/v6/latest/LKR"

def get_exchange_rate(from_currency, to_currency):
    """
    Fetch exchange rate between two currencies.
    Handles LKRt as base and converts between any supported pairs.
    """
    try:
        if from_currency == "LKRt":
            # Convert from LKR to foreign currency
            response = requests.get(EXCHANGE_API)
            data = response.json()
            return data["rates"].get(to_currency)
        
        elif to_currency == "LKRt":
            # Convert from foreign currency to LKR
            response = requests.get(EXCHANGE_API)
            data = response.json()
            rate_to_lkr = 1 / data["rates"].get(from_currency, 1)
            return rate_to_lkr
        
        else:
            # Convert between two foreign currencies via LKR
            response = requests.get(EXCHANGE_API)
            data = response.json()
            from_rate = data["rates"].get(from_currency, 1)
            to_rate = data["rates"].get(to_currency, 1)
            return to_rate / from_rate
            
    except Exception as e:
        print(f"Error fetching exchange rate: {e}")
        return None

def conversion_contract(blockchain, user_wallet, from_currency, to_currency, amount):
    """
    Enhanced smart contract for instant multi-currency conversion.
    
    Args:
        blockchain: The blockchain instance
        user_wallet: User's wallet address
        from_currency: Source currency (LKRt or foreign)
        to_currency: Target currency (LKRt or foreign)
        amount: Amount to convert
    
    Returns:
        dict: Conversion details including balances and exchange rate
    
    Features:
        - Instant conversion with real-time exchange rates
        - Supports LKRt ↔ Foreign and Foreign ↔ Foreign conversions
        - Balance verification and atomic operations
        - Transaction logging on blockchain
    """
    
    # 1. Determine source balance key
    if from_currency == "LKRt":
        from_key = user_wallet
    else:
        from_key = f"FXT_{from_currency}_{user_wallet}"
    
    # 2. Check source balance
    source_balance = blockchain.balances.get(from_key, 0)
    if source_balance < amount:
        raise Exception(f"Insufficient {from_currency} balance. Available: {source_balance}")
    
    # 3. Get real-time exchange rate
    exchange_rate = get_exchange_rate(from_currency, to_currency)
    if exchange_rate is None:
        raise Exception("Exchange rate unavailable. Please try again later.")
    
    # 4. Calculate converted amount
    converted_amount = round(amount * exchange_rate, 2)
    
    # 5. Deduct from source currency
    blockchain.balances[from_key] = source_balance - amount
    
    # 6. Determine target balance key
    if to_currency == "LKRt":
        to_key = user_wallet
    else:
        to_key = f"FXT_{to_currency}_{user_wallet}"
    
    # 7. Credit to target currency
    current_target_balance = blockchain.balances.get(to_key, 0)
    blockchain.balances[to_key] = current_target_balance + converted_amount
    
    # 8. Create conversion transaction record
    conversion_tx = {
        "type": "CONVERSION",
        "wallet": user_wallet,
        "from_currency": from_currency,
        "to_currency": to_currency,
        "amount_converted": amount,
        "amount_received": converted_amount,
        "exchange_rate": exchange_rate,
        "timestamp": datetime.now().isoformat()
    }
    
    # 9. Add to pending transactions for blockchain record
    blockchain.pending_transactions.append(conversion_tx)
    
    # 10. Return conversion details
    return {
        "amount_received": converted_amount,
        "exchange_rate": exchange_rate,
        "from_balance": blockchain.balances.get(from_key, 0),
        "to_balance": blockchain.balances.get(to_key, 0),
        "timestamp": conversion_tx["timestamp"]
    }