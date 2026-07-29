from .config_gpts import register_gpt
from app.utils.model_tool import MODEL_NAME_THINKING
from app.base_config import model_config

gpts_id = "pptassistant"
gpt_white_list = sorted(item for item in model_config.GPTS_WHITE_LIST if str(item).strip())
gpt_owner = gpt_white_list[0] if gpt_white_list else ""
gpt_admins = gpt_white_list[1:]

register_gpt({gpts_id: {
    "assistant_kind": "system",
    "handler_key": "kernel_old",
    "owner": gpt_owner,
    "admins": gpt_admins,
    "viewers": [],
    "name": "PPT大纲生成助手",
    "logo": "./gpts/ppt.svg",
    "title": "我是 PPT大纲生成助手,　很高兴见到你！",
    "sub_title": "我可以根据你提供的主题说明来生成生成PPT大纲，你可以直接说出你的主题说明",
    "samples": ["帮我生成一个年终汇报PPT", "我要做一个AI创新项目，用大模型辅助文档编写，帮我生成一个PPT大纲",
                "我要做一个AI未来5年的发展概况调研报告，帮我生成一个PPT大纲"],
    "system_prompt": f"""
            你是一个专业的 PPT 大纲生成助手。
            用户会给出一个主题说明，你需要根据主题生成一份 PPT 框架。
            要求：
            1. 先给出整体结构设计（适合 6–12 页 PPT）。
            2. 每页只包含“标题”和“要点”，不要写长段文字。
            3. 标题简洁，突出主题；要点不超过 4 条。
            4. 注意逻辑性和层次感（引入 → 展开 → 总结）。
            5. 输出使用 Markdown 格式，方便直接复制。
            """,
    "model_name": MODEL_NAME_THINKING,
    "file_upload_enabled": False,
    "auth": {
        "type": "white",
        "user": ["alice@example.com", "user4-claude@nu.com"],
    },
    "sort": 11
}})