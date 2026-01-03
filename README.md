# Inyo Remittance Platform - Developer Implementation Guide

> **Note**: This reference implementation demonstrates how to build a compliant remittance application using the **Inyo API**. It is **NOT** intended for production usage. It your sole responsibility to implement all necessary security best practices and compliance measures available in the official integration manual.

## 1. Introduction & Architecture

This application mimics a real-world **Cross-Border Payments System**. To achieve security and compliance, it utilizes a **Backend-for-Frontend (BFF)** pattern.

### The "BFF" Pattern (Why it matters)
Direct communication between a Frontend (Browser/Mobile) and the Inyo Core API is **forbidden** for security reasons (API Keys must never be exposed).

1.  **Frontend (React)**: Collects user data & intent.
2.  **Middleware (Node.js)**: 
    *   Authenticates the user (JWT).
    *   Holds the **API Secrets** (`API_KEY`, `AGENT_KEY`).
    *   Orchestrates calls to the **Inyo Sandbox**.
3.  **Inyo API**: The financial engine handling KYC, Banking, and Settlements.

---

## 2. Setup & Configuration

### Prerequisites
*   Node.js v18+
*   npm or yarn

### Environment Variables (.env)
You must configure your credentials to authenticate with the sandbox environment.

### Rate Limiting & Caching (Best Practice)
The Inyo API enforces strict rate limits. To ensure robustness, you should implement caching for static or semi-static data.
*   **Destinations & Banks**: Cache these responses for **24 hours**. They rarely change.
*   **Compliance Limits**: Cache `GET /limits` references for **24 hours** or until a transaction occurs.
*   **Quotes**: Do *not* cache quotes as they expire quickly.

```env
# Server Configuration
PORT=3001
JWT_SECRET=local_dev_secret_8923

# Inyo API Credentials (Sandbox)
EXTERNAL_API_URL=https://api.sandbox.hubcrossborder.com
TENANT=your_tenant_id           # Your Organization ID
API_KEY=your_api_key            # x-api-key
AGENT_ID=your_agent_id          # x-agent-id
AGENT_KEY=your_agent_key        # x-agent-api-key
```

### Installation
```bash
npm install
npm run dev:full
```

---

## 3. The "Golden Path" (Step-by-Step Implementation)

This section details the exact lifecycle of a transaction. For each step, we provide the **Context**, the **API Endpoint**, and a **Sample cURL** command so you can test it independently.

> **Tip**: Replace `$TENANT`, `$API_KEY`, etc., with your actual credentials.

### Step 1: Sender Onboarding (KYC)
Before a user can send money, they must be registered as a **Participant** ("Person") in the system. This triggers KYC/AML checks.

*   **Endpoint**: `POST /organizations/{tenantId}/people`
*   **Critical Data**: You must save the returned `id`. This is the `externalId` used for all future compliance checks and transactions.

```bash
curl --request POST \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/people \
  --header 'Content-Type: application/json' \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY" \
  --data '{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "birthDate": "1990-01-01",
  "phoneNumber": "+15550101234",
  "address": {
    "countryCode": "US",
    "stateCode": "CA",
    "city": "San Francisco",
    "line1": "123 Market St",
    "zipcode": "94105"
  },
  "documents": [
    {
      "type": "DRIVER_LICENSE",
      "document": "D12345678",
      "countryCode": "US",
      "issuer": "CA",
      "expireDate": "2030-12-31"
    }
  ]
}'
```

### Step 2: Compliance Verification
Once created, you must verify the user's status. If they are "Restricted", you cannot proceed.

*   **Endpoint**: `GET .../participants/{personId}/complianceLevels`

