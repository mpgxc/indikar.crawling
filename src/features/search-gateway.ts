export interface SearchGateway {
  findLinkedInUrl(name: string): Promise<string>;
}
