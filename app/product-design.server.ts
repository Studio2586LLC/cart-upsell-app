export type WidgetDesign = {
  headingText: string | null;
  buttonLabel: string | null;
  selectButtonLabel: string | null;
  buttonColor: string | null;
  buttonTextColor: string | null;
  buttonBorderRadius: number | null;
  imageSize: number | null;
  itemGap: number | null;
  swatchShape: string;
  swatchSize: number;
  swatchBorderWidth: number;
  swatchBorderColor: string | null;
  selectedOutlineColor: string | null;
  selectedOutlineWidth: number | null;
  otherOptionStyle: string;
  variantLayout: string;
};

export const defaultProductDesign: WidgetDesign = {
  headingText: null,
  buttonLabel: null,
  selectButtonLabel: null,
  buttonColor: null,
  buttonTextColor: null,
  buttonBorderRadius: null,
  imageSize: null,
  itemGap: null,
  swatchShape: "circle",
  swatchSize: 28,
  swatchBorderWidth: 1,
  swatchBorderColor: null,
  selectedOutlineColor: null,
  selectedOutlineWidth: null,
  otherOptionStyle: "boxes",
  variantLayout: "select",
};

export function parseProductDesign(raw: string | null | undefined): WidgetDesign {
  if (!raw) return { ...defaultProductDesign };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...defaultProductDesign };
    }
    return { ...defaultProductDesign, ...parsed };
  } catch {
    return { ...defaultProductDesign };
  }
}