```bash
curl --request GET \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/participants/$SENDER_ID/complianceLevels \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

### Step 3: Beneficiary (Recipient) Setup
A beneficiary is simply another "Person" entity, but created with the intent of receiving funds. **Crucially, the data requirements vary by country.**

*   **Action 1: Dynamic Data Collection (Schemas)**
    *   Before asking the user for details, you **must fetch the specific schemas** for the destination country (e.g., 'MX', 'IN', 'US').
    *   These schemas define exactly which fields (e.g., 'CLABE' for Mexico vs 'IFSC' for India) are mandatory.
    *   **Person Schema Endpoint**: `GET .../payout/recipients/schema/{countryCode}`
    *   **Account Schema Endpoint**: `GET .../payout/recipientAccounts/schema/{countryCode}`

```bash
# Fetch Account Schema for Peru (PE)
curl --request GET \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/payout/recipientAccounts/schema/pe \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

*   **Action 2: Fetch Bank List (for Dropdowns)**
    *   If the Account Schema includes a `bankCode` field (common in LATAM/Asia), you should fetch the list of valid banks to populate a dropdown.
    *   **Bank List Endpoint**: `GET .../payout/{countryCode}/banks`

```bash
# Fetch List of Banks in Peru
curl --request GET \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/payout/PE/banks?size=100 \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

*   **Action 3**: Create the Person
    *   Use the fields from the recipient schema to call `POST .../people`.

*   **Action 4**: Link a Bank Account
    *   Use the fields from the account schema to call `POST .../participants/{recipientId}/recipientAccounts/gateway`.

```bash
# Link a Peru (PE) Bank Account (Schema-specific fields)
curl --request POST \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/payout/participants/$RECIPIENT_ID/recipientAccounts/gateway \
  --header 'Content-Type: application/json' \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY" \
  --data '{
  "externalId": "12312341",
  "asset": "PEN",
  "payoutMethod": {
    "type": "BANK_DEPOSIT",
    "countryCode": "PE",
    "bankCode": "BINPPEPL",
    "routingNumber": "1234",
    "accountNumber": "1345",
    "accountType": "CHECKING"
  }
}'
```

### Step 4: Secure Funding (Payment Methods)
You must secure the source of funds (e.g., a Debit Card).

1.  **Tokenization**: The frontend sends the raw card details to a Tokenizer to get a secure `token`.
2.  **Registration**: Send this token to the API to create a **Funding Account**.
*   **Endpoint**: `POST .../participants/{senderId}/fundingAccounts`

```bash
curl --request POST \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/payout/participants/$SENDER_ID/fundingAccounts \
  --header 'Content-Type: application/json' \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY" \
  --data '{
  "externalId": "'$(uuidgen)'",
  "asset": "USD",
  "nickname": "My Debit Card",
  "paymentMethod": {
    "type": "CARD",
    "token": "tok_12345_from_tokenizer",
    "billingAddress": {
      "countryCode": "US",
      "stateCode": "CA",
      "city": "San Francisco",
      "line1": "123 Market St",
      "zipcode": "94105"
    }
  }
}'
```

### Step 5: Quoting (Pricing)
Before sending, you must lock in the exchange rate. The `quoteId` guarantees the rate for a fixed window.

*   **Endpoint**: `POST .../payout/quotes`

```bash
curl --request POST \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/payout/quotes \
  --header 'Content-Type: application/json' \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY" \
  --data '{
  "fromCurrency": "USD",
  "toCurrency": "MXN",
  "amount": 100.00,
  "fee": {
    "amount": 1.00,
    "currency": "USD"
  }
}'
```

### Step 6: Transaction Limits & Trust Levels
Before executing a transaction, it is crucial to verify that the user has not exceeded their assigned limits.

*   **Trust Levels**: Users are assigned a Trust Level (e.g., **Level 1, 2, or 3**) by the Compliance team. This level is determined by the amount of verification documentation provided (KYC).
*   **Time Windows**: Limits are calculated across three rolling windows: **24 Hours**, **30 Days**, and **180 Days**.
*   **Upgrading**: You can query the API to see exactly which fields (e.g., "Occupation", "ID Document") are missing to upgrade to the next level.

> **UI Implementation Reference**: See `src/components/Sidebar.jsx` (Left Menu Widget) and `src/pages/Compliance.jsx` for examples of how to visualize usage and requirements.

**Check Limits & Usage**:
*   **Endpoint**: `GET .../fx/participants/{id}/limits`

```bash
curl --request GET \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/fx/participants/$SENDER_ID/limits \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

