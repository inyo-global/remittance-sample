import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import { useToast } from '../../hooks';
import type { DocumentHistoryEntry, SenderDocument, Tone } from '../../types';
import type { Outcome } from '../KycPanel/model';

export const DOC_TONE: Record<string, Tone> = { VERIFIED: 'success', REJECTED: 'danger', PENDING: 'warning' };
export const docStatus = (d: Partial<SenderDocument> | null | undefined) => String(d?.verificationStatus || d?.status || '').toUpperCase();
export const ACCEPT = 'application/pdf,image/jpeg,image/png';

/**
 * Proof of source of funds (LEVEL_3). File upload -> PENDING -> verified by OCR/compliance in
 * production; in sandbox nothing happens, so /resolve settles it. Uploads only: identity documents
 * verified through the KYC session are not listed here.
 */
export interface SourceOfFundsPanelProps {
    onVerified?: () => void;
}

export function useSourceOfFundsPanel({ onVerified }: SourceOfFundsPanelProps) {
    const toast = useToast();
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [docs, setDocs] = useState<SenderDocument[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null); // 'upload' | 'list' | `${id}:verified` | `${id}:rejected` | `${id}:status`
    const [error, setError] = useState<string | null>(null);
    const [reasons, setReasons] = useState<Record<string, DocumentHistoryEntry | undefined>>({}); // documentId -> last status entry

    const load = useCallback(async (silent = true) => {
        setBusy('list');
        try {
            const list = await request<SenderDocument[]>('get', '/documents');
            setDocs(list);
            if (!silent) toast.info(`${list.length} upload${list.length === 1 ? '' : 's'} on file`);
        } catch (err) {
            setError(errorMessage(err, 'Could not list the uploads'));
            setDocs([]);
        } finally {
            setBusy(null);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const upload = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        if (!ACCEPT.split(',').includes(file.type)) { setError(`"${file.name}" is ${file.type || 'of unknown type'}. The docs accept pdf, jpg, jpeg or png.`); return; }
        if (file.size > 10 * 1024 * 1024) { setError('The docs cap uploads at 10 MB.'); return; }
        setBusy('upload');
        try {
            const res = await request<SenderDocument>('post', '/documents/source-of-funds', file, {
                headers: { 'Content-Type': file.type, 'X-File-Name': file.name },
            });
            toast.success('Uploaded as PROOF_OF_FUNDS', `Status ${docStatus(res) || 'PENDING'}. In sandbox resolve it below; in production OCR or the compliance team verifies it.`);
            await load();
        } catch (err) {
            setError(errorMessage(err, 'Upload failed'));
        } finally {
            setBusy(null);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const resolve = async (doc: SenderDocument, outcome: Outcome) => {
        const reason = window.prompt(`Reason recorded with the ${outcome} decision (sandbox only):`, outcome === 'verified' ? 'Cleared for the integration walkthrough' : 'Rejected during the integration walkthrough');
        if (reason === null) return;
        setBusy(`${doc.id}:${outcome}`);
        setError(null);
        try {
            const res = await request<DocumentHistoryEntry>('post', `/documents/${doc.id}/resolve`, { outcome, reason });
            setReasons((r) => ({ ...r, [doc.id]: res }));
            toast.success(`Document ${outcome}`, `verifiedBy ${res.verifiedBy || 'sandbox'}. Same path as a reviewer's decision.`);
            await load();
            if (outcome === 'verified') onVerified?.();
        } catch (err) {
            setError(errorMessage(err, 'Could not resolve the document'));
        } finally {
            setBusy(null);
        }
    };

    const history = async (doc: SenderDocument) => {
        setBusy(`${doc.id}:status`);
        try {
            const entries = await request<DocumentHistoryEntry[] | DocumentHistoryEntry>('get', `/documents/${doc.id}/status`);
            const last = Array.isArray(entries) ? entries[0] : entries;
            setReasons((r) => ({ ...r, [doc.id]: last }));
            toast.info(`Status ${String(last?.status || '').toUpperCase() || 'unknown'}`, last?.reason || undefined);
        } catch (err) {
            toast.error('Could not read the status history', errorMessage(err));
        } finally {
            setBusy(null);
        }
    };

    const pickFile = () => fileRef.current?.click();

    return { fileRef, docs, busy, error, reasons, load, upload, resolve, history, pickFile };
}

export type SourceOfFundsPanelViewProps = ReturnType<typeof useSourceOfFundsPanel>;
