from .config_gpts import register_gpt
from app.utils.model_tool import MODEL_NAME_VL, MODEL_NAME_INSTRUCT, MODEL_NAME_THINKING

register_gpt({
    "gptassistant": {
        "name": "GPT Assistant",
        "title": "通用对话助手",
        "sub_title": "通用对话助手111",
        "system_prompt": "You are a helpful assistant.",
        "file_upload_enabled": True,
        "default_model": "auto",
        "auth": {"type": "all"},
        "sort": 0,
        "models": [
            {
                "id": "auto",
                "name": "Auto",
                "description": "自动选择最合适的模型",
            },
            {
                "id": MODEL_NAME_THINKING,
                "name": "Deepseek(思考)",
                "description": "提供深度思考与分析输出",
            },
            {
                "id": MODEL_NAME_INSTRUCT,
                "name": "Qwen(立即回答)",
                "description": "快速响应的即时回答模式",
            },
            {
                "id": MODEL_NAME_VL,
                "name": "Qwen-VL(多模态)",
                "description": "支持图像与文本输入，可进行看图问答、内容理解与多模态分析",
            },
        ]
    },
    "g3": {
        "name": "法务审查",
        "desc": "快速审查合同条款",
        "system_prompt": "",
        "model_name": "auto",
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
        "model_name": "auto",
        # 知识库
        # 工具
        "auth": {"type": "all"},
    },
    "g6": {
        "name": "PPT 大纲生成助手",
        "desc": "自动生成演示文稿大纲",
        "logo": "./gpts/ppt.svg",
        "system_prompt": "",
        "model_name": "auto",
        "auth": {"type": "all"},
        "samples": [
            "生成创业计划书PPT大纲",
            "生成项目汇报PPT大纲",
        ],
    },
    "regulationassistant": {
        "name": "制度问答助手",
        "desc": "解答制度相关问题",
        "logo": "./gpts/policy.svg",
        "system_prompt": "",
        "model_name": "auto",
        "auth": {"type": "all"},
        "samples": [
            "公司请假制度是什么？",
            "公司报销流程如何进行？",
        ],
    },
})
