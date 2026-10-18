import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseProductDesign } from "../product-design.server";

const MAX_PRODUCTS = 20;

type RawProduct = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  featuredImage?: { url: string; altText: string | null } | null;
  options: { name: string }[];
  variants: {
    nodes: {
      legacyResourceId: string;
      availableForSale: boolean;
      price: string;
      selectedOptions: { name: string; value: string }[];
      image?: { url: string } | null;
    }[];
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  const isProductWidget = new URL(request.url).searchParams.get("widget") === "product";

  if (!session || !admin) {
    return json({
      direction: "ltr",
      sourceType: "collection",
      displayMode: "list",
      currency: "USD",
      headingText: null,
      buttonColor: null,
      buttonTextColor: null,
      buttonBorderRadius: null,
      buttonLabel: null,
      selectButtonLabel: null,
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
      maxProducts: 6,
      shuffleProducts: false,
      pinnedProducts: [],
      products: [],
      excludedProductIds: [],
      minPrice: null,
      maxPrice: null,
      holdoutPercent: 0,
      experimentId: null,
    });
  }

  const settings = await prisma.cartUpsellSettings.findUnique({
    where: { shop: session.shop },
  });
  const design = isProductWidget ? parseProductDesign(settings?.productDesign) : settings;

  const direction = settings?.direction ?? "ltr";
  const displayMode = settings?.displayMode ?? "list";
  const sourceType = settings?.sourceType === "manual" ? "manual" : "collection";
  const headingText = design?.headingText ?? null;
  const buttonColor = design?.buttonColor ?? null;
  const buttonTextColor = design?.buttonTextColor ?? null;
  const buttonBorderRadius = design?.buttonBorderRadius ?? null;
  const buttonLabel = design?.buttonLabel ?? null;
  const selectButtonLabel = design?.selectButtonLabel ?? null;
  const imageSize = design?.imageSize ?? null;
  const itemGap = design?.itemGap ?? null;
  const swatchShape = design?.swatchShape ?? "circle";
  const swatchSize = design?.swatchSize ?? 28;
  const swatchBorderWidth = design?.swatchBorderWidth ?? 1;
  const swatchBorderColor = design?.swatchBorderColor ?? null;
  const selectedOutlineColor = design?.selectedOutlineColor ?? null;
  const selectedOutlineWidth = design?.selectedOutlineWidth ?? null;
  const otherOptionStyle = design?.otherOptionStyle ?? "boxes";
  const variantLayout = design?.variantLayout ?? "select";
  const maxProducts = isProductWidget ? design?.maxProducts ?? 6 : settings?.maxProducts ?? 6;
  const shuffleProducts = settings?.shuffleProducts ?? false;
  let excludedProductIds: number[] = [];
  try {
    const ids = JSON.parse(settings?.excludedProductIds ?? "[]");
    if (Array.isArray(ids)) {
      excludedProductIds = ids.map((id) => Number(String(id).split("/").pop()))
        .filter((id) => Number.isSafeInteger(id) && id > 0);
    }
  } catch {
    excludedProductIds = [];
  }
  const cartProductIds = new Set(
    (new URL(request.url).searchParams.get("cart_product_ids") ?? "")
      .split(",")
      .slice(0, 250)
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0),
  );

  const shopResponse = await admin.graphql(
    `#graphql
      query GetShopCurrency {
        shop { currencyCode }
      }`,
  );
  const shopJson = await shopResponse.json();
  const currency = shopJson.data?.shop?.currencyCode ?? "USD";

  let manualProducts: RawProduct[] = [];
  let collectionProducts: RawProduct[] = [];

  if (!isProductWidget && sourceType === "manual") {
    const productIds: string[] = settings ? JSON.parse(settings.productIds) : [];
    if (productIds.length > 0) {
      const response = await admin.graphql(
        `#graphql
          query GetManualProducts($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on Product {
                id
                legacyResourceId
                title
                handle
                featuredImage { url altText }
                options { name }
                variants(first: 10) {
                  nodes {
                    legacyResourceId availableForSale price
                    selectedOptions { name value }
                    image { url }
                  }
                }
              }
            }
          }`,
        { variables: { ids: productIds } },
      );
      const json = await response.json();
      manualProducts = (json.data?.nodes ?? []).filter(Boolean);
    }
  }

  if (!isProductWidget && sourceType === "collection" && settings?.collectionId) {
    let cursor: string | null = null;
    let hasNextPage = true;
    while (hasNextPage && collectionProducts.length < Math.min(maxProducts, MAX_PRODUCTS)) {
      const response: Response = await admin.graphql(
        `#graphql
          query GetCollectionProducts($id: ID!, $after: String) {
            collection(id: $id) {
              products(first: 50, after: $after) {
                nodes {
                  id
                  legacyResourceId
                  title
                  handle
                  featuredImage { url altText }
                  options { name }
                  variants(first: 10) {
                    nodes {
                      legacyResourceId availableForSale price
                      selectedOptions { name value }
                      image { url }
                    }
                  }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          }`,
        { variables: { id: settings.collectionId, after: cursor } },
      );
      const result: {
        data?: { collection?: { products?: {
          nodes: RawProduct[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        } } };
      } = await response.json();
      const page = result.data?.collection?.products;
      if (!page) break;
      collectionProducts.push(...page.nodes.filter((product) =>
        !cartProductIds.has(Number(product.legacyResourceId)) &&
        !excludedProductIds.includes(Number(product.legacyResourceId)) &&
        product.variants.nodes.some((variant) => variant.availableForSale),
      ).slice(0, Math.min(maxProducts, MAX_PRODUCTS) - collectionProducts.length));
      cursor = page.pageInfo?.endCursor ?? null;
      hasNextPage = Boolean(page.pageInfo?.hasNextPage && cursor);
    }
  }

  const toOffers = (rawProducts: RawProduct[]) => rawProducts
    .map((product) => {
      const variant = product.variants.nodes.find((candidate) => candidate.availableForSale);
      if (!variant) return null;

      const image = product.featuredImage?.url
        ? `${product.featuredImage.url}${
            product.featuredImage.url.includes("?") ? "&" : "?"
          }width=160`
        : null;

      return {
        productId: Number(product.legacyResourceId),
        variantId: Number(variant.legacyResourceId),
        title: product.title,
        handle: product.handle,
        url: `/products/${product.handle}`,
        image,
        price: variant.price,
        options: (product.options ?? []).map((option) => option.name),
        variants: product.variants.nodes.map((candidate) => ({
          id: Number(candidate.legacyResourceId),
          available: candidate.availableForSale,
          price: Math.round(Number(candidate.price) * 100),
          option1: candidate.selectedOptions?.[0]?.value ?? null,
          option2: candidate.selectedOptions?.[1]?.value ?? null,
          option3: candidate.selectedOptions?.[2]?.value ?? null,
          featured_image: candidate.image?.url ? { src: candidate.image.url } : null,
        })),
      };
    })
    .filter((product): product is NonNullable<typeof product> => product !== null);

  const products = sourceType === "manual"
    ? toOffers(manualProducts)
    : toOffers(collectionProducts);

  return json({
    direction,
    sourceType,
    displayMode,
    currency,
    headingText,
    buttonColor,
    buttonTextColor,
    buttonBorderRadius,
    buttonLabel,
    selectButtonLabel,
    imageSize,
    itemGap,
    swatchShape,
    swatchSize,
    swatchBorderWidth,
    swatchBorderColor,
    selectedOutlineColor,
    selectedOutlineWidth,
    otherOptionStyle,
    variantLayout,
    maxProducts,
    shuffleProducts,
    pinnedProducts: [],
    products,
    excludedProductIds: sourceType === "collection" ? excludedProductIds : [],
    minPrice: null,
    maxPrice: null,
    holdoutPercent: 0,
    experimentId: null,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const type = body?.type ?? "add_to_cart";

  if (type === "assignment") {
    const settings = await prisma.cartUpsellSettings.findUnique({
      where: { shop: session.shop },
      select: { experimentId: true, holdoutPercent: true },
    });
    if (!settings?.holdoutPercent || !settings.experimentId ||
        body?.experimentId !== settings.experimentId ||
        !["control", "variant"].includes(body?.cohort) ||
        typeof body?.visitorId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.visitorId)) {
      return json({ ok: false }, { status: 400 });
    }
    await prisma.experimentAssignment.createMany({
      data: [{ shop: session.shop, experimentId: settings.experimentId,
        visitorId: body.visitorId, cohort: body.cohort }],
      skipDuplicates: true,
    });
    return json({ ok: true });
  }

  if (!["impression", "click", "add_to_cart"].includes(type)) {
    return json({ ok: false }, { status: 400 });
  }

  const ids = type === "impression" ? body?.productIds : [body?.productId];
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_PRODUCTS ||
      ids.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    return json({ ok: false }, { status: 400 });
  }

  const quantity = type === "add_to_cart" ? Number(body?.quantity) : 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    return json({ ok: false }, { status: 400 });
  }

  await prisma.upsellEvent.createMany({
    data: ids.map((id: number | string) => ({
      shop: session.shop,
      type,
      productId: String(id),
      quantity,
    })),
  });

  return json({ ok: true });
};
