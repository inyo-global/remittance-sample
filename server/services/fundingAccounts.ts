import type { Db } from '../db.ts';
import type { PaymentMethodRow, UpstreamJson } from '../types.ts';
import type { Log } from '../log.ts';

export interface CardMatch {
    row: PaymentMethodRow;
    data: UpstreamJson;
}

const cards = (db: Db): PaymentMethodRow[] => db.prepare("SELECT * FROM payment_methods WHERE type = 'CARD'").all() as PaymentMethodRow[];

/** The local card whose creation response carries this gateway paymentId. */
export const cardByGatewayPaymentId = (db: Db, paymentId: string | null): CardMatch | null => {
    if (!paymentId) return null;
    for (const row of cards(db)) {
        try {
            const data: UpstreamJson = JSON.parse(row.data);
            if (data?.apiResponse?.gateway?.paymentId === paymentId) return { row, data };
        } catch { /* ignore malformed rows */ }
    }
    return null;
};

export const WEBHOOK_STATUS_MAP: Record<string, string> = { AUTHORIZED: 'Verified', DECLINED: 'Rejected' };

// The card is matched by the gateway paymentId kept from POST /fundingAccounts, or by the
// externalPaymentId suffix (the funding account id).
export const cardByWebhookEvent = (db: Db, paymentId: string | null, externalPaymentId: string | null): CardMatch | null => {
    const byPayment = cardByGatewayPaymentId(db, paymentId);
    if (byPayment) return byPayment;
    if (!externalPaymentId) return null;
    for (const row of cards(db)) {
        try {
            const data: UpstreamJson = JSON.parse(row.data);
            const coreId = data?.apiResponse?.id || row.externalId;
            if (coreId && String(externalPaymentId).endsWith(String(coreId))) return { row, data };
        } catch { /* ignore malformed rows */ }
    }
    return null;
};

export interface GatewayEventResult {
    received: true;
    receivedAt: string;
    status: string | null;
    paymentId: string | null;
    externalPaymentId: string | null;
    matchedCard: { id: string; newStatus: string | null } | null;
}

/**
 * Applies a gateway "payment status changed" event to the matching local card and records it in
 * webhook_events. AUTHORIZED marks the card Verified and DECLINED marks it Rejected; every other
 * status is stored without changing the card. Inyo remains the source of truth: a card verified
 * only here is still refused by POST /fx/transactions until Inyo reports the same result.
 */
export function applyGatewayEvent(db: Db, log: Log, payload: UpstreamJson, routePath: string): GatewayEventResult {
    const receivedAt = new Date().toISOString();
    const status = String(payload.status || '').toUpperCase();
    const paymentId: string | null = payload.paymentId || null;
    const externalPaymentId: string | null = payload.externalPaymentId || payload.externalId || null;
    log.info(`gateway webhook (${routePath}) status=${status || '?'} paymentId=${paymentId} externalPaymentId=${externalPaymentId}: ${JSON.stringify(payload).slice(0, 600)}`);
    const match = cardByWebhookEvent(db, paymentId, externalPaymentId);
    const newStatus = WEBHOOK_STATUS_MAP[status] || null;
    if (match) {
        // A CHECK produces two events: AUTHORIZED (the $0 verification) and then VOIDED (its reversal)
        // with a different paymentId. Only AUTHORIZED and DECLINED decide the card; VOIDED and the rest
        // are kept as the last event without touching the decision. The event paymentIds also differ
        // from gateway.paymentId returned at creation, so the match is effectively by externalPaymentId.
        const apiResponse: UpstreamJson = { ...(match.data.apiResponse || {}) };
        const event = { status, statusCode: payload.statusCode ?? payload.responseCode ?? null, message: payload.statusDescription ?? payload.message ?? null, paymentId, eventDate: payload.eventDate ?? null, receivedAt, appliedStatus: newStatus };
        const next: UpstreamJson = { ...match.data, apiResponse, lastGatewayEvent: event };
        if (newStatus) {
            apiResponse.status = newStatus;
            apiResponse.coreStatus = apiResponse.coreStatus ?? null;
            next.gatewayEvent = event;
        }
        db.prepare('UPDATE payment_methods SET data = ? WHERE id = ?').run(JSON.stringify(next), match.row.id);
        log.info(`gateway webhook applied to card ${match.row.id}: ${status} -> ${newStatus || 'no status change'}`);
    } else {
        log.warn(`gateway webhook matches no local card (paymentId=${paymentId}, externalPaymentId=${externalPaymentId})`);
    }
    db.prepare('INSERT INTO webhook_events (receivedAt, paymentId, externalPaymentId, status, matchedCardId, payload) VALUES (?, ?, ?, ?, ?, ?)')
        .run(receivedAt, paymentId, externalPaymentId, status || null, match?.row.id || null, JSON.stringify(payload));
    return { received: true, receivedAt, status: status || null, paymentId, externalPaymentId, matchedCard: match ? { id: match.row.id, newStatus } : null };
}

/**
 * Merges a fresh GET /fundingAccounts answer into the stored card data. GET omits redirectAcsUrl and
 * the gateway block (and answers "Actionrequired"); keep both from the creation response: the ACS
 * URL resumes the challenge and gateway.paymentId is how webhook events are matched to this card.
 * Inyo only leaves ActionRequired once it receives the gateway's result. When that result reached
 * this BFF (webhook) but Inyo still answers ActionRequired, keep the gateway's verdict as the card
 * status and record Inyo's answer in coreStatus, so the UI shows both instead of flip-flopping.
 */
export function mergeSyncedCard(currentData: UpstreamJson, fresh: UpstreamJson): { newData: UpstreamJson; stillPending: boolean } {
    const previous: UpstreamJson = currentData.apiResponse || {};
    const coreStatus = fresh.status;
    const applied: string | null = currentData.gatewayEvent?.appliedStatus || null;
    const coreStillPending = /^action\s*required$/i.test(String(coreStatus || '').replace(/\s+/g, ''));
    const newData: UpstreamJson = {
        ...currentData,
        apiResponse: {
            ...fresh,
            status: applied && coreStillPending ? applied : coreStatus,
            coreStatus: applied && coreStillPending ? coreStatus : null,
            redirectAcsUrl: fresh.redirectAcsUrl || previous.redirectAcsUrl || null,
            gateway: fresh.gateway || previous.gateway || null,
        },
    };
    return { newData, stillPending: !!(applied && coreStillPending) };
}
