import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

import {
    mkdir,
    readFile,
    writeFile,
    realpath,
    lstat
} from 'node:fs/promises';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = fileURLToPath(
    new URL('../../data/', import.meta.url)
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
    };
}

function assertInside(
    root: string,
    target: string,
    allowRoot = false
) : void {
    const relative = path.relative(root, target);

    const invalid = 
        relative === '...' || 
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative) ||
        (!allowRoot && relative === '');
    
        if(invalid) {
            throw new Error('文件路径超出了 data 目录');
        }
}

async function getDataRoot(): Promise<string> {
    await mkdir(DATA_DIR, { recursive: true});

    return await realpath(DATA_DIR);
}

function resolveCandidate(
    root: string,
    relativePath: string
): string {
    if(
        path.isAbsolute(relativePath) ||
        relativePath.includes('\0')
    ) {
        throw new Error('不允许使用绝对路径或非法路径');
    }

    const candidate = path.resolve(root, relativePath);

    assertInside(root, candidate);

    return candidate
}

async function getReadPath(relativePath:string): Promise<string> {
    const root = await getDataRoot();
    const candidate = resolveCandidate(root, relativePath);
    const info = await lstat(candidate);

    if(!info.isFile()) {
        throw new Error('目标不是普通文件');
    }

    const actualPath = await realpath(candidate);
    assertInside(root, actualPath);

    return actualPath;
}

async function getWritePath(
    relativePath: string
): Promise<string> {
    const root = await getDataRoot();
    const candidate = resolveCandidate(root, relativePath);
    const parentDir = path.dirname(candidate);

    await mkdir(parentDir, {recursive: true});

    const actualParent = await realpath(parentDir);
    assertInside(root, actualParent, true);

    try {
        const info = await lstat(candidate);
        if(info.isSymbolicLink()) {
            throw new Error('不允许写入符号链接');
        }

        if (!info.isFile()) {
            throw new Error('目标不是普通文件');
        }

        const actualPath = await realpath(candidate);
        assertInside(root, actualPath);

        return actualPath;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return path.join(actualParent, path.basename(candidate));
        }

        throw error;
    }
}

function createServer(): McpServer {
    const server = new McpServer({
        name: 'file-server',
        version: '0.1.0'
    });

    // read file
    server.registerTool(
        'read_file',
        {
            description: 'read file',
            inputSchema: z.object({
                path: z.string().trim().min(1)
            })
        },

        async ({ path: relativePath }) => {

            try {
                const filePath = await getReadPath(relativePath);
                
                const result = await readFile(
                    filePath,
                    'utf-8'
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: result
                        }
                    ]
                };
            } catch(error) {
                return toolError(error);
            }
        }
    );

    // write file
    server.registerTool(
        'write_file',
        {
            description: 'write file',
            inputSchema: z.object({
                path: z.string().trim().min(1),
                content: z.string()
            })
        },

        async ({path: relativePath, content}) => {
            try {
                const filePath = await getWritePath(relativePath);

                await writeFile(
                    filePath,
                    content,
                    'utf-8'
                );

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `文件写入成功：${relativePath}`
                        }
                    ]
                };
            } catch(error) {
                return toolError(error);
            }
        }
    );

    return server;
}

serveStdio(createServer);

console.error('File MCP Server started');

