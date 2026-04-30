# Right Chat Baseline

静态页来源：
- [index.html](/Users/xinpeilu/common/workspace/AI/assistai-ui/index.html)
- [assistant-avatar.svg](/Users/xinpeilu/common/workspace/AI/assistai-ui/assistant-avatar.svg)
- [logo.svg](/Users/xinpeilu/common/workspace/AI/assistai-ui/logo.svg)

用途：
- 作为 `ChatGemini/apps/assistant-web` 里 `ChatV2 / SessionV2 / InputAreaV2 / TopbarV2` 的右侧对齐基线
- 后续不再靠肉眼逼近，先按这份清单逐项匹配
- 只有旧工程结构或 Markdown 渲染承接不到的地方，再单独判断

边界说明：
- 本文档只负责 **会话态右侧** 基线
- `新建会话 / 空状态` 不再混在本文档里
- 新会话空状态单独以
  - [NEW_CHAT_EMPTY_STATE_BASELINE.md](/Users/xinpeilu/common/workspace/AI/assistai-ui/NEW_CHAT_EMPTY_STATE_BASELINE.md)
  为唯一对齐基线

执行规则：
- 只要页面进入已有会话，右侧按本文档对齐
- 只要页面进入新建会话空状态，右侧按 `NEW_CHAT_EMPTY_STATE_BASELINE.md` 对齐

## 1. 全局基线

### 主区核心变量
- 顶栏高度：`62px`
- 输入框高度：`104px`
- 主内容最大宽：`830px`
- 输入框最大宽：`830px`

### 右侧主区背景
- `.main`
  - `background: rgba(255, 255, 255, 0.98)`
- 目标观感：
  - 右侧整体是白底工作区
  - 不要叠出明显灰色壳

### 右侧文字层级
- 主正文色：
  - `var(--text)`，来自根变量
  - 实际约等于 `oklch(24.5% 0.014 248)`
- 次正文：
  - `var(--text-soft)`
- 辅助文字：
  - `var(--text-faint)`
- 强调动作青：
  - `var(--accent-strong)`
  - 实际值：`oklch(62% 0.115 208)`

## 2. 顶部栏

DOM：
- `.topbar`
- `.topbar-left`
- `.topbar-right`
- `.crumb`
- `.crumb-title`
- `.action-feedback`

### 顶栏容器
- 高度：跟 `--topbar-height: 62px` 对齐
- `padding: 0 26px`
- `gap: 16px`
- `display: flex`
- `align-items: center`
- `justify-content: space-between`
- 下边线：
  - `1px solid rgba(232, 236, 240, 0.92)`
- 背景：
  - `rgba(255, 255, 255, 0.78)`
- `backdrop-filter: blur(10px)`

### 标题区
- `.crumb`
  - `gap: 8px`
  - `max-width: 280px`
  - `font-size: 14px`
  - `font-weight: 400`
  - `color: var(--text)`
- `.crumb-title`
  - `white-space: nowrap`
  - `overflow: hidden`
  - `text-overflow: ellipsis`

### 顶部反馈气泡
- `.action-feedback`
  - 最小高：`28px`
  - `padding: 0 10px`
  - `border-radius: 999px`
  - 边框：
    - `1px solid rgba(232, 235, 239, 0.98)`
  - 背景：
    - `rgba(246, 249, 251, 0.96)`
  - 字号：`12px`
  - 字色：
    - `var(--text-soft)`

## 3. 主滚动区与内容轨道

DOM：
- `.main-scroll`
- `.content`
- `.article`

### 滚动区
- `.main-scroll`
  - `overflow-y: auto`
  - `overflow-x: hidden`
- 滚动条
  - 宽：`8px`
  - thumb：
    - `background: rgba(197, 203, 213, 0.8)`
    - `border-radius: 999px`

### 内容宽度
- `.content`
  - `width: min(100%, calc(var(--content-max-width) + 52px))`
  - 即：`830px + 52px` 体系
  - `margin: 0 auto`
  - `padding: 14px 26px 56px`

### 消息流
- `.article`
  - `display: grid`
  - `gap: 18px`
  - `padding: 2px 0 18px`

结论：
- `ChatV2` 里不能只看 `830px`
- 真正的外层轨道是 `830 + 52px`
- 顶部栏、正文区、输入框都应站在同一套宽度逻辑上

## 4. 消息行基线

DOM：
- `.message-row`
- `.message-row.user-row`
- `.message-row.agent-row`

### 通用消息行
- `display: flex`
- `align-items: flex-start`
- `gap: 8px`

### 用户消息行
- `justify-content: flex-end`

### 助手消息行
- `justify-content: flex-start`
- `gap: 14px`
- `margin-top: 14px`

