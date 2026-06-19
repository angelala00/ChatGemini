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
      return `<img src="${item.logo}" alt="" />`;
    }
    return escapeHtml(item.name.slice(0, 1));
  }

  function renderWorkspaceCards(items, escapeHtml) {
    if (!items.length) {
      return `
        <div class="gpt-empty">
          <div>
            <div class="gpt-card-logo">A</div>
            <h2 class="gpt-empty-title">暂时没有可用智能体</h2>
            <p class="gpt-empty-desc">新的智能体开放后会出现在这里。</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="gpts-grid">
        ${items
          .map(
            (item) => `
              <article class="gpt-card" data-open-agent="${item.gid}">
                <button class="gpt-pin ${item.isPinned ? "is-active" : ""} ${item.isRequiredPinned ? "is-required" : ""}" data-pin-agent="${item.gid}" aria-label="${item.isPinned ? "取消固定" : "固定"}">
                  <svg class="icon icon-sm" viewBox="0 0 24 24">
                    <path d="M12 4v10"></path>
                    <path d="m8 8 4-4 4 4"></path>
                    <path d="M8 14h8"></path>
                  </svg>
                </button>
                <div class="gpt-card-top">
                  <div class="gpt-card-logo">${createCardLogo(item, escapeHtml)}</div>
                  <div>
                    <h3 class="gpt-card-title">${escapeHtml(item.name)}</h3>
                    <p class="gpt-card-desc">${escapeHtml(item.desc)}</p>
                  </div>
                </div>
                <div class="gpt-card-bottom">
                  <div class="gpt-card-meta">
                    <div>${escapeHtml(item.owner ? `创建者：${item.owner}` : "创建者：官方")}</div>
                    <div class="gpt-card-meta-row">
                      <span>使用 ${item.usageCount}</span>
                      <span>固定 ${item.pinnedUserCount}</span>
                    </div>
                  </div>
                  <svg class="icon gpt-card-arrow" viewBox="0 0 24 24">
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
          <button class="topbar-nav-btn" data-workspace-action="gpts-plaza">回到广场</button>
          <button class="topbar-nav-btn primary" data-workspace-action="create-gpt">+ 创建智能体</button>
        `);
        crumbTitle.textContent = "我的智能体";
        workspaceView.innerHTML = `
          <div class="workspace-shell">
            <section class="workspace-section" style="margin-top: 0;">
              <div class="workspace-section-head">
                <div>
                  <h2 class="workspace-section-title">我创建的</h2>
                  <p class="workspace-section-desc">你作为 Owner 的智能体，拥有最高管理权限。</p>
                </div>
                <span class="workspace-section-count">${myGptsItems.length}</span>
              </div>
              <div class="my-gpts-list">
                ${myGptsItems.map((item, idx) => `
                  <div class="my-gpt-card">
                    <div class="my-gpt-info">
                      <div class="my-gpt-avatar">${item.logo ? `<img src="${item.logo}" />` : item.name[0]}</div>
                      <div class="my-gpt-details">
                        <div style="display: flex; align-items: center;">
                          <div class="my-gpt-name">${item.name}</div>
                          <span class="status-badge">${idx === 0 ? '白名单' : '私有'}</span>
                        </div>
                        <div class="my-gpt-desc">${item.desc}</div>
                      </div>
                    </div>
                    <div class="my-gpt-actions">
                      <button class="icon-btn" title="编辑" data-workspace-action="edit-gpt" data-gid="${item.gid}">
                        <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                      <button class="icon-btn" title="更多操作">
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
          <button class="topbar-nav-btn" data-workspace-action="my-gpts">返回</button>
          <button class="topbar-nav-btn primary" data-workspace-action="save-gpt">${gid ? "保存" : "创建"}</button>
        `);
        crumbTitle.textContent = gid ? "编辑智能体" : "创建智能体";
        workspaceView.innerHTML = `
          <div class="workspace-shell">
            <div class="gpt-tabs">
              <button class="gpt-tab">Create / 帮我创建</button>
              <button class="gpt-tab is-active">Configure / 配置</button>
            </div>

            <div class="gpt-create-layout" style="grid-template-columns: 1fr 1fr; max-width: 1200px;">
              <div class="form-column">
                <div class="form-card" style="padding: 20px;">
                  <h3 class="form-section-title">
                    <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    智能体档案
                  </h3>
                  <div class="form-grid">
                    <div style="display: flex; gap: 20px; align-items: flex-start;">
                       <div class="my-gpt-avatar" style="width: 80px; height: 80px; font-size: 32px; flex: none; cursor: pointer;">
                          ${item && item.logo ? `<img src="${item.logo}" />` : (item ? item.name[0] : '+')}
                       </div>
                       <div style="flex: 1; display: grid; gap: 12px;">
                          <div class="form-item">
                            <label class="form-label">名称</label>
                            <input type="text" class="form-input" placeholder="名称" value="${item ? item.name : ''}">
                          </div>
                          <div class="form-item">
                            <label class="form-label">描述</label>
                            <input type="text" class="form-input" placeholder="简短描述" value="${item ? item.desc : ''}">
                          </div>
                       </div>
                    </div>
                  </div>
                </div>

                <div class="form-card" style="padding: 20px;">
                  <h3 class="form-section-title">
                    <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    指令 (Instructions)
                  </h3>
                  <div class="form-item">
                    <textarea class="form-textarea" rows="10" placeholder="你希望该智能体如何工作？其角色和限制是什么？">${item ? '你是一个专业的翻译润色助手...' : ''}</textarea>
                  </div>
                </div>

                <div class="form-card" style="padding: 20px;">
                  <h3 class="form-section-title">
                    <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    知识库 (Knowledge)
                  </h3>
                  <div class="upload-zone" style="padding: 16px;">
                    <div class="upload-title" style="font-size: 12px;">上传文件</div>
                  </div>
                </div>

                <div class="form-card" style="padding: 20px;">
                  <h3 class="form-section-title">
                    <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"></path></svg>
                    能力 (Capabilities)
                  </h3>
                  <div class="capabilities-grid" style="grid-template-columns: 1fr 1fr;">
                    <div class="cap-item" style="padding: 8px 12px;">
                      <input type="checkbox" id="cap-web" checked>
                      <label for="cap-web" style="font-size: 13px;">联网搜索</label>
                    </div>
                    <div class="cap-item" style="padding: 8px 12px;">
                      <input type="checkbox" id="cap-code" checked>
                      <label for="cap-code" style="font-size: 13px;">代码解释器</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="form-column">
                <div class="preview-panel">
                  <div class="preview-header">
                    <span class="preview-title">Preview / 预览</span>
                  </div>
                  <div class="preview-content">
                    <div class="preview-placeholder-icon">
                       ${item && item.logo ? `<img src="${item.logo}" style="width: 48px; height: 48px;"/>` : (item ? item.name[0] : '？')}
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
          <button class="topbar-nav-btn" data-workspace-action="my-gpts">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            我的智能体
          </button>
          <button class="topbar-nav-btn primary" data-workspace-action="create-gpt">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
            创建
          </button>
        `);
        workspaceView.innerHTML = `
          <div class="workspace-shell">
            <section class="workspace-section" style="margin-top: 0;">
              <div class="workspace-section-head">
                <div>
                  <h2 class="workspace-section-title">常用智能体</h2>
                  <p class="workspace-section-desc">你最常使用的智能体，随时从侧边栏快速开始。</p>
                </div>
                <span class="workspace-section-count">${pinned.length}</span>
              </div>
              ${renderWorkspaceCards(pinned, escapeHtml)}
            </section>
            <section class="workspace-section">
              <div class="workspace-section-head">
                <div>
                  <h2 class="workspace-section-title">全部智能体</h2>
                  <p class="workspace-section-desc">浏览当前可用的智能体，找到更适合任务的工作方式。</p>
                </div>
                <span class="workspace-section-count">${others.length}</span>
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