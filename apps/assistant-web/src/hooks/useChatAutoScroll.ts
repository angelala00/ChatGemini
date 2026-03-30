import { RefObject, useCallback, useEffect, useState } from "react";


const DEFAULT_BOTTOM_THRESHOLD = 48;

const isNearBottom = (element: HTMLElement, threshold: number) =>
    element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;

export const useChatAutoScroll = (
    containerRef: RefObject<HTMLElement>,
    options?: {
        bottomThreshold?: number;
    },
) => {
    const bottomThreshold = options?.bottomThreshold ?? DEFAULT_BOTTOM_THRESHOLD;
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) {
            return;
        }

        const handleScroll = () => {
            setShouldAutoScroll(isNearBottom(element, bottomThreshold));
        };

        handleScroll();
        element.addEventListener("scroll", handleScroll, { passive: true });
        return () => element.removeEventListener("scroll", handleScroll);
    }, [bottomThreshold, containerRef]);

    const scrollToBottom = useCallback(
        (force: boolean = false) => {
            const element = containerRef.current;
            if (!element) {
                return;
            }
            if (!force && !shouldAutoScroll) {
                return;
            }
            element.scrollTo({
                top: element.scrollHeight,
                behavior: "auto",
            });
        },
        [containerRef, shouldAutoScroll],
    );

    const resetAutoScroll = useCallback(() => {
        setShouldAutoScroll(true);
    }, []);

    return {
        shouldAutoScroll,
        scrollToBottom,
        resetAutoScroll,
    };
};
