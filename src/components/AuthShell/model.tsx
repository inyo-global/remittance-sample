import type { ReactNode } from 'react';
import { ArrowLeftRight, Globe2, ShieldCheck, type LucideIcon } from 'lucide-react';

interface Point {
    icon: LucideIcon;
    title: string;
    text: string;
}

export const POINTS: Point[] = [
    { icon: Globe2, title: 'Pay out to 165+ countries', text: 'Bank deposit, PIX, wallets and cards, with country schemas fetched from the API.' },
    { icon: ShieldCheck, title: 'Compliance built in', text: 'KYC, trust levels and rolling limits are handled by the Inyo platform.' },
    { icon: ArrowLeftRight, title: 'Locked FX quotes', text: 'Quote once, send with a guaranteed rate inside the validity window.' },
];

export interface AuthShellProps {
    title: ReactNode;
    subtitle?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    wide?: boolean;
}

/** Purely presentational: the model only applies the defaults. */
export function useAuthShell({ title, subtitle, children, footer, wide = false }: AuthShellProps) {
    return { title, subtitle, children, footer, wide };
}

export type AuthShellViewProps = ReturnType<typeof useAuthShell>;
