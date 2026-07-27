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
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

type Direction = "ltr" | "rtl";
type SourceType = "collection" | "manual";
type DisplayMode = "list" | "slider";

type PickedResource = { id: string; title: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const settings = await prisma.cartUpsellSettings.findUnique({
    where: { shop: session.shop },
  });

  const direction = (settings?.direction ?? "ltr") as Direction;
  const sourceType = (settings?.sourceType ?? "collection") as SourceType;
  const displayMode = (settings?.displayMode ?? "list") as DisplayMode;
  const collectionId = settings?.collectionId ?? null;
  const productIds: string[] = settings ? JSON.parse(settings.productIds) : [];

  let selectedCollection: PickedResource | null = null;
  let selectedProducts: PickedResource[] = [];

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

  return {
    direction,
    sourceType,
    displayMode,
    selectedCollection,
    selectedProducts,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const direction: Direction =
    formData.get("direction")?.toString() === "rtl" ? "rtl" : "ltr";
  const sourceType: SourceType =
    formData.get("sourceType")?.toString() === "manual" ? "manual" : "collection";
  const displayMode: DisplayMode =
    formData.get("displayMode")?.toString() === "slider" ? "slider" : "list";
  const collectionId = formData.get("collectionId")?.toString() || null;
  const productIds: string[] = JSON.parse(
    formData.get("productIds")?.toString() || "[]",
  );

  await prisma.cartUpsellSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      direction,
      sourceType,
      displayMode,
      collectionId: sourceType === "collection" ? collectionId : null,
      productIds: JSON.stringify(sourceType === "manual" ? productIds : []),
    },
    update: {
      direction,
      sourceType,
      displayMode,
      collectionId: sourceType === "collection" ? collectionId : null,
      productIds: JSON.stringify(sourceType === "manual" ? productIds : []),
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

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Settings saved");
    }
  }, [fetcher.data, shopify]);

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

  const handleSave = () => {
    fetcher.submit(
      {
        direction,
        sourceType,
        displayMode,
        collectionId: collection?.id ?? "",
        productIds: JSON.stringify(products.map((product) => product.id)),
      },
      { method: "POST" },
    );
  };

  return (
    <Page>
      <TitleBar title="Cart Upsell" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Layout
                  </Text>
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
              </Card>

              <Card>
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
                      {collection ? (
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="span">{collection.title}</Text>
                          <Button onClick={pickCollection} variant="plain">
                            Change
                          </Button>
                        </InlineStack>
                      ) : (
                        <Button onClick={pickCollection}>
                          Choose a collection
                        </Button>
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
                </BlockStack>
              </Card>

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
