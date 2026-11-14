import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod/v4';

import type {
    ResourceTemplateType,
} from '@modelcontextprotocol/client';

// =====================================================
// 0. 数据契约
// =====================================================
const SearchResultSchema = z.object({
    found: z.boolean(),
    documentId: z.string(),
    path: z.string()
});

type SearchResult = z.infer<typeof SearchResultSchema>;

interface ModelMessage {
    role: 'user' | 'assistant';
    content: string;
}

// =====================================================
// 1. 基础配置
// =====================================================

// 获取当前 multi-client.ts 所在目录
// 不依赖终端从哪个目录启动程序
const currentDir = path.dirname(
    fileURLToPath(import.meta.url)
);

// Server 所在目录
const serversDir = path.join(currentDir, 'servers');

// =====================================================
// 2. 通用工具函数
// =====================================================

function getErrorMessage(error: unknown): string {

    return error instanceof Error
        ? error.message
        : String(error);
}

// 从 MCP Tool Result 中提取文本
function getTextContent(
    content: Array<{ type: string; text?: string }>
): string {

    const textBlock = content.find(
        item => item.type === 'text' &&
                typeof item.text === 'string'
    );

    if (!textBlock || typeof textBlock.text !== 'string') {
        throw new Error('MCP 返回结果中不存在文本内容');
    }

    return textBlock.text;
}


async function listAllTemplates(client: Client): Promise<ResourceTemplateType[]> {
  const all: ResourceTemplateType[] = []
  let cursor: string | undefined
  do {
    const ret = await client.listResourceTemplates(cursor ? { cursor } : undefined)
    all.push(...ret.resourceTemplates)
    cursor = ret.nextCursor
  } while (cursor)
  return all
}

// =====================================================
// 模拟 Model Adapter
// =====================================================

async function callModel(messages: ModelMessage[]): Promise<string> {
    
    if(messages.length === 0) {
        throw new Error('Model Messages 不能为空');
    }

    const promptText = messages.map(message => message.content).join('\n\n');
    if(!promptText.trim()) {
        throw new Error('Prompt 内容为空')
    }

    const documentId = promptText.match(
        /文档ID：\s*([^\r\n]+)/
    )?.[1].trim();
    const contentMatch = promptText.match(
        /文档内容：([\s\S]*?)总结要求：/
    );
    const documentContent = contentMatch?.[1]?.trim();
    if(!documentContent){
        throw new Error('Model Adapter 未获取到文档内容');
    }

    // 以下只是规则模拟，不是真实的大模型总结
    const lines = documentContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const headings = lines.filter(
        line => /^#{1,6}\s/.test(line)
    );

    const body = lines.filter(
        line => !/^#{1,6}\s/.test(line)
    );

    const preview = body
        .slice(0, 5)
        .join('\n');

    return `
========== Mock Model Result ==========

文档 ID：${documentId ?? 'Unknown'}

核心内容：
${preview || '没有提取到正文内容'}

关键标题：
${headings.join('\n') || '没有识别到 Markdown 标题'}

说明：
当前为模拟模型输出，仅用于验证 Host 到 Model Adapter 的数据传递。
后续接入真实模型 API 后，由模型完成语义总结。

=======================================
`;

}

