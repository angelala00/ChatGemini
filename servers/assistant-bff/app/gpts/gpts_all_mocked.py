from .config_gpts import register_gpt
from app.base_config import model_config
from .model_registry import (
    GLM47_MODEL,
    GLM5_MODEL,
    QWEN35_MODEL,
)
from app.utils.model_tool import (
    MODEL_NAME_THINKING,
)

DEFAULT_GPTASSISTANT_MODEL = GLM47_MODEL["model_name"]
GPTS_MANAGER_KEYS = sorted(item for item in model_config.GPTS_WHITE_LIST if str(item).strip())
GPTASSISTANT_OWNER = GPTS_MANAGER_KEYS[0] if GPTS_MANAGER_KEYS else ""
GPTASSISTANT_ADMINS = GPTS_MANAGER_KEYS[1:]
GPTASSISTANT_VISIBLE_MODEL_IDS = [
    QWEN35_MODEL["model_name"],
    GLM47_MODEL["model_name"],
    GLM5_MODEL["model_name"],
]

register_gpt({
    "gptassistant": {
        "assistant_kind": "system",
        "handler_key": "kernel_gptassistant",
        "owner": GPTASSISTANT_OWNER,
        "admins": GPTASSISTANT_ADMINS,
        "viewers": [],
        "name": "AI助手",
        "title": "通用对话助手",
        "sub_title": "通用对话助手111",
        "system_prompt": "You are a helpful assistant.",
        "file_upload_enabled": True,
        "upload_file_types": ["document", "image"],
        "max_active_files": 2000,
        "max_active_files_per_user": 200,
        "max_chat_attachments": 10,
        "max_chat_attachment_bytes": 31457280,
        "max_attachment_text_chars": 100000,
        "extraction_timeout_seconds": 60,
        "office_max_entries": 2000,
        "office_max_uncompressed_bytes": 104857600,
        "office_max_compression_ratio": 100,
        "default_model": DEFAULT_GPTASSISTANT_MODEL,
        "default_reasoning": True,
        "visible_model_ids": GPTASSISTANT_VISIBLE_MODEL_IDS,
        "auth": {"type": "all"},
        "sort": 0,
        "models": [
            {
                "id": QWEN35_MODEL["model_name"],
                "name": "Qwen 3.5",
                "description": "快速响应，支持原生视觉理解",
                "model_name": QWEN35_MODEL["model_name"],
            },
            {
                "id": GLM47_MODEL["model_name"],
                "name": "GLM 4.7",
                "description": "适合各种问题的分析、理解和问答",
                "model_name": GLM47_MODEL["model_name"],
            },
            {
                "id": GLM5_MODEL["model_name"],
                "name": "GLM 5",
                "description": "更强的综合能力，适合复杂问题的推理、长文本任务等",
                "model_name": GLM5_MODEL["model_name"],
                "auth": {
                    "type": "white",
                    "user": ["alice@example.com", "user4-claude@nu.com"],
                },
            },
        ]
    },
    "g3": {
        "name": "法务审查",
        "desc": "快速审查合同条款",
        "system_prompt": "",
        "model_name": MODEL_NAME_THINKING,
        "auth": {"type": "all"},
        "samples": [
            "审查合同中的潜在风险",
            "检查合同中的保密条款",
        ],
    },
    "g5": {
        "logo": "./gpts/echarts.svg",
        "name": "ECharts 画图助手",
        "desc": "用 ECharts 绘制可视化图表",
        "system_prompt": "",
        "samples": [
            "使用ECharts绘制销售占比饼图",
            "使用ECharts生成月度趋势折线图",
        ],
        "model_name": MODEL_NAME_THINKING,
        # 知识库
        # 工具
        "auth": {"type": "all"},
    },
    "g6": {
        "name": "PPT 大纲生成助手",
        "desc": "自动生成演示文稿大纲",
        "logo": "./gpts/ppt.svg",
        "system_prompt": "",
        "model_name": MODEL_NAME_THINKING,
        "auth": {"type": "all"},
        "samples": [
            "生成创业计划书PPT大纲",
            "生成项目汇报PPT大纲",
        ],
    }
})
