import asyncio
import json
import os
import sys
from app.utils.tool_register import get_tools
sys.path.append(os.getcwd())
from app.utils.model_tool import MODEL_NAME_INSTRUCT
from app.utils.tool_register import get_tools
from app.chat_service import chat_with_gpt
from app.utils.model_tool import MODEL_NAME_INSTRUCT, MODEL_NAME_THINKING
from app.utils.tool_register import get_tools
import app.gpts.gpts_legal

import app.utils.tools

print(f"DEBUG: 当前注册的工具列表: {get_tools('default')}")

from dotenv import load_dotenv

load_dotenv()


async def test_flow():
    # --- 配置测试参数 ---

    query = ("原能源局副局长周某退休两个月后，受聘于其在任期间曾多次审批通过的某能源集团，担任‘高级顾问’，年薪 120 万元。周某在任期间曾利用职权为该集团项目审批提供便利。")


    conversation_id = "test_debug_001"


    system_prompt = "你是一个智能助手，可以调用工具帮助用户解决问题。"



    model_name = MODEL_NAME_INSTRUCT

    gid = "legal_case_assistant"
    print(f"====== 开始测试: {query} (Model: {model_name}) ======")


    generator = chat_with_gpt(
        query=query,
        conversation_id=conversation_id,
        system_prompt=system_prompt,
        model_name=model_name,
        gid=gid,
        file_ids=None
    )


    full_response = ""
    try:
        async for event_str in generator:

            clean_str = event_str.replace("data: ", "").strip()
            if not clean_str:
                continue

            try:
                data = json.loads(clean_str)
                answer = data.get("answer", "")


                print(f"[Stream]: {answer}")

                full_response += str(answer)


                if "<step>" in answer or "调用工具" in answer:
                    print(f"\n>>>  检测到 LLM 决策点: 正在尝试调用工具...\n")

            except json.JSONDecodeError:
                print(f"[Raw]: {clean_str}")

    except Exception as e:
        print(f"\n 测试过程中发生错误: {e}")
        import traceback
        traceback.print_exc()

    print("\n====== 测试结束 ======")


if __name__ == "__main__":
    asyncio.run(test_flow())