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
    *   Orchestrates calls to the **Inyo test environment** (what the docs call *Sandbox*).
3.  **Inyo API**: The financial engine handling KYC, Banking, and Settlements.

---

## 2. Setup & Configuration

### Prerequisites
*   Node.js v22 (see `.nvmrc`)
*   npm or yarn
*   Network access to the Inyo test environment: a Cloudflare mTLS client certificate **and** an allowlisted egress IP. A `403` with an HTML body means the IP is not allowlisted.

### Frontend stack
*   React 19 + Vite 7, React Router 7
*   Tailwind CSS v4 (`@tailwindcss/vite`) with design tokens in `src/index.css` (`@theme`)
*   `lucide-react` icons, shared UI primitives in `src/components/ui/`
*   Country-specific forms are generated from the Inyo JSON schemas by `src/components/SchemaForm.jsx`

### Environment Variables (.env)
You must configure your credentials to authenticate with the test environment. The docs call it **Sandbox** and write its host as `https://{FQDN}`: Inyo gives you the FQDN together with the tenant and agent credentials at onboarding. For the Remittances API this is currently `https://api.stage.inyoplatform.com`; the older `api.sandbox.inyoplatform.com` host answers `403 blocked` and is not the Remittances test core.

### mTLS (Cloudflare Mutual TLS)
All requests to the Inyo API are protected by Cloudflare mTLS. You must provide your client certificate and private key as environment variables.

**How to configure:**
1. Open your `.env` file
2. Add `MTLS_CERT` with the full content of your `.pem` certificate file (wrapped in double quotes)
3. Add `MTLS_KEY` with the full content of your `.key` private key file (wrapped in double quotes)

```env
MTLS_CERT="-----BEGIN CERTIFICATE-----
MIIEFTCCAv2g...
-----END CERTIFICATE-----"

MTLS_KEY="-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBg...
-----END PRIVATE KEY-----"
```

> **Note**: The double quotes are required for dotenv to parse multi-line values correctly. If either variable is missing, the server will start without mTLS and API calls will be rejected by Cloudflare.

### Rate Limiting & Caching (Best Practice)
The Inyo API enforces strict rate limits. To ensure robustness, you should implement caching for static or semi-static data.
*   **Destinations & Banks**: Cache these responses for **24 hours**. They rarely change.
*   **Compliance Limits**: Cache `GET /limits` references for **24 hours** or until a transaction occurs.
*   **Quotes**: Do *not* cache quotes as they expire quickly.

```env
# Server Configuration
PORT=3001
JWT_SECRET=local_dev_secret_8923

# Inyo API Credentials (test environment; the FQDN is given at onboarding)
EXTERNAL_API_URL=https://{FQDN}
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

*   **Endpoint**: `POST /organizations/{tenantId}/v2/senders` (updates: `PATCH /v2/senders/{id}`). The `/people` endpoints are deprecated; v2 runs the rule-driven document validation and synchronous KYC number checks.
*   **Critical Data**: You must save the returned `id`. This is the `externalId` used for all future compliance checks and transactions.
*   **Document types** are lowercase on v2 (`passport`, `drivers_license`, `cpf`, ...); US driver's licenses need `stateCode`. The SSN is a document too (`{"type": "ssn", "document": "078051120", "countryCode": "US"}`) and is one of the Level 2 requirements next to a verified ID; `phoneNumber` is E.164.

```bash
curl --request POST \
  --url https://{FQDN}/organizations/$TENANT/v2/senders \
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
      "type": "drivers_license",
      "document": "D12345678",
      "countryCode": "US",
      "stateCode": "CA",
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
  --url https://{FQDN}/organizations/$TENANT/participants/$SENDER_ID/complianceLevels \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

### Step 2b: Identity Verification (KYC widget)
Documents declared in Step 1 are *numbers*; to verify the document itself, open an Inyo360 verification session. The docs recommend this over the deprecated direct uploads.

