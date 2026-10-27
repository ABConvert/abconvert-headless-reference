// The Storefront API: catalog reads for the cached pages, and the cart.
//
// Connect a dev store through its Headless channel (Shopify admin, Sales
// channels, Headless, your storefront): it issues a public and a private
// access token. Every call here runs on the server, so the private token is
// used when set, in `Shopify-Storefront-Private-Token`, and never reaches the
// browser. Requests a shopper causes (the cart) also carry the shopper's IP in
// `Shopify-Storefront-Buyer-IP`, which Shopify asks for so it does not throttle
// or bot-flag them. Cached catalog reads are not buyer traffic and skip it.
// https://shopify.dev/docs/api/storefront#authentication
//
// With no store set, the catalog is hardware.mock.shop, Shopify's public
// sample store: pages and carts work, but no ABConvert test runs there.
import 'server-only';

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || '';
const PRIVATE_TOKEN = process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN || '';
const PUBLIC_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN || '';
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-10';

const ENDPOINT = DOMAIN ? `https://${DOMAIN}/api/${API_VERSION}/graphql.json` : 'https://hardware.mock.shop/api';
export const STORE_LABEL = DOMAIN || 'hardware.mock.shop (sample catalog)';

export interface Money { amount: number; currency: string }
export interface Product {
  /** Storefront API IDs, as returned (`gid://shopify/...`): the SDK takes them as they are. */
  id: string;
  variantId: string;
  handle: string;
  title: string;
  description: string;
  /** For a price test by product type: the SDK prices the product by its type. */
  productType: string;
  image: { url: string; altText: string | null } | null;
  price: Money;
  compareAtPrice: Money | null;
}
export interface Collection { handle: string; title: string }
export interface Attribute { key: string; value: string }
export interface CartLine {
  id: string; quantity: number; attributes: Attribute[]; title: string; productId: string; variantId: string; handle: string;
  image: { url: string; altText: string | null } | null;
  /** What checkout charges per unit. Once the cart carries ABConvert's attributes, it includes the test price. */
  cost: Money;
  /** The same for the whole line: the unit price times the quantity, before cart-level discounts. */
  total: Money;
  /** The product variant's own prices, which the test does not change: they name the price test behind the line. */
  productType: string;
  price: Money;
  compareAtPrice: Money | null;
}
export interface Cart { id: string; checkoutUrl: string; attributes: Attribute[]; lines: CartLine[]; subtotal: Money }

interface Call {
  country: string;
  /** The shopper's IP, for a request a shopper caused. */
  buyerIp?: string;
  /** Catalog reads are cached with the page they render; cart calls never are. */
  cache: 'page' | 'none';
}

async function storefront<T>(query: string, variables: Record<string, unknown>, call: Call): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (PRIVATE_TOKEN) {
    headers['Shopify-Storefront-Private-Token'] = PRIVATE_TOKEN;
    if (call.buyerIp) headers['Shopify-Storefront-Buyer-IP'] = call.buyerIp;
  } else if (PUBLIC_TOKEN) {
    headers['X-Shopify-Storefront-Access-Token'] = PUBLIC_TOKEN;
  }
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    // The country in context: prices for that market (international pricing guide).
    body: JSON.stringify({ query: query.replace('@inContext', `@inContext(country: ${call.country})`), variables }),
    ...(call.cache === 'page' ? { next: { revalidate: 60 } } : { cache: 'no-store' as const }),
  });
  const json = (await response.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || json.errors?.length) {
    throw new Error(`Storefront API ${response.status}: ${json.errors?.map((error) => error.message).join('; ') ?? 'no body'}`);
  }
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const PRODUCT_FIELDS = `
  id handle title description productType
  featuredImage { url altText }
  variants(first: 1) { nodes { id price { amount currencyCode } compareAtPrice { amount currencyCode } } }
`;

type RawMoney = { amount: string; currencyCode: string };
type RawProduct = {
  id: string; handle: string; title: string; description: string; productType: string;
  featuredImage: { url: string; altText: string | null } | null;
  variants: { nodes: { id: string; price: RawMoney; compareAtPrice: RawMoney | null }[] };
};

const money = (raw: RawMoney): Money => ({ amount: Number(raw.amount), currency: raw.currencyCode });