**Check Trust Level & Upgrade Requirements**:
*   **Endpoint**: `GET .../participants/{id}/complianceLevels`

```bash
curl --request GET \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/participants/$SENDER_ID/complianceLevels \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

### Step 7: Execution (The Transaction)
Finally, link all the IDs together to execute the payout.

*   **Endpoint**: `POST .../fx/transactions`
*   **Payload References**:
    *   `senderId` (Step 1)
    *   `recipientId` (Step 3 - Person ID)
    *   `fundingAccountId` (Step 4)
    *   `recipientAccountId` (Step 3 - Account ID)
    *   `quoteId` (Step 5)

```bash
curl --request POST \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/fx/transactions \
  --header 'Content-Type: application/json' \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY" \
  --data '{
  "externalId": "'$(uuidgen)'",
  "senderId": "$SENDER_ID",
  "recipientId": "$RECIPIENT_ID",
  "fundingAccountId": "$FUNDING_ACCOUNT_ID",
  "recipientAccountId": "$RECIPIENT_ACCOUNT_ID",
  "quoteId": "$QUOTE_ID",
  "deviceData": {
    "userIpAddress": "127.0.0.1"
  }
}'
```

---

### Step 8: Issuing the Receipt (Regulated)
**Critical Requirement**: As the agent of a Money Service Business (MSB), you are **legally required** to issue a receipt to the sender immediately after the transaction is submitted. Follow the template provided by Inyo during the contract phase.

*   You **MUST NOT** alter the core financial data returned by the Inyo API.
*   The receipt must include:
    1.  **Exchange Rate**: Explicitly showing the locked-in rate.
    2.  **Fees**: Total fees charged to the customer.
    3.  **Total Amount**: Full amount paid by the sender.
    4.  **Receive Amount**: Exact amount to be received by the beneficiary.
    5.  **Regulatory Disclosures**: The `receipt` object contains dynamic legal text specific to the corridor (e.g., "Right to Refund", "Cancellation Disclosure"). You must display these texts **verbatim**.

**Sample Transaction Response (extract for Receipt)**:
```json
{
  "id": "txn_12345",
  "status": "PENDING",
  "receipt": {
    "contactInfo": "For questions contact Inyo support...",
    "rightToRefund": "You have a right to dispute errors...",
    "cancellationDisclosure": "You can cancel for a full refund within 30 minutes..."
  },
  "totalAmount": { "amount": 101.00, "currency": "USD" },
  "fee": { "amount": 1.00, "currency": "USD" },
  "receivingAmount": { "amount": 1950.00, "currency": "MXN" },
  "destinationExchangeRate": { "rate": 19.50 }
}
```

---

## 4. Database & Security

### Database Schema (SQLite)
The application maintains a local mapping of IDs.

| Table | Purpose |
| :--- | :--- |
| `users` | Local Auth (Email/Password). |
| `profiles` | Maps `userId` -> Inyo `externalId` (Sender ID). |
| `beneficiaries` | Maps local recipients -> Inyo `externalId` (Recipient ID). |
| `transactions` | Stores history and status. |

### Security Implementation
*   **JWT Isolation**: All local API routes use `req.user.id` from the decoded token.
*   **Ownership Checks**: Before executing `POST /transactions`, the middleware verifies that the `beneficiaryId` and `paymentMethodId` actually belong to the authenticated user in the database.

## 5. Troubleshooting Common Errors

| Error | Cause | Fix |
| :--- | :--- | :--- |
| `401 Unauthorized` | Invalid API Keys in `.env`. | Verify `TENANT`, `API_KEY`, and `AGENT_KEY`. |
| `403 Compliance` | User is restricted. | Check `GET /complianceLevels` response. Missing ID document? |
| `400 Missing Data` | Incomplete Profile. | Ensure Profile step is completed and `externalId` is saved. |
| `429 Too Many Requests` | Rate limiting. | Implement caching (e.g., `node-cache` or Redis) for Limits/Quotes. |
