import { useCallback, useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Select,
  RadioButton,
  Button,
  TextField,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

type Direction = "ltr" | "rtl";
type SourceType = "collection" | "manual";
type DisplayMode = "list" | "slider";

type PickedResource = { id: string; title: string };
type ThemeActivation = {
  handle: string;
  status: "active" | "available" | "unavailable";
  activations: { target: string }[];
};

function parseProductIds(value: string | null | undefined): string[] {
  try {
    const ids = JSON.parse(value || "[]");
    return Array.isArray(ids)
      ? ids.filter((id): id is string =>
          typeof id === "string" && /^gid:\/\/shopify\/Product\/\d+$/.test(id),
        ).slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const settings = await prisma.cartUpsellSettings.findUnique({
    where: { shop: session.shop },
  });

  const direction = (settings?.direction ?? "ltr") as Direction;
  const sourceType: SourceType = settings?.sourceType === "manual" ? "manual" : "collection";
  const displayMode = (settings?.displayMode ?? "list") as DisplayMode;
  const collectionId = settings?.collectionId ?? null;
  const productIds = parseProductIds(settings?.productIds);
  const excludedProductIds = parseProductIds(settings?.excludedProductIds);

  let selectedCollection: PickedResource | null = null;
  let selectedProducts: PickedResource[] = [];
  let excludedProducts: PickedResource[] = [];

  if (collectionId) {
    const response = await admin.graphql(
      `#graphql
        query GetCollection($id: ID!) {
          collection(id: $id) { id title }
        }`,
      { variables: { id: collectionId } },
    );
    const json = await response.json();
    selectedCollection = json.data?.collection ?? null;
  }

  if (productIds.length > 0) {
    const response = await admin.graphql(
      `#graphql
        query GetProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product { id title }
          }
        }`,
      { variables: { ids: productIds } },
    );
    const json = await response.json();
    selectedProducts = (json.data?.nodes ?? []).filter(Boolean);
  }

  if (sourceType === "collection" && collectionId && excludedProductIds.length > 0) {
    const response = await admin.graphql(
      `#graphql
        query GetExcludedProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product { id title }
          }
        }`,
      { variables: { ids: excludedProductIds } },
    );
    const json = await response.json();
    excludedProducts = (json.data?.nodes ?? []).filter(Boolean);
  }

  return {
    direction,
    sourceType,
    displayMode,
    selectedCollection,
    selectedProducts,
    excludedProducts,
    maxProducts: String(settings?.maxProducts ?? 6),
    shuffleProducts: settings?.shuffleProducts ?? false,
    themeEditorUrl: `https://${session.shop}/admin/themes/current/editor?context=apps&activateAppId=${process.env.SHOPIFY_API_KEY}/cart-upsell-embed`,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const direction: Direction =
    formData.get("direction")?.toString() === "rtl" ? "rtl" : "ltr";
  const sourceType: SourceType = formData.get("sourceType")?.toString() === "manual"
    ? "manual" : "collection";
  const displayMode: DisplayMode =
    formData.get("displayMode")?.toString() === "slider" ? "slider" : "list";
  const collectionId = formData.get("collectionId")?.toString() || null;
  const productIds = parseProductIds(formData.get("productIds")?.toString());
  const excludedProductIds = sourceType === "collection" && collectionId
    ? parseProductIds(formData.get("excludedProductIds")?.toString()) : [];
  const maxProducts = Number(formData.get("maxProducts"));
  const shuffleProducts = formData.get("shuffleProducts")?.toString() === "true";
  if (!Number.isInteger(maxProducts) || maxProducts < 1 || maxProducts > 20) {
    return { ok: false, error: "Choose between 1 and 20 products." };
  }

  await prisma.cartUpsellSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      direction,
      sourceType,
      displayMode,
      collectionId,
      productIds: JSON.stringify(productIds),
      excludedProductIds: JSON.stringify(excludedProductIds),
      maxProducts,
      shuffleProducts,
      minPrice: null,
      maxPrice: null,
      holdoutPercent: 0,
      experimentId: null,
    },
    update: {
      direction,
      sourceType,
      displayMode,
      collectionId,
      productIds: JSON.stringify(productIds),
      excludedProductIds: JSON.stringify(excludedProductIds),
      maxProducts,
      shuffleProducts,
      minPrice: null,
      maxPrice: null,
      holdoutPercent: 0,
      experimentId: null,
    },
  });

  return { ok: true };
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [direction, setDirection] = useState<Direction>(data.direction);
  const [sourceType, setSourceType] = useState<SourceType>(data.sourceType);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(data.displayMode);
  const [collection, setCollection] = useState<PickedResource | null>(
    data.selectedCollection,
  );
  const [products, setProducts] = useState<PickedResource[]>(
    data.selectedProducts,
  );
  const [excludedProducts, setExcludedProducts] = useState<PickedResource[]>(
    data.excludedProducts,
  );
  const [maxProducts, setMaxProducts] = useState(data.maxProducts);
  const [shuffleProducts, setShuffleProducts] = useState(data.shuffleProducts);
  const [themeStatus, setThemeStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [themeActivations, setThemeActivations] = useState<ThemeActivation[]>([]);

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Settings saved");
    } else if (fetcher.data && "error" in fetcher.data && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  useEffect(() => {
    const appApi = shopify as unknown as {
      app?: { extensions?: () => Promise<{
        type: string;
        activations: ThemeActivation[];
      }[]> };
    };
    if (!appApi.app?.extensions) {
      setThemeStatus("unavailable");
      return;
    }
    let active = true;
    appApi.app.extensions().then((extensions) => {
      if (!active) return;
      setThemeActivations(extensions
        .filter((extension) => extension.type === "theme_app_extension")
        .flatMap((extension) => extension.activations));
      setThemeStatus("ready");
    }).catch(() => {
      if (active) setThemeStatus("unavailable");
    });
    return () => { active = false; };
  }, [shopify]);

  const pickCollection = useCallback(async () => {
    const picked = await shopify.resourcePicker({
      type: "collection",
      action: "select",
      selectionIds: collection ? [{ id: collection.id }] : [],
    });
    const selection = picked?.selection?.[0];
    if (selection) {
      setCollection({ id: selection.id, title: selection.title });
    }
  }, [collection, shopify]);

  const pickProducts = useCallback(async () => {
    const picked = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      selectionIds: products.map((product) => ({ id: product.id })),
    });
    if (picked?.selection) {
      setProducts(
        picked.selection.map((product) => ({
          id: product.id,
          title: product.title,
        })),
      );
    }
  }, [products, shopify]);

  const removeProduct = (id: string) =>
    setProducts((prev) => prev.filter((product) => product.id !== id));

  const pickExcludedProducts = useCallback(async () => {
    const picked = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      selectionIds: excludedProducts.map((product) => ({ id: product.id })),
    });
    if (picked?.selection) {
      setExcludedProducts(picked.selection.map((product) => ({
        id: product.id,
        title: product.title,
      })));
    }
  }, [excludedProducts, shopify]);

  const handleSave = () => {
    fetcher.submit(
      {
        direction,
        sourceType,
        displayMode,
        collectionId: collection?.id ?? "",
        productIds: JSON.stringify(products.map((product) => product.id)),
        excludedProductIds: JSON.stringify(excludedProducts.map((product) => product.id)),
        maxProducts,
        shuffleProducts: String(shuffleProducts),
      },
      { method: "POST" },
    );
  };

  return (
    <Page>
      <TitleBar title="Settings" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Theme setup</Text>
                  {themeStatus === "loading" ? (
                    <Text as="p">Checking your published theme…</Text>
                  ) : themeStatus === "unavailable" ? (
                    <Text as="p" tone="subdued">
                      Could not check activation automatically. Open the theme editor to verify it.
                    </Text>
                  ) : (
                    <>
                      <Text as="p">
                        Drawer embed: {themeActivations.some((activation) =>
                          activation.handle === "cart-upsell-embed" && activation.status === "active")
                          ? "Active" : "Not active"}
                      </Text>
                      <Text as="p">
                        Cart-page block: {themeActivations.some((activation) =>
                          activation.handle === "cart-upsell" && activation.status === "active")
                          ? "Placed in published theme" : "Not placed"}
                      </Text>
                    </>
                  )}
                  <Text as="p" tone="subdued">
                    Enable the embed for a supported cart drawer, or add the app block to
                    your cart page. Check the storefront after saving your theme.
                  </Text>
                  <a href={data.themeEditorUrl} target="_blank" rel="noreferrer">
                    Open theme editor
                  </a>
                </BlockStack>
              </Card>
              <div id="language"><Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Layout
                  </Text>
                  <Text as="p" tone="subdued">
                    Set the reading direction here. Edit the widget heading and button text in Design.
                  </Text>
                  <Button url="/app/design" variant="plain">Edit widget text</Button>
                  <InlineStack gap="400">
                    <RadioButton
                      label="Left to right (LTR)"
                      checked={direction === "ltr"}
                      id="direction-ltr"
                      name="direction"
                      onChange={() => setDirection("ltr")}
                    />
                    <RadioButton
                      label="Right to left (RTL)"
                      checked={direction === "rtl"}
                      id="direction-rtl"
                      name="direction"
                      onChange={() => setDirection("rtl")}
                    />
                  </InlineStack>
                  <Select
                    label="Display style"
                    options={[
                      { label: "List", value: "list" },
                      { label: "Slider", value: "slider" },
                    ]}
                    value={displayMode}
                    onChange={(value) => setDisplayMode(value as DisplayMode)}
                  />
                </BlockStack>
              </Card></div>

              <div id="products"><Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Products to upsell
                  </Text>
                  <InlineStack gap="400">
                    <RadioButton
                      label="From a collection"
                      checked={sourceType === "collection"}
                      id="source-collection"
                      name="sourceType"
                      onChange={() => setSourceType("collection")}
                    />
                    <RadioButton
                      label="Manually selected products"
                      checked={sourceType === "manual"}
                      id="source-manual"
                      name="sourceType"
                      onChange={() => setSourceType("manual")}
                    />
                  </InlineStack>

                  {sourceType === "collection" ? (
                    <BlockStack gap="200">
                      <Button onClick={pickCollection}>Choose a collection</Button>
                      {collection && (
                        <BlockStack gap="200">
                          <Button onClick={pickExcludedProducts}>Exclude products</Button>
                          <Text as="p" tone="subdued">Selected collection: {collection.title}</Text>
                          {excludedProducts.map((product) => (
                            <InlineStack key={product.id} align="space-between" blockAlign="center">
                              <Text as="span">{product.title}</Text>
                              <Button onClick={() => setExcludedProducts((current) =>
                                current.filter((entry) => entry.id !== product.id))}
                                variant="plain" tone="critical">Remove</Button>
                            </InlineStack>
                          ))}
                        </BlockStack>
                      )}
                    </BlockStack>
                  ) : (
                    <BlockStack gap="200">
                      <Button onClick={pickProducts}>Choose products</Button>
                      {products.map((product) => (
                        <InlineStack
                          key={product.id}
                          align="space-between"
                          blockAlign="center"
                        >
                          <Text as="span">{product.title}</Text>
                          <Button
                            onClick={() => removeProduct(product.id)}
                            variant="plain"
                            tone="critical"
                          >
                            Remove
                          </Button>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                  <TextField label="Maximum products shown" type="number"
                    value={maxProducts} onChange={setMaxProducts} min={1} max={20}
                    autoComplete="off" helpText="Show up to 20 eligible products" />
                  <RadioButton label="Shuffle product order"
                    checked={shuffleProducts} id="shuffle-products"
                    onChange={() => setShuffleProducts((value: boolean) => !value)} />
                </BlockStack>
              </Card></div>

              <InlineStack>
                <Button
                  variant="primary"
                  loading={isSaving}
                  onClick={handleSave}
                >
                  Save
                </Button>
              </InlineStack>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
