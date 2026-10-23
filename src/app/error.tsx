"use client";
import { Brand, Button } from "@/components/doorway-ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <div>
        <Brand />
        <h1>Let’s try that again.</h1>
        <p>
          This page couldn’t be opened. Your saved records are still in your
          workspace.
        </p>
        <Button onClick={reset}>Try again →</Button>
      </div>
    </main>
  );
}
