import { PublicStorePage } from "@/components/commerce";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicStorePage key={slug} slug={slug} />;
}
