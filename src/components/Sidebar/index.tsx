import View, { SidebarContentView } from './view';
import { useSidebar, type SidebarProps } from './model';

export type { SidebarProps } from './model';

/** Sidebar body on its own (mobile drawer); owns its own limits fetch like the desktop one. */
export function SidebarContent(ownProps: SidebarProps) {
    const props = useSidebar(ownProps);
    return <SidebarContentView {...props} />;
}

export default function Sidebar(ownProps: SidebarProps) {
    const props = useSidebar(ownProps);
    return <View {...props} />;
}
