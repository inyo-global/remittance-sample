import type { AppContext } from '../app.ts';
import type { ProfileRow, UpstreamJson, UserRow } from '../types.ts';
import { toE164, v2DocType } from './senders.ts';

/** What the onboarding form posts to /complete-profile. */
export interface CompleteProfileBody {
    gender?: string;
    occupation?: string;
    docType?: string;
    docNumber?: string;
    issuingCountry?: string;
    expirationDate?: string;
    firstName?: string;
    lastName?: string;
    state?: string;
    phoneNumber?: string;
    ssn?: string;
}

export interface SenderPayload {
    firstName: string | null | undefined;
    lastName: string | null | undefined;
    email: string | null | undefined;
    birthDate: string | null | undefined;
    phoneNumber: string;
    address: { countryCode: string; stateCode: string | null | undefined; city: string | null | undefined; line1: string | null | undefined; zipcode: string | null | undefined };
    documents: UpstreamJson[];
    occupation: string | undefined;
    gender: string | undefined;
    externalId: string;
}

/**
 * The POST/PATCH /v2/senders body (docs: sender/README.md, v2): lowercase document types,
 * `stateCode` for US driver's licenses, SSN as its own document, E.164 phone numbers.
 */
export function buildSenderPayload(userId: string, body: CompleteProfileBody, userRow: UserRow | undefined): { payload: SenderPayload; ssnDigits: string } {
    const { gender, occupation, docType, docNumber, issuingCountry, expirationDate, firstName, lastName, state, phoneNumber, ssn } = body;

    // Construct Address
    const address = {
        countryCode: 'US',
        stateCode: state || userRow?.state,
        city: userRow?.city,
        line1: userRow?.address,
        zipcode: userRow?.zipcode,
    };

    // Construct Document
    // Docs (sender/README.md, v2): lowercase types, `stateCode` for US driver's licenses.
    const documents: UpstreamJson[] = [];
    if (docType && docNumber) {
        const type = v2DocType(docType);
        const doc: UpstreamJson = {
            type,
            document: docNumber,
            countryCode: type === 'drivers_license' ? 'US' : issuingCountry || 'US',
        };
        if (expirationDate) doc.expireDate = expirationDate;
        if (type === 'drivers_license' && state) doc.stateCode = state;
        documents.push(doc);
    }
    // SSN goes in documents[] as its own type (digits only). Never selected for the KYC widget;
    // it is one of the LEVEL_2 requirements next to the verified identity document.
    const ssnDigits = String(ssn || '').replace(/\D/g, '');
    if (ssnDigits) documents.push({ type: 'ssn', document: ssnDigits, countryCode: 'US' });

    const payload: SenderPayload = {
        firstName: firstName || userRow?.firstName,
        lastName: lastName || userRow?.lastName,
        email: userRow?.email,
        birthDate: userRow?.dateOfBirth,
        // Docs want E.164 ("+15551234567"); the form accepts any US formatting.
        phoneNumber: toE164(phoneNumber || userRow?.phoneNumber || ''),
        address,
        documents,
        occupation,
        gender: gender ? gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase() : undefined,
        externalId: userId,
    };
    return { payload, ssnDigits };
}

/**
 * Creates or updates the Inyo sender for a local user and stores the profile row.
 * Throws the axios error on an upstream failure so the route can answer with `ctx.fail`.
 */
export async function completeProfile({ db, inyo }: AppContext, userId: string, body: CompleteProfileBody): Promise<{ success: true; externalId: string }> {
    const { gender, occupation, docType, docNumber, issuingCountry, expirationDate, state, phoneNumber } = body;

    // 1. Update User info (Phone Number) if provided
    if (phoneNumber) {
        db.prepare('UPDATE users SET phoneNumber = ? WHERE id = ?').run(phoneNumber, userId);
    }

    // Fetch basic user info from users table to enrich data
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;

    const { payload, ssnDigits } = buildSenderPayload(userId, body, userRow);

    // Check if profile exists
    const existingProfile = db.prepare('SELECT externalId FROM profiles WHERE userId = ?').get(userId) as Pick<ProfileRow, 'externalId'> | undefined;

    let apiRes;
    if (existingProfile && existingProfile.externalId) {
        // PATCH /v2/senders/{id}: only the fields sent are updated; documents with the same
        // type + number are updated in place (docs: "Updating a Sender (v2)").
        console.log(`Patching existing sender: ${existingProfile.externalId}`);
        apiRes = await inyo.http.patch<UpstreamJson>(inyo.url(`/v2/senders/${existingProfile.externalId}`), payload, { headers: inyo.headers });
    } else {
        // POST /v2/senders (the /people endpoints are deprecated). Idempotent on externalId:
        // 201 = created, 200 = a sender with this externalId already existed.
        console.log('Creating new sender');
        apiRes = await inyo.http.post<UpstreamJson>(inyo.url('/v2/senders'), payload, { headers: inyo.headers });
    }

    const { id: externalId } = apiRes.data as { id: string };

    // Map state to issuingCountry if license
    const finalIssuingCountry = docType === 'driver_license' ? state : issuingCountry;

    // Store extra data
    const extraData = JSON.stringify({
        state,
        originalIssuingCountry: issuingCountry,
        phoneNumber,
    });

    console.log(`Updating profile for ${userId} with Phone: ${phoneNumber || 'N/A'}`);

    db.prepare(
        'INSERT OR REPLACE INTO profiles (userId, gender, occupation, docType, docNumber, issuingCountry, expirationDate, externalId, data, ssn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(userId, gender, occupation, docType, docNumber, finalIssuingCountry, expirationDate, externalId, extraData, ssnDigits || null);
    return { success: true, externalId };
}
