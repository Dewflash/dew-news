export function Pill({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "accent";
}) {
  const style =
    variant === "accent"
      ? "bg-accent/15 text-accent"
      : "bg-white/10 text-gray-300";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${style}`}>
      {children}
    </span>
  );
}
