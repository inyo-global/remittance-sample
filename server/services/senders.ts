import type { Db } from '../db.ts';
import type { UpstreamJson } from '../types.ts';

/** The Inyo sender id of a local user, once /complete-profile created it (profiles.externalId). */
export const senderOf = (db: Db, userId: string): string | undefined =>
    (db.prepare('SELECT externalId FROM profiles WHERE userId = ?').get(userId) as { externalId: string | null } | undefined)?.externalId ?? undefined;

/** Phone numbers go to Inyo in E.164; US numbers without a country code get +1. */
export const toE164 = (value: unknown): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+')) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
};

// v2 endpoints (/v2/senders, /v2/beneficiaries) use lowercase document types; the plural
// `drivers_license` is canonical and the v1 singular is only accepted for compatibility.
const V2_DOC_TYPES: Record<string, string> = { driver_license: 'drivers_license', drivers_license: 'drivers_license' };
export const v2DocType = (type: unknown): string => {
    const t = String(type || '').toLowerCase();
    return V2_DOC_TYPES[t] || t;
};
export const v2Documents = (documents: unknown): UpstreamJson[] =>
    (Array.isArray(documents) ? (documents as UpstreamJson[]) : [])
        .filter((d) => d && d.document)
        .map(({ type, issuer, ...rest }) => ({
            ...rest,
            type: v2DocType(type),
            // v2 replaced `issuer` with `stateCode` (required by rule for US driver's licenses)
            ...(issuer && !rest.stateCode ? { stateCode: issuer } : {}),
        }));
