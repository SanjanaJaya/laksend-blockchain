# LAKSEND — Blockchain Based Online Money Transaction System

LAKSEND is a secure, decentralized-style, peer-to-peer web payment portal built as a **Blockchain Based Online Money Transaction System** for my final year project. 

The system leverages a custom-built blockchain engine in Python, securing transfers of a tokenized local currency—**LKRt** (Sri Lankan Rupee token)—using cryptographic key pairs, zero-knowledge-style key custody models, double-spend concurrency mitigations, and automated multi-currency smart contracts.

---

## 🔒 Security Architecture & Threat Model

As a computer security project, LAKSEND is designed around a rigorous **defense-in-depth** model to mitigate common vulnerabilities associated with centralized payment systems and distributed ledgers.

### 1. Zero-Knowledge-Style Key Custody & Encryption-at-Rest
To prevent database compromise from exposing user funds, LAKSEND enforces self-custody principles:
* **Asymmetric Cryptography**: Every wallet uses an **ECDSA key pair** on the `SECP256k1` curve (standardized by Bitcoin/Ethereum). Wallet addresses are derived using the SHA-256 hash of the public key.
* **AES-CBC Symmetric Encryption**: Raw private keys are never stored on the server in plaintext. Instead, they are encrypted using **Fernet (AES-128 in CBC mode with HMAC-SHA256)**.
* **Password-Derived Keys**: The encryption key is derived directly from the user's password using a SHA-256 digest. The server only performs temporary decryption in memory to sign transactions, dropping the plaintext key immediately afterward.
* **Secure Key Rotation (Rekeying)**: If a user resets their password via Email OTP, the database password hash updates, but the private key remains encrypted under the old password (preventing an attacker with transient email access from stealing the wallet). To restore transfers, the user must call the `/rekey-wallet` API, proving knowledge of both the **old** and **new** passwords to safely decrypt and re-encrypt the key.

### 2. Double-Spend & TOCTOU Prevention
In distributed ledgers, double-spending is a critical risk. If a user triggers concurrent requests, they could exploit a **Time-of-Check to Time-of-Use (TOCTOU)** race condition to transfer more than their available balance.
* **Backend Mutex Locks**: In FastAPI, critical transactions are protected by a threading mutex lock (`transfer_lock`).
* **Atomic Processing Block**: The lock guarantees that checking the balance, signing the transaction, pushing to the pool, and mining the new block are completed sequentially for each request. No concurrent thread can inspect a stale balance.

### 3. Transaction Integrity & Cryptographic Signatures
* **Non-Repudiation**: Transactions require the sender's signature, created by hashing the transaction details (sender, receiver, amount) and signing it with the sender's private key.
* **Replay Attack Mitigation**: Each block incorporates timestamps and previous block hashes. The blockchain ledger validates that every transaction is uniquely signed and mapped to verified states.
* **Chain Integrity**: The ledger is audited continuously by validating:
  $$\text{Block Hash} == \text{SHA256(index, timestamp, transactions, previous\_hash, nonce)}$$
  and confirming that the hash meets the dynamic Proof-of-Work difficulty target (leading zeros).

### 4. Defense-in-Depth Authentication (2FA/OTP)
* **2-Factor Email OTP**: Powered by the Brevo SMTP API, 6-digit session-bound OTP codes are sent for:
  1. Signup registration verification.
  2. Outbound transfer authorization (2FA threshold check).
  3. Forgot-password verification requests.
* **Session Lifecycle**: OTP codes expire after 5 to 10 minutes and are instantly consumed upon verification, rendering replay attempts impossible.

---

## 🚀 Core Features

