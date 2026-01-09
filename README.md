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

## 3. Step-by-Step Implementation

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

### Step 3: Verify Available Destinations
Before selecting a country, you should verify which destinations are currently supported and their specific requirements/currencies.

*   **Endpoint**: `GET .../payout/{sourceCountry}/destinations`

```bash
# Fetch available destinations from US
curl --request GET \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/payout/us/destinations \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

### Step 4: Quoting (Pricing)
Before sending, you must lock in the exchange rate. The `quoteId` guarantees the rate for a fixed window.

*   **FX Spread**: Your specific FX spread (margin) per corridor is configured by Inyo during the onboarding phase.
*   **Fees**: A default per-transaction fee is also configured. **Depending on your contract type**, you may be able to override this fee at the quote level (e.g., offering a "Zero Fee" promotion).
*   **Endpoint**: `POST .../payout/quotes`
*   **Amount Type**: `GROSS` or `NET` 
    *   **NET**: If fee is 4 dollars and transaction is 100, consumer will be charged 104 dollars and 100 dollars will be converted to the target currency.
    *   **GROSS**: If fee is 4 dollars and transaction is 100, consumer will be charged 100 dollars and 96 dollars will be converted to the target currency.


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
  },
  "amountType": "GROSS|NET"
}'
```

### Step 5: Beneficiary (Recipient) Setup
A beneficiary is simply another "Person" entity, but created with the intent of receiving funds. **Crucially, the data requirements vary by country.**

*   **Action 1: Dynamic Data Collection (Schemas)**
    *   Before asking the user for details, you **must fetch the specific schemas** for the destination country (e.g., 'MX', 'IN', 'US').
    *   These schemas define exactly which fields (e.g., 'CLABE' for Mexico vs 'IFSC' for India) are mandatory.
    *   **Person Schema Endpoint**: `GET .../payout/recipients/schema/{countryCode}`
    *   **Account Schema Endpoint**: `GET .../payout/recipientAccounts/schema/{countryCode}`

```bash
# Fetch Person Schema for Peru (PE)
curl --request GET \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/payout/recipients/schema/pe \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"

# Fetch Account Schema for Peru (PE)
curl --request GET \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/payout/recipientAccounts/schema/pe \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

*   **Action 3: Create the Person**
    *   Use the fields from the recipient schema to call `POST .../people`.

### Step 6: Beneficiary Account (Funding)

*   **Action 1: Fetch Bank List (for Dropdowns)**
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

*   **Action 2: Link a Bank Account**
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

### Step 7: Secure Funding (Payment Methods)
You must secure the source of funds. You can choose between **Debit Card** or **US Bank Account (ACH)**.

#### Option A: Debit Card (Instant)
1.  **Tokenization**: The frontend sends the raw card details to a Tokenizer to get a secure `token`.
2.  **Registration**: Send this token to the API to create a **Funding Account**.

> **Note on 3D Secure**: Some cards may require additional authentication. See [3DS Challenge Procedure](#3ds-challenge-procedure) for details.

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

#### Option B: US Bank Account (ACH)
For ACH, you provide the routing and account number directly (secured by SSL in production).

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
  "nickname": "My Checking",
  "paymentMethod": {
    "type": "ACH",
    "countryCode": "US",
    "bankCode": "US_ACH",
    "routingNumber": "123456789",
    "accountNumber": "000123456789",
    "accountType": "CHECKING"
  }
}'
```

### Step 8: Transaction Limits & Trust Levels
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

### Step 9: Execution (The Transaction)
Finally, link all the IDs together to execute the payout.

**Device Fingerprinting (Required)**:
Inyo provides a client-side device fingerprinting library. This library **MUST** be executed before the transaction call. The output (`requestId` and `visitorId`) must be passed in the `additionalData` object.

*   **Endpoint**: `POST .../fx/transactions`
*   **Payload References**:
    *   `senderId` (Step 1)
    *   `recipientId` (Step 3 - Person ID)
    *   `fundingAccountId` (Step 4)
    *   `recipientAccountId` (Step 3 - Account ID)
    *   `quoteId` (Step 5)
    *   `additionalData` (Fingerprint Results)

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
  },
  "additionalData": {
    "fingerprint": "req_12345_from_lib",
    "visitor": "vis_67890_from_lib"
  }
}'
```

---

### Step 10: Issuing the Receipt (Regulated)
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

### Step 11: Register Webhooks
To receive real-time notifications about important lifecycle events (e.g., a transaction status update from `PENDING` to `COMPLETED`), you must register a callback URL.

**Supported Events**:
*   `transactionStatusChanged`
*   `agentUpdatedEvents`
*   `documentUpdatedEvents`

*   **Endpoint**: `POST .../webhooks`

```bash
curl --request POST \
  --url https://api.sandbox.hubcrossborder.com/organizations/$TENANT/webhooks \
  --header 'Content-Type: application/json' \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY" \
  --data '{
  "events": [
    "transactionStatusChanged",
    "documentUpdatedEvents",
    "agentUpdatedEvents"
  ],
  "url": "https://your-server.com/api/webhooks"
}'
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
| `beneficiary_accounts` | Maps recipient bank accounts -> Inyo `externalId` (Account ID). |
| `quotes` | Stores active quotes and exchange rates for users. |
| `payment_methods` | Stores funding sources (Cards, ACH) and tokens. |
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

## 6. Testing Data

You can find card data for testing purposes at:
[https://dev.inyoglobal.com/api-references/payments-gateway/apis/test-data/cards](https://dev.inyoglobal.com/api-references/payments-gateway/apis/test-data/cards)

> **Important**: To successfully test transactions, it is required to use a combination of cards **with** and **without** 3D Secure (3DS).

### 3DS Challenge Procedure
For cards enabled with 3DS, the bank requires an additional authentication step known as a "challenge". This procedure is implemented in this demo using a mix of JavaScript, iframes, and server-side validation.

**Technical Implementation:**

1.  **Challenge Trigger**: If the initial tokenization response from the API returns `status: 'ActionRequired'`, the application:
    *   Saves the card locally with a `Pending` status.
    *   Displays a full-screen iframe loading the provided `redirectAcsUrl`.

2.  **Frontend Event Listener**:
    *   The application listens for a `postMessage` event from the iframe.
    *   It waits specifically for a payload confirming the transaction:
        ```javascript
        if (response.status == 'AUTHORIZED' && response.cvcResult == 'APPROVED' && response.avsResult == 'APPROVED')
        ```

3.  **Server-Side Verification (Sync)**:
    *   Once the frontend receives the success message, it triggers a backend sync call: `GET /api/payment-methods/:id/sync`.
    *   The backend performs a server-to-server request to the Gateway API (`GET .../payout/fundingAccounts/{externalId}`) to confirm the status is officially `Verified`.
    *   Only upon this upstream confirmation is the local database updated, unlocking the card for use.

### Additional Resources
For more details on handling AVS, CVC, and 3D Secure Verification, please refer to the official documentation:

*   [Handling AVS & CVC Results](https://dev.inyoglobal.com/api-references/payments-gateway/apis/payment/pulling-funds/cards/authorizing/handling-avs-cvc)
*   [Handling 3D Secure (3DS)](https://dev.inyoglobal.com/api-references/payments-gateway/apis/payment/pulling-funds/cards/authorizing/handling-3d-secure)
