import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineGrid,
  Text,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const [addToCartTotal, purchaseTotal, perProduct] = await Promise.all([
    prisma.upsellEvent.aggregate({
      where: { shop, type: "add_to_cart" },
      _sum: { quantity: true },
    }),
    prisma.upsellEvent.aggregate({
      where: { shop, type: "purchase" },
      _sum: { quantity: true, amount: true },
    }),
    prisma.upsellEvent.groupBy({
      by: ["productId", "type"],
      where: { shop },
      _sum: { quantity: true, amount: true },
    }),
  ]);

  const shopResponse = await admin.graphql(
    `#graphql
      query GetShopCurrency { shop { currencyCode } }`,
  );
  const shopJson = await shopResponse.json();
  const currency = shopJson.data?.shop?.currencyCode ?? "USD";

  const byProduct = new Map<
    string,
    { addToCart: number; purchases: number; revenue: number }
  >();

  for (const row of perProduct) {
    const entry = byProduct.get(row.productId) ?? {
      addToCart: 0,
      purchases: 0,
      revenue: 0,
    };
    if (row.type === "add_to_cart") {
      entry.addToCart = row._sum.quantity ?? 0;
    } else if (row.type === "purchase") {
      entry.purchases = row._sum.quantity ?? 0;
      entry.revenue = row._sum.amount ?? 0;
    }
    byProduct.set(row.productId, entry);
  }

  const productIds = Array.from(byProduct.keys());
  let titles = new Map<string, string>();

  if (productIds.length > 0) {
    const gids = productIds.map((id) => `gid://shopify/Product/${id}`);
    const response = await admin.graphql(
      `#graphql
        query GetProductTitles($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product { id title legacyResourceId }
          }
        }`,
      { variables: { ids: gids } },
    );
    const json = await response.json();
    for (const node of json.data?.nodes ?? []) {
      if (node) titles.set(node.legacyResourceId, node.title);
    }
  }

  const rows = productIds
    .map((productId) => ({
      productId,
      title: titles.get(productId) ?? `Product ${productId}`,
      ...byProduct.get(productId)!,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.addToCart - a.addToCart);

  return {
    currency,
    addToCartCount: addToCartTotal._sum.quantity ?? 0,
    purchaseCount: purchaseTotal._sum.quantity ?? 0,
    revenue: purchaseTotal._sum.amount ?? 0,
    rows,
  };
};

export default function Analytics() {
  const data = useLoaderData<typeof loader>();

  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: data.currency,
  });

  return (
    <Page>
      <TitleBar title="Analytics" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <InlineGrid columns={3} gap="400">
                <Card>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Added to cart
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {data.addToCartCount}
                    </Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Purchased
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {data.purchaseCount}
                    </Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Revenue generated
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {formatter.format(data.revenue)}
                    </Text>
                  </BlockStack>
                </Card>
              </InlineGrid>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    By product
                  </Text>
                  {data.rows.length === 0 ? (
                    <EmptyState
                      heading="No activity yet"
                      image=""
                    >
                      <p>
                        Once shoppers interact with the upsell, activity will
                        show up here.
                      </p>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={["text", "numeric", "numeric", "numeric"]}
                      headings={["Product", "Added to cart", "Purchased", "Revenue"]}
                      rows={data.rows.map((row) => [
                        row.title,
                        row.addToCart,
                        row.purchases,
                        formatter.format(row.revenue),
                      ])}
                    />
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
