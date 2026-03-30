import { RefObject, useEffect, useRef, useState } from "react";

interface UseChatReadingScrollProps {
    readonly containerRef?: RefObject<HTMLElement>;
    readonly sessionKey: string;
    readonly updateKey: string;
}

const LEAVE_BOTTOM_THRESHOLD = 12;

const isNearBottom = (element: HTMLElement) => {
    const remaining =
        element.scrollHeight - element.clientHeight - element.scrollTop;
    return remaining <= LEAVE_BOTTOM_THRESHOLD;
};

export const useChatReadingScroll = (props: UseChatReadingScrollProps) => {
    const { containerRef, sessionKey, updateKey } = props;
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const followLatestRef = useRef(true);
    const rafRef = useRef<number | null>(null);

    const cancelScheduledScroll = () => {
        if (rafRef.current !== null) {
            window.cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    };

    const syncScrollState = () => {
        const element = containerRef?.current;
        if (!element) {
            return;
        }
        const nearBottom = isNearBottom(element);
        followLatestRef.current = nearBottom;
        setShowJumpToLatest(!nearBottom);
    };

    const jumpToLatest = (behavior: ScrollBehavior = "smooth") => {
        const element = containerRef?.current;
        if (!element) {
            return;
        }
        cancelScheduledScroll();
        followLatestRef.current = true;
        setShowJumpToLatest(false);
        element.scrollTo({ top: element.scrollHeight, behavior });
    };

    useEffect(() => {
        const element = containerRef?.current;
        if (!element) {
            return;
        }
        const handleScroll = () => syncScrollState();
        element.addEventListener("scroll", handleScroll, { passive: true });
        syncScrollState();
        return () => element.removeEventListener("scroll", handleScroll);
    }, [containerRef]);

    useEffect(() => {
        cancelScheduledScroll();
        rafRef.current = window.requestAnimationFrame(() => {
            jumpToLatest("auto");
        });
        return cancelScheduledScroll;
    }, [sessionKey]);

    useEffect(() => {
        if (!followLatestRef.current) {
            setShowJumpToLatest(true);
            return;
        }
        cancelScheduledScroll();
        rafRef.current = window.requestAnimationFrame(() => {
            jumpToLatest("auto");
        });
        return cancelScheduledScroll;
    }, [updateKey]);

    return {
        showJumpToLatest,
        jumpToLatest,
    };
};
