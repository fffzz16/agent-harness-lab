import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';


import * as z from 'zod/v4';

const promptTemplate = `
Prompt Name:
summarize_document

Arguments:
documentId

返回：
请总结指定文档，包含：
1. 核心内容
2. 关键技术
3. 重要结论
4. 待解决问题
`;

function createServer(): McpServer {
    const server = new McpServer({
        name: 'knowledge-prompt-server',
        version: '0.1.0'
    });

    // 2. 使用 registerPrompt 的正确签名
    server.registerPrompt(
        'summarize_document', 
        {
            // name
            description: 'Summarize a document by its ID', // description
            
            argsSchema: z.object({
                documentId: z.string().describe(
                    'The ID of the document to summarize'
                ),
                documentContent: z.string()
            })
        },

        // 4. 回调函数必须解构接收参数
        async ({ documentId, documentContent }) => {
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            // 5. 将真实的 documentId 和模板内容拼接进 Prompt
                            text: `
                                请总结以下文档。

                                文档ID：${documentId}

                                文档内容：
                                ${documentContent}

                                总结要求：
                                1. 核心内容
                                2. 关键技术
                                3. 重要结论
                                4. 待解决问题
                            `
                        }
                    }
                ]
            };
        }
    );

    return server;
}

serveStdio(createServer);
console.error('Knowledge Prompt Server started');