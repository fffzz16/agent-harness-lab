import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type {
    Resource,
    ResourceTemplateType,
    ReadResourceResult
} from '@modelcontextprotocol/client';

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const serversDir = path.join(currentDir, 'servers')

const documentId = '123'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

async function readTargetDoc(
  client: Client,
  cond: { documentId: string }
): Promise<ReadResourceResult> {
  // 不依赖 list，直接用模板展开 URI
  const uri = `documents://${cond.documentId}`
  return client.readResource({ uri })
}

async function main(): Promise<void> {
  const knowlClient = new Client(
    { name: 'knowledge-client', version: '0.1.0' },
  )

  const knowlTransport = new StdioClientTransport({
    command: 'pnpm',
    args: ['exec', 'tsx', 'knowledge-template-server.ts'],
    cwd: serversDir,
  })

  try {
    await knowlClient.connect(knowlTransport)
    console.log('✅ Knowledge Server Connected')

    // 检查 Server 是否支持 resources
    const caps = knowlClient.getServerCapabilities()
    if (!caps?.resources) {
      console.warn('⚠️ Server 不支持 resources，跳过')
      return
    }

    const templates = await listAllTemplates(knowlClient)
    console.log('Knowledge Server Resource Templates:')
    for (const t of templates) {
      console.log(t.name, t.uriTemplate, t.description ?? '')
    }

    const readRet = await readTargetDoc(knowlClient, { documentId })
    for (const item of readRet.contents) {
      if ('text' in item) console.log(item.text)
    }
  } catch (error) {
    console.error('❌ 失败:', getErrorMessage(error))
  } finally {
    try { await knowlClient.close() } catch { /* ignore */ }
  }
}

main().catch(error => {
  console.error('Host Error:', error)
})