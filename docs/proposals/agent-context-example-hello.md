# 从一句“你好”看智能体上下文

这份文档只讨论一个具体案例，不讨论完整方案。

## 场景

管理员创建了一个智能体：

```text
智能体名称：差旅报销助手
```

管理员填写的智能体系统提示词：

```text
你是公司的差旅报销助手。
你负责回答员工关于出差、住宿标准和费用报销的问题。
回答要准确、简洁。
```

管理员为智能体上传了一份知识文档：

```text
《员工差旅管理办法.pdf》
```

管理员将智能体发布给员工张伟。

张伟第一次打开这个智能体，没有上传任何文件，只发送：

```text
你好
```

智能体回答：

```text
您好，我看到您上传了《员工差旅管理办法.pdf》，请问有什么需要我为您解答？
```

这就是我们现在要解决的问题。

---

## 当前系统实际做了什么

用户界面看起来只是：

```text
张伟：你好
```

但是后台没有只把“你好”发送给模型。

### 第一步：找到智能体的知识文件

后台发现“差旅报销助手”拥有一份全局知识文件：

```json
{
  "file_id": "file-001",
  "file_name": "员工差旅管理办法.pdf",
  "purpose": "assistant_knowledge",
  "owner": "差旅报销助手"
}
```

这份文件是管理员上传给智能体的，不是张伟上传的。

### 第二步：把知识文件当成当前请求附件

后台将本轮可用文件组织为：

```json
{
  "file_ids": ["file-001"]
}
```

此时系统没有继续保留“智能体知识”和“用户附件”的语义区别。

对后续聊天内核来说，它只知道：

```text
当前请求存在一个可用文件。
```

### 第三步：修改系统提示词

后台在管理员填写的智能体系统提示词后，追加附件规则。

最终系统提示词近似为：

```text
你是公司的差旅报销助手。
你负责回答员工关于出差、住宿标准和费用报销的问题。
回答要准确、简洁。

This assistant may have global knowledge files and files attached to the current request.
When the question may depend on those materials, use document_list and document_read_text before answering.
Do not guess file contents that you have not read.

Attachment handling policy:
- This request includes uploaded attachments.
- If the answer depends on attachment contents, call document_list or document_read_text first.
- For documents, use document_read_text before answering detailed content questions.
```

模型从系统提示词中获得了一个强烈信号：

```text
当前请求存在上传附件。
```

### 第四步：修改用户消息

后台没有保留张伟的原始消息：

```text
你好
```

而是将它修改成：

```text
你好

[附件清单]
本轮请求附带了附件。
如果你需要附件内容，先调用附件工具，不要臆测文件内容。
可用文档工具：document_list、document_read_text。
- name: 员工差旅管理办法.pdf | type: document | file_id: file-001
```

这是整个问题中最关键的一步。

### 第五步：最终发送给模型

忽略部分技术字段后，模型实际收到的请求近似为：

```json
{
  "model": "company-llm",
  "messages": [
    {
      "role": "system",
      "content": "你是公司的差旅报销助手……\n\nThis request includes uploaded attachments……"
    },
    {
      "role": "user",
      "content": "你好\n\n[附件清单]\n本轮请求附带了附件。\n- name: 员工差旅管理办法.pdf | type: document | file_id: file-001"
    }
  ],
  "tools": [
    {
      "name": "document_list"
    },
    {
      "name": "document_read_text"
    }
  ]
}
```

所以，从模型视角看，用户并不是只说了：

```text
你好
```

而是说了：

```text
你好。另外，本轮请求附带了《员工差旅管理办法.pdf》。
```

因此模型回答：

```text
我看到您上传了《员工差旅管理办法.pdf》……
```

并不意外。

---

## 我建议先讨论的改法

这一轮先不讨论知识检索、向量库、复杂工具和多轮附件。

只讨论一个改动：

> 智能体全局知识仍然可以作为模型可用能力，但不要伪装成用户本轮上传的附件，也不要拼进用户消息。

### 修改后，模型收到什么

平台全局系统提示词：

```text
你正在作为一个已配置知识与工具的智能体工作。

智能体知识属于你的后台能力，不是当前用户上传的附件。
不要因为后台知识存在就主动介绍知识、文件或工具。
仅在回答用户问题需要时使用相关知识。
对于普通问候，直接自然回应。
```

智能体系统提示词：

```text
你是公司的差旅报销助手。
你负责回答员工关于出差、住宿标准和费用报销的问题。
回答要准确、简洁。
```

用户消息保持原样：

```text
你好
```

知识查询工具仍然可以提供：

```json
{
  "name": "knowledge_search",
  "description": "当用户询问公司差旅或报销制度时，查询差旅报销助手的后台知识。普通问候不需要调用。"
}
```

最终请求近似为：

```json
{
  "model": "company-llm",
  "messages": [
    {
      "role": "system",
      "content": "[平台全局系统提示词]\n\n[智能体系统提示词]"
    },
    {
      "role": "user",
      "content": "你好"
    }
  ],
  "tools": [
    {
      "name": "knowledge_search",
      "description": "当用户询问公司差旅或报销制度时，查询后台知识。普通问候不需要调用。"
    }
  ]
}
```

模型此时最自然的回答是：

```text
你好！有什么差旅或报销方面的问题需要帮助？
```

---

## 现在只需要讨论三个问题

### 问题一

智能体全局知识是否应该被描述为：

```text
智能体自己拥有的后台知识
```

而不是：

```text
用户本轮上传的附件
```

### 问题二

用户说“你好”时，是否应保证发送给模型的用户消息仍然只是：

```text
你好
```

### 问题三

智能体拥有知识文档时，模型是否需要提前知道具体文件名：

```text
员工差旅管理办法.pdf
```

还是只需要知道自己可以在必要时调用：

```text
knowledge_search
```

我们可以先围绕这三个问题讨论，不扩展到其他场景。