async function main(): Promise<void> {
    // -------------------------------------------------
    // 4.1 创建san个 MCP Client
    // -------------------------------------------------
    console.log('Knowledge Host Started');
    const searchClient = new Client({
        name: 'search-client',
        version: '0.1.0'
    });

    const resourceClient = new Client({
        name: 'resource-client',
        version: '0.1.0'
    });

    const promptClient = new Client({
        name: 'prompt-client',
        version: '0.1.0'
    })

    // -------------------------------------------------
    // 4.1 创建san个 Transport
    // -------------------------------------------------
    const searchTransport = new StdioClientTransport({
        command: 'pnpm',
        args: ['exec', 'tsx', 'search-server.ts'],
        cwd: serversDir
    })

    const resourceTransport = new StdioClientTransport({
        command: 'pnpm',
        args: ['exec', 'tsx', 'knowledge-template-server.ts'],
        cwd: serversDir
    })

    const promptTransport = new StdioClientTransport({
        command: 'pnpm',
        args: ['exec', 'tsx', 'knowledge-prompt-server.ts'],
        cwd: serversDir
    })

    // -------------------------------------------------
    // 4.3 连接状态
    // -------------------------------------------------

    let isSearchConnected = false;
    let isResourceConnected = false;
    let isPromptConnected = false;

    let SearchConnectAttempted = false;
    let ResourceConnectAttempted = false;
    let PromptConnectAttempted = false;

    
    try {
        try {
            SearchConnectAttempted = true;
            await searchClient.connect(searchTransport);
            isSearchConnected = true;
            console.log('✅ Search Server Connected');

            const { tools } = await searchClient.listTools();
            console.log('Search Server Tools:');
            for(const tool of tools) {
                console.log(tool.name, tool.description);
            }

            if (!tools.some(tool => tool.name === 'search_file')) {
                throw new Error('Search Server 未提供 search_file');
            }

        } catch(error) {
            console.error('❌ Search Server 连接失败:',
                getErrorMessage(error)
            );
        }


        try {
            ResourceConnectAttempted = true;
            await resourceClient.connect(resourceTransport);
            isResourceConnected = true;
            console.log('✅ Resources Server Connected');

            const caps = resourceClient.getServerCapabilities()
            if (!caps?.resources) {
                console.warn('⚠️ Server 不支持 resources，跳过');
            } else {
                const templates = await listAllTemplates(resourceClient)
                console.log('Server Resource Templates:')
                for(const t of templates) {
                    console.log(t.name, t.uriTemplate, t.description ?? '')
                }
                if (!templates.some(
                    template =>
                        template.uriTemplate ===
                        'kb://documents/{documentId}'
                )) {
                    throw new Error('未发现目标 Resource Template');
                }
            }            
        } catch(error) {
            console.error('❌ Resource Server 连接失败:',
                getErrorMessage(error)
            );
        }

        try {
            PromptConnectAttempted = true;
            await promptClient.connect(promptTransport);
            isPromptConnected = true;
            console.log('✅ Prompt Server Connected');

            const caps = promptClient.getServerCapabilities();

            if (!caps?.prompts) {
                throw new Error('Prompt Server 不支持 Prompts');
            }

            const { prompts } = await promptClient.listPrompts()
            console.log('Prompts Server promt:');
            for(const prompt of prompts) {
                console.log(prompt.name, prompt.description)
            }

            if (!prompts.some(
                prompt => prompt.name === 'summarize_document'
            )) {
                throw new Error('未发现 summarize_document');
            }
        } catch(error) {
            console.error('❌ Prompt Server 连接失败:',
                getErrorMessage(error)
            );
        }

        // -------------------------------------------------
        // 阶段一：Search
        // -------------------------------------------------

        if (!isSearchConnected) {
            throw new Error('Search Server 不可用');
        }

        const searchRet = await searchClient.callTool({
            name: 'search_file',
            arguments: {
                path: '.',
                name: 'architecture.md'
            }
        });


        if (searchRet.isError) {
            throw new Error(
                getTextContent(searchRet.content)
            );
        }

        // 解析 Search 返回的数据
        const searchData = JSON.parse(
            getTextContent(searchRet.content)
        ) as SearchResult;

        if (!searchData.found) {
            throw new Error('未找到目标文档');
        }

        if (!/^[A-Za-z0-9_-]+$/.test(searchData.documentId)) {
            throw new Error('Search 返回了非法 documentId');
        }

        const documentId = searchData.documentId;
        console.log('找到文档:', documentId);

        if (!isResourceConnected) {
            throw new Error('Resource Server 不可用');
        }

        // 根据 documentId 构造 URI
        const uri = `kb://documents/${encodeURIComponent(documentId)}`;
        // 读取 Resource
        const readRet = await resourceClient.readResource({
            uri
        });

        const textParts: string[] = [];

        for (const item of readRet.contents) {

            if (
                'text' in item &&
                typeof item.text === 'string'
            ) {
                textParts.push(item.text);
            }
        }

        const documentContent = textParts.join('\n').trim();

        if (!documentContent) {
            throw new Error('Resource 没有返回有效文档内容');
        }

        console.log('Document Content Loaded');
        console.log('Content Length:', documentContent.length);

        // -------------------------------------------------
        // 阶段三：Prompt
        // -------------------------------------------------

        if (!isPromptConnected) {
            throw new Error('Prompt Server 不可用');
        }

        const promptRet = await promptClient.getPrompt({
            name: 'summarize_document',
            arguments: {
                documentId: documentId,
                documentContent: documentContent
            }
        });

        if (promptRet.messages.length === 0) {
            throw new Error('Prompt Server 返回了空 Messages');
        }

        console.log('Prompt Messages:', promptRet.messages);

        // -------------------------------------------------
        // 阶段四：转换 MCP Prompt 消息
        // -------------------------------------------------
        const modelMessages: ModelMessage[] =
            promptRet.messages.map(message => {

                if (message.content.type !== 'text') {
                    throw new Error('目前只支持文本 Prompt');
                }

                return {
                    role: message.role,
                    content: message.content.text
                };
            });

        console.log('Model Messages:', modelMessages.length);

        // -------------------------------------------------
        // 阶段五：调用大模型
        // -------------------------------------------------

        const modelRet = await callModel(modelMessages);

        console.log('LLM Result:');
        console.log(modelRet);

    } finally {
        // =============================================
        // 9. 资源清理
        // =============================================

        console.log('\n===== Closing MCP Clients =====');

        const closeTasks: Promise<void>[] = [];

        if (SearchConnectAttempted) {
            closeTasks.push(
                Promise.resolve().then(
                    () => searchClient.close()
                )
            );
        }

        if (ResourceConnectAttempted) {
            closeTasks.push(
                Promise.resolve().then(
                    () => resourceClient.close()
                )
            );
        }

        if (PromptConnectAttempted) {
            closeTasks.push(
                Promise.resolve().then(
                    () => promptClient.close()
                )
            );
        }

        const closeResults = await Promise.allSettled(
            closeTasks
        );

        for (const result of closeResults) {

            if (result.status === 'rejected') {
                console.error(
                    'Client Close Error:',
                    getErrorMessage(result.reason)
                );
            }
        }

        console.log('Knowledge Host Finished');
    }


}

// =====================================================
// 程序入口
// =====================================================

main().catch(error => {

    console.error(
        'Host Error:',
        getErrorMessage(error)
    );

    process.exitCode = 1;
});
