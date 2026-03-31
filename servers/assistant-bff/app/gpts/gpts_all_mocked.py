from .config_gpts import register_gpt
from .model_registry import (
    GLM47_MODEL,
    GLM5_MODEL,
    QWEN35_MODEL,
)
from app.utils.model_tool import (
    MODEL_NAME_THINKING,
)

DEFAULT_GPTASSISTANT_MODEL = GLM47_MODEL["model_name"]

register_gpt({
    "gptassistant": {
        "name": "AI助手",
        "title": "通用对话助手",
        "sub_title": "通用对话助手111",
        "system_prompt": "You are a helpful assistant.",
        "file_upload_enabled": True,
        "upload_file_types": ["document", "image"],
        "default_model": DEFAULT_GPTASSISTANT_MODEL,
        "default_reasoning": True,
        "auth": {"type": "all"},
        "sort": 0,
        "models": [
            {
                "id": QWEN35_MODEL["model_name"],
                "name": "Qwen 3.5",
                "description": "快速响应，支持原生视觉理解",
                "model_name": QWEN35_MODEL["model_name"],
                "supports_reasoning": QWEN35_MODEL["supports_reasoning"],
                "supports_native_image_input": QWEN35_MODEL["supports_native_image_input"],
                "compat": QWEN35_MODEL["compat"],
            },
            {
                "id": GLM47_MODEL["model_name"],
                "name": "GLM 4.7",
                "description": "适合各种问题的分析、理解和问答",
                "model_name": GLM47_MODEL["model_name"],
                "supports_reasoning": GLM47_MODEL["supports_reasoning"],
                "supports_native_image_input": GLM47_MODEL["supports_native_image_input"],
                "compat": GLM47_MODEL["compat"],
            },
            {
                "id": GLM5_MODEL["model_name"],
                "name": "GLM 5",
                "description": "更强的综合能力，适合复杂问题的推理、长文本任务等",
                "model_name": GLM5_MODEL["model_name"],
                "supports_reasoning": GLM5_MODEL["supports_reasoning"],
                "supports_native_image_input": GLM5_MODEL["supports_native_image_input"],
                "compat": GLM5_MODEL["compat"],
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
