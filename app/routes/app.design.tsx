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
    buttonColor: settings?.buttonColor ?? "",
    buttonTextColor: settings?.buttonTextColor ?? "",
    buttonBorderRadius: settings?.buttonBorderRadius?.toString() ?? "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const headingText = formData.get("headingText")?.toString().trim() || null;
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

  await prisma.cartUpsellSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      headingText,
      buttonColor,
      buttonTextColor,
      buttonBorderRadius,
    },
    update: {
      headingText,
      buttonColor,
      buttonTextColor,
      buttonBorderRadius,
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
  const [buttonColor, setButtonColor] = useState(data.buttonColor);
  const [buttonTextColor, setButtonTextColor] = useState(
    data.buttonTextColor,
  );
  const [buttonBorderRadius, setButtonBorderRadius] = useState(
    data.buttonBorderRadius,
  );

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Design saved");
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    fetcher.submit(
      { headingText, buttonColor, buttonTextColor, buttonBorderRadius },
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
