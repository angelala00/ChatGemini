(function () {
  const {
    gptWorkspaceItems,
    myGptsItems
  } = window.AssistAiPrototypeData;

  function scrollToTop() {
    const scroll = document.querySelector(".main-scroll");
    if (scroll) scroll.scrollTop = 0;
  }

  function createCardLogo(item, escapeHtml) {
    if (item.logo) {
      return `<img class="w-9 h-9 block object-contain" src="${item.logo}" alt="" />`;
    }
    return escapeHtml(item.name.slice(0, 1));
  }

  function renderWorkspaceCards(items, escapeHtml) {
    if (!items.length) {
      return `
        <div class="gpt-empty min-h-[320px] grid place-items-center rounded-3xl border border-dashed border-[rgba(206,216,224,0.98)] bg-[rgba(252,253,254,0.68)] text-center">
          <div>
            <div class="gpt-card-logo w-12 h-12 grid place-items-center overflow-hidden flex-none rounded-[15px] border border-[rgba(212,221,229,0.9)] bg-[rgba(244,247,250,0.95)] text-[rgba(58,170,193,0.98)] text-lg font-bold mx-auto">A</div>
            <h2 class="gpt-empty-title mt-4 mx-0 mb-0 text-[rgba(56,67,79,0.96)] text-base font-semibold">暂时没有可用智能体</h2>
            <p class="gpt-empty-desc max-w-[320px] mt-2.5 mx-auto mb-0 text-[rgba(117,127,138,0.94)] text-sm leading-[1.7]">新的智能体开放后会出现在这里。</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="gpts-grid grid gap-4 grid-cols-1 md:grid-cols-3">
        ${items
          .map(
            (item) => `
              <article class="gpt-card relative min-h-[214px] p-5 flex flex-col rounded-[22px] border border-[rgba(232,236,240,0.98)] bg-[rgba(252,253,254,0.92)] shadow-sm cursor-pointer transition-all duration-180 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-0.5 hover:border-[rgba(211,220,227,0.98)] hover:shadow-md" data-open-agent="${item.gid}">
                <button class="gpt-pin absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-[10px] border border-transparent transition-all duration-160 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:border-[rgba(232,236,240,0.98)] hover:bg-[rgba(244,247,250,0.96)] ${item.isPinned ? "is-active text-[rgba(64,166,187,0.98)]" : "text-[rgba(120,130,141,0.9)]"} ${item.isRequiredPinned ? "is-required opacity-[0.48] cursor-not-allowed" : ""}" data-pin-agent="${item.gid}" aria-label="${item.isPinned ? "取消固定" : "固定"}">
                  <svg class="icon icon-sm" viewBox="0 0 24 24">
                    <path d="M12 4v10"></path>
                    <path d="m8 8 4-4 4 4"></path>
                    <path d="M8 14h8"></path>
                  </svg>
                </button>
                <div class="gpt-card-top flex items-start gap-3.5">
                  <div class="gpt-card-logo w-12 h-12 grid place-items-center overflow-hidden flex-none rounded-[15px] border border-[rgba(212,221,229,0.9)] bg-[rgba(244,247,250,0.95)] text-[rgba(58,170,193,0.98)] text-lg font-bold">${createCardLogo(item, escapeHtml)}</div>
                  <div>
                    <h3 class="gpt-card-title m-0 text-[rgba(38,49,61,0.98)] text-base font-semibold tracking-[-0.01em]">${escapeHtml(item.name)}</h3>
                    <p class="gpt-card-desc mt-1.5 mx-0 mb-0 text-[rgba(97,109,121,0.96)] text-sm leading-[1.7]">${escapeHtml(item.desc)}</p>
                  </div>
                </div>
                <div class="gpt-card-bottom mt-auto pt-[22px] flex items-end justify-between gap-3">
                  <div class="gpt-card-meta text-[rgba(116,126,137,0.94)] text-[12px] leading-[1.8]">
                    <div>${escapeHtml(item.owner ? `创建者：${item.owner}` : "创建者：官方")}</div>
                    <div class="gpt-card-meta-row flex gap-3 flex-wrap">
                      <span>使用 ${item.usageCount}</span>
                      <span>固定 ${item.pinnedUserCount}</span>
                    </div>
                  </div>
                  <svg class="icon gpt-card-arrow text-[rgba(128,138,148,0.9)]" viewBox="0 0 24 24">
                    <path d="M5 12h14"></path>
                    <path d="m13 6 6 6-6 6"></path>
                  </svg>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  window.AssistAiPrototypeWorkspaces = window.AssistAiPrototypeWorkspaces || {};
  window.AssistAiPrototypeWorkspaces.gpts = {
    createRendererSet(deps) {
      const {
        workspaceView,
        mainLayout,
        crumbTitle,
        escapeHtml,
        updateTopbarRight
      } = deps;

      function renderMyGptsWorkspace() {
        if (!workspaceView) return;
        updateTopbarRight(`
          <button class="topbar-nav-btn min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-white/85 text-[var(--text-soft)] text-[13px] font-semibold transition-all duration-160 hover:border-[var(--line-strong)] hover:bg-white hover:text-[var(--text)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="gpts-plaza">回到广场</button>
          <button class="topbar-nav-btn primary min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-transparent bg-[var(--accent-strong)] text-white text-[13px] font-semibold shadow-[0_6px_16px_rgba(39,154,179,0.16)] transition-all duration-160 hover:bg-[var(--accent)] hover:shadow-[0_8px_20px_rgba(39,154,179,0.22)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="create-gpt">+ 创建智能体</button>
        `);
        crumbTitle.textContent = "我的智能体";
        workspaceView.innerHTML = `
          <div class="workspace-shell w-[min(100%,1180px)] mx-auto p-[36px_26px_72px] max-[900px]:p-[24px_14px_56px]">
            <section class="workspace-section mt-10" style="margin-top: 0;">
              <div class="workspace-section-head flex items-end justify-between gap-4 mb-4.5">
                <div>
                  <h2 class="workspace-section-title m-0 text-[rgba(38,49,61,0.98)] text-[17px] font-semibold tracking-[-0.01em]">我创建的</h2>
                  <p class="workspace-section-desc mt-1.5 mx-0 mb-0 text-[rgba(105,116,127,0.96)] text-sm leading-[1.65]">你作为 Owner 的智能体，拥有最高管理权限。</p>
                </div>
                <span class="workspace-section-count min-w-8 min-h-[28px] px-2.5 inline-grid place-items-center rounded-full border border-[rgba(232,236,240,0.98)] bg-white/74 text-[rgba(113,123,134,0.94)] text-[12px] font-semibold">${myGptsItems.length}</span>
              </div>
              <div class="my-gpts-list grid gap-3">
                ${myGptsItems.map((item, idx) => `
                  <div class="my-gpt-card p-[16px_20px] flex items-center justify-between gap-4 rounded-[18px] border border-[rgba(232,236,240,0.98)] bg-[rgba(255,255,255,0.88)] shadow-sm transition-all duration-200 hover:border-[rgba(210,220,230,0.98)] hover:bg-white hover:-translate-y-0.5 hover:shadow-md">
                    <div class="my-gpt-info flex items-center gap-4 flex-1">
                      <div class="my-gpt-avatar w-12 h-12 grid place-items-center rounded-xl bg-[rgba(240,244,248,0.98)] border border-[rgba(220,228,235,0.9)] text-[var(--accent)] text-lg font-bold overflow-hidden flex-none">${item.logo ? `<img class="w-9 h-9 object-contain" src="${item.logo}" />` : item.name[0]}</div>
                      <div class="my-gpt-details flex-1 min-w-0">
                        <div style="display: flex; align-items: center;">
                          <div class="my-gpt-name text-[rgba(38,49,61,0.98)] text-[15px] font-semibold truncate">${item.name}</div>
                          <span class="status-badge px-2 py-0.5 text-[11px] font-semibold rounded-[6px] bg-black/5 text-[var(--text-faint)] ml-2">${idx === 0 ? '白名单' : '私有'}</span>
                        </div>
                        <div class="my-gpt-desc mt-0.5 text-[rgba(105,116,127,0.96)] text-[13px] leading-1.5 line-clamp-1">${item.desc}</div>
                      </div>
                    </div>
                    <div class="my-gpt-actions flex gap-1">
                      <button class="icon-btn w-8 h-8 grid place-items-center rounded-lg text-[rgba(110,121,132,0.95)] transition-all duration-200 hover:bg-black/5 hover:text-[var(--text)]" title="编辑" data-workspace-action="edit-gpt" data-gid="${item.gid}">
                        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                      <button class="icon-btn w-8 h-8 grid place-items-center rounded-lg text-[rgba(110,121,132,0.95)] transition-all duration-200 hover:bg-black/5 hover:text-[var(--text)]" title="更多操作">
                        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.25"></circle><circle cx="19" cy="12" r="1.25"></circle><circle cx="5" cy="12" r="1.25"></circle></svg>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </section>
          </div>
        `;
        crumbTitle.textContent = "我的智能体";
        mainLayout.classList.add("is-workspace");
        scrollToTop();
      }

      function renderCreateGptWorkspace(gid = null) {
        if (!workspaceView) return;
        const item = gid ? myGptsItems.find(it => it.gid === gid) : null;
        updateTopbarRight(`
          <button class="topbar-nav-btn min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-white/85 text-[var(--text-soft)] text-[13px] font-semibold transition-all duration-160 hover:border-[var(--line-strong)] hover:bg-white hover:text-[var(--text)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="my-gpts">返回</button>
          <button class="topbar-nav-btn primary min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-transparent bg-[var(--accent-strong)] text-white text-[13px] font-semibold shadow-[0_6px_16px_rgba(39,154,179,0.16)] transition-all duration-160 hover:bg-[var(--accent)] hover:shadow-[0_8px_20px_rgba(39,154,179,0.22)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="save-gpt">${gid ? "保存" : "创建"}</button>
        `);
        crumbTitle.textContent = gid ? "编辑智能体" : "创建智能体";
        workspaceView.innerHTML = `
          <div class="workspace-shell w-[min(100%,1180px)] mx-auto p-[36px_26px_72px] max-[900px]:p-[24px_14px_56px]">
            <div class="gpt-tabs flex justify-center gap-2 mx-auto mb-6 p-1 w-fit bg-black/5 rounded-xl">
              <button class="gpt-tab px-4 py-1.5 text-[13px] font-semibold text-[var(--text-soft)] rounded-lg transition-all duration-200">Create / 帮我创建</button>
              <button class="gpt-tab is-active px-4 py-1.5 text-[13px] font-semibold text-[var(--text)] rounded-lg transition-all duration-200 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.05)]">Configure / 配置</button>
            </div>

            <div class="gpt-create-layout grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[1200px] mx-auto pb-[60px]">
              <div class="form-column flex flex-col gap-6">
                <div class="form-card p-5 rounded-[24px] border border-[rgba(232,236,240,0.98)] bg-[rgba(252,253,254,0.92)] shadow-sm">
                  <h3 class="form-section-title m-0 mb-4 text-[rgba(38,49,61,0.98)] text-[15px] font-semibold flex items-center gap-2.5">
                    <svg class="icon icon-sm text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    智能体档案
                  </h3>
                  <div class="form-grid grid gap-5">
                    <div style="display: flex; gap: 20px; align-items: flex-start;">
                       <div class="my-gpt-avatar w-12 h-12 grid place-items-center rounded-xl bg-[rgba(240,244,248,0.98)] border border-[rgba(220,228,235,0.9)] text-[var(--accent)] text-lg font-bold overflow-hidden flex-none" style="width: 80px; height: 80px; font-size: 32px; cursor: pointer;">
                          ${item && item.logo ? `<img class="w-16 h-16 object-contain" style="width: 64px; height: 64px;" src="${item.logo}" />` : (item ? item.name[0] : '+')}
                       </div>
                       <div style="flex: 1; display: grid; gap: 12px;">
                          <div class="form-item flex flex-col gap-2">
                            <label class="form-label text-[rgba(105,116,127,0.96)] text-[13px] font-medium">名称</label>
                            <input type="text" class="form-input p-[11px_14px] rounded-xl border border-[rgba(220,228,235,0.98)] bg-[rgba(255,255,255,0.9)] text-[var(--text)] text-sm outline-none transition-all duration-200 w-full focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] focus:bg-white" placeholder="名称" value="${item ? item.name : ''}">
                          </div>
                          <div class="form-item flex flex-col gap-2">
                            <label class="form-label text-[rgba(105,116,127,0.96)] text-[13px] font-medium">描述</label>
                            <input type="text" class="form-input p-[11px_14px] rounded-xl border border-[rgba(220,228,235,0.98)] bg-[rgba(255,255,255,0.9)] text-[var(--text)] text-sm outline-none transition-all duration-200 w-full focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] focus:bg-white" placeholder="简短描述" value="${item ? item.desc : ''}">
                          </div>
                       </div>
                    </div>
                  </div>
                </div>

                <div class="form-card p-5 rounded-[24px] border border-[rgba(232,236,240,0.98)] bg-[rgba(252,253,254,0.92)] shadow-sm">
                  <h3 class="form-section-title m-0 mb-4 text-[rgba(38,49,61,0.98)] text-[15px] font-semibold flex items-center gap-2.5">
                    <svg class="icon icon-sm text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    指令 (Instructions)
                  </h3>
                  <div class="form-item flex flex-col gap-2">
                    <textarea class="form-textarea p-[11px_14px] rounded-xl border border-[rgba(220,228,235,0.98)] bg-[rgba(255,255,255,0.9)] text-[var(--text)] text-sm outline-none transition-all duration-200 w-full focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] focus:bg-white" rows="10" placeholder="你希望该智能体如何工作？其角色和限制是什么？">${item ? '你是一个专业的翻译润色助手...' : ''}</textarea>
                  </div>
                </div>

                <div class="form-card p-5 rounded-[24px] border border-[rgba(232,236,240,0.98)] bg-[rgba(252,253,254,0.92)] shadow-sm">
                  <h3 class="form-section-title m-0 mb-4 text-[rgba(38,49,61,0.98)] text-[15px] font-semibold flex items-center gap-2.5">
                    <svg class="icon icon-sm text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    知识库 (Knowledge)
                  </h3>
                  <div class="upload-zone mt-3 p-6 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgba(206,216,224,0.98)] bg-[rgba(244,248,250,0.6)] cursor-pointer transition-all duration-200 hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]" style="padding: 16px;">
                    <div class="upload-title text-[13px] font-semibold text-[var(--accent-strong)]" style="font-size: 12px;">上传文件</div>
                  </div>
                </div>

                <div class="form-card p-5 rounded-[24px] border border-[rgba(232,236,240,0.98)] bg-[rgba(252,253,254,0.92)] shadow-sm">
                  <h3 class="form-section-title m-0 mb-4 text-[rgba(38,49,61,0.98)] text-[15px] font-semibold flex items-center gap-2.5">
                    <svg class="icon icon-sm text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path></svg>
                    能力 (Capabilities)
                  </h3>
                  <p class="mb-3 text-xs leading-5 text-[var(--text-soft)]">新建智能体默认使用 Agent Runtime v3，可按需启用以下只读能力。</p>
                  <div class="capabilities-grid grid grid-cols-2 gap-2 max-[600px]:grid-cols-1">
                    <div class="cap-item" style="padding: 8px 12px;">
                      <input type="checkbox" id="cap-document-list" checked>
                      <label for="cap-document-list" style="font-size: 13px;">列出会话文件</label>
                    </div>
                    <div class="cap-item" style="padding: 8px 12px;">
                      <input type="checkbox" id="cap-document-read" checked>
                      <label for="cap-document-read" style="font-size: 13px;">读取会话文件</label>
                    </div>
                    <div class="cap-item" style="padding: 8px 12px;">
                      <input type="checkbox" id="cap-knowledge-list" checked>
                      <label for="cap-knowledge-list" style="font-size: 13px;">列出知识文件</label>
                    </div>
                    <div class="cap-item" style="padding: 8px 12px;">
                      <input type="checkbox" id="cap-knowledge-read" checked>
                      <label for="cap-knowledge-read" style="font-size: 13px;">读取知识文件</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="form-column flex flex-col gap-6">
                <div class="preview-panel flex flex-col rounded-[24px] border border-[rgba(232,236,240,0.98)] bg-white overflow-hidden h-full min-h-[600px] shadow-sm">
                  <div class="preview-header px-5 py-3.5 border-b border-[var(--line)] flex items-center justify-between">
                    <span class="preview-title text-sm font-semibold text-[var(--text)]">Preview / 预览</span>
                  </div>
                  <div class="preview-content flex-1 flex flex-col items-center justify-center p-10 bg-[var(--bg)] text-center">
                    <div class="preview-placeholder-icon w-16 h-16 rounded-[20px] bg-white border border-[var(--line)] grid place-items-center mb-4 text-[var(--text-faint)]">
                       ${item && item.logo ? `<img class="w-12 h-12 object-contain" style="width: 48px; height: 48px;" src="${item.logo}" />` : (item ? item.name[0] : '？')}
                    </div>
                    <div style="font-size: 18px; font-weight: 600; color: var(--text);">${item ? item.name : '智能体名称'}</div>
                    <p style="font-size: 13px; color: var(--text-soft); margin-top: 8px;">在此处测试你的智能体效果...</p>

                    <div style="margin-top: auto; width: 100%; border-top: 1px solid var(--line); padding-top: 20px;">
                       <div style="background: white; border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; text-align: left; color: var(--text-faint); font-size: 13px;">
                          输入消息测试...
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        crumbTitle.textContent = gid ? "编辑智能体" : "创建智能体";
        mainLayout.classList.add("is-workspace");
        scrollToTop();
      }

      function renderWorkspace() {
        if (!workspaceView) return;
        const pinned = gptWorkspaceItems.filter((item) => item.isPinned);
        const others = gptWorkspaceItems.filter((item) => !item.isPinned);
        updateTopbarRight(`
          <button class="topbar-nav-btn min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-white/85 text-[var(--text-soft)] text-[13px] font-semibold transition-all duration-160 hover:border-[var(--line-strong)] hover:bg-white hover:text-[var(--text)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="my-gpts">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            我的智能体
          </button>
          <button class="topbar-nav-btn primary min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-transparent bg-[var(--accent-strong)] text-white text-[13px] font-semibold shadow-[0_6px_16px_rgba(39,154,179,0.16)] transition-all duration-160 hover:bg-[var(--accent)] hover:shadow-[0_8px_20px_rgba(39,154,179,0.22)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="create-gpt">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
            创建
          </button>
        `);
        workspaceView.innerHTML = `
          <div class="workspace-shell w-[min(100%,1180px)] mx-auto p-[36px_26px_72px] max-[900px]:p-[24px_14px_56px]">
            <section class="workspace-section mt-10" style="margin-top: 0;">
              <div class="workspace-section-head flex items-end justify-between gap-4 mb-4.5">
                <div>
                  <h2 class="workspace-section-title m-0 text-[rgba(38,49,61,0.98)] text-[17px] font-semibold tracking-[-0.01em]">常用智能体</h2>
                  <p class="workspace-section-desc mt-1.5 mx-0 mb-0 text-[rgba(105,116,127,0.96)] text-sm leading-[1.65]">你最常使用的智能体，随时从侧边栏快速开始。</p>
                </div>
                <span class="workspace-section-count min-w-8 min-h-[28px] px-2.5 inline-grid place-items-center rounded-full border border-[rgba(232,236,240,0.98)] bg-white/74 text-[rgba(113,123,134,0.94)] text-[12px] font-semibold">${pinned.length}</span>
              </div>
              ${renderWorkspaceCards(pinned, escapeHtml)}
            </section>
            <section class="workspace-section mt-10">
              <div class="workspace-section-head flex items-end justify-between gap-4 mb-4.5">
                <div>
                  <h2 class="workspace-section-title m-0 text-[rgba(38,49,61,0.98)] text-[17px] font-semibold tracking-[-0.01em]">全部智能体</h2>
                  <p class="workspace-section-desc mt-1.5 mx-0 mb-0 text-[rgba(105,116,127,0.96)] text-sm leading-[1.65]">浏览当前可用的智能体，找到更适合任务的工作方式。</p>
                </div>
                <span class="workspace-section-count min-w-8 min-h-[28px] px-2.5 inline-grid place-items-center rounded-full border border-[rgba(232,236,240,0.98)] bg-white/74 text-[rgba(113,123,134,0.94)] text-[12px] font-semibold">${others.length}</span>
              </div>
              ${renderWorkspaceCards(others, escapeHtml)}
            </section>
          </div>
        `;
      }

      return {
        renderMyGptsWorkspace,
        renderCreateGptWorkspace,
        renderWorkspace
      };
    }
  };
})();
