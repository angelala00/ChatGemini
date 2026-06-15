import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ArrowPathIcon,
    CheckCircleIcon,
    DocumentDuplicateIcon,
    EyeIcon,
    MagnifyingGlassIcon,
    PencilSquareIcon,
    PlusIcon,
    SparklesIcon,
    TrashIcon,
    UserGroupIcon,
    WrenchScrewdriverIcon,
    XCircleIcon,
} from "@heroicons/react/24/outline";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getFullPath } from "../helpers/getDomainAndPath";
import { handleRequest } from "../helpers/handleRequest";
import { sendUserAlert } from "../helpers/sendUserAlert";
import { sendUserConfirm } from "../helpers/sendUserConfirm";

interface AdminModelConfig {
    readonly id: number | string;
    readonly model_id: string;
    readonly display_name: string;
    readonly provider_model_name: string;
    readonly sort_order: number;
    readonly enabled: boolean;
    readonly supports_reasoning: boolean;
    readonly supports_tool_calling: boolean;
    readonly supports_native_image_input: boolean;
    readonly reasoning_default_enabled: boolean;
    readonly reasoning_parser_mode: string;
    readonly reasoning_parameter_format: string;
    readonly allowed_upload_types: string[];
    readonly visibility_scope: string;
    readonly visibility_users: string[];
    readonly metadata: Record<string, unknown>;
    readonly created_at: string;
    readonly updated_at: string;
}

interface AdminPermission {
    readonly id: number | string;
    readonly user_key: string;
    readonly permission_code: string;
    readonly enabled: boolean;
    readonly remark: string;
    readonly created_at: string;
    readonly updated_at: string;
}

interface AdminFeatureFlag {
    readonly config_key: string;
    readonly config_value: unknown;
    readonly value_type: string;
    readonly description: string;
    readonly updated_at: string;
    readonly updated_by: string;
}

interface AdminAuditLog {
    readonly id: number | string;
    readonly actor_key: string;
    readonly actor_email: string;
    readonly action: string;
    readonly resource_type: string;
    readonly resource_key: string;
    readonly before_state: unknown;
    readonly after_state: unknown;
    readonly created_at: string;
}

interface AdminGptsOverview {
    readonly feature_enabled: boolean;
    readonly visible_scope: string;
    readonly whitelist_users: string[];
    readonly explicit_manage_users: string[];
    readonly fallback_manage_users: string[];
    readonly effective_manage_users: string[];
    readonly current_user_allowed: boolean;
    readonly current_user_manage_allowed: boolean;
    readonly compat_note: string;
}

interface AdminModelDraft {
    readonly model_id: string;
    readonly display_name: string;
    readonly provider_model_name: string;
    readonly sort_order: string;
    readonly enabled: boolean;
    readonly supports_reasoning: boolean;
    readonly supports_tool_calling: boolean;
    readonly supports_native_image_input: boolean;
    readonly reasoning_default_enabled: boolean;
    readonly reasoning_parser_mode: string;
    readonly reasoning_parameter_format: string;
    readonly allowed_upload_types_input: string;
    readonly visibility_scope: string;
    readonly visibility_users_input: string;
    readonly metadata_input: string;
}

interface AdminPermissionDraft {
    readonly user_key: string;
    readonly permission_code: string;
    readonly enabled: boolean;
    readonly remark: string;
}

interface AdminFeatureFlagDraft {
    readonly config_key: string;
    readonly value_type: string;
    readonly description: string;
    readonly config_value_input: string;
}

interface AssistantDefaultsDraft {
    readonly default_model: string;
    readonly default_visible_models_input: string;
    readonly default_reasoning_enabled: boolean;
}

interface ProductFlagsDraft {
    readonly gpts_feature_enabled: boolean;
}

type LoadState = "loading" | "ready" | "error";
type AdminSectionId = "models" | "gpts" | "permissions" | "flags" | "audit";

const NEW_MODEL_KEY = "__new_model__";
const NEW_PERMISSION_KEY = "__new_permission__";
const NEW_FLAG_KEY = "__new_flag__";
const STRUCTURED_FLAG_KEYS = new Set([
    "default_model",
    "default_visible_models",
    "default_reasoning_enabled",
    "gpts_feature_enabled",
]);
const ADMIN_SECTION_ROUTES: Record<AdminSectionId, string> = {
    models: "/admin/models",
    gpts: "/admin/gpts",
    permissions: "/admin/permissions",
    flags: "/admin/flags",
    audit: "/admin/audit",
};

const formatDateTime = (value: string) => {
    if (!value) {
        return "--";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleString();
};

const formatFlagValue = (value: unknown) => {
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch (_error) {
        return String(value);
    }
};

const supportToneClass = (enabled: boolean) =>
    enabled
        ? "border-[rgba(167,221,203,0.95)] bg-[rgba(235,249,243,0.98)] text-[#206c53]"
        : "border-[rgba(226,232,238,0.96)] bg-[rgba(245,247,249,0.96)] text-[#6b7783]";

const createEmptyModelDraft = (): AdminModelDraft => ({
    model_id: "",
    display_name: "",
    provider_model_name: "",
    sort_order: "1000",
    enabled: true,
    supports_reasoning: false,
    supports_tool_calling: false,
    supports_native_image_input: false,
    reasoning_default_enabled: false,
    reasoning_parser_mode: "",
    reasoning_parameter_format: "",
    allowed_upload_types_input: "",
    visibility_scope: "all",
    visibility_users_input: "",
    metadata_input: "{}",
});

const createModelDraftFromItem = (item: AdminModelConfig): AdminModelDraft => ({
    model_id: item.model_id,
    display_name: item.display_name,
    provider_model_name: item.provider_model_name,
    sort_order: String(item.sort_order),
    enabled: item.enabled,
    supports_reasoning: item.supports_reasoning,
    supports_tool_calling: item.supports_tool_calling,
    supports_native_image_input: item.supports_native_image_input,
    reasoning_default_enabled: item.reasoning_default_enabled,
    reasoning_parser_mode: item.reasoning_parser_mode || "",
    reasoning_parameter_format: item.reasoning_parameter_format || "",
    allowed_upload_types_input: item.allowed_upload_types.join(", "),
    visibility_scope: item.visibility_scope || "all",
    visibility_users_input: item.visibility_users.join(", "),
    metadata_input: JSON.stringify(item.metadata ?? {}, null, 2),
});

const createEmptyPermissionDraft = (): AdminPermissionDraft => ({
    user_key: "",
    permission_code: "",
    enabled: true,
    remark: "",
});

const createPermissionDraftFromItem = (item: AdminPermission): AdminPermissionDraft => ({
    user_key: item.user_key,
    permission_code: item.permission_code,
    enabled: item.enabled,
    remark: item.remark || "",
});

const createEmptyFlagDraft = (): AdminFeatureFlagDraft => ({
    config_key: "",
    value_type: "string",
    description: "",
    config_value_input: "",
});

const createFlagDraftFromItem = (item: AdminFeatureFlag): AdminFeatureFlagDraft => ({
    config_key: item.config_key,
    value_type: item.value_type || "string",
    description: item.description || "",
    config_value_input:
        item.value_type === "string"
            ? String(item.config_value ?? "")
            : formatFlagValue(item.config_value),
});

const createEmptyAssistantDefaultsDraft = (): AssistantDefaultsDraft => ({
    default_model: "",
    default_visible_models_input: "",
    default_reasoning_enabled: false,
});

const createEmptyProductFlagsDraft = (): ProductFlagsDraft => ({
    gpts_feature_enabled: false,
});

const splitCsvValue = (value: string) =>
    value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

const getStringFlagValue = (value: unknown) => (typeof value === "string" ? value : "");

const getBooleanFlagValue = (value: unknown) => value === true;

const getStringArrayFlagValue = (value: unknown) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean);
    }
    if (typeof value === "string") {
        return splitCsvValue(value);
    }
    return [];
};

const sortAdminModels = (items: AdminModelConfig[]) =>
    [...items].sort((left, right) => {
        if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
        }
        return left.model_id.localeCompare(right.model_id);
    });

const sortAdminPermissions = (items: AdminPermission[]) =>
    [...items].sort((left, right) => {
        const byUser = left.user_key.localeCompare(right.user_key);
        if (byUser !== 0) {
            return byUser;
        }
        return left.permission_code.localeCompare(right.permission_code);
    });

const sortAdminFeatureFlags = (items: AdminFeatureFlag[]) =>
    [...items].sort((left, right) => left.config_key.localeCompare(right.config_key));

