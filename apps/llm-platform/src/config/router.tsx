import { RefObject } from "react";

export interface RouterComponentProps {
    refs?: Record<string, RefObject<HTMLElement>>;
    onAbortUpdate?: any;
    gid?: string;
    title?: string;
    logo?: string;
    subTitle?: string;
    samples?: string[];
    userName?: string;
}
