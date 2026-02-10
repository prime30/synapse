const AGENTS = [
  {
    name: 'Code',
    color: 'bg-green-500',
    status: 'Writing code...',
    task: 'Generating hero section template with responsive grid layout',
    progress: 75,
  },
  {
    name: 'Design',
    color: 'bg-blue-400',
    status: 'Validating design...',
    task: 'Checking visual consistency against brand guidelines',
    progress: 45,
  },
  {
    name: 'QA',
    color: 'bg-purple-400',
    status: 'Running tests...',
    task: 'Verifying Lighthouse score and WCAG compliance',
    progress: 30,
  },
];

export function AgentPanelMockup() {
  return (
    <div className="rounded-2xl bg-[#111] border border-white/5 overflow-hidden">
      {/* Top bar */}
      <div className="h-10 bg-[#0a0a0a] border-b border-white/5 flex items-center px-4">
        <span className="text-[11px] text-white/60">Agent Orchestration</span>
        <span className="ml-auto text-[10px] text-sky-400">3 active</span>
      </div>

      {/* Panels */}
      <div className="grid grid-cols-3 divide-x divide-white/5 min-h-[260px]">
        {AGENTS.map((agent) => (
          <div key={agent.name} className="flex flex-col">
            {/* Header */}
            <div className="p-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${agent.color}`} />
                <span className="text-[11px] text-white/70">{agent.name}</span>
              </div>
              <p className="text-[9px] text-white/30 mt-0.5">{agent.status}</p>
            </div>

            {/* Task */}
            <div className="p-3 flex-1">
              <p className="text-[10px] text-white/40 leading-relaxed">{agent.task}</p>
            </div>

            {/* Progress */}
            <div className="px-3 pb-3">
              <div className="h-1 rounded-full bg-white/5">
                <div
                  className={`h-1 rounded-full ${agent.color}`}
                  style={{ width: `${agent.progress}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
