import { Brand, Button } from "@/components/doorway-ui";
export default function NotFound() {
  return (
    <main className="error-page">
      <div>
        <Brand />
        <h1>A little off the path.</h1>
        <p>
          This page isn’t here. Head back to your workspace or start again from
          the front door.
        </p>
        <Button href="/dashboard">Go to your workspace →</Button>
      </div>
    </main>
  );
}
