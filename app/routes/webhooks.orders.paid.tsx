import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const UPSELL_PROPERTY = "_cart_upsell_app";

type WebhookLineItem = {
  product_id: number;
  quantity: number;
  price: string;
  properties?: { name: string; value: string }[];
  discount_allocations?: { amount: string }[];
};

type PaidOrder = {
  id?: number;
  total_price?: string;
  currency?: string;
  note_attributes?: { name: string; value: string }[];
  line_items?: WebhookLineItem[];
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload as PaidOrder;
  if (!order?.id) return new Response("Missing order ID", { status: 400 });

  const lineItems: WebhookLineItem[] = Array.isArray(order.line_items)
    ? order.line_items
    : [];
  const experimentMarker = Array.isArray(order.note_attributes)
    ? order.note_attributes.find((attribute) => attribute.name === "__cart_upsell_test")?.value
    : undefined;
  const marker = /^([0-9a-f-]{36}):(control|variant)$/i.exec(experimentMarker ?? "");
  const experimentId = marker?.[1] ?? null;
  const cohort = marker?.[2] ?? null;
  const amount = Number(order.total_price);
  const currency = typeof order.currency === "string" ? order.currency : "";
  const purchases: {
    shop: string; type: string; productId: string; quantity: number; amount: number;
  }[] = [];
  for (const item of lineItems) {
    const properties = Array.isArray(item.properties) ? item.properties : [];
    const isUpsellDriven = properties.some(
      (prop) => prop.name === UPSELL_PROPERTY,
    );
    if (!isUpsellDriven) continue;

    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const discount = Array.isArray(item.discount_allocations)
      ? item.discount_allocations.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)
      : 0;
    if (!Number.isSafeInteger(Number(item.product_id)) || quantity < 1) continue;
    purchases.push({
        shop,
        type: "purchase",
        productId: String(item.product_id),
        quantity,
        amount: Math.max(0, price * quantity - discount),
    });
  }

  await prisma.$transaction(async (tx) => {
    const result = await tx.orderAttribution.createMany({
      data: [{ shop, orderId: String(order.id), experimentId, cohort,
        amount: Number.isFinite(amount) ? amount : 0, currency }],
      skipDuplicates: true,
    });
    if (result.count && purchases.length) {
      await tx.upsellEvent.createMany({ data: purchases });
    }
  });

  return new Response();
};
