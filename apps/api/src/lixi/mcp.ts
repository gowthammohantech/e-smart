import type { FastifyInstance } from 'fastify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { authenticate, companyFor } from '../auth/guards';
import type { Deps } from '../context';
import { confirm, propose } from './confirm';
import { jsonSchemaOf, runRead, TOOLS, ToolError, toolByName, type ToolCtx } from './tools';

const text = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

async function guarded(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return text(await fn());
  } catch (err) {
    if (err instanceof ToolError) return text({ status: err.status, code: err.problem.code, detail: err.problem.detail }, true);
    const e = err as { status?: number; code?: string; message?: string };
    if (typeof e.status === 'number' && e.status < 500) return text({ status: e.status, code: e.code, detail: e.message }, true);
    throw err;
  }
}

const CONFIRM = {
  name: 'confirm_action',
  title: 'Confirm a pending action',
  description: 'Runs a pending action from a write tool. Call it only after the user has seen the summary and said yes.',
  inputSchema: { type: 'object' as const, properties: { token: { type: 'string', minLength: 1 } }, required: ['token'], additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};

const LISTED = [
  ...TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.kind === 'write' ? `${tool.description} Returns a pending action; nothing is written until confirm_action.` : tool.description,
    inputSchema: jsonSchemaOf(tool) as { type: 'object'; [k: string]: unknown },
    annotations: tool.kind === 'read' ? { readOnlyHint: true, openWorldHint: false } : { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  })),
  CONFIRM,
];

/**
 * The Lixi catalog as an MCP server for one caller and one company. Reads
 * answer directly. Writes answer with a pending action; `confirm_action`
 * runs it, and is marked destructive so MCP clients ask the person first.
 *
 * The low-level server, not `McpServer`: the catalog already carries JSON
 * Schema and its own validation, so the SDK's zod never touches it.
 */
export function buildMcpServer(ctx: ToolCtx, secret: string): Server {
  const server = new Server(
    { name: 'elixir-books-lixi', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions:
        `Books of ${ctx.company.name} (${ctx.company.baseCurrency}). Answer only from tool results; never invent figures. ` +
        'Money is {minor, currency} in integer minor units. Write tools only prepare a pending action: show its summary to the user ' +
        'and call confirm_action with its token only after they explicitly approve.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: LISTED }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const { name, arguments: input } = request.params;
    if (name === CONFIRM.name) {
      return guarded(() => {
        const token = (input as { token?: unknown } | undefined)?.token;
        if (typeof token !== 'string' || !token) throw new ToolError(400, { code: 'INVALID_TOOL_INPUT', detail: 'token is required' });
        return confirm(token, ctx, secret);
      });
    }
    const tool = toolByName(name);
    if (!tool) return text({ status: 404, code: 'UNKNOWN_TOOL', detail: `No tool named ${name}` }, true);
    return guarded(() => (tool.kind === 'read' ? runRead(tool, input, ctx) : propose(tool, input, ctx, secret)));
  });

  return server;
}

/**
 * `/v1/companies/:companyId/mcp`: Streamable HTTP, stateless, JSON
 * responses. The bearer token is the user's own access token, and every
 * tool runs as that user.
 */
export function registerMcp(app: FastifyInstance, deps: Deps) {
  const url = '/v1/companies/:companyId/mcp';

  app.post(url, async (req, reply) => {
    await authenticate(app, deps, req, true);
    const user = req.authUser!;
    const company = await companyFor(deps, user, (req.params as { companyId: string }).companyId);
    const ctx: ToolCtx = { server: app, authorization: req.headers.authorization!, user, company, now: deps.now() };

    const server = buildMcpServer(ctx, deps.config.JWT_SECRET);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  // Stateless: there is no session to stream from or to end.
  const notAllowed = async (_req: unknown, reply: import('fastify').FastifyReply) =>
    reply
      .status(405)
      .header('allow', 'POST')
      .send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  app.get(url, notAllowed);
  app.delete(url, notAllowed);
}
