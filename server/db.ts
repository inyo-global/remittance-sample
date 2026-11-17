import Database from 'better-sqlite3';

export type Db = Database.Database;

/**
 * Opens the SQLite file (":memory:" in tests) and creates the tables the sample needs.
 * Inyo payloads are stored as JSON text in the `data` columns, next to the ids the UI uses.
 */
export function openDatabase(path: string, { verbose = false } = {}): Db {
    const db = new Database(path, { verbose: verbose ? console.log : undefined });
    createSchema(db);
    return db;
}

function createSchema(db: Db): void {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      firstName TEXT,
      lastName TEXT,
      dateOfBirth TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zipcode TEXT,
      phoneNumber TEXT
    )`,
    ).run();
    
    db.prepare(
      `CREATE TABLE IF NOT EXISTS profiles (
      userId TEXT PRIMARY KEY,
      gender TEXT,
      occupation TEXT,
      docType TEXT,
      docNumber TEXT,
      issuingCountry TEXT,
      expirationDate TEXT,
      externalId TEXT,
      data TEXT
    )`,
    ).run();
    
    db.prepare(
      `CREATE TABLE IF NOT EXISTS beneficiaries (
      id TEXT PRIMARY KEY,
      userId TEXT,
      nickname TEXT,
      externalId TEXT,
      data TEXT
    )`,
    ).run();
    
    db.prepare(
      `CREATE TABLE IF NOT EXISTS beneficiary_accounts (
      id TEXT PRIMARY KEY,
      beneficiaryId TEXT,
      externalId TEXT,
      data TEXT
    )`,
    ).run();
    
    db.prepare(
      `CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      userId TEXT,
      quoteId TEXT,
      fromCurrency TEXT,
      toCurrency TEXT,
      amount REAL,
      data TEXT
    )`,
    ).run();
    
    db.prepare(
      `CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      userId TEXT,
      token TEXT,
      data TEXT,
      type TEXT,
      externalId TEXT
    )`,
    ).run();
    
    db.prepare(
      `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      userId TEXT,
      externalId TEXT,
      status TEXT,
      amount REAL,
      currency TEXT,
      recipientName TEXT,
      createdAt TEXT,
      data TEXT
    )`,
    ).run();
    
    // SSN/ITIN is a declared document too (docs: v2 document types `ssn` / `itin`), required for LEVEL_2.
    try { db.prepare("ALTER TABLE profiles ADD COLUMN ssn TEXT").run(); } catch { /* column exists */ }
    
    // KYC verification sessions (docs: sender/uploading-documents.md). One row per session so the
    // UI can resume the latest one; `data` keeps the last GET response (status, result, widgetUrl).
    db.prepare(
      `CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receivedAt TEXT,
      paymentId TEXT,
      externalPaymentId TEXT,
      status TEXT,
      matchedCardId TEXT,
      payload TEXT
    )`,
    ).run();
    
    db.prepare(
      `CREATE TABLE IF NOT EXISTS kyc_sessions (
      sessionId TEXT PRIMARY KEY,
      userId TEXT,
      status TEXT,
      widgetUrl TEXT,
      createdAt TEXT,
      data TEXT
    )`,
    ).run();
}
