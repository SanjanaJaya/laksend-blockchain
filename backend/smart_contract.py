import requests

EXCHANGE_API = "https://open.er-api.com/v6/latest/LKR"  # Example API

def get_exchange_rate(to_currency):
    """Fetch the exchange rate from LKR to the target currency."""
    url = EXCHANGE_API
    try:
        response = requests.get(url)
        data = response.json()
        return data["rates"].get(to_currency)
    except Exception as e:
        print("Error fetching exchange rate:", e)
        return None

def lkr_to_foreign(lkr_amount, foreign_currency):
    """Convert LKR amount to foreign currency."""
    rate = get_exchange_rate(foreign_currency)
    if rate is None:
        raise Exception("Exchange rate unavailable")
    return round(lkr_amount * rate, 2)

def conversion_contract(blockchain, user_wallet, lkr_amount, foreign_currency):
    """
    Smart contract for currency conversion.
    
    Args:
        blockchain: The blockchain instance to operate on
        user_wallet: The user's wallet address
        lkr_amount: Amount of LKRt to convert
        foreign_currency: Target currency code (e.g., 'USD', 'EUR')
    
    Returns:
        fx_amount: The converted foreign currency amount
    
    Process:
        1. Check wallet balance
        2. Get exchange rate from oracle
        3. Deduct LKRt, credit FXT (foreign token) to user's wallet
        4. Record conversion event in blockchain
    """
    # Check if user has sufficient LKRt balance
    user_lkr_balance = blockchain.get_balance(user_wallet)
    if user_lkr_balance < lkr_amount:
        raise Exception("Insufficient LKRt balance.")
    
    # Get exchange rate and calculate foreign currency amount
    fx_amount = lkr_to_foreign(lkr_amount, foreign_currency)
    
    # Deduct LKRt from user's wallet
    blockchain.balances[user_wallet] -= lkr_amount
    
    # Credit foreign currency token (FXT) to user's wallet
    fx_key = f"FXT_{foreign_currency}_{user_wallet}"
    blockchain.balances[fx_key] = blockchain.balances.get(fx_key, 0) + fx_amount
    
    return fx_amount