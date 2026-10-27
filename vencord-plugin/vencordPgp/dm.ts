/*
 * Utilidades de destinatarios para MD y grupos MD.
 * IDs estables de Discord; el nombre es solo informativo.
 */
import type { Channel } from "@vencord/discord-types";
import { UserStore } from "@webpack/common";

import { DM_TYPE, GROUP_DM_TYPE } from "./core/channelPolicy";

export interface DmRecipient {
    id: string;
    name: string;
}

export function isDmChannel(channel: Channel | null | undefined): boolean {
    return !!channel && (channel.type === DM_TYPE || channel.type === GROUP_DM_TYPE);
}

export function getDmRecipients(channel: Channel): DmRecipient[] {
    if (!isDmChannel(channel)) return [];

    const raw = (channel as any).recipients ?? (channel as any).rawRecipients ?? [];
    const ids: string[] = (Array.isArray(raw) ? raw : [])
        .map((r: any) => typeof r === "string" ? r : r?.id)
        .filter((id: any): id is string => typeof id === "string" && id.length > 0);

    const selfId = UserStore.getCurrentUser()?.id;
    return [...new Set(ids)]
        .filter(id => id !== selfId)
        .map(id => {
            const user = UserStore.getUser(id);
            return { id, name: user?.globalName || user?.username || id };
        });
}
