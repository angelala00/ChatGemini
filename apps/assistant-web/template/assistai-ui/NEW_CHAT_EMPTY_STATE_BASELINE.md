# 新建会话空状态 Baseline

静态页来源：
- [index.html](/Users/xinpeilu/common/workspace/AI/assistai-ui/index.html)
- [logo.svg](/Users/xinpeilu/common/workspace/AI/assistai-ui/logo.svg)

用途：
- 作为 `ChatGemini/apps/assistant-web` 里 `ChatV2` 新建会话空状态的唯一对齐基线
- 后续不再靠肉眼猜新会话布局
- 只有旧工程结构无法直接承接的地方，再单独讨论

## 1. 总体结构

空状态出现在右侧主区内部，不是整页覆盖层。

DOM 关系：
- `.main-layout.is-empty`
- `.main-scroll`
- `.empty-view`
- `.empty-shell`
- `.empty-hero`
- `.empty-support`
- `.suggestion-label`
- `.suggestion-strip`
- `.empty-composer-area`

与会话态的切换规则：
- `.main-layout.is-empty .empty-view { display: flex; }`
- `.main-layout.is-empty .content { display: none; }`
- `.main-layout.is-empty .composer-wrap { display: none; }`

结论：
- 空状态不是“消息区 + 底部输入框”模式
- 而是“居中内容块 + 内嵌输入框”模式

## 2. 主区骨架关系

### 顶栏
- 高度：`62px`
- 和会话态共用同一顶栏，不单独改高度

### 空状态容器
- `.empty-view`
  - `display: none`
  - `width: 100%`
  - `max-width: 1040px`
  - `min-height: 100%`
  - `align-items: center`
  - `justify-content: center`

### 空状态主体
- `.empty-shell`
  - `width: 100%`
  - `max-width: 920px`
  - `display: flex`
  - `flex-direction: column`
  - `align-items: center`
  - `justify-content: center`
  - `gap: 18px`

结论：
- 新会话主体是居中列布局
- 最大主体宽度是 `920px`
- 不应直接沿用会话态消息轨道 `760px`

## 3. 顶部 Hero

### 行布局
- `.empty-hero`
  - `display: flex`
  - `align-items: center`
  - `gap: 14px`
  - `color: var(--text)`

### Logo
- `.empty-logo`
  - `40px * 40px`
  - `display: grid`
  - `place-items: center`
  - `border-radius: 0`
  - `background: transparent`
  - `box-shadow: none`
- `.empty-logo img`
  - `34px * 34px`
  - `display: block`
  - `object-fit: contain`

### 标题
- `.empty-title`
  - `margin: 0`
  - `font-size: 28px`
  - `font-weight: 700`
  - `letter-spacing: -0.03em`

当前文案：
- `今天想让我帮你处理什么？`

结论：
- 新会话标题是强标题，不是顶栏标题的重复
- Logo 和标题属于一个独立 hero 组

## 4. 说明文案

- `.empty-support`
  - `max-width: 600px`
  - `margin: 0`
  - `color: var(--text-soft)`
  - `font-size: 14px`
  - `line-height: 1.7`
  - `text-align: center`

当前文案：
- `从制度查询、纪要整理到方案起草，这里更适合处理具体工作任务，而不是泛泛聊天。`

结论：
- 说明文案是单独一行居中段落
- 宽度上限比主体更窄，避免散

## 5. 建议任务区

### 标签
- `.suggestion-label`
  - `margin: 8px 0 0`
  - `color: var(--text-faint)`
  - `font-size: 12px`
  - `font-weight: 700`
  - `letter-spacing: 0.04em`

当前文案：
- `建议从这些常见任务开始`

### 建议按钮容器
- `.suggestion-strip`
  - `width: 100%`
  - `max-width: 760px`
  - `display: flex`
  - `flex-wrap: wrap`
  - `justify-content: center`
  - `gap: 12px`

### 建议按钮
- `.prompt-chip`
  - `min-height: 38px`
  - `padding: 0 16px`
  - `display: inline-flex`
  - `align-items: center`
  - `gap: 8px`
  - `border-radius: 14px`
  - `background: rgba(255, 255, 255, 0.96)`
  - `border: 1px solid rgba(232, 235, 239, 0.98)`
  - `color: var(--text-soft)`
  - `font-size: 13px`
  - `font-weight: 600`

### hover
- `transform: translateY(-1px)`
- `color: var(--text)`
- `border-color: rgba(189, 223, 230, 0.95)`
- `box-shadow: 0 8px 18px rgba(23, 28, 38, 0.05)`

当前三条建议：
- `整理入职清单`
- `改写流程 FAQ`
- `提炼行动项`

结论：
- 建议按钮是轻量辅助入口
- 不应该抢输入框主入口

## 6. 空状态输入框轨道

空状态输入框不是底部固定区，而是嵌在空状态主体内部。

DOM：
- `.empty-composer-area`
- `.composer`
- `.composer-input`
- `.composer-bottom`
- `.composer-left`
- `.composer-right`

### 外层轨道
- `.empty-composer-area`
  - `min-height: calc(var(--composer-height) + 22px)`
  - `width: min(100%, calc(var(--composer-max-width) + 52px))`
  - `margin: 0 auto`
  - `padding: 12px 26px 10px`
  - `display: flex`
  - `flex-direction: column`

