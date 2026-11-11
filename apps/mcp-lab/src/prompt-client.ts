import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const serversDir = path.join(currentDir, 'servers')

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function main(): Promise<void> {
    const promptClient = new Client(
        { name: 'prompt-client', version: '0.1.0'},
    )

    const promptTransport = new StdioClientTransport({
        command: 'pnpm',
        args: ['exec', 'tsx', 'knowledge-prompt-server.ts'],
        cwd: serversDir,
    })

    try {
        await promptClient.connect(promptTransport)
        console.log('✅ Knowledge Server Connected')

        const { prompts } = await promptClient.listPrompts()
        console.log('Prompts Server promt:');
        for (const prompt of prompts) {
            console.log(
                prompt.name,
                prompt.description
            )
        }
      
        const getRet = await promptClient.getPrompt({
            name: 'summarize_document',
            arguments: {
                documentId: 'architecture',
                documentContent: '# Architecture\n\n这是架构文档的实际内容。'
            }
        });
        console.log(getRet.messages);
    } catch(error) {
        console.error('❌ 失败:', getErrorMessage(error))
    } finally {
        try { await promptClient.close() } catch { /* ignore */ }
    }
}

main().catch(error => {
  console.error('Host Error:', error)
})