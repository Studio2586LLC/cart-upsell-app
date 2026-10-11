import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Select,
  Button,
  Box,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import styles from "../styles/design.module.css";

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
    swatchShape: settings?.swatchShape ?? "circle",
    swatchSize: (settings?.swatchSize ?? 28).toString(),
    swatchBorderWidth: (settings?.swatchBorderWidth ?? 1).toString(),
    swatchBorderColor: settings?.swatchBorderColor ?? "",
    otherOptionStyle: settings?.otherOptionStyle ?? "boxes",
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
  const swatchShape = formData.get("swatchShape")?.toString();
  const swatchSize = parseSize("swatchSize", 16, 48);
  const swatchBorderWidth = parseSize("swatchBorderWidth", 0, 6);
  const swatchBorderColor = formData.get("swatchBorderColor")?.toString().trim() || null;
  const otherOptionStyle = formData.get("otherOptionStyle")?.toString();
  if (Number.isNaN(imageSize) || Number.isNaN(itemGap) ||
      swatchSize === null || Number.isNaN(swatchSize) ||
      swatchBorderWidth === null || Number.isNaN(swatchBorderWidth) ||
      (swatchBorderColor !== null && !/^#[0-9a-f]{6}$/i.test(swatchBorderColor)) ||
      !["circle", "square"].includes(swatchShape ?? "") ||
      !["boxes", "dropdown"].includes(otherOptionStyle ?? "") ||
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
      swatchShape: swatchShape!,
      swatchSize,
      swatchBorderWidth,
      swatchBorderColor,
      otherOptionStyle: otherOptionStyle!,
    },
    update: {
      headingText,
      buttonLabel,
      buttonColor,
      buttonTextColor,
      buttonBorderRadius,
      imageSize,
      itemGap,
      swatchShape: swatchShape!,
      swatchSize,
      swatchBorderWidth,
      swatchBorderColor,
      otherOptionStyle: otherOptionStyle!,
    },
  });

  return { ok: true };
};