*   `POST /organizations/{tenantId}/v2/senders/{senderId}/kycSession` with `language` and `redirectUrl` returns `sessionId`, `status` and a single-use `widgetUrl` (valid 48 h). The document is picked from the sender's declared documents (driver's license, then passport, then ID cards); without a non-expired one the call returns `422 NO_VERIFIABLE_DOCUMENT`.
*   The widget is a hosted page with no SDK or iframe API: redirect, open a webview, or send the link. It needs the camera, so HTTPS or `http://localhost`.
*   The outcome arrives through the `DocumentUpdatedEvents` webhook; `GET …/kycSession/{sessionId}` is the fallback the sample uses. States: `PENDING` → `VERIFIED` | `REJECTED` | `PENDING_REVIEW` | `SUPERSEDED` | `FAILED` | `ERRORED` | `EXPIRED`.
*   In sandbox every verdict is held as `PENDING_REVIEW` and nobody reviews it: settle it with `POST …/kycSession/{sessionId}/resolve` (`outcome: verified|rejected`, `reason`), sandbox/staging only. Reserved document numbers (passport `999003001`, PA driver's license `99900101`) decide the session at creation without a camera.

*   `redirectUrl` must be a non-loopback URL: requests whose body mentions `localhost` or `127.0.0.1` are rejected (`422 KYC_VALIDATION_ERROR`). The sample builds it from `APP_URL`; for local development `APP_URL=http://lvh.me:3000` works out of the box (`lvh.me` resolves to 127.0.0.1) and the app must be opened from that origin, since the login session is per origin.

In the sample this lives on the Compliance page (`/api/kyc/session`, `/api/kyc/session/:id/resolve`).

### Step 2c: Proof of Source of Funds (Level 3)
Level 3 needs a verified proof of funds (bank statement, pay stub). It is a file upload, not a widget:

*   `POST /organizations/{tenantId}/people/{senderId}/documents/sourceOfFunds/upload`, `multipart/form-data` with `file` (pdf/jpg/jpeg/png, max 10 MB). Stored as `PROOF_OF_FUNDS`, returns `201` with the document `id` and `verificationStatus: PENDING`.
*   Verified asynchronously (AI OCR or the compliance team); status via `GET /organizations/{tenantId}/documents/{documentId}/verificationStatus[/current]`, uploads via `GET /people/{senderId}/documents`, changes via the `DocumentUpdatedEvents` webhook.
*   In sandbox nothing verifies it: settle with `POST /v2/senders/{senderId}/documents/{documentId}/resolve` (`outcome`, `reason`), sandbox/staging only; `verifiedBy` carries a `sandbox:` prefix.

Sample: the "Proof of source of funds" card on the Compliance page (`/api/documents/source-of-funds`, `/api/documents`, `/api/documents/:id/status`, `/api/documents/:id/resolve`).

### Step 3: Verify Available Destinations
Before selecting a country, you should verify which destinations are currently supported and their specific requirements/currencies.

*   **Endpoint**: `GET .../payout/{sourceCountry}/destinations`

```bash
# Fetch available destinations from US
curl --request GET \
  --url https://{FQDN}/organizations/$TENANT/payout/us/destinations \
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
  --url https://{FQDN}/organizations/$TENANT/payout/quotes \
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
  --url https://{FQDN}/organizations/$TENANT/payout/recipients/schema/pe \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"

# Fetch Account Schema for Peru (PE)
curl --request GET \
  --url https://{FQDN}/organizations/$TENANT/payout/recipientAccounts/schema/pe \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

*   **Action 3: Create the Beneficiary**
    *   Use the fields from the recipient schema to call `POST /organizations/{tenantId}/v2/beneficiaries` (same shape as the sender; `/people` stamps the SENDER role and cannot create a recipient). The BFF lowercases the document types the schema lists in uppercase.

### Step 6: Beneficiary Account (Funding)

*   **Action 1: Fetch Bank List (for Dropdowns)**
    *   If the Account Schema includes a `bankCode` field (common in LATAM/Asia), you should fetch the list of valid banks to populate a dropdown.
    *   **Bank List Endpoint**: `GET .../payout/{countryCode}/banks`

```bash
# Fetch List of Banks in Peru
curl --request GET \
  --url https://{FQDN}/organizations/$TENANT/payout/PE/banks?size=100 \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

*   **Action 2: Link a Bank Account**
    *   Use the fields from the account schema to call `POST .../participants/{recipientId}/recipientAccounts/gateway`.

```bash
# Link a Peru (PE) Bank Account (Schema-specific fields)
curl --request POST \
  --url https://{FQDN}/organizations/$TENANT/payout/participants/$RECIPIENT_ID/recipientAccounts/gateway \
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
  --url https://{FQDN}/organizations/$TENANT/payout/participants/$SENDER_ID/fundingAccounts \
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

#### Option B: US Bank Account (ACH via Plaid)

ACH accounts are verified through **Plaid Link**. Raw routing/account numbers are never sent to the Inyo API.

##### Step 1: Request a Plaid Link Token (Backend)

Your backend requests a link token from Inyo, which is used to initialize Plaid on the client:

```bash
curl --request POST \
  --url https://{FQDN}/organizations/$TENANT/payout/participants/$SENDER_ID/fundingAccounts/linkTokens \
  --header 'Content-Type: application/json' \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY" \
  --data '{ "provider": "PLAID" }'
```

Response: `{ "token": "link-sandbox-...", "expireAt": "...", "requestId": "..." }`

##### Step 2: Launch Plaid Link (Frontend)

Initialize Plaid Link with the token. On success, Plaid returns a `public_token` and `account_id`.

##### Step 3: Create the ACH Funding Account (Backend)

Send the Plaid tokens to Inyo to register the bank account:

```bash
curl --request POST \
  --url https://{FQDN}/organizations/$TENANT/payout/participants/$SENDER_ID/fundingAccounts \
  --header 'Content-Type: application/json' \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY" \
  --data '{
  "externalId": "'$(uuidgen)'",
  "asset": "USD",
  "nickname": "My Bank Account",
  "paymentMethod": {
    "type": "ACH",
    "countryCode": "US",
    "accountCheckId": "$PLAID_ACCOUNT_ID",
    "accountCheckToken": "$PLAID_PUBLIC_TOKEN"
  }
}'
```

> **Note**: The account status will initially be `Pending`. It transitions to `Verified` once Plaid completes verification. Implement a polling strategy or webhook listener to detect this transition before allowing the account to be used in transactions.

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
  --url https://{FQDN}/organizations/$TENANT/fx/participants/$SENDER_ID/limits \
  --header "x-api-key: $API_KEY" \
  --header "x-agent-id: $AGENT_ID" \
  --header "x-agent-api-key: $AGENT_KEY"
```

