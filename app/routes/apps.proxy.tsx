import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const MAX_PRODUCTS = 20;

type RawProduct = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  featuredImage?: { url: string; altText: string | null } | null;
  variants: {
    nodes: {
      legacyResourceId: string;
      availableForSale: boolean;
      price: string;
    }[];
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);

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
      imageSize: null,
      itemGap: null,
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

  const direction = settings?.direction ?? "ltr";
  const displayMode = settings?.displayMode ?? "list";
  const sourceType = settings?.sourceType === "manual" ? "manual" : "collection";
  const headingText = settings?.headingText ?? null;
  const buttonColor = settings?.buttonColor ?? null;
  const buttonTextColor = settings?.buttonTextColor ?? null;
  const buttonBorderRadius = settings?.buttonBorderRadius ?? null;
  const buttonLabel = settings?.buttonLabel ?? null;
  const imageSize = settings?.imageSize ?? null;
  const itemGap = settings?.itemGap ?? null;
  const maxProducts = settings?.maxProducts ?? 6;
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

  if (sourceType === "manual") {
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
                variants(first: 10) {
                  nodes { legacyResourceId availableForSale price }
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

  if (sourceType === "collection" && settings?.collectionId) {
    const response = await admin.graphql(
      `#graphql
        query GetCollectionProducts($id: ID!, $first: Int!) {
          collection(id: $id) {
            products(first: $first) {
              nodes {
                id
                legacyResourceId
                title
                handle
                featuredImage { url altText }
                variants(first: 10) {
                  nodes { legacyResourceId availableForSale price }
                }
              }
            }
          }
        }`,
      { variables: { id: settings.collectionId, first: MAX_PRODUCTS } },
    );
    const json = await response.json();
    collectionProducts = json.data?.collection?.products?.nodes ?? [];
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
    imageSize,
    itemGap,
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