/** The product with its first product variant: this store sells one product variant per product. */
function toProduct(raw: RawProduct): Product | null {
  const variant = raw.variants.nodes[0];
  if (!variant) return null;
  return {
    id: raw.id,
    variantId: variant.id,
    handle: raw.handle,
    title: raw.title,
    description: raw.description,
    productType: raw.productType,
    image: raw.featuredImage,
    price: money(variant.price),
    compareAtPrice: variant.compareAtPrice ? money(variant.compareAtPrice) : null,
  };
}
const products = (nodes: RawProduct[]) => nodes.map(toProduct).filter((product): product is Product => product !== null);

export async function getCollections(): Promise<Collection[]> {
  const data = await storefront<{ collections: { nodes: Collection[] } }>(`query { collections(first: 6) { nodes { handle title } } }`, {}, { country: 'US', cache: 'page' });
  return data.collections.nodes;
}

export async function getFeatured(country: string): Promise<Product[]> {
  const data = await storefront<{ products: { nodes: RawProduct[] } }>(`query @inContext { products(first: 8, sortKey: BEST_SELLING) { nodes { ${PRODUCT_FIELDS} } } }`, {}, { country, cache: 'page' });
  return products(data.products.nodes);
}

export async function getCollection(handle: string, country: string): Promise<{ collection: Collection; products: Product[] } | null> {
  const data = await storefront<{ collection: (Collection & { products: { nodes: RawProduct[] } }) | null }>(
    `query ($handle: String!) @inContext { collection(handle: $handle) { handle title products(first: 24) { nodes { ${PRODUCT_FIELDS} } } } }`,
    { handle },
    { country, cache: 'page' },
  );
  if (!data.collection) return null;
  return { collection: { handle: data.collection.handle, title: data.collection.title }, products: products(data.collection.products.nodes) };
}

export async function getProduct(handle: string, country: string): Promise<Product | null> {
  const data = await storefront<{ product: RawProduct | null }>(`query ($handle: String!) @inContext { product(handle: $handle) { ${PRODUCT_FIELDS} } }`, { handle }, { country, cache: 'page' });
  return data.product ? toProduct(data.product) : null;
}

/** Shopify's related products for a product, for the cart drawer. Not shopper-specific, so cached like a page. */
export async function getRecommendations(productId: string, country: string): Promise<Product[]> {
  const data = await storefront<{ productRecommendations: RawProduct[] | null }>(
    `query ($productId: ID!) @inContext { productRecommendations(productId: $productId, intent: RELATED) { ${PRODUCT_FIELDS} } }`,
    { productId },
    { country, cache: 'page' },
  );
  return products(data.productRecommendations ?? []);
}

export async function searchProducts(text: string, country: string): Promise<Product[]> {
  if (!text.trim()) return [];
  const data = await storefront<{ products: { nodes: RawProduct[] } }>(`query ($query: String!) @inContext { products(first: 24, query: $query) { nodes { ${PRODUCT_FIELDS} } } }`, { query: text }, { country, cache: 'none' });
  return products(data.products.nodes);
}

// ---------------------------------------------------------------------------
// Cart (https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage)
// The cart ID carries a secret key: keep it in an httpOnly cookie, never in a page.
// ---------------------------------------------------------------------------

// Line `cost` and the cart's `subtotalAmount` are what checkout charges: with
// ABConvert's attributes on the cart, Shopify applies the test price to them.
// The product variant's own `price` stays the original.
const CART_FIELDS = `
  id checkoutUrl
  attributes { key value }
  cost { subtotalAmount { amount currencyCode } }
  lines(first: 50) {
    nodes {
      id quantity
      attributes { key value }
      cost { amountPerQuantity { amount currencyCode } subtotalAmount { amount currencyCode } }
      merchandise { ... on ProductVariant { id image { url altText } price { amount currencyCode } compareAtPrice { amount currencyCode } product { id handle title productType } } }
    }
  }
`;

type RawCart = {
  id: string; checkoutUrl: string; attributes: Attribute[]; cost: { subtotalAmount: RawMoney };
  lines: { nodes: { id: string; quantity: number; attributes: Attribute[]; cost: { amountPerQuantity: RawMoney; subtotalAmount: RawMoney }; merchandise: { id: string; image: { url: string; altText: string | null } | null; price: RawMoney; compareAtPrice: RawMoney | null; product: { id: string; handle: string; title: string; productType: string } } }[] };
};
type Payload = { cart: RawCart | null; userErrors: { message: string }[] };

