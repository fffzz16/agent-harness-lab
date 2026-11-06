
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod/v4';

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

// 配置文件 Schema
const configSchema = z.object({
    username: z.string().trim().min(1)
});

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

// =====================================================
// 3. 数据库查询函数
// =====================================================

async function callQueryUser(
    client: Client,
    username: string
): Promise<void> {

    try {

        const result = await client.callTool({
            name: 'query_user',

            arguments: {
                username
            }
        });

        if (result.isError) {

            console.error(
                '❌ Database Tool Error:',
                getTextContent(result.content)
            );

            return;
        }

        console.log('Database Result:');

        console.log(
            getTextContent(result.content)
        );

    } catch (error) {

        console.error(
            '❌ Database 调用失败:',
            getErrorMessage(error)
        );
    }
}

// =====================================================
// 4. 主程序
// =====================================================

async function main(): Promise<void> {

    // -------------------------------------------------
    // 4.1 创建两个 MCP Client
    // -------------------------------------------------

    const fileClient = new Client({
        name: 'file-client',
        version: '0.1.0'
    });

    const dbClient = new Client({
        name: 'database-client',
        version: '0.1.0'
    });

    // -------------------------------------------------
    // 4.2 创建两个 Transport
    // -------------------------------------------------

    const fileTransport = new StdioClientTransport({
        command: 'pnpm',
        args: [
            'exec',
            'tsx',
            'file-server.ts'
        ],
        cwd: serversDir
    });

    const dbTransport = new StdioClientTransport({
        command: 'pnpm',
        args: [
            'exec',
            'tsx',
            'database-server.ts'
        ],
        cwd: serversDir
    });

    // -------------------------------------------------
    // 4.3 连接状态
    // -------------------------------------------------

    let isFileConnected = false;
    let isDbConnected = false;

    let fileConnectAttempted = false;
    let dbConnectAttempted = false;

    // 从配置文件提取的用户名
    let usernameFromConfig: string | undefined;

    try {

        // =============================================
        // 5. 连接 File Server
        // =============================================

        try {

            fileConnectAttempted = true;

            await fileClient.connect(fileTransport);

            isFileConnected = true;

            console.log('✅ File Server Connected');

            const { tools } = await fileClient.listTools();

            console.log('File Server Tools:');

            for (const tool of tools) {
                console.log(
                    tool.name,
                    tool.description
                );
            }

        } catch (error) {

            console.error(
                '❌ File Server 连接失败:',
                getErrorMessage(error)
            );
        }

        // =============================================
        // 6. 连接 Database Server
        // =============================================

        try {

            dbConnectAttempted = true;

            await dbClient.connect(dbTransport);

            isDbConnected = true;

            console.log('✅ Database Server Connected');

            const { tools } = await dbClient.listTools();

            console.log('Database Server Tools:');

            for (const tool of tools) {
                console.log(
                    tool.name,
                    tool.description
                );
            }

        } catch (error) {

            console.error(
                '❌ Database Server 连接失败:',
                getErrorMessage(error)
            );
        }

        // =============================================
        // 7. File Server：读取配置文件
        // =============================================

        if (isFileConnected) {

            try {

                const readResult = await fileClient.callTool({
                    name: 'read_file',

                    arguments: {
                        path: 'config.json'
                    }
                });

                // 7.1 检查 Tool 是否执行失败
                if (readResult.isError) {

                    console.error(
                        '❌ 文件读取失败:',
                        getTextContent(readResult.content)
                    );

                } else {

                    // 7.2 提取文件文本
                    const rawText = getTextContent(
                        readResult.content
                    );

                    // 7.3 JSON 解析
                    const parsedJson: unknown = JSON.parse(rawText);

                    // 7.4 Zod 运行时校验
                    const config = configSchema.parse(parsedJson);

                    // 7.5 提取 username
                    usernameFromConfig = config.username;

                    console.log(
                        '📄 Config Username:',
                        usernameFromConfig
                    );
                }

            } catch (error) {

                console.error(
                    '❌ 文件读取或解析失败:',
                    getErrorMessage(error)
                );
            }

        } else {

            console.warn(
                '⚠️ File Server 不可用，跳过文件读取'
            );
        }

        // =============================================
        // 8. Database Server：查询用户
        // =============================================

        if (isDbConnected) {

            if (usernameFromConfig !== undefined) {

                // 正常业务流程：
                // 使用 File Server 返回的 username 查询数据库

                await callQueryUser(
                    dbClient,
                    usernameFromConfig
                );

            } else if (!isFileConnected) {

                // 独立测试：
                // File Server 连接失败时，
                // 验证 Database Server 是否仍然可用

                console.warn(
                    '⚠️ 执行 Database 独立连接测试，使用 alice'
                );

                await callQueryUser(
                    dbClient,
                    'alice'
                );

            } else {

                // File Server 已连接，
                // 但是文件读取或解析失败。
                // 不应该继续数据库查询。

                console.warn(
                    '⚠️ 未获取有效 username，跳过数据库查询'
                );
            }

        } else {

            console.warn(
                '⚠️ Database Server 不可用，跳过数据库查询'
            );
        }

    } finally {

        // =============================================
        // 9. 资源清理
        // =============================================

        const closeTasks: Promise<void>[] = [];

        // 对所有尝试启动过的连接进行清理
        if (fileConnectAttempted) {
            closeTasks.push(fileClient.close());
        }

        if (dbConnectAttempted) {
            closeTasks.push(dbClient.close());
        }

        // 两个 Client 独立清理
        const closeResults = await Promise.allSettled(
            closeTasks
        );

        for (const result of closeResults) {

            if (result.status === 'rejected') {

                console.error(
                    'Client 关闭异常:',
                    getErrorMessage(result.reason)
                );
            }
        }

        console.log('MCP Host Finished');
    }
}

// =====================================================
// 10. 程序入口
// =====================================================

main().catch(error => {
    console.error('Host Error:', error);
});
