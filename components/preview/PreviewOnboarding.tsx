'use client';

interface PreviewOnboardingProps {
  connected: boolean;
  hasThemeId: boolean;
  syncStatus: string | null;
  hasFiles: boolean;
  onConnectStore: () => void;
  onImportTheme: () => void;
}

function StepCircle({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent text-white flex-shrink-0">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="flex items-center justify-center w-7 h-7 rounded-full border-2 border-accent bg-accent/10 flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center w-7 h-7 rounded-full border-2 ide-border ide-surface-input flex-shrink-0">
      <span className="w-1.5 h-1.5 rounded-full ide-surface-inset" />
    </span>
  );
}

function StepLine({ active }: { active: boolean }) {
  return (
    <span
      className={`w-0.5 h-6 ml-[13px] rounded-full transition-colors ${active ? 'bg-accent/40' : 'ide-surface-inset'}`}
    />
  );
}

export function PreviewOnboarding({
  connected,
  hasThemeId,
  hasFiles,
  onConnectStore,
  onImportTheme,
}: PreviewOnboardingProps) {
  const step1Done = connected;
  const step2Done = connected && hasFiles;
  const step3Active = step2Done && !hasThemeId;

  type StepState = 'done' | 'active' | 'pending';
  const step1State = (step1Done ? 'done' : 'active') as StepState;
  const step2State: StepState = step2Done ? 'done' : step1Done ? 'active' : 'pending';
  const step3State: StepState = step3Active ? 'active' : step2Done && hasThemeId ? 'done' : 'pending';

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="w-full max-w-sm">
        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl ide-surface-panel border ide-border flex items-center justify-center">
            <svg className="w-8 h-8 ide-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.25} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-base font-semibold ide-text mb-1">Live Preview</h2>
        <p className="text-sm ide-text-muted mb-6">
          See your Shopify theme update in real-time as you edit code
        </p>

        {/* Steps */}
        <div className="flex flex-col items-start text-left mx-auto max-w-[280px]">
          {/* Step 1 */}
          <div className="flex items-start gap-3">
            <StepCircle state={step1State} />
            <div className="pt-0.5 min-w-0">
              <p className={`text-sm font-medium ${step1State === 'pending' ? 'ide-text-muted' : 'ide-text'}`}>
                Connect your Shopify store
              </p>
              {step1State === 'active' && (
                <button
                  type="button"
                  onClick={onConnectStore}
                  className="mt-2 px-4 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-md transition-colors"
                >
                  Connect Store
                </button>
              )}
              {step1State === 'done' && (
                <p className="text-xs ide-text-muted mt-0.5">Connected</p>
              )}
            </div>
          </div>

          <StepLine active={step1Done} />

          {/* Step 2 */}
          <div className="flex items-start gap-3">
            <StepCircle state={step2State} />
            <div className="pt-0.5 min-w-0">
              <p className={`text-sm font-medium ${step2State === 'pending' ? 'ide-text-muted' : 'ide-text'}`}>
                Import your theme
              </p>
              {step2State === 'active' && (
                <button
                  type="button"
                  onClick={onImportTheme}
                  className="mt-2 px-4 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-md transition-colors"
                >
                  Import Theme
                </button>
              )}
              {step2State === 'done' && (
                <p className="text-xs ide-text-muted mt-0.5">Theme files imported</p>
              )}
            </div>
          </div>

          <StepLine active={step2Done} />

          {/* Step 3 */}
          <div className="flex items-start gap-3">
            <StepCircle state={step3State} />
            <div className="pt-0.5 min-w-0">
              <p className={`text-sm font-medium ${step3State === 'pending' ? 'ide-text-muted' : 'ide-text'}`}>
                Preview activates automatically
              </p>
              {step3Active && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                  </span>
                  <span className="text-xs ide-text-muted">Setting up preview theme&hellip;</span>
                </div>
              )}
              {step3State === 'pending' && (
                <p className="text-xs ide-text-muted mt-0.5">Starts after import</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
