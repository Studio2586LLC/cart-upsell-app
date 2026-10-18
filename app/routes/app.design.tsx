import { useEffect, useState, type ReactNode } from "react";
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
  Icon,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { CartIcon, ProductIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { defaultProductDesign, parseProductDesign, type WidgetDesign } from "../product-design.server";
import styles from "../styles/design.module.css";
import { ProductThumbnail } from "../components/ProductThumbnail";

type Widget = "cart" | "product";

function toFormValues(design: WidgetDesign) {
  return {
    headingText: design.headingText ?? "",
    buttonLabel: design.buttonLabel ?? "",
    selectButtonLabel: design.selectButtonLabel ?? "",
    buttonColor: design.buttonColor ?? "",
    buttonTextColor: design.buttonTextColor ?? "",
    buttonBorderRadius: design.buttonBorderRadius?.toString() ?? "",
    imageSize: design.imageSize?.toString() ?? "",
    itemGap: design.itemGap?.toString() ?? "",
    swatchShape: design.swatchShape,
    swatchSize: design.swatchSize.toString(),
    swatchBorderWidth: design.swatchBorderWidth.toString(),
    swatchBorderColor: design.swatchBorderColor ?? "",
    selectedOutlineColor: design.selectedOutlineColor ?? "",
    selectedOutlineWidth: design.selectedOutlineWidth?.toString() ?? "",
    otherOptionStyle: design.otherOptionStyle,
    variantLayout: design.variantLayout,
    maxProducts: design.maxProducts.toString(),
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const settings = await prisma.cartUpsellSettings.findUnique({
    where: { shop: session.shop },
  });

  return {
    cart: toFormValues(settings ?? defaultProductDesign),
    product: toFormValues(parseProductDesign(settings?.productDesign)),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const widget: Widget = formData.get("widget") === "product" ? "product" : "cart";

  const headingText = formData.get("headingText")?.toString().trim().slice(0, 120) || null;
  const buttonLabel = formData.get("buttonLabel")?.toString().trim().slice(0, 60) || null;
  const selectButtonLabel = formData.get("selectButtonLabel")?.toString().trim().slice(0, 60) || null;
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
  const selectedOutlineColor = formData.get("selectedOutlineColor")?.toString().trim() || null;
  const selectedOutlineWidth = parseSize("selectedOutlineWidth", 0, 6);
  const otherOptionStyle = formData.get("otherOptionStyle")?.toString();
  const variantLayout = formData.get("variantLayout")?.toString();
  const maxProducts = Number(formData.get("maxProducts"));
  if (!Number.isInteger(maxProducts) || maxProducts < 1 ||
      maxProducts > (widget === "product" ? 10 : 20)) {
    return { ok: false, error: `Choose between 1 and ${widget === "product" ? 10 : 20} products.`, widget };
  }
  if (Number.isNaN(imageSize) || Number.isNaN(itemGap) ||
      swatchSize === null || Number.isNaN(swatchSize) ||
      swatchBorderWidth === null || Number.isNaN(swatchBorderWidth) ||
      (swatchBorderColor !== null && !/^#[0-9a-f]{6}$/i.test(swatchBorderColor)) ||
      (selectedOutlineColor !== null && !/^#[0-9a-f]{6}$/i.test(selectedOutlineColor)) ||
      Number.isNaN(selectedOutlineWidth) ||
      !["circle", "square"].includes(swatchShape ?? "") ||
      !["boxes", "dropdown"].includes(otherOptionStyle ?? "") ||
      !["select", "regular"].includes(variantLayout ?? "") ||
      [buttonColor, buttonTextColor].some((color) => color !== null &&
        !/^#[0-9a-f]{6}$/i.test(color)) ||
      (buttonBorderRadius !== null &&
        (!Number.isInteger(buttonBorderRadius) || buttonBorderRadius < 0 || buttonBorderRadius > 60))) {
    return { ok: false, error: "Enter valid colors, sizes, and corner radius.", widget };
  }

  const design: WidgetDesign = {
    headingText,
    buttonLabel,
    selectButtonLabel,
    buttonColor,
    buttonTextColor,
    buttonBorderRadius,
    imageSize,
    itemGap,
    swatchShape: swatchShape!,
    swatchSize: swatchSize!,
    swatchBorderWidth: swatchBorderWidth!,
    swatchBorderColor,
    selectedOutlineColor,
    selectedOutlineWidth,
    otherOptionStyle: otherOptionStyle!,
    variantLayout: variantLayout!,
    maxProducts,
  };

  if (widget === "product") {
    await prisma.cartUpsellSettings.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, productDesign: JSON.stringify(design) },
      update: { productDesign: JSON.stringify(design) },
    });
    return { ok: true, widget };
  }

  await prisma.cartUpsellSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      headingText,
      buttonLabel,
      selectButtonLabel,
      buttonColor,
      buttonTextColor,
      buttonBorderRadius,
      imageSize,
      itemGap,
      swatchShape: swatchShape!,
      swatchSize,
      swatchBorderWidth,
      swatchBorderColor,
      selectedOutlineColor,
      selectedOutlineWidth,
      otherOptionStyle: otherOptionStyle!,
      variantLayout: variantLayout!,
      maxProducts,
    },
    update: {
      headingText,
      buttonLabel,
      selectButtonLabel,
      buttonColor,
      buttonTextColor,
      buttonBorderRadius,
      imageSize,
      itemGap,
      swatchShape: swatchShape!,
      swatchSize,
      swatchBorderWidth,
      swatchBorderColor,
      selectedOutlineColor,
      selectedOutlineWidth,
      otherOptionStyle: otherOptionStyle!,
      variantLayout: variantLayout!,
      maxProducts,
    },
  });

  return { ok: true, widget };
};

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <Card>
      <details className={styles.settingsSection} open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className={styles.settingsSectionHeading}>
          <Text as="h2" variant="headingMd">{title}</Text>
        </summary>
        <div className={styles.settingsSectionBody}>{children}</div>
      </details>
    </Card>
  );
}

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
              width: 30,
              height: 30,
              background: value || "transparent",
            }}
          />
        </Box>
        <input
          type="color"
          className={styles.colorInput}
          aria-label={`${label} color picker`}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : placeholder}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
    </InlineStack>
  );
}

