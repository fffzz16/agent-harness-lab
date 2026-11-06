import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

// import type { User } from '../types.js';

export interface User {
    id: number;
    username: string;
    email: string;
    age: number
};

// 2. 修正：声明为 User 的数组
const users: User[] = [
    { id: 1, username: 'alice', email: 'alice@example.com', age: 25 },
    { id: 2, username: 'bob', email: 'bob@example.com', age: 28 }
];

// 用户 ID
let nextId = 3;

function queryUser(username: string): User | null {

    const user = users.find(item => (item.username === username))

    if (!user) {
        throw new Error(`用户不存在：${username}`);
    }

    return user;
}

function insertUser (username: string, email: string): User {

    const exists = users.some(item => 
        item.username.toLowerCase() === username.toLowerCase()
    )
    if(exists) {
        throw new Error(`用户名已经存在：${username}`);
    }

    let newUser: User = {
        id: nextId++,
        username,
        email,
        age: 0
    }

    
    users.push(newUser)


    return newUser
}

// =====================================================
// 4. 通用错误处理
// =====================================================

function getErrorMessage(error: unknown): string {

    return error instanceof Error
        ? error.message
        : String(error);
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

function createServer(): McpServer {
    const server = new McpServer({
        name: 'database-server',
        version: '0.1.0'
    });

    // read file
    server.registerTool(
        'query_user',
        {
            description: 'query the user',
            inputSchema: z.object({
                username: z.string().trim().min(1)
            })
        },
        async ({username}) => {
            const user = queryUser(username);

            return {
                content: [{
                        type: 'text' as const,
                        text: JSON.stringify(user, null, 2)
                    }
                ]
            }
        }
    );

    server.registerTool(
        'insert_user',
        {
            description: '新增用户',

            inputSchema: z.object({
                username: z.string().trim().min(1),
                email: z.string().trim()
            })
        },

        async ({username, email}) => {
            const user = insertUser(username, email);

            return {
                content: [{
                        type: 'text' as const,
                        text: JSON.stringify(user, null, 2)
                    }
                ]
            }
        }
    );

    return server;
}

serveStdio(createServer);

console.error('Database MCP Server started');

