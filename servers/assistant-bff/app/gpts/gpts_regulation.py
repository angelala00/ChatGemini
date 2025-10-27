from .config_gpts import register_gpt
from app.utils.tool_register import register_tool
from typing import List
from app.base_config import model_config
from app.utils.model_tool import MODEL_NAME_QWQ

gpts_id = "regulationassistant"

register_gpt({gpts_id: {
    "name": "制度问答助手",
    "logo": "./gpts/policy.svg",
    "title": "我是 制度问答助手,　很高兴见到你！",
    "sub_title": "我可以帮你查询制度相关的问题，请把你的任务交给我吧～",
    "samples": ["公司请假制度是什么？一个工作15年的员工有几天年假？", "公司报销流程如何进行？加班打车报销标准什是什么？",
                "9点10分打卡迟到么？"],
    "system_prompt": f"""
            你是一个制度问答助手，可以解答公司内部制度相关的问题，依据的是工具调用返回的信息。请根据用户实际需求，判断是否需要相关工具查询具体信息。
            【工具定义】
                １、工具名称：fetch_document_catalog。
                    描述：获取全部制度文档目录信息。读取指定文档前可以先检索目录来判断应该查询哪个具体的文档。
                    参数：无。
                ２、工具名称：fetch_document_content。
                    描述：获取指定制度文档内容。
                    参数：file_names(字符串数组)：需要获取的制度文件名称列表。
            【执行规则】
                1、当用户的请求需要调用工具来执行特定操作时，请返回一个严格符合Markdown的JSON格式的字符串，不要附加其它任何文字或说明。
                2、返回 JSON 格式示例（如工具无参数，arguments可为空）:
                    ```json{{
                        "tool_call": {{
                            "name":"",
                            "arguments":{{
                                "参数1":"值1",
                                "参数2":["",""]
                            }}
                        }}
                    }}
                    ```
                3、如果你不确定应该调用哪个函数，或者请求描述不够明确，请先向用户提问以获取更多细节，而不要直接返回错误或者随意猜测。
                4、所有JSON中的字段名称及字符串值都必须使用双引号。
                5、当用户的请求不涉及工具调用时，请直接以普通文本回复，不返回JSON格式。
                6、思考限定在100字以内。
            请严格按照以上规则执行，确保后续接口能正确解析你的返回结果。
            【其它建议】
                1、分析用户的问题是否为公司内制度相关的问题。如果不是，引导用户问具体的制度方面的问题。如果是，准备工具调用。
                2、工具调用，查询制度文档目录。
                3、结合文档目录分析用户的问题，进行相关解答。如果需要进一步查询某一个或者某几个具体的制度文档，提取文档文件名称，准备工具调用。
                4、工具调用，查询指定文档内容。
                5、结合文档内容分析用户的问题，进行相关解答。
                6、回答口气温和，例如“请问还有其他问题需要我的帮助吗？”。
                7、不要假设和猜测。
                8、思考限定在100字以内。
            """,
    "model_name": MODEL_NAME_QWQ,
    "auth": {
        "type": "all"
    },
    "sort": 1
}})


@register_tool(gpts_id)
async def fetch_document_catalog() -> str:
    """
    获取全部制度文档目录信息。读取指定文档前可以先检索目录来判断应该查询哪个具体的文档。
    """
    with open(f"{model_config.FILE_BASE}/{gpts_id}/document_catalog.json", 'r', encoding='utf-8') as f:
        document_catalog = f.read()

    return document_catalog


@register_tool(gpts_id)
async def fetch_document_content(
        file_names: (List[str], '需要获取的制度文件名称列表', True)
) -> str:
    """
    获取指定制度文档内容。
    """
    try:
        text = ""
        for fileName in file_names:
            file_path = f"{model_config.FILE_BASE}/{gpts_id}/pdf/{fileName}"
            text = text + fileName + "的内容:\n"
            raw = textract.process(file_path, extension=".pdf")
            text += raw.decode('utf-8') + "\n"
            text = text.encode('utf-8', 'ignore').decode('utf-8')
        return text.strip()[:10000]  # 限制最大返回长度
    except FileNotFoundError:
        return f"错误：文件 {file_path} 不存在"
    except Exception as e:
        return f"发生错误：{str(e)}"

