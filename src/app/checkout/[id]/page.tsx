import { CheckoutPage } from "@/components/commerce";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const access = typeof query.access === "string" ? query.access : undefined;
  return (
    <CheckoutPage
      key={`${id}:${access || ""}`}
      id={id}
      access={access}
      cancelled={query.cancelled === "1"}
    />
  );
}