export default function Design() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [activeWidget, setActiveWidget] = useState<Widget>("cart");
  const [designs, setDesigns] = useState({ cart: data.cart, product: data.product });
  const design = designs[activeWidget];
  const {
    headingText, buttonLabel, selectButtonLabel, buttonColor, buttonTextColor,
    buttonBorderRadius, imageSize, itemGap, swatchShape, swatchSize,
    swatchBorderWidth, swatchBorderColor, selectedOutlineColor,
    selectedOutlineWidth, otherOptionStyle, variantLayout, maxProducts,
  } = design;
  const setField = (field: keyof typeof design, value: string) => {
    setDesigns((previous) => ({
      ...previous,
      [activeWidget]: { ...previous[activeWidget], [field]: value },
    }));
  };
  const setHeadingText = (value: string) => setField("headingText", value);
  const setButtonLabel = (value: string) => setField("buttonLabel", value);
  const setSelectButtonLabel = (value: string) => setField("selectButtonLabel", value);
  const setButtonColor = (value: string) => setField("buttonColor", value);
  const setButtonTextColor = (value: string) => setField("buttonTextColor", value);
  const setButtonBorderRadius = (value: string) => setField("buttonBorderRadius", value);
  const setImageSize = (value: string) => setField("imageSize", value);
  const setItemGap = (value: string) => setField("itemGap", value);
  const setSwatchShape = (value: string) => setField("swatchShape", value);
  const setSwatchSize = (value: string) => setField("swatchSize", value);
  const setSwatchBorderWidth = (value: string) => setField("swatchBorderWidth", value);
  const setSwatchBorderColor = (value: string) => setField("swatchBorderColor", value);
  const setSelectedOutlineColor = (value: string) => setField("selectedOutlineColor", value);
  const setSelectedOutlineWidth = (value: string) => setField("selectedOutlineWidth", value);
  const setOtherOptionStyle = (value: string) => setField("otherOptionStyle", value);
  const setVariantLayout = (value: string) => setField("variantLayout", value);
  const setMaxProducts = (value: string) => setField("maxProducts", value);
  const [previewPickerOpen, setPreviewPickerOpen] = useState(false);
  const [previewColor, setPreviewColor] = useState("Burgundy");
  const [previewSize, setPreviewSize] = useState("Small");
  const showPreviewOptions = variantLayout === "regular" || previewPickerOpen;

  const previewSwatchSize = Number(swatchSize) >= 16 && Number(swatchSize) <= 48
    ? Number(swatchSize) : 28;
  const previewBorderWidth = Number(swatchBorderWidth) >= 0 && Number(swatchBorderWidth) <= 6
    ? Number(swatchBorderWidth) : 1;
  const previewBorderColor = /^#[0-9a-f]{6}$/i.test(swatchBorderColor)
    ? swatchBorderColor : "rgba(0, 0, 0, 0.2)";
  const previewSelectedOutlineColor = /^#[0-9a-f]{6}$/i.test(selectedOutlineColor)
    ? selectedOutlineColor : "";
  const previewSelectedOutlineWidth = selectedOutlineWidth !== "" &&
    Number.isInteger(Number(selectedOutlineWidth)) && Number(selectedOutlineWidth) >= 0 &&
    Number(selectedOutlineWidth) <= 6 ? Number(selectedOutlineWidth) : null;
  const previewSwatchOutlineWidth = previewSelectedOutlineWidth ?? previewBorderWidth;
  const previewButtonStyle = {
    background: /^#[0-9a-f]{6}$/i.test(buttonColor) ? buttonColor : "#1a1a1a",
    color: /^#[0-9a-f]{6}$/i.test(buttonTextColor) ? buttonTextColor : "#fff",
    border: 0,
    padding: "10px 18px",
    cursor: "pointer",
    borderRadius: buttonBorderRadius === "" ? 40 : Number(buttonBorderRadius),
  };

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show(`${fetcher.data.widget === "product" ? "Product" : "Cart"} design saved`);
    } else if (fetcher.data && "error" in fetcher.data && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    fetcher.submit(
      { widget: activeWidget, ...design },
      { method: "POST" },
    );
  };

  return (
    <Page fullWidth>
      <TitleBar title="Design" />
      <BlockStack gap="500">
        <div className={styles.layout}>
          <nav className={styles.widgetNav} aria-label="Widget design">
            <button type="button" className={styles.widgetNavButton}
              aria-pressed={activeWidget === "cart"}
              onClick={() => { setActiveWidget("cart"); setPreviewPickerOpen(false); }}>
              <Icon source={CartIcon} />
              <span>Cart widget</span>
            </button>
            <button type="button" className={styles.widgetNavButton}
              aria-pressed={activeWidget === "product"}
              onClick={() => { setActiveWidget("product"); setPreviewPickerOpen(false); }}>
              <Icon source={ProductIcon} />
              <span>Product widget</span>
            </button>
          </nav>
          <div className={styles.settings}>
            <BlockStack gap="500">
              <div>
                <Text as="h2" variant="headingLg">
                  {activeWidget === "cart" ? "Cart widget" : "Product widget"}
                </Text>
                {activeWidget === "product" && <Text as="p" tone="subdued">
                  Offers come from each product’s complementary products in Search & Discovery.
                </Text>}
              </div>
              <SettingsSection title="Copy">
                <BlockStack gap="400">
                  <TextField
                    label="Heading"
                    value={headingText}
                    onChange={setHeadingText}
                    placeholder={activeWidget === "cart" ? "Complete your order" : "Pairs well with"}
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
                  <TextField
                    label="Select button text"
                    value={selectButtonLabel}
                    onChange={setSelectButtonLabel}
                    placeholder="Select"
                    autoComplete="off"
                    helpText="Leave blank for the translated default"
                  />
                </BlockStack>
              </SettingsSection>

              <SettingsSection title="Button">
                <BlockStack gap="400">
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
              </SettingsSection>

              <SettingsSection title="Layout details">
                <BlockStack gap="400">
                  <TextField label="Maximum products shown" type="number"
                    value={maxProducts} onChange={setMaxProducts} min={1}
                    max={activeWidget === "product" ? 10 : 20} autoComplete="off"
                    helpText={activeWidget === "product" ? "Show up to 10 complementary products" : "Show up to 20 cart products"} />
                  <TextField label="Product image size (px)" type="number"
                    value={imageSize} onChange={setImageSize} placeholder="64"
                    autoComplete="off" helpText="40–120 px; blank uses the default" />
                  <TextField label="Space between products (px)" type="number"
                    value={itemGap} onChange={setItemGap} placeholder="12"
                    autoComplete="off" helpText="0–40 px; blank uses the default" />
                </BlockStack>
              </SettingsSection>

              <SettingsSection title="Variant choices">
                <BlockStack gap="400">
                  <Text as="p" tone="subdued">Color options appear as swatches. Other options use the style selected below.</Text>
                  <Select label="Variant layout" options={[
                    { label: "Select to show", value: "select" },
                    { label: "Regular", value: "regular" },
                  ]} value={variantLayout} onChange={(value) => {
                    setVariantLayout(value);
                    setPreviewPickerOpen(false);
                  }} helpText="Select to show reveals variant choices after the Select button is clicked" />
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
                  <ColorField label="Selected outline color" value={selectedOutlineColor}
                    onChange={setSelectedOutlineColor} placeholder="#333333"
                    helpText="Leave blank to use the current outline colors" />
                  <TextField label="Selected outline thickness (px)" type="number"
                    value={selectedOutlineWidth} onChange={setSelectedOutlineWidth}
                    autoComplete="off" helpText="0–6 px; blank uses the existing thickness" />
                  <Select label="Other option style" options={[
                    { label: "Selectable text boxes", value: "boxes" },
                    { label: "Dropdown", value: "dropdown" },
                  ]} value={otherOptionStyle} onChange={setOtherOptionStyle} />
                </BlockStack>
              </SettingsSection>

              <InlineStack>
                <Button
                  variant="primary"
                  loading={isSaving}
                  onClick={handleSave}
                >
                  Save {activeWidget} design
                </Button>
              </InlineStack>
            </BlockStack>
          </div>

          <aside className={styles.preview}>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {activeWidget === "cart" ? "Cart preview" : "Product preview"}
                  </Text>
                  <Text as="p" tone="subdued">
                    Illustrative preview. Theme colors and fonts are inherited on the storefront.
                  </Text>
                  <Text as="p" tone="subdued">
                    {Number(maxProducts) === 1 ? "Shows one product." :
                      `Shows up to ${maxProducts || (activeWidget === "product" ? "10" : "20")} products; two samples appear below.`}
                  </Text>
                  <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
                    {activeWidget === "product" && <div className={styles.productContext}>
                      <ProductThumbnail size={52} />
                      <div>
                        <div style={{ fontWeight: 600 }}>Example product</div>
                        <div style={{ opacity: 0.7 }}>$48.00</div>
                      </div>
                    </div>}
                    <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
                      {headingText || (activeWidget === "cart" ? "Complete your order" : "Pairs well with")}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column",
                      gap: itemGap === "" ? 12 : Number(itemGap) }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
                        <ProductThumbnail size={imageSize === "" ? 64 : Number(imageSize)} />
                        <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                          <div>{activeWidget === "cart" ? "Sample product" : "Matching accessory"}</div>
                          <div style={{ opacity: 0.7 }}>$24.00</div>
                          {showPreviewOptions && <>
                          <div style={{ marginTop: 8, fontSize: 10, letterSpacing: "0.06em", opacity: 0.6 }}>COLOR</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 5 }}>
                            {([ ["Burgundy", "#800020"], ["Blue", "#2563eb"], ["Gray", "#808080"] ] as const)
                              .map(([name, color]) => (
                                <button key={name} type="button" title={name} aria-label={`Color: ${name}`}
                                  aria-pressed={previewColor === name} onClick={() => setPreviewColor(name)}
                                  style={{ width: previewSwatchSize, height: previewSwatchSize,
                                    flexShrink: 0, padding: 0, cursor: "pointer",
                                    boxSizing: "border-box", background: color,
                                    border: `1px solid ${previewBorderColor}`,
                                    borderRadius: swatchShape === "square" ? 4 : "50%",
                                    outline: previewColor === name && previewSwatchOutlineWidth > 0
                                      ? `${previewSwatchOutlineWidth}px solid ${previewSelectedOutlineColor || swatchBorderColor || "#333"}` : "none",
                                    outlineOffset: 2,
                                    color: "#fff", textShadow: "0 0 2px #000, 0 0 2px #000",
                                    fontSize: 14, fontWeight: 700 }}>
                                  {previewColor === name && previewSwatchOutlineWidth === 0 ? "✓" : null}
                                </button>
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
                                    outline: previewSize === size
                                      ? `${previewSelectedOutlineWidth ?? 2}px solid ${previewSelectedOutlineColor || "currentColor"}` : "none",
                                    outlineOffset: 2 }}>{size}</button>
                              ))}
                            </div>
                          )}
                          </>}
                        </div>
                        <button type="button" style={previewButtonStyle}
                          onClick={() => { if (!showPreviewOptions) setPreviewPickerOpen(true); }}>
                          {showPreviewOptions ? buttonLabel || "Add" : selectButtonLabel || "Select"}
                        </button>
                      </div>
                      {Number(maxProducts) !== 1 && <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                        <ProductThumbnail size={imageSize === "" ? 64 : Number(imageSize)} />
                        <div style={{ flex: 1, fontSize: 13 }}>
                          {activeWidget === "cart" ? "Single variant product" : "Care kit"}<br />
                          <span style={{ opacity: 0.7 }}>$18.00</span></div>
                        <button type="button" style={previewButtonStyle}>{buttonLabel || "Add"}</button>
                      </div>}
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
