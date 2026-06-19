(function () {
  const {
    automationTaskGroups
  } = window.AssistAiPrototypeData;

  window.AssistAiPrototypeWorkspaces = window.AssistAiPrototypeWorkspaces || {};
  window.AssistAiPrototypeWorkspaces.automation = {
    createRendererSet(deps) {
      const {
        workspaceView,
        escapeHtml,
        updateTopbarRight
      } = deps;

      function renderAutomationWorkspace() {
        if (!workspaceView) return;
        updateTopbarRight(`
          <button class="topbar-nav-btn min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-white/85 text-[var(--text-soft)] text-[13px] font-semibold transition-all duration-160 hover:border-[var(--line-strong)] hover:bg-white hover:text-[var(--text)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="create-automation">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14"></path>
              <path d="M5 12h14"></path>
            </svg>
            新建任务
          </button>
          <button class="topbar-nav-btn primary min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-transparent bg-[var(--accent-strong)] text-white text-[13px] font-semibold shadow-[0_6px_16px_rgba(39,154,179,0.16)] transition-all duration-160 hover:bg-[var(--accent)] hover:shadow-[0_8px_20px_rgba(39,154,179,0.22)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="automation-log">
            查看执行日志
          </button>
        `);
        workspaceView.innerHTML = `
          <div class="workspace-shell w-[min(100%,1180px)] mx-auto p-[36px_26px_72px] max-[900px]:p-[24px_14px_56px]">
            <section class="workspace-hero automation-hero p-[26px_28px] rounded-[22px] border border-[rgba(232,236,240,0.98)] bg-[rgba(252,253,254,0.82)] shadow-sm max-[900px]:p-[20px_18px]" style="background: linear-gradient(135deg, rgba(248, 251, 255, 0.94), rgba(241, 247, 252, 0.92)), radial-gradient(circle at top right, rgba(83, 173, 198, 0.12), transparent 32%);">
              <div class="workspace-hero-top automation-hero-top flex items-center justify-between gap-[18px] flex-wrap items-stretch">
                <div>
                  <div class="workspace-kicker inline-flex items-center gap-2 text-[rgba(65,156,175,0.98)] text-[11px] font-bold tracking-[0.13em] uppercase">
                    <svg class="icon" viewBox="0 0 24 24">
                      <rect x="4.5" y="5" width="15" height="15" rx="3"></rect>
                      <path d="M8 3.5v3"></path>
                      <path d="M16 3.5v3"></path>
                      <path d="M7.5 11h9"></path>
                    </svg>
                    定时任务
                  </div>
                  <h1 class="workspace-title mt-2.5 mx-0 mb-0 text-[rgba(38,49,61,0.98)] text-[30px] font-semibold tracking-[-0.03em] max-[680px]:text-2xl">自动化日程工作台</h1>
                  <p class="workspace-subtitle max-w-[640px] mt-2.5 mx-0 mb-0 text-[rgba(97,109,121,0.96)] text-sm leading-[1.7]">这里先用一个静态首页 mock 定时任务能力，重点展示任务列表、执行时间、归属人和触达渠道。后续如果继续细化，可以再补 cron 配置、启停、日志和失败告警。</p>
                </div>
                <div class="automation-metrics grid gap-3 min-w-[280px] grid-cols-[repeat(2,minmax(120px,1fr))] max-[900px]:min-w-0 max-[900px]:grid-cols-1">
                  <div class="automation-metric-card grid gap-1.5 py-4 px-[18px] rounded-[18px] border border-[rgba(204,220,229,0.94)] bg-[rgba(255,255,255,0.82)] shadow-[0_10px_22px_rgba(29,42,53,0.05)]">
                    <span class="automation-metric-label text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--text-faint)]">运行中</span>
                    <strong class="automation-metric-value text-[28px] leading-none tracking-[-0.04em] text-[var(--text)]">6</strong>
                    <span class="automation-metric-note text-xs leading-[1.5] text-[var(--text-soft)]">含 2 个今日待触发</span>
                  </div>
                  <div class="automation-metric-card grid gap-1.5 py-4 px-[18px] rounded-[18px] border border-[rgba(204,220,229,0.94)] bg-[rgba(255,255,255,0.82)] shadow-[0_10px_22px_rgba(29,42,53,0.05)]">
                    <span class="automation-metric-label text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--text-faint)]">平均节省</span>
                    <strong class="automation-metric-value text-[28px] leading-none tracking-[-0.04em] text-[var(--text)]">4.5h</strong>
                    <span class="automation-metric-note text-xs leading-[1.5] text-[var(--text-soft)]">按周估算人工整理时间</span>
                  </div>
                </div>
              </div>
            </section>
            ${automationTaskGroups.map((group) => `
              <section class="workspace-section mt-10">
                <div class="workspace-section-head flex items-end justify-between gap-4 mb-4.5">
                  <div>
                    <h2 class="workspace-section-title m-0 text-[rgba(38,49,61,0.98)] text-[17px] font-semibold tracking-[-0.01em]">${escapeHtml(group.title)}</h2>
                    <p class="workspace-section-desc mt-1.5 mx-0 mb-0 text-[rgba(105,116,127,0.96)] text-sm leading-[1.65]">${escapeHtml(group.desc)}</p>
                  </div>
                  <span class="workspace-section-count min-w-8 min-h-[28px] px-2.5 inline-grid place-items-center rounded-full border border-[rgba(232,236,240,0.98)] bg-white/74 text-[rgba(113,123,134,0.94)] text-[12px] font-semibold">${group.tasks.length}</span>
                </div>
                <div class="automation-grid grid gap-[18px]">
                  ${group.tasks.map((task) => `
                    <article class="automation-card grid gap-[18px] p-6 rounded-[22px] border border-[rgba(221,229,235,0.96)] bg-[rgba(252,253,254,0.95)] shadow-[0_16px_34px_rgba(23,28,38,0.045)] max-[680px]:p-[18px]">
                      <div class="automation-card-top flex items-start justify-between gap-[18px] max-[900px]:grid max-[900px]:grid-cols-1 max-[900px]:gap-3.5">
                        <div>
                          <h3 class="automation-card-title m-0 text-xl font-semibold tracking-[-0.02em] text-[var(--text)] max-[680px]:text-[18px]">${escapeHtml(task.name)}</h3>
                          <p class="automation-card-summary mt-2.5 max-w-[760px] text-sm leading-[1.75] text-[var(--text-soft)]">${escapeHtml(task.summary)}</p>
                        </div>
                        <span class="automation-status-badge flex-none inline-flex items-center py-2 px-3.5 rounded-full bg-[rgba(232,245,248,0.92)] text-[rgba(38,114,131,0.96)] text-xs font-semibold">${escapeHtml(task.status)}</span>
                      </div>
                      <dl class="automation-meta grid gap-3.5 grid-cols-3 m-0 max-[900px]:grid-cols-1">
                        <div class="automation-meta-item grid gap-1.5 py-3.5 px-4 rounded-2xl bg-[rgba(245,249,251,0.92)]">
                          <dt class="text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--text-faint)]">执行时间</dt>
                          <dd class="m-0 text-sm leading-[1.6] text-[var(--text)]">${escapeHtml(task.schedule)}</dd>
                        </div>
                        <div class="automation-meta-item grid gap-1.5 py-3.5 px-4 rounded-2xl bg-[rgba(245,249,251,0.92)]">
                          <dt class="text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--text-faint)]">负责人</dt>
                          <dd class="m-0 text-sm leading-[1.6] text-[var(--text)]">${escapeHtml(task.owner)}</dd>
                        </div>
                        <div class="automation-meta-item is-wide grid gap-1.5 py-3.5 px-4 rounded-2xl bg-[rgba(245,249,251,0.92)]">
                          <dt class="text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--text-faint)]">触达渠道</dt>
                          <dd class="m-0 text-sm leading-[1.6] text-[var(--text)]">${escapeHtml(task.channel)}</dd>
                        </div>
                      </dl>
                      <div class="automation-actions flex flex-wrap gap-3">
                        <button class="workspace-action min-h-10 px-4 inline-flex items-center gap-2 rounded-[13px] border border-[rgba(232,236,240,0.98)] bg-white/84 text-[rgba(86,97,109,0.98)] text-sm font-medium transition-all duration-160 hover:border-[rgba(211,220,227,0.98)] hover:bg-white hover:text-[rgba(72,84,96,0.98)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="edit-automation">编辑规则</button>
                        <button class="workspace-action primary min-h-10 px-4 inline-flex items-center gap-2 rounded-[13px] border border-[rgba(67,169,193,0.2)] bg-gradient-to-b from-[rgba(109,207,228,0.98)] to-[rgba(71,185,210,0.98)] text-white text-sm font-medium shadow-[0_8px_20px_rgba(71,185,210,0.22)] transition-all duration-160 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(71,185,210,0.3)] active:translate-y-0" data-workspace-action="run-automation">立即执行</button>
                      </div>
                    </article>
                  `).join("")}
                </div>
              </section>
            `).join("")}
          </div>
        `;
      }

      return {
        renderAutomationWorkspace
      };
    }
  };
})();