## 5. 用户气泡

DOM：
- `.article-intro`

### 尺寸与轨道
- 最大宽：
  - `max-width: min(72%, 680px)`
- 外观：
  - `padding: 14px 16px`
  - `border-radius: 16px`
  - 边框：
    - `1px solid rgba(233, 237, 241, 0.98)`
  - 背景：
    - `linear-gradient(180deg, rgba(246, 248, 250, 0.98), rgba(241, 244, 247, 0.98))`
  - 阴影：
    - `0 4px 12px rgba(23, 28, 38, 0.02)`

### 文字
- 字号：`15px`
- 行高：`1.85`
- 字色：`var(--text)`
- `margin: 0`

### 对齐要求
- 用户气泡要落在消息流轨道里
- 不应悬得太高
- 不应使用单独更宽的工程默认宽度

## 6. 助手头像与回复起点

DOM：
- `.agent-avatar`
- `.agent-avatar img`
- `.text-card`

### 头像容器
- 尺寸：`30px * 30px`
- 圆形
- 背景：
  - `var(--brand-mark)`
  - 实际值：`oklch(72% 0.106 204)`
- 阴影：
  - `0 6px 14px rgba(84, 190, 213, 0.16)`

### 头像图标
- 图片尺寸：
  - `14px * 14px`
- `object-fit: contain`
- `opacity: 1`
- 资源文件：
  - 使用外部 [assistant-avatar.svg](/Users/xinpeilu/common/workspace/AI/assistai-ui/assistant-avatar.svg)
- 图标填充色：
  - `white`

### 助手正文容器
- `.text-card`
  - `flex: 1`
  - `width: auto`
  - `max-width: 860px`
  - `position: relative`

结论：
- `SessionV2` 里助手正文的最大宽不是随便设的
- 静态页助手回复主容器上限是 `860px`

## 7. 助手回复排版

DOM：
- `.response-panel`
- `.response-section`
- `.response-heading`
- `.response-divider`
- `.response-copy`

### 外层
- `.response-panel`
  - `display: grid`
  - `gap: 22px`
  - `padding: 0`
  - `border: 0`
  - `border-radius: 0`
  - `background: transparent`
  - `box-shadow: none`

### 分节
- `.response-section`
  - `display: grid`
  - `gap: 12px`
- 相邻分节：
  - `.response-section + .response-section { padding-top: 2px; }`

### 分节标题
- `.response-heading`
  - `display: inline-flex`
  - `align-items: center`
  - `gap: 10px`
  - `font-size: 15px`
  - `font-weight: 500`
  - `letter-spacing: -0.01em`
  - `color: rgba(39, 49, 61, 0.96)`

### 标题图标色
- `.response-heading .icon`
  - `color: rgba(110, 120, 132, 0.92)`

### 分节虚线
- `.response-divider`
  - 宽：`34px`
  - `border-top: 3px dotted rgba(110, 120, 132, 0.72)`

### 正文区
- `.response-copy`
  - `display: grid`
  - `gap: 14px`
- `.response-copy p`
  - `margin: 0`
  - `font-size: 15px`
  - `line-height: 1.86`
  - `color: var(--text)`

结论：
- 右侧助手回复不是“文档卡片”
- 它是自然文本流 + 轻分节
- 不能靠重卡片、重边框、重色块来做层级

## 8. 助手操作行

DOM：
- `.assistant-actions`
- `.meta-action`

### 基线
- `display: flex`
- `align-items: center`
- `gap: 8px`
- `margin-top: 8px`
- `padding-top: 0`
- `border-top: 0`
- `opacity: 0.32`

### 风格要求
- 这是附属工具行
- 不应抢正文
- 图标要比正文淡很多
- hover 只做轻反馈

## 9. 输入框外层轨道

DOM：
- `.composer-wrap`
- `.composer-area`
- `.empty-composer-area`
- `.footnote`

### 区域背景
- `.composer-wrap`
  - `border-top: 0`
  - `background: rgba(255, 255, 255, 0.98)`

### 宽度体系
- `.empty-composer-area, .composer-area`
  - 最小高：
    - `calc(var(--composer-height) + 22px)`
  - 宽：
    - `min(100%, calc(var(--composer-max-width) + 52px))`
  - `margin: 0 auto`
  - `padding: 12px 26px 10px`
  - `display: flex`
  - `flex-direction: column`

### 版本号
- `.footnote`
  - `margin-top: 2px`
  - `text-align: center`
  - `font-size: 11px`
  - 字色：
    - `rgba(118, 129, 141, 0.92)`

### 文案
- 空白态版本号：
  - `v1.0.1 XXX公司`