**Check Trust Level & Upgrade Requirements**:
*   **Endpoint**: `GET .../participants/{id}/complianceLevels`

```bash
curl --request GET \
  --url https://{FQDN}/organizations/$TENANT/participants/$SENDER_ID/complianceLevels \
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
  --url https://{FQDN}/organizations/$TENANT/fx/transactions \
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

### Step 9b: Tracking the Lifecycle (Status History & Cancellation)
A transaction exposes two summary dimensions, `complianceStatus` and `payoutStatus`, and a full audit trail:

*   **History**: `GET /organizations/{tenantId}/fx/transactions/{id}/status` returns every status change, most recent first, with the system messages that explain it. The sample shows it as a timeline on the receipt page (`GET /api/transactions/:id/status`).
*   **Cancel / reverse**: `PUT /organizations/{tenantId}/fx/transactions/{id}/status/cancel`. Inyo voids a pre-authorised payment or refunds a captured one; the response is `204` (queued, status moves to `CancelRequested` then `Cancelled`/`Refunded`) or `422` when the transfer is no longer reversible (funds delivered). The sample exposes it as `POST /api/transactions/:id/cancel` and hides the button on terminal states.
*   The fine-grained statuses (`PaymentAuthorized`, `WaitingPayout`, `Paid`, ...) are only delivered by the `TransactionStatusChanged` webhook (Step 11).

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
To receive real-time notifications about important lifecycle events (e.g., a transaction status update from `PENDING` to `COMPLETED`), you must register a callback URL. Our API will send a POST request to this URL with the event data and can support static authentication (e.g., a shared secret).

**Supported Events**:
*   `transactionStatusChanged`
*   `agentUpdatedEvents`
*   `documentUpdatedEvents`

*   **Endpoint**: `POST .../webhooks`

```bash
curl --request POST \
  --url https://{FQDN}/organizations/$TENANT/webhooks \
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

