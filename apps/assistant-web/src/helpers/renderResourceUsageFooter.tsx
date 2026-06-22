import type { TFunction } from "i18next";
import type { SessionResourceUsage } from "../store/sessions";

export const renderResourceUsageFooter = (
    resourceUsage: SessionResourceUsage | undefined,
    t: TFunction,
) => {
    if (!resourceUsage) {
        return null;
    }

    const usedSources: string[] = [];
    const failedSources: string[] = [];

    if (resourceUsage.usedAttachments) {
        usedSources.push(t("views.Chat.resource_source_attachments"));
    }
    if (resourceUsage.usedKnowledge) {
        usedSources.push(t("views.Chat.resource_source_knowledge"));
    }
    if (resourceUsage.failedAttachments) {
        failedSources.push(t("views.Chat.resource_source_attachments"));
    }
    if (resourceUsage.failedKnowledge) {
        failedSources.push(t("views.Chat.resource_source_knowledge"));
    }

    if (usedSources.length === 0 && failedSources.length === 0) {
        return null;
    }

    return (
        <div className="mt-2 space-y-1.5 pl-[2px]">
            {usedSources.length > 0 && (
                <div className="text-xs leading-5 text-[#7a8794]">
                    {t("views.Chat.resource_usage_used", {
                        sources: usedSources.join(t("views.Chat.resource_usage_joiner")),
                    })}
                </div>
            )}
            {failedSources.length > 0 && (
                <div className="text-xs leading-5 text-[#a16a4a]">
                    {t("views.Chat.resource_usage_failed", {
                        sources: failedSources.join(t("views.Chat.resource_usage_joiner")),
                    })}
                </div>
            )}
        </div>
    );
};