- 会话态版本号：
  - `v1.0.1 XXX公司`

## 10. 输入框主体

DOM：
- `.composer`
- `.composer-input`
- `.composer-bottom`
- `.composer-left`
- `.composer-right`

### 外框
- 最小高：`104px`
- `border-radius: 22px`
- 边框：
  - `1px solid rgba(211, 221, 228, 0.96)`
- 背景：
  - `rgba(255, 255, 255, 1)`
- 阴影：
  - `0 32px 62px rgba(23, 28, 38, 0.09)`
  - `0 1px 0 rgba(255, 255, 255, 0.92) inset`
- 内边距：
  - `18px 18px 12px`
- `display: flex`
- `flex-direction: column`
- `gap: 12px`

### focus
- `border-color: rgba(189, 223, 230, 0.98)`
- 阴影：
  - `0 36px 72px rgba(23, 28, 38, 0.1)`
  - `0 0 0 4px rgba(71, 185, 210, 0.11)`

### 输入区
- `.composer-input`
  - `width: 100%`
  - `min-height: 36px`
  - `flex: 1`
  - `resize: none`
  - `padding: 0`
  - `border: 0`
  - `background: transparent`
  - `font-size: 15px`
  - `line-height: 1.7`
  - 字色：
    - `var(--text)`

### placeholder
- 空白态：
  - `输入你的问题，我可以帮你查资料、写方案、整理内容`
- 会话态：
  - `继续提问，例如：帮我把这份说明整理成面向新员工的 FAQ 版本`
- 字色：
  - `rgba(118, 129, 141, 0.9)`

### 底部控件行
- `.composer-bottom`
  - `display: flex`
  - `align-items: center`
  - `justify-content: space-between`
  - `gap: 14px`

### 左右控件组
- `.composer-left, .composer-right`
  - `display: inline-flex`
  - `align-items: center`
  - `gap: 10px`

## 11. 加号按钮

DOM：
- `.round-btn`
- 当前实际只有左下这个添加按钮在用

### 尺寸
- `40px * 40px`
- 圆角：`12px`

### 外观
- 边框：
  - `1px solid rgba(232, 235, 239, 0.95)`
- 背景：
  - `rgba(255, 255, 255, 0.96)`
- 默认字色：
  - `var(--text-soft)`

### 左下添加按钮特殊态
- `.composer-left .round-btn:first-child`
  - `color: var(--accent-strong)`
  - `border-color: rgba(189, 223, 230, 0.95)`
  - `background: rgba(242, 250, 252, 0.94)`

### hover
- `transform: translateY(-1px)`

## 12. 模型切换

DOM：
- `.model-select`
- `.model-chip`
- `.model-menu`
- `.model-option`

### 当前显示
- 空白态默认：`GLM-5.0`
- 会话态默认：`GLM-5.0`
- 候选项：
  - `GLM-5.0`
  - `GLM-4.7`

### 模型按钮
- 高：`40px`
- `padding: 0 12px`
- 圆角：`10px`
- 字号：`14px`
- 字重：`600`
- 文字色：
  - `var(--accent-strong)`
  - 实际值：`oklch(62% 0.115 208)`
- hover
  - 轻微上浮
- 展开态：
  - `.is-open`
  - 背景：
    - `rgba(246, 248, 250, 0.96)`
  - 文字色：
    - `var(--text)`

### 模型箭头
- 使用 `.icon.icon-sm`
- 展开前：
  - `color: var(--accent-strong)`
  - 实际值：`oklch(62% 0.115 208)`
- 展开后：
  - `color: var(--text-soft)`
  - 实际值：`oklch(46.5% 0.012 246)`
  - `transform: rotate(180deg)`

### 模型菜单
- 位置：
  - `right: 0`
  - `bottom: calc(100% + 8px)`
- 宽：
  - `min-width: 116px`
- `padding: 6px`
- `gap: 2px`
- 圆角：`14px`
- 边框：
  - `1px solid rgba(232, 236, 240, 0.98)`
- 背景：
  - `rgba(253, 253, 254, 0.99)`
- 阴影：
  - `0 14px 28px rgba(23, 28, 38, 0.08)`
  - `0 2px 8px rgba(23, 28, 38, 0.03)`

### 模型菜单项
- 高：`34px`
- `padding: 0 10px`
- `border-radius: 10px`
- 字号：`13px`
- 字重：`400`
- 默认文字色：
  - `rgba(56, 67, 79, 0.96)`
- hover：
  - `background: rgba(244, 247, 250, 0.96)`
- active：
  - `background: rgba(238, 246, 249, 0.94)`
  - `color: var(--accent-strong)`
  - 实际值：`oklch(62% 0.115 208)`

