# Ultra API - Order & Execute with Referral Accounts Script

This script demonstrates how to get a quote for an order, and then execute the order using the Jupiter Ultra API while using referral accounts to collect fees.

## Prerequisites

- Node.js (v16 or higher)
- npm (v10 or higher)
- Solana Wallet Public Address
- Solana Wallet Private Key

## Usage

1. Clone the repository

```bash
git clone https://github.com/Jupiter-DevRel/typescript-examples.git
```

2. Navigate to the `ultra/order-execute-with-referral-accounts` directory

```bash
cd ultra/order-execute-with-referral-accounts
```

3. Install the dependencies

```bash
npm install
```

4. Run the script

```bash
npm run example
```

## Helper Scripts

- [Create Referral Account](src/scripts/create-referral-account.ts)
- [Create Referral Token Account](src/scripts/create-referral-token-account.ts)
- [Get Referral Account](src/scripts/get-referral-account.ts)
- [Get Referral Token Account](src/scripts/get-referral-token-account.ts)
- [Claim All Fees](src/scripts/claim-all-fees.ts)

### Create Referral Account

```bash
npm run create-referral-account
```

### Create Referral Token Account

```bash
npm run create-referral-token-account
```

### Get Referral Account

```bash
npm run get-referral-account
```

### Get Referral Token Account

```bash
npm run get-referral-token-account
```

### Claim All Fees

```bash
npm run claim-all-fees
```
