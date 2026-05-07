export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    PENDING:       ["bg-soft/15 text-[#A8B3C5]",   "Pending"],
    GENERATING:    ["bg-warn/15 text-warn",        "Generating"],
    SCRIPTS_READY: ["bg-orange/15 text-orange-100","Scripts Ready"],
    RENDERING:     ["bg-warn/15 text-warn",        "Rendering"],
    VIDEOS_READY:  ["bg-orange/15 text-orange-100","Videos Ready"],
    PUBLISHING:    ["bg-warn/15 text-warn",        "Publishing"],
    PUBLISHED:     ["bg-good/15 text-good",        "Published"],
    PARTIAL:       ["bg-orange/15 text-orange-100","Partial"],
    ERROR:         ["bg-bad/15 text-bad",          "Error"],
  };
  const [cls, label] = map[status] || ["bg-soft/15 text-[#A8B3C5]", status];
  return <span className={`pill ${cls}`}>{label}</span>;
}
