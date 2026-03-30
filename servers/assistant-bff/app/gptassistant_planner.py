from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

PlannerIntent = Literal["metadata", "content", "summarize", "compare", "unknown"]
DocumentStrategy = Literal["tool_only", "preload_text", "manifest_only"]
ImageStrategy = Literal["tool_only", "preprocess_text", "manifest_only"]

DEFAULT_DOCUMENT_PRELOAD_MAX_CHARS = 80000
DEFAULT_IMAGE_PRELOAD_MAX_CHARS = 20000

_METADATA_PATTERNS = [
    r"上传了几个文件",
    r"上传了多少个文件",
    r"上传了几个附件",
    r"上传了多少个附件",
    r"我上传了几个文件",
    r"我上传了多少个文件",
    r"附件列表",
    r"列出附件",
    r"有哪些附件",
    r"有哪些文件",
    r"文件名",
    r"文件列表",
    r"how many files",
    r"how many attachments",
    r"what files",
    r"list attachments",
    r"list files",
]

_SUMMARIZE_PATTERNS = [
    r"总结",
    r"概述",
    r"摘要",
    r"主要内容",
    r"summar",
    r"overview",
]

_COMPARE_PATTERNS = [
    r"比较",
    r"对比",
    r"区别",
    r"差异",
    r"不同",
    r"compare",
    r"difference",
    r"diff",
]


@dataclass(frozen=True)
class ExecutionPlan:
    intent: PlannerIntent
    expose_attachment_tools: bool
    include_attachment_tool_guidance: bool
    document_strategy: DocumentStrategy
    non_native_image_strategy: ImageStrategy
    attach_native_images: bool = True
    document_preload_max_chars: int = DEFAULT_DOCUMENT_PRELOAD_MAX_CHARS
    image_preload_max_chars: int = DEFAULT_IMAGE_PRELOAD_MAX_CHARS


@dataclass(frozen=True)
class PlannerRuntimeCapabilities:
    supports_tool_result_continuation: bool = True


def classify_user_intent(query: str) -> PlannerIntent:
    normalized = (query or "").strip().lower()
    if not normalized:
        return "unknown"
    if any(re.search(pattern, normalized) for pattern in _METADATA_PATTERNS):
        return "metadata"
    if any(re.search(pattern, normalized) for pattern in _COMPARE_PATTERNS):
        return "compare"
    if any(re.search(pattern, normalized) for pattern in _SUMMARIZE_PATTERNS):
        return "summarize"
    return "content"


def build_execution_plan(
    *,
    query: str,
    has_attachments: bool,
    runtime_capabilities: PlannerRuntimeCapabilities | None = None,
) -> ExecutionPlan:
    if not has_attachments:
        return ExecutionPlan(
            intent="unknown",
            expose_attachment_tools=False,
            include_attachment_tool_guidance=False,
            document_strategy="tool_only",
            non_native_image_strategy="tool_only",
            attach_native_images=True,
        )

    intent = classify_user_intent(query)
    runtime_capabilities = runtime_capabilities or PlannerRuntimeCapabilities()
    supports_attachment_tools = runtime_capabilities.supports_tool_result_continuation

    if intent == "metadata":
        return ExecutionPlan(
            intent=intent,
            expose_attachment_tools=False,
            include_attachment_tool_guidance=False,
            document_strategy="manifest_only",
            non_native_image_strategy="manifest_only",
            attach_native_images=False,
        )

    if supports_attachment_tools:
        return ExecutionPlan(
            intent=intent,
            expose_attachment_tools=True,
            include_attachment_tool_guidance=True,
            document_strategy="tool_only",
            non_native_image_strategy="tool_only",
            attach_native_images=True,
        )

    return ExecutionPlan(
        intent=intent,
        expose_attachment_tools=False,
        include_attachment_tool_guidance=False,
        document_strategy="preload_text",
        non_native_image_strategy="preprocess_text",
        attach_native_images=True,
    )
