import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[var(--text-secondary)]">Projects home page - coming soon</p>
    </div>
  );
}
