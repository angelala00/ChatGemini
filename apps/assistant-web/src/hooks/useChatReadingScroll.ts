import { RefObject, useCallback, useEffect, useRef, useState } from "react";

interface UseChatReadingScrollProps {
    readonly containerRef?: RefObject<HTMLElement>;
    readonly sessionKey: string;
    readonly updateKey: string;
    readonly busy?: boolean;
}

const LEAVE_BOTTOM_THRESHOLD = 12;

const isNearBottom = (element: HTMLElement) => {
    const remaining =
        element.scrollHeight - element.clientHeight - element.scrollTop;
    return remaining <= LEAVE_BOTTOM_THRESHOLD;
};

export const useChatReadingScroll = (props: UseChatReadingScrollProps) => {
    const { containerRef, sessionKey, updateKey, busy = false } = props;
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const followLatestRef = useRef(true);
    const rafRef = useRef<number | null>(null);
    const timeoutRef = useRef<number | null>(null);
    const intervalRef = useRef<number | null>(null);

    const cancelPendingScroll = () => {
        if (rafRef.current !== null) {
            window.cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    const cancelFollowInterval = () => {
        if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
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

    const jumpToLatest = useCallback(
        (behavior: ScrollBehavior = "smooth") => {
            const element = containerRef?.current;
            if (!element) {
                return;
            }
            cancelPendingScroll();
            followLatestRef.current = true;
            setShowJumpToLatest(false);
            element.scrollTo({ top: element.scrollHeight, behavior });
        },
        [containerRef],
    );

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
        cancelPendingScroll();
        rafRef.current = window.requestAnimationFrame(() => {
            jumpToLatest("auto");
        });
        return cancelPendingScroll;
    }, [sessionKey]);

    useEffect(() => {
        if (!followLatestRef.current) {
            setShowJumpToLatest(true);
            return;
        }
        cancelPendingScroll();
        rafRef.current = window.requestAnimationFrame(() => {
            jumpToLatest("auto");
            timeoutRef.current = window.setTimeout(() => {
                jumpToLatest("auto");
            }, 32);
        });
        return cancelPendingScroll;
    }, [jumpToLatest, updateKey]);

    useEffect(() => {
        if (!busy || !followLatestRef.current) {
            cancelFollowInterval();
            return;
        }

        intervalRef.current = window.setInterval(() => {
            if (!followLatestRef.current) {
                cancelFollowInterval();
                return;
            }
            jumpToLatest("auto");
        }, 80);

        return () => {
            cancelFollowInterval();
        };
    }, [busy, jumpToLatest]);

    return {
        showJumpToLatest,
        jumpToLatest,
    };
};
