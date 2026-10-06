import { useCallback, useMemo, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  DataTable,
  EmptyState,
  Popover,
  OptionList,
  Button,
  DatePicker,
} from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

  const isAllTime = rangeParam === "all";
  const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : defaultFrom;
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);

  const dateFilter = isAllTime ? {} : { createdAt: { gte: from, lte: to } };

  const [impressionTotal, clickTotal, addToCartTotal, purchaseTotal, perProduct] = await Promise.all([
    prisma.upsellEvent.aggregate({
      where: { shop, type: "impression", ...dateFilter },
      _sum: { quantity: true },
    }),
    prisma.upsellEvent.aggregate({
      where: { shop, type: "click", ...dateFilter },
      _sum: { quantity: true },
    }),
    prisma.upsellEvent.aggregate({
      where: { shop, type: "add_to_cart", ...dateFilter },
      _sum: { quantity: true },
    }),
    prisma.upsellEvent.aggregate({
      where: { shop, type: "purchase", ...dateFilter },
      _sum: { quantity: true, amount: true },
    }),
    prisma.upsellEvent.groupBy({
      by: ["productId", "type"],
      where: { shop, ...dateFilter },
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
    { impressions: number; clicks: number; addToCart: number; purchases: number; revenue: number }
  >();

  for (const row of perProduct) {
    const entry = byProduct.get(row.productId) ?? {
      impressions: 0,
      clicks: 0,
      addToCart: 0,
      purchases: 0,
      revenue: 0,
    };
    if (row.type === "impression") {
      entry.impressions = row._sum.quantity ?? 0;
    } else if (row.type === "click") {
      entry.clicks = row._sum.quantity ?? 0;
    } else if (row.type === "add_to_cart") {
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
    impressionCount: impressionTotal._sum.quantity ?? 0,
    clickCount: clickTotal._sum.quantity ?? 0,
    addToCartCount: addToCartTotal._sum.quantity ?? 0,
    purchaseCount: purchaseTotal._sum.quantity ?? 0,
    revenue: purchaseTotal._sum.amount ?? 0,
    rows,
    range: {
      isAllTime,
      from: isAllTime ? null : toDateOnly(from),
      to: isAllTime ? null : toDateOnly(to),
    },
  };
};

type Preset = {
  label: string;
  days: number | "today" | "yesterday" | "all";
};

const PRESETS: Preset[] = [
  { label: "Today", days: "today" },
  { label: "Yesterday", days: "yesterday" },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 365 days", days: 365 },
  { label: "All time", days: "all" },
];

function presetToRange(preset: Preset): { from: string | null; to: string | null; isAllTime: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset.days === "all") {
    return { from: null, to: null, isAllTime: true };
  }
  if (preset.days === "today") {
    return { from: toDateOnly(today), to: toDateOnly(today), isAllTime: false };
  }
  if (preset.days === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: toDateOnly(yesterday), to: toDateOnly(yesterday), isAllTime: false };
  }

  const from = new Date(today);
  from.setDate(from.getDate() - (preset.days - 1));
  return { from: toDateOnly(from), to: toDateOnly(today), isAllTime: false };
}

function formatRangeLabel(from: string | null, to: string | null, isAllTime: boolean) {
  if (isAllTime || !from || !to) return "All time";

  const matchingPreset = PRESETS.find((preset) => {
    if (preset.days === "all") return false;
    const range = presetToRange(preset);
    return range.from === from && range.to === to;
  });
  if (matchingPreset) return matchingPreset.label;

  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const fromLabel = formatter.format(new Date(`${from}T00:00:00`));
  const toLabel = formatter.format(new Date(`${to}T00:00:00`));
  return from === to ? fromLabel : `${fromLabel} – ${toLabel}`;
}

function DateRangeControl({
  from,
  to,
  isAllTime,
}: {
  from: string | null;
  to: string | null;
  isAllTime: boolean;
}) {
  const [, setSearchParams] = useSearchParams();
  const [popoverActive, setPopoverActive] = useState(false);

  const initialSelected = useMemo(() => {
    if (isAllTime || !from || !to) {
      const today = new Date();
      return { start: today, end: today };
    }
    return {
      start: new Date(`${from}T00:00:00`),
      end: new Date(`${to}T00:00:00`),
    };
  }, [from, to, isAllTime]);

  const [pendingRange, setPendingRange] = useState(initialSelected);
  const [{ month, year }, setMonthYear] = useState({
    month: initialSelected.end.getMonth(),
    year: initialSelected.end.getFullYear(),
  });

  const togglePopover = useCallback(() => {
    setPendingRange(initialSelected);
    setPopoverActive((active) => !active);
  }, [initialSelected]);

  const applyRange = (nextFrom: string | null, nextTo: string | null, nextIsAllTime: boolean) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (nextIsAllTime) {
        params.set("range", "all");
        params.delete("from");
        params.delete("to");
      } else {
        params.delete("range");
        params.set("from", nextFrom!);
        params.set("to", nextTo!);
      }
      return params;
    });
    setPopoverActive(false);
  };

  const handlePresetSelect = (selected: string[]) => {
    const preset = PRESETS.find((p) => p.label === selected[0]);
    if (!preset) return;
    const range = presetToRange(preset);
    applyRange(range.from, range.to, range.isAllTime);
  };

  const handleApplyCustom = () => {
    applyRange(toDateOnly(pendingRange.start), toDateOnly(pendingRange.end), false);
  };

  const currentPresetLabel = PRESETS.find((preset) => {
    const range = presetToRange(preset);
    return range.isAllTime === isAllTime && range.from === from && range.to === to;
  })?.label;

  return (
    <Popover
      active={popoverActive}
      onClose={togglePopover}
      fluidContent
      preferredAlignment="right"
      activator={
        <Button onClick={togglePopover} icon={CalendarIcon} disclosure>
          {formatRangeLabel(from, to, isAllTime)}
        </Button>
      }
    >
      <InlineStack gap="0" wrap={false}>
        <div
          style={{
            width: 140,
            flexShrink: 0,
            borderRight: "1px solid var(--p-color-border)",
          }}
        >
          <OptionList
            selected={currentPresetLabel ? [currentPresetLabel] : []}
            onChange={handlePresetSelect}
            options={PRESETS.map((preset) => ({ value: preset.label, label: preset.label }))}
          />
        </div>
        <div style={{ padding: "16px", width: 340 }}>
          <BlockStack gap="400">
            <DatePicker
              month={month}
              year={year}
              onMonthChange={(newMonth, newYear) => setMonthYear({ month: newMonth, year: newYear })}
              selected={pendingRange}
              onChange={(range) => setPendingRange(range)}
              allowRange
            />
            <InlineStack align="end" gap="200">
              <Button onClick={() => setPopoverActive(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleApplyCustom}>
                Apply
              </Button>
            </InlineStack>
          </BlockStack>
        </div>
      </InlineStack>
    </Popover>
  );
}

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
              <InlineStack align="end">
                <DateRangeControl
                  from={data.range.from}
                  to={data.range.to}
                  isAllTime={data.range.isAllTime}
                />
              </InlineStack>

              <InlineGrid columns={3} gap="400">
                <Card>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Offers shown
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {data.impressionCount}
                    </Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Offers clicked
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {data.clickCount}
                    </Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">
                      Click rate
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {data.impressionCount > 0
                        ? `${((data.clickCount / data.impressionCount) * 100).toFixed(1)}%`
                        : "—"}
                    </Text>
                  </BlockStack>
                </Card>
              </InlineGrid>

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
                    <EmptyState heading="No activity yet" image="">
                      <p>
                        Once shoppers interact with the upsell, activity will
                        show up here.
                      </p>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "numeric"]}
                      headings={["Product", "Shown", "Clicked", "Added to cart", "Purchased", "Revenue"]}
                      rows={data.rows.map((row) => [
                        row.title,
                        row.impressions,
                        row.clicks,
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
