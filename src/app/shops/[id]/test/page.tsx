import { StoreTestPage } from "@/components/workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreTestPage key={id} id={id} />;
}