## 13. 发送按钮

DOM：
- `.send-btn`

### 尺寸
- `36px * 36px`
- 圆角：`12px`

### 外观
- 背景：
  - `linear-gradient(180deg, var(--send-start), var(--send-end))`
  - `--send-start: oklch(71% 0.113 201)`
  - `--send-end: oklch(63% 0.121 209)`
- 文字 / 图标：
  - `white`
- 阴影：
  - `0 8px 18px rgba(63, 170, 194, 0.24)`

### hover
- 阴影增强：
  - `0 10px 22px rgba(63, 170, 194, 0.3)`
- 同时整体轻微上浮

### 图标
- 使用通用 `.icon`
- 结构：
  - 一根向上箭头
  - `M12 19V5`
  - `m6 11 6-6 6 6`

## 14. 空白态补充

DOM：
- `.empty-view`
- `.empty-shell`
- `.empty-hero`
- `.empty-logo`
- `.empty-title`
- `.empty-support`
- `.suggestion-label`
- `.suggestion-strip`
- `.prompt-chip`

### 空白态总宽
- `.empty-shell`
  - `max-width: 920px`
  - `gap: 18px`

### 标题区
- `.empty-hero`
  - `gap: 14px`
- `.empty-logo`
  - `40px * 40px`
  - logo 图片：
    - `34px * 34px`
- `.empty-title`
  - `font-size: 28px`
  - `font-weight: 700`
  - `letter-spacing: -0.03em`

### 支持文案
- `.empty-support`
  - `max-width: 600px`
  - `font-size: 14px`
  - `line-height: 1.7`
  - `text-align: center`

### 建议标签
- `.suggestion-label`
  - `margin-top: 8px`
  - `font-size: 12px`
  - `font-weight: 700`
  - `letter-spacing: 0.04em`
  - `color: var(--text-faint)`

### 建议 chip
- `.suggestion-strip`
  - `max-width: 760px`
  - `gap: 12px`
- `.prompt-chip`
  - 高：`38px`
  - `padding: 0 16px`
  - 圆角：`14px`
  - 背景：
    - `rgba(255, 255, 255, 0.96)`
  - 边框：
    - `1px solid rgba(232, 235, 239, 0.98)`
  - 字号：`13px`
  - 字重：`600`
  - 默认字色：
    - `var(--text-soft)`

## 15. 右侧通用图标规则

### 基线
- `.icon`
  - `18px * 18px`
  - `stroke-width: 1.8`
  - `fill: none`
  - `stroke-linecap: round`
  - `stroke-linejoin: round`
- `.icon-sm`
  - `16px * 16px`

### 右侧重要图标尺寸
- 助手头像内图标：
  - `14px * 14px`
- 发送按钮内箭头：
  - 复用 `.icon`
- 加号按钮内加号：
  - 复用 `.icon`
- 模型箭头：
  - `.icon-sm`

### 颜色分配
- 助手头像底色：
  - `var(--brand-mark)`
  - 实际值：`oklch(72% 0.106 204)`
- 助手标题小图标：
  - `rgba(110, 120, 132, 0.92)`
- 底部操作弱图标：
  - 继续走冷灰，不走品牌主色
- 输入框里的品牌动作点：
  - `var(--accent-strong)`
  - 实际值：`oklch(62% 0.115 208)`

## 16. 与 ChatV2 对齐时的优先顺序

先对齐这些硬值：
1. 顶栏：`62px / 26px / 14px`
2. 内容轨道：`830 + 52px`
3. 用户气泡：`72% / 680px / 14x16 / 15px / 1.85`
4. 助手正文：`860px / 15px / 1.86`
5. 输入框：`104px / 22px radius / 18 18 12 padding`
6. 左下加号按钮：`40px`
7. 模型按钮：`40px / 14px`
8. 发送按钮：`36px`
9. 版本号：`11px`

再对齐这些软值：
1. 图标颜色层级
2. 操作按钮透明度
3. 阴影强弱
4. 空白态标题和建议区的节奏

## 17. 旧工程可能承接不到的点

这些后续需要单独判断：
- 现有 Markdown 渲染对 `response-copy` 段距的干扰
- `SessionV2` 里是否需要绕过 `prose` 默认样式
- 现有输入框自适应高度逻辑是否会破坏 `104px` 基线
- 模型菜单展开定位是否能完全复用静态页结构
- 旧页面现有图标库和静态页 SVG 线味是否能完全一致

如果旧工程结构不能完全承接，优先保留：
- 宽度
- 字号
- 行高
- 按钮尺寸
- 图标颜色层级

不要优先保留：
- 轻微 hover 上浮
- 空白态的小动画感
- 非关键的阴影差异
