import type { McpServerDef } from '../../shared/types'

export interface MarketplaceItem {
  id: string
  name: string
  category: 'Featured' | 'Developer' | 'Productivity' | 'Data' | 'Web'
  description: string
  icon: string
  def: McpServerDef
  /** Environment variables the user must fill in before it works. */
  secrets?: { key: string; label: string }[]
  /** Command-line args the user may edit (e.g. a folder path). */
  argHint?: string
}

const npx = (pkg: string, args: string[] = []): McpServerDef => ({ type: 'stdio', command: 'npx', args: ['-y', pkg, ...args] })

/** Ready-to-add MCP servers. All run locally through npx; secrets stay in team.json on this machine. */
export const MARKETPLACE: MarketplaceItem[] = [
  { id: 'github', name: 'GitHub', category: 'Featured', icon: '🐙', description: 'Issues, pull requests, repos and code search.', def: npx('@modelcontextprotocol/server-github'), secrets: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'Personal access token' }] },
  { id: 'playwright', name: 'Playwright', category: 'Featured', icon: '🎭', description: 'Drive a real browser: open pages, click, fill forms, screenshot.', def: npx('@playwright/mcp@latest') },
  { id: 'filesystem', name: 'Filesystem', category: 'Featured', icon: '📁', description: 'Read and write files in extra folders outside the workspace.', def: npx('@modelcontextprotocol/server-filesystem', ['e:/fortune projects']), argHint: 'Last argument is the folder to expose.' },
  { id: 'fetch', name: 'Fetch', category: 'Web', icon: '🌐', description: 'Fetch any URL and convert it to markdown for the employee to read.', def: { type: 'stdio', command: 'uvx', args: ['mcp-server-fetch'] } },
  { id: 'memory', name: 'Memory', category: 'Productivity', icon: '🧠', description: 'A knowledge graph the employee can remember facts in across chats.', def: npx('@modelcontextprotocol/server-memory') },
  { id: 'sequential', name: 'Sequential Thinking', category: 'Productivity', icon: '🪜', description: 'Structured step-by-step reasoning for hard problems.', def: npx('@modelcontextprotocol/server-sequential-thinking') },
  { id: 'postgres', name: 'Postgres', category: 'Data', icon: '🐘', description: 'Query a Postgres / Supabase database (read-only by default).', def: npx('@modelcontextprotocol/server-postgres', ['postgresql://user:pass@host:5432/db']), argHint: 'Replace the connection string.' },
  { id: 'sqlite', name: 'SQLite', category: 'Data', icon: '🗄️', description: 'Query and inspect a local SQLite file.', def: { type: 'stdio', command: 'uvx', args: ['mcp-server-sqlite', '--db-path', 'e:/fortune projects/app.db'] }, argHint: 'Point --db-path at the database file.' },
  { id: 'supabase', name: 'Supabase', category: 'Data', icon: '⚡', description: 'Manage Supabase projects, tables, SQL and edge functions.', def: npx('@supabase/mcp-server-supabase@latest'), secrets: [{ key: 'SUPABASE_ACCESS_TOKEN', label: 'Access token' }] },
  { id: 'slack', name: 'Slack', category: 'Productivity', icon: '💬', description: 'Read channels and post messages in your Slack workspace.', def: npx('@modelcontextprotocol/server-slack'), secrets: [{ key: 'SLACK_BOT_TOKEN', label: 'Bot token' }, { key: 'SLACK_TEAM_ID', label: 'Team id' }] },
  { id: 'notion', name: 'Notion', category: 'Productivity', icon: '📝', description: 'Search and edit Notion pages and databases.', def: npx('@notionhq/notion-mcp-server'), secrets: [{ key: 'NOTION_TOKEN', label: 'Integration token' }] },
  { id: 'brave', name: 'Brave Search', category: 'Web', icon: '🦁', description: 'Web search through the Brave API (in addition to built-in WebSearch).', def: npx('@modelcontextprotocol/server-brave-search'), secrets: [{ key: 'BRAVE_API_KEY', label: 'API key' }] },
  { id: 'context7', name: 'Context7', category: 'Developer', icon: '📚', description: 'Up-to-date library and framework documentation for coding.', def: npx('@upstash/context7-mcp@latest') },
  { id: 'vercel', name: 'Vercel', category: 'Developer', icon: '▲', description: 'Deployments, projects and logs on Vercel.', def: { type: 'http', url: 'https://mcp.vercel.com' } },
  { id: 'chrome', name: 'Chrome DevTools', category: 'Developer', icon: '🧪', description: 'Inspect pages, console, network and performance in Chrome.', def: npx('chrome-devtools-mcp@latest') },
]
