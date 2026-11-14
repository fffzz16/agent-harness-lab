// Search Server 提供 search_document Tool。

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

import {
    mkdir,
    realpath,
    lstat,
    readdir
} from 'node:fs/promises';

import path from 'node:path';
import { fileURLToPath } from 'node:url';


const DOC_DIR = fileURLToPath(
    new URL('../../data/knowledge/', import.meta.url)
);

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function toolError(error: unknown) {
    return {
        content: [
            {
                type: 'text' as const,
                text: getErrorMessage(error)
            }
        ],
        isError: true
    }
}


async function searchFileByPath(relativePath: string, targetFile: string): Promise<string | null> {
    if (
        !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(targetFile)
    ) {
        throw new Error('Invalid fileName');
    }

    if(
        path.isAbsolute(relativePath) ||
        relativePath.includes('\0')
    ) {
        throw new Error('不允许使用绝对路径或非法路径');
    }

    await mkdir(DOC_DIR, {recursive: true});
    const root = await realpath(DOC_DIR);
    const candidate = path.resolve(root, relativePath);
    const relative = path.relative(root, candidate);
    if (
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        throw new Error('不允许访问知识库目录之外的文件');
    }  
    
    const info = await lstat(candidate);
    if(!info.isDirectory()) {
        throw new Error('目标不是普通文件');
    }
    
    const actualPath = await realpath(candidate);
    // 9. 再次检查真实路径，防止符号链接绕过
    const actualRelative = path.relative(root, actualPath);
    if (
        actualRelative === '..' ||
        actualRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(actualRelative)
    ) {
        throw new Error('不允许访问知识库目录之外的文件');
    }

    // 10. 读取目录内容
    const entries = await readdir(actualPath, {
        withFileTypes: true
    });
    console.error('zzzzzzzzzzzz90:', entries)
    // 11. 查找指定文件
    for (const entry of entries) {

        if (
            entry.name === targetFile &&
            entry.isFile()
        ) {
            return path.join(relativePath, entry.name);
        }
    }

    // 12. 没有找到文件
    return null;
}

function createServer(): McpServer {
    const server = new McpServer({
        name: 'search-server',
        version: '0.1.0'
    });

    server.registerTool(
        'search_file',
        {
            description: 'Search file in knowledge directory',
            inputSchema: z.object({
                path: z.string().trim().min(1),
                name: z.string().trim().min(1),

            })
        },

        async ({path: relativePath, name: fileName}) => {
            try {
                const searchRet = await searchFileByPath(relativePath, fileName);

                if (searchRet === null) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: JSON.stringify({
                                    found: false,
                                    documentId: '',
                                    path: ''
                                })
                            }
                        ]
                    };
                }

                // 从文件路径中提取 documentId
                const documentId = path.basename(
                    searchRet,
                    path.extname(searchRet)
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                found: true,
                                documentId: documentId,
                                path: searchRet
                            })
                        }
                    ]
                };

            } catch(error) {
                console.error('❌ 失败:', getErrorMessage(error))
                return toolError(error);
            } 
        }
    )
    return server;
}

serveStdio(createServer);
