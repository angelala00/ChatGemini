(function () {
  const {
    skillExploreGroups
  } = window.AssistAiPrototypeData;

  window.AssistAiPrototypeWorkspaces = window.AssistAiPrototypeWorkspaces || {};
  window.AssistAiPrototypeWorkspaces.explore = {
    createRendererSet(deps) {
      const {
        workspaceView,
        escapeHtml,
        updateTopbarRight
      } = deps;

      function renderSkillExploreWorkspace() {
        if (!workspaceView) return;
        updateTopbarRight(`
          <button class="topbar-nav-btn min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-white/85 text-[var(--text-soft)] text-[13px] font-semibold transition-all duration-160 hover:border-[var(--line-strong)] hover:bg-white hover:text-[var(--text)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="skill-filter">
            推荐排序
          </button>
          <button class="topbar-nav-btn primary min-h-[36px] px-3.5 inline-flex items-center gap-1.5 rounded-[10px] border border-transparent bg-[var(--accent-strong)] text-white text-[13px] font-semibold shadow-[0_6px_16px_rgba(39,154,179,0.16)] transition-all duration-160 hover:bg-[var(--accent)] hover:shadow-[0_8px_20px_rgba(39,154,179,0.22)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="skill-request">
            提交技能需求
          </button>
        `);
        workspaceView.innerHTML = `
          <div class="workspace-shell w-[min(100%,1180px)] mx-auto p-[36px_26px_72px] max-[900px]:p-[24px_14px_56px]">
            <section class="workspace-hero skill-explore-hero" style="background: linear-gradient(135deg, rgba(255, 251, 245, 0.95), rgba(248, 245, 255, 0.92)), radial-gradient(circle at top right, rgba(255, 186, 90, 0.16), transparent 30%);">
              <div class="workspace-hero-top skill-explore-hero-top items-stretch">
                <div>
                  <div class="workspace-kicker inline-flex items-center gap-2 text-[rgba(65,156,175,0.98)] text-[11px] font-bold tracking-[0.13em] uppercase">
                    <svg class="icon" viewBox="0 0 24 24">
                      <path d="M12 3.5 14.7 9l5.9.9-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.2L9.3 9z"></path>
                    </svg>
                    探索技能
                  </div>
                  <h1 class="workspace-title mt-2.5 mx-0 mb-0 text-[rgba(38,49,61,0.98)] text-[30px] font-semibold tracking-[-0.03em] max-[680px]:text-2xl">技能探索广场</h1>
                  <p class="workspace-subtitle max-w-[640px] mt-2.5 mx-0 mb-0 text-[rgba(97,109,121,0.96)] text-sm leading-[1.7]">这里先 mock 一个“探索技能”首页，重点展示推荐技能、适用场景和预期输出。后续如果继续细化，可以再补搜索、筛选、详情页和一键收藏。</p>
                </div>
                <div class="skill-explore-stats grid gap-3 min-w-[280px] grid-cols-[repeat(2,minmax(120px,1fr))] max-[900px]:min-w-0 max-[900px]:grid-cols-1">
                  <div class="skill-explore-stat grid gap-1.5 py-4 px-[18px] rounded-[18px] border border-[rgba(233, 219, 195, 0.94)] bg-[rgba(255, 255, 255, 0.84)] shadow-[0_10px_22px_rgba(43, 35, 24, 0.05)]">
                    <span class="skill-explore-stat-label text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--text-faint)]">本周新增</span>
                    <strong class="skill-explore-stat-value text-[28px] leading-none tracking-[-0.04em] text-[var(--text)]">12</strong>
                    <span class="skill-explore-stat-note text-xs leading-[1.5] text-[var(--text-soft)]">覆盖纪要、FAQ、周报和待办拆解</span>
                  </div>
                  <div class="skill-explore-stat grid gap-1.5 py-4 px-[18px] rounded-[18px] border border-[rgba(233, 219, 195, 0.94)] bg-[rgba(255, 255, 255, 0.84)] shadow-[0_10px_22px_rgba(43, 35, 24, 0.05)]">
                    <span class="skill-explore-stat-label text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--text-faint)]">常用场景</span>
                    <strong class="skill-explore-stat-value text-[28px] leading-none tracking-[-0.04em] text-[var(--text)]">8</strong>
                    <span class="skill-explore-stat-note text-xs leading-[1.5] text-[var(--text-soft)]">已按业务任务做过一轮归类</span>
                  </div>
                </div>
              </div>
            </section>
            ${skillExploreGroups.map((group) => `
              <section class="workspace-section mt-10">
                <div class="workspace-section-head flex items-end justify-between gap-4 mb-4.5">
                  <div>
                    <h2 class="workspace-section-title m-0 text-[rgba(38,49,61,0.98)] text-[17px] font-semibold tracking-[-0.01em]">${escapeHtml(group.title)}</h2>
                    <p class="workspace-section-desc mt-1.5 mx-0 mb-0 text-[rgba(105,116,127,0.96)] text-sm leading-[1.65]">${escapeHtml(group.desc)}</p>
                  </div>
                  <span class="workspace-section-count min-w-8 min-h-[28px] px-2.5 inline-grid place-items-center rounded-full border border-[rgba(232,236,240,0.98)] bg-white/74 text-[rgba(113,123,134,0.94)] text-[12px] font-semibold">${group.skills.length}</span>
                </div>
                <div class="skill-explore-grid grid gap-[18px] grid-cols-2 max-[900px]:grid-cols-1">
                  ${group.skills.map((skill) => `
                    <article class="skill-card grid gap-[18px] p-6 rounded-[22px] border border-[rgba(228, 232, 236, 0.96)] bg-[rgba(252, 253, 254, 0.95)] shadow-[0_16px_34px_rgba(23, 28, 38, 0.045)] max-[680px]:p-[18px]">
                      <div class="skill-card-top flex items-start justify-between gap-[18px] max-[900px]:grid max-[900px]:grid-cols-1 max-[900px]:gap-3.5">
                        <div>
                          <div class="skill-card-badge inline-flex items-center min-h-[24px] px-2.5 rounded-full bg-[rgba(255, 239, 208, 0.92)] text-[rgba(146, 94, 21, 0.98)] text-xs font-semibold">${escapeHtml(skill.badge)}</div>
                          <h3 class="skill-card-title mt-3 mb-0 text-xl font-semibold tracking-[-0.02em] text-[var(--text)] max-[680px]:text-[18px]">${escapeHtml(skill.name)}</h3>
                          <p class="skill-card-summary mt-2.5 text-sm leading-[1.75] text-[var(--text-soft)]">${escapeHtml(skill.summary)}</p>
                        </div>
                        <span class="skill-card-owner flex-none inline-flex items-center min-h-[28px] px-3 rounded-full bg-[rgba(243, 246, 248, 0.96)] text-[var(--text-soft)] text-xs font-semibold">${escapeHtml(skill.owner)}</span>
                      </div>
                      <dl class="skill-card-meta grid gap-3.5 m-0">
                        <div class="skill-card-meta-item grid gap-1.5 py-3.5 px-4 rounded-2xl bg-[rgba(247, 249, 251, 0.96)]">
                          <dt class="text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--text-faint)]">适用场景</dt>
                          <dd class="m-0 text-sm leading-[1.65] text-[var(--text)]">${escapeHtml(skill.scenario)}</dd>
                        </div>
                        <div class="skill-card-meta-item grid gap-1.5 py-3.5 px-4 rounded-2xl bg-[rgba(247, 249, 251, 0.96)]">
                          <dt class="text-[11px] font-bold tracking-[0.1em] uppercase text-[var(--text-faint)]">输出结果</dt>
                          <dd class="m-0 text-sm leading-[1.65] text-[var(--text)]">${escapeHtml(skill.outputs)}</dd>
                        </div>
                      </dl>
                      <div class="skill-card-actions flex flex-wrap gap-3">
                        <button class="workspace-action min-h-10 px-4 inline-flex items-center gap-2 rounded-[13px] border border-[rgba(232,236,240,0.98)] bg-white/84 text-[rgba(86,97,109,0.98)] text-sm font-medium transition-all duration-160 hover:border-[rgba(211,220,227,0.98)] hover:bg-white hover:text-[rgba(72,84,96,0.98)] hover:-translate-y-0.5 active:translate-y-0" data-workspace-action="preview-skill">查看详情</button>
                        <button class="workspace-action primary min-h-10 px-4 inline-flex items-center gap-2 rounded-[13px] border border-[rgba(67,169,193,0.2)] bg-gradient-to-b from-[rgba(109,207,228,0.98)] to-[rgba(71,185,210,0.98)] text-white text-sm font-medium shadow-[0_8px_20px_rgba(71,185,210,0.22)] transition-all duration-160 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(71,185,210,0.3)] active:translate-y-0" data-workspace-action="launch-skill">${escapeHtml(skill.cta)}</button>
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
        renderSkillExploreWorkspace
      };
    }
  };
})();