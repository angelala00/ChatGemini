(function () {
  window.AssistAiPrototypeWorkspaces = window.AssistAiPrototypeWorkspaces || {};
  window.AssistAiPrototypeWorkspaces.admin = {
    createRendererSet(deps) {
      const { workspaceView, escapeHtml, showFeedback } = deps;

      let activeSection = "models"; // models, gpts, permissions, flags, audit

      // Mock Datasets
      let models = [
        { model_id: "glm-5.0", display_name: "GLM-5.0", sort_order: 1, enabled: true, supports_reasoning: true, supports_tool_calling: true, allowed_upload_types: ".pdf, .doc, .xls, .md, .ppt, .pptx", visibility_scope: "all", visibility_users: "" },
        { model_id: "deepseek-chat", display_name: "DeepSeek-V3", sort_order: 2, enabled: true, supports_reasoning: false, supports_tool_calling: true, allowed_upload_types: ".pdf, .txt, .md", visibility_scope: "all", visibility_users: "" },
        { model_id: "gemini-1.5-pro", display_name: "Gemini 1.5 Pro", sort_order: 3, enabled: true, supports_reasoning: false, supports_tool_calling: true, allowed_upload_types: "*", visibility_scope: "all", visibility_users: "" },
        { model_id: "qwen-2.5-coder-72b", display_name: "Qwen 2.5 Coder 72B", sort_order: 4, enabled: true, supports_reasoning: false, supports_tool_calling: true, allowed_upload_types: ".txt, .md, .java, .py, .go", visibility_scope: "all", visibility_users: "" },
        { model_id: "o1-mini", display_name: "O1 Mini", sort_order: 5, enabled: false, supports_reasoning: true, supports_tool_calling: false, allowed_upload_types: "none", visibility_scope: "restricted", visibility_users: "admin@company.com" }
      ];

      let gptsConfig = {
        feature_enabled: true,
        visible_scope: "all", // all, restricted
        whitelist_users: "admin@company.com, developer@company.com, manager@company.com"
      };

      let permissions = [
        { user_key: "admin@company.com", permission_code: "admin.access", enabled: true, remark: "系统默认超级管理员" },
        { user_key: "admin@company.com", permission_code: "gpts.manage", enabled: true, remark: "系统默认超级管理员" },
        { user_key: "zhangsan", permission_code: "admin.access", enabled: true, remark: "演示测试管理员账号" },
        { user_key: "zhangsan", permission_code: "gpts.manage", enabled: true, remark: "演示测试管理员账号" },
        { user_key: "lisi", permission_code: "gpts.manage", enabled: true, remark: "普通运营管理" },
        { user_key: "wangwu", permission_code: "voice_lab.access", enabled: true, remark: "语音测试权限" }
      ];

      let flags = [
        { config_key: "default_model", config_value: "glm-5.0", value_type: "string", description: "新建会话默认选中的模型 ID" },
        { config_key: "default_visible_models", config_value: "glm-5.0, deepseek-chat, gemini-1.5-pro", value_type: "string", description: "在会话输入框下方展示的可用模型快捷列表" },
        { config_key: "default_reasoning_enabled", config_value: "false", value_type: "boolean", description: "默认是否开启流式深度推理选项" },
        { config_key: "gpts_feature_enabled", config_value: "true", value_type: "boolean", description: "是否向用户展示智能体广场和对应入口" },
        { config_key: "gpts_visible_scope", config_value: "all", value_type: "string", description: "智能体列表可见策略范围值 (all/restricted)" }
      ];

      let auditLogs = [
        { timestamp: "2026-06-19 12:14:15", actor_email: "admin@company.com", action: "UPDATE", resource_type: "model_config", resource_key: "glm-5.0" },
        { timestamp: "2026-06-19 11:02:04", actor_email: "admin@company.com", action: "UPDATE", resource_type: "feature_flag", resource_key: "default_reasoning_enabled" },
        { timestamp: "2026-06-18 16:45:33", actor_email: "admin@company.com", action: "CREATE", resource_type: "permission", resource_key: "lisi:gpts.manage" },
        { timestamp: "2026-06-18 10:12:00", actor_email: "admin@company.com", action: "CREATE", resource_type: "model_config", resource_key: "o1-mini" },
        { timestamp: "2026-06-17 15:30:19", actor_email: "admin@company.com", action: "UPDATE", resource_type: "feature_flag", resource_key: "gpts_feature_enabled" }
      ];

      // Form Editors State
      let editingModelIndex = -1; // -1: none, -2: new, >=0: existing index
      let modelForm = { model_id: "", display_name: "", sort_order: "1000", enabled: true, supports_reasoning: false, supports_tool_calling: false, allowed_upload_types: "", visibility_scope: "all", visibility_users: "" };

      let editingPermissionIndex = -1; // -1: none, -2: new, >=0: existing index
      let permissionForm = { user_key: "", permission_code: "", enabled: true, remark: "" };

      let editingFlagIndex = -1; // -1: none, >=0: existing index
      let flagValueInput = "";

      function renderAdminWorkspace() {
        if (!workspaceView) return;

        workspaceView.innerHTML = `
          <div class="workspace-shell w-[min(100%,1180px)] mx-auto p-[36px_26px_72px] max-[900px]:p-[24px_14px_56px] text-[#2f3a46]">
            <!-- Header -->
            <header class="mb-6">
              <div class="flex items-center gap-2">
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[#7f8b96]">
                  管理工作区
                </p>
              </div>
              <div class="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h1 class="text-[28px] font-semibold tracking-[-0.02em] text-[#25313c]">
                    管理员配置
                  </h1>
                  <p class="mt-2 max-w-[760px] text-sm leading-6 text-[#66717d]">
                    集中查看和维护模型能力、权限分配和功能开关。当前版本先覆盖最核心的三类配置，方便上线前把业务配置逐步收口。
                  </p>
                </div>
              </div>
              <div class="mt-4 flex flex-wrap gap-2.5">
                <span class="inline-flex items-center rounded-full border border-[rgba(203,221,229,0.98)] bg-[rgba(241,247,249,0.96)] px-3 py-1 text-xs font-medium text-[#51606c]">
                  共 5 个核心模块
                </span>
                <span class="inline-flex items-center rounded-full border border-[rgba(203,221,229,0.98)] bg-[rgba(241,247,249,0.96)] px-3 py-1 text-xs font-medium text-[#51606c]">
                  启用模型: ${models.filter(m => m.enabled).length}/${models.length}
                </span>
                <span class="inline-flex items-center rounded-full border border-[rgba(203,221,229,0.98)] bg-[rgba(241,247,249,0.96)] px-3 py-1 text-xs font-medium text-[#51606c]">
                  启用的权限规则: ${permissions.filter(p => p.enabled).length}/${permissions.length}
                </span>
              </div>
            </header>

            <!-- Cards Summary Row -->
            <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
              <article class="rounded-[20px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-4 py-4 shadow-[0_14px_30px_rgba(23,28,38,0.045)] flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-[#75818d]">模型配置项</span>
                  <div class="mt-2.5 text-[24px] font-semibold tracking-[-0.03em] text-[#25313c]">${models.length}</div>
                </div>
                <div class="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                  </svg>
                </div>
              </article>
              <article class="rounded-[20px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-4 py-4 shadow-[0_14px_30px_rgba(23,28,38,0.045)] flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-[#75818d]">智能体广场状态</span>
                  <div class="mt-2.5 text-[24px] font-semibold tracking-[-0.03em] text-[#25313c]">${gptsConfig.feature_enabled ? "已开启" : "已关闭"}</div>
                </div>
                <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                  </svg>
                </div>
              </article>
              <article class="rounded-[20px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-4 py-4 shadow-[0_14px_30px_rgba(23,28,38,0.045)] flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-[#75818d]">规则与授权</span>
                  <div class="mt-2.5 text-[24px] font-semibold tracking-[-0.03em] text-[#25313c]">${permissions.length} 条</div>
                </div>
                <div class="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  </svg>
                </div>
              </article>
              <article class="rounded-[20px] border border-[rgba(223,231,236,0.96)] bg-white/95 px-4 py-4 shadow-[0_14px_30px_rgba(23,28,38,0.045)] flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-[#75818d]">系统功能参数数</span>
                  <div class="mt-2.5 text-[24px] font-semibold tracking-[-0.03em] text-[#25313c]">${flags.length} 项</div>
                </div>
                <div class="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  </svg>
                </div>
              </article>
            </section>

            <!-- Main Split Layout -->
            <div class="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)] xl:items-start">
              <!-- Left Sidebar Navigation -->
              <aside class="xl:sticky xl:top-5">
                <div class="rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/96 px-4 py-4 shadow-[0_14px_30px_rgba(23,28,38,0.045)]">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b8792]">
                    模块导航
                  </p>
                  <p class="mt-1 text-xs leading-5 text-[#66717d]">
                    快速跳转到模型、权限、功能开关和审计模块。
                  </p>
                  <div class="mt-4 grid gap-2" id="adminSidebarNav">
                    <button type="button" data-sec="models" class="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${activeSection === "models" ? "border-[rgba(99,170,188,0.98)] bg-[rgba(231,244,247,0.98)] text-[#1f6272]" : "border-[rgba(214,223,229,0.98)] bg-[rgba(249,251,252,0.98)] text-[#4f5d69] hover:bg-[rgba(244,248,250,0.98)]"}">
                      <span class="flex min-w-0 items-center gap-2">
                        <span class="block truncate text-sm font-semibold">模型配置</span>
                      </span>
                      <span class="shrink-0 rounded-full bg-[rgba(37,49,60,0.08)] px-2 py-0.5 text-[11px] font-semibold text-inherit">${models.length}</span>
                    </button>
                    <button type="button" data-sec="gpts" class="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${activeSection === "gpts" ? "border-[rgba(99,170,188,0.98)] bg-[rgba(231,244,247,0.98)] text-[#1f6272]" : "border-[rgba(214,223,229,0.98)] bg-[rgba(249,251,252,0.98)] text-[#4f5d69] hover:bg-[rgba(244,248,250,0.98)]"}">
                      <span class="flex min-w-0 items-center gap-2">
                        <span class="block truncate text-sm font-semibold">智能体配置</span>
                      </span>
                      <span class="shrink-0 rounded-full bg-[rgba(37,49,60,0.08)] px-2 py-0.5 text-[11px] font-semibold text-inherit">1</span>
                    </button>
                    <button type="button" data-sec="permissions" class="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${activeSection === "permissions" ? "border-[rgba(99,170,188,0.98)] bg-[rgba(231,244,247,0.98)] text-[#1f6272]" : "border-[rgba(214,223,229,0.98)] bg-[rgba(249,251,252,0.98)] text-[#4f5d69] hover:bg-[rgba(244,248,250,0.98)]"}">
                      <span class="flex min-w-0 items-center gap-2">
                        <span class="block truncate text-sm font-semibold">权限配置</span>
                      </span>
                      <span class="shrink-0 rounded-full bg-[rgba(37,49,60,0.08)] px-2 py-0.5 text-[11px] font-semibold text-inherit">${permissions.length}</span>
                    </button>
                    <button type="button" data-sec="flags" class="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${activeSection === "flags" ? "border-[rgba(99,170,188,0.98)] bg-[rgba(231,244,247,0.98)] text-[#1f6272]" : "border-[rgba(214,223,229,0.98)] bg-[rgba(249,251,252,0.98)] text-[#4f5d69] hover:bg-[rgba(244,248,250,0.98)]"}">
                      <span class="flex min-w-0 items-center gap-2">
                        <span class="block truncate text-sm font-semibold">功能开关</span>
                      </span>
                      <span class="shrink-0 rounded-full bg-[rgba(37,49,60,0.08)] px-2 py-0.5 text-[11px] font-semibold text-inherit">${flags.length}</span>
                    </button>
                    <button type="button" data-sec="audit" class="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${activeSection === "audit" ? "border-[rgba(99,170,188,0.98)] bg-[rgba(231,244,247,0.98)] text-[#1f6272]" : "border-[rgba(214,223,229,0.98)] bg-[rgba(249,251,252,0.98)] text-[#4f5d69] hover:bg-[rgba(244,248,250,0.98)]"}">
                      <span class="flex min-w-0 items-center gap-2">
                        <span class="block truncate text-sm font-semibold">审计日志</span>
                      </span>
                      <span class="shrink-0 rounded-full bg-[rgba(37,49,60,0.08)] px-2 py-0.5 text-[11px] font-semibold text-inherit">${auditLogs.length}</span>
                    </button>
                  </div>
                </div>
              </aside>

              <!-- Active Section Content Area -->
              <div class="grid gap-4 min-w-0">
                ${activeSection === "models" ? renderModelsSection() : ""}
                ${activeSection === "gpts" ? renderGptsSection() : ""}
                ${activeSection === "permissions" ? renderPermissionsSection() : ""}
                ${activeSection === "flags" ? renderFlagsSection() : ""}
                ${activeSection === "audit" ? renderAuditSection() : ""}
              </div>
            </div>
          </div>
        `;

        bindSectionEvents();
      }

      // ==========================================
      // SECTION 1: Models
      // ==========================================
      function renderModelsSection() {
        return `
          <section class="rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 p-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]">
            <div class="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h2 class="text-base font-semibold text-[#25313c]">模型配置</h2>
                <p class="mt-1 text-xs text-[#66717d]">查看模型能力、上传策略和可见范围，配置完成后将生效至聊天对话区。</p>
              </div>
              <button id="addModelBtn" type="button" class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25313c] px-3.5 text-xs font-semibold text-white transition-all hover:bg-[#1b242d] hover:-translate-y-0.5 active:translate-y-0">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>
                新增模型
              </button>
            </div>

            <!-- Model Editor Inline Form -->
            ${editingModelIndex !== -1 ? `
              <div class="mb-5 rounded-[18px] border border-slate-200 bg-slate-50/70 p-4 animate-fade-in">
                <div class="flex items-center justify-between mb-4 border-b border-slate-200/50 pb-2">
                  <h3 class="text-sm font-semibold text-slate-800">${editingModelIndex === -2 ? "新增模型配置" : "编辑模型配置"}</h3>
                  <button id="cancelModelEdit" type="button" class="text-xs text-slate-500 hover:text-slate-800 transition-colors">取消</button>
                </div>
                <div class="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3">
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">模型 ID (唯一标识)</label>
                    <input id="formModelId" type="text" class="w-full h-8.5 px-3 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500" value="${escapeHtml(modelForm.model_id)}" ${editingModelIndex >= 0 ? "readonly disabled class='bg-slate-100 text-slate-400'" : ""}>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">显示名称 (中文名)</label>
                    <input id="formDisplayName" type="text" class="w-full h-8.5 px-3 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500" value="${escapeHtml(modelForm.display_name)}">
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">排序权重 (越小越靠前)</label>
                    <input id="formSortOrder" type="number" class="w-full h-8.5 px-3 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500" value="${modelForm.sort_order}">
                  </div>
                </div>
                <div class="grid gap-3.5 sm:grid-cols-3 mt-3">
                  <label class="flex items-center gap-2 select-none">
                    <input id="formEnabled" type="checkbox" class="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-350" ${modelForm.enabled ? "checked" : ""}>
                    <span class="text-xs font-semibold text-slate-700">是否启用模型</span>
                  </label>
                  <label class="flex items-center gap-2 select-none">
                    <input id="formReasoning" type="checkbox" class="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-350" ${modelForm.supports_reasoning ? "checked" : ""}>
                    <span class="text-xs font-semibold text-slate-700">支持流式推理</span>
                  </label>
                  <label class="flex items-center gap-2 select-none">
                    <input id="formToolCalling" type="checkbox" class="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-350" ${modelForm.supports_tool_calling ? "checked" : ""}>
                    <span class="text-xs font-semibold text-slate-700">支持原生工具调用</span>
                  </label>
                </div>
                <div class="grid gap-3.5 sm:grid-cols-2 mt-4">
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">允许上传的格式 (如 .pdf,.doc 或 * 代表全部)</label>
                    <input id="formAllowedUploads" type="text" class="w-full h-8.5 px-3 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500" value="${escapeHtml(modelForm.allowed_upload_types)}">
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">可见策略 (all / restricted)</label>
                    <select id="formVisibilityScope" class="w-full h-8.5 px-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500">
                      <option value="all" ${modelForm.visibility_scope === "all" ? "selected" : ""}>所有登录用户可见</option>
                      <option value="restricted" ${modelForm.visibility_scope === "restricted" ? "selected" : ""}>仅限指定名单可见</option>
                    </select>
                  </div>
                </div>
                <div class="mt-3">
                  <label class="block text-xs font-semibold text-slate-600 mb-1">限制可见的用户列表 (scope 为 restricted 时生效，逗号分隔)</label>
                  <input id="formVisibilityUsers" type="text" class="w-full h-8.5 px-3 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500" value="${escapeHtml(modelForm.visibility_users)}" placeholder="例如 user1@company.com, user2@company.com">
                </div>
                <div class="mt-4 flex justify-end gap-2">
                  <button id="saveModelBtn" type="button" class="inline-flex h-8 items-center rounded-lg bg-cyan-600 px-4 text-xs font-semibold text-white transition-all hover:bg-cyan-700">保存</button>
                </div>
              </div>
            ` : ""}

            <!-- Table of Models -->
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-xs leading-5">
                <thead>
                  <tr class="border-b border-slate-100 text-slate-400 font-medium">
                    <th class="py-3 px-2 font-medium">显示名称/ID</th>
                    <th class="py-3 px-2 font-medium">能力支持</th>
                    <th class="py-3 px-2 font-medium">排序</th>
                    <th class="py-3 px-2 font-medium">状态</th>
                    <th class="py-3 px-2 font-medium">可见范围</th>
                    <th class="py-3 px-2 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-700">
                  ${models.map((item, idx) => `
                    <tr class="hover:bg-slate-50/50">
                      <td class="py-3 px-2">
                        <span class="block font-semibold text-slate-900">${escapeHtml(item.display_name)}</span>
                        <span class="block text-[10px] text-slate-400 mt-0.5 font-mono">${escapeHtml(item.model_id)}</span>
                      </td>
                      <td class="py-3 px-2">
                        <div class="flex flex-wrap gap-1">
                          <span class="rounded px-1.5 py-0.5 text-[9px] font-semibold border ${item.supports_reasoning ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}">推理</span>
                          <span class="rounded px-1.5 py-0.5 text-[9px] font-semibold border ${item.supports_tool_calling ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-slate-100 text-slate-500"}">工具</span>
                        </div>
                      </td>
                      <td class="py-3 px-2 font-mono">${item.sort_order}</td>
                      <td class="py-3 px-2">
                        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${item.enabled ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"}">
                          ${item.enabled ? "启用" : "禁用"}
                        </span>
                      </td>
                      <td class="py-3 px-2 text-slate-500">
                        ${item.visibility_scope === "all" ? "全员" : `限制 (${item.visibility_users.split(",").length}人)`}
                      </td>
                      <td class="py-3 px-2 text-right">
                        <button type="button" data-idx="${idx}" class="edit-model-btn text-cyan-600 font-semibold hover:text-cyan-800 mr-2.5">编辑</button>
                        <button type="button" data-idx="${idx}" class="del-model-btn text-red-500 font-semibold hover:text-red-700">删除</button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </section>
        `;
      }

      // ==========================================
      // SECTION 2: GPTs / Agents Configuration
      // ==========================================
      function renderGptsSection() {
        return `
          <section class="rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 p-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]">
            <div class="border-b border-slate-100 pb-4 mb-4">
              <h2 class="text-base font-semibold text-[#25313c]">智能体全局配置</h2>
              <p class="mt-1 text-xs text-[#66717d]">集中管理企业智能体模块的总开关、可见范围与白名单用户权限。</p>
            </div>

            <form id="gptsConfigForm" class="grid gap-5">
              <!-- Switch Row -->
              <div class="flex items-start justify-between rounded-xl bg-slate-50/80 px-4 py-3.5 border border-slate-100">
                <div class="flex flex-col gap-1 pr-6">
                  <h3 class="text-sm font-semibold text-slate-800">智能体广场功能总开关</h3>
                  <p class="text-xs text-slate-500">关闭后，普通用户左侧栏的“智能体广场”入口将被隐藏，且无法访问任何智能体界面。</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer select-none">
                  <input id="gptsSwitch" type="checkbox" class="sr-only peer" ${gptsConfig.feature_enabled ? "checked" : ""}>
                  <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                </label>
              </div>

              <!-- Scope Section -->
              <div class="rounded-xl border border-slate-150 p-4 bg-white shadow-sm">
                <h3 class="text-sm font-semibold text-slate-800 mb-3">智能体生效策略范围</h3>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${gptsConfig.visible_scope === "all" ? "border-cyan-600 bg-cyan-50/30" : "border-slate-200 hover:bg-slate-50"}">
                    <input type="radio" name="visible_scope" value="all" class="mt-0.5 text-cyan-600 focus:ring-cyan-500" ${gptsConfig.visible_scope === "all" ? "checked" : ""}>
                    <div>
                      <span class="block text-xs font-semibold text-slate-800">所有人可见</span>
                      <span class="block text-[11px] text-slate-500 mt-1">企业全员登录后均可看到“智能体广场”菜单入口。</span>
                    </div>
                  </label>
                  <label class="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${gptsConfig.visible_scope === "restricted" ? "border-cyan-600 bg-cyan-50/30" : "border-slate-200 hover:bg-slate-50"}">
                    <input type="radio" name="visible_scope" value="restricted" class="mt-0.5 text-cyan-600 focus:ring-cyan-500" ${gptsConfig.visible_scope === "restricted" ? "checked" : ""}>
                    <div>
                      <span class="block text-xs font-semibold text-slate-800">仅指定白名单用户可见</span>
                      <span class="block text-[11px] text-slate-500 mt-1">只向下方指定的白名单用户开放“智能体广场”入口与权限。</span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Whitelist textarea -->
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5">白名单用户账户列表 (支持邮箱或 Sub 唯一标识，英文逗号或换行分隔)</label>
                <textarea id="gptsWhitelist" class="w-full min-h-24 resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 text-slate-800" placeholder="例如 user1@company.com, user2@company.com">${escapeHtml(gptsConfig.whitelist_users)}</textarea>
                <p class="text-[11px] text-slate-400 mt-1">兼容模式说明：GPTS_WHITE_LIST 用户已获授权，保存后此处的白名单配置具有高优先级。</p>
              </div>

              <div class="flex justify-end pt-2">
                <button id="saveGptsBtn" type="button" class="inline-flex h-9 items-center rounded-xl bg-[#25313c] px-5 text-xs font-semibold text-white transition-all hover:bg-[#1b242d] hover:-translate-y-0.5 active:translate-y-0">
                  保存设置
                </button>
              </div>
            </form>
          </section>
        `;
      }

      // ==========================================
      // SECTION 3: Permissions
      // ==========================================
      function renderPermissionsSection() {
        return `
          <section class="rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 p-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]">
            <div class="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h2 class="text-base font-semibold text-[#25313c]">权限与规则配置</h2>
                <p class="mt-1 text-xs text-[#66717d]">通过声明式规则授予指定账号特殊的管理或实验室访问权限。</p>
              </div>
              <button id="addPermBtn" type="button" class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25313c] px-3.5 text-xs font-semibold text-white transition-all hover:bg-[#1b242d] hover:-translate-y-0.5 active:translate-y-0">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>
                新增授权
              </button>
            </div>

            <!-- Permission Editor Form -->
            ${editingPermissionIndex !== -1 ? `
              <div class="mb-5 rounded-[18px] border border-slate-200 bg-slate-50/70 p-4 animate-fade-in">
                <div class="flex items-center justify-between mb-4 border-b border-slate-200/50 pb-2">
                  <h3 class="text-sm font-semibold text-slate-800">${editingPermissionIndex === -2 ? "新增授权配置" : "编辑授权配置"}</h3>
                  <button id="cancelPermEdit" type="button" class="text-xs text-slate-500 hover:text-slate-800 transition-colors">取消</button>
                </div>
                <div class="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3">
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">用户标识 (邮箱/账户名)</label>
                    <input id="formUserKey" type="text" class="w-full h-8.5 px-3 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500" value="${escapeHtml(permissionForm.user_key)}" ${editingPermissionIndex >= 0 ? "readonly disabled class='bg-slate-100 text-slate-400'" : ""}>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">权限代码 (Permission Code)</label>
                    <select id="formPermCode" class="w-full h-8.5 px-2 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500">
                      <option value="admin.access" ${permissionForm.permission_code === "admin.access" ? "selected" : ""}>admin.access (管理员入口)</option>
                      <option value="gpts.manage" ${permissionForm.permission_code === "gpts.manage" ? "selected" : ""}>gpts.manage (智能体管理)</option>
                      <option value="voice_lab.access" ${permissionForm.permission_code === "voice_lab.access" ? "selected" : ""}>voice_lab.access (语音测试室)</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">备注说明</label>
                    <input id="formRemark" type="text" class="w-full h-8.5 px-3 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500" value="${escapeHtml(permissionForm.remark)}">
                  </div>
                </div>
                <div class="mt-3 flex items-center gap-2 select-none">
                  <input id="formPermEnabled" type="checkbox" class="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-350" ${permissionForm.enabled ? "checked" : ""}>
                  <span class="text-xs font-semibold text-slate-700">是否立即启用此权限规则</span>
                </div>
                <div class="mt-4 flex justify-end gap-2">
                  <button id="savePermBtn" type="button" class="inline-flex h-8 items-center rounded-lg bg-cyan-600 px-4 text-xs font-semibold text-white transition-all hover:bg-cyan-700">保存</button>
                </div>
              </div>
            ` : ""}

            <!-- Table of Permissions -->
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-xs leading-5">
                <thead>
                  <tr class="border-b border-slate-100 text-slate-400 font-medium">
                    <th class="py-3 px-2 font-medium">用户账号</th>
                    <th class="py-3 px-2 font-medium">授权代码</th>
                    <th class="py-3 px-2 font-medium">备注</th>
                    <th class="py-3 px-2 font-medium">状态</th>
                    <th class="py-3 px-2 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-700">
                  ${permissions.map((item, idx) => `
                    <tr class="hover:bg-slate-50/50">
                      <td class="py-3 px-2 font-semibold text-slate-900">${escapeHtml(item.user_key)}</td>
                      <td class="py-3 px-2 font-mono text-cyan-700 bg-cyan-50/30 rounded px-1.5 py-0.5 inline-block mt-2">${escapeHtml(item.permission_code)}</td>
                      <td class="py-3 px-2 text-slate-500">${escapeHtml(item.remark || "--")}</td>
                      <td class="py-3 px-2">
                        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${item.enabled ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"}">
                          ${item.enabled ? "开启" : "关闭"}
                        </span>
                      </td>
                      <td class="py-3 px-2 text-right">
                        <button type="button" data-idx="${idx}" class="edit-perm-btn text-cyan-600 font-semibold hover:text-cyan-800 mr-2.5">编辑</button>
                        <button type="button" data-idx="${idx}" class="del-perm-btn text-red-500 font-semibold hover:text-red-700">删除</button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </section>
        `;
      }

      // ==========================================
      // SECTION 4: Feature Flags
      // ==========================================
      function renderFlagsSection() {
        return `
          <section class="rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 p-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]">
            <div class="border-b border-slate-100 pb-4 mb-4">
              <h2 class="text-base font-semibold text-[#25313c]">系统功能参数开关</h2>
              <p class="mt-1 text-xs text-[#66717d]">对项目内各种灰度策略、默认模型、提示词引擎做精细化控制。</p>
            </div>

            <!-- Table of Flags -->
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-xs leading-5">
                <thead>
                  <tr class="border-b border-slate-100 text-slate-400 font-medium">
                    <th class="py-3 px-2 font-medium">配置项 Key</th>
                    <th class="py-3 px-2 font-medium">类型</th>
                    <th class="py-3 px-2 font-medium">参数描述</th>
                    <th class="py-3 px-2 font-medium">配置值 Value</th>
                    <th class="py-3 px-2 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-700">
                  ${flags.map((item, idx) => {
                    const isEditing = idx === editingFlagIndex;
                    return `
                      <tr class="hover:bg-slate-50/50">
                        <td class="py-3 px-2 font-semibold font-mono text-slate-900">${escapeHtml(item.config_key)}</td>
                        <td class="py-3 px-2 text-slate-400">${escapeHtml(item.value_type)}</td>
                        <td class="py-3 px-2 text-slate-500 max-w-[200px] truncate" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</td>
                        <td class="py-3 px-2">
                          ${isEditing ? `
                            <input id="flagValueInput" type="text" class="h-8 px-2 rounded border border-slate-200 bg-white text-xs outline-none focus:border-cyan-500 w-full" value="${escapeHtml(flagValueInput)}">
                          ` : `
                            <code class="bg-slate-100 border border-slate-150 px-1.5 py-0.5 rounded text-[11px] text-slate-700 max-w-[240px] truncate inline-block align-middle" title="${escapeHtml(item.config_value)}">${escapeHtml(item.config_value)}</code>
                          `}
                        </td>
                        <td class="py-3 px-2 text-right whitespace-nowrap">
                          ${isEditing ? `
                            <button id="saveFlagBtn" type="button" class="text-cyan-600 font-semibold hover:text-cyan-800 mr-2">保存</button>
                            <button id="cancelFlagEdit" type="button" class="text-slate-500 font-semibold hover:text-slate-800">取消</button>
                          ` : `
                            <button type="button" data-idx="${idx}" class="edit-flag-btn text-cyan-600 font-semibold hover:text-cyan-800">修改配置</button>
                          `}
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </section>
        `;
      }

      // ==========================================
      // SECTION 5: Audit Logs
      // ==========================================
      function renderAuditSection() {
        return `
          <section class="rounded-[22px] border border-[rgba(223,231,236,0.96)] bg-white/95 p-5 shadow-[0_14px_30px_rgba(23,28,38,0.045)]">
            <div class="border-b border-slate-100 pb-4 mb-4">
              <h2 class="text-base font-semibold text-[#25313c]">操作审计日志</h2>
              <p class="mt-1 text-xs text-[#66717d]">追踪系统内所有的模型创建、权限变更、开关参数保存历史日志，保障系统安全性。</p>
            </div>

            <!-- Table of Audits -->
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-xs leading-5">
                <thead>
                  <tr class="border-b border-slate-100 text-slate-400 font-medium">
                    <th class="py-3 px-2 font-medium">操作时间</th>
                    <th class="py-3 px-2 font-medium">执行人账号</th>
                    <th class="py-3 px-2 font-medium">动作</th>
                    <th class="py-3 px-2 font-medium">变更对象</th>
                    <th class="py-3 px-2 font-medium">对象标识</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-600">
                  ${auditLogs.map((item) => `
                    <tr class="hover:bg-slate-50/50">
                      <td class="py-3 px-2 font-mono text-slate-500">${escapeHtml(item.timestamp)}</td>
                      <td class="py-3 px-2 font-semibold text-slate-900">${escapeHtml(item.actor_email)}</td>
                      <td class="py-3 px-2">
                        <span class="rounded px-2 py-0.5 text-[9px] font-semibold uppercase border ${
                          item.action === "CREATE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                          item.action === "UPDATE" ? "border-sky-200 bg-sky-50 text-sky-700" :
                          "border-red-200 bg-red-50 text-red-700"
                        }">${escapeHtml(item.action)}</span>
                      </td>
                      <td class="py-3 px-2 text-slate-500">${escapeHtml(item.resource_type)}</td>
                      <td class="py-3 px-2 font-mono text-slate-700">${escapeHtml(item.resource_key)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </section>
        `;
      }

      // ==========================================
      // EVENTS BINDING & HANDLERS
      // ==========================================
      function bindSectionEvents() {
        // Sidebar nav switching
        const navButtons = document.querySelectorAll("#adminSidebarNav button");
        navButtons.forEach(btn => {
          btn.addEventListener("click", () => {
            activeSection = btn.dataset.sec;
            editingModelIndex = -1;
            editingPermissionIndex = -1;
            editingFlagIndex = -1;
            renderAdminWorkspace();
          });
        });

        // Event hooks based on current active section
        if (activeSection === "models") {
          // Add button
          const addModelBtn = document.getElementById("addModelBtn");
          if (addModelBtn) {
            addModelBtn.addEventListener("click", () => {
              editingModelIndex = -2;
              modelForm = { model_id: "", display_name: "", sort_order: "1000", enabled: true, supports_reasoning: false, supports_tool_calling: false, allowed_upload_types: "*", visibility_scope: "all", visibility_users: "" };
              renderAdminWorkspace();
            });
          }

          // Edit/Delete list buttons
          document.querySelectorAll(".edit-model-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
              const idx = parseInt(btn.dataset.idx);
              editingModelIndex = idx;
              modelForm = Object.assign({}, models[idx]);
              renderAdminWorkspace();
            });
          });

          document.querySelectorAll(".del-model-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
              const idx = parseInt(btn.dataset.idx);
              if (confirm(`确认删除模型配置 ${models[idx].display_name} 吗？`)) {
                const deleted = models.splice(idx, 1)[0];
                logAudit("DELETE", "model_config", deleted.model_id);
                showFeedback("模型配置已删除");
                renderAdminWorkspace();
              }
            });
          });

          // Form cancel & save
          const cancelModelEdit = document.getElementById("cancelModelEdit");
          if (cancelModelEdit) {
            cancelModelEdit.addEventListener("click", () => {
              editingModelIndex = -1;
              renderAdminWorkspace();
            });
          }

          const saveModelBtn = document.getElementById("saveModelBtn");
          if (saveModelBtn) {
            saveModelBtn.addEventListener("click", () => {
              const formModelId = document.getElementById("formModelId").value.trim();
              const formDisplayName = document.getElementById("formDisplayName").value.trim();
              const formSortOrder = parseInt(document.getElementById("formSortOrder").value) || 1000;
              const formEnabled = document.getElementById("formEnabled").checked;
              const formReasoning = document.getElementById("formReasoning").checked;
              const formToolCalling = document.getElementById("formToolCalling").checked;
              const formAllowedUploads = document.getElementById("formAllowedUploads").value.trim();
              const formVisibilityScope = document.getElementById("formVisibilityScope").value;
              const formVisibilityUsers = document.getElementById("formVisibilityUsers").value.trim();

              if (!formModelId || !formDisplayName) {
                alert("模型 ID 和显示名称不能为空！");
                return;
              }

              const newConfig = {
                model_id: formModelId,
                display_name: formDisplayName,
                sort_order: formSortOrder,
                enabled: formEnabled,
                supports_reasoning: formReasoning,
                supports_tool_calling: formToolCalling,
                allowed_upload_types: formAllowedUploads,
                visibility_scope: formVisibilityScope,
                visibility_users: formVisibilityUsers
              };

              if (editingModelIndex === -2) {
                // Check if exists
                if (models.some(m => m.model_id === formModelId)) {
                  alert("模型 ID 已存在！");
                  return;
                }
                models.push(newConfig);
                logAudit("CREATE", "model_config", formModelId);
                showFeedback("新增模型配置成功");
              } else {
                models[editingModelIndex] = newConfig;
                logAudit("UPDATE", "model_config", formModelId);
                showFeedback("编辑模型配置已保存");
              }

              editingModelIndex = -1;
              renderAdminWorkspace();
            });
          }
        }

        if (activeSection === "gpts") {
          const saveGptsBtn = document.getElementById("saveGptsBtn");
          if (saveGptsBtn) {
            saveGptsBtn.addEventListener("click", () => {
              const sw = document.getElementById("gptsSwitch").checked;
              const scope = document.querySelector('input[name="visible_scope"]:checked').value;
              const whitelist = document.getElementById("gptsWhitelist").value.trim();

              gptsConfig.feature_enabled = sw;
              gptsConfig.visible_scope = scope;
              gptsConfig.whitelist_users = whitelist;

              logAudit("UPDATE", "gpts_config", "global_settings");
              showFeedback("智能体配置已保存（演示）");
              renderAdminWorkspace();
            });
          }
        }

        if (activeSection === "permissions") {
          // Add button
          const addPermBtn = document.getElementById("addPermBtn");
          if (addPermBtn) {
            addPermBtn.addEventListener("click", () => {
              editingPermissionIndex = -2;
              permissionForm = { user_key: "", permission_code: "gpts.manage", enabled: true, remark: "" };
              renderAdminWorkspace();
            });
          }

          // Edit/Delete buttons
          document.querySelectorAll(".edit-perm-btn").forEach(btn => {
            btn.addEventListener("click", () => {
              const idx = parseInt(btn.dataset.idx);
              editingPermissionIndex = idx;
              permissionForm = Object.assign({}, permissions[idx]);
              renderAdminWorkspace();
            });
          });

          document.querySelectorAll(".del-perm-btn").forEach(btn => {
            btn.addEventListener("click", () => {
              const idx = parseInt(btn.dataset.idx);
              const p = permissions[idx];
              if (confirm(`确认撤销用户 ${p.user_key} 的 ${p.permission_code} 权限吗？`)) {
                const deleted = permissions.splice(idx, 1)[0];
                logAudit("DELETE", "permission", `${deleted.user_key}:${deleted.permission_code}`);
                showFeedback("权限授权已撤销");
                renderAdminWorkspace();
              }
            });
          });

          // Cancel & Save permission
          const cancelPermEdit = document.getElementById("cancelPermEdit");
          if (cancelPermEdit) {
            cancelPermEdit.addEventListener("click", () => {
              editingPermissionIndex = -1;
              renderAdminWorkspace();
            });
          }

          const savePermBtn = document.getElementById("savePermBtn");
          if (savePermBtn) {
            savePermBtn.addEventListener("click", () => {
              const userKey = document.getElementById("formUserKey").value.trim();
              const permCode = document.getElementById("formPermCode").value;
              const remark = document.getElementById("formRemark").value.trim();
              const enabled = document.getElementById("formPermEnabled").checked;

              if (!userKey) {
                alert("用户账号标识不能为空！");
                return;
              }

              const newPerm = {
                user_key: userKey,
                permission_code: permCode,
                enabled: enabled,
                remark: remark
              };

              if (editingPermissionIndex === -2) {
                // Check if exists
                if (permissions.some(p => p.user_key === userKey && p.permission_code === permCode)) {
                  alert("此用户的该项授权规则已存在！");
                  return;
                }
                permissions.push(newPerm);
                logAudit("CREATE", "permission", `${userKey}:${permCode}`);
                showFeedback("授权权限成功");
              } else {
                permissions[editingPermissionIndex] = newPerm;
                logAudit("UPDATE", "permission", `${userKey}:${permCode}`);
                showFeedback("权限修改已保存");
              }

              editingPermissionIndex = -1;
              renderAdminWorkspace();
            });
          }
        }

        if (activeSection === "flags") {
          // Edit triggers
          document.querySelectorAll(".edit-flag-btn").forEach(btn => {
            btn.addEventListener("click", () => {
              const idx = parseInt(btn.dataset.idx);
              editingFlagIndex = idx;
              flagValueInput = flags[idx].config_value;
              renderAdminWorkspace();
            });
          });

          // Save & Cancel Flag
          const cancelFlagEdit = document.getElementById("cancelFlagEdit");
          if (cancelFlagEdit) {
            cancelFlagEdit.addEventListener("click", () => {
              editingFlagIndex = -1;
              renderAdminWorkspace();
            });
          }

          const saveFlagBtn = document.getElementById("saveFlagBtn");
          if (saveFlagBtn) {
            saveFlagBtn.addEventListener("click", () => {
              const newVal = document.getElementById("flagValueInput").value.trim();
              const old = flags[editingFlagIndex];
              old.config_value = newVal;

              logAudit("UPDATE", "feature_flag", old.config_key);
              showFeedback(`系统配置 ${old.config_key} 更新成功`);
              editingFlagIndex = -1;
              renderAdminWorkspace();
            });
          }
        }
      }

      function logAudit(action, resourceType, resourceKey) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        const hr = String(now.getHours()).padStart(2, "0");
        const min = String(now.getMinutes()).padStart(2, "0");
        const sec = String(now.getSeconds()).padStart(2, "0");
        
        auditLogs.unshift({
          timestamp: `${y}-${m}-${d} ${hr}:${min}:${sec}`,
          actor_email: "zhangsan", // logged in user in prototype
          action: action,
          resource_type: resourceType,
          resource_key: resourceKey
        });
      }

      return {
        renderAdminWorkspace
      };
    }
  };
})();