对应变量：
- `--composer-height: 104px`
- `--composer-max-width: 830px`

结论：
- 空状态输入框轨道宽度和会话态输入框轨道是一致的
- 真正差异在于它是否被包进空状态主体

## 7. 空状态输入框主体

### `.composer`
- `min-height: 104px`
- `flex: 1`
- `border-radius: 22px`
- `border: 1px solid rgba(211, 221, 228, 0.96)`
- `background: rgba(255, 255, 255, 1)`
- `box-shadow:`
  - `0 32px 62px rgba(23, 28, 38, 0.09)`
  - `0 1px 0 rgba(255, 255, 255, 0.92) inset`
- `padding: 18px 18px 12px`
- `display: flex`
- `flex-direction: column`
- `gap: 12px`

### focus
- `border-color: rgba(189, 223, 230, 0.98)`
- `box-shadow:`
  - `0 36px 72px rgba(23, 28, 38, 0.1)`
  - `0 0 0 4px rgba(71, 185, 210, 0.11)`

### 输入区
- `.composer-input`
  - `width: 100%`
  - `min-height: 36px`
  - `flex: 1`
  - `resize: none`
  - `border: 0`
  - `outline: 0`
  - `padding: 0`
  - `background: transparent`
  - `color: var(--text)`
  - `font-size: 15px`
  - `line-height: 1.7`
  - `overflow: hidden`

### placeholder
当前空状态文案：
- `输入你的问题，我可以帮你查资料、写方案、整理内容`

placeholder 字色：
- `rgba(118, 129, 141, 0.9)`

## 8. 空状态输入框底部控件

### 底部行
- `.composer-bottom`
  - `display: flex`
  - `align-items: center`
  - `justify-content: space-between`
  - `gap: 14px`

### 左右分组
- `.composer-left, .composer-right`
  - `display: inline-flex`
  - `align-items: center`
  - `gap: 10px`

## 9. 左下加号按钮

- `.round-btn`
  - `width: 40px`
  - `height: 40px`
  - `border-radius: 12px`
  - `border: 1px solid rgba(232, 235, 239, 0.95)`
  - `background: rgba(255, 255, 255, 0.96)`

### 空状态主按钮特殊态
- `.composer-left .round-btn:first-child`
  - `color: var(--accent-strong)`
  - `border-color: rgba(189, 223, 230, 0.95)`
  - `background: rgba(242, 250, 252, 0.94)`

结论：
- 空状态这里只有一个左下添加按钮
- 没有第二排工具按钮

## 10. 模型按钮

### 当前模型
- 默认显示：`GLM-5.0`
- 候选：
  - `GLM-5.0`
  - `GLM-4.7`

### `.model-chip`
- 高：`40px`
- `padding: 0 12px`
- `border-radius: 10px`
- `font-size: 14px`
- `font-weight: 600`
- 文字色：
  - `var(--accent-strong)`

### 箭头
- 使用 `.icon.icon-sm`
- 默认色同 `accent-strong`

## 11. 发送按钮

### `.send-btn`
- `36px * 36px`
- `border-radius: 12px`
- 背景：
  - `linear-gradient(180deg, var(--send-start), var(--send-end))`
- 文字 / 图标：
  - `white`

### 图标
- 向上箭头
- 不是纸飞机

路径：
- `M12 19V5`
- `m6 11 6-6 6 6`

## 12. 与会话态的关键差异

新会话空状态和历史会话态，不应该混成同一层结构。

### 相同点
- 顶栏高度
- 右侧白底工作区
- 输入框主尺寸：`104px`
- 输入框轨道宽度：`830 + 52px`
- 模型按钮、加号按钮、发送按钮尺寸

### 不同点
- 空状态有居中 hero
- 空状态有说明文案
- 空状态有建议按钮区
- 空状态输入框嵌在主体内部，不是贴底固定区的阅读态关系
- 空状态 placeholder 和会话态 placeholder 不同

## 13. ChatGemini 落地时必须对齐的硬值

如果后续把 `ChatGemini` 新会话对齐到这份静态页，优先锁死这些值：

1. 顶栏：`62px`
2. 空状态主体宽度：`920px`
3. Hero 间距：`14px`
4. 标题：`28px / 700 / -0.03em`
5. 说明文案宽度：`600px`
6. 建议按钮容器宽度：`760px`
7. 输入框轨道：`830 + 52px`
8. 输入框外框：`104px / 22px / 18 18 12`
9. 加号按钮：`40px`
10. 模型按钮：`40px / 14px / 600`
11. 发送按钮：`36px`
12. 空状态 placeholder：
    - `输入你的问题，我可以帮你查资料、写方案、整理内容`

## 14. ChatGemini 适配时最容易出错的点

1. 把空状态直接渲染成一条“无效会话消息”
- 这是错的
- 空状态应该是一整个居中主体

2. 把空状态输入框继续沿用会话态底部固定关系
- 这样视觉会散
- 也会导致高度和焦点态很难对齐

3. 空状态默认焦点导致输入框观感变高
- 是否默认 focus，要单独明确
- 不能让 focus 样式偷偷改变高度观感

4. 空状态和会话态 placeholder 混用
- 两种文案必须分开

5. 建议按钮区缺失
- 缺失以后，新会话会显得太空
