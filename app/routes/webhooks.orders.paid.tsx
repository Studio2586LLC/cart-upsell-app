import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const UPSELL_PROPERTY = "_cart_upsell_app";

type WebhookLineItem = {
  product_id: number;
  quantity: number;
  price: string;
  properties?: { name: string; value: string }[];
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const lineItems: WebhookLineItem[] = Array.isArray(payload?.line_items)
    ? payload.line_items
    : [];

  for (const item of lineItems) {
    const properties = Array.isArray(item.properties) ? item.properties : [];
    const isUpsellDriven = properties.some(
      (prop) => prop.name === UPSELL_PROPERTY,
    );
    if (!isUpsellDriven) continue;

    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;

    await prisma.upsellEvent.create({
      data: {
        shop,
        type: "purchase",
        productId: String(item.product_id),
        quantity,
        amount: price * quantity,
      },
    });
  }

  return new Response();
};
