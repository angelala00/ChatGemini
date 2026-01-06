import json
import os
import chromadb
from chromadb.utils import embedding_functions
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

# 1. 定义路径
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "chromadb_store")
JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "cases.json")
from chromadb.utils import embedding_functions

emb_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="BAAI/bge-large-zh-v1.5"
)

class CaseRAG:
    def __init__(self):
        print(f" 正在初始化 RAG...")
        self.client = chromadb.PersistentClient(path=DB_DIR)
        self.collection = self.client.get_or_create_collection(
            name="legal_cases",
            embedding_function=emb_fn  )
        self._sync_data()

    def _sync_data(self):
        """
        同步逻辑：
        1. 读取最新的 json 文件
        2. 对比 json 数量和数据库数量
        3. 如果数量不一致，或者强制更新，则重新录入
        """
        if not os.path.exists(JSON_PATH):
            print(f" 错误：找不到数据文件 {JSON_PATH}")
            return

        with open(JSON_PATH, "r", encoding="utf-8") as f:
            cases = json.load(f)

        json_count = len(cases)
        db_count = self.collection.count()

        print(f" 状态检查 -> JSON文件: {json_count}条 | 数据库: {db_count}条")
        if json_count != db_count:
            print(" 检测到数据变动，正在重新构建向量库...")
            self._reload_all_data(cases)
        else:
            print(" 数据已是最新，跳过加载。")

    def _reload_all_data(self, cases):
        existing_ids = self.collection.get()['ids']
        if existing_ids:
            self.collection.delete(ids=existing_ids)
        ids = []
        documents = []
        metadatas = []

        for case in cases:
            ids.append(str(case["id"]))
            doc_text = f"案件:{case['case_title']}\n标签:{','.join(case['tags'])}\n案情:{case['scenario']}"
            documents.append(doc_text)
            # 存元数据
            metadatas.append({
                "title": case["case_title"],
                "verdict": case["verdict"],
                "law": case["law_citation"],
                "analysis": case["analysis"],
                # 存一个简短的摘要防止元数据太大
                "scenario": case["scenario"],
            })
        batch_size = 100
        total = len(ids)
        for i in range(0, total, batch_size):
            end = min(i + batch_size, total)
            self.collection.add(
                ids=ids[i:end],
                documents=documents[i:end],
                metadatas=metadatas[i:end]
            )

        print(f" 成功更新 {total} 条案例到向量数据库！")

    def search_similar_cases(self, query: str, n_results: int = 2):
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=n_results
                #where=where_filter
            )

            if not results['documents'] or not results['documents'][0]:
                return "未找到相似案例。"

            formatted_results = []
            for i in range(len(results['documents'][0])):
                meta = results['metadatas'][0][i]
                formatted_str = (
                    f"【相似案例 {i + 1}】\n"
                    f"标题：{meta['title']}\n"
                    f"判决：{meta['verdict']}\n"
                    f"引用法律：{meta['law']}\n"
                    f"案情分析：{meta['analysis']}\n"
                    f"主要案情：{meta.get('scenario', '暂无详情')}\n"
                )
                formatted_results.append(formatted_str)

            return "\n\n".join(formatted_results)
        except Exception as e:
            return f"检索出错: {str(e)}"



case_rag_engine = CaseRAG()