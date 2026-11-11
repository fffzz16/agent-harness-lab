import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { text } from 'stream/consumers';

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

const DOC_URI = 'kb://documents/{documentId}'
const KNOWLEDGE_DIR = fileURLToPath(
    new URL('../../data/knowledge/', import.meta.url)
);
// mu lu chuan yue
async function getKnowlRoot(): Promise<string> {
    await mkdir (KNOWLEDGE_DIR, { recursive: true});

    return realpath(KNOWLEDGE_DIR);
}

function resolveCandidate(root: string, relativePath: string): string {
    if(
        path.isAbsolute(relativePath) || 
        relativePath.includes('\0')
    ) {
        throw new Error('filepath illegal')
    }

    const candidate = path.resolve(root, relativePath);

    return candidate;
}

async function getDocumentPath(documentId: string): Promise<string> {
    if(!/^[A-Za-z0-9_-]+$/.test(documentId)) {
        throw new Error('Invalid documentId');
    }

    await mkdir(KNOWLEDGE_DIR, {recursive: true});
    const root = await realpath(KNOWLEDGE_DIR);

    const candidate = path.resolve(root, `${documentId}.md`);

    const relative = path.relative(root, candidate);

    if (
        relative === '' ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        throw new Error('文件路径越权');
    }

    const info = await lstat(candidate);

    if (!info.isFile() || info.isSymbolicLink()) {
        throw new Error('目标不是普通文件');
    }

    // 6. 获取真实路径并再次校验
    const actualPath = await realpath(candidate);

    const actualRelative = path.relative(root, actualPath);

    if (
        actualRelative === '..' ||
        actualRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(actualRelative)
    ) {
        throw new Error('文件路径越权');
    }

    return actualPath;
}

function createServer(): McpServer {

    const server = new McpServer({
        name: 'knowledge-server',
        version: '0.1.0'
    });

    server.registerResource (
        'project relate doc',
        new ResourceTemplate(DOC_URI, {list: undefined}),
        {
            title: 'project relate doc',
            description: 'project relate doc',
            mimeType: 'text/markdown'
        },
        async (uri, { documentId }, relativePath) => {
            const id = String(documentId);
            if(!/^[a-zA-z0-9_-]+$/.test(id)) {
                throw new Error('Invalid documentId');
            }

            const filePath = await getDocumentPath(id);

            const content = await readFile(filePath, 'utf-8');

            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'text/markdown',
                        text: content
                    }
                ]
            }
        }
        
    );

    return server;
}

serveStdio(createServer);

console.error('Knowledge MCP Server started');