function toCart(payload: Payload | { cart: RawCart | null }): Cart | null {
  const errors = 'userErrors' in payload ? payload.userErrors : [];
  if (errors.length) throw new Error(`Storefront API: ${errors.map((error) => error.message).join('; ')}`);
  const raw = payload.cart;
  return raw && {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    attributes: raw.attributes,
    subtotal: money(raw.cost.subtotalAmount),
    lines: raw.lines.nodes.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      attributes: line.attributes,
      title: line.merchandise.product.title,
      productId: line.merchandise.product.id,
      variantId: line.merchandise.id,
      handle: line.merchandise.product.handle,
      image: line.merchandise.image,
      cost: money(line.cost.amountPerQuantity),
      total: money(line.cost.subtotalAmount),
      productType: line.merchandise.product.productType,
      price: money(line.merchandise.price),
      compareAtPrice: line.merchandise.compareAtPrice ? money(line.merchandise.compareAtPrice) : null,
    })),
  };
}

export interface LineInput { variantId: string; quantity: number; attributes: Attribute[] }
const lineInputs = (lines: LineInput[]) => lines.map(({ variantId, quantity, attributes }) => ({ merchandiseId: variantId, quantity, attributes }));

export async function createCart(input: { lines: LineInput[]; attributes: Attribute[]; country: string; buyerIp?: string }): Promise<Cart> {
  const data = await storefront<{ cartCreate: Payload }>(
    `mutation ($input: CartInput!) @inContext { cartCreate(input: $input) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    // The cart's country prices the cart and checkout for that market.
    { input: { lines: lineInputs(input.lines), attributes: input.attributes, buyerIdentity: { countryCode: input.country } } },
    { country: input.country, buyerIp: input.buyerIp, cache: 'none' },
  );
  return toCart(data.cartCreate)!;
}

export async function addLines(cartId: string, lines: LineInput[], call: { country: string; buyerIp?: string }): Promise<Cart> {
  const data = await storefront<{ cartLinesAdd: Payload }>(
    `mutation ($cartId: ID!, $lines: [CartLineInput!]!) @inContext { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    { cartId, lines: lineInputs(lines) },
    { ...call, cache: 'none' },
  );
  return toCart(data.cartLinesAdd)!;
}

export async function updateAttributes(cartId: string, attributes: Attribute[], call: { country: string; buyerIp?: string }): Promise<Cart> {
  const data = await storefront<{ cartAttributesUpdate: Payload }>(
    `mutation ($cartId: ID!, $attributes: [AttributeInput!]!) @inContext { cartAttributesUpdate(cartId: $cartId, attributes: $attributes) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    { cartId, attributes },
    { ...call, cache: 'none' },
  );
  return toCart(data.cartAttributesUpdate)!;
}

/** A new quantity for a line; 0 removes it. */
export async function updateQuantity(cartId: string, lineId: string, quantity: number, call: { country: string; buyerIp?: string }): Promise<Cart> {
  if (quantity <= 0) {
    const data = await storefront<{ cartLinesRemove: Payload }>(
      `mutation ($cartId: ID!, $lineIds: [ID!]!) @inContext { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART_FIELDS} } userErrors { message } } }`,
      { cartId, lineIds: [lineId] },
      { ...call, cache: 'none' },
    );
    return toCart(data.cartLinesRemove)!;
  }
  const data = await storefront<{ cartLinesUpdate: Payload }>(
    `mutation ($cartId: ID!, $lines: [CartLineUpdateInput!]!) @inContext { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    { cartId, lines: [{ id: lineId, quantity }] },
    { ...call, cache: 'none' },
  );
  return toCart(data.cartLinesUpdate)!;
}

export async function updateCountry(cartId: string, call: { country: string; buyerIp?: string }): Promise<Cart> {
  const data = await storefront<{ cartBuyerIdentityUpdate: Payload }>(
    `mutation ($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) @inContext { cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    { cartId, buyerIdentity: { countryCode: call.country } },
    { ...call, cache: 'none' },
  );
  return toCart(data.cartBuyerIdentityUpdate)!;
}

export async function getCart(cartId: string, call: { country: string; buyerIp?: string }): Promise<Cart | null> {
  const data = await storefront<{ cart: RawCart | null }>(`query ($id: ID!) @inContext { cart(id: $id) { ${CART_FIELDS} } }`, { id: cartId }, { ...call, cache: 'none' });
  return toCart({ cart: data.cart });
}

/** The store's own cart attributes, written next to ABConvert's. */
export const STORE_ATTRIBUTES: Attribute[] = [{ key: '_source', value: 'headless-reference' }];

/** The same attributes, in any order. */
export function sameAttributes(a: Attribute[], b: Attribute[]): boolean {
  const flat = (list: Attribute[]) => list.map(({ key, value }) => `${key}=${value}`).sort().join('\n');
  return flat(a) === flat(b);
}
