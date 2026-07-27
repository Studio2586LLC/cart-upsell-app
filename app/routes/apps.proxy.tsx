import type { LoaderFunctionArgs } from "@remix-run/node";
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
    return Response.json({
      direction: "ltr",
      displayMode: "list",
      currency: "USD",
      products: [],
    });
  }

  const settings = await prisma.cartUpsellSettings.findUnique({
    where: { shop: session.shop },
  });

  const direction = settings?.direction ?? "ltr";
  const displayMode = settings?.displayMode ?? "list";
  const sourceType = settings?.sourceType ?? "collection";

  const shopResponse = await admin.graphql(
    `#graphql
      query GetShopCurrency {
        shop { currencyCode }
      }`,
  );
  const shopJson = await shopResponse.json();
  const currency = shopJson.data?.shop?.currencyCode ?? "USD";

  let rawProducts: RawProduct[] = [];

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
                variants(first: 1) {
                  nodes { legacyResourceId availableForSale price }
                }
              }
            }
          }`,
        { variables: { ids: productIds } },
      );
      const json = await response.json();
      rawProducts = (json.data?.nodes ?? []).filter(Boolean);
    }
  } else if (settings?.collectionId) {
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
                variants(first: 1) {
                  nodes { legacyResourceId availableForSale price }
                }
              }
            }
          }
        }`,
      { variables: { id: settings.collectionId, first: MAX_PRODUCTS } },
    );
    const json = await response.json();
    rawProducts = json.data?.collection?.products?.nodes ?? [];
  }

  const products = rawProducts
    .map((product) => {
      const variant = product.variants.nodes[0];
      if (!variant || !variant.availableForSale) return null;

      const image = product.featuredImage?.url
        ? `${product.featuredImage.url}${
            product.featuredImage.url.includes("?") ? "&" : "?"
          }width=160`
        : null;

      return {
        productId: Number(product.legacyResourceId),
        variantId: Number(variant.legacyResourceId),
        title: product.title,
        url: `/products/${product.handle}`,
        image,
        price: variant.price,
      };
    })
    .filter((product): product is NonNullable<typeof product> => product !== null);

  return Response.json({ direction, displayMode, currency, products });
};
