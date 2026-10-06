import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Box,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const settings = await prisma.cartUpsellSettings.findUnique({
    where: { shop: session.shop },
  });

  return {
    headingText: settings?.headingText ?? "",
    buttonLabel: settings?.buttonLabel ?? "",
    buttonColor: settings?.buttonColor ?? "",
    buttonTextColor: settings?.buttonTextColor ?? "",
    buttonBorderRadius: settings?.buttonBorderRadius?.toString() ?? "",
    imageSize: settings?.imageSize?.toString() ?? "",
    itemGap: settings?.itemGap?.toString() ?? "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const headingText = formData.get("headingText")?.toString().trim().slice(0, 120) || null;
  const buttonLabel = formData.get("buttonLabel")?.toString().trim().slice(0, 60) || null;
  const buttonColor = formData.get("buttonColor")?.toString().trim() || null;
  const buttonTextColor =
    formData.get("buttonTextColor")?.toString().trim() || null;
  const buttonBorderRadiusRaw = formData
    .get("buttonBorderRadius")
    ?.toString()
    .trim();
  const buttonBorderRadius = buttonBorderRadiusRaw
    ? Number(buttonBorderRadiusRaw)
    : null;
  const parseSize = (field: string, min: number, max: number) => {
    const raw = formData.get(field)?.toString().trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= min && value <= max ? value : NaN;
  };
  const imageSize = parseSize("imageSize", 40, 120);
  const itemGap = parseSize("itemGap", 0, 40);
  if (Number.isNaN(imageSize) || Number.isNaN(itemGap) ||
      [buttonColor, buttonTextColor].some((color) => color !== null &&
        !/^#[0-9a-f]{6}$/i.test(color)) ||
      (buttonBorderRadius !== null &&
        (!Number.isInteger(buttonBorderRadius) || buttonBorderRadius < 0 || buttonBorderRadius > 60))) {
    return { ok: false, error: "Enter valid colors, sizes, and corner radius." };
  }

  await prisma.cartUpsellSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      headingText,
      buttonLabel,
      buttonColor,
      buttonTextColor,
      buttonBorderRadius,
      imageSize,
      itemGap,
    },
    update: {
      headingText,
      buttonLabel,
      buttonColor,
      buttonTextColor,
      buttonBorderRadius,
      imageSize,
      itemGap,
    },
  });

  return { ok: true };
};

function ColorField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <InlineStack gap="200" blockAlign="end" wrap={false}>
      <div style={{ flexGrow: 1 }}>
        <TextField
          label={label}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="off"
          helpText="Leave blank to use the store theme's color"
        />
      </div>
      <Box
        borderRadius="200"
        borderWidth="025"
        borderColor="border"
        overflowX="hidden"
        overflowY="hidden"
      >
        <div
          style={{
            width: 36,
            height: 36,
            background: value || "transparent",
          }}
        />
      </Box>
    </InlineStack>
  );
}

export default function Design() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [headingText, setHeadingText] = useState(data.headingText);
  const [buttonLabel, setButtonLabel] = useState(data.buttonLabel);
  const [buttonColor, setButtonColor] = useState(data.buttonColor);
  const [buttonTextColor, setButtonTextColor] = useState(
    data.buttonTextColor,
  );
  const [buttonBorderRadius, setButtonBorderRadius] = useState(
    data.buttonBorderRadius,
  );
  const [imageSize, setImageSize] = useState(data.imageSize);
  const [itemGap, setItemGap] = useState(data.itemGap);

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Design saved");
    } else if (fetcher.data && "error" in fetcher.data && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    fetcher.submit(
      { headingText, buttonLabel, buttonColor, buttonTextColor,
        buttonBorderRadius, imageSize, itemGap },
      { method: "POST" },
    );
  };

  return (
    <Page>
      <TitleBar title="Design" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Copy
                  </Text>
                  <TextField
                    label="Heading"
                    value={headingText}
                    onChange={setHeadingText}
                    placeholder="Complete your order"
                    autoComplete="off"
                    helpText="Shown above the upsell products"
                  />
                  <TextField
                    label="Add button text"
                    value={buttonLabel}
                    onChange={setButtonLabel}
                    placeholder="Add"
                    autoComplete="off"
                    helpText="Leave blank for the translated default"
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Button
                  </Text>
                  <Text as="p" tone="subdued">
                    By default the button matches your theme's own colors and
                    corner radius. Set any of these to override it.
                  </Text>
                  <ColorField
                    label="Background color"
                    value={buttonColor}
                    onChange={setButtonColor}
                    placeholder="#1a1a1a"
                  />
                  <ColorField
                    label="Text color"
                    value={buttonTextColor}
                    onChange={setButtonTextColor}
                    placeholder="#ffffff"
                  />
                  <TextField
                    label="Corner radius (px)"
                    type="number"
                    value={buttonBorderRadius}
                    onChange={setButtonBorderRadius}
                    placeholder="40"
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Layout details</Text>
                  <TextField label="Product image size (px)" type="number"
                    value={imageSize} onChange={setImageSize} placeholder="64"
                    autoComplete="off" helpText="40–120 px; blank uses the default" />
                  <TextField label="Space between products (px)" type="number"
                    value={itemGap} onChange={setItemGap} placeholder="12"
                    autoComplete="off" helpText="0–40 px; blank uses the default" />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Preview</Text>
                  <Text as="p" tone="subdued">
                    Illustrative preview. Theme colors and fonts are inherited on the storefront.
                  </Text>
                  <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
                    <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
                      {headingText || "Complete your order"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: itemGap === "" ? 12 : Number(itemGap) }}>
                      <div style={{ width: Number(imageSize) || 64, height: Number(imageSize) || 64,
                        background: "#eee", borderRadius: 4, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>Sample product<br /><span style={{ opacity: 0.7 }}>$24.00</span></div>
                      <button type="button" style={{ background: buttonColor || "#1a1a1a",
                        color: buttonTextColor || "#fff", border: 0, padding: "10px 18px",
                        borderRadius: buttonBorderRadius === "" ? 40 : Number(buttonBorderRadius) }}>
                        {buttonLabel || "Add"}
                      </button>
                    </div>
                  </div>
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
