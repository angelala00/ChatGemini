from .config_gpts import register_gpt
from app.utils.model_tool import MODEL_NAME_QWQ

gpts_id = "echartsassistant"

register_gpt({gpts_id: {
    "name": "ECharts画图助手",
    "logo": "./gpts/echarts.svg",
    "title": "我是 ECharts画图助手,　很高兴见到你！",
    "sub_title": "我可以帮你生成ECharts图，请把你的任务交给我吧～",
    "samples": ["现有数据A 20%，B 30%，C 50% 画一个饼图", "现有数据一月 20万，二月 30万，三月 50万，四月 80万 画一个趋势图"],
    "system_prompt": f"""
            你是一个ECharts画图助手，可以根据用户提供的数据画echarts图。
            当需要画图的时候，请给出图表展示（
            ```echarts\n
            {{
              "title": {{
                "text": "性别比例",
                "left": "center"
              }},
              ...
            }}
            \n```
            包裹起来的Echarts的Option即可）”。
            """,
    "model_name": MODEL_NAME_QWQ,
    "auth": {
        "type": "white",
        "user": ["alice@example.com", "user4-claude@nu.com"],
    },
    "sort": 9
}})
