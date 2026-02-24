'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

interface Param {
  name: string;
  type: string;
  description: string;
}

interface Tool {
  name: string;
  description: string;
  params: Param[];
}

const TOOLS: Tool[] = [
  {
    name: 'sync_workspace',
    description:
      'Sync local files to a Synapse project. Uploads modified files, resolves conflicts, and ensures your remote workspace matches your local state.',
    params: [
      { name: 'project_id', type: 'string', description: 'The Synapse project identifier' },
      { name: 'direction', type: '"push" | "pull"', description: 'Sync direction — push local changes or pull remote changes' },
      { name: 'paths', type: 'string[]', description: 'Optional list of file paths to sync (defaults to all changed files)' },
      { name: 'force', type: 'boolean', description: 'Skip conflict detection and overwrite (default: false)' },
    ],
  },
  {
    name: 'execute_agent',
    description:
      'Run an AI agent on specified files in your project. The PM agent breaks down your prompt into tasks and delegates to specialist agents.',
    params: [
      { name: 'project_id', type: 'string', description: 'The Synapse project identifier' },
      { name: 'agent_type', type: '"pm" | "liquid" | "css" | "js" | "review"', description: 'Which agent to invoke' },
      { name: 'prompt', type: 'string', description: 'Natural language description of the desired change' },
      { name: 'files', type: 'string[]', description: 'Optional file paths to scope the agent to' },
    ],
  },
  {
    name: 'apply_changes',
    description:
      'Apply a set of suggested file changes to the project. Typically called after reviewing agent output to commit the modifications.',
    params: [
      { name: 'project_id', type: 'string', description: 'The Synapse project identifier' },
      { name: 'changeset_id', type: 'string', description: 'ID of the changeset to apply (from agent output)' },
      { name: 'files', type: 'string[]', description: 'Optional subset of files to apply (defaults to all)' },
      { name: 'preview', type: 'boolean', description: 'Apply to preview theme instead of main (default: true)' },
    ],
  },
  {
    name: 'read_file',
    description:
      'Read the contents of a file from a Synapse project. Returns the raw file content as a string along with metadata.',
    params: [
      { name: 'project_id', type: 'string', description: 'The Synapse project identifier' },
      { name: 'path', type: 'string', description: 'Relative file path within the project (e.g. "sections/header.liquid")' },
      { name: 'version', type: 'string', description: 'Optional version ID to read a historical snapshot' },
    ],
  },
  {
    name: 'write_file',
    description:
      'Write content to a file in a Synapse project. Creates the file if it doesn\'t exist, or replaces the existing content.',
    params: [
      { name: 'project_id', type: 'string', description: 'The Synapse project identifier' },
      { name: 'path', type: 'string', description: 'Relative file path within the project' },
      { name: 'content', type: 'string', description: 'The full file content to write' },
      { name: 'message', type: 'string', description: 'Optional commit message describing the change' },
    ],
  },
  {
    name: 'list_projects',
    description:
      'List all Synapse projects belonging to the authenticated user. Returns project metadata including name, store, and sync status.',
    params: [
      { name: 'limit', type: 'number', description: 'Max number of projects to return (default: 20)' },
      { name: 'offset', type: 'number', description: 'Pagination offset (default: 0)' },
      { name: 'status', type: '"active" | "archived"', description: 'Filter by project status (default: "active")' },
    ],
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

function ParamTable({ params }: { params: Param[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-white/10">
            <th className="text-left py-2 pr-4 font-medium text-stone-900 dark:text-white/80 whitespace-nowrap">
              Name
            </th>
            <th className="text-left py-2 pr-4 font-medium text-stone-900 dark:text-white/80 whitespace-nowrap">
              Type
            </th>
            <th className="text-left py-2 font-medium text-stone-900 dark:text-white/80">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {params.map((param) => (
            <tr
              key={param.name}
              className="border-b border-stone-100 dark:border-white/5 last:border-0"
            >
              <td className="py-2.5 pr-4">
                <code className="font-mono text-xs bg-stone-100 dark:bg-white/10 text-stone-800 dark:text-white/70 rounded px-1.5 py-0.5">
                  {param.name}
                </code>
              </td>
              <td className="py-2.5 pr-4">
                <code className="font-mono text-xs text-accent whitespace-nowrap">
                  {param.type}
                </code>
              </td>
              <td className="py-2.5 text-stone-500 dark:text-white/50">
                {param.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApiReferencePage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[oklch(0.145_0_0)] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center mb-20" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            API REFERENCE
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            MCP Tools &amp; Endpoints.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-2xl mx-auto">
            Complete reference for every Model Context Protocol tool available in
            Synapse. Use these tools from any MCP-compatible IDE.
          </p>
        </motion.div>

        {/* Tool Sections */}
        <div className="max-w-6xl mx-auto px-6 space-y-8">
          {TOOLS.map((tool, i) => (
            <motion.div
              key={tool.name}
              className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.05 * i }}
            >
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-stone-900 dark:text-white mb-2">
                  <code className="font-mono text-accent">{tool.name}</code>
                </h2>
                <p className="text-stone-500 dark:text-white/50 leading-relaxed">
                  {tool.description}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold tracking-widest uppercase text-stone-400 dark:text-white/30 mb-3">
                  Parameters
                </h3>
                <ParamTable params={tool.params} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Back to docs */}
        <motion.div className="max-w-6xl mx-auto px-6 mt-16 text-center" {...fadeUp}>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-stone-500 dark:text-white/50 hover:text-stone-900 dark:hover:text-white transition-colors text-sm"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            Back to documentation
          </Link>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