* **Custom Blockchain Engine**: Implemented from scratch in Python featuring Genesis block creation, SHA-256 block hashing, and a naive difficulty-adjustment algorithm to regulate mining speeds.
* **Dynamic Smart Contracts**: Multi-currency conversion contract executing instant swaps between LKRt and foreign holdings (USD, EUR, GBP, etc.) using live API exchange rates.
* **Progressive Web App (PWA) Client**: Single-page application designed with vanilla HTML5/CSS3/JS. Features responsive glassmorphic layouts, dynamic dark mode, and a service worker for offline asset caching.
* **QR Payment Portal**: Generates custom payment request QR codes and supports scanning via device camera (`jsQR`) or saved image upload.
* **Automated PDF Receipt Generation**: Generates official transfer receipts locally on the frontend using `jsPDF`.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend Framework** | Python, FastAPI, Uvicorn |
| **Database & Persistence** | Supabase PostgreSQL Client (Database level), JSON Ledger (Blockchain level) |
| **Security & Cryptography** | `ecdsa` (SECP256k1), `cryptography` (Fernet AES), hashlib (SHA-256) |
| **Frontend UI/UX** | Vanilla HTML5, Vanilla CSS3 (Custom Glassmorphism), PWA Service Workers |
| **Frontend Libraries** | jsQR (QR scanner), qrcodejs (QR generator), jsPDF (Receipt generator) |
| **Communication / SMTP** | Brevo HTTP API (Email OTP delivery) |

---

## 📁 Project Structure

```text
├── backend/
│   ├── main.py              # FastAPI application & REST endpoints
│   ├── blockchain.py        # Block & Blockchain protocol core logic
│   ├── wallet.py            # Key generation, ECDSA signing, Fernet encryption
│   ├── transaction.py       # Transaction structures and validation rules
│   ├── database.py          # Supabase database integration
│   ├── smart_contract.py    # FX conversion contract using live exchange rates
│   └── requirements.txt     # Backend-specific dependencies
├── frontend/
│   ├── index.html           # Main Single-Page PWA Interface
│   ├── style.css            # Custom CSS styles, theme variables, glassmorphic styles
│   ├── script.js            # Frontend logic, API integration, and QR/PDF handling
│   ├── ui-patch.js          # Client-side UI enhancements
│   ├── sw.js                # PWA Service Worker for offline asset management
│   └── manifest.json        # PWA application metadata config
├── requirements.txt         # Root project Python dependencies
└── README.md                # Project documentation
```

---

## ⚙️ Installation & Setup

### Prerequisites
* Python 3.10+
* Supabase Project credentials
* Brevo API Key (for SMTP/OTP functionality)

### 1. Backend Setup
Clone the repository, navigate to the backend directory, and install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:
```env
SUPABASE_URL="your_supabase_project_url"
SUPABASE_KEY="your_supabase_anon_key"
BREVO_API_KEY="your_brevo_smtp_api_key"
APP_EMAIL="your_sender_email@gmail.com"
APP_EMAIL_NAME="LAKSEND"
```

Start the FastAPI development server:
```bash
python main.py
```
The API documentation will be available at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup
The frontend is a lightweight, serverless PWA. You can run it locally using any static file server or simply open the index file:
```bash
cd ../frontend
# Using Python to spin up a quick server
python -m http-server 5500
```
Open your browser and navigate to `http://localhost:5500` (or the local network address to test QR scanning on mobile devices).

---

## 📡 API Reference Endpoints

| Method | Endpoint | Description | Auth Requirement |
| :--- | :--- | :--- | :--- |
| **POST** | `/signup` | Creates a new user profile, generates ECDSA wallet, encrypts keys, and sends verification OTP. | None |
| **POST** | `/verify-otp` | Verifies signup OTP and activates account database entry. | None |
| **POST** | `/login` | Authenticates username/password; returns user metadata and checks key encryption. | None |
| **POST** | `/request-transfer-otp`| Generates and emails a 6-digit OTP code to authorize a transaction. | Password verification |
| **POST** | `/transfer` | Executes LKRt transfer between wallets, validates signature, and mines the transaction block. | Password + Email OTP |
| **POST** | `/convert` | Swaps LKRt ↔ foreign currency holdings on-chain via smart contract. | Wallet address session |
| **GET** | `/blockchain` | Returns the entire chain history and validates block integrity. | Public |
| **POST** | `/rekey-wallet` | Re-encrypts user's private key with a new password hash after recovery. | Old & New password |
| **POST** | `/qr/generate` | Generates a structured JSON string containing payment details for QR codes. | Session active |
| **GET** | `/transactions/{address}`| Fetches the transaction log for a specific wallet address from the ledger. | Public |

---

## 🛡️ License
This project is licensed under the MIT License. Developed as part of a B.Sc. in Computer Security / Software Engineering.
