type RoundSetupStepsProps = {
  activeStep: 1 | 2 | 3;
  className?: string;
};

const STEPS = [
  { number: 1, label: "Data" },
  { number: 2, label: "Jogadores" },
  { number: 3, label: "Times" },
] as const;

export function RoundSetupSteps({ activeStep, className = "" }: RoundSetupStepsProps) {
  return (
    <nav aria-label="Etapas de criação da rodada" className={`flex items-start px-1 ${className}`}>
      {STEPS.map((step, index) => {
        const reached = activeStep >= step.number;
        const current = activeStep === step.number;
        return (
          <div key={step.number} className="contents">
            <div className={`flex shrink-0 flex-col items-center gap-1 ${reached ? "text-accent" : "text-muted"}`} aria-current={current ? "step" : undefined}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black ${current ? "border-accent bg-accent text-background shadow-[0_0_18px_rgba(204,255,0,.2)]" : "border-current"}`}>
                {step.number}
              </span>
              <span className="text-[9px] font-black uppercase tracking-wider">{step.label}</span>
            </div>
            {index < STEPS.length - 1 && <span className={`mx-2 mt-4 h-px min-w-4 flex-1 ${activeStep > step.number ? "bg-accent" : "bg-border"}`} />}
          </div>
        );
      })}
    </nav>
  );
}