You can find data for testing purposes at:

*  Senders, KYC document numbers, test cards and forced status transitions: [https://dev.inyoglobal.com/api-references/remittances/sandbox-testing/](https://dev.inyoglobal.com/api-references/remittances/sandbox-testing/)
*  Cards: [https://dev.inyoglobal.com/api-references/payments-gateway/apis/test-data/cards](https://dev.inyoglobal.com/api-references/payments-gateway/apis/test-data/cards)

> **Important**: To successfully test transactions, it is required to use a combination of cards **with** and **without** 3D Secure (3DS).

### 3DS Challenge Procedure
Some cards require an extra authentication step (3D Secure, "3DS"). The sample follows the [Tokenizing Cards](https://dev.inyoglobal.com/api-references/payments-gateway/apis/tokenizing-cards/) and [Handling 3D Secure](https://dev.inyoglobal.com/api-references/payments-gateway/apis/payment/pulling-funds/cards/authorizing/handling-3d-secure) pages.

**`threeDSData` at tokenization.** The add-card form has a "3DS in tokenizer" selector (default `off`) covering the documented options:

| Mode | `threeDSData` passed to `InyoTokenizer` | How the sample handles the challenge |
| --- | --- | --- |
| `off` (default) | `{ enable: false }` | The challenge, if any, comes from `POST /fundingAccounts` (`ActionRequired` + `redirectAcsUrl`) and opens in a modal iframe. |
| `redirect` | `{ enable: true, successUrl: "<app>/api/3ds/success", failUrl: "<app>/api/3ds/fail" }` | The challenge opens in a new tab, because at the end the issuer navigates that tab to `successUrl` or `failUrl`. The BFF serves a small page there that reports back to the app and closes the tab. |
| `postmessage` | `{ enable: true, enablePostMessage: true }` | The challenge opens in a modal iframe and the result arrives as a `postMessage` to the page. The page URL must be registered with Inyo beforehand. |

`successUrl`/`failUrl` are built from the page origin (`http://localhost:3000` in development), which must be allowlisted for the public key.

**Flow in the sample**

1.  **Challenge trigger.** If `POST /fundingAccounts` answers `202` with `status: "ActionRequired"`, the card is saved locally as pending and the `redirectAcsUrl` is opened (iframe or new tab, per the table). *Payment methods* offers "Resume 3DS" for pending cards.
2.  **Result.** The page listens for the browser-side result (`postMessage` from the issuer page, or the message from the `/api/3ds/*` landing page) and, while the challenge is open, re-reads the funding account every 5 s. A manual "check status" button is there too. The browser-side payload is never trusted; it only triggers the next step.
3.  **Confirmation with Inyo.** `GET /api/payment-methods/:id/sync` calls `GET .../payout/fundingAccounts/{id}` and the local record follows that status. Only a `Verified` answer from Inyo unlocks the card for transactions; `Rejected` means the sender must add another card. Transactions can be re-read the same way with `GET /api/transactions/:id/sync`.

**Gateway notification (optional).** The verification outcome is reported by the Inyo gateway to Inyo. If Inyo also configures that notification for your backend, the sample accepts it at `POST /api/webhooks/gateway` (JSON with `event`, `status`, `paymentId`, `externalPaymentId`, `eventDate`): `AUTHORIZED` and `DECLINED` update the matching card locally and the *Payment methods* page lists the received events. Expose the BFF with a public URL (for example a tunnel) and set `WEBHOOK_BASIC_USER` / `WEBHOOK_BASIC_PASS` if Basic Auth is agreed. Inyo remains the source of truth either way.

### Additional Resources
For more details on handling AVS, CVC, and 3D Secure Verification, please refer to the official documentation:

*   [Handling AVS & CVC Results](https://dev.inyoglobal.com/api-references/payments-gateway/apis/payment/pulling-funds/cards/authorizing/handling-avs-cvc)
*   [Handling 3D Secure (3DS)](https://dev.inyoglobal.com/api-references/payments-gateway/apis/payment/pulling-funds/cards/authorizing/handling-3d-secure)
