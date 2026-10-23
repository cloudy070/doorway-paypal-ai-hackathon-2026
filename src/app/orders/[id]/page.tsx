import { OrderDetailPage } from "@/components/commerce";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDetailPage key={id} id={id} />;
}
