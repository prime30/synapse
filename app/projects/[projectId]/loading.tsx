export default function ProjectLoading() {
  return (
    <div className="h-screen w-screen flex bg-[#fafaf9] dark:bg-[#0a0a0a]">
      {/* Sidebar skeleton */}
      <div className="w-60 shrink-0 border-r border-stone-200 dark:border-[#1f1f1f] flex flex-col">
        <div className="h-12 border-b border-stone-200 dark:border-[#1f1f1f] flex items-center px-3 gap-2">
          <div className="w-5 h-5 rounded bg-stone-200 dark:bg-[#1e1e1e] animate-pulse" />
          <div className="h-3 w-20 rounded bg-stone-200 dark:bg-[#1e1e1e] animate-pulse" />
        </div>
        <div className="flex-1 p-2 space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-7 rounded bg-stone-100 dark:bg-white/[0.03] animate-pulse"
              style={{ animationDelay: `${i * 60}ms`, width: `${60 + Math.random() * 30}%` }}
            />
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar skeleton */}
        <div className="h-10 border-b border-stone-200 dark:border-[#1f1f1f] flex items-center px-2 gap-1">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-7 rounded bg-stone-100 dark:bg-white/[0.03] animate-pulse"
              style={{ width: `${100 + i * 20}px`, animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>

        {/* Editor skeleton */}
        <div className="flex-1 p-4 space-y-2">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="h-4 rounded bg-stone-100/50 dark:bg-white/[0.02] animate-pulse"
              style={{
                animationDelay: `${i * 40}ms`,
                width: `${20 + Math.random() * 60}%`,
                marginLeft: `${(i % 3) * 16}px`,
              }}
            />
          ))}
        </div>
      </div>

      {/* AI sidebar skeleton */}
      <div className="w-80 shrink-0 border-l border-stone-200 dark:border-[#1f1f1f] flex flex-col">
        <div className="h-12 border-b border-stone-200 dark:border-[#1f1f1f] flex items-center px-3 gap-2">
          <div className="w-5 h-5 rounded-full bg-stone-200 dark:bg-[#1e1e1e] animate-pulse" />
          <div className="h-3 w-24 rounded bg-stone-200 dark:bg-[#1e1e1e] animate-pulse" />
        </div>
        <div className="flex-1" />
        <div className="h-14 border-t border-stone-200 dark:border-[#1f1f1f] p-2">
          <div className="h-full rounded-lg bg-stone-100 dark:bg-white/[0.03] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
