from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MappedChatError:
    code: str
    user_message: str


def map_chat_v2_error(raw_message: str | None) -> MappedChatError:
    message = (raw_message or "").strip()
    lowered = message.lower()

    if _looks_like_context_overflow(lowered):
        return MappedChatError(
            code="CONTEXT_TOO_LONG",
            user_message="当前输入内容过长，请减少文件内容、缩短问题，或开启新会话后重试。",
        )

    if _looks_like_file_content_too_long(lowered):
        return MappedChatError(
            code="FILE_CONTENT_TOO_LONG",
            user_message="附件文本内容过长，请减少文件内容、拆分提问，或更换更精简的文件后重试。",
        )

    if _looks_like_too_many_files(lowered):
        return MappedChatError(
            code="TOO_MANY_FILES",
            user_message="本次上传的文件总内容过长，请减少文件数量或拆分提问后重试。",
        )

    if "attachment tools unsupported" in lowered:
        return MappedChatError(
            code="ATTACHMENT_TOOLS_UNSUPPORTED",
            user_message="当前模型不支持读取附件，请切换到支持工具调用的模型后重试。",
        )

    if _looks_like_file_parse_failure(lowered):
        return MappedChatError(
            code="FILE_PARSE_FAILED",
            user_message="附件内容处理失败，请检查文件是否损坏，或更换文件后重试。",
        )

    return MappedChatError(
        code="MODEL_REQUEST_FAILED",
        user_message="本次请求处理失败，请稍后重试。",
    )


def _looks_like_context_overflow(lowered: str) -> bool:
    patterns = (
        "context length exceeded",
        "context budget exceeded",
        "maximum context length",
        "context window",
        "too many tokens",
        "token limit",
        "prompt is too long",
        "input is too long",
        "maximum number of tokens",
        "max_tokens_per_request",
        "context overflow",
        "exceeded context window",
        "request too large",
    )
    return any(pattern in lowered for pattern in patterns)


def _looks_like_file_parse_failure(lowered: str) -> bool:
    patterns = (
        "preprocessing failed",
        "preprocessing timed out",
        "returned empty text",
        "image preprocessing",
        "extract failed",
        "parse failed",
        "file not found",
        "filepath not found",
        "unsupported",
        "timeout",
    )
    return any(pattern in lowered for pattern in patterns)


def _looks_like_file_content_too_long(lowered: str) -> bool:
    patterns = (
        "content exceeds preload budget",
        "text content too long",
        "file content too long",
        "document content exceeds",
        "image content exceeds",
    )
    return any(pattern in lowered for pattern in patterns)


def _looks_like_too_many_files(lowered: str) -> bool:
    patterns = (
        "too many files exceed preload budget",
        "too many files",
    )
    return any(pattern in lowered for pattern in patterns)
