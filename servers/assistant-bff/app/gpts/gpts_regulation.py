from app.chat_kernel_regulation_service import chat_with_kernel_regulation
from app.base_config import model_config
from .config_gpts import register_gpt
from .model_registry import GLM47_MODEL, QWEN35_MODEL


gpts_id = "regulationassistant"
gpt_white_list = sorted(item for item in model_config.GPTS_WHITE_LIST if str(item).strip())
gpt_owner = gpt_white_list[0] if gpt_white_list else ""
gpt_admins = gpt_white_list[1:]

register_gpt({
    gpts_id: {
        "assistant_kind": "system",
        "handler_key": "kernel_regulation",
        "owner": gpt_owner,
        "admins": gpt_admins,
        "viewers": [],
        "name": "制度问答助手",
        "logo": "./gpts/policy.svg",
        "title": "我是制度问答助手，很高兴见到你！",
        "sub_title": "我可以基于制度文档目录和制度正文，帮你查询、核对和解释公司制度问题。",
        "samples": [
            "公司请假制度是什么？一个工作15年的员工有几天年假？",
            "公司报销流程如何进行？加班打车报销标准是什么？",
            "9点10分打卡算迟到吗？",
        ],
        "system_prompt": """
你是公司内部的制度问答助手。

你的回答必须严格依据工具返回的制度目录和制度正文，不要凭经验补充公司制度，不要编造不存在的条款。

工作原则：
1. 用户问题不是公司制度相关时，明确说明你的职责范围，并引导用户提出制度类问题。
2. 当你还不能确定应查阅哪份制度文件时，先调用 `fetch_document_catalog` 查看制度目录。
3. 当目录已经足够定位到一份或多份制度文件时，再调用 `fetch_document_content` 读取对应正文。
4. 回答时优先给出直接结论，再简要说明依据来自哪些制度文件。
5. 如果目录里没有对应文件，或文件内容不足以支持结论，要明确说明“目前依据不足”，不要猜测。
6. 如果制度存在边界条件、适用范围、例外条款，回答时必须说明。
7. 文件名必须以工具结果中的文件名为准，不要自行改写文件名。

回答风格：
1. 中文回复，表达直接、克制、专业。
2. 不要展示内部推理过程。
3. 不要把工具调用过程伪装成制度结论。
""".strip(),
        "chat_function": chat_with_kernel_regulation,
        "default_model": QWEN35_MODEL["model_name"],
        "default_reasoning": False,
        "auth": {
            "type": "all"
        },
        "required_pinned": True,
        "sort": 1,
        "models": [
            {
                "id": QWEN35_MODEL["model_name"],
                "name": "Qwen 3.5",
                "description": "较快，适合制度目录检索与常规制度问答。",
                "model_name": QWEN35_MODEL["model_name"],
            },
            {
                "id": GLM47_MODEL["model_name"],
                "name": "GLM 4.7",
                "description": "更适合较长制度文本理解与多条款综合问答。",
                "model_name": GLM47_MODEL["model_name"],
            },
        ],
    }
})
