import { cn } from "./ui/utils";

export function ThemePreviewSwatch({
  fill,
  stroke,
  text,
  nameplate,
  radius,
  boxImageUrl,
  className,
}: {
  fill: string;
  stroke: string;
  text: string;
  nameplate: string;
  radius: number;
  boxImageUrl?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("relative overflow-hidden", className ?? "h-7 w-10")}
      style={{
        background: fill,
        backgroundImage: boxImageUrl ? `url(${boxImageUrl})` : undefined,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        border: boxImageUrl ? "1px solid transparent" : `1px solid ${stroke}`,
        borderRadius: Math.min(radius, 6),
      }}
    >
      {!boxImageUrl ? (
        <>
          <div
            className="absolute top-0.5 left-0.5 h-1.5 w-4 rounded-sm"
            style={{ background: nameplate }}
          />
          <div
            className="absolute right-0.5 bottom-1 left-0.5 h-0.5 rounded-full"
            style={{ background: text, opacity: 0.6 }}
          />
          <div
            className="absolute right-1.5 bottom-2.5 left-0.5 h-0.5 rounded-full"
            style={{ background: text, opacity: 0.4 }}
          />
        </>
      ) : null}
    </div>
  );
}
