export interface Theme {
    id: number;
    name: string;
    role: string;
    created_at: string;
    updated_at: string;
}
export interface Product {
    id: string;
    title: string;
    handle: string;
    status: string;
    variants: Array<{
        id: string;
        title: string;
        price: string;
        sku: string;
    }>;
    images: Array<{
        id: string;
        src: string;
        alt: string | null;
    }>;
    metafields: Array<{
        namespace: string;
        key: string;
        value: string;
        type: string;
    }>;
}
export interface Resource {
    id: string;
    title: string;
    handle: string;
}
export declare class ShopifyAPIClient {
    private store;
    private accessToken;
    private baseUrl;
    constructor(store: string, accessToken: string);
    private request;
    private graphql;
    listThemes(): Promise<Theme[]>;
    getAsset(themeId: string, key: string): Promise<string>;
    getProduct(productId?: string, handle?: string): Promise<Product>;
    listResources(type: string): Promise<Resource[]>;
    private mapGraphQLProduct;
    private sleep;
}
//# sourceMappingURL=shopify-api.d.ts.map