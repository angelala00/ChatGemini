import os
import imghdr

from app.utils.model_tool import convert_image_message, MODEL_NAME_VL
from app.utils import text_extractor


async def extract_text_from_file(file_path: str, file_type: str):
    if not os.path.exists(file_path):
        raise FileNotFoundError("FilePath not found")

    # if file_type == '.xlsx':
    #     result = parse_excel(file_path)
    #     return {"text": result}
    # elif file_type == '.docx' or file_type == '.doc':
    #     result = parse_word(file_path)
    #     return {"text": result}
    # elif file_type == '.pdf':
    #     result = parse_pdf(file_path)
    #     return {"text": result}
    # else:
    #     raise Exception(f"UnSupport file type:{file_type}")

    if imghdr.what(file_path) is not None:
        from app.chat_service import _ask_once_stream

        query = "提取图片信息"
        messages = [{"role": "user", "content": convert_image_message(file_path, query)}]
        # print(f"messages:{messages}")
        text_content = ""
        async for event in _ask_once_stream(messages, None, MODEL_NAME_VL):
            if event.get("type") == "text.delta":
                text_content += event.get("data")["text"]
        return text_content
    else:
        text = text_extractor.extract_text(file_path, file_type)
    return text
