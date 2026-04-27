---
name: "AssistAI 企业员工助手"
description: "一个克制、安静、面向企业员工日常工作的 AI 会话工作台。"
colors:
  primary: "#47B9D2"
  primary-soft: "#ECF8FB"
  primary-strong: "#2AA8C9"
  neutral-bg: "#F8FAFB"
  neutral-panel: "#FBFCFD"
  neutral-sidebar: "#F4FAFC"
  neutral-sidebar-deep: "#F1F6F9"
  neutral-line: "#E8EBEF"
  neutral-line-strong: "#D7DDE2"
  text-strong: "#28323D"
  text-muted: "#5C6876"
  text-soft: "#76818D"
  send-start: "#6DCFE4"
  send-end: "#47B9D2"
typography:
  display:
    fontFamily: "\"SF Pro Display\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "clamp(28px, 3vw, 40px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "\"SF Pro Display\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "\"SF Pro Display\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "\"SF Pro Display\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.9
    letterSpacing: "normal"
  label:
    fontFamily: "\"SF Pro Display\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  xs: "8px"
  sm: "11px"
  md: "14px"
  lg: "16px"
  xl: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "26px"
  xxl: "30px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-panel}"
    rounded: "{rounded.lg}"
    size: "40px"
    width: "40px"
  button-secondary:
    backgroundColor: "{colors.neutral-panel}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "52px"
  input-composer:
    backgroundColor: "{colors.neutral-panel}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.xl}"
    padding: "14px 18px 12px"
    height: "114px"
  chip-model:
    backgroundColor: "{colors.neutral-panel}"
    textColor: "{colors.primary-strong}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  nav-history-active:
    backgroundColor: "{colors.neutral-panel}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "32px"
---

# Design System: AssistAI 企业员工助手

## Overview

**Creative North Star: "The Quiet Workbench"**

这个系统不是一个炫技型 AI 产品界面，而是一张安静的工作台。它要让企业员工在进入页面的几秒内理解结构，马上开始提问、阅读、继续追问，不被品牌姿态、视觉装饰或复杂模块分散注意力。

整体气质必须克制、稳定、可信。版面使用冷灰白中性色建立秩序，用少量青色承担动作提示和系统回应，让页面有轻微的技术感，但绝不把青色扩散成整页情绪。这个系统明确拒绝 `不要做成营销落地页风格`、`不要做成炫技型 AI 产品`、`不要做成复杂后台`、`不要过分模仿消费聊天产品的轻佻感` 这些方向。

**Key Characteristics:**
- 结构先行，情绪后置
- 中性底色，大留白，弱边框
- 会话输入区是唯一真正需要被强调的交互核心
- 青色只服务动作和状态，不服务表演
- 左侧导航像工具目录，不像运营菜单

## Colors

这是一套冷静的浅色产品调色板，主体靠冷灰白建立信任，强调色只在可操作点位和模型动作上出现。

### Primary
- **工作流青** (`#47B9D2`): 用于发送按钮、模型文字、局部图标强调。它的职责是提示“这里可以执行动作”，不是染色整页。
- **轻提示青** (`#ECF8FB`): 用于 Beta 标签、输入区加号按钮、小型状态底。它只能作为面积很小的提示层。
- **聚焦青** (`#2AA8C9`): 用于图标或文字级强调，比主青更适合细部，不适合大面积面。

### Neutral
- **雾白底** (`#F8FAFB`): 整页背景基底，用来承接大面积留白。
- **工作台白** (`#FBFCFD`): 主内容面板、输入框、轻卡片的主底色。
- **侧栏冷白** (`#F4FAFC`): 左侧栏的浅冷白，帮助它与主内容区分开，但不过分跳脱。
- **侧栏深一阶** (`#F1F6F9`): 侧栏底部或渐变过渡的深一阶冷白。
- **弱分隔线** (`#E8EBEF`): 顶部、内容区、输入区的标准分隔线。
- **结构线** (`#D7DDE2`): 输入框边线、弱边框按钮和容器描边。
- **主正文墨灰** (`#28323D`): 用于标题、正文、当前选中项，必须稳定清晰。
- **次正文冷灰** (`#5C6876`): 用于导语、输入框提示、普通操作文案。
- **辅助信息灰** (`#76818D`): 用于版本号、说明性文字、非关键控件。

**The Accent Containment Rule.** 青色在任意一个屏幕里只能承担局部动作强调，不能占据大面积背景，不能染色主阅读区，不能替代正文层级。

## Typography

**Display Font:** `SF Pro Display / PingFang SC / Hiragino Sans GB / Microsoft YaHei / sans-serif`
**Body Font:** `SF Pro Display / PingFang SC / Hiragino Sans GB / Microsoft YaHei / sans-serif`
**Label/Mono Font:** 沿用正文系统字体，不额外引入 mono

**Character:** 这套字体策略追求工具型清晰度，而不是品牌型个性。所有层级都建立在同一套系统字体上，重点依靠字号、字重和留白，而不是依靠字体切换制造层级。

### Hierarchy
- **Display** (`700`, `clamp(28px, 3vw, 40px)`, `1.1`): 只用于空白态主标题，例如新建会话时的欢迎句。
- **Headline** (`700`, `20px`, `1.3`): 用于内容分节标题和页面中的核心阅读节点。
- **Title** (`600`, `14px`, `1.4`): 用于顶部面包屑、按钮文字、导航主标签。
- **Body** (`400`, `16px`, `1.9`): 用于正文阅读内容。正文宽度应控制在约 `65ch-75ch` 的阅读范围内。
- **Label** (`600`, `13px`, `1.4`): 用于历史会话、分组标题、状态信息和小型辅助标签。

**The One Family Rule.** 这个系统只用一套系统字体家族完成全部层级。不要额外混入展示字体、代码字体、圆体或强风格化英文字体。

## Elevation

这个系统是“平面为主，轻浮起为辅”。默认状态下，大多数界面靠浅底色、分隔线和留白组织层级。只有输入框、品牌块和少数关键按钮才允许出现轻量阴影，用来表示“可操作”和“在前景”。

### Shadow Vocabulary
- **轻浮起** (`0 2px 8px rgba(23, 28, 38, 0.04)`): 用于小按钮、轻卡片和次级浮起元素，存在感必须很低。
- **主交互浮层** (`0 12px 30px rgba(23, 28, 38, 0.06)`): 用于底部大输入框这类核心交互容器。
- **品牌块压感** (`0 6px 14px rgba(25, 32, 46, 0.15)`): 只用于左上角品牌块这种单点识别对象，不可外溢到普通组件。

**The Flat-By-Default Rule.** 如果一个元素不是当前屏幕上的关键交互容器，就默认不该有明显阴影。看起来像 2014 年 SaaS 卡片堆叠效果时，说明阴影已经过量。

## Components

### Buttons
- **Shape:** 轻圆角，不厚重。标准操作按钮使用 `14px-16px` 圆角，发送按钮允许更饱满的 `16px` 圆角。
- **Primary:** 发送按钮使用青色渐变底（`#6DCFE4` 到 `#47B9D2`），尺寸固定为 `40px * 40px`，只在单点动作中出现。
- **Hover / Focus:** 优先使用轻描边、浅阴影和颜色细微变化，不要使用弹跳或大面积色块。
- **Secondary / Ghost:** `新建会话`、快捷键块、语音按钮、加号按钮都属于白底弱边框体系，靠描边和阴影建立触感。

### Chips
- **Style:** 模型选择芯片和轻标签都使用白底或浅青底，圆角控制在 `12px` 或更高。
- **State:** 模型芯片的文字可以使用青色，但芯片底本身保持克制。不要把芯片做成高饱和胶囊。

### Cards / Containers
- **Corner Style:** 主输入容器使用大圆角 (`28px`)，普通容器使用 `16px` 左右的轻圆角。
- **Background:** 容器一律保持浅白体系，不引入大色块背景。
- **Shadow Strategy:** 只对主输入容器和极少数重点元素使用阴影，其余靠分隔线与背景层次区分。
- **Border:** 统一使用冷灰描边，边框存在感应低于内容。
- **Internal Padding:** 常用内边距落在 `12px / 18px / 26px` 这三个层级。

### Inputs / Fields
- **Style:** 输入框使用白底、弱边框、大圆角。默认高度较高，强调“开始输入”这一主要行为。
- **Focus:** 焦点态可以增加轻微青色边框或青灰光感，但不得变成高亮发光框。
- **Error / Disabled:** 当前项目尚未定义；后续扩展时也必须延续弱边框和低噪音原则。

### Navigation
- **Style:** 左侧导航是文本主导的轻列表，不是重菜单。默认态依赖留白和字重，选中态只允许使用浅白底和更稳的深色字。
- **Default / Hover / Active:** 默认态用辅助灰，hover 只做浅白底浮起，active 维持中性色系，不改成高饱和品牌色。
- **Mobile Treatment:** 在 `900px` 以下直接隐藏侧栏，优先保证主阅读区和输入区的完整性。

### Signature Component
- **会话工作台输入框:** 这是整个系统的核心签名组件。它必须像一张安静、可信、可立即开始工作的桌面，而不是一个夸张的广告组件。大圆角、浅阴影、宽留白、少量青色动作点缀，是它的固定特征。

## Do's and Don'ts

### Do:
- **Do** 把青色限制在发送按钮、模型文字、局部图标和小型状态底中，保持它的稀缺性。
- **Do** 让主标题、正文、当前会话标题始终使用稳定的深色字，优先保证阅读清晰度。
- **Do** 使用 `8px / 12px / 18px / 26px` 这种有层次的间距节奏，不要整页统一一个 padding。
- **Do** 让左侧列表像工具目录，默认安静，选中时只轻轻浮起。
- **Do** 让输入框成为页面中最明确的主交互区域，其它区域都应该主动退后。

### Don't:
- **Don't** `不要做成营销落地页风格`，不需要强烈品牌宣言、巨型视觉主图或夸张焦点区。
- **Don't** `不要做成炫技型 AI 产品`，禁止霓虹色、强渐变铺满大面积、过度动效和“未来感”堆砌。
- **Don't** `不要做成复杂后台`，禁止密集模块堆叠、厚重卡片墙和管理后台式信息负担。
- **Don't** `不要过分模仿消费聊天产品的轻佻感`，禁止娱乐化文案、轻浮插画和情绪化提示语。
- **Don't** 用高饱和青色替代正文层级。任何一段正文、历史会话标题、主要阅读内容都不应该被染成品牌色。
