
from typing import List
from .config_gpts import register_gpt
from app.base_config import model_config
from app.utils.tool_register import register_tool
from app.utils.case_rag import case_rag_engine
from ..utils.model_tool import MODEL_NAME_THINKING, MODEL_NAME_INSTRUCT

gpts_id = "legal_case_assistant"


register_gpt({gpts_id: {
    "name": "纪检相似案件查询助手",
    "logo": "./gpts/legal.svg",
    "title": "我是 纪检案件助手, 您的专业案列库！",
    "sub_title": "我可以帮您检索历史相似案件、分析判罚标准，请描述案情...",
    "samples": [
        "银行经理利用职务之便收受贿赂50万，一般怎么判？",
        "查询关于挪用公款且数额巨大的历史相似案例。",
        "国企员工违规经商办企业的纪律处分依据是什么？"
    ],
    "auth": {
            "type": "all"
        },
    "system_prompt": """
    你是一个专业的纪检监察案件分析助手。
    
    【核心工具】
    你拥有 `search_legal_cases` 工具，用于检索真实的历史判例。
    
    【强制执行逻辑】
    1. 当用户询问“怎么判”、“量刑标准”或涉及具体金额的案件时，**严禁仅凭理论回答**。
    2. **你必须调用工具**去检索与用户描述金额相近（如本案中的23万元左右）的真实案例。
    3. 你的回答结构必须包含：
       - 理论计算（如总金额计算）。
       - **真实案例佐证**（这是必须的，来自工具调用）。
       - 综合分析。
    
    【示例】
    用户：收了23万怎么判？
    错误回答：根据刑法判3-10年。（未调用工具）
    正确行为：调用工具搜索 "受贿23万 判例" -> 获取结果 -> 回答"根据刑法判3-10年，参考某某真实案例，判了3年6个月..."。
    """,
    "model_name": MODEL_NAME_INSTRUCT
}})

@register_tool(gpts_id)
async def search_legal_cases(
        query: (str, "案件情形描述，例如''银行经理受贿'或'挪用公款'", True)
) -> str:
    """
    【必须调用】用于检索最新的、具体的法院判例详情。
    注意：即使用户询问的是通过计算可得出的金额（如5万+10万），模型也严禁直接回答，必须调用此工具去检索该总金额在近期司法实践中的具体量刑案例，以获取“案号”和“裁判日期”作为佐证。
    """
    try:
        print(f" [Tool Call] 正在检索相似案例: {query}")
        # 调用 RAG
        results = case_rag_engine.search_similar_cases(query)

        if not results:
            return "未找到相关案例。"
        return str(results)
    except Exception as e:
        print(f"检索出错: {e}")
        return f"检索过程中发生错误: {str(e)}"
