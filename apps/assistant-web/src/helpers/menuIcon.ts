import * as outlineIcons from "@heroicons/react/24/outline";
import { BeakerIcon } from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

type MenuIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const normalizeIconName = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]/g, "");

const buildIconMap = (): Record<string, MenuIconComponent> => {
    const map: Record<string, MenuIconComponent> = {};
    for (const [exportName, icon] of Object.entries(outlineIcons)) {
        // heroicons v2 components are React.forwardRef results (objects, not functions),
        // so filter purely by the export name pattern.
        if (/^[A-Z]/.test(exportName) && exportName.endsWith("Icon")) {
            map[normalizeIconName(exportName.slice(0, -"Icon".length))] = icon as MenuIconComponent;
        }
    }
    return map;
};

const ICON_MAP: Readonly<Record<string, MenuIconComponent>> = buildIconMap();

export const resolveMenuIcon = (name: string | undefined): MenuIconComponent => {
    const normalized = name ? normalizeIconName(name) : "";
    return (normalized && ICON_MAP[normalized]) || BeakerIcon;
};