const AdminConfig = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [errorMessage, setErrorMessage] = useState("");
    const [permissions, setPermissions] = useState<string[]>([]);
    const [models, setModels] = useState<AdminModelConfig[]>([]);
    const [userPermissions, setUserPermissions] = useState<AdminPermission[]>([]);
    const [featureFlags, setFeatureFlags] = useState<AdminFeatureFlag[]>([]);
    const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
    const [gptsOverview, setGptsOverview] = useState<AdminGptsOverview | null>(null);
    const [busyKey, setBusyKey] = useState("");
    const [editingModelKey, setEditingModelKey] = useState<string | null>(null);
    const [modelDraft, setModelDraft] = useState<AdminModelDraft>(createEmptyModelDraft());
    const [savedModelDraft, setSavedModelDraft] = useState<AdminModelDraft>(createEmptyModelDraft());
    const [editingPermissionKey, setEditingPermissionKey] = useState<string | null>(null);
    const [permissionDraft, setPermissionDraft] = useState<AdminPermissionDraft>(
        createEmptyPermissionDraft(),
    );
    const [savedPermissionDraft, setSavedPermissionDraft] = useState<AdminPermissionDraft>(
        createEmptyPermissionDraft(),
    );
    const [editingFlagKey, setEditingFlagKey] = useState<string | null>(null);
    const [flagDraft, setFlagDraft] = useState<AdminFeatureFlagDraft>(createEmptyFlagDraft());
    const [savedFlagDraft, setSavedFlagDraft] = useState<AdminFeatureFlagDraft>(
        createEmptyFlagDraft(),
    );
    const [assistantDefaultsDraft, setAssistantDefaultsDraft] = useState<AssistantDefaultsDraft>(
        createEmptyAssistantDefaultsDraft(),
    );
    const [savedAssistantDefaultsDraft, setSavedAssistantDefaultsDraft] =
        useState<AssistantDefaultsDraft>(createEmptyAssistantDefaultsDraft());
    const [productFlagsDraft, setProductFlagsDraft] = useState<ProductFlagsDraft>(
        createEmptyProductFlagsDraft(),
    );
    const [savedProductFlagsDraft, setSavedProductFlagsDraft] = useState<ProductFlagsDraft>(
        createEmptyProductFlagsDraft(),
    );
    const [flagSearchQuery, setFlagSearchQuery] = useState("");

    useEffect(() => {
        document.title = t("views.Admin.page_title");
    }, [t]);

    const requestJson = useCallback(
        (method: string, url: string, body?: Record<string, unknown>) =>
            handleRequest(
                method,
                url,
                body ? JSON.stringify(body) : undefined,
                body ? { "Content-Type": "application/json" } : undefined,
            ),
        [],
    );

    const refreshAuditLogs = useCallback(() => {
        return handleRequest("GET", getFullPath("/api/admin/audit-logs?limit=20")).then(
            (response) => {
                setAuditLogs(Array.isArray(response.items) ? response.items : []);
                if (Array.isArray(response.permissions)) {
                    setPermissions(response.permissions);
                }
            },
        );
    }, []);

    const syncPermissionsFromResponse = (response: unknown) => {
        const nextPermissions =
            typeof response === "object" && response !== null
                ? (response as { permissions?: unknown }).permissions
                : undefined;
        if (Array.isArray(nextPermissions)) {
            setPermissions(nextPermissions.filter((item): item is string => typeof item === "string"));
        }
    };

    const loadAdminData = useCallback(() => {
        setLoadState("loading");
        setErrorMessage("");
        return Promise.all([
            handleRequest("GET", getFullPath("/api/admin/models")),
            handleRequest("GET", getFullPath("/api/admin/gpts-overview")),
            handleRequest("GET", getFullPath("/api/admin/permissions")),
            handleRequest("GET", getFullPath("/api/admin/feature-flags")),
            handleRequest("GET", getFullPath("/api/admin/audit-logs?limit=20")),
        ])
            .then(([modelsResponse, gptsResponse, permissionsResponse, flagsResponse, auditResponse]) => {
                setModels(Array.isArray(modelsResponse.items) ? modelsResponse.items : []);
                setGptsOverview(
                    typeof gptsResponse === "object" && gptsResponse !== null
                        ? (gptsResponse as AdminGptsOverview)
                        : null,
                );
                setUserPermissions(
                    Array.isArray(permissionsResponse.items) ? permissionsResponse.items : [],
                );
                setFeatureFlags(Array.isArray(flagsResponse.items) ? flagsResponse.items : []);
                setAuditLogs(Array.isArray(auditResponse.items) ? auditResponse.items : []);
                setPermissions(
                    Array.isArray(modelsResponse.permissions) ? modelsResponse.permissions : [],
                );
                setLoadState("ready");
            })
            .catch((error) => {
                setLoadState("error");
                setErrorMessage(
                    error instanceof Error ? error.message : t("views.Admin.load_error"),
                );
            });
    }, [t]);

    useEffect(() => {
        loadAdminData().catch(() => {});
    }, [loadAdminData]);

    const enabledModelCount = useMemo(
        () => models.filter((item) => item.enabled).length,
        [models],
    );
    const enabledPermissionCount = useMemo(
        () => userPermissions.filter((item) => item.enabled).length,
        [userPermissions],
    );
    const activeFlagCount = featureFlags.length;
    const canManageModels = permissions.includes("models.manage");
    const canManagePermissions = permissions.includes("permissions.manage");
    const canManageFlags = permissions.includes("feature_flags.manage");
    const modelOptions = useMemo(
        () =>
            [...models].sort((left, right) => {
                if (left.sort_order !== right.sort_order) {
                    return left.sort_order - right.sort_order;
                }
                return left.model_id.localeCompare(right.model_id);
            }),
        [models],
    );
    const modelIdSet = useMemo(
        () => new Set(modelOptions.map((item) => item.model_id)),
        [modelOptions],
    );
    const assistantVisibleModelSet = useMemo(
        () => new Set(splitCsvValue(assistantDefaultsDraft.default_visible_models_input)),
        [assistantDefaultsDraft.default_visible_models_input],
    );
    const genericFeatureFlags = useMemo(() => {
        const base = featureFlags.filter((item) => !STRUCTURED_FLAG_KEYS.has(item.config_key));
        if (!flagSearchQuery.trim()) {
            return base;
        }
        const query = flagSearchQuery.toLowerCase();
        return base.filter(
            (item) =>
                item.config_key.toLowerCase().includes(query) ||
                item.description.toLowerCase().includes(query),
        );
    }, [featureFlags, flagSearchQuery]);
    const sectionNavItems = useMemo(
        () => [
            {
                id: "models" as const,
                label: t("views.Admin.models_title"),
                count: models.length,
                icon: SparklesIcon,
            },
            {
                id: "gpts" as const,
                label: t("views.Admin.gpts_title"),
                count: gptsOverview?.effective_manage_users.length ?? 0,
                icon: SparklesIcon,
            },
            {
                id: "permissions" as const,
                label: t("views.Admin.permissions_title"),
                count: userPermissions.length,
                icon: UserGroupIcon,
            },
            {
                id: "flags" as const,
                label: t("views.Admin.flags_title"),
                count: featureFlags.length,
                icon: WrenchScrewdriverIcon,
            },
            {
                id: "audit" as const,
                label: t("views.Admin.audit_title"),
                count: auditLogs.length,
                icon: EyeIcon,
            },
        ],
        [
            auditLogs.length,
            featureFlags.length,
            gptsOverview?.effective_manage_users.length,
            models.length,
            t,
            userPermissions.length,
        ],
    );
    const activeSection = useMemo<AdminSectionId>(() => {
        if (location.pathname.startsWith(ADMIN_SECTION_ROUTES.gpts)) {
            return "gpts";
        }
        if (location.pathname.startsWith(ADMIN_SECTION_ROUTES.permissions)) {
            return "permissions";
        }
        if (location.pathname.startsWith(ADMIN_SECTION_ROUTES.flags)) {
            return "flags";
        }
        if (location.pathname.startsWith(ADMIN_SECTION_ROUTES.audit)) {
            return "audit";
        }
        return "models";
    }, [location.pathname]);

    useEffect(() => {
        const flagMap = new Map(featureFlags.map((item) => [item.config_key, item]));
        const rawVisibleModels = getStringArrayFlagValue(
            flagMap.get("default_visible_models")?.config_value,
        );
        const nextVisibleModels = rawVisibleModels.filter((item) => modelIdSet.has(item));
        let nextDefaultModel = getStringFlagValue(flagMap.get("default_model")?.config_value);
        if (
            nextDefaultModel &&
            (!modelIdSet.has(nextDefaultModel) || !nextVisibleModels.includes(nextDefaultModel))
        ) {
            nextDefaultModel = nextVisibleModels[0] || "";
        }
        if (!nextDefaultModel && nextVisibleModels.length > 0) {
            nextDefaultModel = nextVisibleModels[0];
        }
        const nextProductFlagsDraft = {
            gpts_feature_enabled: getBooleanFlagValue(
                flagMap.get("gpts_feature_enabled")?.config_value,
            ),
        };
        const nextAssistantDefaultsDraft = {
            default_model: nextDefaultModel,
            default_visible_models_input: nextVisibleModels.join(", "),
            default_reasoning_enabled: getBooleanFlagValue(
                flagMap.get("default_reasoning_enabled")?.config_value,
            ),
        };
        setAssistantDefaultsDraft(nextAssistantDefaultsDraft);
        setSavedAssistantDefaultsDraft(nextAssistantDefaultsDraft);
        setProductFlagsDraft(nextProductFlagsDraft);
        setSavedProductFlagsDraft(nextProductFlagsDraft);
    }, [featureFlags]);

    const assistantDefaultsDirty = useMemo(
        () =>
            JSON.stringify(assistantDefaultsDraft) !==
            JSON.stringify(savedAssistantDefaultsDraft),
        [assistantDefaultsDraft, savedAssistantDefaultsDraft],
    );
    const productFlagsDirty = useMemo(
        () => JSON.stringify(productFlagsDraft) !== JSON.stringify(savedProductFlagsDraft),
        [productFlagsDraft, savedProductFlagsDraft],
    );
    const structuredConfigDirty = assistantDefaultsDirty || productFlagsDirty;
    const modelEditorDirty = useMemo(
        () =>
            editingModelKey !== null &&
            JSON.stringify(modelDraft) !== JSON.stringify(savedModelDraft),
        [editingModelKey, modelDraft, savedModelDraft],
    );
    const permissionEditorDirty = useMemo(
        () =>
            editingPermissionKey !== null &&
            JSON.stringify(permissionDraft) !== JSON.stringify(savedPermissionDraft),
        [editingPermissionKey, permissionDraft, savedPermissionDraft],
    );
    const flagEditorDirty = useMemo(
        () =>
            editingFlagKey !== null &&
            JSON.stringify(flagDraft) !== JSON.stringify(savedFlagDraft),
        [editingFlagKey, flagDraft, savedFlagDraft],
    );
    const hasUnsavedChanges =
        structuredConfigDirty || modelEditorDirty || permissionEditorDirty || flagEditorDirty;

    useEffect(() => {
        if (!hasUnsavedChanges) {
            return undefined;
        }
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasUnsavedChanges]);

    const summaryCards = [
        {
            label: t("views.Admin.summary.models"),
            value: `${enabledModelCount}/${models.length}`,
            icon: SparklesIcon,
        },
        {
            label: t("views.Admin.summary.gpts"),
            value: gptsOverview?.feature_enabled
                ? t("views.Admin.gpts_status_enabled")
                : t("views.Admin.gpts_status_disabled"),
            icon: SparklesIcon,
        },
        {
            label: t("views.Admin.summary.permissions"),
            value: `${enabledPermissionCount}/${userPermissions.length}`,
            icon: UserGroupIcon,
        },
        {
            label: t("views.Admin.summary.flags"),
            value: String(activeFlagCount),
            icon: WrenchScrewdriverIcon,
        },
    ];

    const resetModelEditor = () => {
        setEditingModelKey(null);
        setModelDraft(createEmptyModelDraft());
        setSavedModelDraft(createEmptyModelDraft());
    };

    const resetPermissionEditor = () => {
        setEditingPermissionKey(null);
        setPermissionDraft(createEmptyPermissionDraft());
        setSavedPermissionDraft(createEmptyPermissionDraft());
    };

    const resetFlagEditor = () => {
        setEditingFlagKey(null);
        setFlagDraft(createEmptyFlagDraft());
        setSavedFlagDraft(createEmptyFlagDraft());
    };

    const startCreateModel = () => {
        if (!canManageModels) {
            sendUserAlert(t("views.Admin.permission_denied"), true, 1800);
            return;
        }
        setEditingModelKey(NEW_MODEL_KEY);
        const nextDraft = createEmptyModelDraft();
        setModelDraft(nextDraft);
        setSavedModelDraft(nextDraft);
    };

    const startEditModel = (item: AdminModelConfig) => {
        if (!canManageModels) {
            sendUserAlert(t("views.Admin.permission_denied"), true, 1800);
            return;
        }
        setEditingModelKey(item.model_id);
        const nextDraft = createModelDraftFromItem(item);
        setModelDraft(nextDraft);
        setSavedModelDraft(nextDraft);
    };

    const startCreatePermission = () => {
        if (!canManagePermissions) {
            sendUserAlert(t("views.Admin.permission_denied"), true, 1800);
            return;
        }
        setEditingPermissionKey(NEW_PERMISSION_KEY);
        const nextDraft = createEmptyPermissionDraft();
        setPermissionDraft(nextDraft);
        setSavedPermissionDraft(nextDraft);
    };

    const startEditPermission = (item: AdminPermission) => {
        if (!canManagePermissions) {
            sendUserAlert(t("views.Admin.permission_denied"), true, 1800);
            return;
        }
        setEditingPermissionKey(`${item.user_key}::${item.permission_code}`);
        const nextDraft = createPermissionDraftFromItem(item);
        setPermissionDraft(nextDraft);
        setSavedPermissionDraft(nextDraft);
    };

    const startCreateFlag = () => {
        if (!canManageFlags) {
            sendUserAlert(t("views.Admin.permission_denied"), true, 1800);
            return;
        }
        setEditingFlagKey(NEW_FLAG_KEY);
        const nextDraft = createEmptyFlagDraft();
        setFlagDraft(nextDraft);
        setSavedFlagDraft(nextDraft);
    };

    const startEditFlag = (item: AdminFeatureFlag) => {
        if (!canManageFlags) {
            sendUserAlert(t("views.Admin.permission_denied"), true, 1800);
            return;
        }
        setEditingFlagKey(item.config_key);
        const nextDraft = createFlagDraftFromItem(item);
        setFlagDraft(nextDraft);
        setSavedFlagDraft(nextDraft);
    };

    const saveModel = async () => {
        const modelId = modelDraft.model_id.trim();
        const sortOrder = Number(modelDraft.sort_order);
        if (!modelId || !modelDraft.display_name.trim() || !modelDraft.provider_model_name.trim()) {
            sendUserAlert(t("views.Admin.validation_model_required"), true, 1800);
            return;
        }
        if (!Number.isInteger(sortOrder)) {
            sendUserAlert(t("views.Admin.validation_sort_order"), true, 1800);
            return;
        }
        let metadata: Record<string, unknown> = {};
        try {
            metadata = modelDraft.metadata_input.trim()
                ? JSON.parse(modelDraft.metadata_input)
                : {};
        } catch (_error) {
            sendUserAlert(t("views.Admin.validation_metadata_json"), true, 1800);
            return;
        }
        const payload = {
            model_id: modelId,
            display_name: modelDraft.display_name.trim(),
            provider_model_name: modelDraft.provider_model_name.trim(),
            sort_order: sortOrder,
            enabled: modelDraft.enabled,
            supports_reasoning: modelDraft.supports_reasoning,
            supports_tool_calling: modelDraft.supports_tool_calling,
            supports_native_image_input: modelDraft.supports_native_image_input,
            reasoning_default_enabled: modelDraft.reasoning_default_enabled,
            reasoning_parser_mode: modelDraft.reasoning_parser_mode.trim(),
            reasoning_parameter_format: modelDraft.reasoning_parameter_format.trim(),
            allowed_upload_types: splitCsvValue(modelDraft.allowed_upload_types_input),
            visibility_scope: modelDraft.visibility_scope,
            visibility_users: splitCsvValue(modelDraft.visibility_users_input),
            metadata,
        };
        const isNew = editingModelKey === NEW_MODEL_KEY;
        setBusyKey("model-save");
        try {
            const response = await requestJson(
                isNew ? "POST" : "PUT",
                getFullPath(
                    isNew ? "/api/admin/models" : `/api/admin/models/${encodeURIComponent(modelId)}`,
                ),
                payload,
            );
            syncPermissionsFromResponse(response);
            if (response?.item) {
                setModels((state) =>
                    sortAdminModels([
                        ...state.filter((item) => item.model_id !== response.item.model_id),
                        response.item as AdminModelConfig,
                    ]),
                );
            }
            await refreshAuditLogs();
            resetModelEditor();
            sendUserAlert(t("views.Admin.save_success"));
        } catch (error) {
            sendUserAlert(
                error instanceof Error ? error.message : t("views.Admin.save_error"),
                true,
                2200,
            );
        } finally {
            setBusyKey("");
        }
    };

    const deleteModel = (modelId: string) => {
        sendUserConfirm(t("views.Admin.delete_model_confirm"), {
            title: t("views.Admin.delete_title"),
            confirmText: t("views.Admin.delete_confirm"),
            cancelText: t("views.Admin.cancel"),
            onConfirmed: () => {
                setBusyKey(`model-delete:${modelId}`);
                handleRequest(
                    "DELETE",
                    getFullPath(`/api/admin/models/${encodeURIComponent(modelId)}`),
                )
                    .then(() => {
                        setModels((state) => state.filter((item) => item.model_id !== modelId));
                        if (editingModelKey === modelId) {
                            resetModelEditor();
                        }
                        return refreshAuditLogs();
                    })
                    .then(() => {
                        sendUserAlert(t("views.Admin.delete_success"));
                    })
                    .catch((error) => {
                        sendUserAlert(
                            error instanceof Error ? error.message : t("views.Admin.delete_error"),
                            true,
                            2200,
                        );
                    })
                    .finally(() => setBusyKey(""));
            },
        });
    };

    const savePermission = async () => {
        const userKey = permissionDraft.user_key.trim();
        const permissionCode = permissionDraft.permission_code.trim();
        if (!userKey || !permissionCode) {
            sendUserAlert(t("views.Admin.validation_permission_required"), true, 1800);
            return;
        }
        const payload = {
            user_key: userKey,
            permission_code: permissionCode,
            enabled: permissionDraft.enabled,
            remark: permissionDraft.remark.trim(),
        };
        setBusyKey("permission-save");
        try {
            const response = await requestJson("POST", getFullPath("/api/admin/permissions"), payload);
            syncPermissionsFromResponse(response);
            if (response?.item) {
                setUserPermissions((state) =>
                    sortAdminPermissions([
                        ...state.filter(
                            (item) =>
                                !(
                                    item.user_key === response.item.user_key &&
                                    item.permission_code === response.item.permission_code
                                ),
                        ),
                        response.item as AdminPermission,
                    ]),
                );
            }
            await refreshAuditLogs();
            resetPermissionEditor();
            sendUserAlert(t("views.Admin.save_success"));
        } catch (error) {
            sendUserAlert(
                error instanceof Error ? error.message : t("views.Admin.save_error"),
                true,
                2200,
            );
        } finally {
            setBusyKey("");
        }
    };

    const deletePermission = (item: AdminPermission) => {
        sendUserConfirm(t("views.Admin.delete_permission_confirm"), {
            title: t("views.Admin.delete_title"),
            confirmText: t("views.Admin.delete_confirm"),
            cancelText: t("views.Admin.cancel"),
            onConfirmed: () => {
                setBusyKey(`permission-delete:${item.user_key}:${item.permission_code}`);
                handleRequest(
                    "DELETE",
                    `${getFullPath("/api/admin/permissions")}?${new URLSearchParams({
                        user_key: item.user_key,
                        permission_code: item.permission_code,
                    }).toString()}`,
                )
                    .then(() => {
                        setUserPermissions((state) =>
                            state.filter(
                                (current) =>
                                    !(
                                        current.user_key === item.user_key &&
                                        current.permission_code === item.permission_code
                                    ),
                            ),
                        );
                        if (
                            editingPermissionKey ===
                            `${item.user_key}::${item.permission_code}`
                        ) {
                            resetPermissionEditor();
                        }
                        return refreshAuditLogs();
                    })
                    .then(() => {
                        sendUserAlert(t("views.Admin.delete_success"));
                    })
                    .catch((error) => {
                        sendUserAlert(
                            error instanceof Error ? error.message : t("views.Admin.delete_error"),
                            true,
                            2200,
                        );
                    })
                    .finally(() => setBusyKey(""));
            },
        });
    };

    const parseFlagValue = () => {
        const raw = flagDraft.config_value_input;
        if (flagDraft.value_type === "string") {
            return raw;
        }
        if (flagDraft.value_type === "number") {
            const parsed = Number(raw.trim());
            if (Number.isNaN(parsed)) {
                throw new Error(t("views.Admin.validation_flag_number"));
            }
            return parsed;
        }
        if (flagDraft.value_type === "boolean") {
            const normalized = raw.trim().toLowerCase();
            if (normalized !== "true" && normalized !== "false") {
                throw new Error(t("views.Admin.validation_flag_boolean"));
            }
            return normalized === "true";
        }
        try {
            return raw.trim() ? JSON.parse(raw) : null;
        } catch (_error) {
            throw new Error(t("views.Admin.validation_flag_json"));
        }
    };

    const saveFlag = async () => {
        const configKey = flagDraft.config_key.trim();
        if (!configKey) {
            sendUserAlert(t("views.Admin.validation_flag_key"), true, 1800);
            return;
        }
        let configValue: unknown;
        try {
            configValue = parseFlagValue();
        } catch (error) {
            sendUserAlert(
                error instanceof Error ? error.message : t("views.Admin.save_error"),
                true,
                2200,
            );
            return;
        }
        const payload = {
            config_key: configKey,
            config_value: configValue,
            value_type: flagDraft.value_type,
            description: flagDraft.description.trim(),
        };
        const isNew = editingFlagKey === NEW_FLAG_KEY;
        setBusyKey("flag-save");
        try {
            const response = await requestJson(
                isNew ? "POST" : "PUT",
                getFullPath(
                    isNew
                        ? "/api/admin/feature-flags"
                        : `/api/admin/feature-flags/${encodeURIComponent(configKey)}`,
                ),
                payload,
            );
            syncPermissionsFromResponse(response);
            if (response?.item) {
                setFeatureFlags((state) =>
                    sortAdminFeatureFlags([
                        ...state.filter((item) => item.config_key !== response.item.config_key),
                        response.item as AdminFeatureFlag,
                    ]),
                );
            }
            await refreshAuditLogs();
            resetFlagEditor();
            sendUserAlert(t("views.Admin.save_success"));
        } catch (error) {
            sendUserAlert(
                error instanceof Error ? error.message : t("views.Admin.save_error"),
                true,
                2200,
            );
        } finally {
            setBusyKey("");
        }
    };

    const toggleFlag = async (flag: AdminFeatureFlag) => {
        if (flag.value_type !== "boolean") {
            return;
        }
        const newValue = !flag.config_value;
        const payload = {
            config_key: flag.config_key,
            config_value: newValue,
            value_type: "boolean",
            description: flag.description,
        };
        const currentBusyKey = `flag-toggle:${flag.config_key}`;
        setBusyKey(currentBusyKey);
        try {
            const response = await requestJson(
                "PUT",
                getFullPath(`/api/admin/feature-flags/${encodeURIComponent(flag.config_key)}`),
                payload,
            );
            syncPermissionsFromResponse(response);
            if (response?.item) {
                setFeatureFlags((state) =>
                    sortAdminFeatureFlags([
                        ...state.filter((item) => item.config_key !== response.item.config_key),
                        response.item as AdminFeatureFlag,
                    ]),
                );
            }
            await refreshAuditLogs();
            sendUserAlert(t("views.Admin.save_success"));
        } catch (error) {
            sendUserAlert(
                error instanceof Error ? error.message : t("views.Admin.save_error"),
                true,
                2200,
            );
        } finally {
            setBusyKey("");
        }
    };

    const toggleAssistantVisibleModel = (modelId: string) => {
        setAssistantDefaultsDraft((state) => {
            const nextValues = splitCsvValue(state.default_visible_models_input);
            const nextSet = new Set(nextValues);
            let nextDefaultModel = state.default_model;

            if (nextSet.has(modelId)) {
                nextSet.delete(modelId);
                // If we are hiding the model that was set as default, clear the default setting
                if (nextDefaultModel === modelId) {
                    nextDefaultModel = "";
                }
            } else {
                nextSet.add(modelId);
            }

            return {
                ...state,
                default_model: nextDefaultModel,
                default_visible_models_input: Array.from(nextSet).join(", "),
            };
        });
    };

    const saveAssistantDefaults = async () => {
        if (!canManageFlags) {
            sendUserAlert(t("views.Admin.permission_denied"), true, 1800);
            return;
        }
        const defaultModel = assistantDefaultsDraft.default_model.trim();
        const visibleModels = splitCsvValue(assistantDefaultsDraft.default_visible_models_input);
        const validVisibleModels = visibleModels.filter((item) => modelIdSet.has(item));
        let nextDefaultModel = defaultModel;

        if (validVisibleModels.length === 0) {
            sendUserAlert(t("views.Admin.validation_visible_models_required"), true, 2200);
            return;
        }
        if (
            !nextDefaultModel ||
            !modelIdSet.has(nextDefaultModel) ||
            !validVisibleModels.includes(nextDefaultModel)
        ) {
            nextDefaultModel = validVisibleModels[0] || "";
        }
        if (!nextDefaultModel) {
            sendUserAlert(t("views.Admin.validation_default_model_required"), true, 2200);
            return;
        }
        setBusyKey("assistant-defaults-save");
        try {
            const responses = await Promise.all([
                requestJson(
                    "PUT",
                    getFullPath("/api/admin/feature-flags/default_model"),
                    {
                        config_key: "default_model",
                        config_value: nextDefaultModel,
                        value_type: "string",
                        description: t("views.Admin.assistant_defaults_default_model_description"),
                    },
                ),
                requestJson(
                    "PUT",
                    getFullPath("/api/admin/feature-flags/default_visible_models"),
                    {
                        config_key: "default_visible_models",
                        config_value: validVisibleModels,
                        value_type: "json",
                        description: t(
                            "views.Admin.assistant_defaults_default_visible_models_description",
                        ),
                    },
                ),
                requestJson(
                    "PUT",
                    getFullPath("/api/admin/feature-flags/default_reasoning_enabled"),
                    {
                        config_key: "default_reasoning_enabled",
                        config_value: assistantDefaultsDraft.default_reasoning_enabled,
                        value_type: "boolean",
                        description: t(
                            "views.Admin.assistant_defaults_default_reasoning_description",
                        ),
                    },
                ),
            ]);
            responses.forEach((response) => syncPermissionsFromResponse(response));
            setFeatureFlags((state) => {
                const nextItems = [...state];
                responses.forEach((response) => {
                    if (!response?.item) {
                        return;
                    }
                    const nextItem = response.item as AdminFeatureFlag;
                    const nextIndex = nextItems.findIndex(
                        (item) => item.config_key === nextItem.config_key,
                    );
                    if (nextIndex >= 0) {
                        nextItems[nextIndex] = nextItem;
                    } else {
                        nextItems.push(nextItem);
                    }
                });
                return sortAdminFeatureFlags(nextItems);
            });
            await refreshAuditLogs();
            sendUserAlert(t("views.Admin.save_success"));
        } catch (error) {
            sendUserAlert(
                error instanceof Error ? error.message : t("views.Admin.save_error"),
                true,
                2200,
            );
        } finally {
            setBusyKey("");
        }
    };

    const saveProductFlags = async () => {
        if (!canManageFlags) {
            sendUserAlert(t("views.Admin.permission_denied"), true, 1800);
            return;
        }
        setBusyKey("product-flags-save");
        try {
            const response = await requestJson(
                "PUT",
                getFullPath("/api/admin/feature-flags/gpts_feature_enabled"),
                {
                    config_key: "gpts_feature_enabled",
                    config_value: productFlagsDraft.gpts_feature_enabled,
                    value_type: "boolean",
                    description: t("views.Admin.product_flags_gpts_description"),
                },
            );
            syncPermissionsFromResponse(response);
            if (response?.item) {
                setFeatureFlags((state) =>
                    sortAdminFeatureFlags([
                        ...state.filter((item) => item.config_key !== response.item.config_key),
                        response.item as AdminFeatureFlag,
                    ]),
                );
            }
            await refreshAuditLogs();
            sendUserAlert(t("views.Admin.save_success"));
        } catch (error) {
            sendUserAlert(
                error instanceof Error ? error.message : t("views.Admin.save_error"),
                true,
                2200,
            );
        } finally {
            setBusyKey("");
        }
    };

    const deleteFlag = (configKey: string) => {
        sendUserConfirm(t("views.Admin.delete_flag_confirm"), {
            title: t("views.Admin.delete_title"),
            confirmText: t("views.Admin.delete_confirm"),
            cancelText: t("views.Admin.cancel"),
            onConfirmed: () => {
                setBusyKey(`flag-delete:${configKey}`);
                handleRequest(
                    "DELETE",
                    getFullPath(`/api/admin/feature-flags/${encodeURIComponent(configKey)}`),
                )
                    .then(() => {
                        setFeatureFlags((state) =>
                            state.filter((item) => item.config_key !== configKey),
                        );
                        if (editingFlagKey === configKey) {
                            resetFlagEditor();
                        }
                        return refreshAuditLogs();
                    })
                    .then(() => {
                        sendUserAlert(t("views.Admin.delete_success"));
                    })
                    .catch((error) => {
                        sendUserAlert(
                            error instanceof Error ? error.message : t("views.Admin.delete_error"),
                            true,
                            2200,
                        );
                    })
                    .finally(() => setBusyKey(""));
            },
        });
    };

    const formLabelClass =
        "text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d8a95]";
    const inputClass =
        "w-full rounded-2xl border border-[rgba(214,223,229,0.98)] bg-white/95 px-3 py-2 text-sm text-[#2f3a46] outline-none transition-colors focus:border-[#8ec4d0]";
    const textareaClass = `${inputClass} min-h-[96px] font-mono text-xs leading-5`;
    const buttonClass =
        "inline-flex h-9 items-center justify-center rounded-xl px-3.5 text-sm font-semibold transition-colors";
    const navigateToSection = (sectionId: AdminSectionId) => {
        if (activeSection === sectionId) {
            return;
        }
        if (hasUnsavedChanges && !window.confirm(t("views.Admin.leave_confirm"))) {
            return;
        }
        navigate(ADMIN_SECTION_ROUTES[sectionId]);
    };

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(227,241,246,0.75),rgba(247,249,251,0.98)_36%,rgba(242,246,249,0.98)_100%)] px-4 py-5 text-[#2f3a46] xl:px-5">
            <div className="mx-auto flex max-w-[1520px] flex-col gap-4">
                <header className="rounded-[26px] border border-[rgba(220,229,235,0.95)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,250,0.96))] px-5 py-5 shadow-[0_18px_40px_rgba(23,28,38,0.06)]">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7f8b96]">
                            {t("views.Admin.workspace_label")}
                        </p>
                        {hasUnsavedChanges && (
                            <span className="inline-flex items-center rounded-full border border-[rgba(251,214,163,0.98)] bg-[rgba(255,248,236,0.98)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a5a17]">
                                {t("views.Admin.unsaved_changes_short")}
                            </span>
                        )}
                    </div>
                    <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#25313c]">
                                {t("views.Admin.page_title")}
                            </h1>
                            <p className="mt-2 max-w-[760px] text-sm leading-6 text-[#66717d]">
                                {t("views.Admin.page_subtitle")}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {permissions.map((permission) => (
                                <span
                                    key={permission}
                                    className="inline-flex items-center rounded-full border border-[rgba(203,221,229,0.98)] bg-white/90 px-3 py-1 text-xs font-medium text-[#3b4b59]"
                                >
                                    {permission}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full border border-[rgba(203,221,229,0.98)] bg-[rgba(241,247,249,0.96)] px-3 py-1 text-xs font-medium text-[#51606c]">
                            {t("views.Admin.section_count_label", {
                                count: sectionNavItems.length,
                            })}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-[rgba(203,221,229,0.98)] bg-[rgba(241,247,249,0.96)] px-3 py-1 text-xs font-medium text-[#51606c]">
                            {t("views.Admin.summary.models")}: {enabledModelCount}/{models.length}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-[rgba(203,221,229,0.98)] bg-[rgba(241,247,249,0.96)] px-3 py-1 text-xs font-medium text-[#51606c]">
                            {t("views.Admin.summary.permissions")}: {enabledPermissionCount}/
                            {userPermissions.length}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-[rgba(203,221,229,0.98)] bg-[rgba(241,247,249,0.96)] px-3 py-1 text-xs font-medium text-[#51606c]">
                            {t("views.Admin.summary.flags")}: {activeFlagCount}
                        </span>
                    </div>
                </header>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {summaryCards.map(({ label, value, icon: Icon }) => (
                        <article
                            key={label}
                            className="rounded-[20px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-4 py-4 shadow-[0_14px_30px_rgba(23,28,38,0.045)]"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-[#75818d]">
                                    {label}
                                </span>
                                <Icon className="size-5 text-[#67a9b9]" strokeWidth={1.8} />
                            </div>
                            <div className="mt-2.5 text-[24px] font-semibold tracking-[-0.03em] text-[#25313c]">
                                {value}
                            </div>
                        </article>
                    ))}
                </section>

                {loadState === "loading" && (
                    <section className="rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-5 py-8 shadow-[0_16px_36px_rgba(23,28,38,0.05)]">
                        <div className="flex items-center gap-3 text-sm font-medium text-[#66717d]">
                            <ArrowPathIcon className="size-5 animate-spin text-[#67a9b9]" />
                            <span>{t("views.Admin.loading")}</span>
                        </div>
                    </section>
                )}

                {loadState === "error" && (
                    <section className="rounded-[22px] border border-[rgba(242,204,204,0.98)] bg-[rgba(255,248,248,0.98)] px-5 py-5 shadow-[0_16px_36px_rgba(23,28,38,0.04)]">
                        <div className="flex items-center gap-3 text-sm font-medium text-[#9f3f3f]">
                            <XCircleIcon className="size-5" />
                            <span>{errorMessage || t("views.Admin.load_error")}</span>
                        </div>
                    </section>
                )}

                {loadState === "ready" && (
                    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)] xl:items-start">
                        <aside className="xl:sticky xl:top-5">
                            <div className="rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/96 px-4 py-4 shadow-[0_14px_30px_rgba(23,28,38,0.045)]">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b8792]">
                                    {t("views.Admin.sections_label")}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-[#66717d]">
                                    {t("views.Admin.sections_subtitle")}
                                </p>
                                <div className="mt-4 grid gap-2">
                                    {sectionNavItems.map(({ id, label, count, icon: Icon }) => {
                                        const isActive = activeSection === id;
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                                                    isActive
                                                        ? "border-[rgba(99,170,188,0.98)] bg-[rgba(231,244,247,0.98)] text-[#1f6272]"
                                                        : "border-[rgba(214,223,229,0.98)] bg-[rgba(249,251,252,0.98)] text-[#4f5d69] hover:bg-[rgba(244,248,250,0.98)]"
                                                }`}
                                                onClick={() => navigateToSection(id)}
                                            >
                                                <span className="flex min-w-0 items-center gap-3">
                                                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(37,49,60,0.06)]">
                                                        <Icon className="size-4" strokeWidth={1.9} />
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-semibold">
                                                            {label}
                                                        </span>
                                                    </span>
                                                </span>
                                                <span className="shrink-0 rounded-full bg-[rgba(37,49,60,0.08)] px-2 py-0.5 text-[11px] font-semibold text-inherit">
                                                    {count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </aside>
                        <div className="grid gap-4">
                        {activeSection === "models" && (
                        <section
                            id="admin-section-models"
                            className="scroll-mt-28 rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-5 py-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]"
                        >
                            <div className="flex flex-col gap-3 border-b border-[rgba(231,237,242,0.95)] pb-4 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-[#25313c]">
                                        {t("views.Admin.models_title")}
                                    </h2>
                                    <p className="mt-1 text-sm text-[#66717d]">
                                        {t("views.Admin.models_subtitle")}
                                    </p>
                                </div>
                                    <button
                                        type="button"
                                        className={`${buttonClass} bg-[#25313c] text-white hover:bg-[#1b242d]`}
                                        onClick={startCreateModel}
                                        disabled={!canManageModels}
                                    >
                                    <PlusIcon className="mr-2 size-4" />
                                    {t("views.Admin.add_model")}
                                </button>
                            </div>

                                {!canManageModels && (
                                    <p className="mt-4 text-sm text-[#8a95a0]">
                                        {t("views.Admin.models_read_only_hint")}
                                    </p>
                                )}
                                {editingModelKey && (
                                <div className="mt-4 rounded-[20px] border border-[rgba(213,223,229,0.98)] bg-[rgba(246,249,251,0.96)] p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 className="text-base font-semibold text-[#25313c]">
                                                {editingModelKey === NEW_MODEL_KEY
                                                    ? t("views.Admin.create_model_title")
                                                    : t("views.Admin.edit_model_title")}
                                            </h3>
                                            {modelEditorDirty && (
                                                <span className="rounded-full border border-[rgba(251,214,163,0.98)] bg-[rgba(255,248,236,0.98)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a5a17]">
                                                    {t("views.Admin.unsaved_changes_short")}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                className="text-sm text-[#7b8792] hover:text-[#25313c]"
                                                onClick={resetModelEditor}
                                        >
                                            {t("views.Admin.cancel")}
                                        </button>
                                    </div>
                                    <div className="mt-4 grid gap-3 xl:grid-cols-3">
                                        <label className="grid gap-2">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_model_id")}
                                            </span>
                                            <input
                                                className={inputClass}
                                                value={modelDraft.model_id}
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        model_id: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-2">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_display_name")}
                                            </span>
                                            <input
                                                className={inputClass}
                                                value={modelDraft.display_name}
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        display_name: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-2">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_provider_model")}
                                            </span>
                                            <input
                                                className={inputClass}
                                                value={modelDraft.provider_model_name}
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        provider_model_name: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-2">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_sort_order")}
                                            </span>
                                            <input
                                                className={inputClass}
                                                value={modelDraft.sort_order}
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        sort_order: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-2">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_visibility_scope")}
                                            </span>
                                            <select
                                                className={inputClass}
                                                value={modelDraft.visibility_scope}
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        visibility_scope: event.target.value,
                                                    }))
                                                }
                                            >
                                                <option value="all">all</option>
                                                <option value="whitelist">whitelist</option>
                                                <option value="hidden">hidden</option>
                                            </select>
                                        </label>
                                        <label className="grid gap-2">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_allowed_upload_types")}
                                            </span>
                                            <input
                                                className={inputClass}
                                                value={modelDraft.allowed_upload_types_input}
                                                placeholder="document, image"
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        allowed_upload_types_input: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-2 xl:col-span-2">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_visibility_users")}
                                            </span>
                                            <input
                                                className={inputClass}
                                                value={modelDraft.visibility_users_input}
                                                placeholder="user1@example.com, user2@example.com"
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        visibility_users_input: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-2">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_reasoning_parser")}
                                            </span>
                                            <input
                                                className={inputClass}
                                                value={modelDraft.reasoning_parser_mode}
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        reasoning_parser_mode: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-2">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_reasoning_parameter")}
                                            </span>
                                            <input
                                                className={inputClass}
                                                value={modelDraft.reasoning_parameter_format}
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        reasoning_parameter_format: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-2 xl:col-span-3">
                                            <span className={formLabelClass}>
                                                {t("views.Admin.form_metadata")}
                                            </span>
                                            <textarea
                                                className={textareaClass}
                                                value={modelDraft.metadata_input}
                                                onChange={(event) =>
                                                    setModelDraft((state) => ({
                                                        ...state,
                                                        metadata_input: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2.5">
                                        {[
                                            ["enabled", t("views.Admin.form_enabled")],
                                            ["supports_reasoning", t("views.Admin.form_supports_reasoning")],
                                            ["supports_tool_calling", t("views.Admin.form_supports_tool_calling")],
                                            ["supports_native_image_input", t("views.Admin.form_supports_image_input")],
                                            ["reasoning_default_enabled", t("views.Admin.form_reasoning_default")],
                                        ].map(([key, label]) => (
                                            <label
                                                key={key}
                                                className="inline-flex items-center gap-2 rounded-full border border-[rgba(213,223,229,0.98)] bg-white/90 px-3 py-1.5 text-sm text-[#2f3a46]"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(modelDraft[key as keyof AdminModelDraft])}
                                                    onChange={(event) =>
                                                        setModelDraft((state) => ({
                                                            ...state,
                                                            [key]: event.target.checked,
                                                        }))
                                                    }
                                                />
                                                <span>{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2.5">
                                        <button
                                            type="button"
                                            className={`${buttonClass} bg-[#279ab3] text-white hover:bg-[#1e7f95] disabled:bg-[#a3ccd4] disabled:cursor-not-allowed`}
                                            onClick={saveModel}
                                            disabled={busyKey === "model-save" || !modelEditorDirty}
                                        >
                                            {busyKey === "model-save"
                                                ? t("views.Admin.saving")
                                                : t("views.Admin.save")}
                                        </button>
                                        <button
                                            type="button"
                                            className={`${buttonClass} border border-[rgba(214,223,229,0.98)] bg-white text-[#2f3a46] hover:bg-[rgba(245,248,250,0.96)] disabled:opacity-30 disabled:cursor-not-allowed`}
                                            onClick={() => setModelDraft(savedModelDraft)}
                                            disabled={busyKey === "model-save" || !modelEditorDirty}
                                        >
                                            {t("views.Admin.reset")}
                                        </button>
                                        <button
                                            type="button"
                                            className={`${buttonClass} border border-[rgba(214,223,229,0.98)] bg-white text-[#2f3a46] hover:bg-[rgba(245,248,250,0.96)]`}
                                            onClick={resetModelEditor}
                                        >
                                            {t("views.Admin.cancel")}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                                {models.map((model) => (
                                    <article
                                        key={`${model.id}-${model.model_id}`}
                                        className="rounded-[18px] border border-[rgba(228,234,239,0.98)] bg-[linear-gradient(180deg,rgba(252,253,254,0.98),rgba(246,249,251,0.98))] p-4"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-[15px] font-semibold text-[#25313c]">
                                                        {model.display_name || model.model_id}
                                                    </h3>
                                                    <span className="rounded-full border border-[rgba(213,222,228,0.98)] bg-white/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#66717d]">
                                                        {model.model_id}
                                                    </span>
                                                </div>
                                                <p className="mt-1.5 text-sm text-[#66717d]">
                                                    {t("views.Admin.provider_model_label", {
                                                        providerModel: model.provider_model_name || "--",
                                                    })}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                                        model.enabled
                                                            ? "border-[rgba(167,221,203,0.95)] bg-[rgba(235,249,243,0.98)] text-[#206c53]"
                                                            : "border-[rgba(238,214,214,0.98)] bg-[rgba(252,242,242,0.98)] text-[#a34f4f]"
                                                    }`}
                                                >
                                                    {model.enabled ? (
                                                        <CheckCircleIcon className="size-4" />
                                                    ) : (
                                                        <XCircleIcon className="size-4" />
                                                    )}
                                                    {model.enabled
                                                        ? t("views.Admin.enabled")
                                                        : t("views.Admin.disabled")}
                                                </span>
                                                {canManageModels && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="rounded-xl p-2 text-[#66717d] transition-colors hover:bg-white hover:text-[#25313c]"
                                                            onClick={() => startEditModel(model)}
                                                        >
                                                            <PencilSquareIcon className="size-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="rounded-xl p-2 text-[#a34f4f] transition-colors hover:bg-white hover:text-[#8c2f2f]"
                                                            onClick={() => deleteModel(model.model_id)}
                                                            disabled={busyKey === `model-delete:${model.model_id}`}
                                                        >
                                                            <TrashIcon className="size-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${supportToneClass(model.supports_reasoning)}`}>
                                                {t("views.Admin.capability_reasoning")}
                                            </span>
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${supportToneClass(model.supports_tool_calling)}`}>
                                                {t("views.Admin.capability_tool_calling")}
                                            </span>
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${supportToneClass(model.supports_native_image_input)}`}>
                                                {t("views.Admin.capability_image_input")}
                                            </span>
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${supportToneClass(model.reasoning_default_enabled)}`}>
                                                {t("views.Admin.capability_reasoning_default")}
                                            </span>
                                        </div>
                                        <dl className="mt-3 grid gap-2.5 text-sm text-[#5e6b77] sm:grid-cols-2">
                                            <div className="rounded-2xl bg-white/85 px-3 py-2.5">
                                                <dt className="text-xs uppercase tracking-[0.12em] text-[#8a95a0]">
                                                    {t("views.Admin.visibility_label")}
                                                </dt>
                                                <dd className="mt-2 font-medium text-[#2f3a46]">
                                                    {model.visibility_scope}
                                                </dd>
                                            </div>
                                            <div className="rounded-2xl bg-white/85 px-3 py-2.5">
                                                <dt className="text-xs uppercase tracking-[0.12em] text-[#8a95a0]">
                                                    {t("views.Admin.upload_types_label")}
                                                </dt>
                                                <dd className="mt-2 font-medium text-[#2f3a46]">
                                                    {model.allowed_upload_types.length
                                                        ? model.allowed_upload_types.join(", ")
                                                        : "--"}
                                                </dd>
                                            </div>
                                        </dl>
                                        {model.visibility_users.length > 0 && (
                                            <div className="mt-3 rounded-2xl bg-[rgba(243,247,249,0.96)] px-3 py-2.5">
                                                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[#8a95a0]">
                                                    <EyeIcon className="size-4" />
                                                    <span>{t("views.Admin.visibility_users_label")}</span>
                                                </div>
                                                <p className="mt-2 text-sm text-[#2f3a46]">
                                                    {model.visibility_users.join(", ")}
                                                </p>
                                            </div>
                                        )}
                                        <p className="mt-3 text-xs text-[#8a95a0]">
                                            {t("views.Admin.updated_at_label", {
                                                updatedAt: formatDateTime(model.updated_at),
                                            })}
                                        </p>
                                    </article>
                                ))}
                            </div>
                        </section>
                        )}

                        {activeSection === "gpts" && (
                            <section
                                id="admin-section-gpts"
                                className="scroll-mt-28 rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-5 py-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]"
                            >
                                <div className="border-b border-[rgba(231,237,242,0.95)] pb-4">
                                    <h2 className="text-lg font-semibold text-[#25313c]">
                                        {t("views.Admin.gpts_title")}
                                    </h2>
                                    <p className="mt-1 text-sm leading-6 text-[#66717d]">
                                        {t("views.Admin.gpts_subtitle")}
                                    </p>
                                </div>

                                {gptsOverview ? (
                                    <>
                                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                                            <article className="rounded-[20px] border border-[rgba(213,223,229,0.98)] bg-[rgba(248,251,252,0.98)] px-4 py-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d8a95]">
                                                    {t("views.Admin.gpts_feature_status")}
                                                </p>
                                                <div className="mt-3 flex items-center gap-2">
                                                    {gptsOverview.feature_enabled ? (
                                                        <CheckCircleIcon className="size-5 text-[#2f8f6a]" />
                                                    ) : (
                                                        <XCircleIcon className="size-5 text-[#a34f4f]" />
                                                    )}
                                                    <span className="text-lg font-semibold text-[#25313c]">
                                                        {gptsOverview.feature_enabled
                                                            ? t("views.Admin.gpts_status_enabled")
                                                            : t("views.Admin.gpts_status_disabled")}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm leading-6 text-[#66717d]">
                                                    {t("views.Admin.gpts_feature_status_hint")}
                                                </p>
                                            </article>
                                            <article className="rounded-[20px] border border-[rgba(213,223,229,0.98)] bg-[rgba(248,251,252,0.98)] px-4 py-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d8a95]">
                                                    {t("views.Admin.gpts_visible_scope")}
                                                </p>
                                                <div className="mt-3 text-lg font-semibold text-[#25313c]">
                                                    {gptsOverview.visible_scope === "all"
                                                        ? t("views.Admin.gpts_scope_all")
                                                        : t("views.Admin.gpts_scope_whitelist", {
                                                              count: gptsOverview.whitelist_users.length,
                                                          })}
                                                </div>
                                                <p className="mt-2 text-sm leading-6 text-[#66717d]">
                                                    {t("views.Admin.gpts_visible_scope_hint")}
                                                </p>
                                            </article>
                                            <article className="rounded-[20px] border border-[rgba(213,223,229,0.98)] bg-[rgba(248,251,252,0.98)] px-4 py-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d8a95]">
                                                    {t("views.Admin.gpts_current_user")}
                                                </p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${supportToneClass(gptsOverview.current_user_allowed)}`}>
                                                        {t("views.Admin.gpts_current_visible")}:{" "}
                                                        {gptsOverview.current_user_allowed
                                                            ? t("views.Admin.enabled")
                                                            : t("views.Admin.disabled")}
                                                    </span>
                                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${supportToneClass(gptsOverview.current_user_manage_allowed)}`}>
                                                        {t("views.Admin.gpts_current_manage")}:{" "}
                                                        {gptsOverview.current_user_manage_allowed
                                                            ? t("views.Admin.enabled")
                                                            : t("views.Admin.disabled")}
                                                    </span>
                                                </div>
                                            </article>
                                        </div>

                                        <div className="mt-4 grid gap-4 xl:grid-cols-3">
                                            {[
                                                {
                                                    title: t("views.Admin.gpts_whitelist_users"),
                                                    items: gptsOverview.whitelist_users,
                                                    empty: t("views.Admin.gpts_empty_all_users"),
                                                },
                                                {
                                                    title: t("views.Admin.gpts_manage_users"),
                                                    items: gptsOverview.explicit_manage_users,
                                                    empty: t("views.Admin.gpts_empty_no_users"),
                                                },
                                                {
                                                    title: t("views.Admin.gpts_fallback_manage_users"),
                                                    items: gptsOverview.fallback_manage_users,
                                                    empty: t("views.Admin.gpts_empty_no_users"),
                                                },
                                            ].map((group) => (
                                                <article
                                                    key={group.title}
                                                    className="rounded-[20px] border border-[rgba(223,231,236,0.96)] bg-white px-4 py-4"
                                                >
                                                    <h3 className="text-sm font-semibold text-[#25313c]">
                                                        {group.title}
                                                    </h3>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {group.items.length ? (
                                                            group.items.map((item) => (
                                                                <span
                                                                    key={item}
                                                                    className="rounded-full border border-[rgba(203,221,229,0.98)] bg-[rgba(241,247,249,0.96)] px-3 py-1 text-xs font-medium text-[#3b4b59]"
                                                                >
                                                                    {item}
                                                                </span>
                                                            ))
                                                        ) : (
                                                            <span className="text-sm text-[#8a95a0]">
                                                                {group.empty}
                                                            </span>
                                                        )}
                                                    </div>
                                                </article>
                                            ))}
                                        </div>

                                        <div className="mt-4 rounded-[18px] border border-[rgba(251,214,163,0.98)] bg-[rgba(255,248,236,0.98)] px-4 py-3 text-sm leading-6 text-[#8a5a17]">
                                            {t("views.Admin.gpts_compat_note")}
                                        </div>
                                    </>
                                ) : (
                                    <p className="mt-4 text-sm text-[#8a95a0]">
                                        {t("views.Admin.gpts_overview_empty")}
                                    </p>
                                )}
                            </section>
                        )}

                        {activeSection === "permissions" && (
                            <section
                                id="admin-section-permissions"
                                className="scroll-mt-28 rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-5 py-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]"
                            >
                                <div className="flex flex-col gap-3 border-b border-[rgba(231,237,242,0.95)] pb-4 md:flex-row md:items-end md:justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold text-[#25313c]">
                                            {t("views.Admin.permissions_title")}
                                        </h2>
                                        <p className="mt-1 text-sm text-[#66717d]">
                                            {t("views.Admin.permissions_subtitle")}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className={`${buttonClass} bg-[#25313c] text-white hover:bg-[#1b242d]`}
                                        onClick={startCreatePermission}
                                        disabled={!canManagePermissions}
                                    >
                                        <PlusIcon className="mr-2 size-4" />
                                        {t("views.Admin.add_permission")}
                                    </button>
                                </div>

                                {!canManagePermissions && (
                                    <p className="mt-4 text-sm text-[#8a95a0]">
                                        {t("views.Admin.permissions_read_only_hint")}
                                    </p>
                                )}
                                {editingPermissionKey && (
                                    <div className="mt-4 rounded-[20px] border border-[rgba(213,223,229,0.98)] bg-[rgba(246,249,251,0.96)] p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 className="text-base font-semibold text-[#25313c]">
                                                {editingPermissionKey === NEW_PERMISSION_KEY
                                                    ? t("views.Admin.create_permission_title")
                                                    : t("views.Admin.edit_permission_title")}
                                            </h3>
                                            {permissionEditorDirty && (
                                                <span className="rounded-full border border-[rgba(251,214,163,0.98)] bg-[rgba(255,248,236,0.98)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a5a17]">
                                                    {t("views.Admin.unsaved_changes_short")}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                className="text-sm text-[#7b8792] hover:text-[#25313c]"
                                                onClick={resetPermissionEditor}
                                            >
                                                {t("views.Admin.cancel")}
                                            </button>
                                        </div>
                                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                                            <label className="grid gap-2">
                                                <span className={formLabelClass}>
                                                    {t("views.Admin.form_user_key")}
                                                </span>
                                                <input
                                                    className={inputClass}
                                                    value={permissionDraft.user_key}
                                                    onChange={(event) =>
                                                        setPermissionDraft((state) => ({
                                                            ...state,
                                                            user_key: event.target.value,
                                                        }))
                                                    }
                                                />
                                            </label>
                                            <label className="grid gap-2">
                                                <span className={formLabelClass}>
                                                    {t("views.Admin.form_permission_code")}
                                                </span>
                                                <input
                                                    className={inputClass}
                                                    value={permissionDraft.permission_code}
                                                    onChange={(event) =>
                                                        setPermissionDraft((state) => ({
                                                            ...state,
                                                            permission_code: event.target.value,
                                                        }))
                                                    }
                                                />
                                            </label>
                                            <label className="grid gap-2">
                                                <span className={formLabelClass}>
                                                    {t("views.Admin.form_remark")}
                                                </span>
                                                <input
                                                    className={inputClass}
                                                    value={permissionDraft.remark}
                                                    onChange={(event) =>
                                                        setPermissionDraft((state) => ({
                                                            ...state,
                                                            remark: event.target.value,
                                                        }))
                                                    }
                                                />
                                            </label>
                                            <label className="inline-flex items-center gap-2 rounded-full border border-[rgba(213,223,229,0.98)] bg-white/90 px-3 py-2 text-sm text-[#2f3a46]">
                                                <input
                                                    type="checkbox"
                                                    checked={permissionDraft.enabled}
                                                    onChange={(event) =>
                                                        setPermissionDraft((state) => ({
                                                            ...state,
                                                            enabled: event.target.checked,
                                                        }))
                                                    }
                                                />
                                                <span>{t("views.Admin.form_enabled")}</span>
                                            </label>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2.5">
                                            <button
                                                type="button"
                                                className={`${buttonClass} bg-[#279ab3] text-white hover:bg-[#1e7f95] disabled:bg-[#a3ccd4] disabled:cursor-not-allowed`}
                                                onClick={savePermission}
                                                disabled={
                                                    busyKey === "permission-save" ||
                                                    !permissionEditorDirty
                                                }
                                            >
                                                {busyKey === "permission-save"
                                                    ? t("views.Admin.saving")
                                                    : t("views.Admin.save")}
                                            </button>
                                            <button
                                                type="button"
                                                className={`${buttonClass} border border-[rgba(214,223,229,0.98)] bg-white text-[#2f3a46] hover:bg-[rgba(245,248,250,0.96)] disabled:opacity-30 disabled:cursor-not-allowed`}
                                                onClick={() =>
                                                    setPermissionDraft(savedPermissionDraft)
                                                }
                                                disabled={
                                                    busyKey === "permission-save" ||
                                                    !permissionEditorDirty
                                                }
                                            >
                                                {t("views.Admin.reset")}
                                            </button>
                                            <button
                                                type="button"
                                                className={`${buttonClass} border border-[rgba(214,223,229,0.98)] bg-white text-[#2f3a46] hover:bg-[rgba(245,248,250,0.96)]`}
                                                onClick={resetPermissionEditor}
                                            >
                                                {t("views.Admin.cancel")}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="mt-4 overflow-hidden rounded-[18px] border border-[rgba(231,237,242,0.96)]">
                                    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_92px_88px] gap-3 bg-[rgba(245,248,250,0.96)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b8792]">
                                        <span>{t("views.Admin.table_user")}</span>
                                        <span>{t("views.Admin.table_permission")}</span>
                                        <span>{t("views.Admin.table_status")}</span>
                                        <span>{t("views.Admin.table_actions")}</span>
                                    </div>
                                    <div className="divide-y divide-[rgba(231,237,242,0.96)] bg-white/98">
                                        {userPermissions.map((item) => (
                                            <article
                                                key={`${item.id}-${item.user_key}-${item.permission_code}`}
                                                className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_92px_88px] gap-3 px-3 py-2.5 text-sm text-[#2f3a46]"
                                            >
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium">
                                                        {item.user_key}
                                                    </div>
                                                    <div className="mt-1 truncate text-xs text-[#8a95a0]">
                                                        {item.remark || "--"}
                                                    </div>
                                                </div>
                                                <div className="min-w-0 truncate text-[#5f6c78]">
                                                    {item.permission_code}
                                                </div>
                                                <div className="flex items-center">
                                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${item.enabled ? "border-[rgba(167,221,203,0.95)] bg-[rgba(235,249,243,0.98)] text-[#206c53]" : "border-[rgba(238,214,214,0.98)] bg-[rgba(252,242,242,0.98)] text-[#a34f4f]"}`}>
                                                        {item.enabled
                                                            ? t("views.Admin.enabled")
                                                            : t("views.Admin.disabled")}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {canManagePermissions && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="rounded-xl p-2 text-[#66717d] transition-colors hover:bg-[rgba(245,248,250,0.96)] hover:text-[#25313c]"
                                                                onClick={() => startEditPermission(item)}
                                                            >
                                                                <PencilSquareIcon className="size-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="rounded-xl p-2 text-[#a34f4f] transition-colors hover:bg-[rgba(252,242,242,0.98)] hover:text-[#8c2f2f]"
                                                                onClick={() => deletePermission(item)}
                                                                disabled={
                                                                    busyKey ===
                                                                    `permission-delete:${item.user_key}:${item.permission_code}`
                                                                }
                                                            >
                                                                <TrashIcon className="size-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        )}

                        {activeSection === "flags" && (
                            <section
                                id="admin-section-flags"
                                className="scroll-mt-28 space-y-4"
                            >
                                <div className="rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-5 py-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]">
                                    <div className="flex flex-col gap-3 border-b border-[rgba(231,237,242,0.95)] pb-4 md:flex-row md:items-end md:justify-between">
                                        <div>
                                            <h2 className="text-lg font-semibold text-[#25313c]">
                                                {t("views.Admin.flags_title")}
                                            </h2>
                                            <p className="mt-1 text-sm text-[#66717d]">
                                                {t("views.Admin.flags_subtitle")}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            className={`${buttonClass} bg-[#25313c] text-white hover:bg-[#1b242d]`}
                                            onClick={startCreateFlag}
                                            disabled={!canManageFlags}
                                        >
                                            <PlusIcon className="mr-2 size-4" />
                                            {t("views.Admin.add_flag")}
                                        </button>
                                    </div>

                                    {!canManageFlags && (
                                        <p className="mt-4 text-sm text-[#8a95a0]">
                                            {t("views.Admin.flags_read_only_hint")}
                                        </p>
                                    )}
                                    {structuredConfigDirty && (
                                        <div className="mt-4 rounded-[18px] border border-[rgba(251,214,163,0.98)] bg-[rgba(255,248,236,0.98)] px-4 py-3 text-sm text-[#8a5a17]">
                                            {t("views.Admin.unsaved_changes_banner")}
                                        </div>
                                    )}

                                    <div className="mt-4 space-y-4">
                                        <div className="rounded-[20px] border border-[rgba(213,223,229,0.98)] bg-[rgba(250,252,253,0.96)] p-4 shadow-sm">
                                            <div className="flex items-center justify-between gap-3 border-b border-[rgba(231,237,242,0.95)] pb-3">
                                                <h3 className="text-base font-semibold text-[#25313c]">
                                                    {t("views.Admin.assistant_defaults_title")}
                                                </h3>
                                            </div>
                                            <p className="mt-3 text-sm leading-6 text-[#55626e]">
                                                {t("views.Admin.assistant_defaults_subtitle")}
                                            </p>
                                            <div className="mt-4 flex flex-wrap gap-2.5">
                                                <button
                                                    type="button"
                                                    className={`${buttonClass} bg-[#279ab3] text-white hover:bg-[#1e7f95]`}
                                                    onClick={() => navigate("/my-gpts")}
                                                >
                                                    {t("views.Admin.assistant_defaults_manage_in_my_gpts")}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Product Flags Card */}
                                        <div className="rounded-[20px] border border-[rgba(213,223,229,0.98)] bg-[rgba(249,250,245,0.96)] p-4 shadow-sm">
                                            <div className="flex items-center justify-between gap-3 border-b border-[rgba(231,237,242,0.95)] pb-3">
                                                <h3 className="text-base font-semibold text-[#25313c]">
                                                    {t("views.Admin.product_flags_title")}
                                                </h3>
                                                {productFlagsDirty && (
                                                    <span className="rounded-full border border-[rgba(251,214,163,0.98)] bg-[rgba(255,248,236,0.98)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a5a17]">
                                                        {t("views.Admin.unsaved_changes_short")}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-2 text-xs text-[#8a95a0]">
                                                {t("views.Admin.product_flags_subtitle")}
                                            </p>
                                            <div className="mt-4 space-y-4">
                                                <div className="flex items-start gap-4 rounded-2xl border border-[rgba(213,223,229,0.98)] bg-white/80 px-4 py-3">
                                                    {canManageFlags && (
                                                        <button
                                                            type="button"
                                                            className={`mt-1 relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                                productFlagsDraft.gpts_feature_enabled
                                                                    ? "bg-[#279ab3]"
                                                                    : "bg-[rgba(223,231,236,0.96)]"
                                                            }`}
                                                            onClick={() => {
                                                                setProductFlagsDraft({
                                                                    gpts_feature_enabled: !productFlagsDraft.gpts_feature_enabled,
                                                                });
                                                            }}
                                                        >
                                                            <span
                                                                aria-hidden="true"
                                                                className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                                    productFlagsDraft.gpts_feature_enabled
                                                                        ? "translate-x-4"
                                                                        : "translate-x-0"
                                                                }`}
                                                            />
                                                        </button>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-[#25313c]">
                                                            {t("views.Admin.product_flags_gpts_label")}
                                                        </p>
                                                        <p className="mt-1 text-xs text-[#8a95a0]">
                                                            {t("views.Admin.product_flags_gpts_hint")}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2.5">
                                                    <button
                                                        type="button"
                                                        className={`${buttonClass} bg-[#279ab3] text-white hover:bg-[#1e7f95] disabled:bg-[#a3ccd4] disabled:cursor-not-allowed`}
                                                        onClick={saveProductFlags}
                                                        disabled={!canManageFlags || busyKey === "product-flags-save" || !productFlagsDirty}
                                                    >
                                                        {busyKey === "product-flags-save" ? t("views.Admin.saving") : t("views.Admin.save")}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${buttonClass} border border-[rgba(214,223,229,0.98)] bg-white text-[#2f3a46] hover:bg-[rgba(245,248,250,0.96)] disabled:opacity-30 disabled:cursor-not-allowed`}
                                                        onClick={() => setProductFlagsDraft(savedProductFlagsDraft)}
                                                        disabled={!canManageFlags || !productFlagsDirty}
                                                    >
                                                        {t("views.Admin.reset")}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Generic Flags list starts here */}
                                    {editingFlagKey && (
                                        <div className="mt-4 rounded-[20px] border border-[rgba(213,223,229,0.98)] bg-[rgba(246,249,251,0.96)] p-4 shadow-inner">
                                            <div className="flex items-center justify-between gap-3 border-b border-[rgba(231,237,242,0.95)] pb-3">
                                                <h3 className="text-base font-semibold text-[#25313c]">
                                                    {editingFlagKey === NEW_FLAG_KEY
                                                        ? t("views.Admin.create_flag_title")
                                                        : t("views.Admin.edit_flag_title")}
                                                </h3>
                                                <button
                                                    type="button"
                                                    className="text-sm font-medium text-[#7b8792] hover:text-[#25313c]"
                                                    onClick={resetFlagEditor}
                                                >
                                                    {t("views.Admin.cancel")}
                                                </button>
                                            </div>
                                            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                                                <label className="grid gap-2">
                                                    <span className={formLabelClass}>
                                                        {t("views.Admin.form_config_key")}
                                                    </span>
                                                    <input
                                                        className={inputClass}
                                                        value={flagDraft.config_key}
                                                        onChange={(event) =>
                                                            setFlagDraft((state) => ({
                                                                ...state,
                                                                config_key: event.target.value,
                                                            }))
                                                        }
                                                        disabled={editingFlagKey !== NEW_FLAG_KEY}
                                                    />
                                                </label>
                                                <label className="grid gap-2">
                                                    <span className={formLabelClass}>
                                                        {t("views.Admin.form_value_type")}
                                                    </span>
                                                    <select
                                                        className={inputClass}
                                                        value={flagDraft.value_type}
                                                        onChange={(event) =>
                                                            setFlagDraft((state) => ({
                                                                ...state,
                                                                value_type: event.target.value,
                                                            }))
                                                        }
                                                    >
                                                        <option value="string">string</option>
                                                        <option value="number">number</option>
                                                        <option value="boolean">boolean</option>
                                                        <option value="json">json</option>
                                                    </select>
                                                </label>
                                                <label className="grid gap-2 xl:col-span-2">
                                                    <span className={formLabelClass}>
                                                        {t("views.Admin.form_description")}
                                                    </span>
                                                    <input
                                                        className={inputClass}
                                                        value={flagDraft.description}
                                                        onChange={(event) =>
                                                            setFlagDraft((state) => ({
                                                                ...state,
                                                                description: event.target.value,
                                                            }))
                                                        }
                                                    />
                                                </label>
                                                <label className="grid gap-2 xl:col-span-2">
                                                    <span className={formLabelClass}>
                                                        {t("views.Admin.form_config_value")}
                                                    </span>
                                                    <textarea
                                                        className={textareaClass}
                                                        value={flagDraft.config_value_input}
                                                        onChange={(event) =>
                                                            setFlagDraft((state) => ({
                                                                ...state,
                                                                config_value_input: event.target.value,
                                                            }))
                                                        }
                                                    />
                                                </label>
                                            </div>
                                            <div className="mt-5 flex flex-wrap gap-2.5">
                                                <button
                                                    type="button"
                                                    className={`${buttonClass} bg-[#279ab3] text-white hover:bg-[#1e7f95] disabled:bg-[#a3ccd4] disabled:cursor-not-allowed`}
                                                    onClick={saveFlag}
                                                    disabled={busyKey === "flag-save" || !flagEditorDirty}
                                                >
                                                    {busyKey === "flag-save" ? t("views.Admin.saving") : t("views.Admin.save")}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`${buttonClass} border border-[rgba(214,223,229,0.98)] bg-white text-[#2f3a46] hover:bg-[rgba(245,248,250,0.96)] disabled:opacity-30 disabled:cursor-not-allowed`}
                                                    onClick={() => setFlagDraft(savedFlagDraft)}
                                                    disabled={busyKey === "flag-save" || !flagEditorDirty}
                                                >
                                                    {t("views.Admin.reset")}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Search Bar */}
                                    <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[rgba(231,237,242,0.95)] pt-6">
                                        <h3 className="text-base font-semibold text-[#25313c]">
                                            {t("views.Admin.generic_flags_title")}
                                        </h3>
                                        <div className="relative w-full max-w-xs">
                                            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8a95a0]" />
                                            <input
                                                type="text"
                                                className={`${inputClass} h-10 pl-10`}
                                                placeholder={t("views.Admin.flag_search_placeholder")}
                                                value={flagSearchQuery}
                                                onChange={(e) => setFlagSearchQuery(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {genericFeatureFlags.length === 0 && flagSearchQuery && (
                                        <div className="mt-8 flex flex-col items-center justify-center py-12 text-center">
                                            <div className="rounded-full bg-[rgba(245,248,250,0.96)] p-5 text-[#8a95a0]">
                                                <MagnifyingGlassIcon className="size-10 stroke-1" />
                                            </div>
                                            <p className="mt-4 font-medium text-[#25313c]">
                                                {t("views.Admin.no_flags_found")}
                                            </p>
                                            <button
                                                className="mt-2 text-sm text-[#279ab3] transition-colors hover:text-[#1e7f95]"
                                                onClick={() => setFlagSearchQuery("")}
                                            >
                                                {t("views.Admin.clear_search")}
                                            </button>
                                        </div>
                                    )}

                                    <div className="mt-6 grid gap-4 xl:grid-cols-2">
                                        {genericFeatureFlags.map((flag) => (
                                            <article
                                                key={flag.config_key}
                                                className="group relative flex flex-col overflow-hidden rounded-[22px] border border-[rgba(228,234,239,0.98)] bg-white/95 p-4 shadow-sm transition-all hover:border-[rgba(213,223,229,0.98)] hover:shadow-md"
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="truncate text-[14px] font-bold tracking-tight text-[#25313c]">
                                                                {flag.config_key}
                                                            </h3>
                                                            <button
                                                                type="button"
                                                                className="rounded-lg p-1 text-[#8a95a0] opacity-0 transition-all hover:bg-[rgba(245,248,250,0.96)] hover:text-[#25313c] group-hover:opacity-100"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(flag.config_key);
                                                                    sendUserAlert(t("views.Admin.copy_success"));
                                                                }}
                                                                title={t("views.Admin.copy_key")}
                                                            >
                                                                <DocumentDuplicateIcon className="size-3.5" />
                                                            </button>
                                                        </div>
                                                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#66717d]">
                                                            {flag.description || "--"}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {flag.value_type === "boolean" && canManageFlags && (
                                                            <button
                                                                type="button"
                                                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                                    flag.config_value === true
                                                                        ? "bg-[#279ab3]"
                                                                        : "bg-[rgba(223,231,236,0.96)]"
                                                                }`}
                                                                onClick={() => toggleFlag(flag)}
                                                                disabled={busyKey === `flag-toggle:${flag.config_key}`}
                                                            >
                                                                <span
                                                                    aria-hidden="true"
                                                                    className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                                        flag.config_value === true
                                                                            ? "translate-x-4"
                                                                            : "translate-x-0"
                                                                    }`}
                                                                />
                                                            </button>
                                                        )}
                                                        <span className="rounded-full border border-[rgba(213,222,228,0.98)] bg-[rgba(249,251,252,0.98)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#7b8792]">
                                                            {flag.value_type || "string"}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-4 flex-1">
                                                    <pre className="max-h-[140px] overflow-y-auto rounded-xl bg-[#25313c] px-3 py-2.5 text-[11px] leading-5 text-[#e6edf3] scrollbar-thin scrollbar-thumb-[rgba(255,255,255,0.1)]">
                                                        {formatFlagValue(flag.config_value)}
                                                    </pre>
                                                </div>

                                                <div className="mt-4 flex items-center justify-between border-t border-[rgba(231,237,242,0.6)] pt-3">
                                                    <div className="flex items-center gap-1 text-[10px] font-medium text-[#8a95a0]">
                                                        <span className="max-w-[100px] truncate">{flag.updated_by || "--"}</span>
                                                        <span>·</span>
                                                        <span>{formatDateTime(flag.updated_at)}</span>
                                                    </div>
                                                    {canManageFlags && (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                className="rounded-xl p-2 text-[#66717d] transition-colors hover:bg-[rgba(245,248,250,0.96)] hover:text-[#25313c]"
                                                                onClick={() => startEditFlag(flag)}
                                                            >
                                                                <PencilSquareIcon className="size-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="rounded-xl p-2 text-[#a34f4f] transition-colors hover:bg-[rgba(252,242,242,0.98)] hover:text-[#8c2f2f]"
                                                                onClick={() => deleteFlag(flag.config_key)}
                                                                disabled={busyKey === `flag-delete:${flag.config_key}`}
                                                            >
                                                                <TrashIcon className="size-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        )}

                        {activeSection === "audit" && (
                        <section
                            id="admin-section-audit"
                            className="scroll-mt-28 rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-5 py-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]"
                        >
                            <div className="flex flex-col gap-2 border-b border-[rgba(231,237,242,0.95)] pb-4">
                                <h2 className="text-lg font-semibold text-[#25313c]">
                                    {t("views.Admin.audit_title")}
                                </h2>
                                <p className="text-sm text-[#66717d]">
                                    {t("views.Admin.audit_subtitle")}
                                </p>
                            </div>
                            <div className="mt-4 overflow-hidden rounded-[18px] border border-[rgba(231,237,242,0.96)]">
                                <div className="grid grid-cols-[108px_minmax(0,1fr)_150px_170px] gap-3 bg-[rgba(245,248,250,0.96)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b8792]">
                                    <span>{t("views.Admin.audit_action")}</span>
                                    <span>{t("views.Admin.audit_resource")}</span>
                                    <span>{t("views.Admin.audit_actor")}</span>
                                    <span>{t("views.Admin.audit_time")}</span>
                                </div>
                                <div className="divide-y divide-[rgba(231,237,242,0.96)] bg-white/98">
                                    {auditLogs.map((item) => (
                                        <article
                                            key={`${item.id}-${item.created_at}`}
                                            className="grid grid-cols-[108px_minmax(0,1fr)_150px_170px] gap-3 px-3 py-2.5 text-sm text-[#2f3a46]"
                                        >
                                            <div>
                                                <span className="inline-flex rounded-full border border-[rgba(213,222,228,0.98)] bg-[rgba(245,248,250,0.96)] px-2.5 py-1 text-xs font-medium uppercase text-[#55626e]">
                                                    {item.action}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate font-medium">
                                                    {item.resource_type}
                                                </div>
                                                <div className="mt-1 truncate text-xs text-[#8a95a0]">
                                                    {item.resource_key}
                                                </div>
                                            </div>
                                            <div className="min-w-0 truncate text-[#5f6c78]">
                                                {item.actor_email || item.actor_key || "--"}
                                            </div>
                                            <div className="text-[#5f6c78]">
                                                {formatDateTime(item.created_at)}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </div>
                        </section>
                        )}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
};

export default AdminConfig;