function ColorField({
  label,
  value,
  onChange,
  placeholder,
  helpText = "Leave blank to use the store theme's color",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  helpText?: string;
}) {
  return (
    <InlineStack gap="200" blockAlign="start" wrap={false}>
      <div style={{ flexGrow: 1 }}>
        <TextField
          label={label}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="off"
          helpText={helpText}
        />
      </div>
      <div className={styles.colorPreview}>
        <Box
          borderRadius="200"
          borderWidth="025"
          borderColor="border"
          overflowX="hidden"
          overflowY="hidden"
        >
          <div
            style={{
              width: 32,
              height: 32,
              background: value || "transparent",
            }}
          />
        </Box>
      </div>
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
  const [swatchShape, setSwatchShape] = useState(data.swatchShape);
  const [swatchSize, setSwatchSize] = useState(data.swatchSize);
  const [swatchBorderWidth, setSwatchBorderWidth] = useState(data.swatchBorderWidth);
  const [swatchBorderColor, setSwatchBorderColor] = useState(data.swatchBorderColor);
  const [otherOptionStyle, setOtherOptionStyle] = useState(data.otherOptionStyle);
  const [previewColor, setPreviewColor] = useState("Burgundy");
  const [previewSize, setPreviewSize] = useState("Small");

  const previewSwatchSize = Number(swatchSize) >= 16 && Number(swatchSize) <= 48
    ? Number(swatchSize) : 28;
  const previewBorderWidth = Number(swatchBorderWidth) >= 0 && Number(swatchBorderWidth) <= 6
    ? Number(swatchBorderWidth) : 1;
  const previewBorderColor = /^#[0-9a-f]{6}$/i.test(swatchBorderColor)
    ? swatchBorderColor : "rgba(0, 0, 0, 0.2)";
  const previewButtonStyle = {
    background: /^#[0-9a-f]{6}$/i.test(buttonColor) ? buttonColor : "#1a1a1a",
    color: /^#[0-9a-f]{6}$/i.test(buttonTextColor) ? buttonTextColor : "#fff",
    border: 0,
    padding: "10px 18px",
    borderRadius: buttonBorderRadius === "" ? 40 : Number(buttonBorderRadius),
    cursor: "default",
  };

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
        buttonBorderRadius, imageSize, itemGap, swatchShape, swatchSize,
        swatchBorderWidth, swatchBorderColor, otherOptionStyle },
      { method: "POST" },
    );
  };

  return (
    <Page fullWidth>
      <TitleBar title="Design" />
      <BlockStack gap="500">
        <div className={styles.layout}>
          <div className={styles.settings}>
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
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Variant choices</Text>
                  <Text as="p" tone="subdued">Color options appear as swatches. Other options use the style selected below.</Text>
                  <Select label="Swatch shape" options={[
                    { label: "Circle", value: "circle" },
                    { label: "Square", value: "square" },
                  ]} value={swatchShape} onChange={setSwatchShape} />
                  <TextField label="Swatch size (px)" type="number"
                    value={swatchSize} onChange={setSwatchSize} autoComplete="off"
                    helpText="16–48 px" />
                  <TextField label="Swatch border thickness (px)" type="number"
                    value={swatchBorderWidth} onChange={setSwatchBorderWidth} autoComplete="off"
                    helpText="0–6 px" />
                  <ColorField label="Swatch border color" value={swatchBorderColor}
                    onChange={setSwatchBorderColor} placeholder="#333333"
                    helpText="Leave blank for the default border color" />
                  <Select label="Other option style" options={[
                    { label: "Selectable text boxes", value: "boxes" },
                    { label: "Dropdown", value: "dropdown" },
                  ]} value={otherOptionStyle} onChange={setOtherOptionStyle} />
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
          </div>

          <aside className={styles.preview}>
            <BlockStack gap="500">
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
                    <div style={{ display: "flex", flexDirection: "column",
                      gap: itemGap === "" ? 12 : Number(itemGap) }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: imageSize === "" ? 64 : Number(imageSize),
                          height: imageSize === "" ? 64 : Number(imageSize),
                          background: "#eee", borderRadius: 4, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                          <div>Sample product</div>
                          <div style={{ opacity: 0.7 }}>$24.00</div>
                          <div style={{ marginTop: 8, fontSize: 10, letterSpacing: "0.06em", opacity: 0.6 }}>COLOR</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 5 }}>
                            {([ ["Burgundy", "#800020"], ["Blue", "#2563eb"], ["Gray", "#808080"] ] as const)
                              .map(([name, color]) => (
                                <button key={name} type="button" title={name} aria-label={`Color: ${name}`}
                                  aria-pressed={previewColor === name} onClick={() => setPreviewColor(name)}
                                  style={{ width: previewSwatchSize, height: previewSwatchSize,
                                    flexShrink: 0, padding: 0, cursor: "pointer",
                                    background: color, border: `${previewBorderWidth}px solid ${previewBorderColor}`,
                                    borderRadius: swatchShape === "square" ? 4 : "50%",
                                    outline: previewColor === name ? `2px solid ${swatchBorderColor || "#333"}` : "none",
                                    outlineOffset: 2 }} />
                              ))}
                          </div>
                          <div style={{ marginTop: 10, fontSize: 10, letterSpacing: "0.06em", opacity: 0.6 }}>SIZE</div>
                          {otherOptionStyle === "dropdown" ? (
                            <select aria-label="Preview size" value={previewSize}
                              onChange={(event) => setPreviewSize(event.target.value)}
                              style={{ marginTop: 5, padding: "5px 8px", maxWidth: "100%" }}>
                              <option>Small</option><option>Medium</option><option>Large</option>
                            </select>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
                              {["Small", "Medium", "Large"].map((size) => (
                                <button key={size} type="button" aria-pressed={previewSize === size}
                                  onClick={() => setPreviewSize(size)}
                                  style={{ border: "1px solid currentColor", borderRadius: 3,
                                    padding: "4px 8px", background: "transparent", cursor: "pointer",
                                    outline: previewSize === size ? "2px solid currentColor" : "none",
                                    outlineOffset: 2 }}>{size}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button type="button" style={previewButtonStyle}>{buttonLabel || "Add"}</button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                        <div style={{ width: imageSize === "" ? 64 : Number(imageSize),
                          height: imageSize === "" ? 64 : Number(imageSize),
                          background: "#eee", borderRadius: 4, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 13 }}>Single variant product<br />
                          <span style={{ opacity: 0.7 }}>$18.00</span></div>
                        <button type="button" style={previewButtonStyle}>{buttonLabel || "Add"}</button>
                      </div>
                    </div>
                  </div>
                </BlockStack>
              </Card>
            </BlockStack>
          </aside>
        </div>
      </BlockStack>
    </Page>
  );
}
