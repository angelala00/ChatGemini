import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { asBlob } from 'html-docx-js-typescript';

const HTML_CSS = `
    h1, h2, h3, h4 { margin: 0.6em 0; font-family: "Microsoft YaHei" }
    p, li { line-height: 1.65; }
    pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow: auto;}
    table { border-collapse: collapse; }
    th, td { border: 1px solid #d0d7de; padding: 6px, 10px; }
    ol, ul { padding-left: 2em; }
    blockquote { margin: 1em 0; padding: 0.8em 1em; border-left: 4px solid #d0d7de; background-color: #f6f8fa; border-radius: 4px; color: #24292e;}
`;

export const exportMdAsDocx = async (
    markdown: string,
    filename: string,
) => {
    const htmlBody = await unified()
        .use(remarkParse) // 解析为 Markdown AST
        .use(remarkGfm) // 扩展 Github 风格 Markdown 标签
        .use(remarkRehype) // 转换为 HTML AST
        .use(rehypeSanitize) // 过滤不安全内容
        .use(rehypeStringify) // 转换为字符串
        .process(markdown)
    const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="uft-8">
            <style>${HTML_CSS}</style>
          </head>
          <body>${htmlBody}</body>
        </html>
    `;

    const docxArrayBuffer = await asBlob(html);
    const docxBolb = new Blob([docxArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const _ = document.createElement('a');
    _.href = URL.createObjectURL(docxBolb);
    _.download = filename;
    _.click();
    URL.revokeObjectURL(_.href);
};