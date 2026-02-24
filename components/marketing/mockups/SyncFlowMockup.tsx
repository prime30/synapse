const THEMES = [
  { name: 'Dawn', badge: 'Live', badgeClass: 'bg-accent/10 text-accent' },
  { name: 'Custom Theme v2', badge: 'Draft', badgeClass: 'bg-white/5 text-white/30' },
  { name: 'Starter Theme', badge: null, badgeClass: '' },
];

export function SyncFlowMockup() {
  return (
    <div className="rounded-2xl bg-[oklch(0.178_0_0)] border border-white/5 overflow-hidden">
      {/* Top bar */}
      <div className="h-10 bg-[oklch(0.145_0_0)] border-b border-white/5 flex items-center px-4">
        <span className="text-[11px] text-white/60">Shopify Sync</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] text-green-400">Connected</span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Store card */}
        <div className="rounded-xl bg-white/5 border border-white/5 p-4">
          <p className="text-sm text-white/80 font-medium">my-store.myshopify.com</p>
          <p className="text-[10px] text-white/30 mt-1">Last synced 2 minutes ago</p>
        </div>

        {/* Theme list */}
        <div>
          <div className="text-[9px] text-white/30 tracking-widest uppercase mb-2">Themes</div>
          <div className="space-y-2">
            {THEMES.map((theme) => (
              <div
                key={theme.name}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.03]"
              >
                <span className="text-[11px] text-white/60">{theme.name}</span>
                {theme.badge && (
                  <span className={`text-[9px] px-2 py-0.5 rounded-full ${theme.badgeClass}`}>
                    {theme.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button className="flex-1 h-9 rounded-lg bg-accent text-white text-[11px] font-medium flex items-center justify-center">
            Deploy to Shopify
          </button>
          <button className="h-9 px-4 rounded-lg border border-white/10 text-[11px] text-white/50">
            Preview
          </button>
        </div>
      </div>
    </div>
  );
}

